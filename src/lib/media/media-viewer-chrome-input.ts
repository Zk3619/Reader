import { isMediaViewerInteractiveClick } from '@/lib/media/is-media-viewer-interactive-click';
import { isMobile } from '@/lib/platform/detect';

/** 桌面 / Web（非移动 UA）：启用鼠标移出视口显示顶底栏等逻辑 */
export function isMediaViewerDesktopPointerChrome(): boolean {
  return !isMobile();
}

/** 等待判定为「单击」的时长；此时间内第二次点击或 dblclick 则取消待执行的单击 */
export const MEDIA_VIEWER_CLICK_PAIR_MS = 200;

export type MediaViewerChromeInputHandlers = {
  bindShellElement: (el: HTMLElement | undefined) => void;
  onShellPointerLeave: (event: PointerEvent) => void;
  onShellPointerEnter: (event: PointerEvent) => void;
  /** 主区单击：延迟执行 action，双击时取消（不触发分区/播放等） */
  onContentPrimaryClick: (event: MouseEvent, action: () => void) => void;
  /** 双击：仅切换顶底栏，并取消待执行的单击 */
  onContentDblClick: (event: MouseEvent, options?: { forceChrome?: boolean }) => void;
  dispose: () => void;
};

function isPointerLeavingShell(
  shell: HTMLElement,
  relatedTarget: EventTarget | null,
): boolean {
  if (!relatedTarget) return true;
  if (!(relatedTarget instanceof Node)) return true;
  return !shell.contains(relatedTarget);
}

/**
 * 顶/底栏交互：
 * - 单击延迟执行（双击不触发第一次单击逻辑）
 * - 双击切换顶底栏
 * - 桌面：指针离开阅读器区域显示顶底栏，回到区域后首次单击仅隐藏
 */
export function createMediaViewerChromeInputHandlers(options: {
  headerVisible: () => boolean;
  setHeaderVisible: (visible: boolean) => void;
  toggleBars: () => void;
  enabled: () => boolean;
}): MediaViewerChromeInputHandlers {
  let shellElement: HTMLElement | undefined;
  let awaitingDismissClick = false;
  let shownBarsByPointerLeave = false;
  let lastPrimaryClickAt = 0;
  let pendingSingleTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingSingleAction: (() => void) | null = null;

  const isDesktop = () => isMediaViewerDesktopPointerChrome();

  const clearPendingSingle = () => {
    if (pendingSingleTimer !== undefined) {
      clearTimeout(pendingSingleTimer);
      pendingSingleTimer = undefined;
    }
    pendingSingleAction = null;
  };

  const resetClickPair = () => {
    lastPrimaryClickAt = 0;
    clearPendingSingle();
  };

  const bindShellElement = (el: HTMLElement | undefined) => {
    shellElement = el;
  };

  const showBarsFromPointerLeave = () => {
    options.setHeaderVisible(true);
    shownBarsByPointerLeave = true;
    awaitingDismissClick = false;
  };

  const onDocumentPointerOut = (event: PointerEvent) => {
    if (!options.enabled() || !isDesktop() || !shellElement) return;
    if (!isPointerLeavingShell(shellElement, event.relatedTarget)) return;
    if (!(event.target instanceof Node) || !shellElement.contains(event.target)) return;
    showBarsFromPointerLeave();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('pointerout', onDocumentPointerOut);
  }

  const onShellPointerLeave = (event: PointerEvent) => {
    if (!options.enabled() || !isDesktop()) return;
    const shell = event.currentTarget;
    if (
      !shell ||
      typeof shell !== 'object' ||
      typeof (shell as HTMLElement).contains !== 'function'
    ) {
      return;
    }
    if (!isPointerLeavingShell(shell as HTMLElement, event.relatedTarget)) return;
    showBarsFromPointerLeave();
  };

  const onShellPointerEnter = (_event: PointerEvent) => {
    if (!options.enabled() || !isDesktop() || !shownBarsByPointerLeave) return;
    if (options.headerVisible()) {
      awaitingDismissClick = true;
    }
    shownBarsByPointerLeave = false;
  };

  const onContentPrimaryClick = (event: MouseEvent, action: () => void) => {
    if (!options.enabled()) return;
    if (isMediaViewerInteractiveClick(event.target)) return;

    if (isDesktop() && awaitingDismissClick) {
      event.preventDefault();
      event.stopPropagation();
      awaitingDismissClick = false;
      resetClickPair();
      options.setHeaderVisible(false);
      return;
    }

    const now = Date.now();
    if (now - lastPrimaryClickAt < MEDIA_VIEWER_CLICK_PAIR_MS) {
      clearPendingSingle();
      lastPrimaryClickAt = 0;
      return;
    }
    lastPrimaryClickAt = now;
    clearPendingSingle();
    pendingSingleAction = action;
    pendingSingleTimer = setTimeout(() => {
      pendingSingleTimer = undefined;
      const run = pendingSingleAction;
      pendingSingleAction = null;
      lastPrimaryClickAt = 0;
      run?.();
    }, MEDIA_VIEWER_CLICK_PAIR_MS);
  };

  const onContentDblClick = (event: MouseEvent, _dblOptions?: { forceChrome?: boolean }) => {
    if (!options.enabled()) return;
    if (isMediaViewerInteractiveClick(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    awaitingDismissClick = false;
    resetClickPair();
    options.toggleBars();
  };

  const dispose = () => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerout', onDocumentPointerOut);
    }
    shellElement = undefined;
    awaitingDismissClick = false;
    shownBarsByPointerLeave = false;
    resetClickPair();
  };

  return {
    bindShellElement,
    onShellPointerLeave,
    onShellPointerEnter,
    onContentPrimaryClick,
    onContentDblClick,
    dispose,
  };
}
