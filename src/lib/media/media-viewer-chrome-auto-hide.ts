/** 进入 / 回到 viewer 后顶底栏保持可见的时长，随后自动隐藏 */
export const MEDIA_VIEWER_CHROME_AUTO_HIDE_MS = 3000;

export type MediaViewerChromeAutoHide = {
  /** 进入 / 从其它页回到 viewer：显示顶底栏并启动一次自动隐藏 */
  revealSession: () => void;
  clearHideTimer: () => void;
  dispose: () => void;
};

export function createMediaViewerChromeAutoHide(options: {
  enabled: () => boolean;
  isControlled: () => boolean;
  setHeaderVisible: (visible: boolean) => void;
  /** 桌面失焦时为 false，禁止调度自动隐藏 */
  canAutoHide?: () => boolean;
}): MediaViewerChromeAutoHide {
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const allowAutoHide = () => (options.canAutoHide?.() ?? true) !== false;

  const clearHideTimer = () => {
    if (hideTimer !== undefined) {
      clearTimeout(hideTimer);
      hideTimer = undefined;
    }
  };

  const scheduleHide = () => {
    clearHideTimer();
    if (!options.enabled() || options.isControlled() || !allowAutoHide()) return;
    hideTimer = setTimeout(() => {
      hideTimer = undefined;
      if (!allowAutoHide()) return;
      options.setHeaderVisible(false);
    }, MEDIA_VIEWER_CHROME_AUTO_HIDE_MS);
  };

  const revealSession = () => {
    if (!options.enabled() || options.isControlled()) return;
    options.setHeaderVisible(true);
    scheduleHide();
  };

  const dispose = () => {
    clearHideTimer();
  };

  return {
    revealSession,
    clearHideTimer,
    dispose,
  };
}
