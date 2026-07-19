/**
 * 音频播放器 hook：播放速度、片头片尾、播放模式、定时关闭、多段 URL
 */

import { createSignal, createEffect, onCleanup, on, type Accessor } from 'solid-js';
import { clampPlaySpeed } from '@/lib/media/audio/book-audio-config';
import {
  DEFAULT_PLAY_SPEED,
  PROGRESS_SAVE_INTERVAL_MS,
  type AudioPlayConfig,
} from '@/lib/media/audio/types';
import type { Book, BookChapter } from '@/types';
import type { PlayableItem } from '@/lib/media/audio/playable-item';
import { getPlayableUrls } from '@/lib/media/audio/playable-item';
import { shouldIgnoreTransientAudioFailure } from '@/lib/media/audio/ignore-transient-audio-failure';
import { noteMusicPlaybackHealthy } from '@/lib/media/audio/music-auto-skip-guard';

const POS_STORE_INTERVAL_MS = 2000;

export interface UseAudioPlayerOptions {
  src: Accessor<string | null>;
  mediaUrls: Accessor<string[]>;
  chapterIndex: Accessor<number>;
  catalog: Accessor<BookChapter[]>;
  chapterPos: Accessor<number>;
  book: Accessor<Book | null>;
  audioConfig: Accessor<AudioPlayConfig>;
  /** 首次绑定或曲目地址变化后是否自动开始播放 */
  autoPlay?: Accessor<boolean>;
  /** 章节正文/播放地址加载中时不应沿用旧 URL 或自动开播 */
  loading?: Accessor<boolean>;
  /** 统一 PlayableItem 队列（music / 听书共用） */
  playableItem?: Accessor<PlayableItem | null>;
  onChapterPosChange: (pos: number) => void;
  onEndedChapter: () => Promise<void>;
  onSaveProgress: () => Promise<void>;
  onSkipVolumeChapter: (index: number) => Promise<void>;
  /** 播放错误（如 URL 过期）时回调，返回 true 表示已处理 */
  onPlaybackError?: () => void | Promise<void>;
}

export interface UseAudioPlayerResult {
  audioRef: (el: HTMLAudioElement) => void;
  playing: Accessor<boolean>;
  currentTime: Accessor<number>;
  duration: Accessor<number>;
  bufferedEnd: Accessor<number>;
  segmentIndex: Accessor<number>;
  sleepMinutes: Accessor<number>;
  togglePlay: () => void;
  seekTo: (seconds: number, autoplay?: boolean) => void;
  skipBy: (deltaSeconds: number) => void;
  setPlaybackRate: (speed: number) => void;
  setSleepMinutes: (minutes: number) => void;
  addSleepMinutes: (delta: number) => void;
}

