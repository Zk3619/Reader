import { describe, expect, it } from 'vitest';
import {
  appToastPositionOptions,
  appToastSwipeDirections,
  normalizeAppToastPosition,
  normalizeAppToastStyle,
} from '@/lib/ui/app-toast-config';

describe('app-toast-config', () => {
  it('normalizes toast style', () => {
    expect(normalizeAppToastStyle(undefined)).toBe('default');
    expect(normalizeAppToastStyle('sonner')).toBe('sonner');
    expect(normalizeAppToastStyle('toast')).toBe('toast');
    expect(normalizeAppToastStyle('invalid' as 'default')).toBe('default');
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
