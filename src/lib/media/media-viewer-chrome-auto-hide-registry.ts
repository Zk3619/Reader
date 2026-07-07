import type { MediaViewerChromeAutoHide } from '@/lib/media/media-viewer-chrome-auto-hide';

export type MediaViewerChromeAutoHideSession = {
  autoHide: MediaViewerChromeAutoHide;
  showChrome: () => void;
};

let activeSession: MediaViewerChromeAutoHideSession | null = null;
let activeToken: symbol | null = null;
let autoHideFrozen = false;
let autoHideHoldCount = 0;

export function isMediaViewerChromeAutoHideSuspended(): boolean {
  return autoHideFrozen || autoHideHoldCount > 0;
}

export function registerMediaViewerChromeAutoHideSession(
  session: MediaViewerChromeAutoHideSession | null,
  token?: symbol,
): void {
  if (session === null) {
    if (token === undefined || token === activeToken) {
      activeSession = null;
      activeToken = null;
      autoHideFrozen = false;
      autoHideHoldCount = 0;
    }
    return;
  }
  activeSession = session;
  activeToken = token ?? null;
}

/** 试读退出等：终止自动隐藏计时并保持顶底栏可见 */
export function freezeMediaViewerChromeAutoHide(): void {
  autoHideFrozen = true;
  activeSession?.autoHide.clearHideTimer();
  activeSession?.showChrome();
}

/** 关闭试读提示且仍留在阅读器时，恢复自动隐藏 */
export function resumeMediaViewerChromeAutoHide(): void {
  if (!autoHideFrozen) return;
  autoHideFrozen = false;
  if (autoHideHoldCount === 0) {
    activeSession?.autoHide.revealSession();
  }
}

/** 拖动亮度/进度等滑条时暂停自动隐藏倒计时 */
export function holdMediaViewerChromeAutoHide(): void {
  autoHideHoldCount++;
  if (autoHideHoldCount === 1) {
    activeSession?.autoHide.clearHideTimer();
  }
}

/** 松手后重启自动隐藏倒计时（若未被 freeze） */
export function releaseMediaViewerChromeAutoHide(): void {
  if (autoHideHoldCount <= 0) return;
  autoHideHoldCount--;
  if (autoHideHoldCount === 0 && !autoHideFrozen) {
    activeSession?.autoHide.scheduleHide();
  }
}
