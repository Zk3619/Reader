/**
 * 从章节正文解析出的视频地址（可含 Legado headers）
 * 对齐 Legado VideoPlay.startPlay → AnalyzeUrl
 */

import { parseLegadoUrlWithOptions } from '@/lib/js-engine/legado/parse-legado-url-options';
import { parseMediaUrls } from '@/lib/media/parse-media-urls';

const VIDEO_URL_KEYS = [
  'url',
  'src',
  'video_url',
  'videoUrl',
  'play_url',
  'playUrl',
  'media_url',
  'mediaUrl',
  'm3u8',
  'hls',
] as const;

const URL_LINE_RE = /https?:\/\/[^\s<>"']+/gi;

export interface ParsedVideoUrl {
  url: string;
  headers?: Record<string, string>;
}

function dedupeParsed(urls: ParsedVideoUrl[]): ParsedVideoUrl[] {
  const seen = new Set<string>();
  const out: ParsedVideoUrl[] = [];
  for (const item of urls) {
    const key = item.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function pushParsed(out: ParsedVideoUrl[], raw: string): void {
  const trimmed = raw.trim();
  if (!trimmed) return;
  const parsed = parseLegadoUrlWithOptions(trimmed);
  if (!parsed.url) return;
  if (/^https?:\/\//i.test(parsed.url)) {
    out.push({ url: parsed.url, headers: parsed.headers });
    return;
  }
  if (parsed.url.startsWith('blob:') || parsed.url.startsWith('data:')) {
    out.push({ url: parsed.url, headers: parsed.headers });
  }
}

function extractUrlsFromJsonValue(value: unknown, out: ParsedVideoUrl[]): void {
  if (typeof value === 'string') {
    if (value.trim().startsWith('http') || value.includes('://')) {
      pushParsed(out, value);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    for (const item of value) {
      extractUrlsFromJsonValue(item, out);
    }
    return;
  }

  const obj = value as Record<string, unknown>;
  for (const key of VIDEO_URL_KEYS) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) {
      pushParsed(out, v);
    }
  }
  if (obj.data != null) {
    extractUrlsFromJsonValue(obj.data, out);
  }
}

function tryParseJsonUrls(raw: string): ParsedVideoUrl[] | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const out: ParsedVideoUrl[] = [];
    extractUrlsFromJsonValue(parsed, out);
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

function looksLikeVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    /\.(mp4|m3u8|webm|mkv|mov|flv)(\?|#|$)/i.test(lower) ||
    lower.includes('video') ||
    lower.includes('m3u8') ||
    lower.includes('/play/') ||
    lower.includes('/stream')
  );
}

function extractHttpLines(raw: string, out: ParsedVideoUrl[]): void {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const candidates = lines.length > 0 ? lines : [raw.trim()];
  for (const line of candidates) {
    if (line.startsWith('http') || /^https?:\/\//i.test(line)) {
      pushParsed(out, line);
      continue;
    }
    const matches = line.match(URL_LINE_RE) ?? [];
    for (const m of matches) {
      if (looksLikeVideoUrl(m) || !m.includes('<')) {
        pushParsed(out, m);
      }
    }
  }
}

/** Legado：正文为 MPD/DASH 清单 XML */
export function isMpdManifestText(raw: string): boolean {
  const t = raw.trim();
  if (!t.startsWith('<')) return false;
  return (
    t.includes('<MPD') ||
    t.includes('<mpd') ||
    t.includes('mimeType="video') ||
    t.includes('type="dynamic"')
  );
}

/** 将 MPD 文本转为 blob: 播放地址（对齐 Legado 写入临时 .mpd 文件） */
export function createMpdBlobPlaybackUrl(mpdText: string): { src: string; revoke: () => void } {
  const blob = new Blob([mpdText], { type: 'application/dash+xml' });
  const src = URL.createObjectURL(blob);
  return { src, revoke: () => URL.revokeObjectURL(src) };
}

/** 从章节正文提取全部视频 URL（含 Legado headers） */
export function parseParsedVideoUrls(raw: string): ParsedVideoUrl[] {
  const text = raw?.trim() ?? '';
  if (!text) return [];
  if (isMpdManifestText(text)) return [];

  const jsonUrls = tryParseJsonUrls(text);
  if (jsonUrls) return dedupeParsed(jsonUrls);

  if (text.startsWith('http') || text.startsWith('https://')) {
    const single = parseLegadoUrlWithOptions(text);
    if (single.url && /^https?:\/\//i.test(single.url)) {
      return [{ url: single.url, headers: single.headers }];
    }
  }

  const out: ParsedVideoUrl[] = [];
  extractHttpLines(text, out);
  if (out.length > 0) return dedupeParsed(out);

  const fromHtml = parseMediaUrls(text, 'video');
  for (const u of fromHtml) {
    pushParsed(out, u);
  }
  if (out.length > 0) return dedupeParsed(out);

  if (text.startsWith('@js:')) {
    return [];
  }

  return [];
}
