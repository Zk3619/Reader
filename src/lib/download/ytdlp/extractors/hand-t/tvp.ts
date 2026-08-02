/**
 * TVPIE / TVPStreamIE / TVPEmbedIE / TVPVOD* — ported from yt-dlp tvp.py (core paths)
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, js_to_json, str_or_none, traverse_obj, url_or_none } from '../../utils';

const CALLBACKS = [
  'jebac_pis',
  'jebacpis',
  'ziobro',
  'sasin70',
  'sasin_przejebal_70_milionow_PLN',
  'tvp_is_a_state_propaganda_service',
];

export class TVPIE extends InfoExtractor {
  static IE_NAME = 'tvp';
  static IE_DESC = 'Telewizja Polska';
  static _VALID_URL =
    /https?:\/\/(?:[^/]+\.)?(?:tvp(?:parlament)?\.(?:pl|info)|tvpworld\.com|swipeto\.pl)\/(?:(?!\d+\/)[^/]+\/)*(?<id>\d+)(?:[/?#]|$)/;

  protected _parseVueWebsiteData(webpage: string, pageId: string): Record<string, unknown> | null {
    const m = webpage.match(/window\.__(?:website|directory)Data\s*=\s*({(?:.|\s)+?});/);
    if (!m) return null;
    return this._parse_json<Record<string, unknown>>(m[1]!, pageId, js_to_json);
  }

  protected _extractVueVideo(videoData: Record<string, unknown>, pageId?: string): VideoInfo {
    const isWebsite = videoData.type === 'website';
    return {
      _type: 'url_transparent',
      id: str_or_none(videoData._id) || pageId || 'tvp',
      url: isWebsite ? String(videoData.url) : `tvp:${str_or_none(videoData._id) || pageId}`,
      ie_key: isWebsite ? 'TVP' : 'TVPEmbed',
      title: str_or_none(videoData.title) || undefined,
      description: str_or_none(videoData.lead) || undefined,
      timestamp: int_or_none(videoData.release_date_long) ?? undefined,
      duration: int_or_none(videoData.duration) ?? undefined,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const pageId = this._match_id(url);
    const webpage = await this._download_webpage(url, pageId);

    const videoDataMatch = webpage.match(/window\.__(?:news|video)Data\s*=\s*({(?:.|\s)+?})\s*;/);
    if (videoDataMatch) {
      const videoData = this._parse_json<Record<string, unknown>>(videoDataMatch[1]!, pageId, js_to_json);
      if (videoData) return this._extractVueVideo(videoData, pageId);
    }

    const websiteData = this._parseVueWebsiteData(webpage, pageId);
    if (websiteData) {
      const entries: VideoInfo[] = [];
      const pushVideo = (vd: unknown) => {
        if (!vd || typeof vd !== 'object') return;
        entries.push(this._extractVueVideo(vd as Record<string, unknown>, pageId));
      };
      pushVideo(websiteData.latestVideo);
      for (const v of (websiteData.videos as unknown[]) || []) pushVideo(v);
      for (const v of (websiteData.items as unknown[]) || []) pushVideo(v);
      return this.playlist_result(entries, pageId, str_or_none(websiteData.title) || undefined);
    }

    return this.url_result(`tvp:${pageId}`, 'TVPEmbed', pageId);
  }
}

export class TVPStreamIE extends InfoExtractor {
  static IE_NAME = 'tvp:stream';
  static _VALID_URL = /https?:\/\/(?:[^/]+\.)?tvp\.pl\/(?:[^/?#]+\/)*stream(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const streamData = await this._download_json<Record<string, unknown>>(
      `https://www.tvp.pl/shared/player2/api.php?stream_id=${videoId}`,
      videoId,
    );
    const m3u8 = url_or_none(traverse_obj(streamData, ['data', 'm3u8']));
    if (!m3u8) throw new ExtractorError('TVP stream URL not found', { expected: true });
    return {
      id: videoId,
      title: str_or_none(traverse_obj(streamData, ['data', 'title'])) || videoId,
      formats: await this._extract_m3u8_formats(m3u8, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls'),
      is_live: true,
    };
  }
}

export class TVPEmbedIE extends InfoExtractor {
  static IE_NAME = 'tvp:embed';
  static IE_DESC = 'Telewizja Polska';
  static _VALID_URL =
    /(?:tvp:|https?:\/\/(?:[^/]+\.)?(?:tvp(?:parlament)?\.pl|tvp\.info|tvpworld\.com|swipeto\.pl)\/(?:sess\/(?:tvplayer\.php\?.*?object_id|TVPlayer2(?:\/embed|\/api)\.php\?.*[Ii][Dd])|shared\/details\.php\?.*?object_id)=)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const callback = CALLBACKS[Math.floor(Math.random() * CALLBACKS.length)]!;
    const webpage = await this._download_webpage(
      `https://www.tvp.pl/sess/TVPlayer2/api.php?id=${videoId}&@method=getTvpConfig&@callback=${callback}`,
      videoId,
    );
    const datastr = webpage.slice(15 + callback.length, -3);
    if (datastr.startsWith('null,')) {
      const error = this._parse_json<unknown[]>(datastr.slice(5), videoId, null, false);
      const desc = traverse_obj(error, [0, 'desc']);
      throw new ExtractorError(String(desc || 'TVP API error'), { expected: true });
    }
    const content = this._parse_json<{ content: Record<string, unknown> }>(datastr, videoId)?.content;
    if (!content) throw new ExtractorError('TVP embed content missing', { expected: true });
    const info = (content.info as Record<string, unknown>) || {};
    if (info.isGeoBlocked) this.raise_geo_restricted(undefined, ['PL']);

    const formats: Format[] = [];
    for (const file of (content.files as Record<string, unknown>[]) || []) {
      const videoUrl = url_or_none(file.url);
      if (!videoUrl) continue;
      const ext = determine_ext(videoUrl);
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(videoUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else if (ext === 'mpd') {
        formats.push(...(await this._extract_mpd_formats(videoUrl, videoId, 'dash', undefined, false)));
      } else {
        formats.push({ url: videoUrl, format_id: str_or_none(file.quality) || ext || 'http', ext });
      }
    }

    return {
      id: videoId,
      title: str_or_none(info.title) || videoId,
      description: str_or_none(info.description) || undefined,
      duration: int_or_none(info.duration) ?? undefined,
      age_limit: int_or_none(info.rating) ?? undefined,
      series: str_or_none(info.serial_title) || undefined,
      episode: str_or_none(info.episode_title) || undefined,
      episode_number: int_or_none(info.episode_number) ?? undefined,
      season: str_or_none(info.season_title) || undefined,
      thumbnail: url_or_none(info.src) || undefined,
      formats,
      is_live: info.isLive === true,
    };
  }
}

export class TVPVODBaseIE extends InfoExtractor {
  static _VALID_URL: RegExp | string | false | null = false;
  protected _BASE_URL = 'https://vod.tvp.pl';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TVPVODBaseIE is not a standalone extractor', { expected: true });
  }
}

export class TVPVODVideoIE extends TVPVODBaseIE {
  static IE_NAME = 'tvp:vod';
  static _VALID_URL = /https?:\/\/vod\.tvp\.pl\/(?:[^/?#]+\/)*(?<id>\d+)(?:[/?#]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    return this.url_result(`${this._BASE_URL}/shared/details.php?object_id=${videoId}`, 'TVPEmbed', videoId);
  }
}

export class TVPVODSeriesIE extends TVPVODBaseIE {
  static IE_NAME = 'tvp:vod:series';
  static _VALID_URL = /https?:\/\/vod\.tvp\.pl\/(?:[^/?#]+\/)*(?<id>\d+)\/(?:[/?#]|$)/;

  static suitable(url: string): boolean {
    if (TVPVODVideoIE.suitable(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const seriesId = this._match_id(url);
    const webpage = await this._download_webpage(url, seriesId);
    const ids = [...webpage.matchAll(/object_id=(\d+)/g)].map((m) => m[1]!);
    const entries = ids.map((id) => this.url_result(`tvp:${id}`, 'TVPEmbed', id));
    return this.playlist_result(entries, seriesId, this._og_search_title(webpage, false) || undefined);
  }
}
