import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  markPagedTurnPointerConsumed,
  resolvePagedDragAxis,
  shouldPreventTouchDefaultForPagedDrag,
  shouldSuppressPagedRegionalTap,
  shouldSuppressPagedTapAfterPointer,
} from '@/lib/media/text/reader-paged-pointer-gesture';

describe('resolvePagedDragAxis', () => {
  it('returns none inside deadzone', () => {
    expect(resolvePagedDragAxis(3, 4)).toBe('none');
  });

  it('locks horizontal when dx dominates', () => {
    expect(resolvePagedDragAxis(24, 6)).toBe('x');
  });

  it('locks vertical when dy dominates', () => {
    expect(resolvePagedDragAxis(6, 24)).toBe('y');
  });
});

describe('shouldSuppressPagedTapAfterPointer', () => {
  it('suppresses after drag turn', () => {
    expect(
      shouldSuppressPagedTapAfterPointer(2, 2, {
        turnStage: 'drag',
      }),
    ).toBe(true);
  });

  it('suppresses when movement exceeds tap threshold', () => {
    expect(shouldSuppressPagedTapAfterPointer(12, 0)).toBe(true);
    expect(shouldSuppressPagedTapAfterPointer(0, 0)).toBe(false);
  });
});

describe('shouldPreventTouchDefaultForPagedDrag', () => {
  it('only prevents for touch horizontal drag', () => {
    expect(
      shouldPreventTouchDefaultForPagedDrag({ pointerType: 'touch' }, 'x'),
    ).toBe(true);
    expect(
      shouldPreventTouchDefaultForPagedDrag({ pointerType: 'mouse' }, 'x'),
    ).toBe(false);
    expect(
      shouldPreventTouchDefaultForPagedDrag({ pointerType: 'touch' }, 'y'),
    ).toBe(false);
  });
});

describe('markPagedTurnPointerConsumed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('suppresses regional tap for a window', () => {
    expect(shouldSuppressPagedRegionalTap()).toBe(false);
    markPagedTurnPointerConsumed(400);
    expect(shouldSuppressPagedRegionalTap()).toBe(true);
    vi.advanceTimersByTime(401);
    expect(shouldSuppressPagedRegionalTap()).toBe(false);
  });
});
