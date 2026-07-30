/**
 * 窗口状态管理：通过 Rust 命令读写 exe 旁 `.window-state.json`
 */

import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isMobile, isTauri } from '@/lib/platform/detect';

export type MainWindowTrayVisibility = 'hidden' | 'shown';

const trayVisibilityListeners = new Set<(visibility: MainWindowTrayVisibility) => void>();

function isDesktopTauri(): boolean {
  if (!isTauri()) return false;
  const tauriPlatform = import.meta.env.TAURI_ENV_PLATFORM;
  if (tauriPlatform === 'android' || tauriPlatform === 'ios') return false;
  return !isMobile();
}

async function saveWindowStateSafely(): Promise<void> {
  await invoke('save_window_state');
}

/** 应用主动隐藏/恢复到托盘时调用；OS 任务栏最小化不要调用。 */
export function notifyMainWindowTrayVisibility(visibility: MainWindowTrayVisibility): void {
  for (const listener of trayVisibilityListeners) {
    try {
      listener(visibility);
    } catch (error) {
      console.warn('[窗口状态] 托盘显隐监听失败:', error);
    }
  }
}

/** 订阅由应用主动执行的托盘隐藏/恢复；OS 任务栏最小化不会触发。 */
export function subscribeMainWindowTrayVisibility(
  listener: (visibility: MainWindowTrayVisibility) => void,
): () => void {
  trayVisibilityListeners.add(listener);
  return () => trayVisibilityListeners.delete(listener);
}

/** 将主窗口从任务栏最小化或托盘隐藏状态恢复到前台。 */
export async function bringMainWindowToFrontIfHiddenOrMinimized(): Promise<void> {
  if (!isDesktopTauri()) return;

  try {
    const appWindow = getCurrentWindow();
    const [isVisible, isMinimized] = await Promise.all([
      appWindow.isVisible(),
      appWindow.isMinimized(),
    ]);
    if (isVisible && !isMinimized) return;

    if (isMinimized) await appWindow.unminimize();
    if (!isVisible) await appWindow.show();
    await appWindow.setFocus();
    notifyMainWindowTrayVisibility('shown');
  } catch (error) {
    console.error('[窗口状态] 唤起主窗口失败:', error);
  }
}

/**
 * 保存窗口状态（退出、隐藏托盘前调用）
 */
export async function saveWindowStateBeforeExit(): Promise<void> {
  if (!isDesktopTauri()) {
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    const isVisible = await appWindow.isVisible();
    await saveWindowStateSafely();
    console.log('[窗口状态] 已保存:', { visible: isVisible });
  } catch (error) {
    console.error('[窗口状态] 保存失败:', error);
  }
}

/**
 * 隐藏窗口并保存状态（隐藏到托盘）
 */
export async function hideWindowAndSaveState(): Promise<void> {
  if (!isDesktopTauri()) {
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    await appWindow.hide();
    notifyMainWindowTrayVisibility('hidden');
    await saveWindowStateSafely();
    console.log('[窗口状态] 窗口已隐藏并保存状态');
  } catch (error) {
    console.error('[窗口状态] 隐藏窗口并保存状态失败:', error);
  }
}

/**
 * 显示窗口并保存状态（从托盘恢复）
 */
export async function showWindowAndSaveState(): Promise<void> {
  if (!isDesktopTauri()) {
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    try {
      await appWindow.unminimize();
    } catch {
      /* 窗口未最小化或平台不支持时继续 show */
    }
    await appWindow.show();
    await appWindow.setFocus();
    notifyMainWindowTrayVisibility('shown');
    await saveWindowStateSafely();
    console.log('[窗口状态] 窗口已显示并保存状态');
  } catch (error) {
    console.error('[窗口状态] 显示窗口并保存状态失败:', error);
  }
}

/**
 * 监听页面卸载/隐藏，主动触发保存
 */
export function setupWindowStateListeners(): () => void {
  if (!isDesktopTauri()) {
    return () => {};
  }

  const handleBeforeUnload = () => {
    void saveWindowStateBeforeExit();
  };

  window.addEventListener('beforeunload', handleBeforeUnload);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      void saveWindowStateBeforeExit();
    }
  });

  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}
