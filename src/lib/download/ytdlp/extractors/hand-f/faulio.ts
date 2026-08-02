/**
 * FaulioBase / Faulio / FaulioLive ??ported from yt-dlp faulio.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, js_to_json, traverse_obj, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

const DOMAINS = ['aloula.sba.sa', 'bahry.com', 'maraya.sba.net.ae', 'sat7plus.org'];
const LANGUAGES = ['ar', 'en', 'fa'];
const DOMAIN_ALT = DOMAINS.map((d) => d.replace(/\./g, '\\.')).join('|');
const LANG_ALT = LANGUAGES.join('|');
const BASE_URL_RE = new RegExp(
  `https?:\\/\\/(?:${DOMAIN_ALT})\\/(?:(?:${LANG_ALT})\\/)?`,
);

export class FaulioBaseIE extends InfoExtractor {
  static IE_NAME = 'fauliobase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('FaulioBaseIE is not a standalone extractor', { expected: true });
  }

  protected _getHeaders(url: string): Record<string, string> {
    const parsed = new URL(url);
    return { Referer: url, Origin: `${parsed.protocol}//${parsed.hostname}` };
  }

  protected async _getApiBase(url: string, videoId: string): Promise<string> {
    const webpage = await this._download_webpage(url, videoId);
    const raw = this._search_regex(/window\.__NUXT__\.config=/, webpage, 'config')!;
    const configData = this._parse_json<Record<string, unknown>>(js_to_json(raw), videoId) || {};
    const pub = (configData.public as Record<string, unknown>) || {};
    return String(pub.TRANSLATIONS_API_URL ?? '');
  }
}

export class FaulioIE extends FaulioBaseIE {
  static IE_NAME = 'faulio';
  static _VALID_URL = new RegExp(`${BASE_URL_RE.source}(?:episode|media)/(?<id>[a-zA-Z0-9-]+)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const apiBase = await this._getApiBase(url, videoId);
    const videoInfo = await this._download_json<Record<string, unknown>>(
      `${apiBase}/video/${videoId}`,
      videoId,
      undefined,
      { fatal: false },
    );
    const playerInfo = await this._download_json<Record<string, unknown>>(
      `${apiBase}/video/${videoId}/player`,
      videoId,
    );
    const headers = this._getHeaders(url);
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};

    const hlsUrl = traverse_obj(playerInfo, ['settings', 'protocols', 'hls', url_or_none]) as
      | string
      | null;
    if (hlsUrl) {
      const res = await extractM3u8FormatsAndSubtitles(this, hlsUrl, videoId, 'hls');
      formats.push(...res.formats);
      mergeSubtitles(subtitles, res.subtitles);
    }

    const mpdUrl = traverse_obj(playerInfo, ['settings', 'protocols', 'dash', url_or_none]) as
      | string
      | null;
    if (mpdUrl) {
      const mpdFormats = await this._extract_mpd_formats(mpdUrl, videoId, 'dash', undefined, false);
      formats.push(...mpdFormats);
    }

    const block = traverse_obj(videoInfo, ['blocks', 0]) as Record<string, unknown> | undefined;
    const host = new URL(apiBase).hostname;

    return {
      id: `${host}_${videoId}`,
      display_id: traverse_obj(block, ['slug', String]) as string | undefined,
      title: traverse_obj(block, ['title', String]) as string | undefined,
      episode: traverse_obj(block, ['title', String]) as string | undefined,
      description: traverse_obj(block, ['description', String]) as string | undefined,
      series: traverse_obj(block, ['program_title', String]) as string | undefined,
      season_number: int_or_none(traverse_obj(block, ['season_number'])) ?? undefined,
      episode_number: int_or_none(traverse_obj(block, ['episode'])) ?? undefined,
      thumbnail: (traverse_obj(block, ['image', url_or_none]) as string | undefined) ?? undefined,
      duration: int_or_none(traverse_obj(block, ['duration', 'total'])) ?? undefined,
      age_limit: int_or_none(traverse_obj(block, ['age_rating'])) ?? undefined,
      formats,
      subtitles,
      http_headers: headers,
    };
  }
}

export class FaulioLiveIE extends FaulioBaseIE {
  static IE_NAME = 'fauliolive';
  static _VALID_URL = new RegExp(`${BASE_URL_RE.source}live/(?<id>[a-zA-Z0-9-]+)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const apiBase = await this._getApiBase(url, videoId);
    const channels = await this._download_json<Record<string, unknown>[]>(
      `${apiBase}/channels`,
      videoId,
    );
    const channel = channels.find((c) => c.url === videoId);
    const headers = this._getHeaders(url);
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};

    const hlsUrl = traverse_obj(channel, ['streams', 'hls', url_or_none]) as string | null;
    if (hlsUrl) {
      const res = await extractM3u8FormatsAndSubtitles(this, hlsUrl, videoId, 'hls');
      formats.push(...res.formats);
      mergeSubtitles(subtitles, res.subtitles);
    }

    const mpdUrl = traverse_obj(channel, ['streams', 'mpd', url_or_none]) as string | null;
    if (mpdUrl) {
      formats.push(...(await this._extract_mpd_formats(mpdUrl, videoId, 'dash', undefined, false)));
    }

    const host = new URL(apiBase).hostname;
    return {
      id: `${host}_${videoId}`,
      title: traverse_obj(channel, ['title', String]) as string | undefined,
      description: traverse_obj(channel, ['description', String]) as string | undefined,
      formats,
      subtitles,
      http_headers: headers,
      is_live: true,
    };
  }
}
