import { defaultWindowIcon } from "@tauri-apps/api/app";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { TrayIcon, type TrayIconEvent, type TrayIconOptions } from "@tauri-apps/api/tray";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@/lib/platform/detect";
import { hideWindowAndSaveState, showWindowAndSaveState } from "@/utils/window-state";
import { refreshMusicTrayMenu } from "@/lib/media/audio/platform/music-tray";

const TRAY_ID = "main-tray";

/** 模块级单例：避免 HMR 新建组件实例时重复创建托盘 */
let initPromise: Promise<void> | null = null;

async function removeTrayIfExists(): Promise<void> {
  try {
    const existing = await TrayIcon.getById(TRAY_ID);
    if (existing) {
      await TrayIcon.removeById(TRAY_ID);
    }
  } catch {
    // 托盘不存在或尚未创建
  }
}

/**
 * 确保系统托盘已创建（幂等，并发安全）
 */
export async function ensureSystemTray(): Promise<void> {
  if (!isTauri()) {
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = createSystemTray().catch((error) => {
    initPromise = null;
    throw error;
  });

  return initPromise;
}

/**
 * 移除系统托盘（HMR / 组件卸载时调用）
 */
export async function destroySystemTray(): Promise<void> {
  await removeTrayIfExists();
  initPromise = null;
}

async function createSystemTray(): Promise<void> {
  await removeTrayIfExists();

  const toggleWindow = async () => {
    try {
      const currentWindow = getCurrentWindow();
      const isVisible = await currentWindow.isVisible();

      if (isVisible) {
        await hideWindowAndSaveState();
      } else {
        await showWindowAndSaveState();
      }
    } catch (error) {
      console.error("切换窗口显示状态失败:", error);
      try {
        const currentWindow = getCurrentWindow();
        const isVisible = await currentWindow.isVisible();
        if (isVisible) {
          await currentWindow.hide();
        } else {
          await currentWindow.show();
          await currentWindow.setFocus();
        }
      } catch (fallbackError) {
        console.error("降级方案也失败:", fallbackError);
      }
    }
  };

  // 先用最小菜单创建托盘，再挂载完整音乐菜单
  const showItem = await MenuItem.new({
    id: "show",
    text: "显示窗口",
    action: async () => {
      await toggleWindow();
      void refreshMusicTrayMenu();
    },
  });

  const quitItem = await MenuItem.new({
    id: "quit",
    text: "退出Reader",
    action: async () => {
      try {
        const currentWindow = getCurrentWindow();
        await currentWindow.close();
      } catch (error) {
        console.error("关闭窗口失败:", error);
      }
    },
  });

  const menu = await Menu.new({
    items: [showItem, quitItem],
  });

  let appIcon: TrayIconOptions["icon"];
  try {
    appIcon = (await defaultWindowIcon()) ?? undefined;
  } catch (error) {
    console.warn("无法获取默认应用图标:", error);
  }

  const trayOptions: TrayIconOptions = {
    id: TRAY_ID,
    tooltip: "阅读",
    menu,
    icon: appIcon,
    action: async (event: TrayIconEvent) => {
      try {
        if (event.type === "Click" && event.button === "Left" && event.buttonState === "Up") {
          await toggleWindow();
          void refreshMusicTrayMenu();
        }
      } catch (error) {
        console.error("托盘点击事件处理失败:", error);
      }
    },
  };

  const trayIcon = await TrayIcon.new(trayOptions);
  await trayIcon.setShowMenuOnLeftClick(false);
  void refreshMusicTrayMenu();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void destroySystemTray();
  });
}
