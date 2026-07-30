/**
 * BiliBiliIE — BV / av pages via public bilibili APIs (cookie-aware).
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';

interface ViewData {
  bvid?: string;
  aid?: number;
  title?: string;
  desc?: string;
  pic?: string;
  duration?: number;
  owner?: { mid?: number; name?: string };
  stat?: { view?: number; like?: number; reply?: number };
  pages?: Array<{ cid: number; page: number; part: string; duration?: number }>;
  cid?: number;
}

interface PlayUrlDash {
  video?: Array<DashItem>;
  audio?: Array<DashItem>;
}

interface DashItem {
  id?: number;
  baseUrl?: string;
  base_url?: string;
  bandwidth?: number;
  mimeType?: string;
  mime_type?: string;
  codecs?: string;
  width?: number;
  height?: number;
  frameRate?: string;
  frame_rate?: string;
  codecid?: number;
}

const QN_NOTE: Record<number, string> = {
  16: '360P',
  32: '480P',
  64: '720P',
  74: '720P60',
  80: '1080P',
  112: '1080P+',
  116: '1080P60',
  120: '4K',
  125: 'HDR',
  126: 'Dolby Vision',
  127: '8K',
};

export class BilibiliIE extends InfoExtractor {
  static IE_NAME = 'bilibili';
  static IE_DESC = 'Bilibili';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?bilibili\.com\/(?:video\/|festival\/[^/?#]+\?(?:[^#]*&)?bvid=)(?<prefix>[aAbB][vV])(?<id>[^/?#&]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    if (!m) throw new ExtractorError('Invalid bilibili URL', { expected: true });
    const prefix = (m.groups?.prefix || m[1] || 'BV').toUpperCase();
    let id = m.groups?.id || m[2] || '';
    // Normalize av numeric
    const isAv = prefix === 'AV';
    const page = Number(new URL(url).searchParams.get('p') || 1) || 1;

    const headers = {
      Referer: 'https://www.bilibili.com/',
      Origin: 'https://www.bilibili.com',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    const viewQuery: Record<string, string> = isAv
      ? { aid: id.replace(/^av/i, '') }
      : {
          bvid:
            prefix === 'BV'
              ? `BV${id.replace(/^BV/i, '')}`
              : `${prefix}${id}`,
        };

    // Ensure BV id form
    if (!isAv && !String(viewQuery.bvid).startsWith('BV')) {
      viewQuery.bvid = `BV${id}`;
    }

    const viewJson = await this._download_json<{ code: number; message?: string; data?: ViewData }>(
      'https://api.bilibili.com/x/web-interface/view',
      id,
      'Downloading video metadata',
      { query: viewQuery, headers, fatal: true },
    );

    if (viewJson.code !== 0 || !viewJson.data) {
      throw new ExtractorError(
        `Bilibili API error: ${viewJson.message || viewJson.code}`,
        { expected: true },
      );
    }

    const data = viewJson.data;
    const bvid = data.bvid || (isAv ? String(data.aid) : `BV${id}`);
    const pages = data.pages || [];
    const pageInfo = pages.find((p) => p.page === page) || pages[0];
    const cid = pageInfo?.cid || data.cid;
    if (!cid) throw new ExtractorError('Unable to extract cid', { expected: true });

    const aid = String(data.aid || '');
    const playJson = await this._download_json<{
      code: number;
      message?: string;
      data?: {
        dash?: PlayUrlDash;
        durl?: Array<{ url: string; quality?: number; size?: number }>;
        quality?: number;
        accept_quality?: number[];
      };
    }>(
      'https://api.bilibili.com/x/player/playurl',
      bvid,
      'Downloading playurl',
      {
        query: {
          bvid,
          cid: String(cid),
          qn: '127',
          fnval: '4048',
          fourk: '1',
        },
        headers,
        fatal: true,
      },
    );

    if (playJson.code !== 0 || !playJson.data) {
      throw new ExtractorError(
        `Bilibili playurl error: ${playJson.message || playJson.code}`,
        { expected: true },
      );
    }

    const formats: Format[] = [];
    const dash = playJson.data.dash;
    if (dash) {
      for (const v of dash.video || []) {
        const u = v.baseUrl || v.base_url;
        if (!u) continue;
        const qn = v.id || 0;
        formats.push({
          format_id: `dash-video-${qn}`,
          url: u,
          ext: 'mp4',
          protocol: 'https',
          format_note: QN_NOTE[qn] || `qn${qn}`,
          width: v.width || null,
          height: v.height || null,
          fps: Number(v.frameRate || v.frame_rate) || null,
          tbr: v.bandwidth ? Math.round(v.bandwidth / 1000) : null,
          vbr: v.bandwidth ? Math.round(v.bandwidth / 1000) : null,
          vcodec: v.codecs || 'avc1',
          acodec: 'none',
          quality: qn,
          http_headers: headers,
        });
      }
      for (const a of dash.audio || []) {
        const u = a.baseUrl || a.base_url;
        if (!u) continue;
        formats.push({
          format_id: `dash-audio-${a.id || formats.length}`,
          url: u,
          ext: 'm4a',
          protocol: 'https',
          format_note: 'DASH audio',
          tbr: a.bandwidth ? Math.round(a.bandwidth / 1000) : null,
          abr: a.bandwidth ? Math.round(a.bandwidth / 1000) : null,
          vcodec: 'none',
          acodec: a.codecs || 'mp4a',
          quality: a.id || 0,
          http_headers: headers,
        });
      }
    }

    for (const d of playJson.data.durl || []) {
      formats.push({
        format_id: `http-${d.quality || playJson.data.quality || 0}`,
        url: d.url,
        ext: 'flv',
        protocol: 'https',
        format_note: QN_NOTE[d.quality || 0] || 'http',
        filesize: d.size || null,
        quality: d.quality || playJson.data.quality || 0,
        http_headers: headers,
      });
    }

    if (!formats.length) {
      throw new ExtractorError('No bilibili formats found (login/cookie may be required for HQ)', {
        expected: true,
      });
    }

    const titleBase = data.title || bvid;
    const title =
      pages.length > 1 && pageInfo?.part
        ? `${titleBase} p${String(page).padStart(2, '0')} ${pageInfo.part}`
        : titleBase;

    const videoId = pages.length > 1 ? `${bvid}_p${page}` : bvid;

    return {
      id: videoId,
      title,
      description: data.desc || null,
      uploader: data.owner?.name || null,
      uploader_id: data.owner?.mid != null ? String(data.owner.mid) : null,
      duration: pageInfo?.duration || data.duration || null,
      view_count: data.stat?.view ?? null,
      like_count: data.stat?.like ?? null,
      comment_count: data.stat?.reply ?? null,
      thumbnail: data.pic || null,
      thumbnails: data.pic ? [{ url: data.pic }] : undefined,
      webpage_url: `https://www.bilibili.com/video/${bvid}${page > 1 ? `?p=${page}` : ''}`,
      original_url: url,
      formats,
      extractor: 'bilibili',
      extractor_key: 'BiliBili',
      http_headers: headers,
      tags: null,
      // Extra for multi-part discovery
      ...(pages.length > 1
        ? {
            _bilibili_pages: pages.map((p) => ({
              page: p.page,
              cid: p.cid,
              part: p.part,
              url: `https://www.bilibili.com/video/${bvid}?p=${p.page}`,
            })),
          }
        : {}),
      aid,
      cid: String(cid),
      bvid,
    };
  }
}
