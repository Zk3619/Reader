import { describe, expect, it } from 'vitest';
import {
  assignSegmentsBySpreadFillLeft,
  computeDualSpreadPageStarts,
  contentBlockIndicesForColumn,
  contentBlockIndicesForSpreadPage,
  columnShowsChapterTitle,
  dualSpreadColumnPackLimit,
  dualSpreadColumnWidthPx,
  normalizeDualColumnSegments,
  sortSegmentsReadingOrder,
} from '@/lib/media/text/text-viewer-paginate-dual';
import {
  computePageStartsFromSegments,
  type ReaderLayoutSegment,
} from '@/lib/media/text/text-viewer-paginate';

describe('dualSpreadColumnWidthPx', () => {
  it('matches live pane width formula (spread − gap) / 2', () => {
    expect(dualSpreadColumnWidthPx(1000, 32)).toBe(484);
    expect(dualSpreadColumnPackLimit(929)).toBe(929);
  });
});

describe('computeDualSpreadPageStarts', () => {
  const clipHeight = 80;
  const lineH = 32;

  it('breaks pages on block boundaries when a block has multiple line segments', () => {
    const segments: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, column: 0, blockIndex: 1 },
      { top: lineH, bottom: lineH * 2, column: 0, blockIndex: 2 },
      { top: lineH * 2, bottom: lineH * 3, column: 0, blockIndex: 3 },
      { top: lineH * 3, bottom: lineH * 4, column: 0, blockIndex: 3 },
      { top: lineH * 4, bottom: lineH * 5, column: 0, blockIndex: 3 },
      { top: 0, bottom: lineH, column: 1, blockIndex: 4 },
    ];
    const { pageStarts } = computeDualSpreadPageStarts(segments, clipHeight, lineH * 5);
    expect(pageStarts).toEqual([0, lineH * 2, lineH * 2 + clipHeight]);
  });

  it('merges independent column pagination by spread index', () => {
    const leftSegs: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, column: 0 },
      { top: lineH, bottom: lineH * 2, column: 0 },
      { top: lineH * 2, bottom: lineH * 3, column: 0 },
      { top: lineH * 3, bottom: lineH * 4, column: 0 },
    ];
    const rightSegs: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, column: 1 },
      { top: lineH, bottom: lineH * 2, column: 1 },
    ];
    const segments = [...leftSegs, ...rightSegs];

    const leftStarts = computePageStartsFromSegments(leftSegs, clipHeight, lineH * 4, 0);
    const rightStarts = computePageStartsFromSegments(rightSegs, clipHeight, lineH * 2, 0);

    const { pageStarts, rightPageStarts, leftLineSizes } = computeDualSpreadPageStarts(
      segments,
      clipHeight,
      lineH * 4,
    );

    expect(leftStarts).toEqual([0, lineH * 2]);
    expect(rightStarts).toEqual([0]);
    expect(pageStarts).toEqual([0, lineH * 2]);
    expect(rightPageStarts).toEqual([0, lineH * 2]);
    expect(leftLineSizes[0]).toBe(2);
    expect(leftLineSizes[1]).toBe(2);
  });

  it('uses column extent when shorter column is exhausted', () => {
    const segments: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, column: 0 },
      { top: lineH, bottom: lineH * 2, column: 0 },
      { top: lineH * 2, bottom: lineH * 3, column: 0 },
      { top: lineH * 3, bottom: lineH * 4, column: 0 },
      { top: 0, bottom: lineH, column: 1 },
    ];
    const { pageStarts, rightPageStarts } = computeDualSpreadPageStarts(
      segments,
      clipHeight,
      lineH * 4,
    );
    expect(pageStarts.length).toBe(2);
    expect(rightPageStarts[0]).toBe(0);
    expect(rightPageStarts[1]).toBe(lineH);
  });

  it('returns single spread when both columns fit one page', () => {
    const segments: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, column: 0 },
      { top: lineH, bottom: lineH * 2, column: 0 },
      { top: 0, bottom: lineH, column: 1 },
      { top: lineH, bottom: lineH * 2, column: 1 },
    ];
    const { pageStarts, rightPageStarts, leftLineSizes } = computeDualSpreadPageStarts(
      segments,
      clipHeight,
      lineH * 2,
    );
    expect(pageStarts).toEqual([0]);
    expect(rightPageStarts).toEqual([0]);
    expect(leftLineSizes[0]).toBe(2);
  });

  it('sorts reading order column-first', () => {
    const segments: ReaderLayoutSegment[] = [
      { top: 100, bottom: 132, column: 1 },
      { top: 0, bottom: 32, column: 0 },
    ];
    const sorted = sortSegmentsReadingOrder(segments);
    expect(sorted[0]!.column).toBe(0);
    expect(sorted[1]!.column).toBe(1);
  });

  it('normalizes Y per column for independent pagination', () => {
    const segments: ReaderLayoutSegment[] = [
      { top: 0, bottom: 32, column: 0 },
      { top: 32, bottom: 64, column: 0 },
      { top: 200, bottom: 232, column: 1 },
      { top: 232, bottom: 264, column: 1 },
    ];
    const { normalized, leftExtent, rightExtent } = normalizeDualColumnSegments(segments);
    expect(normalized.filter((s) => s.column === 0).map((s) => s.top)).toEqual([0, 32]);
    expect(normalized.filter((s) => s.column === 1).map((s) => s.top)).toEqual([0, 32]);
    expect(leftExtent).toBe(64);
    expect(rightExtent).toBe(64);
  });
});

