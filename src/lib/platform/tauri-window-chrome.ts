/**
 * Tauri 桌面端在移动壳层下补窗口拖拽与双击最大化（顶栏无系统标题栏时）
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { isMobile, isTauri } from '@/lib/platform/detect';

export function shouldEnableTauriWindowChrome(useMobileShell: boolean): boolean {
  return isTauri() && !isMobile() && useMobileShell;
}

export async function toggleTauriWindowMaximize(): Promise<void> {
  if (!isTauri() || isMobile()) return;
  try {
    const win = getCurrentWindow();
    const maximized = await win.isMaximized();
    if (maximized) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  } catch (e) {
    console.warn('[tauri-window-chrome] 切换最大化失败', e);
  }
}

export function createTauriWindowChromeDblClickHandler(): (e: MouseEvent) => void {
  return (e: MouseEvent) => {
    const target = e.target;
    if (target instanceof Element && target.closest('.no-drag, button, a, input, textarea, select, label')) {
      return;
    }
    void toggleTauriWindowMaximize();
  };
}
