import { describe, expect, it } from 'vitest';
import {
  textViewerChromeFooterOverlayVisible,
  textViewerOperationBarVisible,
} from '@/lib/media/text/text-viewer-chrome-visibility';

describe('text viewer chrome visibility', () => {
  it('overlay footer animates with header like other viewers', () => {
    expect(textViewerChromeFooterOverlayVisible(true)).toBe(true);
    expect(textViewerChromeFooterOverlayVisible(false)).toBe(false);
  });

  it('operation bar only on narrow screen when chrome visible', () => {
    expect(textViewerOperationBarVisible(false, true)).toBe(true);
    expect(textViewerOperationBarVisible(true, true)).toBe(false);
  });
});
