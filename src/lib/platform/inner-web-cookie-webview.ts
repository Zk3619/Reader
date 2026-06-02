/**
 * inner-web Cookie 应写入/读出的 Tauri WebView：
 * - panel 模式：子 WebView（reader-inner-web）
 * - iframe 模式：主 WebView（避免残留 panel 与 iframe document.cookie 分叉）
 */

let useMainWebview = false;

export function setInnerWebCookiesUseMainWebview(main: boolean): void {
  useMainWebview = main;
}

export function getInnerWebCookiesUseMainWebview(): boolean {
  return useMainWebview;
}

export function innerWebCookieInvokeArgs(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  if (!useMainWebview) return extra;
  return { ...extra, useMainWebview: true };
}

/** iframe 且非代理文档时读主 WebView；代理会话 / Tauri panel 读子 WebView */
export function resolveInnerWebCookiesUseMainWebview(options: {
  iframeMode: boolean;
  useProxyDocument?: boolean;
}): boolean {
  return options.iframeMode && !options.useProxyDocument;
}
