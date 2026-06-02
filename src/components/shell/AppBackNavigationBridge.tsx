import { createEffect, onCleanup, onMount } from 'solid-js';
import {
  installBackNavigation,
  isConsumingBackNavigation,
  popBackHistoryProgrammatic,
  pushBackHistoryEntry,
  registerBackHandler,
} from '@/lib/navigation/back-navigation';
import { installKeyboardViewport } from '@/lib/platform/keyboard-viewport';

export interface BackLayerDefinition {
  id: string;
  close: () => void;
}

export interface AppBackNavigationBridgeProps {
  /** 按优先级排列：仅包含当前打开的可返回层 */
  getOpenLayers: () => BackLayerDefinition[];
}

/**
 * 挂载全局返回导航（history / Android）与输入法视口适配。
 * 通过 getOpenLayers 与 App 状态同步。
 */
export function AppBackNavigationBridge(props: AppBackNavigationBridgeProps) {
  onMount(() => {
    const uninstallBack = installBackNavigation();
    const uninstallKeyboard = installKeyboardViewport();
    onCleanup(() => {
      uninstallBack();
      uninstallKeyboard();
    });
  });

  createEffect((prevOpenIds: Set<string>) => {
    const openLayers = props.getOpenLayers();
    const currentIds = new Set(openLayers.map((l) => l.id));
    for (const id of currentIds) {
      if (!prevOpenIds.has(id)) pushBackHistoryEntry();
    }
    if (!isConsumingBackNavigation()) {
      for (const id of prevOpenIds) {
        if (!currentIds.has(id)) popBackHistoryProgrammatic();
      }
    }
    return currentIds;
  }, new Set<string>());

  createEffect(() => {
    const unregister = registerBackHandler(() => {
      const layers = props.getOpenLayers();
      const top = layers[0];
      if (!top) return false;
      top.close();
      return true;
    });
    onCleanup(unregister);
  });

  return null;
}

/** UI 按钮关闭可返回层：关闭后同步 history */
export function closeBackLayerUi(close: () => void): void {
  close();
  popBackHistoryProgrammatic();
}
