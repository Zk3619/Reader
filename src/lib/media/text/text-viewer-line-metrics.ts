/**
 * DOM 逐字/逐行坐标采集（对齐 Legado TextLine + TextColumn）
 */

import type { ReaderTextColumn, ReaderTextLine } from '@/lib/media/text/reader-text-layout-entities';
import { dualColumnForElement } from '@/lib/media/text/text-viewer-paginate-dual';
import { readLineHeightPx, resolvePagedMeasureRoot } from '@/lib/media/text/text-viewer-paginate';

export interface CollectLineMetricsOptions {
  fontSize?: number;
  lineSpacing?: number;
  /** 仅采集前 N 个块（流式排版） */
  maxBlocks?: number;
  chapterCharOffset?: number;
}

function collectColumnsInLine(
  textEl: HTMLElement,
  rootRect: DOMRect,
  lineTop: number,
  lineBottom: number,
  chapterPositionStart: number,
  _column: 0 | 1,
): { columns: ReaderTextColumn[]; text: string; chapterPosition: number } {
  const range = document.createRange();
  const text = textEl.textContent ?? '';
  if (!text) {
    return { columns: [], text: '', chapterPosition: chapterPositionStart };
  }

  const columns: ReaderTextColumn[] = [];
  let charIndex = 0;
  let built = '';

  for (let i = 0; i < text.length; i += 1) {
    range.setStart(textEl.firstChild ?? textEl, 0);
    try {
      range.setStart(textEl.firstChild ?? textEl, Math.min(i, text.length));
      range.setEnd(textEl.firstChild ?? textEl, Math.min(i + 1, text.length));
    } catch {
      break;
    }
    const rects = range.getClientRects();
    if (rects.length === 0) continue;
    const rect = rects[0]!;
    const top = rect.top - rootRect.top;
    const bottom = rect.bottom - rootRect.top;
    if (bottom < lineTop - 0.5 || top > lineBottom + 0.5) continue;

    const startX = rect.left - rootRect.left;
    const endX = rect.right - rootRect.left;
    const ch = text[i] ?? '';
    columns.push({
      startX,
      endX,
      char: ch,
      chapterPosition: chapterPositionStart + charIndex,
    });
    built += ch;
    charIndex += 1;
  }

  return {
    columns,
    text: built || text.slice(0, Math.min(text.length, 512)),
    chapterPosition: chapterPositionStart,
  };
}

/** 从已渲染 DOM 采集行级 + 字级坐标 */
export function collectDomTextLines(
  contentRoot: HTMLElement,
  options?: CollectLineMetricsOptions,
): ReaderTextLine[] {
  const measureRoot = resolvePagedMeasureRoot(contentRoot);
  const rootRect = measureRoot.getBoundingClientRect();
  const blocks = measureRoot.querySelectorAll<HTMLElement>('[data-reader-measure-block]');
  const lines: ReaderTextLine[] = [];
  let chapterPos = options?.chapterCharOffset ?? 0;
  const maxBlocks = options?.maxBlocks ?? blocks.length;

  blocks.forEach((block, blockIdx) => {
    if (blockIdx >= maxBlocks) return;

    const column = dualColumnForElement(rootRect, block);
    const textEl =
      block.querySelector<HTMLElement>('.reader-p') ??
      block.querySelector<HTMLElement>('h2');
    if (!textEl) return;

    const lineHeightPx = readLineHeightPx(
      textEl,
      options?.fontSize,
      options?.lineSpacing,
    );
    const blockTop = textEl.getBoundingClientRect().top - rootRect.top;
    const blockBottom = textEl.getBoundingClientRect().bottom - rootRect.top;
    const fullText = textEl.textContent ?? '';

    const range = document.createRange();
    range.selectNodeContents(textEl);
    const rects = Array.from(range.getClientRects()).sort((a, b) => a.top - b.top);

    if (rects.length === 0) {
      const { columns, text, chapterPosition } = collectColumnsInLine(
        textEl,
        rootRect,
        blockTop,
        blockBottom,
        chapterPos,
        column,
      );
      lines.push({
        lineTop: blockTop,
        lineBase: blockBottom - lineHeightPx * 0.25,
        lineBottom: blockBottom,
        text,
        chapterPosition,
        column,
        columns,
        isParagraphEnd: true,
      });
      chapterPos += text.length + 1;
      return;
    }

    let lineCharOffset = 0;
    for (let li = 0; li < rects.length; li += 1) {
      const rect = rects[li]!;
      const lineTop = rect.top - rootRect.top;
      const lineBottom = lineTop + lineHeightPx;
      const { columns, text, chapterPosition } = collectColumnsInLine(
        textEl,
        rootRect,
        lineTop,
        lineBottom,
        chapterPos + lineCharOffset,
        column,
      );
      lines.push({
        lineTop,
        lineBase: lineBottom - lineHeightPx * 0.25,
        lineBottom,
        text,
        chapterPosition,
        column,
        columns,
        isParagraphEnd: li === rects.length - 1,
      });
      lineCharOffset += text.length;
    }
    chapterPos += fullText.length + 1;
  });

  return lines;
}

/** 将 lines 按页 startY 分组并写入 chapterPosition / text */
export function attachLinesToPages(
  pages: { startY: number; endY: number; index: number }[],
  lines: ReaderTextLine[],
): Map<number, ReaderTextLine[]> {
  const map = new Map<number, ReaderTextLine[]>();
  for (const page of pages) {
    const inPage = lines.filter(
      (l) => l.lineTop >= page.startY - 1 && l.lineTop < page.endY - 0.5,
    );
    map.set(page.index, inPage);
  }
  return map;
}
