/**
 * 窗口状态管理工具
 * 用于确保应用退出时窗口状态被正确保存
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { isMobile, isTauri } from '@/lib/platform/detect';

let windowStatePluginAvailable: boolean | null = null;
let pluginMissingWarned = false;
let windowStatePluginPromise: Promise<typeof import('@tauri-apps/plugin-window-state')> | null = null;

function isDesktopTauri(): boolean {
  if (!isTauri()) return false;
  const tauriPlatform = import.meta.env.TAURI_ENV_PLATFORM;
  if (tauriPlatform === 'android' || tauriPlatform === 'ios') return false;
  return !isMobile();
}

function isPluginMissingError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('plugin not found') || message.includes('not allowed');
}

async function loadWindowStatePlugin() {
  if (windowStatePluginPromise) return windowStatePluginPromise;
  windowStatePluginPromise = import('@tauri-apps/plugin-window-state');
  return windowStatePluginPromise;
}

async function saveWindowStateSafely(): Promise<boolean> {
  if (windowStatePluginAvailable === false) {
    return false;
  }

  try {
    const plugin = await loadWindowStatePlugin();
    await plugin.saveWindowState(plugin.StateFlags.ALL);
    windowStatePluginAvailable = true;
    return true;
  } catch (error) {
    if (isPluginMissingError(error)) {
      windowStatePluginAvailable = false;
      if (!pluginMissingWarned) {
        pluginMissingWarned = true;
        console.warn('[窗口状态] window-state 插件未注册，已自动降级为仅切换窗口显示，不再保存窗口状态');
      }
      return false;
    }
    throw error;
  }
}

/**
 * 保存窗口状态
 * 在应用退出前调用，确保窗口状态（包括 visible）被保存
 */
export async function saveWindowStateBeforeExit(): Promise<void> {
  if (!isDesktopTauri()) {
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    const isVisible = await appWindow.isVisible();

    // 如果窗口是隐藏的，确保保存 visible: false
    // 如果窗口是显示的，保存当前状态
    await saveWindowStateSafely();

    console.log('[窗口状态] 窗口状态已保存:', {
      visible: isVisible,
    });
  } catch (error) {
    console.error('[窗口状态] 保存窗口状态失败:', error);
  }
}

/**
 * 隐藏窗口并保存状态
 * 用于"隐藏到托盘"功能
 */
export async function hideWindowAndSaveState(): Promise<void> {
  if (!isDesktopTauri()) {
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    await appWindow.hide();

    // 立即保存状态，确保 visible: false 被保存
    await saveWindowStateSafely();

    console.log('[窗口状态] 窗口已隐藏并保存状态');
  } catch (error) {
    console.error('[窗口状态] 隐藏窗口并保存状态失败:', error);
  }
}

/**
 * 显示窗口并保存状态
 * 用于从托盘恢复窗口
 */
export async function showWindowAndSaveState(): Promise<void> {
  if (!isDesktopTauri()) {
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    await appWindow.show();
    await appWindow.setFocus();

    // 保存状态，确保 visible: true 被保存
    await saveWindowStateSafely();

    console.log('[窗口状态] 窗口已显示并保存状态');
  } catch (error) {
    console.error('[窗口状态] 显示窗口并保存状态失败:', error);
  }
}

/**
 * 监听窗口关闭事件，确保状态被保存
 */
export function setupWindowStateListeners(): () => void {
  if (!isDesktopTauri()) {
    return () => { }; // 返回空清理函数
  }

  const handleBeforeUnload = async () => {
    await saveWindowStateBeforeExit();
  };

  // 监听页面卸载事件（正常关闭）
  window.addEventListener('beforeunload', handleBeforeUnload);

  // 监听页面隐藏事件（切换到其他应用）
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
      // 页面隐藏时也保存状态
      await saveWindowStateBeforeExit();
    }
  });

  // 返回清理函数
  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}
