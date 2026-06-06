import { describe, expect, it } from 'vitest';
import {
  TEXT_VIEWER_DUAL_PAGE_XL_MIN_WIDTH_PX,
  textViewerDualPageActive,
  textViewerDualPageActiveInViewport,
} from '@/lib/media/text/reader-ui-config';

describe('textViewerDualPageActive', () => {
  it('uses xl breakpoint for auto mode', () => {
    expect(TEXT_VIEWER_DUAL_PAGE_XL_MIN_WIDTH_PX).toBe(1280);
    expect(textViewerDualPageActive('auto', true, 1279)).toBe(false);
    expect(textViewerDualPageActive('auto', true, 1280)).toBe(true);
  });

  it('always mode requires wide screen', () => {
    expect(textViewerDualPageActive('always', false, 2000)).toBe(false);
    expect(textViewerDualPageActive('always', true, 800)).toBe(true);
  });

  it('off mode is always false', () => {
    expect(textViewerDualPageActive('off', true, 2000)).toBe(false);
  });
});

describe('textViewerDualPageActiveInViewport', () => {
  it('auto enables on landscape below xl', () => {
    expect(textViewerDualPageActiveInViewport('auto', 1024, 768)).toBe(true);
    expect(textViewerDualPageActiveInViewport('auto', 600, 800)).toBe(false);
  });

  it('always enables for wide viewport', () => {
    expect(textViewerDualPageActiveInViewport('always', 800, 600)).toBe(true);
    expect(textViewerDualPageActiveInViewport('always', 400, 800)).toBe(false);
  });

  it('off is always false', () => {
    expect(textViewerDualPageActiveInViewport('off', 1920, 1080)).toBe(false);
  });
});
