/**
 * 备用：Tauri 独立子窗口（WebviewWindow + parent）
 * 关闭子窗口后主窗口原页面仍在，适合「书源设置 → 返回登录」流程。
 *
 * 启用：在 inner-web-mode.ts 将 INNER_WEB_USE_CHILD_WINDOW 设为 true，
 * 并在 inner-web-tauri / InnerWebPage 中切换到本模块 API。
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './detect';
import type { InnerWebPanelRect } from './inner-web-tauri';

export const INNER_WEB_CHILD_WINDOW_LABEL = 'reader-inner-web-child';

export const INNER_WEB_TOOLBAR_HEIGHT = 48;

/** 按主窗口客户区计算子窗口内容区（工具栏下方） */
export async function measureInnerWebChildRect(): Promise<InnerWebPanelRect> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  const size = await win.innerSize();
  const scale = await win.scaleFactor();
  const w = size.width / scale;
  const h = size.height / scale;
  const top = INNER_WEB_TOOLBAR_HEIGHT;
  return {
    x: 0,
    y: top,
    width: w,
    height: Math.max(h - top, 1),
  };
}

export async function openInnerWebChildWindow(
  url: string,
  cookies: string,
  rect: InnerWebPanelRect
): Promise<void> {
  if (!isTauri()) return;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http')) return;
  await invoke('open_inner_web_child_window', {
    url: trimmed,
    cookies: cookies.trim(),
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
}

export async function repositionInnerWebChildWindow(rect: InnerWebPanelRect): Promise<void> {
  if (!isTauri()) return;
  await invoke('reposition_inner_web_child_window', {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
}

export async function reloadInnerWebChildWindow(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('reload_inner_web_child_window');
  } catch (e) {
    console.warn('[inner-web-child-window] reload failed', e);
  }
}

export async function closeInnerWebChildWindow(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('close_inner_web_child_window');
  } catch (e) {
    console.warn('[inner-web-child-window] close failed', e);
  }
}
