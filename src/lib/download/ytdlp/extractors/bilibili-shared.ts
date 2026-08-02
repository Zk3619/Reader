/**
 * Shared Bilibili helpers (formats / headers / dash parse).
 */

import type { Format } from '../types';

export const BILI_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const BILI_HEADERS: Record<string, string> = {
  Referer: 'https://www.bilibili.com/',
  Origin: 'https://www.bilibili.com',
  'User-Agent': BILI_UA,
};

export const QN_NOTE: Record<number, string> = {
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

/** Best-effort Cookie Hub sync; returns the resolved bilibili Cookie header (empty on failure). */
export async function ensureBiliSession(): Promise<string> {
  try {
    const { syncBiliSessionFromHub, getBiliCookieString } = await import(
      '@/lib/download/bili/session'
    );
    await syncBiliSessionFromHub();
    return getBiliCookieString() || '';
  } catch {
    return '';
  }
}

export function getBiliCookieValue(cookieStr: string, name: string): string | null {
  const m = cookieStr.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1]! : null;
}

/** WBI-signs a query and appends it to `base`, falling back to a plain query string on failure. */
export async function signBiliWbiUrl(
  base: string,
  params: Record<string, string | number | undefined>,
): Promise<string> {
  const cookies = await ensureBiliSession();
  try {
    const { buildWbiUrl } = await import('@/lib/download/bili/wbi');
    return await buildWbiUrl(base, params, cookies || undefined);
  } catch {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return `${base}?${qs}`;
  }
}

export function extractJsonAssign(
  webpage: string,
  startRe: RegExp,
): Record<string, unknown> | null {
  const m = webpage.match(startRe);
  if (!m || m.index == null) return null;
  const start = webpage.indexOf('{', m.index);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < webpage.length && i < start + 2_000_000; i++) {
    const ch = webpage[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(webpage.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function unwrapNestedPlay(
  play: Record<string, unknown> | null | undefined,
): { status?: number; videoInfo: Record<string, unknown> } {
  if (!play) return { videoInfo: {} };
  let cur: Record<string, unknown> = play;
  let status =
    typeof cur.code === 'number' ? cur.code : undefined;
  if (cur.raw && typeof cur.raw === 'object') cur = cur.raw as Record<string, unknown>;
  if (cur.data && typeof cur.data === 'object') {
    cur = cur.data as Record<string, unknown>;
    if (status == null && typeof cur.code === 'number') status = cur.code;
  }
  if (cur.result && typeof cur.result === 'object') {
    cur = cur.result as Record<string, unknown>;
  }
  const videoInfo =
    cur.video_info && typeof cur.video_info === 'object'
      ? (cur.video_info as Record<string, unknown>)
      : cur;
  return { status, videoInfo };
}

export function parseBiliPlayFormats(
  videoInfo: Record<string, unknown>,
  headers: Record<string, string> = BILI_HEADERS,
): Format[] {
  const formats: Format[] = [];
  const dash = (videoInfo.dash || {}) as {
    video?: Array<Record<string, unknown>>;
    audio?: Array<Record<string, unknown>>;
  };
  for (const v of dash.video || []) {
    const u = String(v.baseUrl || v.base_url || '');
    if (!u) continue;
    const qn = Number(v.id) || 0;
    formats.push({
      format_id: `dash-video-${qn || formats.length}`,
      url: u,
      ext: 'mp4',
      protocol: 'https',
      format_note: QN_NOTE[qn] || `qn${qn}`,
      width: Number(v.width) || null,
      height: Number(v.height) || null,
      fps: Number(v.frameRate || v.frame_rate) || null,
      tbr: v.bandwidth ? Math.round(Number(v.bandwidth) / 1000) : null,
      vbr: v.bandwidth ? Math.round(Number(v.bandwidth) / 1000) : null,
      vcodec: String(v.codecs || 'avc1'),
      acodec: 'none',
      quality: qn,
      http_headers: headers,
    });
  }
  for (const a of dash.audio || []) {
    const u = String(a.baseUrl || a.base_url || '');
    if (!u) continue;
    formats.push({
      format_id: `dash-audio-${a.id || formats.length}`,
      url: u,
      ext: 'm4a',
      protocol: 'https',
      format_note: 'DASH audio',
      tbr: a.bandwidth ? Math.round(Number(a.bandwidth) / 1000) : null,
      abr: a.bandwidth ? Math.round(Number(a.bandwidth) / 1000) : null,
      vcodec: 'none',
      acodec: String(a.codecs || 'mp4a'),
      quality: Number(a.id) || 0,
      http_headers: headers,
    });
  }
  const durl = (videoInfo.durl as Array<Record<string, unknown>>) || [];
  for (const d of durl) {
    const u = String(d.url || '');
    if (!u) continue;
    const qn = Number(d.quality || videoInfo.quality) || 0;
    formats.push({
      format_id: `http-${qn}`,
      url: u,
      ext: 'flv',
      protocol: 'https',
      format_note: QN_NOTE[qn] || 'http',
      filesize: Number(d.size) || null,
      quality: qn,
      http_headers: headers,
    });
  }
  return formats;
}
