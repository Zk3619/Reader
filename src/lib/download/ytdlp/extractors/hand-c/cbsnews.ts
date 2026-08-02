/**
 * CBS News family — ported from yt-dlp cbsnews.py
 *
 * Notes on pragmatic simplifications vs. upstream:
 * - `_parse_m3u8_formats_and_subtitles(manifest, ...)` (parsing an already-downloaded manifest
 *   string) has no equivalent here; `_extract_video` instead re-fetches the m3u8 URL via
 *   `_extract_m3u8_formats`, which is slightly wasteful but functionally equivalent.
 * - `_extract_akamai_formats` (Akamai-specific HDS/HLS/token-auth resolution) is not ported;
 *   `CBSNewsLiveVideoIE` treats the returned URL as a plain HLS manifest.
 * - `make_archive_id`/`_old_archive_ids` bookkeeping is omitted (not meaningful in this runtime).
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  mimetype2ext,
  parse_duration,
  smuggle_url,
  str_or_none,
  url_or_none,
} from '../../utils';
import * as pako from 'pako';
import { UserNotLive } from './_helpers';

const LOCALES: Record<string, string | null> = {
  atlanta: null,
  baltimore: 'BAL',
  boston: 'BOS',
  chicago: 'CHI',
  colorado: 'DEN',
  detroit: 'DET',
  losangeles: 'LA',
  miami: 'MIA',
  minnesota: 'MIN',
  newyork: 'NY',
  philadelphia: 'PHI',
  pittsburgh: 'PIT',
  sacramento: 'SAC',
  sanfrancisco: 'SF',
  texas: 'DAL',
};
const LOCALE_RE = Object.keys(LOCALES).join('|');
const ANVACK = '5VD6Eyd6djewbCmNwBFnsJj17YAvGRwl';

function base64UrlDecodeToBytes(s: string): Uint8Array {
  const normalized = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function inflateRawToString(bytes: Uint8Array): string {
  return pako.inflateRaw(bytes, { to: 'string' });
}

/** No standalone URL upstream; shared helpers only (subclasses provide `_real_extract`). */
export class CBSNewsBaseIE extends InfoExtractor {
  static IE_NAME = 'cbsnewsbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  protected _getItem(webpage: string, displayId: string): Record<string, unknown> {
    const payload =
      this._search_json<Record<string, unknown>>(
        /CBSNEWS\.defaultPayload\s*=/,
        webpage,
        'payload',
        displayId,
        { default: {} },
      ) || {};
    const items = payload.items as Record<string, unknown>[] | undefined;
    return (items?.[0] as Record<string, unknown>) || {};
  }

  protected _getVideoUrl(item: Record<string, unknown>): string | null {
    return url_or_none(item.video) || url_or_none(item.video2);
  }

  protected _extractPlaylist(webpage: string, playlistId: string): VideoInfo | null {
    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(
      /<iframe[^>]+data-src="(https?:\/\/(?:www\.)?cbsnews\.com\/embed\/video\/[^#]*#[^"]+)"/g,
    )) {
      entries.push(this.url_result(m[1]!, 'CBSNewsEmbed'));
    }
    if (!entries.length) return null;
    return this.playlist_result(
      entries,
      playlistId,
      this._html_search_meta(['og:title', 'twitter:title'], webpage) ?? undefined,
      this._html_search_meta(['og:description', 'twitter:description', 'description'], webpage) ??
        undefined,
    );
  }

  protected async _extractVideo(
    item: Record<string, unknown>,
    videoUrl: string,
    videoId: string,
  ): Promise<VideoInfo> {
    let formats: Format[];
    const ext = mimetype2ext(str_or_none(item.format)) || determine_ext(videoUrl);
    if (ext === 'mp4') {
      formats = [{ format_id: 'direct', url: videoUrl, ext: 'mp4' }];
    } else {
      const manifest = await this._download_webpage(videoUrl, videoId, 'Downloading m3u8 information');
      const anvatoId = this._search_regex(/anvato-(\d+)/, manifest, 'Anvato ID', null, false);
      if (anvatoId) {
        const result = this.url_result(
          smuggle_url(`anvato:${ANVACK}:${anvatoId}`, { token: 'default' }),
          'Anvato',
        );
        result._type = 'url_transparent';
        return result;
      }
      formats = await this._extract_m3u8_formats(
        videoUrl,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
      );
    }

    const captionsUrl = url_or_none(item.captions);
    const subtitles: Record<string, Subtitle[]> = captionsUrl
      ? { en: [{ url: captionsUrl, ext: 'dfxp' }] }
      : {};

    const isFullEpisode = Boolean(item.isFullEpisode);
    const images = (item.images as Record<string, unknown>) || {};

    return {
      id: videoId,
      formats,
      title: str_or_none(item.fulltitle) || str_or_none(item.title) || undefined,
      description: str_or_none(item.dek) ?? undefined,
      timestamp: float_or_none(item.timestamp, 1000) ?? undefined,
      duration: float_or_none(item.duration) ?? undefined,
      subtitles,
      thumbnail: url_or_none(images.hd) || url_or_none(images.sd) || undefined,
      is_live: item.type === 'live',
      season_number: isFullEpisode ? int_or_none(item.season) ?? undefined : undefined,
      episode_number: isFullEpisode ? int_or_none(item.episode) ?? undefined : undefined,
    };
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('CBSNewsBaseIE has no standalone extraction', { expected: true });
  }
}

