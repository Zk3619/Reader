import { describe, expect, it } from 'vitest';
import {
  textViewerChromeFooterOverlayVisible,
  textViewerOperationBarVisible,
  textViewerStatusBarVisible,
} from '@/lib/media/text/text-viewer-chrome-visibility';

describe('text viewer chrome visibility', () => {
  it('status bar follows style when chrome is shown', () => {
    expect(textViewerStatusBarVisible('follow', true)).toBe(true);
    expect(textViewerStatusBarVisible('follow', false)).toBe(false);
    expect(textViewerStatusBarVisible('always', true)).toBe(true);
    expect(textViewerStatusBarVisible('never', true)).toBe(false);
  });

  it('overlay footer animates with header like other viewers', () => {
    expect(textViewerChromeFooterOverlayVisible(true)).toBe(true);
    expect(textViewerChromeFooterOverlayVisible(false)).toBe(false);
  });

  it('operation bar only on narrow screen when chrome visible', () => {
    expect(textViewerOperationBarVisible(false, true)).toBe(true);
    expect(textViewerOperationBarVisible(true, true)).toBe(false);
  });
});
