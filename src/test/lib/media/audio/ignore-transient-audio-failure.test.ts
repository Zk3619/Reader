import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { shouldIgnoreTransientAudioFailure } from '@/lib/media/audio/ignore-transient-audio-failure';
import {
  consumeMusicAutoSkipSlot,
  resetMusicAutoSkipGuardForTests,
  scheduleMusicAutoSkip,
  cancelScheduledMusicAutoSkip,
  MUSIC_AUTO_SKIP_MIN_INTERVAL_MS,
} from '@/lib/media/audio/music-auto-skip-guard';

describe('shouldIgnoreTransientAudioFailure', () => {
  it('ignores errors while fetching url / intentional src clear', () => {
    expect(
      shouldIgnoreTransientAudioFailure({
        loading: true,
        intentionalReset: false,
        hasPlayableUrl: false,
        event: 'error',
      }),
    ).toBe(true);
    expect(
      shouldIgnoreTransientAudioFailure({
        loading: false,
        intentionalReset: true,
        hasPlayableUrl: true,
        event: 'error',
      }),
    ).toBe(true);
  });

  it('does not drop real ended just because duration is briefly 0/NaN', () => {
    expect(
      shouldIgnoreTransientAudioFailure({
        loading: false,
        intentionalReset: false,
        hasPlayableUrl: true,
        duration: 0,
        msSinceSrcApplied: 5000,
        event: 'ended',
      }),
    ).toBe(false);
    expect(
      shouldIgnoreTransientAudioFailure({
        loading: false,
        intentionalReset: false,
        hasPlayableUrl: true,
        duration: Number.NaN,
        msSinceSrcApplied: 5000,
        event: 'ended',
      }),
    ).toBe(false);
  });

  it('still ignores ended right after src apply', () => {
    expect(
      shouldIgnoreTransientAudioFailure({
        loading: false,
        intentionalReset: false,
        hasPlayableUrl: true,
        duration: 0,
        msSinceSrcApplied: 100,
        event: 'ended',
      }),
    ).toBe(true);
  });

  it('allows real error only after src settled and duration known', () => {
    expect(
      shouldIgnoreTransientAudioFailure({
        loading: false,
        intentionalReset: false,
        hasPlayableUrl: true,
        duration: 210,
        msSinceSrcApplied: 3000,
        event: 'error',
      }),
    ).toBe(false);
  });
});

describe('music auto-skip guard', () => {
  beforeEach(() => {
    resetMusicAutoSkipGuardForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cancelScheduledMusicAutoSkip();
    vi.useRealTimers();
  });

  it('cools down rapid consecutive skips', () => {
    expect(consumeMusicAutoSkipSlot(1000)).toBe(true);
    expect(consumeMusicAutoSkipSlot(1000 + MUSIC_AUTO_SKIP_MIN_INTERVAL_MS - 1)).toBe(false);
    expect(consumeMusicAutoSkipSlot(1000 + MUSIC_AUTO_SKIP_MIN_INTERVAL_MS)).toBe(true);
  });

  it('cancels a pending scheduled skip when a newer apply starts', () => {
    const run = vi.fn();
    scheduleMusicAutoSkip(run, 500);
    cancelScheduledMusicAutoSkip();
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
  });
});
