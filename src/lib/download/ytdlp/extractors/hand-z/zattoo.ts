// @ts-nocheck
/** Zattoo family extractors â€?ported from yt-dlp zattoo.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, join_nonempty, try_get, url_or_none } from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  extractMpdFormatsAndSubtitles,
  mergeSubtitles,
  urlencodePostdata,
} from './_helpers';

type ZattooType = 'video' | 'live' | 'record' | 'ondemand';

type ClassSpec = {
  netrc: string;
  host: string;
  apiHost?: string;
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeUrlPattern(host: string, queryKey: string, idPattern: string, pathBase?: string): RegExp[] {
  const h = escapeRe(host);
  const out: RegExp[] = [
    new RegExp(
      String.raw`https?://(?:www\.)?${h}/[^?#]+\?(?:[^#]+&)?${queryKey}=(?<id>${idPattern})(?:[&#]|$)`,
    ),
  ];
  if (pathBase) {
    out.push(new RegExp(String.raw`https?://(?:www\.)?${h}/${pathBase}/(?<id>${idPattern})(?:[/?#]|$)`));
  }
  return out;
}

function makeVideoValidUrl(host: string): RegExp[] {
  return makeUrlPattern(host, 'program', '\\d+', '(?:program|watch)/[^/?#]+');
}

function makeLiveValidUrl(host: string): RegExp[] {
  return [
    ...makeUrlPattern(host, 'channel', '[^/?&#]+'),
    new RegExp(String.raw`https?://(?:www\.)?${escapeRe(host)}/live/(?<id>[^/?#]+)(?:[/?#]|$)`),
  ];
}

function makeRecordingsValidUrl(host: string): RegExp[] {
  return makeUrlPattern(host, 'recording', '\\d+');
}

function makeMoviesValidUrl(host: string): RegExp[] {
  return [
    ...makeUrlPattern(host, 'movie_id', '\\w+'),
    new RegExp(String.raw`https?://(?:www\.)?${escapeRe(host)}/vod/movies/(?<id>\w+)(?:[/?#]|$)`),
  ];
}

export class ZattooPlatformBaseIE extends InfoExtractor {
  static IE_NAME = 'zattooplatformbase';
  static _VALID_URL = false as const;

  protected _powerGuideHash: string | null = null;
  protected _sessionInitialized = false;

  protected _hostUrl(): string {
    const ctor = this.constructor as typeof ZattooPlatformBaseIE & { _HOST: string; _API_HOST?: string };
    return `https://${ctor._API_HOST || ctor._HOST}`;
  }

  protected async _initializeSession(): Promise<void> {
    if (this._sessionInitialized) return;
    const tokenData = await this._download_json<{ session_token?: string }>(
      `${this._hostUrl()}/token.json`,
      undefined,
      'Downloading session token',
      { fatal: false },
    );
    const sessionToken = tokenData?.session_token;
    if (!sessionToken) {
      throw new ExtractorError('Unable to initialize Zattoo session');
    }
    await this._request_webpage(
      {
        url: `${this._hostUrl()}/zapi/v3/session/hello`,
        data: urlencodePostdata({
          uuid: globalThis.crypto?.randomUUID?.() || `reader-${Date.now()}`,
          lang: 'en',
          app_version: '1.8.2',
          format: 'json',
          client_app_token: sessionToken,
        }),
      },
      undefined,
      'Opening session',
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } },
    );
    this._sessionInitialized = true;
  }

  protected async _perform_login(username: string, password: string): Promise<void> {
    const data = await this._download_json<Record<string, unknown>>(
      `${this._hostUrl()}/zapi/v2/account/login`,
      undefined,
      'Logging in',
      {
        data: urlencodePostdata({
          login: username,
          password,
          remember: 'true',
        }),
        headers: {
          Referer: `${this._hostUrl()}/login`,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
      },
    );
    this._powerGuideHash =
      try_get(data, (x) => (x.session as Record<string, unknown>)?.power_guide_hash) as string | null;
    if (!this._powerGuideHash) {
      throw new ExtractorError('Unable to login: incorrect username and/or password', { expected: true });
    }
  }

  protected async _ensurePowerGuideHash(videoId?: string): Promise<void> {
    if (this._powerGuideHash) return;
    await this._initializeSession();

    const sessionData = await this._download_json<Record<string, unknown>>(
      `${this._hostUrl()}/zapi/v2/account/session`,
      videoId,
      'Checking account session',
      { fatal: false },
    );
    this._powerGuideHash =
      (try_get(sessionData, (x) => (x.session as Record<string, unknown>)?.power_guide_hash) as string | null) ||
      null;
    if (this._powerGuideHash) return;

    const username = this.params.username as string | undefined;
    const password = this.params.password as string | undefined;
    if (username && password) {
      await this._perform_login(username, password);
      return;
    }
    this.raise_login_required('An account is needed to access this media', undefined, 'password');
  }

  protected async _extract_video_id_from_recording(recid: string): Promise<string> {
    const playlist = await this._download_json<Record<string, unknown>>(
      `${this._hostUrl()}/zapi/v2/playlist`,
      recid,
      'Downloading playlist',
    );
    const recordings = (playlist.recordings as Array<Record<string, unknown>> | undefined) || [];
    for (const item of recordings) {
      if (String(item.id || '') === recid && item.program_id != null) {
        return String(item.program_id);
      }
    }
    throw new ExtractorError('Could not extract video id from recording');
  }

  protected async _extract_cid(videoId: string, channelName: string): Promise<string> {
    const data = await this._download_json<Record<string, unknown>>(
      `${this._hostUrl()}/zapi/v2/cached/channels/${this._powerGuideHash}`,
      videoId,
      'Downloading channel list',
      { query: { details: 'false' } },
    );
    const channelGroups = (data.channel_groups as Array<Record<string, unknown>> | undefined) || [];
    for (const group of channelGroups) {
      const channels = (group.channels as Array<Record<string, unknown>> | undefined) || [];
      for (const chan of channels) {
        const cid = chan.cid != null ? String(chan.cid) : '';
        if (!cid) continue;
        if (chan.display_alias === channelName || cid === channelName) return cid;
      }
    }
    throw new ExtractorError('Could not extract channel id');
  }

  protected async _extract_cid_and_video_info(videoId: string): Promise<[string, VideoInfo]> {
    const data = await this._download_json<Record<string, unknown>>(
      `${this._hostUrl()}/zapi/v2/cached/program/power_details/${this._powerGuideHash}`,
      videoId,
      'Downloading video information',
      { query: { program_ids: videoId, complete: 'true' } },
    );
    const p = ((data.programs as Array<Record<string, unknown>> | undefined) || [])[0];
    if (!p) throw new ExtractorError('Could not extract video metadata');
    const cid = String(p.cid || '');
    if (!cid) throw new ExtractorError('Could not extract channel id');

    return [
      cid,
      {
        id: videoId,
        title: String(p.t || p.et || videoId),
        description: (p.d as string | undefined) || undefined,
        thumbnail: (p.i_url as string | undefined) || undefined,
        creator: (p.channel_name as string | undefined) || undefined,
        episode: (p.et as string | undefined) || undefined,
        episode_number: int_or_none(p.e_no) ?? undefined,
        season_number: int_or_none(p.s_no) ?? undefined,
        release_year: int_or_none(p.year) ?? undefined,
        categories: Array.isArray(p.c) ? (p.c as string[]) : undefined,
        tags: Array.isArray(p.g) ? (p.g as string[]) : undefined,
      },
    ];
  }

  protected async _extract_ondemand_info(ondemandId: string): Promise<[string, string, VideoInfo]> {
    const data = await this._download_json<Record<string, unknown>>(
      `${this._hostUrl()}/zapi/vod/movies/${ondemandId}`,
      ondemandId,
      'Downloading ondemand information',
    );
    const token = try_get(
      data,
      (x) =>
        (((x.terms_catalog as Array<Record<string, unknown>>)[0]?.terms as Array<Record<string, unknown>>)[0]
          ?.token as string | undefined) || '',
    );
    const ondemandType = String(data.type || '');
    if (!token || !ondemandType) throw new ExtractorError('Could not extract ondemand metadata');
    return [
      String(token),
      ondemandType,
      {
        id: ondemandId,
        title: (data.title as string | undefined) || undefined,
        description: (data.description as string | undefined) || undefined,
        duration: int_or_none(data.duration) ?? undefined,
        release_year: int_or_none(data.year) ?? undefined,
        episode_number: int_or_none(data.episode_number) ?? undefined,
        season_number: int_or_none(data.season_number) ?? undefined,
        categories: Array.isArray(data.categories) ? (data.categories as string[]) : undefined,
      },
    ];
  }

  protected async _extract_formats(opts: {
    cid?: string | null;
    videoId: string;
    recordId?: string | null;
    ondemandId?: string | null;
    ondemandTermToken?: string | null;
    ondemandType?: string | null;
    isLive?: boolean;
  }): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const postDataCommon: Record<string, string | number | boolean> = { https_watch_urls: true };
    let watchUrl: string;
    if (opts.isLive) {
      postDataCommon.timeshift = 10800;
      watchUrl = `${this._hostUrl()}/zapi/watch/live/${opts.cid}`;
    } else if (opts.recordId) {
      watchUrl = `${this._hostUrl()}/zapi/watch/recording/${opts.recordId}`;
    } else if (opts.ondemandId) {
      postDataCommon.teasable_id = opts.ondemandId;
      postDataCommon.term_token = opts.ondemandTermToken || '';
      postDataCommon.teasable_type = opts.ondemandType || '';
      watchUrl = `${this._hostUrl()}/zapi/watch/vod/video`;
    } else {
      watchUrl = `${this._hostUrl()}/zapi/v3/watch/replay/${opts.cid}/${opts.videoId}`;
    }

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};

    for (const streamType of ['dash', 'hls7']) {
      const data = await this._download_json<Record<string, unknown>>(
        watchUrl,
        opts.videoId,
        `Downloading ${streamType.toUpperCase()} formats`,
        {
          data: urlencodePostdata({
            ...postDataCommon,
            stream_type: streamType,
          }),
          fatal: false,
        },
      );
      const watchUrls = try_get(data, (x) => (x.stream as Record<string, unknown>)?.watch_urls) as
        | Array<Record<string, unknown>>
        | null;
      if (!watchUrls?.length) continue;

      for (const watch of watchUrls) {
        const streamUrl = url_or_none(watch.url);
        if (!streamUrl) continue;
        const audioChannel = watch.audio_channel as string | undefined;
        const formatId =
          join_nonempty(streamType, watch.maxrate != null ? String(watch.maxrate) : null, audioChannel) ||
          streamType;
        const preference = audioChannel === 'A' ? 1 : undefined;

        if (streamType.startsWith('dash')) {
          const { formats: dashFormats, subtitles: dashSubs } = await extractMpdFormatsAndSubtitles(
            this,
            streamUrl,
            opts.videoId,
            formatId,
          );
          for (const f of dashFormats) f.quality = preference;
          formats.push(...dashFormats);
          mergeSubtitles(subtitles, dashSubs);
        } else if (streamType.startsWith('hls')) {
          const { formats: hlsFormats, subtitles: hlsSubs } = await extractM3u8FormatsAndSubtitles(
            this,
            streamUrl,
            opts.videoId,
            formatId,
          );
          for (const f of hlsFormats) f.quality = preference;
          formats.push(...hlsFormats);
          mergeSubtitles(subtitles, hlsSubs);
        }
      }
    }

    return { formats, subtitles };
  }

  protected async _extract_video(videoId: string, recordId?: string): Promise<VideoInfo> {
    const [cid, info] = await this._extract_cid_and_video_info(videoId);
    const { formats, subtitles } = await this._extract_formats({ cid, videoId, recordId });
    return { ...info, formats, subtitles };
  }

  protected async _extract_live(channelName: string): Promise<VideoInfo> {
    const cid = await this._extract_cid(channelName, channelName);
    const { formats, subtitles } = await this._extract_formats({
      cid,
      videoId: cid,
      isLive: true,
    });
    return {
      id: channelName,
      title: channelName,
      is_live: true,
      formats,
      subtitles,
    };
  }

  protected async _extract_record(recordId: string): Promise<VideoInfo> {
    const videoId = await this._extract_video_id_from_recording(recordId);
    const [cid, info] = await this._extract_cid_and_video_info(videoId);
    const { formats, subtitles } = await this._extract_formats({ cid, videoId, recordId });
    return { ...info, formats, subtitles };
  }

  protected async _extract_ondemand(ondemandId: string): Promise<VideoInfo> {
    const [termToken, ondemandType, info] = await this._extract_ondemand_info(ondemandId);
    const { formats, subtitles } = await this._extract_formats({
      videoId: ondemandId,
      ondemandId,
      ondemandTermToken: termToken,
      ondemandType,
    });
    return { ...info, formats, subtitles };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const mediaId = m?.groups?.id;
    if (!mediaId) throw new ExtractorError('Invalid Zattoo URL');
    await this._ensurePowerGuideHash(mediaId);
    const extractorType = (this.constructor as typeof ZattooPlatformBaseIE & { _TYPE?: ZattooType })._TYPE;
    switch (extractorType) {
      case 'live':
        return this._extract_live(mediaId);
      case 'record':
        return this._extract_record(mediaId);
      case 'ondemand':
        return this._extract_ondemand(mediaId);
      case 'video':
      default:
        return this._extract_video(mediaId);
    }
  }
}

function createPlatformBaseClass(spec: ClassSpec) {
  return class extends ZattooPlatformBaseIE {
    static _VALID_URL = false as const;
    static _NETRC_MACHINE = spec.netrc;
    static _HOST = spec.host;
    static _API_HOST = spec.apiHost;
  };
}

function createVideoClass(ieName: string, host: string) {
  return class extends ZattooPlatformBaseIE {
    static IE_NAME = ieName;
    static _VALID_URL = makeVideoValidUrl(host);
    static _TYPE: ZattooType = 'video';
  };
}

function createLiveClass(ieName: string, host: string, videoClass: typeof InfoExtractor) {
  return class extends ZattooPlatformBaseIE {
    static IE_NAME = ieName;
    static _VALID_URL = makeLiveValidUrl(host);
    static _TYPE: ZattooType = 'live';
    static suitable(url: string): boolean {
      return !videoClass.suitable(url) && super.suitable(url);
    }
  };
}

function createRecordingsClass(ieName: string, host: string) {
  return class extends ZattooPlatformBaseIE {
    static IE_NAME = ieName;
    static _VALID_URL = makeRecordingsValidUrl(host);
    static _TYPE: ZattooType = 'record';
  };
}

function createMoviesClass(ieName: string, host: string) {
  return class extends ZattooPlatformBaseIE {
    static IE_NAME = ieName;
    static _VALID_URL = makeMoviesValidUrl(host);
    static _TYPE: ZattooType = 'ondemand';
  };
}

export class ZattooBaseIE extends createPlatformBaseClass({ netrc: 'zattoo', host: 'zattoo.com' }) {
  static IE_NAME = 'zattoobase';
}
export class ZattooIE extends createVideoClass('zattoo', 'zattoo.com') {}
export class ZattooLiveIE extends createLiveClass('zattoolive', 'zattoo.com', ZattooIE) {}
export class ZattooMoviesIE extends createMoviesClass('zattoomovies', 'zattoo.com') {}
export class ZattooRecordingsIE extends createRecordingsClass('zattoorecordings', 'zattoo.com') {}

export class NetPlusTVBaseIE extends createPlatformBaseClass({
  netrc: 'netplus',
  host: 'netplus.tv',
  apiHost: 'www.netplus.tv',
}) {
  static IE_NAME = 'netplustvbase';
}
export class NetPlusTVIE extends createVideoClass('netplustv', 'netplus.tv') {}
export class NetPlusTVLiveIE extends createLiveClass('netplustvlive', 'netplus.tv', NetPlusTVIE) {}
export class NetPlusTVRecordingsIE extends createRecordingsClass('netplustvrecordings', 'netplus.tv') {}

export class MNetTVBaseIE extends createPlatformBaseClass({ netrc: 'mnettv', host: 'tvplus.m-net.de' }) {
  static IE_NAME = 'mnettvbase';
}
export class MNetTVIE extends createVideoClass('mnettv', 'tvplus.m-net.de') {}
export class MNetTVLiveIE extends createLiveClass('mnettvlive', 'tvplus.m-net.de', MNetTVIE) {}
export class MNetTVRecordingsIE extends createRecordingsClass('mnettvrecordings', 'tvplus.m-net.de') {}

export class WalyTVBaseIE extends createPlatformBaseClass({ netrc: 'walytv', host: 'player.waly.tv' }) {
  static IE_NAME = 'walytvbase';
}
export class WalyTVIE extends createVideoClass('walytv', 'player.waly.tv') {}
export class WalyTVLiveIE extends createLiveClass('walytvlive', 'player.waly.tv', WalyTVIE) {}
export class WalyTVRecordingsIE extends createRecordingsClass('walytvrecordings', 'player.waly.tv') {}

export class BBVTVBaseIE extends createPlatformBaseClass({
  netrc: 'bbvtv',
  host: 'bbv-tv.net',
  apiHost: 'www.bbv-tv.net',
}) {
  static IE_NAME = 'bbvtvbase';
}
export class BBVTVIE extends createVideoClass('bbvtv', 'bbv-tv.net') {}
export class BBVTVLiveIE extends createLiveClass('bbvtvlive', 'bbv-tv.net', BBVTVIE) {}
export class BBVTVRecordingsIE extends createRecordingsClass('bbvtvrecordings', 'bbv-tv.net') {}

export class VTXTVBaseIE extends createPlatformBaseClass({
  netrc: 'vtxtv',
  host: 'vtxtv.ch',
  apiHost: 'www.vtxtv.ch',
}) {
  static IE_NAME = 'vtxtvbase';
}
export class VTXTVIE extends createVideoClass('vtxtv', 'vtxtv.ch') {}
export class VTXTVLiveIE extends createLiveClass('vtxtvlive', 'vtxtv.ch', VTXTVIE) {}
export class VTXTVRecordingsIE extends createRecordingsClass('vtxtvrecordings', 'vtxtv.ch') {}

export class GlattvisionTVBaseIE extends createPlatformBaseClass({
  netrc: 'glattvisiontv',
  host: 'iptv.glattvision.ch',
}) {
  static IE_NAME = 'glattvisiontvbase';
}
export class GlattvisionTVIE extends createVideoClass('glattvisiontv', 'iptv.glattvision.ch') {}
export class GlattvisionTVLiveIE extends createLiveClass(
  'glattvisiontvlive',
  'iptv.glattvision.ch',
  GlattvisionTVIE,
) {}
export class GlattvisionTVRecordingsIE extends createRecordingsClass(
  'glattvisiontvrecordings',
  'iptv.glattvision.ch',
) {}

export class SAKTVBaseIE extends createPlatformBaseClass({
  netrc: 'saktv',
  host: 'saktv.ch',
  apiHost: 'www.saktv.ch',
}) {
  static IE_NAME = 'saktvbase';
}
export class SAKTVIE extends createVideoClass('saktv', 'saktv.ch') {}
export class SAKTVLiveIE extends createLiveClass('saktvlive', 'saktv.ch', SAKTVIE) {}
export class SAKTVRecordingsIE extends createRecordingsClass('saktvrecordings', 'saktv.ch') {}

export class EWETVBaseIE extends createPlatformBaseClass({ netrc: 'ewetv', host: 'tvonline.ewe.de' }) {
  static IE_NAME = 'ewetvbase';
}
export class EWETVIE extends createVideoClass('ewetv', 'tvonline.ewe.de') {}
export class EWETVLiveIE extends createLiveClass('ewetvlive', 'tvonline.ewe.de', EWETVIE) {}
export class EWETVRecordingsIE extends createRecordingsClass('ewetvrecordings', 'tvonline.ewe.de') {}

export class QuantumTVBaseIE extends createPlatformBaseClass({
  netrc: 'quantumtv',
  host: 'quantum-tv.com',
  apiHost: 'www.quantum-tv.com',
}) {
  static IE_NAME = 'quantumtvbase';
}
export class QuantumTVIE extends createVideoClass('quantumtv', 'quantum-tv.com') {}
export class QuantumTVLiveIE extends createLiveClass('quantumtvlive', 'quantum-tv.com', QuantumTVIE) {}
export class QuantumTVRecordingsIE extends createRecordingsClass('quantumtvrecordings', 'quantum-tv.com') {}

export class OsnatelTVBaseIE extends createPlatformBaseClass({
  netrc: 'osnateltv',
  host: 'tvonline.osnatel.de',
}) {
  static IE_NAME = 'osnateltvbase';
}
export class OsnatelTVIE extends createVideoClass('osnateltv', 'tvonline.osnatel.de') {}
export class OsnatelTVLiveIE extends createLiveClass('osnateltvlive', 'tvonline.osnatel.de', OsnatelTVIE) {}
export class OsnatelTVRecordingsIE extends createRecordingsClass(
  'osnateltvrecordings',
  'tvonline.osnatel.de',
) {}

export class EinsUndEinsTVBaseIE extends createPlatformBaseClass({
  netrc: '1und1tv',
  host: '1und1.tv',
  apiHost: 'www.1und1.tv',
}) {
  static IE_NAME = 'einsundeinstvbase';
}
export class EinsUndEinsTVIE extends createVideoClass('einsundeinstv', '1und1.tv') {}
export class EinsUndEinsTVLiveIE extends createLiveClass('einsundeinstvlive', '1und1.tv', EinsUndEinsTVIE) {}
export class EinsUndEinsTVRecordingsIE extends createRecordingsClass('einsundeinstvrecordings', '1und1.tv') {}

export class SaltTVBaseIE extends createPlatformBaseClass({ netrc: 'salttv', host: 'tv.salt.ch' }) {
  static IE_NAME = 'salttvbase';
}
export class SaltTVIE extends createVideoClass('salttv', 'tv.salt.ch') {}
export class SaltTVLiveIE extends createLiveClass('salttvlive', 'tv.salt.ch', SaltTVIE) {}
export class SaltTVRecordingsIE extends createRecordingsClass('salttvrecordings', 'tv.salt.ch') {}
