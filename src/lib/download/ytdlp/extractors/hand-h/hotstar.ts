/**
 * HotStarBaseIE / HotStarIE / HotStarPrefixIE / HotStarSeriesIE — ported from yt-dlp hotstar.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  filter_dict,
  int_or_none,
  join_nonempty,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, jwtDecodePayload, mergeSubtitles, parseIso8601 } from './_helpers';

const AKAMAI_KEY = new Uint8Array([
  0x05, 0xfc, 0x1a, 0x01, 0xca, 0xc9, 0x4b, 0xc4, 0x12, 0xfc, 0x53, 0x12, 0x07, 0x75, 0xf9, 0xee,
]);

async function hmacSha256Hex(key: Uint8Array, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const TYPE_MAP: Record<string, string> = {
  movies: 'movie',
  sports: 'match',
  episode: 'episode',
  tv: 'episode',
  shows: 'episode',
  clips: 'content',
};

const CONTENT_TYPE: Record<string, string> = {
  movie: 'MOVIE',
  episode: 'EPISODE',
  match: 'SPORT',
  content: 'CLIPS',
};

export class HotStarBaseIE extends InfoExtractor {
  static IE_NAME = 'hotstarbase';
  static _VALID_URL: RegExp | string | false | null = false;

  protected _TOKEN_NAME = 'userUP';
  protected _BASE_URL = 'https://www.hotstar.com';
  protected _API_URL = 'https://api.hotstar.com';
  protected _API_URL_V2 = 'https://www.hotstar.com/api/internal/bff/v2';
  protected _PAGE_SIZE = 100;

  protected _FREE_HEADERS = {
    'user-agent': 'Hotstar;in.startv.hotstar/25.06.30.0.11580 (Android/12)',
    'x-hs-client':
      'platform:android;app_id:in.startv.hotstar;app_version:25.06.30.0;os:Android;os_version:12;schema_version:0.0.1523',
    'x-hs-platform': 'android',
  };
  protected _SUB_HEADERS = {
    'user-agent': 'Disney+;in.startv.hotstar.dplus.tv/23.08.14.4.2915 (Android/13)',
    'x-hs-client':
      'platform:androidtv;app_id:in.startv.hotstar.dplus.tv;app_version:23.08.14.4;os:Android;os_version:13;schema_version:0.0.970',
    'x-hs-platform': 'androidtv',
  };

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('HotStarBaseIE is not a standalone extractor', { expected: true });
  }

  protected _hasActiveSubscription(cookies: Record<string, string>, serverTime?: number): boolean {
    const st = int_or_none(serverTime) ?? Math.floor(Date.now() / 1000);
    const token = cookies[this._TOKEN_NAME];
    if (!token) return false;
    try {
      const payload = jwtDecodePayload(token);
      const subRaw = payload.sub;
      if (typeof subRaw !== 'string') return false;
      const sub = JSON.parse(subRaw) as { subscriptions?: { in?: Array<{ expiry?: string }> } };
      const expiries = (sub.subscriptions?.in || [])
        .map((s) => parseIso8601(s.expiry))
        .filter((e): e is number => e != null);
      return (expiries.length ? Math.max(...expiries) : 0) > st;
    } catch {
      return false;
    }
  }

  protected async _callApiV1(path: string, videoId: string, opts?: { query?: Record<string, string>; fatal?: boolean }) {
    return this._download_json<Record<string, unknown>>(`${this._API_URL}/o/v1/${path}`, videoId, undefined, {
      query: opts?.query,
      headers: { 'x-country-code': 'IN', 'x-platform-code': 'PCTV' },
      fatal: opts?.fatal,
    });
  }

  protected async _callApiImpl(
    path: string,
    videoId: string,
    query: Record<string, string>,
    cookies: Record<string, string>,
    st?: number,
  ): Promise<Record<string, unknown>> {
    const serverTime = int_or_none(st) ?? Math.floor(Date.now() / 1000);
    const exp = serverTime + 6000;
    let auth = `st=${serverTime}~exp=${exp}~acl=/*`;
    auth += `~hmac=${await hmacSha256Hex(AKAMAI_KEY, auth)}`;
    const response = await this._download_json<Record<string, unknown>>(`${this._API_URL_V2}/${path}`, videoId, undefined, {
      query,
      headers: filter_dict({
        ...(this._hasActiveSubscription(cookies, serverTime) ? this._SUB_HEADERS : this._FREE_HEADERS),
        hotstarauth: auth,
        'x-hs-usertoken': cookies[this._TOKEN_NAME],
        'x-hs-device-id': cookies.deviceId || crypto.randomUUID(),
        'content-type': 'application/json',
      }) as Record<string, string>,
    });
    const success = response.success as Record<string, unknown> | undefined;
    if (!success) throw new ExtractorError('API call was unsuccessful', { expected: true });
    return success;
  }

  protected async _callApiV2(
    path: string,
    videoId: string,
    contentType: string,
    cookies: Record<string, string>,
    st?: number,
  ): Promise<Record<string, unknown>> {
    return this._callApiImpl(path, videoId, {
      content_id: videoId,
      filters: `content_type=${contentType}`,
      client_capabilities: JSON.stringify({
        package: ['dash', 'hls'],
        container: ['fmp4', 'fmp4br', 'ts'],
        ads: ['non_ssai', 'ssai'],
        audio_channel: ['stereo', 'dolby51', 'atmos'],
        encryption: ['plain', 'widevine'],
        video_codec: ['h264', 'h265'],
        video_codec_non_secure: ['h264', 'h265', 'vp9'],
        ladder: ['phone', 'tv', 'full'],
        resolution: ['hd', '4k'],
        true_resolution: ['hd', '4k'],
        dynamic_range: ['sdr', 'hdr'],
      }),
      drm_parameters: JSON.stringify({
        widevine_security_level: ['SW_SECURE_DECODE', 'SW_SECURE_CRYPTO'],
        hdcp_version: ['HDCP_V2_2', 'HDCP_V2_1', 'HDCP_V2', 'HDCP_V1'],
      }),
    }, cookies, st);
  }

  protected _parseMetadataV1(videoData: Record<string, unknown>): Partial<VideoInfo> {
    return {
      id: videoData.contentId != null ? String(videoData.contentId) : undefined,
      title: videoData.title != null ? String(videoData.title) : undefined,
      description: videoData.description != null ? String(videoData.description) : undefined,
      duration: int_or_none(videoData.duration) ?? undefined,
      timestamp:
        int_or_none(videoData.broadcastDate) ??
        int_or_none(videoData.startDate) ??
        undefined,
      release_year: int_or_none(videoData.year) ?? undefined,
      channel: videoData.channelName != null ? String(videoData.channelName) : undefined,
      channel_id: videoData.channelId != null ? String(videoData.channelId) : undefined,
      series: videoData.showName != null ? String(videoData.showName) : undefined,
      season: videoData.seasonName != null ? String(videoData.seasonName) : undefined,
      season_number: int_or_none(videoData.seasonNo) ?? undefined,
      season_id: videoData.seasonId != null ? String(videoData.seasonId) : undefined,
      episode: videoData.title != null ? String(videoData.title) : undefined,
      episode_number: int_or_none(videoData.episodeNo) ?? undefined,
    };
  }

  protected async *_fetchPage(
    path: string,
    itemId: string,
    _name: string,
    query: Record<string, string>,
    root: string,
    page: number,
  ): AsyncGenerator<VideoInfo> {
    const results = (
      ((await this._callApiV1(path, itemId, {
        query: { ...query, tao: String(page * this._PAGE_SIZE), tas: String(this._PAGE_SIZE) },
      })) as { body?: { results?: Record<string, unknown> } }).body?.results || {}
    ) as Record<string, unknown>;

    const assets = (results.assets as Array<Record<string, unknown>>) || [results];
    for (const assetBlock of assets) {
      const items = (assetBlock.items as Array<Record<string, unknown>>) || [];
      for (const video of items) {
        if (!video.contentId) continue;
        const contentId = String(video.contentId);
        yield {
          ...this.url_result(HotStarIE.videoUrl(contentId, undefined, root), 'HotStar', contentId),
          ...this._parseMetadataV1(video),
        };
      }
    }
  }
}

export class HotStarIE extends HotStarBaseIE {
  static IE_NAME = 'hotstar';
  static IE_DESC = 'JioHotstar';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?hotstar\.com(?:\/in)?\/(?!in\/)(?:(?<type>movies|sports|clips|episode|tv|shows)(?:\/(?:[^/?#]+\/){0,2})?)?(?:[^/?#]+\/)+(?<id>\d{10})/;

  static videoUrl(videoId: string, videoType?: string | null, root?: string): string {
    const base = root || join_nonempty('https://www.hotstar.com', videoType, '/');
    return `${base}/ignore_me/${videoId}`;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const rawType = m.groups!.type || null;
    const videoType = TYPE_MAP[rawType || ''] || 'content';
    const cookies = this._get_cookies(url);
    if (!cookies[this._TOKEN_NAME]) this.raise_login_required();

    const detail = await this._callApiV1(`${videoType}/detail`, videoId, {
      query: { tas: '5', contentId: videoId },
      fatal: false,
    });
    const videoData =
      (((detail.body as Record<string, unknown>)?.results as Record<string, unknown>)?.item as Record<string, unknown>) ||
      {};

    if (videoData.drmProtected) {
      throw new ExtractorError(`${videoId}: This video is DRM protected`, { expected: true });
    }

    let geoRestricted = false;
    let hasDrm = false;
    const formats: Format[] = [];
    let subs: Record<string, Subtitle[]> = {};
    const headers = { Referer: `${this._BASE_URL}/in` };
    const contentType = str_or_none(videoData.contentType) || CONTENT_TYPE[videoType] || 'CLIPS';

    const home = await this._request_webpage(`${this._BASE_URL}/in`, videoId, 'Fetching server time');
    const stHeader = home?.headers?.['x-origin-date'];
    const st = int_or_none(stHeader) ?? Math.floor(Date.now() / 1000);
    const watch = await this._callApiV2('pages/watch', videoId, contentType, cookies, st);

    const widgets = traverse_obj(watch, ['page', 'spaces', 'player', 'widget_wrappers']) as
      | Array<Record<string, unknown>>
      | undefined;
    const playerWidget = (widgets || []).find((w) => w.template === 'PlayerWidget');
    const playerConfig = ((playerWidget?.widget as Record<string, unknown>)?.data as Record<string, unknown>)
      ?.player_config as Record<string, unknown> | undefined;
    if (!playerConfig) throw new ExtractorError('Unable to extract player config', { expected: true });

    const playbackSets: Array<Record<string, unknown>> = [];
    for (const key of ['media_asset', 'media_asset_v2']) {
      const block = playerConfig[key] as Record<string, unknown> | undefined;
      if (!block) continue;
      for (const subKey of ['primary', 'fallback']) {
        const set = block[subKey] as Record<string, unknown> | undefined;
        if (set && url_or_none(set.content_url)) playbackSets.push(set);
      }
    }

    for (const playbackSet of playbackSets) {
      const tags = str_or_none(playbackSet.playback_tags) || '';
      const tagDict: Record<string, string> = {};
      for (const part of tags.split(';')) {
        const [k, v] = part.split(':', 2);
        if (k) tagDict[k] = v ?? '';
      }
      if (tagDict.encryption && tagDict.encryption !== 'plain') {
        hasDrm = true;
        continue;
      }

      let formatUrl = String(playbackSet.content_url ?? '').replace(/(?<=\/\/staragvod)(\d)/, 'web$1');
      const ext = determine_ext(formatUrl);
      try {
        if (tags.includes('package:hls') || ext === 'm3u8') {
          const res = await extractM3u8FormatsAndSubtitles(this, formatUrl, videoId, 'hls');
          formats.push(...res.formats.map((f) => ({ ...f, http_headers: headers })));
          subs = mergeSubtitles(subs, res.subtitles);
        } else if (tags.includes('package:dash') || ext === 'mpd') {
          const dashFormats = await this._extract_mpd_formats(formatUrl, videoId, 'dash', undefined, false);
          formats.push(...dashFormats.map((f) => ({ ...f, http_headers: headers })));
        } else if (ext !== 'f4m') {
          formats.push({
            format_id: ext || 'http',
            url: formatUrl,
            width: int_or_none(playbackSet.width) ?? undefined,
            height: int_or_none(playbackSet.height) ?? undefined,
            http_headers: headers,
          });
        }
      } catch (e) {
        const status = (e as { cause?: { status?: number } }).cause?.status;
        if (status === 403 || status === 474) geoRestricted = true;
        continue;
      }
    }

    if (!formats.length) {
      if (geoRestricted) this.raise_geo_restricted('This video is not available from your geographic region.', ['IN']);
      if (hasDrm) throw new ExtractorError(`${videoId}: This video is DRM protected`, { expected: true });
      if (!this._hasActiveSubscription(cookies, st)) {
        this.raise_no_formats('Your account does not have access to this content', true);
      }
    }

    const seen = new Set<string>();
    const uniqueFormats = formats.filter((f) => {
      const key = f.url || '';
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      ...this._parseMetadataV1(videoData),
      id: videoId,
      formats: uniqueFormats,
      subtitles: Object.keys(subs).length ? subs : undefined,
    };
  }
}

export class HotStarPrefixIE extends InfoExtractor {
  static IE_NAME = 'hotstarprefix';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null =
    /hotstar:(?:(?<type>\w+):)?(?<id>\d+)$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const videoType = m.groups!.type || null;
    return this.url_result(HotStarIE.videoUrl(videoId, videoType), 'HotStar', videoId);
  }
}

export class HotStarSeriesIE extends HotStarBaseIE {
  static IE_NAME = 'hotstar:series';
  static _VALID_URL =
    /(?<url>https?:\/\/(?:www\.)?hotstar\.com(?:\/in)?\/(?:tv|shows)\/[^/]+\/(?<id>\d+))\/?(?:[#?]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const seriesUrl = m.groups!.url!;
    const seriesId = m.groups!.id!;
    const detail = await this._callApiV1('show/detail', seriesId, { query: { contentId: seriesId } });
    const eid = String(
      (((detail.body as Record<string, unknown>)?.results as Record<string, unknown>)?.item as Record<string, unknown>)
        ?.id ?? seriesId,
    );

    const entries: VideoInfo[] = [];
    for (let page = 0; page < 500; page++) {
      let count = 0;
      for await (const entry of this._fetchPage(
        'tray/g/1/items',
        seriesId,
        'series',
        { etid: '0', eid },
        seriesUrl,
        page,
      )) {
        entries.push(entry);
        count++;
      }
      if (count < this._PAGE_SIZE) break;
    }

    return this.playlist_result(entries, seriesId);
  }
}
