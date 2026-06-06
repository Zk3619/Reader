/**
 * 双栏物理页分页（对齐 Legado doublePage + leftLineSize）
 */

import type { ReaderTextPage } from '@/lib/media/text/reader-chapter-layout-types';
import {
  computePageStartsFromSegments,
  pageDisplayHeight,
  type ReaderLayoutSegment,
} from '@/lib/media/text/text-viewer-paginate';

export interface DualSpreadPageResult {
  pageStarts: number[];
  leftLineSizes: number[];
}

function segmentHeight(seg: ReaderLayoutSegment): number {
  return Math.max(1, seg.bottom - seg.top);
}

/** 阅读顺序：左栏自上而下，再右栏 */
export function sortSegmentsReadingOrder(segments: ReaderLayoutSegment[]): ReaderLayoutSegment[] {
  return [...segments].sort((a, b) => {
    const ca = a.column ?? 0;
    const cb = b.column ?? 0;
    if (ca !== cb) return ca - cb;
    return a.top - b.top || a.bottom - b.bottom;
  });
}

export function dualColumnForElement(rootRect: DOMRect, el: Element): 0 | 1 {
  const rect = el.getBoundingClientRect();
  const midX = rootRect.left + rootRect.width / 2;
  const centerX = rect.left + rect.width / 2;
  return centerX >= midX ? 1 : 0;
}

export function annotateSegmentsWithColumn(
  measureRoot: HTMLElement,
  segments: ReaderLayoutSegment[],
): ReaderLayoutSegment[] {
  const rootRect = measureRoot.getBoundingClientRect();
  const blocks = measureRoot.querySelectorAll<HTMLElement>('[data-reader-measure-block]');

  return segments.map((seg) => {
    let column: 0 | 1 = 0;
    for (const block of blocks) {
      const blockTop = block.getBoundingClientRect().top - rootRect.top;
      const blockBottom = block.getBoundingClientRect().bottom - rootRect.top;
      if (seg.top >= blockTop - 1 && seg.top < blockBottom + 1) {
        column = dualColumnForElement(rootRect, block);
        break;
      }
    }
    return { ...seg, column };
  });
}

export function computeDualSpreadPageStarts(
  segments: ReaderLayoutSegment[],
  clipHeight: number,
  _contentExtent: number,
  safetyPx?: number,
): DualSpreadPageResult {
  const packLimit = clipHeight;
  void safetyPx;
  const ordered = sortSegmentsReadingOrder(segments);

  if (ordered.length === 0) {
    return { pageStarts: [0], leftLineSizes: [0] };
  }

  const pageStarts: number[] = [Math.round(ordered[0]!.top)];
  const leftLineSizes: number[] = [];
  let col0Used = 0;
  let col1Used = 0;
  let leftCount = 0;
  let rightCount = 0;
  let onRight = false;

  const flushPage = (nextTop: number) => {
    leftLineSizes.push(onRight ? leftCount : leftCount + rightCount);
    pageStarts.push(Math.round(nextTop));
    col0Used = 0;
    col1Used = 0;
    leftCount = 0;
    rightCount = 0;
    onRight = false;
  };

  for (const seg of ordered) {
    const col = seg.column ?? 0;
    const h = segmentHeight(seg);

    if (col === 0) {
      if (onRight) {
        flushPage(seg.top);
      }
      if (col0Used > 0 && col0Used + h > packLimit) {
        flushPage(seg.top);
      }
      col0Used += h;
      leftCount += 1;
    } else {
      if (!onRight && col0Used > 0) {
        onRight = true;
      }
      if (col1Used > 0 && col1Used + h > packLimit) {
        flushPage(seg.top);
      }
      col1Used += h;
      rightCount += 1;
      onRight = true;
    }
  }

  if (leftLineSizes.length < pageStarts.length) {
    leftLineSizes.push(onRight ? leftCount : leftCount + rightCount);
  }

  return { pageStarts, leftLineSizes };
}

export function buildDualSpreadPages(
  pageStarts: number[],
  leftLineSizes: number[],
  clipHeight: number,
  contentExtent: number,
  segments: ReaderLayoutSegment[],
): ReaderTextPage[] {
  return pageStarts.map((startY, index) => ({
    index,
    startY,
    endY: pageStarts[index + 1] ?? contentExtent,
    displayHeight: pageDisplayHeight(
      index,
      pageStarts,
      clipHeight,
      contentExtent,
      segments,
    ),
    chapterPosition: 0,
    leftLineSize: leftLineSizes[index],
  }));
}

export function computePageStartsForLayout(
  segments: ReaderLayoutSegment[],
  clipHeight: number,
  contentExtent: number,
  options: {
    dualPage?: boolean;
    measureRoot?: HTMLElement;
    fontSize?: number;
    lineSpacing?: number;
    safetyPx?: number;
  },
): { pageStarts: number[]; leftLineSizes?: number[] } {
  const safety = options.safetyPx ?? 0;

  let segs = segments;
  if (options.dualPage && options.measureRoot) {
    segs = annotateSegmentsWithColumn(options.measureRoot, segments);
    const spread = computeDualSpreadPageStarts(segs, clipHeight, contentExtent, safety);
    return { pageStarts: spread.pageStarts, leftLineSizes: spread.leftLineSizes };
  }

  return {
    pageStarts: computePageStartsFromSegments(
      segs,
      clipHeight,
      contentExtent,
      safety,
      options.measureRoot,
    ),
  };
}