export class CBSNewsEmbedIE extends CBSNewsBaseIE {
  static IE_NAME = 'cbsnews:embed';
  static _VALID_URL = /^https?:\/\/(?:www\.)?cbsnews\.com\/embed\/video[^#]*#(?<id>.+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const encoded = this._match_id(url);
    const compressed = base64UrlDecodeToBytes(decodeURIComponent(encoded));
    const json = inflateRawToString(compressed);
    const parsed = this._parse_json<Record<string, unknown>>(json, undefined, undefined, false) || {};
    const video = parsed.video as Record<string, unknown> | undefined;
    const items = video?.items as Record<string, unknown>[] | undefined;
    const item = (items?.[0] as Record<string, unknown>) || {};

    const videoId = str_or_none(item.mpxRefId) || '';
    const videoUrl = this._getVideoUrl(item);
    if (!videoUrl) throw new ExtractorError('This video is no longer available', { expected: true });

    return this._extractVideo(item, videoUrl, videoId);
  }
}

export class CBSNewsIE extends CBSNewsBaseIE {
  static IE_NAME = 'cbsnews';
  static IE_DESC = 'CBS News';
  static _VALID_URL = /^https?:\/\/(?:www\.)?cbsnews\.com\/(?:news|video)\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const playlist = this._extractPlaylist(webpage, displayId);
    if (playlist) return playlist;

    const item = this._getItem(webpage, displayId);
    const videoId = str_or_none(item.mpxRefId) || displayId;
    const videoUrl = this._getVideoUrl(item);
    if (!videoUrl) this.raise_no_formats('No video content was found', true);

    return this._extractVideo(item, videoUrl!, videoId);
  }
}

export class CBSLocalBaseIE extends CBSNewsBaseIE {
  static IE_NAME = 'cbslocalbase';

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const item = this._getItem(webpage, displayId);
    const videoId = str_or_none(item.mpxRefId) || displayId;
    const videoUrl = this._getVideoUrl(item);

    if (!videoUrl) {
      const anvParams = this._search_regex(
        /<iframe[^>]+\bdata-src="https?:\/\/w3\.mp\.lura\.live\/player\/prod\/v3\/anvload\.html\?key=([^"]+)"/,
        webpage,
        'Anvato URL',
        null,
        false,
      );
      if (!anvParams) {
        const playlist = this._extractPlaylist(webpage, displayId);
        if (playlist) return playlist;
        this.raise_no_formats('No video content was found', true);
      }
      const anvData =
        this._parse_json<Record<string, unknown>>(
          new TextDecoder().decode(base64UrlDecodeToBytes(anvParams!)),
          videoId,
        ) || {};
      const anvatoId = str_or_none(anvData.v) || '';
      const result = this.url_result(
        smuggle_url(`anvato:${str_or_none(anvData.anvack) || ANVACK}:${anvatoId}`, {
          token: str_or_none(anvData.token) || 'default',
        }),
        'Anvato',
      );
      result._type = 'url_transparent';
      return result;
    }

    return this._extractVideo(item, videoUrl, videoId);
  }
}

