/**
 * Format sorting similar to yt-dlp `-S` / `format_sort`.
 * @see https://github.com/yt-dlp/yt-dlp#sorting-formats
 */

import type { Format } from './types';

export type SortField =
  | 'quality'
  | 'res'
  | 'fps'
  | 'hdr'
  | 'source'
  | 'codec'
  | 'vext'
  | 'aext'
  | 'lang'
  | 'proto'
  | 'ext'
  | 'hasaud'
  | 'hasvid'
  | 'size'
  | 'br'
  | 'tbr'
  | 'vbr'
  | 'abr'
  | 'asr'
  | 'filesize'
  | 'filesize_approx'
  | 'preference'
  | 'format_id'
  | string;

const DEFAULT_SORT: SortField[] = [
  // extractor 显式 preference（如 TED 渐进式 h264）优先于分辨率，避免 HLS 盖过直链 MP4
  'preference',
  'quality',
  'res',
  'fps',
  'hdr:12',
  'source',
  'vcodec',
  'channels',
  'acodec',
  'lang',
  'proto',
];

function parseSortToken(token: string): { field: string; order: 1 | -1; limit?: number } {
  let t = token.trim();
  let order: 1 | -1 = 1;
  if (t.startsWith('+')) {
    order = 1;
    t = t.slice(1);
  } else if (t.startsWith('-')) {
    order = -1;
    t = t.slice(1);
  }
  // field:limit e.g. res:720 / hdr:12
  const m = t.match(/^([^:]+)(?::(.+))?$/);
  const field = m?.[1] || t;
  const limitRaw = m?.[2];
  const limit = limitRaw != null && /^-?\d+(\.\d+)?$/.test(limitRaw) ? Number(limitRaw) : undefined;
  return { field, order, limit };
}

function hasVideo(f: Format): boolean {
  return !!(f.vcodec && f.vcodec !== 'none') || !!(f.height || f.width);
}

function hasAudio(f: Format): boolean {
  if (f.acodec === 'none') return false;
  if (f.acodec) return true;
  if (f.vcodec === 'none') return true;
  return !!(f.abr || f.asr);
}

function codecRank(codec: string | null | undefined, preferOrder: string[]): number {
  if (!codec || codec === 'none') return -1;
  const c = codec.toLowerCase().split('.')[0]!;
  const idx = preferOrder.findIndex((p) => c.includes(p));
  return idx >= 0 ? preferOrder.length - idx : 0;
}

function fieldValue(f: Format, field: string): number | string | null {
  switch (field) {
    case 'quality':
      return f.quality ?? null;
    case 'preference':
      return f.preference ?? null;
    case 'res':
    case 'height':
      return f.height ?? null;
    case 'width':
      return f.width ?? null;
    case 'fps':
      return f.fps ?? null;
    case 'hdr': {
      const dr = (f.dynamic_range || '').toUpperCase();
      if (dr.includes('DV') || dr.includes('DOLBY')) return 10;
      if (dr.includes('HDR10+') || dr.includes('HDR10PLUS')) return 8;
      if (dr.includes('HDR')) return 6;
      if (dr.includes('HLG')) return 5;
      return 0;
    }
    case 'source':
      return f.source_preference ?? null;
    case 'codec':
    case 'vcodec':
      return codecRank(f.vcodec, ['av01', 'vp9.2', 'vp9', 'hev1', 'hvc1', 'avc1', 'avc', 'vp8']);
    case 'acodec':
      return codecRank(f.acodec, ['opus', 'vorbis', 'mp4a', 'aac', 'mp3', 'ac-3', 'eac3']);
    case 'vext':
      return f.video_ext || f.ext || null;
    case 'aext':
      return f.audio_ext || (!hasVideo(f) ? f.ext : null) || null;
    case 'ext':
      return f.ext || null;
    case 'lang':
    case 'language':
      return f.language_preference ?? (f.language ? 1 : 0);
    case 'proto':
    case 'protocol': {
      const p = (f.protocol || '').toLowerCase();
      if (p === 'https' || p === 'http') return 10;
      if (p.includes('m3u8')) return 5;
      if (p.includes('dash')) return 4;
      return 0;
    }
    case 'hasaud':
      return hasAudio(f) ? 1 : 0;
    case 'hasvid':
      return hasVideo(f) ? 1 : 0;
    case 'size':
    case 'filesize':
      return f.filesize ?? f.filesize_approx ?? null;
    case 'filesize_approx':
      return f.filesize_approx ?? f.filesize ?? null;
    case 'br':
    case 'tbr':
      return f.tbr ?? ((f.vbr ?? 0) + (f.abr ?? 0) || null);
    case 'vbr':
      return f.vbr ?? null;
    case 'abr':
      return f.abr ?? null;
    case 'asr':
      return f.asr ?? null;
    case 'channels':
      return (f as { audio_channels?: number }).audio_channels ?? null;
    case 'format_id':
      return f.format_id ?? null;
    default:
      return (f as Record<string, unknown>)[field] as number | string | null;
  }
}

function cmpNullable(
  a: number | string | null,
  b: number | string | null,
  order: 1 | -1,
  limit?: number,
): number {
  const missing = (v: number | string | null) => v == null || v === '';
  if (missing(a) && missing(b)) return 0;
  // Prefer present values
  if (missing(a)) return 1;
  if (missing(b)) return -1;

  if (typeof a === 'number' && typeof b === 'number') {
    let av = a;
    let bv = b;
    if (limit != null) {
      // Closest to limit without exceeding (yt-dlp style soft limit)
      const score = (v: number) => (v <= limit ? v : limit - (v - limit));
      av = score(a);
      bv = score(b);
    }
    return (bv - av) * order;
  }
  return String(b).localeCompare(String(a)) * order;
}

export function parseFormatSort(sort?: string[] | string | null): ReturnType<typeof parseSortToken>[] {
  if (!sort) return DEFAULT_SORT.map(parseSortToken);
  const tokens = Array.isArray(sort)
    ? sort.flatMap((s) => s.split(/[,\s]+/)).filter(Boolean)
    : sort.split(/[,\s]+/).filter(Boolean);
  if (!tokens.length) return DEFAULT_SORT.map(parseSortToken);
  return tokens.map(parseSortToken);
}

/**
 * Sort formats in-place (and return) using yt-dlp-like keys.
 * Higher / better formats come first.
 */
export function sortFormats(
  formats: Format[],
  sort?: string[] | string | null,
  force = false,
): Format[] {
  const keys = parseFormatSort(sort);
  const defaultKeys = DEFAULT_SORT.map(parseSortToken);
  const effective = force ? keys : [...keys, ...defaultKeys.filter((d) => !keys.some((k) => k.field === d.field))];

  return [...formats].sort((fa, fb) => {
    // DRM last
    if (!!fa.has_drm !== !!fb.has_drm) return fa.has_drm ? 1 : -1;
    for (const { field, order, limit } of effective) {
      const c = cmpNullable(fieldValue(fa, field), fieldValue(fb, field), order, limit);
      if (c !== 0) return c;
    }
    return String(fb.format_id).localeCompare(String(fa.format_id));
  });
}

export function applyFormatSort(
  formats: Format[],
  options?: { format_sort?: string[] | string; format_sort_force?: boolean },
): Format[] {
  return sortFormats(formats, options?.format_sort, options?.format_sort_force);
}
