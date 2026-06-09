/**
 * 从章节正文解析出的音频地址（可含 Legado headers）
 */

import { parseLegadoUrlWithOptions } from '@/lib/js-engine/legado/parse-legado-url-options';

const AUDIO_URL_KEYS = [
  'url',
  'src',
  'audio_url',
  'audioUrl',
  'play_url',
  'playUrl',
  'voice_url',
  'voiceUrl',
  'media_url',
  'mediaUrl',
] as const;

const URL_LINE_RE = /https?:\/\/[^\s<>"']+/gi;

export interface ParsedAudioUrl {
  url: string;
  headers?: Record<string, string>;
}

function dedupeParsed(urls: ParsedAudioUrl[]): ParsedAudioUrl[] {
  const seen = new Set<string>();
  const out: ParsedAudioUrl[] = [];
  for (const item of urls) {
    const key = item.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function pushParsed(out: ParsedAudioUrl[], raw: string): void {
  const trimmed = raw.trim();
  if (!trimmed) return;
  const parsed = parseLegadoUrlWithOptions(trimmed);
  if (!parsed.url || !/^https?:\/\//i.test(parsed.url)) return;
  if (looksLikeImageUrl(parsed.url) && !looksLikeAudioUrl(parsed.url)) return;
  out.push({
    url: parsed.url,
    headers: parsed.headers,
  });
}

function extractUrlsFromJsonValue(value: unknown, out: ParsedAudioUrl[]): void {
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
  for (const key of AUDIO_URL_KEYS) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) {
      pushParsed(out, v);
    }
  }
  if (obj.data != null) {
    extractUrlsFromJsonValue(obj.data, out);
  }
}

function tryParseJsonUrls(raw: string): ParsedAudioUrl[] | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const out: ParsedAudioUrl[] = [];
    extractUrlsFromJsonValue(parsed, out);
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

function looksLikeAudioUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    /\.(mp3|m4a|aac|ogg|wav|flac|opus)(\?|#|$)/i.test(lower) ||
    /\.m3u8(\?|#|$)/i.test(lower) ||
    lower.includes('audio') ||
    lower.includes('/tts/') ||
    lower.includes('/voice/')
  );
}

/** 图片 CDN / 漫画插图（勿当作听书段） */
function looksLikeImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    /\.(webp|jpe?g|png|gif|bmp|avif|svg|ico)(\?|#|$)/i.test(lower) ||
    /\.(webp|jpe?g|png|gif|bmp|avif)/i.test(lower) ||
    lower.includes('/image/') ||
    lower.includes('/images/') ||
    lower.includes('/img/') ||
    lower.includes('/comic/') ||
    lower.includes('middle.webp')
  );
}

function isPlainUrlLine(line: string, url: string): boolean {
  const trimmed = line.trim();
  return trimmed === url || trimmed.startsWith(`${url},`);
}

function shouldAcceptHttpUrl(url: string, line: string): boolean {
  if (looksLikeImageUrl(url)) return false;
  if (looksLikeAudioUrl(url)) return true;
  return isPlainUrlLine(line, url);
}

function extractHttpLines(raw: string, out: ParsedAudioUrl[]): void {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const candidates = lines.length > 0 ? lines : [raw.trim()];
  for (const line of candidates) {
    if (line.startsWith('http') || /^https?:\/\//i.test(line)) {
      const parsed = parseLegadoUrlWithOptions(line);
      if (
        parsed.url &&
        /^https?:\/\//i.test(parsed.url) &&
        shouldAcceptHttpUrl(parsed.url, line)
      ) {
        pushParsed(out, line);
      }
      continue;
    }
    const matches = line.match(URL_LINE_RE) ?? [];
    for (const m of matches) {
      if (shouldAcceptHttpUrl(m, line)) {
        pushParsed(out, m);
      }
    }
  }
}

/** 从章节正文提取全部音频 URL（含 Legado headers） */
export function parseParsedAudioUrls(raw: string): ParsedAudioUrl[] {
  const text = raw?.trim() ?? '';
  if (!text) return [];

  const jsonUrls = tryParseJsonUrls(text);
  if (jsonUrls) return dedupeParsed(jsonUrls);

  if (text.startsWith('http') || text.startsWith('https://')) {
    const single = parseLegadoUrlWithOptions(text);
    if (
      single.url &&
      /^https?:\/\//i.test(single.url) &&
      shouldAcceptHttpUrl(single.url, text)
    ) {
      return [{ url: single.url, headers: single.headers }];
    }
  }

  const out: ParsedAudioUrl[] = [];
  extractHttpLines(text, out);
  if (out.length > 0) return dedupeParsed(out);

  if (text.startsWith('@js:')) {
    return [];
  }

  return [];
}

/** 仅 URL 字符串列表（兼容旧调用） */
export function parseAudioUrlStrings(raw: string): string[] {
  return parseParsedAudioUrls(raw).map((item) => item.url);
}
