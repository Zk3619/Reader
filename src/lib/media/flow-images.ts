/**
 * 从正文 HTML 提取图片 URL
 * 对齐 Legado BookHelp.flowImages + AppPattern.imgPattern
 */

import { resolveUrl } from '@/lib/book-source/utils';

/** Legado AppPattern.imgPattern */
const IMG_PATTERN = /<img[^>]*src="([^"]*(?:"[^>]+\})?)"[^>]*>/gi;

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

/**
 * 从章节正文中 flow 出图片绝对 URL 列表（Legado flowImages）
 * @param content 章节正文 HTML
 * @param chapterUrl 用于相对路径转绝对路径（Legado NetworkUtils.getAbsoluteURL(chapter.url, src)）
 */
export function flowImages(content: string, chapterUrl = ''): string[] {
  if (!content?.trim()) return [];

  const urls: string[] = [];
  const re = new RegExp(IMG_PATTERN.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const src = m[1]?.trim();
    if (!src) continue;
    const abs =
      chapterUrl && !/^https?:\/\//i.test(src) && !src.startsWith('data:')
        ? resolveUrl(chapterUrl, src)
        : src;
    urls.push(abs);
  }
  return dedupeOrdered(urls);
}

export function countFlowImages(content: string, chapterUrl = ''): number {
  return flowImages(content, chapterUrl).length;
}
