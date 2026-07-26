import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolvePlaybackEngineWithPrefs,
} from '@/lib/media/video/playback/router';
import {
  getVideoPlaybackPrefs,
  setVideoPlaybackPrefs,
  shouldDivertHubFromArtplayer,
} from '@/lib/media/video/playback/prefs';
import {
  isArtplayerOnlyProfile,
  setArtplayerOnlyProfileForTest,
} from '@/lib/media/video/playback/video-profile';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

describe('artplayer-only video profile (default lite)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    setArtplayerOnlyProfileForTest(null);
  });

  afterEach(() => {
    setArtplayerOnlyProfileForTest(null);
    vi.unstubAllGlobals();
  });

  it('defaults to artplayer-only when VITE_VIDEO_PROFILE is unset', () => {
    expect(isArtplayerOnlyProfile()).toBe(true);
  });

  it('isArtplayerOnlyProfile follows test override', () => {
    setArtplayerOnlyProfileForTest(false);
    expect(isArtplayerOnlyProfile()).toBe(false);
    setArtplayerOnlyProfileForTest(true);
    expect(isArtplayerOnlyProfile()).toBe(true);
  });

  it('router maps libmpv/media3 to artplayer but keeps external', () => {
    setArtplayerOnlyProfileForTest(true);
    expect(
      resolvePlaybackEngineWithPrefs(
        { url: 'C:\\Videos\\a.mp4', sourceKind: 'file' },
        { forceEngine: 'libmpv', localEngine: 'libmpv' },
      ),
    ).toBe('artplayer');
    expect(
      resolvePlaybackEngineWithPrefs(
        { url: 'https://cdn.example/a.m3u8', sourceKind: 'sniff' },
        { forceEngine: 'external', localEngine: 'external' },
      ),
    ).toBe('external');
    expect(
      resolvePlaybackEngineWithPrefs(
        { url: 'C:\\Videos\\a.mp4', sourceKind: 'file' },
        { forceEngine: 'auto', localEngine: 'external' },
      ),
    ).toBe('external');
  });

  it('shouldDivertHubFromArtplayer is true only for external in lite', () => {
    setArtplayerOnlyProfileForTest(true);
    setVideoPlaybackPrefs({ forceEngine: 'libmpv' });
    expect(shouldDivertHubFromArtplayer()).toBe(false);
    setVideoPlaybackPrefs({ forceEngine: 'external' });
    expect(shouldDivertHubFromArtplayer()).toBe(true);
  });

  it('getVideoPlaybackPrefs overlays libmpv/media3 without rewriting storage', () => {
    setArtplayerOnlyProfileForTest(false);
    setVideoPlaybackPrefs({
      forceEngine: 'libmpv',
      localEngine: 'libmpv',
      androidFallbackMedia3: true,
    });
    setArtplayerOnlyProfileForTest(true);
    const overlay = getVideoPlaybackPrefs();
    expect(overlay.forceEngine).toBe('artplayer');
    expect(overlay.localEngine).toBe('artplayer');
    expect(overlay.androidFallbackMedia3).toBe(false);

    setArtplayerOnlyProfileForTest(false);
    const stored = getVideoPlaybackPrefs();
    expect(stored.forceEngine).toBe('libmpv');
    expect(stored.localEngine).toBe('libmpv');
    expect(stored.androidFallbackMedia3).toBe(true);
  });

  it('preserves external prefs through lite overlay', () => {
    setArtplayerOnlyProfileForTest(false);
    setVideoPlaybackPrefs({
      forceEngine: 'external',
      localEngine: 'external',
      externalKind: 'mpv',
    });
    setArtplayerOnlyProfileForTest(true);
    const overlay = getVideoPlaybackPrefs();
    expect(overlay.forceEngine).toBe('external');
    expect(overlay.localEngine).toBe('external');
    expect(overlay.externalKind).toBe('mpv');
  });
});
