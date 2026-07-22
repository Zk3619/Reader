import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerPlaybackOwner,
  requestFocus,
  abandonFocus,
  getActivePlaybackOwner,
  updatePlaybackOwnerHandlers,
  __resetAudioFocusForTests,
} from '@/lib/media/playback-exclusivity';
import {
  setMediaFocusConfig,
  DEFAULT_MEDIA_FOCUS_DUCK_GAIN,
} from '@/lib/media/media-focus-config';

describe('playback-exclusivity / audio focus', () => {
  beforeEach(() => {
    __resetAudioFocusForTests();
    setMediaFocusConfig({
      mode: 'smart',
      duckGain: DEFAULT_MEDIA_FOCUS_DUCK_GAIN,
      policyOverrides: {},
    });
  });

  it('pauseAll：起播暂停其它，abandon 按栈恢复', () => {
    setMediaFocusConfig({ mode: 'pauseAll' });
    const music = {
      pause: vi.fn(),
      resume: vi.fn(),
      setDuckGain: vi.fn(),
    };
    const book = {
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const u1 = registerPlaybackOwner('music', music);
    const u2 = registerPlaybackOwner('audiobook', book);

    requestFocus('music');
    expect(getActivePlaybackOwner()).toBe('music');
    // pauseAll：即便听书未在播也会被 pause，但不入恢复栈
    expect(book.pause).toHaveBeenCalledTimes(1);

    requestFocus('audiobook');
    expect(getActivePlaybackOwner()).toBe('audiobook');
    expect(music.pause).toHaveBeenCalledTimes(1);
    expect(music.setDuckGain).not.toHaveBeenCalled();

    abandonFocus('audiobook');
    expect(music.resume).toHaveBeenCalledTimes(1);
    expect(book.resume).not.toHaveBeenCalled();
    expect(getActivePlaybackOwner()).toBe('music');

    u1();
    u2();
  });

  it('smart：朗读 DUCK 音乐而非暂停', () => {
    setMediaFocusConfig({ mode: 'smart', duckGain: 0.2 });
    const music = {
      pause: vi.fn(),
      resume: vi.fn(),
      setDuckGain: vi.fn(),
    };
    const tts = {
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const u1 = registerPlaybackOwner('music', music);
    const u2 = registerPlaybackOwner('readAloud', tts);

    requestFocus('music');
    requestFocus('readAloud');
    expect(music.pause).not.toHaveBeenCalled();
    expect(music.setDuckGain).toHaveBeenCalledWith(0.2);
    expect(getActivePlaybackOwner()).toBe('readAloud');

    abandonFocus('readAloud');
    expect(music.setDuckGain).toHaveBeenCalledWith(1);
    expect(music.resume).not.toHaveBeenCalled();
    expect(getActivePlaybackOwner()).toBeNull();

    u1();
    u2();
  });

  it('smart：无 setDuckGain 时 DUCK 降级为 PAUSE', () => {
    setMediaFocusConfig({ mode: 'smart', duckGain: 0.2 });
    const music = {
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const tts = { pause: vi.fn(), resume: vi.fn() };
    const u1 = registerPlaybackOwner('music', music);
    const u2 = registerPlaybackOwner('readAloud', tts);

    requestFocus('music');
    requestFocus('readAloud');
    expect(music.pause).toHaveBeenCalledTimes(1);

    abandonFocus('readAloud');
    expect(music.resume).toHaveBeenCalledTimes(1);

    u1();
    u2();
  });

  it('updatePlaybackOwnerHandlers 可后挂 setDuckGain', () => {
    setMediaFocusConfig({ mode: 'smart', duckGain: 0.15 });
    const music = {
      pause: vi.fn(),
      resume: vi.fn(),
      setDuckGain: vi.fn(),
    };
    const tts = { pause: vi.fn(), resume: vi.fn() };
    const u1 = registerPlaybackOwner('music', {
      pause: music.pause,
      resume: music.resume,
    });
    updatePlaybackOwnerHandlers('music', { setDuckGain: music.setDuckGain });
    const u2 = registerPlaybackOwner('readAloud', tts);

    requestFocus('music');
    requestFocus('readAloud');
    expect(music.setDuckGain).toHaveBeenCalledWith(0.15);
    expect(music.pause).not.toHaveBeenCalled();

    u1();
    u2();
  });
});
