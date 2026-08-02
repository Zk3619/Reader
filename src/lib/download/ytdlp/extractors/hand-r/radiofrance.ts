/** RadioFrance* — ported from yt-dlp radiofrance.py (main paths) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { js_to_json, parse_duration, traverse_obj, unified_strdate } from '../../utils';

const STATIONS = ['franceculture', 'franceinfo', 'franceinter', 'francemusique', 'fip', 'mouv'];
const STATIONS_RE = STATIONS.join('|');
const URL_BASE = 'https?:\\/\\/(?:www\\.)?radiofrance\\.fr';

export class RadioFranceIE extends InfoExtractor {
  static IE_NAME = 'radiofrance';
  static _VALID_URL = /https?:\/\/maison\.radiofrance\.fr\/radiovisions\/(?<id>[^?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const title = this._html_search_regex(/<h1>([\s\S]+?)<\/h1>/, webpage, 'title')!;
    const description = this._html_search_regex(
      /<div class="bloc_page_wrapper"><div class="text">([\s\S]+?)<\/div>/,
      webpage,
      'description',
      null,
      false,
    );
    const uploader = this._html_search_regex(
      /<div class="credit">&nbsp;&nbsp;&copy;&nbsp;([\s\S]+?)<\/div>/,
      webpage,
      'uploader',
      null,
      false,
    );
    const formatsStr = this._html_search_regex(/class="jp-jplayer[^"]*" data-source="([^"]+)">/, webpage, 'audio URLs')!;
    const formats: Format[] = [];
    for (const [i, fm] of [...formatsStr.matchAll(/([a-z0-9]+)\s*:\s*'([^']+)'/g)].entries()) {
      formats.push({ format_id: fm[1]!, url: fm[2]!, vcodec: 'none', quality: i });
    }
    return { id: videoId, title, formats, description: description ?? undefined, uploader: uploader ?? undefined };
  }
}

export class RadioFranceBaseIE extends InfoExtractor {
  static IE_NAME = 'RadioFranceBase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _VALID_URL_BASE = URL_BASE;
  static _STATIONS_RE = STATIONS_RE;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('RadioFranceBaseIE is not a standalone extractor', { expected: true });
  }

  protected _extractDataFromWebpage(webpage: string, displayId: string, key: string): Record<string, unknown> {
    const data = this._search_json(/\bconst\s+data\s*=/, webpage, key, displayId, {
      transform_source: js_to_json,
    });
    return (traverse_obj(data, ['all', 'data', key]) as Record<string, unknown>) || {};
  }
}

export class FranceCultureIE extends RadioFranceBaseIE {
  static IE_NAME = 'FranceCulture';
  static _VALID_URL = new RegExp(
    `${URL_BASE}\\/(?:${STATIONS_RE})\\/podcasts\\/(?:[^?#]+\\/)?(?<display_id>[^?#]+)-(?<id>\\d{6,})(?:$|[?#])`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const displayId = m.groups!.display_id!;
    const webpage = await this._download_webpage(url, displayId);
    let videoData = this._search_json('', webpage, 'audio data', displayId, { fatal: false }) as Record<string, unknown> | null;
    if (!videoData?.contentUrl) {
      const m = webpage.match(/{\s*"@type"\s*:\s*"AudioObject"[\s\S]+?}/);
      videoData = m ? (JSON.parse(m[0]!) as Record<string, unknown>) : {};
    }
    return {
      id: videoId,
      display_id: displayId,
      url: videoData.contentUrl as string,
      vcodec: videoData.encodingFormat === 'mp3' ? 'none' : undefined,
      duration: parse_duration(videoData.duration as string) ?? undefined,
      title:
        this._html_search_regex(/<h1[^>]*itemprop="[^"]*name[^"]*"[^>]*>([\s\S]+?)<\/h1>/, webpage, 'title', null, false) ||
        this._og_search_title(webpage) ||
        undefined,
      description:
        this._html_search_regex(/<meta name="description"\s*content="([^"]+)/, webpage, 'description', null, false) ??
        undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      upload_date:
        unified_strdate(this._search_regex(/"datePublished"\s*:\s*"([^"]+)/, webpage, 'timestamp', null, false)) ??
        undefined,
    };
  }
}

export class RadioFranceLiveIE extends RadioFranceBaseIE {
  static IE_NAME = 'RadioFranceLive';
  static _VALID_URL = new RegExp(`${URL_BASE}\\/(?<id>${STATIONS_RE})(?:\\/(?<substation_id>radio-[\\w-]+))?(?:[#?]|$)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const stationId = m.groups!.substation_id ? `${m.groups!.id}-${m.groups!.substation_id}` : m.groups!.id!;
    const webpage = await this._download_webpage(url, stationId);
    const streamData = this._extractDataFromWebpage(webpage, stationId, 'liveStream');
    const streamUrl = streamData.url as string | undefined;
    if (!streamUrl) throw new ExtractorError('Unable to extract live stream URL');
    return {
      id: stationId,
      title: (streamData.title as string) || this._og_search_title(webpage) || stationId,
      formats: [{ url: streamUrl, format_id: 'live', ext: 'aac', vcodec: 'none' }],
      is_live: true,
    };
  }
}

export class RadioFrancePlaylistBaseIE extends RadioFranceBaseIE {
  static IE_NAME = 'RadioFrancePlaylistBase';
  static _VALID_URL: RegExp | string | false | null = false;

  protected async *_entries(webpage: string): AsyncGenerator<VideoInfo> {
    for (const m of webpage.matchAll(/href="(\/[^"]+\/podcasts\/[^"]+-(\d{6,}))"/g)) {
      yield this.url_result(`https://www.radiofrance.fr${m[1]}`, 'FranceCulture', m[2]);
    }
  }
}

export class RadioFrancePodcastIE extends RadioFrancePlaylistBaseIE {
  static IE_NAME = 'RadioFrancePodcast';
  static _VALID_URL = new RegExp(`${URL_BASE}\\/(?<station>${STATIONS_RE})\\/podcasts\\/(?<id>[^/?#]+)(?:$|[?#])`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const podcastId = this._match_id(url);
    const webpage = await this._download_webpage(url, podcastId);
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(webpage)) entries.push(entry);
    return this.playlist_result(entries, podcastId, this._og_search_title(webpage) ?? undefined);
  }
}

export class RadioFranceProfileIE extends RadioFrancePlaylistBaseIE {
  static IE_NAME = 'RadioFranceProfile';
  static _VALID_URL = new RegExp(`${URL_BASE}\\/personnes\\/(?<id>[^/?#]+)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const profileId = this._match_id(url);
    const webpage = await this._download_webpage(url, profileId);
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(webpage)) entries.push(entry);
    return this.playlist_result(entries, profileId, this._og_search_title(webpage) ?? undefined);
  }
}

export class RadioFranceProgramScheduleIE extends RadioFranceBaseIE {
  static IE_NAME = 'RadioFranceProgramSchedule';
  static _VALID_URL = new RegExp(`${URL_BASE}\\/(?<station>${STATIONS_RE})\\/grille-programmes(?:\\/(?<date>\\d{4}-\\d{2}-\\d{2}))?`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const station = m.groups!.station!;
    const date = m.groups!.date || new Date().toISOString().slice(0, 10);
    const webpage = await this._download_webpage(url, `${station}-${date}`);
    const entries: VideoInfo[] = [];
    for (const item of this._extractDataFromWebpage(webpage, date, 'grid').items as Array<{ path?: string; id?: string }> || []) {
      if (item.path) entries.push(this.url_result(`https://www.radiofrance.fr${item.path}`, 'FranceCulture', String(item.id || '')));
    }
    return this.playlist_result(entries, `${station}-${date}`);
  }
}
