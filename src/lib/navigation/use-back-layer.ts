import { createEffect, onCleanup, type Accessor } from 'solid-js';
import {
  isConsumingBackNavigation,
  popBackHistoryProgrammatic,
  pushBackHistoryEntry,
  registerBackHandler,
} from '@/lib/navigation/back-navigation';

/**
 * 组件内本地叠层（抽屉、设置子页等）接入系统返回。
 * open 变为 true 时 push history；UI 关闭时 pop；系统返回走 handler。
 */
export function useBackLayer(open: Accessor<boolean>, close: () => void): void {
  let pushed = false;

  createEffect(() => {
    const isOpen = open();
    if (isOpen && !pushed) {
      pushed = true;
      pushBackHistoryEntry();
    } else if (!isOpen && pushed) {
      pushed = false;
      if (!isConsumingBackNavigation()) {
        popBackHistoryProgrammatic();
      }
    }
  });

  onCleanup(() => {
    if (!pushed) return;
    pushed = false;
    if (!isConsumingBackNavigation()) {
      popBackHistoryProgrammatic();
    }
  });

  createEffect(() => {
    const unregister = registerBackHandler(() => {
      if (!open()) return false;
      close();
      return true;
    });
    onCleanup(unregister);
  });
}
