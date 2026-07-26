/**
 * 全局壳层 audio 播放控制桥（audio-viewer ↔ GlobalMediaPlayer）
 */

import { viewerStore } from '@/stores/viewer';
import {
  getMusicSectionBeforeNowPlaying,
  setMusicSection,
} from '@/stores/viewer/media/audio';

type AudioShellHandlers = {
  togglePlay: () => void;
  /** 仅起播（勿与 pause 共用 toggle，否则暂停可能误走取链起播） */
  play?: () => void;
  /** 仅暂停 */
  pause?: () => void;
  skipPrev: () => void;
  skipNext: () => void;
  stop: () => void;
  openViewer: () => void;
  isPlaying?: () => boolean;
};

let handlers: AudioShellHandlers | null = null;
let globalOpenViewer: (() => void) | null = null;
const playingListeners = new Set<() => void>();

export function registerGlobalAudioOpenViewer(fn: (() => void) | null): void {
  globalOpenViewer = fn;
}

export function registerAudioShellHandlers(h: AudioShellHandlers | null): void {
  handlers = h;
  notifyPlayingListeners();
}

export function subscribeAudioShellPlaying(cb: () => void): () => void {
  playingListeners.add(cb);
  return () => playingListeners.delete(cb);
}

export function notifyAudioShellPlayingChanged(): void {
  notifyPlayingListeners();
}

function notifyPlayingListeners(): void {
  for (const cb of playingListeners) cb();
}

export function audioShellIsPlaying(): boolean {
  return handlers?.isPlaying?.() ?? false;
}

export function audioShellTogglePlay(): void {
  handlers?.togglePlay();
}

/** 起播：已在播则 no-op；优先走专用 play（含取链），否则仅在暂停时 toggle */
export function audioShellPlay(): void {
  if (handlers?.play) {
    handlers.play();
    return;
  }
  if (!audioShellIsPlaying()) handlers?.togglePlay();
}

/** 暂停：已暂停则 no-op；优先走专用 pause，避免 pause 误入 playOrFetch 取链起播 */
export function audioShellPause(): void {
  if (handlers?.pause) {
    handlers.pause();
    return;
  }
  if (audioShellIsPlaying()) handlers?.togglePlay();
}

export function audioShellSkipPrev(): void {
  handlers?.skipPrev();
}

export function audioShellSkipNext(): void {
  handlers?.skipNext();
}

export function audioShellStop(): void {
  handlers?.stop();
}

function hasActiveMusicTrack(): boolean {
  const queue = viewerStore.state.trackQueue;
  const index = viewerStore.state.trackIndex;
  return Array.isArray(queue) && index >= 0 && index < queue.length && queue[index] != null;
}

/**
 * 打开音乐相关界面。
 * - 有当前曲目：进播放详情 + 音乐壳页
 * - 无曲目 / preferHub：只打开音乐模块（若停在空详情则退回上一分区），不因无详情阻断
 */
export function audioShellOpenViewer(opts?: { preferHub?: boolean }): void {
  const preferHub = opts?.preferHub === true || !hasActiveMusicTrack();
  if (!preferHub) {
    handlers?.openViewer?.();
  } else if (viewerStore.state.musicSection === 'nowPlaying') {
    setMusicSection(getMusicSectionBeforeNowPlaying());
  }
  // 再走全局导航（切到 music 壳页）。
  // 仅调 handlers 时，若当前不在音乐页（例如刚退出文本阅读器），封面点击会无可见效果。
  globalOpenViewer?.();
}

export function hasAudioShellHandlers(): boolean {
  return handlers != null;
}
