/**
 * yt-dlp utils 高频表面（TS 同构），供转译 IE 与手写 IE 共用。
 * 钉扎上游：Download/yt-dlp-master/yt_dlp/utils
 */

export type TraversePath =
  | string
  | number
  | null
  | undefined
  | RegExp
  | ((v: unknown) => unknown)
  | TraversePath[]
  | { [k: string]: TraversePath }
  | { optional?: boolean; get_all?: boolean; cases?: TraversePath; any?: TraversePath };

export function int_or_none(v: unknown, scale = 1, defaultValue: number | null = null): number | null {
  if (v == null || v === '') return defaultValue;
  if (typeof v === 'boolean') return defaultValue;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return defaultValue;
  return Math.trunc(n / scale);
}

export function float_or_none(v: unknown, scale = 1, defaultValue: number | null = null): number | null {
  if (v == null || v === '') return defaultValue;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return defaultValue;
  return n / scale;
}

export function str_or_none(v: unknown, defaultValue: string | null = null): string | null {
  if (v == null) return defaultValue;
  const s = String(v);
  return s.length ? s : defaultValue;
}

export function url_or_none(url: unknown, defaultValue: string | null = null): string | null {
  if (url == null) return defaultValue;
  const s = String(url).trim();
  if (!s) return defaultValue;
  if (/^https?:\/\//i.test(s) || s.startsWith('//')) {
    return s.startsWith('//') ? `https:${s}` : s;
  }
  return defaultValue;
}

export function try_get<T = unknown>(
  src: unknown,
  getter: ((o: any) => T) | Array<(o: any) => T>,
  expectedType?: (v: unknown) => boolean,
): T | null {
  const getters = Array.isArray(getter) ? getter : [getter];
  for (const g of getters) {
    try {
      const v = g(src as any);
      if (v == null) continue;
      if (expectedType && !expectedType(v)) continue;
      return v;
    } catch {
      /* continue */
    }
  }
  return null;
}

export function parse_qs(url: string): Record<string, string[]> {
  try {
    const u = new URL(url, 'https://example.invalid');
    const out: Record<string, string[]> = {};
    u.searchParams.forEach((val, key) => {
      if (!out[key]) out[key] = [];
      out[key]!.push(val);
    });
    return out;
  } catch {
    return {};
  }
}

