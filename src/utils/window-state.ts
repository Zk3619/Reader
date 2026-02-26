/**
 * 窗口状态管理工具
 * 用于确保应用退出时窗口状态被正确保存
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { saveWindowState, StateFlags } from '@tauri-apps/plugin-window-state';
import { isTauri } from '@/lib/platform/detect';

/**
 * 保存窗口状态
 * 在应用退出前调用，确保窗口状态（包括 visible）被保存
 */
export async function saveWindowStateBeforeExit(): Promise<void> {
  if (!isTauri()) {
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    const isVisible = await appWindow.isVisible();

    // 如果窗口是隐藏的，确保保存 visible: false
    // 如果窗口是显示的，保存当前状态
    await saveWindowState(StateFlags.ALL);

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
  if (!isTauri()) {
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    await appWindow.hide();

    // 立即保存状态，确保 visible: false 被保存
    await saveWindowState(StateFlags.ALL);

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
  if (!isTauri()) {
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    await appWindow.show();
    await appWindow.setFocus();

    // 保存状态，确保 visible: true 被保存
    await saveWindowState(StateFlags.ALL);

    console.log('[窗口状态] 窗口已显示并保存状态');
  } catch (error) {
    console.error('[窗口状态] 显示窗口并保存状态失败:', error);
  }
}

/**
 * 监听窗口关闭事件，确保状态被保存
 */
export function setupWindowStateListeners(): () => void {
  if (!isTauri()) {
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
