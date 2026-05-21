/**
 * Tauri 内嵌原生 WebView 叠在主 WebView 之上，会挡住 Portal 下拉/对话框/Toast。
 * 通过引用计数在需要显示主 WebView 浮层时临时 hide 子 WebView。
 */

import { createRoot, createSignal } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';
import { useInnerWebTauriPanel } from '@/lib/platform/inner-web-mode';

/** 高于 .reader-inner-web-layer (z-150) 的 Portal 层级 */
export const INNER_WEB_OVERLAY_Z = 'z-[160]';

/** 下拉关闭后快速恢复；仍保留短延迟以合并「关菜单 + 开对话框」 */
const RELEASE_DEFER_MS = 32;
const RELEASE_DEFER_OVERLAP_MS = 64;

let overlayRetainCount = 0;
let panelSuppressed = false;
let pendingShowTimer: ReturnType<typeof setTimeout> | null = null;

const [panelMaskVisible, setPanelMaskVisible] = createRoot(() => createSignal(false));

function syncPanelMaskVisible(): void {
  setPanelMaskVisible(panelSuppressed);
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('reader-inner-web-panel-mask', panelSuppressed);
  }
}

function cancelPendingShow(): void {
  if (pendingShowTimer !== null) {
    clearTimeout(pendingShowTimer);
    pendingShowTimer = null;
  }
}

export function isInnerWebPanelMaskVisible(): boolean {
  return panelMaskVisible();
}

async function applyPanelVisible(visible: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    if (!visible) {
      panelSuppressed = true;
      syncPanelMaskVisible();
      await invoke('set_inner_web_panel_visible', { visible: false });
      return;
    }
    await invoke('set_inner_web_panel_visible', { visible: true });
    requestAnimationFrame(() => {
      panelSuppressed = false;
      syncPanelMaskVisible();
    });
  } catch (e) {
    console.warn('[inner-web-panel-overlay] set_inner_web_panel_visible failed', e);
  }
}

async function flushPanelShow(): Promise<void> {
  if (overlayRetainCount > 0 || !panelSuppressed) return;
  cancelPendingShow();
  await applyPanelVisible(true);
}

export function shouldManageInnerWebPanelOverlay(
  content?: string | { url?: string; html?: string }
): boolean {
  const c =
    typeof content === 'string'
      ? { url: content }
      : content ?? {};
  return useInnerWebTauriPanel(c);
}

export async function retainInnerWebPanelForOverlay(): Promise<void> {
  if (!isTauri()) return;
  cancelPendingShow();
  overlayRetainCount += 1;
  if (!panelSuppressed) {
    await applyPanelVisible(false);
  }
}

export type ReleaseInnerWebPanelOptions = {
  /** 仅关闭下拉等单一浮层时使用，尽快恢复网页 */
  immediate?: boolean;
  /** 可能紧接打开对话框时使用，略长延迟避免闪烁 */
  overlap?: boolean;
};

export function releaseInnerWebPanelForOverlay(options?: ReleaseInnerWebPanelOptions): void {
  if (!isTauri()) return;
  overlayRetainCount = Math.max(0, overlayRetainCount - 1);
  if (overlayRetainCount > 0 || !panelSuppressed) {
    return;
  }
  cancelPendingShow();
  if (options?.immediate) {
    void flushPanelShow();
    return;
  }
  const delay = options?.overlap ? RELEASE_DEFER_OVERLAP_MS : RELEASE_DEFER_MS;
  pendingShowTimer = setTimeout(() => {
    pendingShowTimer = null;
    void flushPanelShow();
  }, delay);
}

export function retainInnerWebPanelForOverlayUntil(ms: number): void {
  void retainInnerWebPanelForOverlay();
  window.setTimeout(() => {
    releaseInnerWebPanelForOverlay({ immediate: true });
  }, ms);
}

export function createInnerWebMenuOpenChange(
  setOpen: (open: boolean) => void,
  pageUrl?: string
): (open: boolean) => void {
  const needsOverlay = () => shouldManageInnerWebPanelOverlay(pageUrl);
  return (next) => {
    if (needsOverlay()) {
      if (next) {
        void retainInnerWebPanelForOverlay().then(() => setOpen(true));
        return;
      }
      setOpen(false);
      // overlap：紧接打开另一浮层（如 Cookie 对话框）时略延迟恢复，避免子 WebView 闪到 Dialog 之上
      releaseInnerWebPanelForOverlay({ overlap: true });
      return;
    }
    setOpen(next);
  };
}

export function createInnerWebDialogOpenChange(
  setOpen: (open: boolean) => void,
  pageUrl?: string
): (open: boolean) => void {
  const needsOverlay = () => shouldManageInnerWebPanelOverlay(pageUrl);
  return (next) => {
    if (needsOverlay()) {
      if (next) {
        void retainInnerWebPanelForOverlay().then(() => setOpen(true));
        return;
      }
      setOpen(false);
      releaseInnerWebPanelForOverlay({ overlap: true });
      return;
    }
    setOpen(next);
  };
}
