/**
 * 从正文 HTML 提取图片 URL
 * 对齐 Legado BookHelp.flowImages + AppPattern.imgPattern
 */

import { resolveUrl } from '@/lib/book-source/utils';
import {
  parseImgRefsFromHtml,
  type ReaderInlineImageRef,
} from '@/lib/reader/reader-content-blocks';

function dedupeOrderedRefs(refs: ReaderInlineImageRef[]): ReaderInlineImageRef[] {
  const out: ReaderInlineImageRef[] = [];
  for (const ref of refs) {
    const t = ref.url.trim();
    if (!t) continue;
    const prev = out[out.length - 1];
    if (prev?.url.trim() === t) continue;
    out.push(ref);
  }
  return out;
}

/**
 * 从章节正文中 flow 出图片（含 Legado headers）
 */
export function flowImageRefs(
  content: string,
  chapterUrl = '',
): ReaderInlineImageRef[] {
  if (!content?.trim()) return [];

  const refs = parseImgRefsFromHtml(content).map((ref) => {
    const src = ref.url.trim();
    if (
      chapterUrl &&
      !/^https?:\/\//i.test(src) &&
      !src.startsWith('data:')
    ) {
      return { ...ref, url: resolveUrl(chapterUrl, src) };
    }
    return ref;
  });

  return dedupeOrderedRefs(refs);
}

/**
 * 从章节正文中 flow 出图片绝对 URL 列表（Legado flowImages）
 */
export function flowImages(content: string, chapterUrl = ''): string[] {
  return flowImageRefs(content, chapterUrl).map((r) => r.url);
}

export function countFlowImages(content: string, chapterUrl = ''): number {
  return flowImages(content, chapterUrl).length;
}
