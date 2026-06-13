import { describe, expect, it, vi } from 'vitest';
import {
  registerMediaViewerChromeBackSession,
  tryRevealMediaViewerChromeOnSystemBack,
} from '@/lib/media/media-viewer-chrome-back';

describe('media-viewer-chrome-back', () => {
  it('reveals chrome when hidden and collapsible', () => {
    let visible = false;
    const reveal = vi.fn(() => {
      visible = true;
    });
    registerMediaViewerChromeBackSession({
      isChromeVisible: () => visible,
      chromeBarsCollapsible: () => true,
      revealChrome: reveal,
    });
    expect(tryRevealMediaViewerChromeOnSystemBack()).toBe(true);
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(visible).toBe(true);
    expect(tryRevealMediaViewerChromeOnSystemBack()).toBe(false);
    registerMediaViewerChromeBackSession(null);
  });

  it('skips when chrome already visible or layout fixed', () => {
    const reveal = vi.fn();
    registerMediaViewerChromeBackSession({
      isChromeVisible: () => true,
      chromeBarsCollapsible: () => true,
      revealChrome: reveal,
    });
    expect(tryRevealMediaViewerChromeOnSystemBack()).toBe(false);
    registerMediaViewerChromeBackSession(null);

    registerMediaViewerChromeBackSession({
      isChromeVisible: () => false,
      chromeBarsCollapsible: () => false,
      revealChrome: reveal,
    });
    expect(tryRevealMediaViewerChromeOnSystemBack()).toBe(false);
    expect(reveal).not.toHaveBeenCalled();
    registerMediaViewerChromeBackSession(null);
  });
});
