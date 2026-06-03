import { describe, expect, it } from 'vitest';
import {
  TEXT_VIEWER_DUAL_PAGE_XL_MIN_WIDTH_PX,
  textViewerDualPageActive,
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
