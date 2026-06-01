/**
 * 视频播放器 hook：进度保存、倍速、长按倍速、自动播放
 */

import { createSignal, createEffect, onCleanup, on, type Accessor } from 'solid-js';
import { clampPlaySpeed } from '@/lib/media/audio/book-audio-config';
import { longPressSpeedToRate } from '@/lib/media/video/book-video-config';
import { PROGRESS_SAVE_INTERVAL_MS } from '@/lib/media/audio/types';

const POS_STORE_INTERVAL_MS = 2000;
const LONG_PRESS_MS = 400;

export interface UseVideoPlayerOptions {
  src: Accessor<string | null>;
  chapterIndex: Accessor<number>;
  chapterPos: Accessor<number>;
  playSpeed: Accessor<number>;
  longPressSpeed: Accessor<number>;
  onChapterPosChange: (pos: number) => void;
  onEndedChapter: () => Promise<void>;
  onSaveProgress: () => void;
  autoPlay?: Accessor<boolean>;
  onLongPressOverlay?: (text: string | null) => void;
}

export interface UseVideoPlayerResult {
  videoRef: (el: HTMLVideoElement) => void;
  playing: Accessor<boolean>;
  currentTime: Accessor<number>;
  duration: Accessor<number>;
  overlayTip: Accessor<string | null>;
  togglePlay: () => void;
  setPlaybackRate: (rate: number) => void;
  handlePointerDown: () => void;
  handlePointerUp: () => void;
  handlePointerCancel: () => void;
}

export function useVideoPlayer(options: UseVideoPlayerOptions): UseVideoPlayerResult {
  const [playing, setPlaying] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  const [overlayTip, setOverlayTip] = createSignal<string | null>(null);

  let videoEl: HTMLVideoElement | undefined;
  let boundEl: HTMLVideoElement | undefined;
  let lastProgressSave = 0;
  let lastPosStore = 0;
  let userPaused = false;
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  let inLongPressSpeed = false;

  const loadKey = () => `${options.chapterIndex()}:${options.src() ?? ''}`;

  const showOverlay = (text: string | null) => {
    setOverlayTip(text);
    options.onLongPressOverlay?.(text);
  };

  const initialSeekSeconds = () => {
    const saved = options.chapterPos();
    if (saved > 0 && saved < 86400) return saved;
    return 0;
  };

  const applyPlaybackRate = (rate?: number) => {
    if (!videoEl) return;
    const r = clampPlaySpeed(rate ?? options.playSpeed());
    videoEl.playbackRate = r;
  };

  const bindVideo = (el: HTMLVideoElement) => {
    if (boundEl === el) return;
    boundEl = el;
    videoEl = el;

    el.addEventListener('play', () => setPlaying(true));
    el.addEventListener('pause', () => setPlaying(false));
    el.addEventListener('timeupdate', () => {
      if (!videoEl) return;
      const t = videoEl.currentTime;
      setCurrentTime(t);
      const now = Date.now();
      if (now - lastPosStore >= POS_STORE_INTERVAL_MS) {
        lastPosStore = now;
        options.onChapterPosChange(t);
      }
      if (now - lastProgressSave >= PROGRESS_SAVE_INTERVAL_MS) {
        lastProgressSave = now;
        options.onSaveProgress();
      }
    });
    el.addEventListener('durationchange', () => {
      if (videoEl && Number.isFinite(videoEl.duration)) {
        setDuration(videoEl.duration);
      }
    });
    el.addEventListener('ended', () => {
      setPlaying(false);
      void options.onEndedChapter();
    });
    el.addEventListener('error', () => setPlaying(false));
  };

  createEffect(() => {
    const speed = options.playSpeed();
    if (!inLongPressSpeed) {
      applyPlaybackRate(speed);
    }
  });

  createEffect(
    on(
      loadKey,
      () => {
        if (!videoEl) return;
        const src = options.src();
        if (!src) return;

        const srcChanged = videoEl.src !== src;
        if (srcChanged) {
          videoEl.src = src;
          videoEl.preload = 'auto';
          if (src.startsWith('blob:') || src.includes('__reader_http')) {
            videoEl.removeAttribute('crossorigin');
          }
        }

        applyPlaybackRate();

        const seek = initialSeekSeconds();
        if (seek > 0 && (srcChanged || Math.abs(videoEl.currentTime - seek) > 0.5)) {
          videoEl.currentTime = seek;
          setCurrentTime(seek);
        }

        const shouldPlay = (options.autoPlay?.() ?? true) && !userPaused;
        if (shouldPlay) {
          void videoEl.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        } else if (userPaused) {
          videoEl.pause();
          setPlaying(false);
        }
      },
      { defer: true },
    ),
  );

  onCleanup(() => {
    clearLongPressTimer();
    if (videoEl) {
      options.onChapterPosChange(videoEl.currentTime);
      options.onSaveProgress();
      videoEl.pause();
    }
  });

  const clearLongPressTimer = () => {
    if (longPressTimer !== undefined) {
      clearTimeout(longPressTimer);
      longPressTimer = undefined;
    }
  };

  const endLongPressSpeed = () => {
    if (!inLongPressSpeed) return;
    inLongPressSpeed = false;
    applyPlaybackRate(options.playSpeed());
    showOverlay(null);
  };

  const handlePointerDown = () => {
    clearLongPressTimer();
    if (!videoEl || videoEl.paused) return;
    longPressTimer = setTimeout(() => {
      longPressTimer = undefined;
      if (!videoEl || videoEl.paused) return;
      const rate = longPressSpeedToRate(options.longPressSpeed());
      inLongPressSpeed = true;
      videoEl.playbackRate = rate;
      showOverlay(`${rate.toFixed(1)} 倍速播放中`);
    }, LONG_PRESS_MS);
  };

  const handlePointerUp = () => {
    clearLongPressTimer();
    endLongPressSpeed();
  };

  const handlePointerCancel = () => {
    clearLongPressTimer();
    endLongPressSpeed();
  };

  const videoRef = (el: HTMLVideoElement) => {
    bindVideo(el);
    const src = options.src();
    if (src && el.src !== src) {
      el.src = src;
    }
  };

  const togglePlay = () => {
    if (!videoEl) return;
    if (videoEl.paused) {
      userPaused = false;
      void videoEl.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      userPaused = true;
      videoEl.pause();
      setPlaying(false);
    }
  };

  const setPlaybackRate = (rate: number) => {
    if (!videoEl) return;
    const clamped = clampPlaySpeed(rate);
    videoEl.playbackRate = clamped;
  };

  return {
    videoRef,
    playing,
    currentTime,
    duration,
    overlayTip,
    togglePlay,
    setPlaybackRate,
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
  };
}
