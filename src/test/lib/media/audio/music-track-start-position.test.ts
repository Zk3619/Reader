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
        rememberProgress: false,
        trackKey: 'kw:1',
        currentPositionSec: 188,
      }),
    ).toBe(188);
  });

  it('resets to 0 when switching tracks without rememberProgress', () => {
    expect(
      resolveMusicTrackStartPositionSec({
        sameTrack: false,
        rememberProgress: false,
        trackKey: 'kw:2',
        currentPositionSec: 240,
      }),
    ).toBe(0);
  });

  it('does not carry previous track end position into the next track', () => {
    expect(
      resolveMusicTrackStartPositionSec({
        sameTrack: false,
        rememberProgress: true,
        trackKey: 'kw:next',
        currentPositionSec: 240,
      }),
    ).toBe(0);
  });

  it('restores remembered progress for the target track only', () => {
    saveMusicTrackProgress('kw:next', 42);
    expect(store.get(MUSIC_TRACK_PROGRESS_STORAGE_KEY)).toContain('kw:next');
    expect(
      resolveMusicTrackStartPositionSec({
        sameTrack: false,
        rememberProgress: true,
        trackKey: 'kw:next',
        currentPositionSec: 240,
      }),
    ).toBe(42);
  });

  it('treats near-end remembered progress as finished (start at 0)', () => {
    saveMusicTrackProgress('kw:1', 198);
    expect(
      resolveMusicTrackStartPositionSec({
        sameTrack: false,
        rememberProgress: true,
        trackKey: 'kw:1',
        currentPositionSec: 0,
        durationSec: 200,
      }),
    ).toBe(0);
    clearMusicTrackProgress('kw:1');
  });
});
