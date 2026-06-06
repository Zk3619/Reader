import { describe, expect, it } from 'vitest';
import {
  computeDualSpreadPageStarts,
  sortSegmentsReadingOrder,
} from '@/lib/media/text/text-viewer-paginate-dual';
import type { ReaderLayoutSegment } from '@/lib/media/text/text-viewer-paginate';

describe('computeDualSpreadPageStarts', () => {
  const clipHeight = 400;
  const lineH = 32;

  it('packs left column then right before new page', () => {
    const segments: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, column: 0 },
      { top: lineH, bottom: lineH * 2, column: 0 },
      { top: 0, bottom: lineH, column: 1 },
      { top: lineH, bottom: lineH * 2, column: 1 },
    ];
    const { pageStarts, leftLineSizes } = computeDualSpreadPageStarts(
      segments,
      clipHeight,
      lineH * 4,
    );
    expect(pageStarts[0]).toBe(0);
    expect(leftLineSizes[0]).toBeGreaterThan(0);
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
});
