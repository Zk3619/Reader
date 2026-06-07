/**
 * 正文分块：纯文本段落与 HTML（含 img）混排
 */

import { processImageStyle } from '@/lib/book-source/content-processor';
import { scanImgTags, readHtmlAttr } from '@/lib/media/text/scan-img-tags';
import {
  extractLegadoImageRawFromFragment,
  parseLegadoUrlWithOptions,
  readLegadoHeadersFromImgTag,
} from '@/lib/js-engine/legado/parse-legado-url-options';
import {
  isInlineLegadoImageLayout,
  resolveLegadoImageLayout,
  type LegadoImageLayout,
} from '@/lib/js-engine/legado/legado-image-options';
import { decodeHtmlEntities } from '@/lib/media/text/decode-html-entities';

export type ReaderContentBlock =
  | { type: 'text'; text: string }
  | { type: 'html'; html: string };

export type ReaderParagraphPart =
  | { kind: 'text'; text: string }
  | { kind: 'img'; ref: ReaderInlineImageRef };

export type ReaderDisplayBlock =
  | { type: 'paragraph'; parts: ReaderParagraphPart[] }
  | { type: 'figure'; refs: ReaderInlineImageRef[] };

export { scanImgTags } from '@/lib/media/text/scan-img-tags';

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
  legadoClick?: string;
  legadoStyle?: string;
  layout?: LegadoImageLayout;
};

/** 仅去掉行尾空白，保留段首/行首缩进（半角或全角空格） */
function trimParagraphTrailing(line: string): string {
  let end = line.length;
  while (end > 0) {
    const ch = line[end - 1]!;
    if (ch <= ' ' || ch === '\u3000') end -= 1;
    else break;
  }
  return line.slice(0, end);
}

function isBlankParagraphLine(line: string): boolean {
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch > ' ' && ch !== '\u3000') return false;
  }
  return true;
}

/** 对齐 Legado HtmlFormatter + ContentProcessor：`<p>`/`\n` 切段 */
export function splitRawIntoParagraphSegments(raw: string): string[] {
  const normalized = normalizeRawParagraphInput(raw);
  if (!normalized.trim()) return [];

  if (/<p\b/i.test(normalized)) {
    const segments: string[] = [];
    const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(normalized)) !== null) {
      const inner = trimParagraphTrailing(m[1] ?? '');
      if (inner) segments.push(stripInlineMarkup(inner));
    }
    if (segments.length > 0) {
      return segments.filter((s) => s.length > 0);
    }
  }

  // cleanContent 后按单 \n 切段（同 ContentProcessor.getContent textList）
  const segments: string[] = [];
  for (const line of normalized.split('\n')) {
    if (isBlankParagraphLine(line)) continue;
    const segment = stripInlineMarkup(trimParagraphTrailing(line));
    if (segment) segments.push(segment);
  }

  if (segments.length > 0) return segments;

  const fallback = stripInlineMarkup(trimParagraphTrailing(normalized));
  return fallback ? [fallback] : [];
}

function stripInlineMarkup(text: string): string {
  const stripped = text
    .replace(/<\/?p\b[^>]*>/gi, '')
    .replace(/<\/?(?:div|br|hr|span)\b[^>]*>/gi, (tag) =>
      /^<\/?br/i.test(tag) ? '\n' : '',
    )
    .replace(/\n{3,}/g, '\n\n');
  return decodeHtmlEntities(trimParagraphTrailing(stripped));
}

function readLegadoClickFromImgTag(tag: string): string | undefined {
  return readHtmlAttr(tag, 'data-legado-click');
}

function readLegadoStyleFromImgTag(tag: string): string | undefined {
  return readHtmlAttr(tag, 'data-legado-style');
}