export class CBSLocalIE extends CBSLocalBaseIE {
  static IE_NAME = 'cbslocal';
  static _VALID_URL = new RegExp(
    `^https?://(?:www\\.)?cbsnews\\.com/(?:${LOCALE_RE})/(?:live/)?video/(?<id>[\\w-]+)`,
  );
}

export class CBSLocalArticleIE extends CBSLocalBaseIE {
  static IE_NAME = 'cbslocalarticle';
  static _VALID_URL = new RegExp(`^https?://(?:www\\.)?cbsnews\\.com/(?:${LOCALE_RE})/news/(?<id>[\\w-]+)`);
}

/** No standalone URL upstream; subclasses provide `_getId`. */
export class CBSNewsLiveBaseIE extends CBSNewsBaseIE {
  static IE_NAME = 'cbsnewslivebase';

  protected _getId(_url: string): string | undefined {
    throw new ExtractorError('This method must be implemented by subclasses');
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._getId(url);
    if (!videoId) throw new ExtractorError('Livestream is not available', { expected: true });

    const resp = await this._download_json<Record<string, unknown>>(
      'https://feeds-cbsn.cbsnews.com/2.0/rundown/',
      videoId,
      undefined,
      { query: { partner: 'cbsnsite', edition: videoId, type: 'live' } },
    );
    const navigation = resp.navigation as Record<string, unknown> | undefined;
    const dataList = navigation?.data as Record<string, unknown>[] | undefined;
    const data = (dataList?.[0] as Record<string, unknown>) || {};

    const videoUrl =
      url_or_none(data.videoUrlDAI) || url_or_none((data.videoUrl as Record<string, unknown>)?.base);
    if (!videoUrl) throw new UserNotLive(videoId);

    const formats = await this._extract_m3u8_formats(
      videoUrl,
      videoId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
    );

    const images = data.images as Record<string, unknown> | undefined;
    return {
      id: videoId,
      formats,
      subtitles: {},
      is_live: true,
      title: str_or_none(data.headline) ?? undefined,
      description: str_or_none(data.rundown_slug) ?? undefined,
      thumbnail: url_or_none(images?.thumbnail_url_hd) ?? undefined,
    };
  }
}

export class CBSLocalLiveIE extends CBSNewsLiveBaseIE {
  static IE_NAME = 'cbslocallive';
  static _VALID_URL = new RegExp(`^https?://(?:www\\.)?cbsnews\\.com/(?<id>${LOCALE_RE})/live/?(?:[?#]|$)`);

  protected _getId(url: string): string | undefined {
    const code = LOCALES[this._match_id(url)];
    return code ? `CBSN-${code}` : undefined;
  }
}

export class CBSNewsLiveIE extends CBSNewsLiveBaseIE {
  static IE_NAME = 'cbsnews:live';
  static IE_DESC = 'CBS News Livestream';
  static _VALID_URL = /^https?:\/\/(?:www\.)?cbsnews\.com\/live\/?(?:[?#]|$)/;

  protected _getId(_url: string): string | undefined {
    return 'CBSN-US';
  }
}

export class CBSNewsLiveVideoIE extends InfoExtractor {
  static IE_NAME = 'cbsnews:livevideo';
  static IE_DESC = 'CBS News Live Videos';
  static _VALID_URL = /^https?:\/\/(?:www\.)?cbsnews\.com\/live\/video\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);

    const videoInfo = await this._download_json<Record<string, unknown>>(
      'http://feeds.cbsn.cbsnews.com/rundown/story',
      displayId,
      undefined,
      { query: { device: 'desktop', dvr_slug: displayId } },
    );

    const manifestUrl = str_or_none(videoInfo.url) || '';
    const formats = await this._extract_m3u8_formats(manifestUrl, displayId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false);

    return {
      id: displayId,
      display_id: displayId,
      formats,
      title: str_or_none(videoInfo.headline) ?? undefined,
      thumbnail: url_or_none(videoInfo.thumbnail_url_hd) ?? undefined,
      duration: parse_duration(videoInfo.segmentDur) ?? undefined,
    };
  }
}
