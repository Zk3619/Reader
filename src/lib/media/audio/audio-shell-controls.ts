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
  // 先让 Hub 切到播放详情；再走全局导航（切到 music 壳页）。
  // 仅调 handlers 时，若当前不在音乐页（例如刚退出文本阅读器），封面点击会无可见效果。
  handlers?.openViewer?.();
  globalOpenViewer?.();
}

export function hasAudioShellHandlers(): boolean {
  return handlers != null;
}