describe('assignSegmentsBySpreadFillLeft', () => {
  const clipHeight = 80;
  const lineH = 32;

  it('fills left column before right within a spread', () => {
    const raw: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, blockIndex: 0 },
      { top: lineH, bottom: lineH * 2, blockIndex: 1 },
      { top: lineH * 2, bottom: lineH * 3, blockIndex: 2 },
      { top: lineH * 3, bottom: lineH * 4, blockIndex: 3 },
    ];
    const assigned = assignSegmentsBySpreadFillLeft(raw, clipHeight);
    const left = assigned.filter((s) => s.column === 0);
    const right = assigned.filter((s) => s.column === 1);
    expect(left.map((s) => s.blockIndex)).toEqual([0, 1]);
    expect(right.map((s) => s.blockIndex)).toEqual([2, 3]);
    expect(left.reduce((sum, s) => sum + (s.bottom - s.top), 0)).toBeLessThanOrEqual(clipHeight + 0.5);
  });

  it('preserves measured gap between blocks in the same column spread', () => {
    const blockGap = 16;
    const raw: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, blockIndex: 0 },
      { top: lineH + blockGap, bottom: lineH * 2 + blockGap, blockIndex: 1 },
      { top: lineH * 2 + blockGap * 2, bottom: lineH * 3 + blockGap * 2, blockIndex: 2 },
    ];
    const assigned = assignSegmentsBySpreadFillLeft(raw, clipHeight);
    const left = assigned.filter((s) => s.column === 0);
    expect(left).toHaveLength(2);
    expect(left[0]!.top).toBe(0);
    expect(left[0]!.bottom).toBe(lineH);
    expect(left[1]!.top).toBe(lineH + blockGap);
    expect(left[1]!.bottom).toBe(lineH * 2 + blockGap);
  });

  it('switches column using repacked height including block gaps', () => {
    const blockGap = 16;
    const clip = 80;
    const raw: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, blockIndex: 0 },
      { top: lineH + blockGap, bottom: lineH * 2 + blockGap, blockIndex: 1 },
      { top: lineH * 2 + blockGap * 2, bottom: lineH * 3 + blockGap * 2, blockIndex: 2 },
      { top: lineH * 3 + blockGap * 3, bottom: lineH * 4 + blockGap * 3, blockIndex: 3 },
    ];
    const assigned = assignSegmentsBySpreadFillLeft(raw, clip);
    const left = assigned.filter((s) => s.column === 0);
    const right = assigned.filter((s) => s.column === 1);
    expect(left.map((s) => s.blockIndex)).toEqual([0, 1]);
    expect(right.map((s) => s.blockIndex)).toEqual([2, 3]);
    expect(left[left.length - 1]!.bottom - left[0]!.top).toBeLessThanOrEqual(clip + 0.5);
  });

  it('does not split a multi-line block across left and right columns', () => {
    const lineH = 32;
    const clip = 80;
    const raw: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, blockIndex: 0 },
      { top: lineH, bottom: lineH * 2, blockIndex: 1 },
      { top: lineH * 2, bottom: lineH * 3, blockIndex: 2 },
      { top: lineH * 3, bottom: lineH * 4, blockIndex: 2 },
      { top: lineH * 4, bottom: lineH * 5, blockIndex: 2 },
      { top: lineH * 5, bottom: lineH * 6, blockIndex: 3 },
    ];
    const assigned = assignSegmentsBySpreadFillLeft(raw, clip);
    const block2Cols = new Set(
      assigned.filter((s) => s.blockIndex === 2).map((s) => s.column),
    );
    expect(block2Cols.size).toBe(1);
  });

  it('moves a trailing single-line block to the right when it would clip the left column', () => {
    const lineH = 32;
    const clip = 80;
    const raw: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, blockIndex: 0 },
      { top: lineH, bottom: lineH * 2, blockIndex: 1 },
      { top: lineH * 2, bottom: clip - 4, blockIndex: 2 },
      { top: clip - 4, bottom: clip + lineH - 4, blockIndex: 3 },
    ];
    const assigned = assignSegmentsBySpreadFillLeft(raw, clip);
    const leftBlocks = new Set(
      assigned.filter((s) => s.column === 0).map((s) => s.blockIndex),
    );
    const rightBlocks = new Set(
      assigned.filter((s) => s.column === 1).map((s) => s.blockIndex),
    );
    expect(leftBlocks.has(3)).toBe(false);
    expect(rightBlocks.has(3)).toBe(true);
    const leftBottom = Math.max(
      ...assigned.filter((s) => s.column === 0).map((s) => s.bottom),
    );
    expect(leftBottom).toBeLessThanOrEqual(clip + 0.5);
  });

  it('stacks next-spread left column without gap from skipped right-column blocks', () => {
    const lineH = 32;
    const clip = 80;
    const raw: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, blockIndex: 0 },
      { top: lineH, bottom: lineH * 2, blockIndex: 1 },
      { top: lineH * 2, bottom: lineH * 3, blockIndex: 2 },
      { top: lineH * 3, bottom: lineH * 4, blockIndex: 3 },
      { top: lineH * 4, bottom: lineH * 5, blockIndex: 4 },
      { top: lineH * 5, bottom: lineH * 6, blockIndex: 5 },
    ];
    const assigned = assignSegmentsBySpreadFillLeft(raw, clip);
    const left = assigned.filter((s) => s.column === 0);
    expect(left.map((s) => s.blockIndex)).toEqual([0, 1, 4, 5]);
    const spread1LastLeft = left.find((s) => s.blockIndex === 1)!;
    const spread2FirstLeft = left.find((s) => s.blockIndex === 4)!;
    expect(spread2FirstLeft.top).toBe(spread1LastLeft.bottom);
  });
});

