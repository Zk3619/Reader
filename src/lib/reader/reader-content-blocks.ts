/**
 * 正文分块：纯文本段落与 HTML（含 img）混排
 */

import { processImageStyle } from '@/lib/book-source/content-processor';

export type ReaderContentBlock =
  | { type: 'text'; text: string }
  | { type: 'html'; html: string };

const IMG_TAG_RE = /<img[\s\S]*?>/gi;

export function splitReaderContentBlocks(raw: string): ReaderContentBlock[] {
  if (!raw?.trim()) return [];
  if (!IMG_TAG_RE.test(raw)) {
    return [{ type: 'text', text: raw }];
  }
  IMG_TAG_RE.lastIndex = 0;
  const blocks: ReaderContentBlock[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(IMG_TAG_RE.source, 'gi');
  while ((m = re.exec(raw)) !== null) {
    const before = raw.slice(last, m.index);
    if (before.trim()) blocks.push({ type: 'text', text: before });
    blocks.push({ type: 'html', html: m[0] });
    last = m.index + m[0].length;
  }
  const tail = raw.slice(last);
  if (tail.trim()) blocks.push({ type: 'text', text: tail });
  return blocks.length > 0 ? blocks : [{ type: 'text', text: raw }];
}

export function applyReaderImageStyle(
  html: string,
  imageStyle?: string,
): string {
  if (!imageStyle) return html;
  return processImageStyle(html, imageStyle);
}
