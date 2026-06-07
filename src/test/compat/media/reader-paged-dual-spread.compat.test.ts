import { describe, expect, it } from 'vitest';
import {
  dualSpreadShiftLayoutStyle,
  dualSpreadShiftTransform,
  dualSpreadYOffset,
  inferDualSpreadRightStart,
} from '@/lib/media/text/reader-paged-dual-spread';

describe('dualSpreadYOffset', () => {
  it('returns same Y for single column layout', () => {
    expect(dualSpreadYOffset({ pageStarts: [0, 400], dualPage: false } as never, 0)).toEqual({
      leftY: 0,
      rightY: 0,
    });
  });

  it('returns zero Y for dual spread (per-page block slice)', () => {
    expect(
      dualSpreadYOffset(
        {
          pageStarts: [0, 64],
          rightPageStarts: [0, 32],
          dualPage: true,
        } as never,
        1,
      ),
    ).toEqual({ leftY: 0, rightY: 0 });
  });

  it('infers right Y from column-1 segments when rightPageStarts missing', () => {
    expect(
      dualSpreadYOffset(
        {
          pageStarts: [0, 400],
          segments: [
            { top: 0, bottom: 32, column: 0 },
            { top: 0, bottom: 32, column: 1 },
          ],
          dualPage: true,
          contentExtent: 800,
        } as never,
        0,
      ),
    ).toEqual({ leftY: 0, rightY: 0 });
  });
});

describe('inferDualSpreadRightStart', () => {
  it('uses stored rightPageStarts when present', () => {
    expect(
      inferDualSpreadRightStart(
        {
          pageStarts: [0, 64],
          rightPageStarts: [0, 48],
          segments: [],
          dualPage: true,
          contentExtent: 200,
        },
        1,
      ),
    ).toBe(48);
  });

  it('falls back to paginated right column start', () => {
    expect(
      inferDualSpreadRightStart(
        {
          pageStarts: [0],
          segments: [{ top: 0, bottom: 44, column: 1 }],
          dualPage: true,
          contentExtent: 100,
          clipHeight: 80,
        },
        0,
      ),
    ).toBe(0);
  });
});

describe('dualSpreadShiftTransform', () => {
  it('applies translateY only', () => {
    expect(dualSpreadShiftTransform(0)).toBeUndefined();
    expect(dualSpreadShiftTransform(64)).toBe('translate3d(0, -64px, 0)');
  });
});

describe('dualSpreadShiftLayoutStyle', () => {
  it('sets column pane width to 100% with optional min-height', () => {
    expect(dualSpreadShiftLayoutStyle(800, 'left', 1200)).toEqual({
      width: '100%',
      'min-height': '1200px',
    });
    expect(dualSpreadShiftLayoutStyle(800, 'right')).toEqual({
      width: '100%',
      'min-height': undefined,
    });
  });
});
