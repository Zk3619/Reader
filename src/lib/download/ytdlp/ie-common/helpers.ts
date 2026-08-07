/**
 * IE common scalar helpers + hooks — yt-dlp extractor/common.py subset.
 */

import type { Format, Subtitle, VideoInfo } from '../types';
import { float_or_none, int_or_none } from '../utils';

export class IeHelperError extends Error {
  expected: boolean;
  constructor(message: string, expected = true) {
    super(message);
    this.name = 'IeHelperError';
    this.expected = expected;
  }
}

export function ieInt(
  ie: { report_warning: (m: string) => void },
  v: unknown,
  name: string,
  fatal = false,
  kwargs?: { scale?: number; default?: number | null },
): number | null {
  const n = int_or_none(v, kwargs?.scale ?? 1, kwargs?.default ?? null);
  if (n == null && v != null && v !== '') {
    const msg = `Unable to extract ${name}`;
    if (fatal) throw new IeHelperError(msg, true);
    ie.report_warning(msg);
  }
  return n;
}

export function ieFloat(
  ie: { report_warning: (m: string) => void },
  v: unknown,
  name: string,
  fatal = false,
  kwargs?: { scale?: number; default?: number | null },
): number | null {
  const n = float_or_none(v, kwargs?.scale ?? 1, kwargs?.default ?? null);
  if (n == null && v != null && v !== '') {
    const msg = `Unable to extract ${name}`;
    if (fatal) throw new IeHelperError(msg, true);
    ie.report_warning(msg);
  }
  return n;
}

export function mergeSubtitleItems(
  a: Subtitle[] | undefined,
  b: Subtitle[] | undefined,
): Subtitle[] {
  const out = [...(a || [])];
  for (const item of b || []) {
    if (!out.some((x) => x.url === item.url && x.data === item.data && x.ext === item.ext)) {
      out.push(item);
    }
  }
  return out;
}

export function availabilityFromFlags(opts: {
  is_private?: boolean | null;
  needs_premium?: boolean | null;
  needs_subscription?: boolean | null;
  needs_auth?: boolean | null;
  is_unlisted?: boolean | null;
}): string | null {
  if (opts.is_private) return 'private';
  if (opts.needs_premium) return 'premium_only';
  if (opts.needs_subscription) return 'subscriber_only';
  if (opts.needs_auth) return 'needs_auth';
  if (opts.is_unlisted) return 'unlisted';
  return 'public';
}

export function genericTitleFrom(
  url = '',
  webpage = '',
  defaultValue: string | null = null,
): string | null {
  const og =
    /property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(webpage)?.[1] ||
    /content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(webpage)?.[1];
  if (og) return og;
  const title = /<title[^>]*>([^<]+)<\/title>/i.exec(webpage)?.[1]?.trim();
  if (title) return title;
  try {
    const u = new URL(url);
    const base = u.pathname.split('/').filter(Boolean).pop();
    if (base) return decodeURIComponent(base.replace(/\.[a-z0-9]+$/i, ''));
  } catch {
    /* ignore */
  }
  return defaultValue;
}

export function isValidUrlShape(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'ftp:';
  } catch {
    return false;
  }
}

export function m3u8MetaFormat(
  m3u8Url: string,
  ext?: string,
  preference?: number | null,
  quality?: number | null,
  m3u8Id?: string,
): Format {
  return {
    format_id: m3u8Id || 'meta',
    url: m3u8Url,
    ext: ext || 'mp4',
    protocol: 'm3u8_native',
    preference: preference ?? -1,
    quality: quality ?? null,
    format_note: 'Quality selection metadata',
  };
}

export function parseM3u8VodDuration(m3u8Doc: string): number | null {
  if (!/#EXT-X-ENDLIST/i.test(m3u8Doc)) return null;
  let total = 0;
  for (const line of m3u8Doc.split(/\r?\n/)) {
    const m = /^#EXTINF:([\d.]+)/i.exec(line.trim());
    if (m) total += Number(m[1]) || 0;
  }
  return total > 0 ? total : null;
}

export function extractEmbedUrls(
  pageUrl: string | null | undefined,
  webpage: string,
  embedRegexes: Array<string | RegExp> = [],
): string[] {
  const out: string[] = [];
  const defaultRes = [
    /<(?:iframe|embed)[^>]+src=["'](?<url>[^"']+)["']/gi,
    /data-src=["'](?<url>https?:\/\/[^"']+)["']/gi,
  ];
  const res = embedRegexes.length
    ? embedRegexes.map((r) => (typeof r === 'string' ? new RegExp(r, 'gi') : r))
    : defaultRes;
  for (const re of res) {
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
    const g = new RegExp(re.source, flags);
    let m: RegExpExecArray | null;
    while ((m = g.exec(webpage))) {
      const raw = (m.groups?.url || m[1] || '').trim();
      if (!raw) continue;
      try {
        const abs = pageUrl ? new URL(raw, pageUrl).toString() : new URL(raw).toString();
        if (!out.includes(abs)) out.push(abs);
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

export function emptyComments(): AsyncGenerator<Record<string, unknown>, void, unknown> {
  return (async function* () {
    /* no comments by default */
  })();
}

export function urlResultStub(
  url: string,
  ieKey?: string,
  videoId?: string,
  videoTitle?: string,
): VideoInfo {
  return {
    _type: 'url',
    id: videoId || url,
    url,
    title: videoTitle,
    ie_key: ieKey,
    extractor: ieKey,
    extractor_key: ieKey,
  } as VideoInfo;
}