export function update_url_query(
  url: string,
  query: Record<string, string | number | null | undefined | (string | number)[]>,
): string {
  const u = new URL(url, 'https://example.invalid');
  for (const [k, v] of Object.entries(query)) {
    if (v == null) {
      u.searchParams.delete(k);
      continue;
    }
    if (Array.isArray(v)) {
      u.searchParams.delete(k);
      for (const item of v) u.searchParams.append(k, String(item));
    } else {
      u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

export function unescapeHTML(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

export function clean_html(html: string | null | undefined): string | null {
  if (html == null) return null;
  return unescapeHTML(String(html).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function remove_start(s: string | null | undefined, start: string): string | null {
  if (s == null) return null;
  return s.startsWith(start) ? s.slice(start.length) : s;
}

export function remove_end(s: string | null | undefined, end: string): string | null {
  if (s == null) return null;
  return s.endsWith(end) ? s.slice(0, -end.length) : s;
}

export function truncate_string(s: string | null | undefined, length = 50): string | null {
  if (s == null) return null;
  if (s.length <= length) return s;
  return `${s.slice(0, Math.max(0, length - 3))}...`;
}

export function unified_strdate(dateStr: unknown): string | null {
  if (dateStr == null) return null;
  const s = String(dateStr);
  const m = s.match(/(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  return null;
}

export function unified_timestamp(dateStr: unknown): number | null {
  if (dateStr == null) return null;
  if (typeof dateStr === 'number' && Number.isFinite(dateStr)) {
    return dateStr > 1e12 ? Math.trunc(dateStr / 1000) : Math.trunc(dateStr);
  }
  const t = Date.parse(String(dateStr));
  return Number.isFinite(t) ? Math.trunc(t / 1000) : null;
}

export function parse_duration(s: unknown): number | null {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  const str = String(s).trim();
  if (!str) return null;
  if (/^\d+(\.\d+)?$/.test(str)) return Number(str);
  const hms = str.match(/^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/);
  if (hms) {
    const h = Number(hms[1] || 0);
    const m = Number(hms[2] || 0);
    const sec = Number(hms[3] || 0);
    return h * 3600 + m * 60 + sec;
  }
  let total = 0;
  const re = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|m|min|mins|s|sec|secs)/gi;
  let matched = false;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(str))) {
    matched = true;
    const n = Number(mm[1]);
    const u = mm[2]!.toLowerCase();
    if (u.startsWith('h')) total += n * 3600;
    else if (u.startsWith('m')) total += n * 60;
    else total += n;
  }
  return matched ? total : null;
}

export function parse_filesize(s: unknown): number | null {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  const m = String(s)
    .trim()
    .match(/^([\d.,]+)\s*([KMGTkmgt]?i?B)?$/);
  if (!m) return int_or_none(s);
  const n = Number(m[1]!.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || 'B').toUpperCase();
  const map: Record<string, number> = {
    B: 1,
    KB: 1e3,
    MB: 1e6,
    GB: 1e9,
    TB: 1e12,
    KIB: 1024,
    MIB: 1024 ** 2,
    GIB: 1024 ** 3,
    TIB: 1024 ** 4,
  };
  return Math.trunc(n * (map[unit] || 1));
}

export function parse_count(s: unknown): number | null {
  if (s == null) return null;
  if (typeof s === 'number') return Math.trunc(s);
  const str = String(s).trim().replace(/,/g, '');
  const m = str.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return int_or_none(str);
  let n = Number(m[1]);
  const u = (m[2] || '').toUpperCase();
  if (u === 'K') n *= 1e3;
  if (u === 'M') n *= 1e6;
  if (u === 'B') n *= 1e9;
  return Math.trunc(n);
}

export function js_to_json(src: string): string {
  // Minimal: strip trailing commas / single quotes → double (best-effort)
  return src
    .replace(/(['"])\s*:\s*'/g, '$1: "')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, s) => JSON.stringify(s))
    .replace(/,\s*([}\]])/g, '$1');
}

export function determine_ext(url: string | null | undefined, defaultExt = 'unknown'): string {
  if (!url) return defaultExt;
  try {
    const path = new URL(url, 'https://example.invalid').pathname;
    const m = path.match(/\.([a-z0-9]{1,5})$/i);
    if (m) return m[1]!.toLowerCase();
  } catch {
    /* ignore */
  }
  if (/\.m3u8($|\?)/i.test(url)) return 'mp4';
  return defaultExt;
}

export function mimetype2ext(mt: string | null | undefined): string | null {
  if (!mt) return null;
  const map: Record<string, string> = {
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/webm': 'webm',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'application/x-mpegurl': 'm3u8',
    'application/vnd.apple.mpegurl': 'm3u8',
    'application/dash+xml': 'mpd',
  };
  const base = mt.split(';')[0]!.trim().toLowerCase();
  return map[base] || base.split('/')[1] || null;
}

/** traverse_obj — 简化版，覆盖 yt-dlp 最常见 path 形态 */
export function traverse_obj(
  obj: unknown,
  path?: TraversePath | TraversePath[],
  opts?: {
    default?: unknown;
    expected_type?: ((v: unknown) => unknown) | string;
    get_all?: boolean;
    casesense?: boolean;
  },
): any {
  if (path == null) return obj;
  const paths = normalizePaths(path);
  const results: unknown[] = [];
  for (const p of paths) {
    const got = walk(obj, Array.isArray(p) ? p : [p], opts);
    if (opts?.get_all) {
      if (Array.isArray(got)) results.push(...got);
      else if (got !== undefined) results.push(got);
    } else if (got !== undefined && got !== null) {
      return applyExpected(got, opts?.expected_type);
    }
  }
  if (opts?.get_all) return results.map((r) => applyExpected(r, opts?.expected_type));
  return opts && 'default' in (opts || {}) ? opts!.default : undefined;
}

function normalizePaths(path: TraversePath | TraversePath[]): TraversePath[][] {
  if (!Array.isArray(path)) return [[path]];
  // [[a,b],[c,d]] vs [a,b]
  if (path.length && Array.isArray(path[0])) return path as TraversePath[][];
  return [path as TraversePath[]];
}

function walk(obj: unknown, path: TraversePath[], opts?: { casesense?: boolean }): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null) return undefined;
    if (key == null) continue;
    if (typeof key === 'function') {
      try {
        cur = key(cur);
      } catch {
        return undefined;
      }
      continue;
    }
    if (typeof key === 'number') {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[key];
      continue;
    }
    if (key instanceof RegExp) {
      if (Array.isArray(cur)) {
        cur = cur.filter((x) => key.test(String(x)));
      } else if (cur && typeof cur === 'object') {
        cur = Object.entries(cur as object)
          .filter(([k]) => key.test(k))
          .map(([, v]) => v);
      } else return undefined;
      continue;
    }
    if (typeof key === 'string') {
      if (Array.isArray(cur)) {
        cur = cur.map((item) =>
          item && typeof item === 'object' ? (item as any)[key] : undefined,
        );
        continue;
      }
      if (cur && typeof cur === 'object') {
        const rec = cur as Record<string, unknown>;
        if (opts?.casesense === false) {
          const found = Object.keys(rec).find((k) => k.toLowerCase() === key.toLowerCase());
          cur = found != null ? rec[found] : undefined;
        } else {
          cur = rec[key];
        }
        continue;
      }
      return undefined;
    }
    if (typeof key === 'object') {
      // special dict keys: optional / any / cases — best-effort
      const k = key as Record<string, unknown>;
      if ('any' in k) return walk(cur, normalizePaths(k.any as TraversePath).flat(), opts);
      if ('cases' in k) return walk(cur, normalizePaths(k.cases as TraversePath).flat(), opts);
    }
  }
  return cur;
}

