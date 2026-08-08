/**
 * NBC family — ported from yt-dlp nbc.py (ThePlatform SMIL main path; AdobePass/DRM simplified)
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  extract_attributes,
  get_element_by_class,
  int_or_none,
  unescapeHTML,
  url_or_none,
} from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  extractSmilMediaUrls,
  make_archive_id,
  mergeSubtitles,
  parse_age_limit,
  parseIso8601,
} from './_helpers';

const M3U8_RE =
  /https?:\/\/[^/?#]+\/prod\/[\w-]+\/(?<folders>[^?#]+\/)cmaf\/mpeg_(?:cbcs|cenc)\w*\/master_cmaf\w*\.m3u8/;

export class NBCUniversalBaseIE extends InfoExtractor {
  static IE_NAME = 'nbcuniversalbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NBCUniversalBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _downloadNbcuSmilAndExtractM3u8Url(
    tpPath: string,
    videoId: string,
    query: Record<string, string>,
  ): Promise<string> {
    const smilText = await this._download_webpage(
      `https://link.theplatform.com/s/${tpPath}`,
      videoId,
      'Downloading SMIL manifest',
      {
        query: {
          ...query,
          format: 'SMIL',
          manifest: 'm3u',
          switch: 'HLSServiceSecure',
        },
        headers: this.geo_verification_headers(),
      },
    );
    for (const u of extractSmilMediaUrls(smilText)) {
      if (determine_ext(u) === 'm3u8') return u;
    }
    if (/GeoLocationBlocked/.test(smilText)) this.raise_geo_restricted(undefined, ['US']);
    throw new ExtractorError('Unable to extract m3u8 URL from SMIL', { expected: true });
  }

  protected async _extractNbcuFormatsAndSubtitles(
    tpPath: string,
    videoId: string,
    query: Record<string, string>,
  ): Promise<{ formats: VideoInfo['formats']; subtitles: Record<string, Subtitle[]> }> {
    query.formats = 'm3u+none,mpeg4';
    const origM3u8 = await this._downloadNbcuSmilAndExtractM3u8Url(tpPath, videoId, query);
    let m3u8Url = origM3u8;

    const m = M3U8_RE.exec(origM3u8);
    if (m?.groups?.folders) {
      query.formats = 'mpeg4';
      const tmpl = await this._downloadNbcuSmilAndExtractM3u8Url(tpPath, videoId, query);
      m3u8Url = tmpl.includes('{folders}') ? tmpl.replace('{folders}', m.groups.folders) : tmpl;
    }

    if (/\/mpeg_cenc|\/mpeg_cbcs/.test(m3u8Url)) this.report_warning(`DRM protected: ${videoId}`);

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, 'hls');
    if (!formats?.length && m3u8Url !== origM3u8) {
      const { formats: origFmts, subtitles: origSubs } = await extractM3u8FormatsAndSubtitles(
        this,
        origM3u8,
        videoId,
        'hls',
      );
      mergeSubtitles(subtitles as Record<string, Subtitle[]>, origSubs);
      return { formats: (origFmts || []).filter((f) => !f.has_drm), subtitles: subtitles as Record<string, Subtitle[]> };
    }
    return { formats, subtitles: subtitles as Record<string, Subtitle[]> };
  }

  protected async _download_theplatform_metadata(
    tpPath: string,
    videoId: string,
    fatal = true,
  ): Promise<Record<string, unknown>> {
    return this._download_json<Record<string, unknown>>(
      `http://link.theplatform.com/s/${tpPath}`,
      videoId,
      'Downloading theplatform metadata',
      { query: { format: 'preview' }, fatal },
    );
  }

  protected _parse_theplatform_metadata(
    info: Record<string, unknown>,
  ): Partial<VideoInfo> & { subtitles: Record<string, Subtitle[]> } {
    return {
      title: (info.title as string) ?? undefined,
      description: (info.description as string) ?? undefined,
      duration: typeof info.duration === 'number' ? info.duration : undefined,
      timestamp: typeof info.pubDate === 'number' ? info.pubDate / 1000 : undefined,
      thumbnail: (info.defaultThumbnailUrl as string) ?? undefined,
      subtitles: {},
    };
  }

  async _extractNbcuVideo(url: string, displayId: string, oldIeKey?: string): Promise<VideoInfo> {
    const webpage = await this._download_webpage(url, displayId);
    const settings = this._search_json<Record<string, unknown>>(
      /<script[^>]+data-drupal-selector="drupal-settings-json"[^>]*>/,
      webpage,
      'settings',
      displayId,
    )!;

    let accountPid: string;
    let accountId: string;
    let videoId: string;
    let metadata: Record<string, unknown> = {};
    const query: Record<string, string> = {};

    const tveHtml = get_element_by_class('tve-video-deck-app', webpage) || '';
    const tve = tveHtml ? extract_attributes(tveHtml) : {};
    if (Object.keys(tve).length) {
      accountPid = tve['data-mpx-media-account-pid'] || tve['data-mpx-account-pid'] || '';
      accountId = tve['data-mpx-media-account-id'] || '';
      metadata = this._parse_json<Record<string, unknown>>(
        unescapeHTML(tve['data-normalized-video'] || '{}'),
        displayId,
        undefined,
        false,
      ) || {};
      videoId = tve['data-guid'] || String(metadata.guid || '');
      if (tve['data-entitlement'] === 'auth') {
        this.raise_login_required('This video requires TV provider authentication (AdobePass not ported)');
      }
    } else {
      const lsPlaylists = (settings.ls_playlist as Array<Record<string, unknown>>) || [];
      const lsPlaylist = lsPlaylists.find((v) => v.defaultGuid) as Record<string, unknown> | undefined;
      if (!lsPlaylist) throw new ExtractorError('Unable to extract LS playlist');
      videoId = String(lsPlaylist.defaultGuid);
      accountPid = String(lsPlaylist.mpxMediaAccountPid || lsPlaylist.mpxAccountPid);
      accountId = String(lsPlaylist.mpxMediaAccountId);
      metadata =
        ((lsPlaylist.videos as Array<Record<string, unknown>>) || []).find((v) => v.guid === videoId) || {};
    }

    const tpPath = `${accountPid}/media/guid/${accountId}/${videoId}`;
    const { formats, subtitles } = await this._extractNbcuFormatsAndSubtitles(tpPath, videoId, query);
    const tpMetadata = await this._download_theplatform_metadata(tpPath, videoId, false);
    const parsedInfo = this._parse_theplatform_metadata(tpMetadata);
    mergeSubtitles(parsedInfo.subtitles as Record<string, Subtitle[]>, subtitles);

    return {
      ...parsedInfo,
      title: (parsedInfo.title as string) || (metadata.title as string),
      description: metadata.description as string | undefined,
      duration: int_or_none(metadata.durationInSeconds) ?? parsedInfo.duration,
      timestamp: parseIso8601(metadata.airDate) ?? parsedInfo.timestamp,
      thumbnail: url_or_none(metadata.thumbnailUrl) ?? parsedInfo.thumbnail,
      season_number: int_or_none(metadata.seasonNumber) ?? undefined,
      episode_number: int_or_none(metadata.episodeNumber) ?? undefined,
      episode: metadata.episodeTitle as string | undefined,
      series: metadata.show as string | undefined,
      id: videoId,
      display_id: displayId,
      formats,
      subtitles: subtitles as Record<string, Subtitle[]>,
      _old_archive_ids: oldIeKey ? [make_archive_id(oldIeKey, videoId)] : undefined,
    };
  }
}

export class NBCIE extends NBCUniversalBaseIE {
  static IE_NAME = 'nbc';
  static _VALID_URL =
    /https?(?<permalink>:\/\/(?:www\.)?nbc\.com\/(?:classic-tv\/)?[^/?#]+\/video\/[^/?#]+\/(?<id>\w+))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const permalink = 'http' + decodeURIComponent(m.groups?.permalink || '');
    const videoId = m.groups?.id || '';

    const videoData = await this._download_json<{ data?: { bonanzaPage?: { metadata?: Record<string, unknown> } } }>(
      'https://friendship.nbc.co/v2/graphql',
      videoId,
      undefined,
      {
        query: {
          query: `query bonanzaPage($app: NBCUBrands! = nbc, $name: String!, $oneApp: Boolean, $platform: SupportedPlatforms! = web, $type: EntityPageType! = VIDEO, $userId: String!) {
  bonanzaPage(app: $app, name: $name, oneApp: $oneApp, platform: $platform, type: $type, userId: $userId) {
    metadata { ... on VideoPageData { description episodeNumber keywords locked mpxAccountId mpxGuid rating resourceId seasonNumber secondaryTitle seriesShortTitle } }
  }
}`,
          variables: JSON.stringify({ name: permalink, oneApp: true, userId: '0' }),
        },
      },
    );

    let meta = videoData.data?.bonanzaPage?.metadata;
    if (!meta) {
      const webpage = await this._download_webpage(url, videoId);
      const preload = this._search_json<Record<string, { base?: { metadata?: Record<string, unknown> } }>>(
        /<script>\s*PRELOAD\s*=/,
        webpage,
        'video data',
        videoId,
      );
      meta = preload?.[new URL(url).pathname]?.base?.metadata;
    }
    if (!meta?.mpxGuid) throw new ExtractorError('Unable to extract video metadata');

    const guid = String(meta.mpxGuid);
    const tpPath = `NnzsPC/media/guid/${meta.mpxAccountId}/${guid}`;
    const query: Record<string, string> = {};
    if (meta.locked) {
      this.raise_login_required('This video requires TV provider authentication (AdobePass not ported)');
    }
    const { formats, subtitles } = await this._extractNbcuFormatsAndSubtitles(tpPath, guid, query);
    const tpm = await this._download_theplatform_metadata(tpPath, guid, false);
    const parsed = this._parse_theplatform_metadata(tpm);
    mergeSubtitles(parsed.subtitles as Record<string, Subtitle[]>, subtitles);

    return {
      ...parsed,
      description: meta.description as string | undefined,
      episode: meta.secondaryTitle as string | undefined,
      episode_number: int_or_none(meta.episodeNumber) ?? undefined,
      season_number: int_or_none(meta.seasonNumber) ?? undefined,
      age_limit: parse_age_limit(String(meta.rating ?? '')) ?? undefined,
      tags: (meta.keywords as string[]) || undefined,
      series: meta.seriesShortTitle as string | undefined,
      id: guid,
      title: (parsed.title as string) || (meta.secondaryTitle as string),
      formats,
      subtitles: subtitles as Record<string, Subtitle[]>,
      _old_archive_ids: [make_archive_id('ThePlatform', guid)],
    };
  }
}

export class NBCSportsVPlayerIE extends InfoExtractor {
  static IE_NAME = 'nbcsports:vplayer';
  static _VALID_URL =
    /https?:\/\/(?:vplayer\.nbcsports\.com|(?:www\.)?nbcsports\.com\/vplayer)\/(?:[^/]+\/)+(?<id>[0-9a-zA-Z_]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const nbc = new NBCIE();
    Object.assign(nbc, this);
    return nbc._extractNbcuVideo(url, videoId, 'ThePlatform');
  }
}

export class NBCSportsIE extends NBCUniversalBaseIE {
  static IE_NAME = 'nbcsports';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?nbcsports\.com\/(?:[^/]+\/)*video\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractNbcuVideo(url, this._match_id(url), 'ThePlatform');
  }
}

export class NBCSportsStreamIE extends NBCUniversalBaseIE {
  static IE_NAME = 'nbcsports:stream';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?nbcsports\.com\/(?:[^/]+\/)*stream\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractNbcuVideo(url, this._match_id(url), 'ThePlatform');
  }
}

export class NBCNewsIE extends NBCUniversalBaseIE {
  static IE_NAME = 'nbcnews';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?nbcnews\.com\/(?:[^/]+\/)*video\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractNbcuVideo(url, this._match_id(url), 'ThePlatform');
  }
}

export class NBCOlympicsIE extends NBCUniversalBaseIE {
  static IE_NAME = 'nbc:olympics';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?nbcolympics\.com\/(?:[^/]+\/)*video\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractNbcuVideo(url, this._match_id(url), 'ThePlatform');
  }
}

export class NBCOlympicsStreamIE extends NBCUniversalBaseIE {
  static IE_NAME = 'nbc:olympics:stream';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?nbcolympics\.com\/(?:[^/]+\/)*stream\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractNbcuVideo(url, this._match_id(url), 'ThePlatform');
  }
}

export class NBCStationsIE extends NBCUniversalBaseIE {
  static IE_NAME = 'nbc:stations';
  // yt-dlp nbc.py: whitelist local-station domains — NEVER use [a-z0-9-]+ (steals toutiao.com/video/…)
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?<station>nbcbayarea|nbcboston|nbcchicago|nbcconnecticut|nbcdfw|nbclosangeles|nbcmiami|nbcnewyork|nbcphiladelphia|nbcsandiego|nbcwashington|necn|telemundo52|telemundoarizona|telemundochicago|telemundonuevainglaterra)\.com\/(?:[^/?#]+\/)*(?<id>[^/?#]+)\/?(?:$|[?#])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractNbcuVideo(url, this._match_id(url), 'ThePlatform');
  }
}

export class BravoTVIE extends NBCUniversalBaseIE {
  static IE_NAME = 'bravotv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?bravotv\.com\/(?:[^/]+\/)*video\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractNbcuVideo(url, this._match_id(url), 'ThePlatform');
  }
}

export class SyfyIE extends NBCUniversalBaseIE {
  static IE_NAME = 'syfy';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?syfy\.com\/(?:[^/]+\/)*video\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractNbcuVideo(url, this._match_id(url), 'ThePlatform');
  }
}
