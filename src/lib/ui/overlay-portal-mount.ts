import { createRoot, createSignal } from 'solid-js';

const PORTAL_HOST_ID = 'reader-overlay-portal-host';

/**
 * 阅读器浮层统一 Portal 宿主：挂在 document.body，避免：
 * 1. Portal 落在 display:none 的叠层条目内；
 * 2. 落在 z-[110] 壳层内部导致 z-index 与 body 级浮层竞争失败；
 * 3. Solid Portal 插入的无尺寸包装 div 导致内部 fixed 子节点不可见。
 */
const [overlayPortalHost, setOverlayPortalHost] = createRoot(() =>
  createSignal<HTMLElement | undefined>(undefined),
);

let portalHostElement: HTMLDivElement | null = null;

function ensurePortalHostElement(): HTMLDivElement {
  if (portalHostElement) return portalHostElement;
  portalHostElement = document.createElement('div');
  portalHostElement.id = PORTAL_HOST_ID;
  portalHostElement.setAttribute('data-overlay-portal-host', '');
  document.body.appendChild(portalHostElement);
  return portalHostElement;
}

/** 栈顶为阅读器时启用 body 级宿主；否则关闭（浮层回退默认 body + APP 档位） */
export function setViewerOverlayPortalHostEnabled(enabled: boolean): void {
  const el = ensurePortalHostElement();
  if (enabled) {
    el.setAttribute('data-active', 'true');
    el.style.removeProperty('display');
    setOverlayPortalHost(el);
    return;
  }
  el.removeAttribute('data-active');
  el.style.display = 'none';
  setOverlayPortalHost(undefined);
}

/** @deprecated 使用 setViewerOverlayPortalHostEnabled */
export function registerOverlayPortalHost(el: HTMLElement | undefined): void {
  if (el) {
    setViewerOverlayPortalHostEnabled(true);
    return;
  }
  setViewerOverlayPortalHostEnabled(false);
}

/** 当前是否已启用阅读器 Portal 宿主（供 Select 等判断是否走 viewer 档位） */
export function useOverlayPortalMount(): HTMLElement | undefined {
  return overlayPortalHost();
}

/**
 * Solid Portal 的 mount 目标（函数形式，宿主晚于首帧启用时仍会挂到正确节点）。
 * 仅用于 AppDialog / AppDrawer 等直连 Kobalte·Corvu Portal 的封装；
 * ui/select、dropdown-menu 等源组件只接受 HTMLElement，请用 useOverlayPortalMount()。
 */
export function useOverlayPortalMountAccessor(): () => HTMLElement | undefined {
  return () => overlayPortalHost();
}
