import { describe, expect, it, vi } from 'vitest';
import { createMediaViewerChromeAutoHide } from '@/lib/media/media-viewer-chrome-auto-hide';
import {
  freezeMediaViewerChromeAutoHide,
  holdMediaViewerChromeAutoHide,
  isMediaViewerChromeAutoHideSuspended,
  registerMediaViewerChromeAutoHideSession,
  releaseMediaViewerChromeAutoHide,
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

  it('hold clears timer during slider drag and restarts after release', () => {
    vi.useFakeTimers();
    const setHeaderVisible = vi.fn();
    const autoHide = createMediaViewerChromeAutoHide({
      enabled: () => true,
      isControlled: () => false,
      setHeaderVisible,
      canAutoHide: () => !isMediaViewerChromeAutoHideSuspended(),
    });

    registerMediaViewerChromeAutoHideSession({ autoHide, showChrome: () => setHeaderVisible(true) });
    autoHide.revealSession();

    holdMediaViewerChromeAutoHide();
    expect(isMediaViewerChromeAutoHideSuspended()).toBe(true);

    vi.advanceTimersByTime(5000);
    expect(setHeaderVisible).not.toHaveBeenCalledWith(false);

    releaseMediaViewerChromeAutoHide();
    expect(isMediaViewerChromeAutoHideSuspended()).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(setHeaderVisible).toHaveBeenCalledWith(false);

    registerMediaViewerChromeAutoHideSession(null);
    vi.useRealTimers();
  });
});
