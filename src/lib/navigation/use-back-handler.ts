import {
  popBackHistoryProgrammatic,
  pushBackHistoryEntry,
  registerBackHandler,
  isConsumingBackNavigation,
  type BackHandler,
} from '@/lib/navigation/back-navigation';
import { onMount } from 'solid-js';

/** 注册临时返回 handler（栈顶优先），不自动 push history */
export function useBackHandler(getHandler: () => BackHandler | undefined): void {
  onMount(() => {
    return registerBackHandler(() => {
      const handler = getHandler();
      return handler ? handler() : false;
    });
  });
}

/** 主动关闭可返回层：先关 UI，再同步 history */
export function closeBackLayerUi(close: () => void): void {
  close();
  popBackHistoryProgrammatic();
}

/** 主动打开可返回层：先开 UI，再 push history */
export function openBackLayerUi(open: () => void): void {
  open();
  pushBackHistoryEntry();
}

export { popBackHistoryProgrammatic, pushBackHistoryEntry, isConsumingBackNavigation };
