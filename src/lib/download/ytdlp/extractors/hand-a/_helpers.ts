/** Shared helpers for hand-a extractors (yt-dlp utils surface). */

import type { InfoExtractor } from '../../common';
import type { Format, Subtitle } from '../../types';

export function urlencodePostdata(data: Record<string, string | number | boolean>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) params.set(k, String(v));
  return params.toString();
}

export function urljoin(base: string, path: string): string {
  try {
    return new URL(path, base).toString();
  } catch {
    return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }
}

export function parseIso8601(
  dateStr: unknown,
  opts?: { delimiter?: string; timezoneHours?: number },
): number | null {
  if (dateStr == null) return null;
  const s = String(dateStr).trim();
  if (!s) return null;
  const delim = opts?.delimiter ?? 'T';
  const tzHours = opts?.timezoneHours ?? 0;
  const normalized = delim === ' '
    ? s.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/, '$1T$2')
    : s;
  const withTz =
    /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) || tzHours === 0
      ? normalized
      : `${normalized}+${String(Math.abs(tzHours)).padStart(2, '0')}:00`;
  const t = Date.parse(withTz);
  return Number.isFinite(t) ? Math.trunc(t / 1000) : null;
}

const PL_MONTHS: Record<string, number> = {
  stycznia: 1,
  lutego: 2,
  marca: 3,
  kwietnia: 4,
  maja: 5,
  czerwca: 6,
  lipca: 7,
  sierpnia: 8,
  września: 9,
  wrzesnia: 9,
  października: 10,
  pazdziernika: 10,
  listopada: 11,
  grudnia: 12,
};

export function monthByName(name: string | null | undefined, lang = 'pl'): number | null {
  if (!name) return null;
  if (lang === 'pl') return PL_MONTHS[name.toLowerCase()] ?? null;
  return null;
}

export function jwtDecodePayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) return {};
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(json) as Record<string, unknown>;
}

export function jwtIsExpired(token: string, skewSec = 120): boolean {
  const exp = jwtDecodePayload(token).exp;
  if (typeof exp !== 'number') return true;
  return exp - Date.now() / 1000 < skewSec;
}

export function orderedSet<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function qualityRank(order: string[]): (id: string) => number {
  const map = new Map(order.map((q, i) => [q, i]));
  return (id: string) => map.get(id) ?? -1;
}

export function urlBasename(u: string): string {
  try {
    const path = new URL(u, 'https://example.invalid').pathname;
    return path.split('/').filter(Boolean).pop() || u;
  } catch {
    return u.split('/').pop() || u;
  }
}

export function stripOrNone(s: unknown): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t.length ? t : null;
}

export function htmlExtractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1] ? stripOrNone(m[1].replace(/<[^>]+>/g, '')) : null;
}

export function searchNextjsData(
  ie: InfoExtractor,
  webpage: string,
  videoId: string,
): Record<string, unknown> {
  const raw = ie._search_regex(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    webpage,
    'next.js data',
    null,
    true,
    1,
  );
  const parsed = ie._parse_json<Record<string, unknown>>(raw, videoId);
  return (parsed?.props as Record<string, unknown>) || {};
}

export function mergeSubtitles(
  target: Record<string, Subtitle[]>,
  source: Record<string, Subtitle[]> | undefined,
): Record<string, Subtitle[]> {
  if (!source) return target;
  for (const [lang, subs] of Object.entries(source)) {
    if (!target[lang]) target[lang] = [];
    target[lang]!.push(...subs);
  }
  return target;
}

function strToHex(s: string): string {
  return [...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function signTheplatformUrl(
  url: string,
  sigKey: string,
  sigSecret: string,
  life = 600,
): Promise<string> {
  const flags = '00';
  const expirationDate = Math.floor(Date.now() / 1000 + life).toString(16);
  const m = url.match(/https?:\/\/link\.theplatform\.com\/s\/([^?]+)/i);
  if (!m?.[1]) return url;
  const clearHex = flags + expirationDate + strToHex(m[1]);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(sigKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, hexToBytes(clearHex));
  const checksum = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${url}&sig=${flags}${expirationDate}${checksum}${strToHex(sigSecret)}`;
}

export function extractSmilMediaUrls(smilXml: string): string[] {
  const urls: string[] = [];
  for (const m of smilXml.matchAll(/\bsrc=["']([^"']+)["']/gi)) {
    const u = m[1]?.replace(/&amp;/g, '&');
    if (u && /^https?:\/\//i.test(u)) urls.push(u);
  }
  return urls;
}

export async function extractM3u8FormatsAndSubtitles(
  ie: InfoExtractor,
  m3u8Url: string,
  videoId: string,
  m3u8Id = 'hls',
): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
  const formats = await ie._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, m3u8Id);
  return { formats, subtitles: {} };
}

export class UserNotLive extends Error {
  video_id: string;
  constructor(video_id: string) {
    super(`${video_id} is not live`);
    this.name = 'UserNotLive';
    this.video_id = video_id;
  }
}
