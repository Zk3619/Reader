import { onMount } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TrayIcon, type TrayIconEvent } from "@tauri-apps/api/tray";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { hideWindowAndSaveState, showWindowAndSaveState } from "@/utils/window-state";

/**
 * 托盘组件
 * 负责初始化和管理系统托盘图标
 * 这是一个纯逻辑组件，不渲染任何 UI
 */
export function Tray() {
  let trayIconInitialized = false; // 防止重复初始化托盘

  onMount(async () => {
    // 检测是否为 Tauri 环境
    try {
      await initTray();
    } catch (error) {
      console.warn("初始化托盘失败:", error);
    }
  });

  // 初始化托盘
  async function initTray() {
    // 防止重复初始化
    if (trayIconInitialized) {
      return;
    }

    try {
      // 检查是否已经存在托盘图标，如果存在则先删除（避免回调丢失问题）
      try {
        const existingTray = await TrayIcon.getById("main-tray");
        if (existingTray) {
          await TrayIcon.removeById("main-tray");
        }
      } catch (error) {
        // 如果获取失败，说明不存在，继续创建
      }

      // 切换窗口显示/隐藏的函数
      const toggleWindow = async () => {
        try {
          const currentWindow = getCurrentWindow();
          const isVisible = await currentWindow.isVisible();

          if (isVisible) {
            // 窗口已显示，隐藏到托盘并保存状态
            await hideWindowAndSaveState();
          } else {
            // 窗口已隐藏，显示窗口并保存状态
            await showWindowAndSaveState();
          }
        } catch (error) {
          console.error("切换窗口显示状态失败:", error);
          // 降级方案：直接使用窗口 API
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

      // 获取当前窗口状态，用于设置菜单项初始文本
      let initialMenuText = "显示窗口";
      try {
        const currentWindow = getCurrentWindow();
        const isVisible = await currentWindow.isVisible();
        initialMenuText = isVisible ? "隐藏窗口" : "显示窗口";
      } catch (error) {
        console.warn("获取窗口状态失败，使用默认菜单文本:", error);
      }

      // 创建菜单项，使用 action 处理点击事件
      // 菜单项会根据窗口状态执行相应操作并更新文本
      const showItem = await MenuItem.new({
        id: "show",
        text: initialMenuText, // 根据当前窗口状态设置初始文本
        action: async () => {
          try {
            const currentWindow = getCurrentWindow();
            const isVisible = await currentWindow.isVisible();

            // 根据窗口状态执行相应操作并更新菜单项文本
            if (isVisible) {
              // 窗口已显示，点击后隐藏，所以更新文本为"显示窗口"
              await showItem.setText("显示窗口");
              // 隐藏窗口
              await currentWindow.hide();
            } else {
              // 窗口已隐藏，点击后显示，所以更新文本为"隐藏窗口"
              await showItem.setText("隐藏窗口");
              // 显示窗口
              await currentWindow.show();
              await currentWindow.setFocus();
            }
          } catch (error) {
            console.error("切换窗口显示状态失败:", error);
          }
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

      // 创建菜单
      const menu = await Menu.new({
        items: [showItem, quitItem],
      });

      // 获取默认应用图标
      let appIcon = null;
      try {
        appIcon = await defaultWindowIcon();
      } catch (error) {
        console.warn("无法获取默认应用图标:", error);
      }

      // 创建托盘图标配置
      const trayOptions: any = {
        id: "main-tray",
        tooltip: "阅读",
        menu: menu,
      };

      // 如果成功获取应用图标，则设置为托盘图标
      if (appIcon) {
        trayOptions.icon = appIcon;
      }

      // 添加点击事件处理
      // 根据 Tauri 官方文档：https://tauri.app/zh-cn/reference/javascript/api/namespacetray/#trayiconclickevent
      // TrayIconEvent 可以是 Click、DoubleClick、Enter、Move、Leave
      // Click 事件包含 button (Left/Right/Middle) 和 buttonState (Up/Down)
      trayOptions.action = async (event: TrayIconEvent) => {
        try {
          // 处理左键点击事件：切换窗口显示/隐藏
          if (event.type === "Click" && event.button === "Left" && event.buttonState === "Up") {
            await toggleWindow();
          }
          // 右键点击：显示菜单（由 menu 配置自动处理，不需要特殊处理）
        } catch (error) {
          console.error("托盘点击事件处理失败:", error);
        }
      };

      // 创建托盘图标
      const trayIcon = await TrayIcon.new(trayOptions);

      // 设置左键点击不显示菜单（因为我们要通过 action 处理）
      await trayIcon.setShowMenuOnLeftClick(false);

      // 标记已初始化，防止重复创建
      trayIconInitialized = true;
    } catch (error) {
      console.error("创建托盘失败:", error);
    }
  }

  // 这个组件不渲染任何内容
  return null;
}
