/**
 * 阅读器退出时清理仍挂在 document.body 上的 Viewer 级 Dialog / Drawer Portal。
 * Kobalte / Corvu 在宿主卸载或 modal 关闭时偶发无法移除 body 遮罩，导致主界面无法点击。
 */

import { dismissOpenKobalteOverlays } from '@/utils/accessibility';

/** 阅读器壳层内 Dialog / Drawer 挂 body 时使用的 z-index 档位（z-[120]–z-[137]） */
const VIEWER_BODY_OVERLAY_Z_RE = /z-\[(?:12[0-9]|13[0-9])\]/;

export const VIEWER_SHELL_OVERLAY_EVENTS = {
  /** 通知阅读器页面关闭所有本地 open 状态（须在 nav.pop 前触发） */
  CLOSE_ALL: 'viewer-shell-close-overlays',
} as const;

export function requestCloseViewerShellOverlays(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(VIEWER_SHELL_OVERLAY_EVENTS.CLOSE_ALL));
}

function isViewerBodyOverlay(el: Element): boolean {
  const cls = el.className;
  return typeof cls === 'string' && VIEWER_BODY_OVERLAY_Z_RE.test(cls);
}

function isBodyPortalWrapper(el: HTMLElement): boolean {
  if (el.parentElement !== document.body) return false;
  const cls = el.className;
  if (typeof cls !== 'string') return false;
  return cls.includes('fixed') && cls.includes('inset-0');
}

function removeBodyPortalWrapper(backdrop: HTMLElement): void {
  const wrapper = backdrop.parentElement;
  if (wrapper && wrapper.parentElement === document.body) {
    wrapper.remove();
    return;
  }
  backdrop.remove();
  backdrop.parentElement?.querySelector('[data-app-overlay-surface]')?.remove();
}

/** 移除 body 上已关闭的 AppDialog Portal（避免残留遮罩挡住抽屉/主界面点击） */
function removeOrphanBodyDialogPortals(): void {
  document.body.querySelectorAll<HTMLElement>(':scope > div').forEach((wrapper) => {
    if (!isBodyPortalWrapper(wrapper)) return;
    if (wrapper.children.length === 0) {
      wrapper.remove();
      return;
    }
    if (wrapper.querySelector('[data-app-overlay-surface][data-expanded]')) return;
    if (
      wrapper.querySelector('[data-app-overlay-backdrop]') ||
      wrapper.querySelector('[data-app-overlay-surface]')
    ) {
      wrapper.remove();
    }
  });
}

/** 恢复 Kobalte modal 可能遗留在 document / #root 上的副作用 */
export function restoreAppModalSideEffects(): void {
  const root = document.getElementById('root');
  root?.removeAttribute('aria-hidden');
  root?.removeAttribute('inert');
  document.getElementById('main-content-container')?.removeAttribute('aria-hidden');

  document.body.style.removeProperty('pointer-events');
  document.body.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('pointer-events');

  removeOrphanBodyDialogPortals();
}

/**
 * 移除 body 上残留的阅读器级遮罩 / 对话框 Portal（仅匹配 Viewer z 档位）。
 * 可在 nav.pop 前后调用；重复调用安全。
 */
export function dismissViewerBodyOverlays(): void {
  if (typeof document === 'undefined') return;

  dismissOpenKobalteOverlays();

  const removed = new Set<Element>();
  document.body.querySelectorAll<HTMLElement>('[data-app-overlay-backdrop]').forEach((backdrop) => {
    if (!isViewerBodyOverlay(backdrop) || removed.has(backdrop)) return;
    removeBodyPortalWrapper(backdrop);
    removed.add(backdrop);
  });

  restoreAppModalSideEffects();
}

/** 等待阅读器内 Dialog 有机会响应 open=false 后再继续（如 nav.pop） */
export function afterViewerShellOverlaysClosed(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
