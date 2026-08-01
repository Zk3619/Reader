/**
 * Bilibili Bangumi — ep / ss / md (aligned with bilibili.py Bangumi family).
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { VideoInfo } from '../types';
import {
  BILI_HEADERS,
  BILI_UA,
  extractJsonAssign,
  parseBiliPlayFormats,
  unwrapNestedPlay,
} from './bilibili-shared';

async function getEpisodesFromSeason(
  ie: InfoExtractor,
  ssId: string,
  referer: string,
): Promise<VideoInfo[]> {
  const headers = { ...BILI_HEADERS, Referer: referer, 'User-Agent': BILI_UA };
  const seasonInfo = await ie._download_json<{
    result?: {
      main_section?: {
        episodes?: Array<{ id?: number; share_url?: string; title?: string; long_title?: string }>;
      };
    };
  }>(
    `https://api.bilibili.com/pgc/web/season/section?season_id=${ssId}`,
    ssId,
    'Downloading season info',
    { headers, fatal: false },
  );
  const eps = seasonInfo?.result?.main_section?.episodes || [];
  return eps
    .filter((e) => e.id && e.share_url)
    .map((e) =>
      ie.url_result(
        String(e.share_url),
        'BiliBiliBangumi',
        String(e.id),
        `${e.title || ''} ${e.long_title || ''}`.trim() || String(e.id),
      ),
    );
}

/** Episode: /bangumi/play/epNNNN */
export class BiliBangumiIE extends InfoExtractor {
  static IE_NAME = 'BiliBiliBangumi';
  static IE_DESC = 'Bilibili bangumi episode';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?bilibili\.com\/bangumi\/play\/ep(?<id>\d+)/i;
  static _TESTS = [
    { url: 'https://www.bilibili.com/bangumi/play/ep21495', only_matching: true },
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract bangumi ep id', { expected: true });

    const headers = {
      ...BILI_HEADERS,
      Referer: url,
      'User-Agent': BILI_UA,
    };

    const webpage = await this._download_webpage(url, id, 'Downloading bangumi webpage', {
      headers,
      fatal: false,
    });
    if (webpage?.includes('您所在的地区无法观看本片')) {
      this.raise_geo_restricted('该番剧在当前地区不可用');
    }

    let playRaw: Record<string, unknown> | null =
      extractJsonAssign(webpage || '', /playurlSSRData\s*=/) ||
      (await this._download_json<Record<string, unknown>>(
        `https://api.bilibili.com/pgc/player/web/v2/playurl?fnval=12240&ep_id=${id}`,
        id,
        'Downloading bangumi playurl',
        { headers, fatal: false },
      ));

    const { status, videoInfo } = unwrapNestedPlay(playRaw);
    const formats = parseBiliPlayFormats(videoInfo, { Referer: url, ...BILI_HEADERS });
    if (!formats.length) {
      if (status === -10403 || webpage?.includes('成为大会员') || webpage?.includes('开通大会员')) {
        this.raise_login_required('This bangumi is for premium members only');
      }
      throw new ExtractorError('番剧无可下载格式（可能需大会员）', { expected: true });
    }

    const season = await this._download_json<{
      result?: {
        title?: string;
        season_id?: number;
        series?: { series_title?: string; series_id?: number };
        square_cover?: string;
        episodes?: Array<{
          id?: number;
          title?: string;
          long_title?: string;
          cover?: string;
          aid?: number;
          cid?: number;
          pub_time?: number;
        }>;
        section?: Array<{ episodes?: Array<Record<string, unknown>> }>;
      };
    }>(
      `https://api.bilibili.com/pgc/view/web/season?ep_id=${id}`,
      id,
      'Downloading bangumi season',
      { headers, fatal: false },
    );

    const bangumi = season?.result || {};
    const allEps = [
      ...(bangumi.episodes || []),
      ...((bangumi.section || []).flatMap((s) => s.episodes || []) as Array<{
        id?: number;
        title?: string;
        long_title?: string;
        cover?: string;
        aid?: number;
        cid?: number;
        pub_time?: number;
      }>),
    ];
    const ep = allEps.find((e) => String(e.id) === id) || allEps[0];
    const title =
      (ep ? `${ep.title || ''} ${ep.long_title || ''}`.trim() : '') ||
      bangumi.title ||
      `ep${id}`;

    return {
      id,
      title,
      episode: ep?.long_title || null,
      episode_id: id,
      season_id: bangumi.season_id != null ? String(bangumi.season_id) : null,
      series: bangumi.series?.series_title || null,
      series_id: bangumi.series?.series_id != null ? String(bangumi.series.series_id) : null,
      thumbnail: ep?.cover || bangumi.square_cover || null,
      timestamp: Number(ep?.pub_time) || null,
      duration:
        videoInfo.timelength != null
          ? Number(videoInfo.timelength) / 1000
          : null,
      webpage_url: `https://www.bilibili.com/bangumi/play/ep${id}`,
      original_url: url,
      formats,
      extractor: 'BiliBiliBangumi',
      extractor_key: 'BiliBiliBangumi',
      http_headers: { Referer: url, ...BILI_HEADERS },
    };
  }
}

