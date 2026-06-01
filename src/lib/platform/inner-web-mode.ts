/**
 * 内嵌网页呈现方式（Tauri 桌面）：
 * - tauri-panel：主窗口 add_child 子 WebView
 * - iframe：DOM iframe + postMessage 桥（须 ensure_inner_web_iframe_scripts 处理跨域 Cookie）
 * - auto：优先 panel，打开失败或曾回退后会话内改用 iframe
 *
 * 纯 Web / 移动端始终 iframe。
 */

import { isMobile, isTauri } from '@/lib/platform/detect';
import { settingsState } from '@/stores/settings';

export type InnerWebRenderModePreference = 'auto' | 'tauri-panel' | 'iframe';

/**
 * 备用：true 时使用 WebviewWindow 子窗口（见 inner-web-child-window.ts），
 * false 时使用同窗口 add_child 面板（默认）。
 */
export const INNER_WEB_USE_CHILD_WINDOW = false;

export interface InnerWebContent {
  url?: string;
  html?: string;
}

/** auto 模式下探测 panel 不可用后，本会话后续打开不再尝试 panel */
let panelRuntimeBlocked = false;

/** 当前 inner-web 会话内 panel 已回退 iframe */
let panelSessionFallback = false;

export function getInnerWebRenderModePreference(): InnerWebRenderModePreference {
  if (!isTauri() || isMobile()) {
    return 'iframe';
  }
  const v = settingsState.app.innerWebRenderMode;
  if (v === 'tauri-panel' || v === 'iframe' || v === 'auto') {
    return v;
  }
  return 'auto';
}

export function resetInnerWebPanelRuntimeAvailability(): void {
  panelRuntimeBlocked = false;
}

export function onInnerWebSessionEnded(): void {
  panelSessionFallback = false;
}

/** panel 打开失败：auto 记为不可用；当前会话改用 iframe */
export function markInnerWebPanelSessionFallback(): void {
  panelSessionFallback = true;
  if (getInnerWebRenderModePreference() === 'auto') {
    panelRuntimeBlocked = true;
  }
}

function isTauriDesktopPanelCandidate(content: InnerWebContent): boolean {
  const url = content.url?.trim() ?? '';
  const html = content.html?.trim() ?? '';
  return isTauri() && !isMobile() && (/^https?:/i.test(url) || Boolean(html));
}

/** 是否应使用 Tauri 内嵌子 WebView 面板 */
export function resolveInnerWebUsesTauriPanel(content: InnerWebContent): boolean {
  if (!isTauriDesktopPanelCandidate(content)) {
    return false;
  }
  if (panelSessionFallback) {
    return false;
  }
  const pref = getInnerWebRenderModePreference();
  if (pref === 'iframe') {
    return false;
  }
  if (pref === 'auto' && panelRuntimeBlocked) {
    return false;
  }
  return true;
}

/** 是否在本应用 UI 内使用 iframe 承载内容 */
export function useInnerWebIframe(content: InnerWebContent): boolean {
  const url = content.url?.trim() ?? '';
  const html = content.html?.trim() ?? '';
  if (!url && !html) {
    return false;
  }
  return !resolveInnerWebUsesTauriPanel(content);
}

/** Tauri 桌面独立 WebView 面板（https 或 data:text/html） */
export function useInnerWebTauriPanel(content: InnerWebContent): boolean {
  return resolveInnerWebUsesTauriPanel(content);
}