export function useAudioPlayer(options: UseAudioPlayerOptions): UseAudioPlayerResult {
  const [playing, setPlaying] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  const [bufferedEnd, setBufferedEnd] = createSignal(0);
  const [segmentIndex, setSegmentIndex] = createSignal(0);
  const [sleepMinutes, setSleepMinutesState] = createSignal(0);

  let audioEl: HTMLAudioElement | undefined;
  let boundAudioEl: HTMLAudioElement | undefined;
  let lastProgressSave = 0;
  let lastPosStore = 0;
  let sleepTimer: ReturnType<typeof setInterval> | undefined;
  let seekingFromUser = false;
  let closeCreditsTriggered = false;
  let userPaused = false;
  let lastSegmentKey = '';
  let pendingLoadAfterFetch = false;
  let playbackErrorHandled = false;
  /** src 切换后 metadata 就绪前暂存起播位置 */
  let pendingSeekSec: number | null = null;
  /** 主动清 src / 取链重置中，忽略随之而来的 error/ended */
  let intentionalReset = false;
  /** 最近一次写入可播 src 的时间戳 */
  let srcAppliedAt = 0;
  /** 同一 src 只派发一次曲终，防止 ended 重入在取链中再次 playNext */
  let endedDispatchedForSrc = '';

  const msSinceSrcApplied = () =>
    srcAppliedAt > 0 ? Date.now() - srcAppliedAt : Number.POSITIVE_INFINITY;

  const handlePlaybackError = () => {
    if (
      shouldIgnoreTransientAudioFailure({
        loading: options.loading?.() ?? false,
        intentionalReset,
        hasPlayableUrl: segmentUrls().length > 0,
        duration: audioEl?.duration,
        msSinceSrcApplied: msSinceSrcApplied(),
        event: 'error',
      })
    ) {
      return;
    }
    if (playbackErrorHandled) return;
    playbackErrorHandled = true;
    void options.onPlaybackError?.();
  };

  const segmentUrls = () => {
    const fromPlayable = getPlayableUrls(options.playableItem?.() ?? null);
    if (fromPlayable.length > 0) return fromPlayable;
    const list = options.mediaUrls();
    if (list.length > 0) return list;
    const single = options.src();
    if (!single) return [];
    if (
      /^https?:\/\//i.test(single) &&
      !single.includes('__reader_http') &&
      !single.startsWith('blob:')
    ) {
      return [];
    }
    return [single];
  };

  const segmentLoadKey = () =>
    `${options.chapterIndex()}:${segmentUrls().join('\0')}`;

  const applyPlaybackRate = () => {
    if (!audioEl) return;
    audioEl.playbackRate = clampPlaySpeed(options.audioConfig().playSpeed);
  };

  const initialSeekSeconds = () => {
    const saved = options.chapterPos();
    const openCredits = options.audioConfig().openCredits;
    if (saved > 0 && saved < 86400) return saved;
    if (openCredits > 0) return openCredits;
    return 0;
  };

  const resetProgressUi = (time = 0) => {
    setCurrentTime(time);
    setDuration(0);
    setBufferedEnd(0);
  };

  const pauseAndResetUi = (clearSrc = false) => {
    if (audioEl) {
      seekingFromUser = true;
      intentionalReset = true;
      audioEl.pause();
      if (clearSrc) {
        audioEl.removeAttribute('src');
        // 打断旧缓冲，避免与随后 loadSegment 并行出声
        try {
          audioEl.load();
        } catch {
          // ignore
        }
      }
      seekingFromUser = false;
    }
    setPlaying(false);
    resetProgressUi(0);
  };

  const loadSegment = (index: number, autoplay: boolean) => {
    const urls = segmentUrls();
    if (!audioEl) return;
    if (urls.length === 0) {
      pauseAndResetUi(true);
      return;
    }
    intentionalReset = false;
    const clamped = Math.min(Math.max(0, index), urls.length - 1);
    setSegmentIndex(clamped);
    closeCreditsTriggered = false;
    const url = urls[clamped]!;
    const srcChanged = audioEl.src !== url;
    if (srcChanged) {
      audioEl.pause();
      audioEl.src = url;
      audioEl.preload = 'auto';
      srcAppliedAt = Date.now();
      endedDispatchedForSrc = '';
      if (url.startsWith('blob:')) {
        audioEl.removeAttribute('crossorigin');
      }
    } else if (srcAppliedAt <= 0) {
      srcAppliedAt = Date.now();
    }
    applyPlaybackRate();
    const seek = clamped === 0 ? initialSeekSeconds() : 0;
    // 切歌后无论 src 是否变化都必须对齐进度，禁止残留上一曲 currentTime
    pendingSeekSec = seek;
    resetProgressUi(seek);
    try {
      audioEl.currentTime = seek;
    } catch {
      // metadata 未就绪时可能抛错；loadedmetadata 会再对齐
    }
    setCurrentTime(seek);
    // 选中/切歌自动播放时，清掉「用户暂停」以免旧暂停状态挡住新曲
    if (autoplay) userPaused = false;
    const shouldPlay = autoplay && !userPaused;
    if (shouldPlay) {
      void audioEl.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      audioEl.pause();
      setPlaying(false);
    }
  };

  /** 仅在确有可播 URL 时才读取 autoPlay（避免空链时消费 forceNextLoadAutoPlay） */
  const loadSegmentWithAutoPlayPolicy = (index: number) => {
    if (segmentUrls().length === 0) {
      pauseAndResetUi(true);
      return;
    }
    loadSegment(index, options.autoPlay?.() ?? true);
  };

  const maybeSaveProgress = () => {
    const now = Date.now();
    if (now - lastProgressSave < PROGRESS_SAVE_INTERVAL_MS) return;
    lastProgressSave = now;
    void options.onSaveProgress();
  };

  const checkCloseCredits = () => {
    if (!audioEl || closeCreditsTriggered || seekingFromUser) return;
    const closeCredits = options.audioConfig().closeCredits;
    if (closeCredits <= 0) return;
    const dur = audioEl.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    if (audioEl.currentTime >= dur - closeCredits) {
      closeCreditsTriggered = true;
      intentionalReset = true;
      audioEl.pause();
      setPlaying(false);
      const srcKey = segmentUrls()[0] ?? audioEl.src ?? '';
      if (srcKey && endedDispatchedForSrc === srcKey) return;
      endedDispatchedForSrc = srcKey || 'ended';
      void options.onEndedChapter();
    }
  };

  const onSegmentEnded = () => {
    if (
      shouldIgnoreTransientAudioFailure({
        loading: options.loading?.() ?? false,
        intentionalReset,
        hasPlayableUrl: segmentUrls().length > 0,
        duration: audioEl?.duration,
        msSinceSrcApplied: msSinceSrcApplied(),
        event: 'ended',
      })
    ) {
      return;
    }
    const urls = segmentUrls();
    const nextSeg = segmentIndex() + 1;
    if (nextSeg < urls.length) {
      loadSegment(nextSeg, !userPaused);
      return;
    }
    const srcKey = urls[0] ?? audioEl?.src ?? '';
    if (srcKey && endedDispatchedForSrc === srcKey) return;
    endedDispatchedForSrc = srcKey || 'ended';
    // 曲终后立刻阻断后续 timeupdate 把曲末进度写回 store
    intentionalReset = true;
    setPlaying(false);
    void options.onEndedChapter();
  };

  const clearSleepTimer = () => {
    if (sleepTimer) {
      clearInterval(sleepTimer);
      sleepTimer = undefined;
    }
  };

  const startSleepTimer = () => {
    clearSleepTimer();
    const minutes = sleepMinutes();
    if (minutes <= 0) return;
    sleepTimer = setInterval(() => {
      setSleepMinutesState((m) => {
        if (m <= 1) {
          clearSleepTimer();
          userPaused = true;
          audioEl?.pause();
          setPlaying(false);
          return 0;
        }
        return m - 1;
      });
    }, 60_000);
  };

  const bindAudioElement = (el: HTMLAudioElement) => {
    if (boundAudioEl === el) return;
    boundAudioEl = el;
    audioEl = el;
    el.preload = 'auto';

    el.addEventListener('timeupdate', () => {
      if (!audioEl) return;
      const t = audioEl.currentTime;
      setCurrentTime(t);
      if (!seekingFromUser && !intentionalReset) {
        const now = Date.now();
        if (now - lastPosStore >= POS_STORE_INTERVAL_MS) {
          lastPosStore = now;
          options.onChapterPosChange(t);
          maybeSaveProgress();
        }
        if (audioEl.buffered.length > 0) {
          const end = audioEl.buffered.end(audioEl.buffered.length - 1);
          setBufferedEnd(end);
        }
        checkCloseCredits();
      }
    });
    el.addEventListener('loadedmetadata', () => {
      if (!audioEl) return;
      setDuration(audioEl.duration);
      if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
        noteMusicPlaybackHealthy();
      }
      if (pendingSeekSec != null) {
        const seek = pendingSeekSec;
        pendingSeekSec = null;
        try {
          audioEl.currentTime = seek;
        } catch {
          // ignore
        }
        setCurrentTime(seek);
      }
    });
    el.addEventListener('durationchange', () => {
      if (audioEl && Number.isFinite(audioEl.duration)) {
        setDuration(audioEl.duration);
      }
    });
    el.addEventListener('play', () => setPlaying(true));
    el.addEventListener('pause', () => setPlaying(false));
    el.addEventListener('ended', onSegmentEnded);
    el.addEventListener('error', () => handlePlaybackError());

    const key = segmentLoadKey();
    if (segmentUrls().length === 0 || (options.loading?.() ?? false)) {
      pendingLoadAfterFetch = true;
      return;
    }
    lastSegmentKey = key;
    loadSegmentWithAutoPlayPolicy(0);
  };

  createEffect(
    on(
      () => [segmentLoadKey(), options.loading?.() ?? false] as const,
      ([key, isLoading]) => {
        if (!audioEl) return;
        if (isLoading) {
          // 切歌取链中：必须停掉旧音频并重置进度，避免旧 URL 与新曲并行
          pendingLoadAfterFetch = true;
          pauseAndResetUi(true);
          return;
        }
        const keyChanged = key !== lastSegmentKey;
        if (!keyChanged && !pendingLoadAfterFetch) return;
        lastSegmentKey = key;
        pendingLoadAfterFetch = false;
        playbackErrorHandled = false;
        // 切歌后按「选中/自动切歌后开始播放」设置决定，不沿用上一曲的用户暂停
        loadSegmentWithAutoPlayPolicy(0);
      },
      { defer: true },
    ),
  );

  createEffect(() => {
    options.audioConfig().playSpeed;
    applyPlaybackRate();
  });

  createEffect(() => {
    sleepMinutes();
    startSleepTimer();
  });

  const seekInternal = (seconds: number, autoplay: boolean) => {
    if (!audioEl) return;
    seekingFromUser = true;
    const dur = Number.isFinite(audioEl.duration) ? audioEl.duration : seconds;
    const clamped = Math.max(0, Math.min(dur > 0 ? dur : seconds, seconds));
    audioEl.currentTime = clamped;
    setCurrentTime(clamped);
    lastPosStore = Date.now();
    options.onChapterPosChange(clamped);
    seekingFromUser = false;
    // seek 后允许再次曲终
    closeCreditsTriggered = false;
    endedDispatchedForSrc = '';
    if (autoplay && !userPaused) {
      void audioEl.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  onCleanup(() => {
    clearSleepTimer();
    if (audioEl) {
      options.onChapterPosChange(audioEl.currentTime);
      void options.onSaveProgress();
      audioEl.pause();
    }
    setPlaying(false);
    resetProgressUi(0);
    boundAudioEl = undefined;
    audioEl = undefined;
    lastSegmentKey = '';
    pendingLoadAfterFetch = false;
  });

  return {
    audioRef: (el: HTMLAudioElement) => {
      if (el) bindAudioElement(el);
    },
    playing,
    currentTime,
    duration,
    bufferedEnd,
    segmentIndex,
    sleepMinutes,
    togglePlay: () => {
      if (!audioEl) return;
      if (!audioEl.paused) {
        userPaused = true;
        audioEl.pause();
        setPlaying(false);
        return;
      }
      userPaused = false;
      void audioEl.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    },
    seekTo: (seconds: number, autoplay = false) => {
      if (autoplay) userPaused = false;
      seekInternal(seconds, autoplay);
    },
    skipBy: (deltaSeconds: number) => {
      if (!audioEl) return;
      const dur = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
      const max = dur > 0 ? dur : Number.MAX_SAFE_INTEGER;
      const next = Math.max(0, Math.min(max, audioEl.currentTime + deltaSeconds));
      seekInternal(next, !audioEl.paused);
    },
    setPlaybackRate: (speed: number) => {
      if (!audioEl) return;
      audioEl.playbackRate = clampPlaySpeed(speed);
    },
    setSleepMinutes: (minutes: number) => {
      setSleepMinutesState(Math.max(0, Math.min(180, minutes)));
    },
    addSleepMinutes: (delta: number) => {
      setSleepMinutesState((m) => {
        const next = m + delta;
        if (next <= 0) return 0;
        return Math.min(180, next);
      });
    },
  };
}

export { DEFAULT_PLAY_SPEED };
