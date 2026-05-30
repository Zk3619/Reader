/**
 * 正文分块：纯文本段落与 HTML（含 img）混排
 */

import { processImageStyle } from '@/lib/book-source/content-processor';
import { scanImgTags, readHtmlAttr } from '@/lib/reader/scan-img-tags';
import {
  extractLegadoImageRawFromFragment,
  parseLegadoUrlWithOptions,
  readLegadoHeadersFromImgTag,
} from '@/lib/js-engine/legado/parse-legado-url-options';

export type ReaderContentBlock =
  | { type: 'text'; text: string }
  | { type: 'html'; html: string };

export { scanImgTags } from '@/lib/reader/scan-img-tags';

export function splitReaderContentBlocks(raw: string): ReaderContentBlock[] {
  if (!raw?.trim()) return [];
  const tags = scanImgTags(raw);
  if (tags.length === 0) {
    return [{ type: 'text', text: raw }];
  }
  const blocks: ReaderContentBlock[] = [];
  let last = 0;
  for (const tag of tags) {
    const idx = raw.indexOf(tag, last);
    if (idx < 0) continue;
    const before = raw.slice(last, idx);
    if (before.trim()) blocks.push({ type: 'text', text: before });
    blocks.push({ type: 'html', html: tag });
    last = idx + tag.length;
  }
  const tail = raw.slice(last);
  if (tail.trim()) blocks.push({ type: 'text', text: tail });
  return blocks.length > 0 ? blocks : [{ type: 'text', text: raw }];
}

export type ReaderInlineImageRef = {
  url: string;
  legadoHeaders?: Record<string, string>;
};

export function parseImgTagsFromHtml(html: string): string[] {
  return parseImgRefsFromHtml(html).map((r) => r.url);
}

/** 解析正文 img（含 Legado `url,{"headers":…}` 与 data-legado-headers） */
export function parseImgRefsFromHtml(html: string): ReaderInlineImageRef[] {
  const refs: ReaderInlineImageRef[] = [];
  for (const tag of scanImgTags(html)) {
    const fromTag = readLegadoHeadersFromImgTag(tag);
    const rawLegado = extractLegadoImageRawFromFragment(tag);
    const rawSrc =
      readHtmlAttr(tag, 'src') ||
      readHtmlAttr(tag, 'data-src') ||
      readHtmlAttr(tag, 'data-original') ||
      '';
    const parsed = parseLegadoUrlWithOptions(rawLegado ?? rawSrc.trim());
    const url = parsed.url.trim();
    if (!url || url.startsWith('<')) continue;
    const legadoHeaders = fromTag ?? parsed.headers;
    refs.push(legadoHeaders ? { url, legadoHeaders } : { url });
  }
  return refs;
}

export function applyReaderImageStyle(
  html: string,
  imageStyle?: string,
): string {
  if (!imageStyle) return html;
  return processImageStyle(html, imageStyle);
}
