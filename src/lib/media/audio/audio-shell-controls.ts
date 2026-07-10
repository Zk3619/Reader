/**
 * 全局壳层 audio 播放控制桥（audio-viewer ↔ GlobalMediaPlayer）
 */

type AudioShellHandlers = {
  togglePlay: () => void;
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

export function audioShellSkipPrev(): void {
  handlers?.skipPrev();
}

export function audioShellSkipNext(): void {
  handlers?.skipNext();
}

export function audioShellStop(): void {
  handlers?.stop();
}

export function audioShellOpenViewer(): void {
  if (handlers?.openViewer) {
    handlers.openViewer();
    return;
  }
  globalOpenViewer?.();
}

export function hasAudioShellHandlers(): boolean {
  return handlers != null;
}
