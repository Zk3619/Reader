import { describe, expect, it } from 'vitest';
import {
  computePageStartsFromSegments,
  pageDisplayHeight,
  pagePackLimitPx,
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
});

describe('splitBlockIndicesByPageHeight (legacy)', () => {
  it('packs blocks until page height exceeded', () => {
    expect(splitBlockIndicesByPageHeight([100, 100, 100, 50], 250)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });
});
