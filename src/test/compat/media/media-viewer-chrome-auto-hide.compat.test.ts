import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEDIA_VIEWER_CHROME_AUTO_HIDE_MS,
  createMediaViewerChromeAutoHide,
} from '@/lib/media/media-viewer-chrome-auto-hide';

describe('media viewer chrome auto hide', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('revealSession shows bars then hides after delay', () => {
    let visible = false;
    const auto = createMediaViewerChromeAutoHide({
      enabled: () => true,
      isControlled: () => false,
      setHeaderVisible: (v) => {
        visible = v;
      },
    });
    auto.revealSession();
    expect(visible).toBe(true);
    vi.advanceTimersByTime(MEDIA_VIEWER_CHROME_AUTO_HIDE_MS);
    expect(visible).toBe(false);
    auto.dispose();
  });

  it('does not schedule hide when canAutoHide is false', () => {
    let visible = true;
    const auto = createMediaViewerChromeAutoHide({
      enabled: () => true,
      isControlled: () => false,
      setHeaderVisible: (v) => {
        visible = v;
      },
      canAutoHide: () => false,
    });
    auto.revealSession();
    vi.advanceTimersByTime(MEDIA_VIEWER_CHROME_AUTO_HIDE_MS);
    expect(visible).toBe(true);
    auto.dispose();
  });
});