/** Season playlist: /bangumi/play/ssNNNN */
export class BiliBangumiSeasonIE extends InfoExtractor {
  static IE_NAME = 'BiliBiliBangumiSeason';
  static IE_DESC = 'Bilibili bangumi season';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?bilibili\.com\/bangumi\/play\/ss(?<id>\d+)/i;
  static _TESTS = [
    { url: 'https://www.bilibili.com/bangumi/play/ss26801', only_matching: true },
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const ssId = this._match_id(url);
    if (!ssId) throw new ExtractorError('Unable to extract season id', { expected: true });

    const headers = { ...BILI_HEADERS, Referer: url, 'User-Agent': BILI_UA };
    const webpage = await this._download_webpage(url, ssId, 'Downloading season webpage', {
      headers,
      fatal: false,
    });

    let title: string | null = null;
    let description: string | null = null;
    const ld = extractJsonAssign(webpage || '', /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i);
    if (ld) {
      const items = (ld.itemListElement as Array<Record<string, unknown>>) || [];
      const first = items[0] || ld;
      title = String(first.name || '') || null;
      description = String(first.description || '') || null;
    }

    if (!title) {
      const view = await this._download_json<{
        result?: { title?: string; evaluate?: string };
      }>(
        `https://api.bilibili.com/pgc/view/web/season?season_id=${ssId}`,
        ssId,
        'Downloading season meta',
        { headers, fatal: false },
      );
      title = view?.result?.title || `ss${ssId}`;
      description = view?.result?.evaluate || null;
    }

    const entries = await getEpisodesFromSeason(this, ssId, url);
    if (!entries.length) {
      throw new ExtractorError('Bangumi season has no episodes', { expected: true });
    }
    return this.playlist_result(entries, ssId, title, description);
  }
}

/** Media playlist: /bangumi/media/mdNNNN → resolve season_id → episodes */
export class BiliBangumiMediaIE extends InfoExtractor {
  static IE_NAME = 'BiliBiliBangumiMedia';
  static IE_DESC = 'Bilibili bangumi media';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?bilibili\.com\/bangumi\/media\/md(?<id>\d+)/i;
  static _TESTS = [
    { url: 'https://www.bilibili.com/bangumi/media/md24097891', only_matching: true },
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const mediaId = this._match_id(url);
    if (!mediaId) throw new ExtractorError('Unable to extract media id', { expected: true });

    const headers = { ...BILI_HEADERS, Referer: url, 'User-Agent': BILI_UA };
    const webpage = await this._download_webpage(url, mediaId, 'Downloading media webpage', {
      headers,
      fatal: false,
    });

    const initial =
      extractJsonAssign(webpage || '', /window\.__INITIAL_STATE__\s*=/) ||
      extractJsonAssign(webpage || '', /__INITIAL_STATE__\s*=/);
    const mediaInfo = (initial?.mediaInfo || {}) as {
      season_id?: number;
      title?: string;
      evaluate?: string;
    };

    let ssId = mediaInfo.season_id != null ? String(mediaInfo.season_id) : '';
    let title = mediaInfo.title || null;
    let description = mediaInfo.evaluate || null;

    if (!ssId) {
      // Fallback: media API
      const j = await this._download_json<{
        result?: { media?: { season_id?: number; title?: string; evaluate?: string } };
      }>(
        `https://api.bilibili.com/pgc/review/user?media_id=${mediaId}`,
        mediaId,
        'Downloading media info',
        { headers, fatal: false },
      );
      // Try another endpoint if needed
      const pageState = extractJsonAssign(webpage || '', /__NEXT_DATA__\s*=/);
      void pageState;
      if (!ssId && j?.result?.media?.season_id) {
        ssId = String(j.result.media.season_id);
        title = title || j.result.media.title || null;
        description = description || j.result.media.evaluate || null;
      }
    }

    if (!ssId) {
      // Last resort: scrape season link
      const m = webpage?.match(/\/bangumi\/play\/ss(\d+)/);
      if (m) ssId = m[1]!;
    }
    if (!ssId) {
      throw new ExtractorError('Unable to resolve bangumi season_id from media page', {
        expected: true,
      });
    }

    const entries = await getEpisodesFromSeason(this, ssId, url);
    return this.playlist_result(entries, mediaId, title || `md${mediaId}`, description);
  }
}

/** @deprecated alias */
export { BiliBangumiIE as BiliBiliBangumiIE };
