/**
 * BilibiliIE — aligned with yt-dlp bilibili.py BiliBiliIE main path
 * (view API, playurl DASH, multi-P playlist entries).
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';
import {
  BILI_HEADERS,
  BILI_UA,
  extractJsonAssign,
  parseBiliPlayFormats,
  unwrapNestedPlay,
} from './bilibili-shared';

function bvToAid(bvid: string): number | null {
  const table = 'fZodR9qLbMj1WoGeRZsjMTRjTW0n3m6i7k45hz0DgsAFLS9CTB1YJUuaVhpitokJ';
  const tr: Record<string, number> = {};
  for (let i = 0; i < 58; i++) tr[table[i]!] = i;
  const s = [11, 10, 3, 8, 4, 6];
  const xor = 177451812;
  const add = 8728348608;
  let r = 0;
  for (let i = 0; i < 6; i++) r += (tr[bvid[s[i]!]!] ?? 0) * 58 ** i;
  return (r - add) ^ xor;
}

type Page = {
  cid: number;
  page: number;
  part?: string;
  duration?: number;
  first_frame?: string;
};

export class BilibiliIE extends InfoExtractor {
  static IE_NAME = 'BiliBili';
  static IE_DESC = 'Bilibili videos';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?bilibili\.com\/(?:video\/|festival\/[^/?#]+\?(?:[^#]*&)?bvid=)(?<id>[^/?#&]+)/i;
  static _TESTS = [
    { url: 'https://www.bilibili.com/video/BV1xx411c7mD', only_matching: true },
    { url: 'https://www.bilibili.com/video/av170001', only_matching: true },
  ];

  private async downloadJson(
    url: string,
    headers: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    return this._download_json<Record<string, unknown>>(url, undefined, undefined, {
      headers,
      fatal: false,
    });
  }

  private async extractFormats(
    playUrl: string,
    videoId: string,
  ): Promise<{ formats: Format[]; status?: number }> {
    try {
      const play = await this.downloadJson(playUrl, BILI_HEADERS);
      const { status, videoInfo } = unwrapNestedPlay(play);
      return { formats: parseBiliPlayFormats(videoInfo, BILI_HEADERS), status };
    } catch (e) {
      this.report_warning(`Bilibili playurl failed (${videoId}): ${e}`);
      return { formats: [] };
    }
  }

  private async extractOldPlaylist(
    oldId: string,
    _bvid: string,
  ): Promise<VideoInfo | null> {
    try {
      const data = await this.downloadJson(
        `https://api.bilibili.com/x/playlist/video/toview?aid=${oldId}`,
        BILI_HEADERS,
      );
      const list = ((data.data as Record<string, unknown>)?.list as Array<Record<string, unknown>>) || [];
      if (!list.length) return null;
      const entries = list.map((v) => {
        const bvid = String(v.bvid || '');
        const aid = v.aid != null ? String(v.aid) : '';
        const id = bvid || aid;
        return this.url_result(
          `https://www.bilibili.com/video/${bvid || `av${aid}`}`,
          'BiliBili',
          id,
          String(v.title || id),
        );
      });
      return this.playlist_result(entries, `WL-${oldId}`, `ToView ${oldId}`);
    } catch {
      return null;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = url.match(BilibiliIE._VALID_URL)!;
    let videoId = m.groups?.id || m[1] || '';
    videoId = decodeURIComponent(videoId).replace(/\.(?:html|htm)$/i, '');

    let bvid = '';
    let aid = '';
    if (/^BV/i.test(videoId)) {
      bvid = videoId;
      const a = bvToAid(videoId);
      if (a) aid = String(a);
    } else if (/^av/i.test(videoId)) {
      aid = videoId.replace(/^av/i, '');
    } else if (/^\d+$/.test(videoId)) {
      aid = videoId;
    } else {
      bvid = videoId;
    }

    const viewQuery = bvid ? `bvid=${bvid}` : `aid=${aid}`;
    let view: Record<string, unknown> = {};
    try {
      const j = await this.downloadJson(
        `https://api.bilibili.com/x/web-interface/view?${viewQuery}`,
        BILI_HEADERS,
      );
      view = (j.data as Record<string, unknown>) || {};
    } catch {
      /* webpage fallback */
    }

    if (!bvid && view.bvid) bvid = String(view.bvid);
    if (!aid && view.aid) aid = String(view.aid);

    // Legacy festival / old playlist id form
    if (!view.cid && /^\d+$/.test(videoId) && !bvid) {
      const pl = await this.extractOldPlaylist(videoId, bvid);
      if (pl) return pl;
    }

    const webpage =
      (await this._download_webpage(url, bvid || aid || videoId, 'Downloading Bilibili webpage', {
        headers: { ...BILI_HEADERS, 'User-Agent': BILI_UA },
        fatal: false,
      })) || '';

    if (!Object.keys(view).length && webpage) {
      const initial =
        extractJsonAssign(webpage, /window\.__INITIAL_STATE__\s*=/) ||
        extractJsonAssign(webpage, /__INITIAL_STATE__\s*=/);
      const videoData = (initial?.videoData || initial?.videoInfo || {}) as Record<
        string,
        unknown
      >;
      if (videoData.bvid || videoData.aid) view = videoData;
    }

    const pages = (view.pages as Page[]) || [];
    const title = String(view.title || bvid || aid || videoId);
    const owner = (view.owner || {}) as { name?: string; mid?: number };
    const stat = (view.stat || {}) as { view?: number; like?: number };
    const cid0 = Number(view.cid || pages[0]?.cid) || 0;

    const qs = new URL(url).searchParams;
    const pageParam = qs.get('p');
    const noplaylist = Boolean(this.params.noplaylist);

    // Multi-P → playlist of per-page URL results (upstream behavior)
    if (pages.length > 1 && !noplaylist && !pageParam) {
      const entries = pages.map((p) => {
        const partTitle = p.part || `P${p.page}`;
        const pageUrl = `https://www.bilibili.com/video/${bvid || `av${aid}`}?p=${p.page}`;
        return this.url_result(pageUrl, 'BiliBili', `${bvid || aid}_p${p.page}`, partTitle);
      });
      return this.playlist_result(entries, bvid || aid, title, String(view.desc || '') || null);
    }

    const pageNum = Math.max(1, parseInt(pageParam || '1', 10) || 1);
    const pageInfo = pages.find((p) => p.page === pageNum) || pages[0];
    const cid = Number(pageInfo?.cid || cid0) || 0;
    if (!cid) throw new ExtractorError('Unable to extract Bilibili cid', { expected: true });

    const qnList = [127, 126, 125, 120, 116, 112, 80, 64, 32, 16];
    let formats: Format[] = [];
    let lastStatus: number | undefined;
    // 预热 Cookie Hub，优先 WBI playurl
    try {
      const { syncBiliSessionFromHub } = await import('@/lib/download/bili/session');
      await syncBiliSessionFromHub();
    } catch {
      /* ignore */
    }
    for (const qn of qnList) {
      let playUrl =
        `https://api.bilibili.com/x/player/playurl?${bvid ? `bvid=${bvid}` : `avid=${aid}`}` +
        `&cid=${cid}&qn=${qn}&fnval=4048&fourk=1`;
      try {
        const { buildWbiUrl } = await import('@/lib/download/bili/wbi');
        const { getBiliCookieString } = await import('@/lib/download/bili/session');
        playUrl = await buildWbiUrl(
          'https://api.bilibili.com/x/player/wbi/playurl',
          {
            ...(bvid ? { bvid } : { avid: aid }),
            cid: String(cid),
            qn: String(qn),
            fnval: '4048',
            fourk: '1',
            fnver: '0',
          },
          getBiliCookieString() || undefined,
        );
      } catch {
        /* fall back to non-wbi URL above */
      }
      const r = await this.extractFormats(playUrl, bvid || aid);
      lastStatus = r.status;
      if (r.formats.length) {
        formats = r.formats;
        break;
      }
    }

    if (!formats.length && webpage) {
      const playurl =
        extractJsonAssign(webpage, /window\.__playinfo__\s*=/) ||
        extractJsonAssign(webpage, /__playinfo__\s*=/);
      if (playurl) {
        const { videoInfo } = unwrapNestedPlay(playurl);
        formats = parseBiliPlayFormats(videoInfo, BILI_HEADERS);
      }
    }

    if (!formats.length) {
      const hint =
        lastStatus === -404 || lastStatus === -403
          ? ' (may need login cookie or region unlock)'
          : '';
      throw new ExtractorError(`No Bilibili formats found${hint}`, { expected: true });
    }

    const part = pageInfo?.part;
    const fullTitle =
      pages.length > 1 && part ? `${title} - ${part}` : title;

    return {
      id: pages.length > 1 ? `${bvid || aid}_p${pageNum}` : bvid || aid || videoId,
      title: fullTitle,
      description: String(view.desc || '') || null,
      uploader: owner.name || null,
      uploader_id: owner.mid != null ? String(owner.mid) : null,
      duration: Number(pageInfo?.duration || view.duration) || null,
      view_count: Number(stat.view) || null,
      like_count: Number(stat.like) || null,
      thumbnail: String(view.pic || pageInfo?.first_frame || '') || null,
      timestamp: Number(view.pubdate) || null,
      webpage_url: url,
      extractor: 'BiliBili',
      extractor_key: 'BiliBili',
      formats,
      http_headers: BILI_HEADERS,
      _bilibili_pages: pages.map((p) => ({
        page: p.page,
        cid: p.cid,
        part: p.part || `P${p.page}`,
      })),
    };
  }
}
