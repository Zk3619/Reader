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

/** 是否点击在应用 Toast 层（`.reader-toast-host` / solid-sonner） */
export function isAppToastTarget(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof Element)) return false;
  return !!(
    target.closest('.reader-toast-host') ||
    target.closest('[data-sonner-toaster]') ||
    target.closest('[data-sonner-toast]')
  );
}

export function preventDrawerDismissForFloatingOverlay(event: {
  target?: EventTarget | null;
  detail?: { originalEvent?: Event };
  preventDefault: () => void;
}): void {
  const target = event.detail?.originalEvent?.target ?? event.target;
  if (isAppFloatingOverlayTarget(target)) {
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
export function preventCorvuOutsidePointerForAppToast(event: PointerEvent): void {
  if (isAppToastTarget(event.target)) {
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
