import { describe, expect, it } from 'vitest';
import {
  computePageStartsFromSegments,
  dualSpreadColumnContentSpanPx,
  pageContentSpanPx,
  pageDisplayHeight,
  pagePackLimitPx,
  snapContiguousMeasureBlocks,
  splitBlockIndicesByPageHeight,
  lastNonBlankPageIndex,
} from '@/lib/media/text/text-viewer-paginate';

describe('computePageStartsFromSegments', () => {
  it('returns single page when content fits', () => {
    expect(
      computePageStartsFromSegments(
        [
          { top: 0, bottom: 20 },
          { top: 24, bottom: 44 },
        ],
        800,
        undefined,
        30,
      ),
    ).toEqual([0]);
  });

  it('packs segments to full clip height without inner pad', () => {
    const lineH = 32;
    const clipHeight = 80;
    const segments = [
      { top: 0, bottom: lineH },
      { top: lineH, bottom: lineH * 2 },
      { top: lineH * 2, bottom: lineH * 3 },
      { top: lineH * 3, bottom: lineH * 4 },
    ];
    const starts = computePageStartsFromSegments(segments, clipHeight, lineH * 4, 0);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBeGreaterThan(0);
    expect(starts.length).toBeGreaterThanOrEqual(2);
  });

  it('pagePackLimitPx equals full page-window height', () => {
    expect(pagePackLimitPx(0, 749)).toBe(749);
    expect(pagePackLimitPx(736, 749)).toBe(1485);
  });

  it('includes trailing line when it fits in full 749px window', () => {
    const clipHeight = 749;
    const segments = [
      { top: 640, bottom: 672 },
      { top: 672, bottom: 704 },
      { top: 704, bottom: 736 },
      { top: 736, bottom: 768 },
    ];
    const starts = computePageStartsFromSegments(segments, clipHeight, 768, 0);
    expect(starts).toEqual([0, 736]);
  });

  it('keeps tail line when only line spacing exceeds clip', () => {
    const clipHeight = 749;
    const segments = [
      { top: 640, bottom: 672, textBottom: 664 },
      { top: 672, bottom: 704, textBottom: 696 },
      { top: 704, bottom: 736, textBottom: 728 },
      { top: 736, bottom: 768, textBottom: 736 },
    ];
    expect(computePageStartsFromSegments(segments, clipHeight, 768, 0)).toEqual([0]);
  });

  it('ignores trailing paragraph gap when text fits on page', () => {
    const clipHeight = 100;
    const segments = [
      { top: 0, bottom: 80, textBottom: 72 },
      { top: 72, bottom: 96, textBottom: 72 },
    ];
    expect(computePageStartsFromSegments(segments, clipHeight, 96, 0)).toEqual([0]);
  });

  it('still breaks when glyph bottom exceeds clip', () => {
    const clipHeight = 749;
    const segments = [{ top: 717, bottom: 781, textBottom: 760 }];
    expect(computePageStartsFromSegments(segments, clipHeight, 781, 0)).toEqual([0, 717]);
  });

  it('breaks at line touching clip bottom', () => {
    const clipHeight = 749;
    const segments = [
      { top: 717, bottom: 749 },
      { top: 749, bottom: 781 },
    ];
    expect(computePageStartsFromSegments(segments, clipHeight, 781, 0)).toEqual([0, 749]);
  });

  it('pageDisplayHeight follows last segment bottom not next page gap', () => {
    const segments = [
      { top: 0, bottom: 380 },
      { top: 400, bottom: 780 },
      { top: 800, bottom: 1100 },
    ];
    const starts = [0, 400, 800];
    expect(pageDisplayHeight(0, starts, 500, 1200, segments)).toBe(380);
    expect(pageDisplayHeight(1, starts, 500, 1200, segments)).toBe(380);
    expect(pageDisplayHeight(2, starts, 500, 1200, segments)).toBe(300);
  });

  it('pageDisplayHeight includes straddling segment tail on last page', () => {
    const clipHeight = 749;
    const segments = [
      { top: 640, bottom: 672 },
      { top: 672, bottom: 704 },
      { top: 704, bottom: 736 },
      { top: 717, bottom: 768 },
    ];
    const starts = [0, 736];
    expect(pageDisplayHeight(1, starts, clipHeight, 768, segments)).toBe(32);
  });

  it('paginates oversized block that started on a prior page', () => {
    const clipHeight = 749;
    const segments = [{ top: 0, bottom: 1500 }];
    expect(computePageStartsFromSegments(segments, clipHeight, 1500, 0)).toEqual([
      0, 749, 1498,
    ]);
  });
});

