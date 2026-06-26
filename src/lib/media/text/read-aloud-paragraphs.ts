/**
 * 朗读段落切分（对齐 Legado TextChapter.getNeedReadAloud）
 */

import { plainTextForAloud } from '@/lib/media/text/read-aloud';

export type ReadAloudParagraphAnchor = {
  chapterPos?: number;
  pageText?: string;
};

export type SplitChapterParagraphsOptions = {
  readAloudByPage?: boolean;
  anchor?: ReadAloudParagraphAnchor;
  /** 显式起始段（选区朗读） */
  startParagraphIndex?: number;
};

/** Legado AppPattern.notReadAloudRegex 的 JS 等价 */
export const NOT_READ_ALOUD_REGEX = /^(\s|\p{C}|\p{P}|\p{Z}|\p{S})+$/u;

export function shouldSkipReadAloudParagraph(text: string): boolean {
  const t = text.replace(/\s+/g, '').trim();
  if (!t) return true;
  return NOT_READ_ALOUD_REGEX.test(text.trim());
}

export function filterParagraphsForAloud(paragraphs: string[]): string[] {
  return paragraphs.filter((p) => !shouldSkipReadAloudParagraph(p));
}

/** 与朗读会话一致的过滤后段落列表 */
export function getFilteredAloudParagraphs(html: string): string[] {
  return filterParagraphsForAloud(extractParagraphsFromHtml(html));
}

function normalizeAloudText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 在过滤后的段落列表中定位文本（选区朗读 / 块映射） */
export function findParagraphIndexInFilteredList(
  paragraphs: string[],
  text: string,
  searchFrom = 0,
): number {
  const needle = normalizeAloudText(text);
  if (!needle || paragraphs.length === 0) return 0;

  const matchAt = (from: number): number => {
    for (let i = from; i < paragraphs.length; i++) {
      const p = normalizeAloudText(paragraphs[i]);
      if (!p) continue;
      if (
        p === needle ||
        p.includes(needle) ||
        needle.includes(p.slice(0, Math.min(40, p.length)))
      ) {
        return i;
      }
    }
    return -1;
  };

  const fromCursor = matchAt(Math.max(0, searchFrom));
  if (fromCursor >= 0) return fromCursor;
  const fromStart = matchAt(0);
  return fromStart >= 0 ? fromStart : 0;
}

export type AloudBlockTextRef = {
  blockIndex: number;
  text: string;
};

/**
 * 将正文显示块映射到朗读段落索引（与 splitChapterParagraphs 过滤后列表对齐）
 */
export function buildAloudParagraphIndexMap(
  html: string,
  blocks: AloudBlockTextRef[],
): Map<number, number> {
  const paragraphs = getFilteredAloudParagraphs(html);
  const map = new Map<number, number>();
  let searchFrom = 0;
  for (const { blockIndex, text } of blocks) {
    const plain = normalizeAloudText(text);
    if (!plain) continue;
    const idx = findParagraphIndexInFilteredList(paragraphs, plain, searchFrom);
    map.set(blockIndex, idx);
    searchFrom = idx;
  }
  return map;
}

export type SplitChapterParagraphsResult = {
  paragraphs: string[];
  startIndex: number;
};

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'BLOCKQUOTE',
  'SECTION',
  'ARTICLE',
]);

function pushParagraph(out: string[], raw: string): void {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text) out.push(text);
}

/** 无 DOM 环境（测试/SSR）下的简易 HTML 拆段 */
function extractParagraphsWithoutDom(html: string): string[] {
  const out: string[] = [];
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ');
  for (const line of withBreaks.split(/\n+/)) {
    pushParagraph(out, line);
  }
  if (out.length === 0) {
    pushParagraph(out, html.replace(/<[^>]+>/g, ' '));
  }
  return out;
}

/** 从 HTML 提取段落纯文本列表 */
export function extractParagraphsFromHtml(html: string): string[] {
  if (!html?.trim()) return [];
  if (typeof document === 'undefined') {
    return extractParagraphsWithoutDom(html);
  }
  const div = document.createElement('div');
  div.innerHTML = html;
  const out: string[] = [];

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent?.trim();
      if (t) pushParagraph(out, t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === 'BR') {
      return;
    }
    if (BLOCK_TAGS.has(tag)) {
      const text = plainTextForAloud(el.innerHTML);
      pushParagraph(out, text);
      return;
    }
    for (const child of Array.from(el.childNodes)) {
      walk(child);
    }
  };

  for (const child of Array.from(div.childNodes)) {
    walk(child);
  }

  if (out.length === 0) {
    const plain = plainTextForAloud(html);
    if (!plain) return [];
    for (const line of plain.split(/\n+/)) {
      pushParagraph(out, line);
    }
  }

  return out;
}

/** 按页模式：将单页文本拆为段 */
export function extractParagraphsFromPageText(pageText: string): string[] {
  const plain = pageText.replace(/\s+/g, ' ').trim();
  if (!plain) return [];
  const parts = plain.split(/(?<=[。！？.!?…])\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) return parts;
  return [plain];
}

function findStartIndexByChapterPos(
  paragraphs: string[],
  chapterPos: number,
): number {
  if (paragraphs.length === 0) return 0;
  const pos = Math.min(1, Math.max(0, chapterPos));
  const idx = Math.floor(pos * paragraphs.length);
  return Math.min(paragraphs.length - 1, Math.max(0, idx));
}

function findStartIndexByPageText(
  paragraphs: string[],
  pageText: string,
): number {
  const needle = pageText.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!needle) return 0;
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i].includes(needle) || needle.includes(paragraphs[i].slice(0, 40))) {
      return i;
    }
  }
  return 0;
}

export function splitChapterParagraphs(
  html: string,
  options: SplitChapterParagraphsOptions = {},
): SplitChapterParagraphsResult {
  const { readAloudByPage, anchor } = options;

  const rawParagraphs =
    readAloudByPage && anchor?.pageText?.trim()
      ? extractParagraphsFromPageText(anchor.pageText)
      : extractParagraphsFromHtml(html);
  const paragraphs = filterParagraphsForAloud(rawParagraphs);

  if (readAloudByPage && anchor?.pageText?.trim()) {
    return { paragraphs, startIndex: 0 };
  }

  let startIndex = 0;

  if (options.startParagraphIndex != null) {
    startIndex = Math.min(
      paragraphs.length - 1,
      Math.max(0, options.startParagraphIndex),
    );
  } else if (anchor?.pageText?.trim()) {
    startIndex = findStartIndexByPageText(paragraphs, anchor.pageText);
  } else if (anchor?.chapterPos != null) {
    startIndex = findStartIndexByChapterPos(paragraphs, anchor.chapterPos);
  }

  return { paragraphs, startIndex };
}
