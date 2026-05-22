import { getCurrentWindow } from "@tauri-apps/api/window";
import { readHmrData, writeHmrData } from "@/lib/dev/hmr-state";
import { isTauri } from "@/lib/platform/detect";

const SPLASH_DONE_KEY = "splashDone";

/** 开发环境 HMR：本会话是否已完成开屏（存于 App 模块 hot.data，须经本模块读写） */
export function isDevSplashDone(): boolean {
  if (!import.meta.env.DEV || !import.meta.hot) {
    return false;
  }
  return readHmrData(SPLASH_DONE_KEY, false);
}

export function markDevSplashDone(): void {
  if (!import.meta.env.DEV || !import.meta.hot) {
    return;
  }
  writeHmrData(SPLASH_DONE_KEY, true);
}

/** 主窗口初始为 hidden，需在开屏或 HMR 跳过时显式 show */
export async function ensureMainWindowVisible(): Promise<void> {
  if (!isTauri()) {
    return;
  }
  try {
    const appWindow = getCurrentWindow();
    if (!(await appWindow.isVisible())) {
      await appWindow.show();
      await appWindow.center();
    }
  } catch (error) {
    console.warn("窗口显示失败:", error);
  }
}
