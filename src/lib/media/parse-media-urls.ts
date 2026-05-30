/**
 * 从章节正文中提取媒体 URL（图片 / 音频 / 视频）
 * 对齐 Legado：音频与视频章节正文多为直链或少量 HTML
 */

/** 与 MediaKind 对齐；text 章节正文不作为 URL 列表解析 */
export type MediaUrlKind = 'text' | 'image' | 'audio' | 'video' | 'file';

const IMG_SRC_RE = /<img[^>]+src=["']([^"']+)["']/gi;
const SOURCE_SRC_RE = /<source[^>]+src=["']([^"']+)["']/gi;
const AUDIO_SRC_RE = /<audio[^>]+src=["']([^"']+)["']/gi;
const VIDEO_SRC_RE = /<video[^>]+src=["']([^"']+)["']/gi;
const URL_LINE_RE = /https?:\/\/[^\s<>"']+/gi;

function dedupeOrdered(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const t = u.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function extractByRegex(html: string, re: RegExp): string[] {
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  const copy = new RegExp(re.source, re.flags);
  while ((m = copy.exec(html)) !== null) {
    if (m[1]) urls.push(m[1]);
  }
  return urls;
}

function looksLikeMediaUrl(url: string, kind: MediaUrlKind): boolean {
  const lower = url.toLowerCase();
  if (kind === 'image') {
    return (
      /\.(jpe?g|png|gif|webp|bmp|avif)(\?|$)/i.test(lower) ||
      lower.includes('image') ||
      lower.includes('/pic/') ||
      lower.includes('/img/') ||
      lower.includes('comic') ||
      lower.includes('manga')
    );
  }
  if (kind === 'audio') {
    return /\.(mp3|m4a|aac|ogg|wav|flac|opus)(\?|$)/i.test(lower) || lower.includes('audio');
  }
  if (kind === 'file') {
    return (
      /\.(pdf|epub|zip|rar|7z|cbz|cbr|mobi|azw3?|txt|docx?)(\?|$)/i.test(lower) ||
      lower.includes('/file/') ||
      lower.includes('download')
    );
  }
  return /\.(mp4|m3u8|webm|mkv|mov)(\?|$)/i.test(lower) || lower.includes('video') || lower.includes('m3u8');
}

/**
 * 解析章节正文中的媒体地址列表
 */
export function parseMediaUrls(raw: string, kind: MediaUrlKind): string[] {
  const text = raw?.trim() ?? '';
  if (!text) return [];
  if (kind === 'text') return [];

  const urls: string[] = [];

  if (kind === 'image') {
    urls.push(...extractByRegex(text, IMG_SRC_RE));
  } else if (kind === 'audio') {
    urls.push(...extractByRegex(text, AUDIO_SRC_RE));
    urls.push(...extractByRegex(text, SOURCE_SRC_RE));
  } else if (kind === 'video') {
    urls.push(...extractByRegex(text, VIDEO_SRC_RE));
    urls.push(...extractByRegex(text, SOURCE_SRC_RE));
  } else {
    urls.push(...extractByRegex(text, SOURCE_SRC_RE));
  }

  const lineUrls = text.match(URL_LINE_RE) ?? [];
  for (const u of lineUrls) {
    if (looksLikeMediaUrl(u, kind) || (kind !== 'image' && !u.includes('<'))) {
      urls.push(u);
    }
  }

  if (urls.length === 0 && lineUrls.length > 0 && kind !== 'image') {
    urls.push(...lineUrls);
  }

  if (urls.length === 0 && kind === 'image' && text.startsWith('http')) {
    urls.push(text.split(/\s+/)[0]!);
  }

  // 漫画 CDN 常见无扩展名 URL：若正文几乎全是 URL 行则全部纳入
  if (urls.length === 0 && kind === 'image') {
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0 && lines.every((l) => l.startsWith('http'))) {
      urls.push(...lines);
    }
  }

  return dedupeOrdered(urls);
}

/** 音频 / 视频 / 文件章节通常只有一个主 URL */
export function parsePrimaryMediaUrl(
  raw: string,
  kind: Exclude<MediaUrlKind, 'text' | 'image'>,
): string | null {
  const list = parseMediaUrls(raw, kind);
  return list[0] ?? null;
}
