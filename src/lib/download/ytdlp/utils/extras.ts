/**
 * High-frequency utils missing from index — yt-dlp `_utils.py` subset.
 */

export function variadic<T>(x: T | T[] | null | undefined, allowed: unknown[] = []): T[] {
  if (x == null) return [];
  if (allowed.length && allowed.includes(x as unknown)) return [x as T];
  return Array.isArray(x) ? (x as T[]) : [x as T];
}

export function try_call<T>(...fns: Array<() => T | null | undefined>): T | null {
  for (const fn of fns) {
    try {
      const v = fn();
      if (v !== undefined && v !== null) return v;
    } catch {
      /* continue */
    }
  }
  return null;
}

export function urljoin(base: string, path: string | null | undefined): string | null {
  if (path == null || path === '') return null;
  try {
    return new URL(path, base).toString();
  } catch {
    return path;
  }
}

export function urlencode_postdata(
  data: Record<string, string | number | boolean | null | undefined>,
): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v == null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join('&');
}

export function url_basename(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url, 'https://example.invalid');
    const seg = u.pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(seg);
  } catch {
    const seg = String(url).split(/[?#]/)[0]!.split('/').filter(Boolean).pop() || '';
    return seg;
  }
}

export function update_url(url: string, opts: { query?: Record<string, string>; path?: string } = {}): string {
  try {
    const u = new URL(url);
    if (opts.path != null) u.pathname = opts.path;
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) u.searchParams.set(k, v);
    }
    return u.toString();
  } catch {
    return url;
  }
}

export function sanitize_url(url: string | null | undefined, scheme = 'https'): string | null {
  if (url == null) return null;
  let s = String(url).trim();
  if (!s) return null;
  if (s.startsWith('//')) s = `${scheme}:${s}`;
  if (!/^[a-zA-Z][\w+.-]*:/.test(s)) s = `${scheme}://${s}`;
  return s;
}

export function strip_or_none(v: unknown, defaultValue: string | null = null): string | null {
  if (v == null) return defaultValue;
  const s = String(v).trim();
  return s.length ? s : defaultValue;
}

export function trim_str(v: unknown): string | null {
  return strip_or_none(v, null);
}

export function strip_jsonp(code: string): string {
  const s = String(code || '').trim();
  const m =
    /^[a-zA-Z_$][\w$]*\s*\(([\s\S]*)\)\s*;?\s*$/.exec(s) ||
    /^[\w$.]+\s*&&\s*[\w$.]+\s*\(([\s\S]*)\)\s*;?\s*$/.exec(s);
  return m?.[1]?.trim() || s;
}

export function qualities(qualityIds: Array<string | number>): (qid: string | number) => number {
  const map = new Map<string, number>();
  qualityIds.forEach((q, i) => map.set(String(q), i));
  return (qid) => map.get(String(qid)) ?? -1;
}

export function format_field(
  obj: Record<string, unknown> | null | undefined,
  field: string | null | undefined,
  template = '%s',
  defaultValue = '',
): string {
  if (!obj || field == null) return defaultValue;
  const v = obj[field];
  if (v == null || v === '') return defaultValue;
  return template.includes('%s') ? template.replace(/%s/g, String(v)) : String(v);
}

export function parse_iso8601(dateStr: unknown, delimiter = 'T'): number | null {
  if (dateStr == null || dateStr === '') return null;
  const s = String(dateStr).trim();
  // Normalize space delimiter
  const norm = delimiter === ' ' ? s.replace(' ', 'T') : s;
  const t = Date.parse(norm);
  if (!Number.isFinite(t)) return null;
  return Math.floor(t / 1000);
}

export function strftime_or_none(timestamp: unknown, format = '%Y%m%d', defaultValue: string | null = null): string | null {
  const sec =
    typeof timestamp === 'number'
      ? timestamp > 1e12
        ? Math.floor(timestamp / 1000)
        : timestamp
      : Number(timestamp);
  if (!Number.isFinite(sec)) return defaultValue;
  const d = new Date(sec * 1000);
  if (Number.isNaN(d.getTime())) return defaultValue;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const map: Record<string, string> = {
    '%Y': String(d.getUTCFullYear()),
    '%m': pad(d.getUTCMonth() + 1),
    '%d': pad(d.getUTCDate()),
    '%H': pad(d.getUTCHours()),
    '%M': pad(d.getUTCMinutes()),
    '%S': pad(d.getUTCSeconds()),
  };
  let out = format;
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(v);
  return out;
}