describe('contentBlockIndicesForSpreadPage', () => {
  it('returns blocks that fit entirely on the spread page', () => {
    const layout = {
      pageStarts: [0, 64],
      rightPageStarts: [0, 32],
      dualPage: true as const,
      clipHeight: 128,
      contentExtent: 200,
      leftColumnExtent: 128,
      rightColumnExtent: 64,
      segments: [
        { top: 0, bottom: 32, column: 0, blockIndex: 0 },
        { top: 32, bottom: 64, column: 0, blockIndex: 1 },
        { top: 64, bottom: 96, column: 0, blockIndex: 2 },
        { top: 0, bottom: 32, column: 1, blockIndex: 3 },
        { top: 32, bottom: 64, column: 1, blockIndex: 4 },
      ],
    };
    expect(contentBlockIndicesForSpreadPage(layout, 0, 0)).toEqual([0]);
    expect(contentBlockIndicesForSpreadPage(layout, 0, 1)).toEqual([1]);
    expect(contentBlockIndicesForSpreadPage(layout, 1, 0)).toEqual([2]);
    expect(contentBlockIndicesForSpreadPage(layout, 1, 1)).toEqual([3]);
  });

  it('excludes multi-line blocks that straddle the page boundary', () => {
    const layout = {
      pageStarts: [0, 64],
      rightPageStarts: [0, 0],
      dualPage: true as const,
      clipHeight: 128,
      contentExtent: 200,
      leftColumnExtent: 128,
      rightColumnExtent: 64,
      segments: [
        { top: 0, bottom: 32, column: 0, blockIndex: 1 },
        { top: 32, bottom: 64, column: 0, blockIndex: 2 },
        { top: 64, bottom: 80, column: 0, blockIndex: 3 },
        { top: 80, bottom: 112, column: 0, blockIndex: 3 },
      ],
    };
    expect(contentBlockIndicesForSpreadPage(layout, 0, 0)).toEqual([0, 1]);
    expect(contentBlockIndicesForSpreadPage(layout, 0, 1)).toEqual([2]);
  });

  it('drops trailing blocks that would exceed clipHeight in the column stack', () => {
    const clipHeight = 80;
    const layout = {
      pageStarts: [0],
      rightPageStarts: [0],
      dualPage: true as const,
      clipHeight,
      contentExtent: 200,
      leftColumnExtent: 80,
      rightColumnExtent: 0,
      segments: [
        { top: 0, bottom: 32, column: 0, blockIndex: 1 },
        { top: 32, bottom: 64, column: 0, blockIndex: 2 },
        { top: 64, bottom: 96, column: 0, blockIndex: 3 },
      ],
    };
    expect(contentBlockIndicesForSpreadPage(layout, 0, 0)).toEqual([0, 1]);
  });

  it('stacks from column top when first spread left page shows chapter title', () => {
    const clipHeight = 80;
    const titleH = 32;
    const lineH = 32;
    const layout = {
      pageStarts: [0],
      rightPageStarts: [0],
      dualPage: true as const,
      clipHeight,
      contentExtent: 200,
      leftColumnExtent: 128,
      rightColumnExtent: 0,
      segments: [
        { top: 0, bottom: titleH, column: 0, blockIndex: 0 },
        { top: titleH, bottom: titleH + lineH, column: 0, blockIndex: 1 },
        { top: titleH + lineH, bottom: titleH + lineH * 2, column: 0, blockIndex: 2 },
        {
          top: titleH + lineH * 2,
          bottom: titleH + lineH * 3,
          column: 0,
          blockIndex: 3,
        },
      ],
    };
    expect(contentBlockIndicesForSpreadPage(layout, 0, 0)).toEqual([0]);
  });
});

describe('contentBlockIndicesForColumn', () => {
  it('maps measure block indices to content block indices', () => {
    const segments: ReaderLayoutSegment[] = [
      { top: 0, bottom: 32, column: 0, blockIndex: 0 },
      { top: 32, bottom: 64, column: 0, blockIndex: 1 },
      { top: 0, bottom: 32, column: 1, blockIndex: 2 },
    ];
    expect(columnShowsChapterTitle(segments, 0)).toBe(true);
    expect(columnShowsChapterTitle(segments, 1)).toBe(false);
    expect(contentBlockIndicesForColumn(segments, 0)).toEqual([0]);
    expect(contentBlockIndicesForColumn(segments, 1)).toEqual([1]);
  });
});
