/**
 * SolidJS hook：ArtPlayer 实例生命周期，对齐原 useVideoPlayer 进度/倍速/长按
 */

import { createSignal, createEffect, onCleanup, on, type Accessor } from 'solid-js';
import type Artplayer from 'artplayer';
import { clampPlaySpeed } from '@/lib/media/audio/book-audio-config';
import { longPressSpeedToRate } from '@/lib/media/video/book-video-config';
import { createReaderArtplayer } from '@/lib/media/video/artplayer/create-reader-artplayer';
import type { VideoPlaybackExtras } from '@/lib/media/video/artplayer/types';
import { PROGRESS_SAVE_INTERVAL_MS } from '@/lib/media/audio/types';

const POS_STORE_INTERVAL_MS = 2000;
const LONG_PRESS_MS = 400;

export interface UseArtplayerOptions {
  src: Accessor<string | null>;
  chapterIndex: Accessor<number>;
  chapterPos: Accessor<number>;
  playSpeed: Accessor<number>;
  longPressSpeed: Accessor<number>;
  extras?: Accessor<VideoPlaybackExtras | undefined>;
  onChapterPosChange: (pos: number) => void;
  onEndedChapter: () => Promise<void>;
  onSaveProgress: () => void;
  autoPlay?: Accessor<boolean>;
  onLongPressOverlay?: (text: string | null) => void;
}

export interface UseArtplayerResult {
  containerRef: (el: HTMLDivElement) => void;
  art: Accessor<Artplayer | undefined>;
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

export function useArtplayer(options: UseArtplayerOptions): UseArtplayerResult {
  const [playing, setPlaying] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  const [overlayTip, setOverlayTip] = createSignal<string | null>(null);
  const [artInstance, setArtInstance] = createSignal<Artplayer | undefined>();

  let containerEl: HTMLDivElement | undefined;
  let art: Artplayer | undefined;
  let lastProgressSave = 0;
  let lastPosStore = 0;
  let userPaused = false;
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  let inLongPressSpeed = false;

  const loadKey = () =>
    `${options.chapterIndex()}:${options.src() ?? ''}:${options.extras?.()?.subtitleUrl ?? ''}:${options.extras?.()?.vttThumbnailUrl ?? ''}`;

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
    if (!art) return;
    const r = clampPlaySpeed(rate ?? options.playSpeed());
    art.playbackRate = r;
  };

  const destroyArt = () => {
    if (art) {
      try {
        options.onChapterPosChange(art.currentTime);
        options.onSaveProgress();
        art.destroy(false);
      } catch {
        /* ignore */
      }
      art = undefined;
      setArtInstance(undefined);
    }
  };

  const bindArtEvents = (instance: Artplayer) => {
    instance.on('video:play', () => setPlaying(true));
    instance.on('video:pause', () => setPlaying(false));
    instance.on('video:timeupdate', () => {
      const t = instance.currentTime;
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
    instance.on('video:durationchange', () => {
      const d = instance.duration;
      if (Number.isFinite(d)) setDuration(d);
    });
    instance.on('video:ended', () => {
      setPlaying(false);
      void options.onEndedChapter();
    });
    instance.on('video:error', () => setPlaying(false));
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
        const src = options.src();
        if (!src || !containerEl) return;

        destroyArt();

        const instance = createReaderArtplayer({
          container: containerEl,
          url: src,
          autoplay: (options.autoPlay?.() ?? true) && !userPaused,
          playbackRate: options.playSpeed(),
          extras: options.extras?.(),
        });

        art = instance;
        setArtInstance(instance);
        bindArtEvents(instance);

        const seek = initialSeekSeconds();
        if (seek > 0) {
          instance.seek = seek;
          setCurrentTime(seek);
        }

        if (userPaused) {
          instance.pause();
          setPlaying(false);
        }
      },
      { defer: true },
    ),
  );

  onCleanup(() => {
    clearLongPressTimer();
    destroyArt();
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
    if (!art || !art.playing) return;
    longPressTimer = setTimeout(() => {
      longPressTimer = undefined;
      if (!art || !art.playing) return;
      const rate = longPressSpeedToRate(options.longPressSpeed());
      inLongPressSpeed = true;
      art.playbackRate = rate;
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

  const containerRef = (el: HTMLDivElement) => {
    containerEl = el;
  };

  const togglePlay = () => {
    if (!art) return;
    if (!art.playing) {
      userPaused = false;
      art.play();
    } else {
      userPaused = true;
      art.pause();
    }
  };

  const setPlaybackRate = (rate: number) => {
    if (!art) return;
    art.playbackRate = clampPlaySpeed(rate);
  };

  return {
    containerRef,
    art: artInstance,
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