describe('pageContentSpanPx', () => {
  it('caps span at live clip height when layout clip is stale', () => {
    const layout = {
      pageStarts: [0, 736],
      clipHeight: 800,
      contentExtent: 768,
      segments: [
        { top: 640, bottom: 672 },
        { top: 672, bottom: 704 },
        { top: 704, bottom: 736 },
      ],
      pages: [{ displayHeight: 736 }],
    };
    expect(pageContentSpanPx(0, layout, 749)).toBe(736);
    expect(pageContentSpanPx(0, layout, 700)).toBe(700);
  });

  it('uses full live clip for dual-page spread block slicing', () => {
    const layout = {
      pageStarts: [0, 400],
      rightPageStarts: [0, 32],
      clipHeight: 500,
      contentExtent: 2000,
      segments: [
        { top: 0, bottom: 380, column: 0 as const },
        { top: 0, bottom: 32, column: 1 as const },
      ],
      dualPage: true,
    };
    expect(pageContentSpanPx(0, layout, 749)).toBe(749);
    expect(pageContentSpanPx(0, layout, 300)).toBe(300);
    expect(dualSpreadColumnContentSpanPx(0, 'left', layout, 749)).toBe(749);
    expect(dualSpreadColumnContentSpanPx(0, 'right', layout, 749)).toBe(749);
  });

  it('falls back to live clip when dual layout has no column segments yet', () => {
    const layout = {
      pageStarts: [0],
      clipHeight: 697,
      contentExtent: 697,
      segments: [] as { top: number; bottom: number }[],
      dualPage: true,
    };
    expect(dualSpreadColumnContentSpanPx(0, 'left', layout, 697)).toBe(697);
    expect(dualSpreadColumnContentSpanPx(0, 'right', layout, 697)).toBe(697);
    expect(pageContentSpanPx(0, layout, 697)).toBe(697);
  });

  it('uses displayHeight when shorter than break span (paragraph gap)', () => {
    const layout = {
      pageStarts: [0, 400],
      clipHeight: 500,
      contentExtent: 1100,
      segments: [
        { top: 0, bottom: 380 },
        { top: 400, bottom: 780 },
      ],
    };
    expect(pageContentSpanPx(0, layout, 500)).toBe(380);
  });
});

describe('lastNonBlankPageIndex', () => {
  it('skips trailing blank page index without mutating starts', () => {
    const segments = [
      { top: 0, bottom: 32 },
      { top: 32, bottom: 64 },
      { top: 64, bottom: 96 },
    ];
    expect(lastNonBlankPageIndex([0, 64, 128], segments)).toBe(1);
    expect(lastNonBlankPageIndex([0], segments)).toBe(0);
  });

  it('keeps last page when a segment starts on that page', () => {
    const segments = [
      { top: 700, bottom: 732 },
      { top: 736, bottom: 768 },
    ];
    expect(lastNonBlankPageIndex([0, 736], segments)).toBe(1);
  });

  it('keeps last page when only a straddling segment tail is visible', () => {
    const segments = [{ top: 717, bottom: 768 }];
    expect(lastNonBlankPageIndex([0, 736], segments, 768)).toBe(1);
  });
});

describe('splitBlockIndicesByPageHeight (legacy)', () => {
  it('packs blocks until page height exceeded', () => {
    expect(splitBlockIndicesByPageHeight([100, 100, 100, 50], 250)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });
});

describe('snapContiguousMeasureBlocks', () => {
  it('removes spurious wrapper margin gaps between consecutive blocks', () => {
    const lineH = 28.8;
    const margin = 16;
    const blockFull = lineH + margin;
    const raw = [
      { top: 0, bottom: blockFull, textBottom: lineH, blockIndex: 0 },
      { top: blockFull + 8, bottom: blockFull * 2 + 8, textBottom: blockFull + 8 + lineH, blockIndex: 1 },
    ];
    const snapped = snapContiguousMeasureBlocks(raw, 20);
    expect(snapped[0]!.bottom).toBeCloseTo(snapped[1]!.top, 0);
  });

  it('preserves large intentional gaps such as figure spacing', () => {
    const raw = [
      { top: 0, bottom: 32, textBottom: 32, blockIndex: 0 },
      { top: 80, bottom: 112, textBottom: 112, blockIndex: 1 },
    ];
    const snapped = snapContiguousMeasureBlocks(raw, 20);
    expect(snapped[1]!.top).toBe(80);
  });
});
