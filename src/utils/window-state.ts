/**
 * 窗口状态管理：通过 Rust 命令读写 exe 旁 `.window-state.json`
 */

import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isMobile, isTauri } from '@/lib/platform/detect';

function isDesktopTauri(): boolean {
  if (!isTauri()) return false;
  const tauriPlatform = import.meta.env.TAURI_ENV_PLATFORM;
  if (tauriPlatform === 'android' || tauriPlatform === 'ios') return false;
  return !isMobile();
}

async function saveWindowStateSafely(): Promise<void> {
  await invoke('save_window_state');
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
    await appWindow.show();
    await appWindow.setFocus();
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