function applyExpected(v: unknown, expected?: ((x: unknown) => unknown) | string): unknown {
  if (!expected) return v;
  if (typeof expected === 'function') {
    try {
      return expected(v);
    } catch {
      return undefined;
    }
  }
  return v;
}

export function dict_get(
  d: Record<string, unknown> | null | undefined,
  keys: string | string[],
  defaultValue: unknown = null,
  skipFalse = false,
): unknown {
  if (!d) return defaultValue;
  const list = Array.isArray(keys) ? keys : [keys];
  for (const k of list) {
    if (!(k in d)) continue;
    const v = d[k];
    if (v == null) continue;
    if (skipFalse && (v === false || v === 0 || v === '')) continue;
    return v;
  }
  return defaultValue;
}

export function merge_dicts(...dicts: Array<Record<string, unknown> | null | undefined>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const d of dicts) {
    if (!d) continue;
    for (const [k, v] of Object.entries(d)) {
      if (v == null) continue;
      if (!(k in out) || out[k] == null) out[k] = v;
    }
  }
  return out;
}

export function filter_dict(
  d: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!d) return out;
  for (const [k, v] of Object.entries(d)) {
    if (v != null) out[k] = v;
  }
  return out;
}

export function qual_smush(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join('');
}

export function join_nonempty(
  ...args: Array<string | null | undefined | false>
): string {
  return args.filter((x) => typeof x === 'string' && x.length).join(' ');
}

export function random_user_agent(): string {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

export function ExtractorError(message: string, opts?: { expected?: boolean }): Error {
  const e = new Error(message);
  e.name = 'ExtractorError';
  (e as Error & { expected?: boolean }).expected = opts?.expected ?? false;
  return e;
}

/** NO_DEFAULT sentinel for search helpers */
export const NO_DEFAULT = Symbol('no_default');

export function smuggle_url(url: string, data: Record<string, unknown>): string {
  const payload = encodeURIComponent(JSON.stringify(data));
  return `${url}#__youtubedl_smuggle=${payload}`;
}

export function unsmuggle_url(url: string, defaultData: Record<string, unknown> = {}): [string, Record<string, unknown>] {
  const m = url.match(/#__youtubedl_smuggle=(.+)$/);
  if (!m) return [url, defaultData];
  try {
    const data = JSON.parse(decodeURIComponent(m[1]!));
    return [url.replace(/#__youtubedl_smuggle=.+$/, ''), { ...defaultData, ...data }];
  } catch {
    return [url, defaultData];
  }
}

export function extract_attributes(htmlTag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(htmlTag))) {
    out[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

export function get_element_by_id(id: string, html: string): string | null {
  const re = new RegExp(
    `<([a-zA-Z0-9]+)([^>]*\\sid=["']${id}["'][^>]*)>([\\s\\S]*?)<\\/\\1>`,
    'i',
  );
  const m = html.match(re);
  return m?.[3] ?? null;
}

export function get_element_by_class(cls: string, html: string): string | null {
  const re = new RegExp(
    `<([a-zA-Z0-9]+)([^>]*\\sclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*)>([\\s\\S]*?)<\\/\\1>`,
    'i',
  );
  const m = html.match(re);
  return m?.[3] ?? null;
}

export function get_elements_by_class(cls: string, html: string): string[] {
  const re = new RegExp(
    `<([a-zA-Z0-9]+)([^>]*\\sclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*)>([\\s\\S]*?)<\\/\\1>`,
    'gi',
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[3] || '');
  return out;
}

export function parse_codecs(codecsStr: string | null | undefined): { vcodec?: string; acodec?: string } {
  if (!codecsStr) return {};
  const parts = codecsStr.split(',').map((s) => s.trim());
  let vcodec: string | undefined;
  let acodec: string | undefined;
  for (const p of parts) {
    const base = p.split('.')[0]!.toLowerCase();
    if (/^(avc|hev|hvc|vp9|vp09|av01|av1)/.test(base)) vcodec = p;
    else if (/^(mp4a|opus|vorbis|aac|flac|ac-3|ec-3)/.test(base)) acodec = p;
  }
  return { vcodec, acodec };
}

export function str_to_int(v: unknown): number | null {
  return int_or_none(typeof v === 'string' ? v.replace(/[^\d.-]/g, '') : v);
}

export function bool_or_none(v: unknown): boolean | null {
  if (v == null) return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return null;
}

export function list_or_none(v: unknown): unknown[] | null {
  if (v == null) return null;
  return Array.isArray(v) ? v : null;
}

export { sanitize_filename, sanitize_path_segment } from './sanitize-filename';
