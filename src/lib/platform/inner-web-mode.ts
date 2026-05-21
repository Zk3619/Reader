/**
 * 内嵌网页呈现方式：Tauri 下 https 使用内嵌 WebView（避免 iframe 子 frame 注入 Tauri 脚本），
 * 纯 Web / data: HTML 仍用 iframe。
 */

import { isMobile, isTauri } from '@/lib/platform/detect';

/**
 * 备用：true 时使用 WebviewWindow 子窗口（见 inner-web-child-window.ts），
 * false 时使用同窗口 add_child 面板（默认）。
 */
export const INNER_WEB_USE_CHILD_WINDOW = false;

export interface InnerWebContent {
  url?: string;
  html?: string;
}

/** 是否在本应用 UI 内使用 iframe 承载内容 */
export function useInnerWebIframe(content: InnerWebContent): boolean {
  const url = content.url?.trim() ?? '';
  const html = content.html?.trim() ?? '';
  if (isTauri() && /^https?:/i.test(url)) {
    return false;
  }
  if (isTauri() && !isMobile() && html && !/^https?:/i.test(url)) {
    return false;
  }
  return Boolean(url || html);
}

/** Tauri 桌面独立 WebView 面板（https 或 data:text/html；移动端仍用 iframe） */
export function useInnerWebTauriPanel(content: InnerWebContent): boolean {
  const url = content.url?.trim() ?? '';
  const html = content.html?.trim() ?? '';
  return isTauri() && !isMobile() && (/^https?:/i.test(url) || Boolean(html));
}
