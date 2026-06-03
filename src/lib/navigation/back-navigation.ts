/**
 * 应用内返回导航：统一处理浏览器后退、Android 系统返回键/边缘手势。
 *
 * 模式：
 * - 打开可返回层时 pushState，关闭时（UI 按钮）popProgrammatic
 * - popstate / Android 返回触发 consumeBackNavigation，按栈顶 handler 消费
 * - 根层无 handler：首次提示「再按一次退出」，窗口内再次则退出（Tauri）
 */

export type BackHandler = () => boolean;

const HISTORY_KEY = 'readerNav';
/** 根层「再按一次退出」确认窗口（毫秒） */
export const ROOT_EXIT_CONFIRM_MS = 2000;

interface BackEntry {
  id: symbol;
  handler: BackHandler;
}

const handlerStack: BackEntry[] = [];

let historyDepth = 0;
let skipNextPop = false;
let installed = false;
let consumingBackNavigation = false;
let rootExitArmedAt = 0;

/** @internal 测试专用 */
export function __resetBackNavigationForTests(): void {
  handlerStack.length = 0;
  historyDepth = 0;
  skipNextPop = false;
  consumingBackNavigation = false;
  installed = false;
  rootExitArmedAt = 0;
}

/** 打开可返回层时重置根层退出计时 */
export function resetRootExitConfirm(): void {
  rootExitArmedAt = 0;
}

/**
 * 根层返回：首次返回 'armed'，窗口内再次返回 'exit'。
 * @internal 可单测
 */
export function stepRootExitConfirm(
  now: number,
  armedAt: number,
  windowMs = ROOT_EXIT_CONFIRM_MS,
): { nextArmedAt: number; action: 'armed' | 'exit' } {
  if (armedAt > 0 && now - armedAt < windowMs) {
    return { nextArmedAt: 0, action: 'exit' };
  }
  return { nextArmedAt: now, action: 'armed' };
}

export function isConsumingBackNavigation(): boolean {
  return consumingBackNavigation;
}

export function registerBackHandler(handler: BackHandler): () => void {
  resetRootExitConfirm();
  const id = Symbol('back-handler');
  const entry: BackEntry = { id, handler };
  handlerStack.push(entry);
  return () => {
    const index = handlerStack.findIndex((e) => e.id === id);
    if (index >= 0) handlerStack.splice(index, 1);
  };
}

export function consumeBackNavigation(): boolean {
  for (let i = handlerStack.length - 1; i >= 0; i--) {
    if (handlerStack[i].handler()) return true;
  }
  return false;
}

export function getBackHistoryDepth(): number {
  return historyDepth;
}

/** 无可返回层时校正 history 深度，避免「再按一次退出」无法真正退出 */
export function clearBackHistoryDepth(): void {
  historyDepth = 0;
  skipNextPop = false;
  if (typeof history !== 'undefined') {
    history.replaceState({ [HISTORY_KEY]: 0 }, '');
  }
}

export function hasBackNavigation(): boolean {
  return handlerStack.length > 0 || historyDepth > 0;
}

/** 打开一层可返回 UI 时调用（与 registerBackHandler 配对） */
export function pushBackHistoryEntry(): void {
  resetRootExitConfirm();
  historyDepth += 1;
  history.pushState({ [HISTORY_KEY]: historyDepth, at: Date.now() }, '');
}

/** UI 主动关闭时同步 history（避免 popstate 再次触发关闭逻辑） */
export function popBackHistoryProgrammatic(): void {
  if (historyDepth <= 0) return;
  skipNextPop = true;
  historyDepth = Math.max(0, historyDepth - 1);
  history.back();
}

function restoreHistoryEntry(): void {
  skipNextPop = true;
  history.pushState({ [HISTORY_KEY]: historyDepth }, '');
}

async function exitApplication(): Promise<void> {
  try {
    const { isTauri } = await import('@/lib/platform/detect');
    if (!isTauri()) return;
    const { exit } = await import('@tauri-apps/plugin-process');
    await exit(0);
  } catch (e) {
    console.warn('[back-navigation] exit failed', e);
  }
}

function handleRootBackNavigation(): void {
  const { nextArmedAt, action } = stepRootExitConfirm(Date.now(), rootExitArmedAt);
  rootExitArmedAt = nextArmedAt;

  if (action === 'exit') {
    void exitApplication();
    return;
  }

  void import('@/components/shared/AppToasts').then(({ showAppToast }) => {
    showAppToast({
      title: '再按一次退出',
      duration: ROOT_EXIT_CONFIRM_MS,
      variant: 'default',
    });
  });

  restoreHistoryEntry();
}

function handlePopState(): void {
  if (skipNextPop) {
    skipNextPop = false;
    return;
  }

  historyDepth = Math.max(0, historyDepth - 1);

  consumingBackNavigation = true;
  try {
    if (consumeBackNavigation()) return;
    handleRootBackNavigation();
  } finally {
    consumingBackNavigation = false;
  }
}

/** 由 Android / 无 history 栈时的直接返回 */
export function triggerBackNavigation(): boolean {
  consumingBackNavigation = true;
  try {
    if (consumeBackNavigation()) {
      if (historyDepth > 0) popBackHistoryProgrammatic();
      return true;
    }
    return false;
  } finally {
    consumingBackNavigation = false;
  }
}

export function installBackNavigation(): () => void {
  if (installed) return () => undefined;
  installed = true;

  if (typeof history !== 'undefined' && history.state?.[HISTORY_KEY] == null) {
    history.replaceState({ [HISTORY_KEY]: 0 }, '');
  }

  const onPopState = () => handlePopState();
  window.addEventListener('popstate', onPopState);

  let unlistenAndroid: (() => void) | undefined;

  void (async () => {
    try {
      const { isAndroid } = await import('@/lib/platform/detect');
      if (!isAndroid()) return;

      const { onBackButtonPress } = await import('@tauri-apps/api/app');
      const listener = await onBackButtonPress((payload) => {
        if (triggerBackNavigation()) return;
        if (payload.canGoBack) {
          skipNextPop = true;
          history.back();
          return;
        }
        handleRootBackNavigation();
      });
      unlistenAndroid = () => {
        void listener.unregister();
      };
    } catch (e) {
      console.warn('[back-navigation] Android 返回键监听注册失败', e);
    }
  })();

  return () => {
    window.removeEventListener('popstate', onPopState);
    unlistenAndroid?.();
    installed = false;
    rootExitArmedAt = 0;
  };
}

/**
 * Solid 组件内：可返回层打开时自动 push history 并注册 handler。
 * close 内应更新 open 状态；若通过 UI 关闭，请额外调用 popBackHistoryProgrammatic。
 */
export function bindBackLayer(open: () => boolean, close: () => void): () => void {
  let pushedForThisOpen = false;

  const syncOpen = () => {
    const isOpen = open();
    if (isOpen && !pushedForThisOpen) {
      pushedForThisOpen = true;
      pushBackHistoryEntry();
    }
    if (!isOpen) {
      pushedForThisOpen = false;
    }
  };

  syncOpen();

  const unregisterHandler = registerBackHandler(() => {
    if (!open()) return false;
    close();
    return true;
  });

  return () => {
    unregisterHandler();
  };
}