export function time_seconds(...args: number[]): number {
  // time_seconds(h, m, s) or time_seconds(s)
  if (args.length === 1) return args[0] || 0;
  if (args.length === 2) return (args[0] || 0) * 60 + (args[1] || 0);
  return (args[0] || 0) * 3600 + (args[1] || 0) * 60 + (args[2] || 0);
}

export function srt_subtitles_timecode(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s - h * 3600 - m * 60;
  const whole = Math.floor(rest);
  const ms = Math.round((rest - whole) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(whole)},${pad(ms, 3)}`;
}

export function fix_xml_ampersands(xml: string): string {
  return String(xml).replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);)/gi, '&amp;');
}

export function jwt_decode_hs256(token: string): Record<string, unknown> | null {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const payload = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const pad = payload.length % 4 === 0 ? '' : '='.repeat(4 - (payload.length % 4));
    const json = atob(payload + pad);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function make_archive_id(ieKey: string, videoId: string): string {
  return `${String(ieKey).toLowerCase()} ${videoId}`;
}

export function urlhandle_detect_ext(
  url: string,
  defaultExt = 'unknown',
  headers?: Record<string, string>,
): string {
  const cd = headers?.['content-disposition'] || headers?.['Content-Disposition'];
  if (cd) {
    const m = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
    if (m?.[1]) {
      const name = decodeURIComponent(m[1].replace(/"/g, ''));
      const ext = name.split('.').pop();
      if (ext && ext.length <= 5) return ext.toLowerCase();
    }
  }
  const ct = (headers?.['content-type'] || headers?.['Content-Type'] || '').split(';')[0]!.trim().toLowerCase();
  const mimeMap: Record<string, string> = {
    'video/mp4': 'mp4',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'application/x-mpegurl': 'm3u8',
    'application/vnd.apple.mpegurl': 'm3u8',
    'application/dash+xml': 'mpd',
  };
  if (ct && mimeMap[ct]) return mimeMap[ct]!;
  return detect_ext_from_url(url, defaultExt);
}

/** Avoid circular require — inline mimetype peek for urlhandle */
export function detect_ext_from_url(url: string, defaultExt = 'unknown'): string {
  try {
    const path = new URL(url).pathname;
    const m = /\.([a-z0-9]{2,5})$/i.exec(path);
    if (m) return m[1]!.toLowerCase();
  } catch {
    /* ignore */
  }
  return defaultExt;
}

export const ISO639Utils = {
  short2full(code: string | null | undefined): string | null {
    if (!code) return null;
    const c = code.toLowerCase();
    const map: Record<string, string> = {
      en: 'eng',
      zh: 'zho',
      ja: 'jpn',
      ko: 'kor',
      fr: 'fra',
      de: 'deu',
      es: 'spa',
      ru: 'rus',
      pt: 'por',
      it: 'ita',
    };
    return map[c] || (c.length === 3 ? c : null);
  },
  full2short(code: string | null | undefined): string | null {
    if (!code) return null;
    const c = code.toLowerCase();
    const map: Record<string, string> = {
      eng: 'en',
      zho: 'zh',
      chi: 'zh',
      jpn: 'ja',
      kor: 'ko',
      fra: 'fr',
      fre: 'fr',
      deu: 'de',
      ger: 'de',
      spa: 'es',
      rus: 'ru',
      por: 'pt',
      ita: 'it',
    };
    return map[c] || (c.length === 2 ? c : null);
  },
};

export class ExtractorErrorUtil extends Error {
  expected: boolean;
  constructor(message: string, opts?: { expected?: boolean }) {
    super(message);
    this.name = 'ExtractorError';
    this.expected = opts?.expected ?? false;
  }
}

export class GeoRestrictedError extends ExtractorErrorUtil {
  countries: string[];
  constructor(message: string, countries: string[] = []) {
    super(message, { expected: true });
    this.name = 'GeoRestrictedError';
    this.countries = countries;
  }
}

export class UserNotLive extends ExtractorErrorUtil {
  constructor(message = 'User is offline') {
    super(message, { expected: true });
    this.name = 'UserNotLive';
  }
}

export class UnsupportedError extends ExtractorErrorUtil {
  constructor(message: string) {
    super(message, { expected: true });
    this.name = 'UnsupportedError';
  }
}
