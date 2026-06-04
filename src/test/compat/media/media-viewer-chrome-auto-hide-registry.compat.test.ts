import { describe, expect, it, vi } from 'vitest';
import { createMediaViewerChromeAutoHide } from '@/lib/media/media-viewer-chrome-auto-hide';
import {
  freezeMediaViewerChromeAutoHide,
  isMediaViewerChromeAutoHideSuspended,
  registerMediaViewerChromeAutoHideSession,
  resumeMediaViewerChromeAutoHide,
} from '@/lib/media/media-viewer-chrome-auto-hide-registry';

describe('media-viewer-chrome-auto-hide-registry', () => {
  it('freeze clears timer, shows chrome, and blocks auto hide until resume', () => {
    vi.useFakeTimers();
    const setHeaderVisible = vi.fn();
    const autoHide = createMediaViewerChromeAutoHide({
      enabled: () => true,
      isControlled: () => false,
      setHeaderVisible,
      canAutoHide: () => !isMediaViewerChromeAutoHideSuspended(),
    });

    registerMediaViewerChromeAutoHideSession({
      autoHide,
      showChrome: () => setHeaderVisible(true),
    });

    autoHide.revealSession();
    expect(setHeaderVisible).toHaveBeenCalledWith(true);

    freezeMediaViewerChromeAutoHide();
    expect(isMediaViewerChromeAutoHideSuspended()).toBe(true);

    vi.advanceTimersByTime(5000);
    expect(setHeaderVisible).not.toHaveBeenCalledWith(false);

    resumeMediaViewerChromeAutoHide();
    expect(isMediaViewerChromeAutoHideSuspended()).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(setHeaderVisible).toHaveBeenCalledWith(false);

    registerMediaViewerChromeAutoHideSession(null);
    vi.useRealTimers();
  });
});
