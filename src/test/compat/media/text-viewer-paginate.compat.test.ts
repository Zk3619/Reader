import { describe, expect, it } from 'vitest';
import {
  computePageStarts,
  computePageStartsFromLines,
  splitBlockIndicesByPageHeight,
} from '@/lib/media/text/text-viewer-paginate';

describe('computePageStartsFromLines', () => {
  it('returns single page when content fits', () => {
    expect(
      computePageStartsFromLines([{ top: 0, height: 20 }, { top: 24, height: 20 }], 800),
    ).toEqual([0]);
  });

  it('breaks only at line boundaries', () => {
    const lines = [
      { top: 0, height: 22 },
      { top: 26, height: 22 },
      { top: 52, height: 22 },
      { top: 78, height: 22 },
      { top: 104, height: 22 },
    ];
    const starts = computePageStartsFromLines(lines, 80, 126);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBe(78);
    expect(starts).toHaveLength(2);
  });
});

describe('computePageStarts (block legacy)', () => {
  it('returns single page when content fits', () => {
    expect(computePageStarts([{ blockIndex: 0, top: 0, height: 200 }], 800)).toEqual([0]);
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
