import { onCleanup, onMount } from "solid-js";
import { destroySystemTray, ensureSystemTray } from "@/lib/tray/tray-manager";

/**
 * 托盘组件
 * 负责初始化和管理系统托盘图标
 * 这是一个纯逻辑组件，不渲染任何 UI
 */
export function Tray() {
  onMount(() => {
    void ensureSystemTray().catch((error) => {
      console.warn("初始化托盘失败:", error);
    });
  });

  onCleanup(() => {
    if (import.meta.env.DEV) {
      void destroySystemTray();
    }
  });

  return null;
}
