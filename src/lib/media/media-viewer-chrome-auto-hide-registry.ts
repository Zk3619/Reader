import type { MediaViewerChromeAutoHide } from '@/lib/media/media-viewer-chrome-auto-hide';

export type MediaViewerChromeAutoHideSession = {
  autoHide: MediaViewerChromeAutoHide;
  showChrome: () => void;
};

let activeSession: MediaViewerChromeAutoHideSession | null = null;
let activeToken: symbol | null = null;
let autoHideSuspended = false;

export function isMediaViewerChromeAutoHideSuspended(): boolean {
  return autoHideSuspended;
}

export function registerMediaViewerChromeAutoHideSession(
  session: MediaViewerChromeAutoHideSession | null,
  token?: symbol,
): void {
  if (session === null) {
    if (token === undefined || token === activeToken) {
      activeSession = null;
      activeToken = null;
      autoHideSuspended = false;
    }
    return;
  }
  activeSession = session;
  activeToken = token ?? null;
}

/** 试读退出等：终止自动隐藏计时并保持顶底栏可见 */
export function freezeMediaViewerChromeAutoHide(): void {
  autoHideSuspended = true;
  activeSession?.autoHide.clearHideTimer();
  activeSession?.showChrome();
}

/** 关闭试读提示且仍留在阅读器时，恢复自动隐藏 */
export function resumeMediaViewerChromeAutoHide(): void {
  if (!autoHideSuspended) return;
  autoHideSuspended = false;
  activeSession?.autoHide.revealSession();
}
