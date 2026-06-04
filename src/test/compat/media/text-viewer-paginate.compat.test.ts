import { describe, expect, it } from 'vitest';
import {
  clipSafetyPx,
  computePageStartsFromSegments,
  pageDisplayHeight,
  splitBlockIndicesByPageHeight,
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

  it('packs segments greedily with safety margin', () => {
    const lineH = 32;
    const safety = clipSafetyPx(18, 0.8);
    const clipHeight = 80;
    void (clipHeight - safety);
    const segments = [
      { top: 0, bottom: lineH },
      { top: lineH, bottom: lineH * 2 },
      { top: lineH * 2, bottom: lineH * 3 },
      { top: lineH * 3, bottom: lineH * 4 },
    ];
    const starts = computePageStartsFromSegments(segments, clipHeight, lineH * 4, safety);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBeGreaterThan(0);
    expect(starts.length).toBeGreaterThanOrEqual(2);
  });

  it('pageDisplayHeight follows last segment bottom not next page gap', () => {
    const segments = [
      { top: 0, bottom: 380 },
      { top: 400, bottom: 780 },
      { top: 800, bottom: 1100 },
    ];
    const starts = [0, 400, 800];
    expect(pageDisplayHeight(0, starts, 500, 1200, segments)).toBe(386);
    expect(pageDisplayHeight(1, starts, 500, 1200, segments)).toBe(386);
    expect(pageDisplayHeight(2, starts, 500, 1200, segments)).toBe(306);
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
