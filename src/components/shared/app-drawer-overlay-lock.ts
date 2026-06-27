import { createContext, useContext, type Accessor } from 'solid-js';

/** 抽屉内 Select / Dropdown 等 Portal 浮层打开时，阻止 corvu 因“外部点击”关闭抽屉 */
export type AppDrawerOverlayLock = {
  acquire: () => () => void;
};

export const AppDrawerOverlayLockContext = createContext<AppDrawerOverlayLock | null>(null);

/** 将 Kobalte Select 等 Portal 挂到抽屉内容节点内，避免被 corvu 判为“外部”交互 */
export const AppDrawerPortalMountContext = createContext<Accessor<HTMLElement | undefined>>();

const noopPortalMount: Accessor<HTMLElement | undefined> = () => undefined;

export function useAppDrawerPortalMount(): Accessor<HTMLElement | undefined> {
  return useContext(AppDrawerPortalMountContext) ?? noopPortalMount;
}

/** 是否已有展开中的 Kobalte 下拉菜单 */
export function hasOpenAppDropdownMenu(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector(
    '[id*="dropdownmenu"][data-expanded], [role="menu"][data-expanded]',
  );
}

function resolveOutsideEventTarget(event: {
  target?: EventTarget | null;
  detail?: { originalEvent?: Event };
}): EventTarget | null | undefined {
  const original = event.detail?.originalEvent;
  if (original && 'relatedTarget' in original) {
    const related = (original as FocusEvent).relatedTarget;
    if (related) return related;
  }
  return event.target;
}

/** Dialog 与 Portal 下拉/选择器共存：阻止 outside / focus outside 误关浮层或抢焦点 */
export function preventDialogDismissForPopperLayer(event: {
  target?: EventTarget | null;
  detail?: { originalEvent?: Event };
  preventDefault: () => void;
}): void {
  const target = resolveOutsideEventTarget(event);
  if (isAppFloatingOverlayTarget(target)) {
    event.preventDefault();
    return;
  }
  if (hasOpenAppDropdownMenu()) {
    event.preventDefault();
  }
}

/** 是否在 Kobalte / Popper 浮层内（Portal 到 body 时的兜底） */
export function isAppFloatingOverlayTarget(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof Element)) return false;
  return !!(
    target.closest('[role="listbox"]') ||
    target.closest('[role="menu"]') ||
    target.closest('[data-popper-positioner]') ||
    target.closest('[id*="listbox"]') ||
    target.closest('[id*="select-content"]') ||
    target.closest('[id*="dropdownmenu-content"]')
  );
}

/** 是否点击在仍打开中的 AppDialog 遮罩/内容（勿匹配已关闭残留节点） */
export function isAppExpandedDialogOverlayTarget(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof Element)) return false;
  return !!(
    target.closest('[data-app-overlay-backdrop][data-expanded]') ||
    target.closest('[data-app-overlay-surface][data-expanded]') ||
    target.closest('[role="dialog"][data-expanded]')
  );
}

/** 是否点击在应用 Toast 层（`.reader-toast-host` / solid-sonner） */
export function isAppToastTarget(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof Element)) return false;
  return !!(
    target.closest('.reader-toast-host') ||
    target.closest('[data-sonner-toaster]') ||
    target.closest('[data-sonner-toast]')
  );
}

/** corvu Drawer `onOutsidePointer`：原生 PointerEvent 或带 originalEvent 的自定义事件 */
export type AppOutsidePointerEvent = PointerEvent | {
  target?: EventTarget | null;
  detail?: { originalEvent?: Event };
  preventDefault: () => void;
};

function outsidePointerTarget(event: AppOutsidePointerEvent): EventTarget | null | undefined {
  if (event instanceof PointerEvent) return event.target;
  return event.detail?.originalEvent?.target ?? event.target;
}

export function preventDrawerDismissForFloatingOverlay(event: AppOutsidePointerEvent): void {
  const target = outsidePointerTarget(event);
  if (isAppFloatingOverlayTarget(target) || isAppExpandedDialogOverlayTarget(target)) {
    event.preventDefault();
  }
}

/** Kobalte Dialog：Toast 交互不应触发 outside dismiss */
export function preventOverlayDismissForAppToast(event: {
  target?: EventTarget | null;
  detail?: { originalEvent?: Event };
  preventDefault: () => void;
}): void {
  const target = event.detail?.originalEvent?.target ?? event.target;
  if (isAppToastTarget(target)) {
    event.preventDefault();
  }
}

/** corvu Drawer / Dialog：Toast 交互不应触发 outside dismiss */
export function preventCorvuOutsidePointerForAppToast(event: AppOutsidePointerEvent): void {
  if (isAppToastTarget(outsidePointerTarget(event))) {
    event.preventDefault();
  }
}

export function useAppDrawerOverlayLock(): AppDrawerOverlayLock | null {
  return useContext(AppDrawerOverlayLockContext);
}

/** 在组件内维护单次 acquire；组件卸载时须 onCleanup 调用返回的 release */
export function syncAppDrawerOverlayLock(
  lock: AppDrawerOverlayLock | null | undefined,
  open: boolean,
  releaseRef: { current: (() => void) | undefined },
): void {
  if (!lock) return;
  if (open) {
    releaseRef.current?.();
    releaseRef.current = lock.acquire();
    return;
  }
  releaseRef.current?.();
  releaseRef.current = undefined;
}

export function appDrawerBlocksOutsideDismiss(
  lockCount: Accessor<number>,
  userCloseOnOutsidePointer: boolean | undefined,
): boolean {
  if (lockCount() > 0) return false;
  return userCloseOnOutsidePointer ?? true;
}
