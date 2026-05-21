/**
 * Tauri 内嵌网页：主窗口内子 WebView（与工具栏同窗口分层）
 */

import { invoke } from '@tauri-apps/api/core';
import { appendYueduTauriPanelBridgeToHtml } from '@/lib/platform/inner-web-yuedu-bridge-snippet';
import { isTauri } from '@/lib/platform/detect';

export const INNER_WEB_WEBVIEW_LABEL = 'reader-inner-web';

function htmlToDataDocumentUrl(html: string): string {
  const b64 = btoa(unescape(encodeURIComponent(html)));
  return `data:text/html;charset=utf-8;base64,${b64}`;
}

export interface InnerWebPanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function setInnerWebSessionActive(active: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('set_inner_web_session_active', { active });
  } catch (e) {
    console.warn('[inner-web-tauri] set_inner_web_session_active failed', e);
  }
}

/** 将原生输入焦点交给内嵌子 WebView（布局/导航完成后可再调一次） */
export async function focusInnerWebTauriPanel(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('focus_inner_web_panel');
  } catch {
    // 面板尚未 add_child 时可能失败，由 open 流程稍后重试
  }
}

export async function openInnerWebTauriPanel(
  opts: { url?: string; html?: string; cookies: string; rect: InnerWebPanelRect }
): Promise<void> {
  if (!isTauri()) return;
  const httpUrl = (opts.url ?? '').trim();
  const htmlRaw = (opts.html ?? '').trim();
  const navigationUrl = httpUrl.startsWith('http')
    ? httpUrl
    : htmlRaw
      ? htmlToDataDocumentUrl(appendYueduTauriPanelBridgeToHtml(htmlRaw))
      : '';
  if (!navigationUrl.startsWith('http') && !navigationUrl.startsWith('data:text/html')) return;
  await invoke('open_inner_web_panel', {
    url: navigationUrl,
    cookies: opts.cookies.trim(),
    x: opts.rect.x,
    y: opts.rect.y,
    width: opts.rect.width,
    height: opts.rect.height,
  });
}

export async function repositionInnerWebTauriPanel(rect: InnerWebPanelRect): Promise<void> {
  if (!isTauri()) return;
  await invoke('reposition_inner_web_panel', {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
}

export async function reloadInnerWebTauriPanel(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('reload_inner_web_panel');
  } catch (e) {
    console.warn('[inner-web-tauri] reload_inner_web_panel failed', e);
  }
}

export async function closeInnerWebTauriPanel(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('close_inner_web_panel');
  } catch (e) {
    console.warn('[inner-web-tauri] close_inner_web_panel failed', e);
  }
}
