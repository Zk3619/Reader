/**
 * 邻曲双缓冲预取 + 可配置 crossfade（非编解码级 gapless）
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import {
  clearTrackPreload,
  getPreloadedTrackUrl,
  preloadTrackUrl,
} from '@/lib/media/audio/online/track-preload';

const PRELOAD_REMAINING_SEC = 15;

let secondaryEl: HTMLAudioElement | null = null;
let preparedTrackId: string | null = null;
let fading = false;
let fadeRaf = 0;
let handoff: { trackId: string; url: string } | null = null;

export function getMusicCrossfadeHandoff(): { trackId: string; url: string } | null {
  return handoff;
}

export function consumeMusicCrossfadeHandoff(
  trackId: string,
): { trackId: string; url: string } | null {
  if (!handoff || handoff.trackId !== trackId) return null;
  const cur = handoff;
  handoff = null;
  return cur;
}

function ensureSecondary(): HTMLAudioElement {
  if (secondaryEl) return secondaryEl;
  const el = document.createElement('audio');
  el.setAttribute('data-music-crossfade-buffer', '1');
  el.preload = 'auto';
  el.style.display = 'none';
  document.body.appendChild(el);
  secondaryEl = el;
  return el;
}

export function cancelMusicCrossfade(): void {
  fading = false;
  if (fadeRaf) {
    cancelAnimationFrame(fadeRaf);
    fadeRaf = 0;
  }
  if (secondaryEl) {
    try {
      secondaryEl.pause();
      secondaryEl.removeAttribute('src');
      secondaryEl.load();
    } catch {
      // ignore
    }
  }
  preparedTrackId = null;
}

export function disposeMusicCrossfade(): void {
  cancelMusicCrossfade();
  if (secondaryEl) {
    try {
      secondaryEl.remove();
    } catch {
      // ignore
    }
    secondaryEl = null;
  }
  handoff = null;
}

async function prepareNext(
  next: AudioTrack,
  activeSource?: string | null,
): Promise<string | null> {
  if (preparedTrackId === next.id && secondaryEl?.src) {
    return secondaryEl.currentSrc || getPreloadedTrackUrl(next.id);
  }
  await preloadTrackUrl(next, { activeSource });
  let url = getPreloadedTrackUrl(next.id);
  if (!url) {
    try {
      const { resolveTrackPlaybackUrls } = await import(
        '@/lib/media/audio/online/online-resolver'
      );
      const { urls } = await resolveTrackPlaybackUrls(next, { activeSource });
      url = urls[0] ?? null;
      if (url && !url.startsWith('blob:')) {
        // keep in preload map for handoff
        const { preloadTrackUrl: _p } = await import(
          '@/lib/media/audio/online/track-preload'
        );
        void _p;
      }
    } catch {
      return null;
    }
  }
  if (!url) return null;
  // HLS / blob：不做 B 轨预载，降级硬切
  if (url.includes('.m3u8') || url.startsWith('blob:')) return url;

  const el = ensureSecondary();
  if (el.src !== url) {
    el.src = url;
    el.load();
  }
  preparedTrackId = next.id;
  return url;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function rampVolumes(
  primary: HTMLAudioElement,
  secondary: HTMLAudioElement,
  durationMs: number,
  onDone: () => void,
): void {
  fading = true;
  const start = performance.now();
  const primaryStart = primary.volume;
  const tick = (now: number) => {
    if (!fading) return;
    const linear = Math.min(1, (now - start) / Math.max(1, durationMs));
    const t = easeInOutCubic(linear);
    primary.volume = primaryStart * (1 - t);
    secondary.volume = t;
    if (linear >= 1) {
      fading = false;
      fadeRaf = 0;
      onDone();
      return;
    }
    fadeRaf = requestAnimationFrame(tick);
  };
  secondary.volume = 0;
  fadeRaf = requestAnimationFrame(tick);
}

/**
 * 由 Hub 定时调用：剩余不足时预载；进入 crossfade 窗口则淡入下一首并交接。
 */
export async function tickMusicCrossfade(options: {
  primary: HTMLAudioElement | null;
  playing: boolean;
  positionSec: number;
  durationSec: number;
  nextTrack: AudioTrack | null;
  activeSource?: string | null;
  userVolume: number;
  onAdvance: () => void | Promise<void>;
}): Promise<void> {
  const settings = getMusicSettings();
  const primary = options.primary;
  if (!primary || !options.playing || !options.nextTrack) return;
  if (!Number.isFinite(options.durationSec) || options.durationSec < 3) return;
  const remaining = options.durationSec - options.positionSec;
  if (remaining <= 0) return;

  if (remaining <= PRELOAD_REMAINING_SEC) {
    void prepareNext(options.nextTrack, options.activeSource);
  }

  const crossfadeMs = settings.crossfadeEnabled
    ? Math.max(0, Math.min(5000, settings.crossfadeMs > 0 ? settings.crossfadeMs : 1200))
    : 0;

  if (crossfadeMs <= 0 || fading) return;
  if (remaining * 1000 > crossfadeMs + 200) return;

  const url = await prepareNext(options.nextTrack, options.activeSource);
  if (!url || url.includes('.m3u8') || url.startsWith('blob:')) return;

  const secondary = ensureSecondary();
  if (!secondary.src) {
    secondary.src = url;
    secondary.load();
  }

  try {
    await secondary.play();
  } catch {
    return;
  }

  handoff = { trackId: options.nextTrack.id, url };
  rampVolumes(primary, secondary, crossfadeMs, () => {
    try {
      primary.pause();
    } catch {
      // ignore
    }
    primary.volume = options.userVolume;
    secondary.volume = options.userVolume;
    // 将 B 轨状态交给主链：把 src 拷到主元素并同步进度，避免双声
    try {
      const t = secondary.currentTime;
      primary.src = secondary.currentSrc || url;
      primary.currentTime = t;
      void primary.play();
      secondary.pause();
      secondary.removeAttribute('src');
      secondary.load();
    } catch {
      // ignore
    }
    preparedTrackId = null;
    clearTrackPreload(options.nextTrack!.id);
    void options.onAdvance();
  });
}
