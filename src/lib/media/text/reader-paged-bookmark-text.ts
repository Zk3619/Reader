/**
 * 分页模式书签正文：从当前可见裁切区 / DOM 行 / 排版页提取（对齐 Legado page.text）
 */

import type { ReaderChapterLayout } from '@/lib/media/text/reader-chapter-layout-types';
import { pageCountFromChapterLayout } from '@/lib/media/text/reader-chapter-layout-types';
import { sortLinesReadingOrder } from '@/lib/media/text/reader-text-layout-entities';
import { plainTextForAloud } from '@/lib/media/text/read-aloud';
import { collectDomTextLines } from '@/lib/media/text/text-viewer-line-metrics';

export function normalizeBookmarkPlainText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function pagedBookmarkChapterPos(pageIndex: number, pageCount: number): number {
  if (pageCount <= 1) return 0;
  return pageIndex / (pageCount - 1);
}

function fallbackExcerptAtRatio(htmlOrText: string, chapterPos: number, maxLen = 120): string {
  const plain = plainTextForAloud(htmlOrText).replace(/\s+/g, ' ').trim();
  if (!plain) return '';

  const ratio = Math.min(1, Math.max(0, chapterPos));
  const anchor = Math.round(plain.length * ratio);
  const half = Math.floor(maxLen / 2);
  let start = Math.max(0, anchor - half);
  let end = Math.min(plain.length, start + maxLen);
  if (end - start < maxLen) {
    start = Math.max(0, end - maxLen);
  }

  let excerpt = plain.slice(start, end).trim();
  if (start > 0) excerpt = `…${excerpt}`;
  if (end < plain.length) excerpt = `${excerpt}…`;
  return excerpt;
}

/** 读取 page-window 裁切区内当前可见正文（与屏幕所见一致） */
export function extractVisiblePagedClipText(
  viewportRoot: HTMLElement | null | undefined,
): string {
  if (!viewportRoot) return '';
  const clip =
    viewportRoot.querySelector('.reader-paged-page-content-clip') ??
    viewportRoot.querySelector('.reader-paged-page-window');
  if (!clip) return '';
  return normalizeBookmarkPlainText(clip.textContent ?? '');
}

function lineInVerticalRange(
  lineTop: number,
  lineBottom: number,
  rangeStart: number,
  rangeEnd: number,
): boolean {
  return lineBottom > rangeStart + 0.5 && lineTop < rangeEnd - 0.5;
}

/** 按排版页界从测量 DOM 采集行文本（canvas 排版无 page.text 时的兜底） */
export function extractPageTextFromDomLines(
  contentRoot: HTMLElement,
  layout: ReaderChapterLayout,
  pageIndex: number,
): string {
  const lines = collectDomTextLines(contentRoot);
  if (lines.length === 0) return '';

  if (layout.dualPage && layout.rightPageStarts?.length) {
    const leftStart = layout.pageStarts[pageIndex] ?? 0;
    const leftEnd =
      layout.pageStarts[pageIndex + 1] ??
      layout.leftColumnExtent ??
      layout.contentExtent;
    const rightStarts = layout.rightPageStarts;
    const rightStart = rightStarts[pageIndex] ?? 0;
    const rightEnd =
      rightStarts[pageIndex + 1] ??
      layout.rightColumnExtent ??
      layout.contentExtent;

    const inPage = lines.filter((line) => {
      if (line.column === 1) {
        return lineInVerticalRange(line.lineTop, line.lineBottom, rightStart, rightEnd);
      }
      return lineInVerticalRange(line.lineTop, line.lineBottom, leftStart, leftEnd);
    });

    if (inPage.length === 0) return '';
    return normalizeBookmarkPlainText(
      sortLinesReadingOrder(inPage)
        .map((line) => line.text)
        .join(''),
    );
  }

  const pageStart = layout.pageStarts[pageIndex] ?? 0;
  const pageEnd = layout.pageStarts[pageIndex + 1] ?? layout.contentExtent;
  const inPage = lines.filter((line) =>
    lineInVerticalRange(line.lineTop, line.lineBottom, pageStart, pageEnd),
  );
  if (inPage.length === 0) return '';
  return normalizeBookmarkPlainText(
    sortLinesReadingOrder(inPage)
      .map((line) => line.text)
      .join(''),
  );
}

export interface BuildPagedBookmarkSnapshotInput {
  layout: ReaderChapterLayout | null | undefined;
  pageIndex: number;
  chapterHtml?: string;
  viewportRoot?: HTMLElement | null;
  contentRoot?: HTMLElement | null;
}

export function buildPagedBookmarkSnapshot(input: BuildPagedBookmarkSnapshotInput): {
  chapterPos: number;
  pageText: string;
  pageIndex: number;
  pageCount: number;
} {
  const layout = input.layout;
  const pageCount = layout ? pageCountFromChapterLayout(layout) : 1;
  const safeIndex = Math.max(0, Math.min(input.pageIndex, pageCount - 1));
  const chapterPos = pagedBookmarkChapterPos(safeIndex, pageCount);

  const clipText = extractVisiblePagedClipText(input.viewportRoot);
  const domLineText =
    layout && input.contentRoot
      ? extractPageTextFromDomLines(input.contentRoot, layout, safeIndex)
      : '';
  const layoutText = layout?.pages[safeIndex]?.text?.trim() ?? '';
  const ratioText = input.chapterHtml
    ? fallbackExcerptAtRatio(input.chapterHtml, chapterPos)
    : '';

  const pageText = clipText || domLineText || layoutText || ratioText;

  return {
    chapterPos,
    pageText,
    pageIndex: safeIndex,
    pageCount,
  };
}
