import { describe, expect, it } from 'vitest';
import {
  appToastPositionOptions,
  appToastSwipeDirections,
  normalizeAppToastExpand,
  normalizeAppToastPosition,
  normalizeAppToastVisibleLimit,
  resolveSonnerToasterExpand,
} from '@/lib/ui/app-toast-config';

describe('app-toast-config', () => {
  it('normalizes visible limit', () => {
    expect(normalizeAppToastVisibleLimit(undefined)).toBe(3);
    expect(normalizeAppToastVisibleLimit(1)).toBe(1);
    expect(normalizeAppToastVisibleLimit(6)).toBe(6);
    expect(normalizeAppToastVisibleLimit(99)).toBe(6);
    expect(normalizeAppToastVisibleLimit(0)).toBe(1);
    expect(normalizeAppToastVisibleLimit(Number.NaN)).toBe(3);
  });

  it('normalizes expand toggle', () => {
    expect(normalizeAppToastExpand(undefined)).toBe(true);
    expect(normalizeAppToastExpand(false)).toBe(false);
    expect(normalizeAppToastExpand(true)).toBe(true);
  });

  it('maps stack scaling to Sonner expand (inverted)', () => {
    expect(resolveSonnerToasterExpand(true)).toBe(false);
    expect(resolveSonnerToasterExpand(false)).toBe(true);
    expect(resolveSonnerToasterExpand(undefined)).toBe(false);
  });

  it('clamps corner positions on compact mobile', () => {
    expect(normalizeAppToastPosition('bottom-right', true)).toBe('bottom-center');
    expect(normalizeAppToastPosition('top-left', true)).toBe('top-center');
    expect(normalizeAppToastPosition('top-center', true)).toBe('top-center');
  });

  it('keeps corner positions on desktop', () => {
    expect(normalizeAppToastPosition('bottom-right', false)).toBe('bottom-right');
  });

  it('exposes mobile-only position options when compact', () => {
    expect(appToastPositionOptions(true)).toEqual(['top-center', 'bottom-center']);
    expect(appToastPositionOptions(false).length).toBe(6);
  });

  it('derives swipe directions from position', () => {
    expect(appToastSwipeDirections('bottom-right')).toEqual(['bottom', 'right']);
    expect(appToastSwipeDirections('top-center')).toEqual(['top']);
  });
});