/** 解析正文 img（含 Legado `url,{"headers":…}` 与 data-legado-*） */
export function parseImgRefsFromHtml(
  html: string,
  bookImageStyle?: string,
): ReaderInlineImageRef[] {
  const refs: ReaderInlineImageRef[] = [];
  for (const tag of scanImgTags(html)) {
    const fromTag = readLegadoHeadersFromImgTag(tag);
    const fromClick = readLegadoClickFromImgTag(tag);
    const fromStyle = readLegadoStyleFromImgTag(tag);
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
    const legadoClick = fromClick ?? parsed.click;
    const legadoStyle = fromStyle ?? parsed.legadoStyle;
    const layout = resolveLegadoImageLayout(bookImageStyle, legadoStyle);
    refs.push({
      url,
      ...(legadoHeaders ? { legadoHeaders } : {}),
      ...(legadoClick ? { legadoClick } : {}),
      ...(legadoStyle ? { legadoStyle } : {}),
      layout,
    });
  }
  return refs;
}

export function parseImgTagsFromHtml(html: string): string[] {
  return parseImgRefsFromHtml(html).map((r) => r.url);
}

function buildParagraphPartsFromSegment(
  segment: string,
  bookImageStyle?: string,
): ReaderParagraphPart[] {
  const parts: ReaderParagraphPart[] = [];
  const tags = scanImgTags(segment);
  if (tags.length === 0) {
    const text = stripInlineMarkup(segment);
    if (text) parts.push({ kind: 'text', text });
    return parts;
  }

  let last = 0;
  for (const tag of tags) {
    const idx = segment.indexOf(tag, last);
    if (idx < 0) continue;
    const before = stripInlineMarkup(segment.slice(last, idx));
    if (before) parts.push({ kind: 'text', text: before });
    for (const ref of parseImgRefsFromHtml(tag, bookImageStyle)) {
      parts.push({ kind: 'img', ref });
    }
    last = idx + tag.length;
  }
  const tail = stripInlineMarkup(segment.slice(last));
  if (tail) parts.push({ kind: 'text', text: tail });
  return parts;
}

/** 去掉章节首尾换行，不剥段首缩进空格 */
function normalizeRawParagraphInput(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\n+/, '').replace(/\n+$/, '');
}

/** 按书源段落切分；段评 SVG 等行内图留在对应段落 parts 内 */
export function buildReaderDisplayBlocks(
  raw: string,
  bookImageStyle?: string,
): ReaderDisplayBlock[] {
  const bookIsText = (bookImageStyle ?? '').trim().toUpperCase() === 'TEXT';
  const segments = splitRawIntoParagraphSegments(raw);
  if (segments.length === 0) {
    return [{ type: 'paragraph', parts: [{ kind: 'text', text: raw }] }];
  }

  const out: ReaderDisplayBlock[] = [];

  for (const segment of segments) {
    const parts = buildParagraphPartsFromSegment(segment, bookImageStyle);
    if (parts.length === 0) continue;

    let currentPara: ReaderParagraphPart[] = [];
    const flushPara = () => {
      if (currentPara.length > 0) {
        out.push({ type: 'paragraph', parts: currentPara });
        currentPara = [];
      }
    };

    for (const part of parts) {
      if (part.kind === 'text') {
        currentPara.push(part);
        continue;
      }
      let layout =
        part.ref.layout ??
        resolveLegadoImageLayout(bookImageStyle, part.ref.legadoStyle);
      if (bookIsText) {
        layout = part.ref.legadoStyle === 'TEXT' ? 'TEXT_WIDE' : 'TEXT';
      }
      if (isInlineLegadoImageLayout(layout)) {
        currentPara.push({ kind: 'img', ref: { ...part.ref, layout } });
      } else {
        flushPara();
        out.push({ type: 'figure', refs: [{ ...part.ref, layout }] });
      }
    }
    flushPara();
  }

  return out.length > 0 ? out : [{ type: 'paragraph', parts: [{ kind: 'text', text: raw }] }];
}

export function applyReaderImageStyle(
  html: string,
  imageStyle?: string,
): string {
  if (!imageStyle) return html;
  return processImageStyle(html, imageStyle);
}

export function paragraphHasLegadoCommentImg(parts: ReaderParagraphPart[]): boolean {
  return parts.some(
    (p) => p.kind === 'img' && Boolean(p.ref.legadoClick?.trim()),
  );
}
