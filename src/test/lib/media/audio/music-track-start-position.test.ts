import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveMusicTrackStartPositionSec,
  saveMusicTrackProgress,
  clearMusicTrackProgress,
  MUSIC_TRACK_PROGRESS_STORAGE_KEY,
} from '@/lib/media/audio/music-track-progress';

describe('resolveMusicTrackStartPositionSec', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps current position when re-applying the same track', () => {
    expect(
      resolveMusicTrackStartPositionSec({
        sameTrack: true,
        currentPositionSec: 188,
      }),
    ).toBe(188);
  });

  it('starts at 0 when switching tracks even if per-track progress exists', () => {
    saveMusicTrackProgress('kw:next', 42);
    expect(store.get(MUSIC_TRACK_PROGRESS_STORAGE_KEY)).toContain('kw:next');
    expect(
      resolveMusicTrackStartPositionSec({
        sameTrack: false,
        currentPositionSec: 240,
      }),
    ).toBe(0);
  });

  it('treats near-end same-track progress as finished (start at 0)', () => {
    expect(
      resolveMusicTrackStartPositionSec({
        sameTrack: true,
        currentPositionSec: 198,
        durationSec: 200,
      }),
    ).toBe(0);
  });

  it('clearMusicTrackProgress removes stored entry', () => {
    saveMusicTrackProgress('kw:1', 198);
    clearMusicTrackProgress('kw:1');
    expect(store.get(MUSIC_TRACK_PROGRESS_STORAGE_KEY)).not.toContain('"kw:1"');
  });
});
