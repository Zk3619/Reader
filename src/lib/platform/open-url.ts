/**
 * 应用内打开 URL：统一走 InnerWeb 浮层。
 * Tauri 桌面 https 使用独立子 WebView；移动端 / 纯 Web 使用 iframe。
 * 系统浏览器仍用 openUrlInBrowser。
 */

import { parseDataHtmlUrl } from './data-url';
import { isTauri } from './detect';
import { openInnerWeb, openInnerWebAwait, type InnerWebCloseResult } from './inner-web';

const OPEN_URL_LOG = '[openUrlInApp]';

/** 书源登录/设置内嵌页标题（与 Legado WebViewActivity、control() 一致） */
export const SOURCE_SETTINGS_INNER_WEB_TITLE = '书源设置';

function resolveInnerWebUrl(
  url: string,
  title?: string,
  options?: {
    showConfirm?: boolean;
    awaitClose?: boolean;
    cookieSyncUrl?: string;
    initialCookies?: string;
  }
): boolean | Promise<InnerWebCloseResult> {
  const trimmed = url?.trim();
  if (!trimmed) return false;

  const base = {
    title: title ?? '网页',
    showConfirm: options?.showConfirm,
    cookieSyncUrl: options?.cookieSyncUrl ?? trimmed,
    initialCookies: options?.initialCookies,
  };

  if (trimmed.startsWith('data:')) {
    const html = parseDataHtmlUrl(trimmed);
    if (html) {
      const payload = { ...base, html };
      return options?.awaitClose ? openInnerWebAwait(payload) : openInnerWeb(payload);
    }
    console.warn(OPEN_URL_LOG, 'data: 无法解析为 HTML', trimmed.slice(0, 80));
    return false;
  }

  if (trimmed.startsWith('reader-login-open://')) {
    console.warn(
      OPEN_URL_LOG,
      'reader-login-open:// 不能用于 iframe，请使用 set_cookies_for_inner_web',
      trimmed.slice(0, 80)
    );
    return false;
  }

  const payload = { ...base, url: trimmed };
  return options?.awaitClose ? openInnerWebAwait(payload) : openInnerWeb(payload);
}

/**
 * 在应用内打开 URL（http(s)、data:）
 */
export async function openUrlInApp(
  url: string,
  title?: string,
  options?: { showConfirm?: boolean }
): Promise<void> {
  const trimmed = url?.trim();
  console.warn(OPEN_URL_LOG, 'entry', { url: trimmed?.slice(0, 100), title });
  const isHttp = trimmed?.startsWith('http://') || trimmed?.startsWith('https://');
  const isData = trimmed?.startsWith('data:');
  if (!trimmed || (!isHttp && !isData)) {
    console.warn(OPEN_URL_LOG, 'skip: URL 为空或非 http(s)/data:', {
      trimmed: trimmed?.slice(0, 80),
    });
    return;
  }
  const r = resolveInnerWebUrl(trimmed, title, { showConfirm: options?.showConfirm });
  if (r === false) {
    console.error(OPEN_URL_LOG, '内嵌页未注册或打开失败');
  }
}

/**
 * 打开内嵌页并等待用户点击 √（Legado startBrowserAwait）
 */
export async function openUrlInAppAwait(
  url: string,
  cookies: string,
  title?: string
): Promise<InnerWebCloseResult> {
  const trimmed = (url ?? '').trim();
  const cookieStr = (cookies ?? '').trim();
  if (!trimmed) {
    return { confirmed: false, cookies: '', url: '' };
  }

  const r = resolveInnerWebUrl(trimmed, title, {
    awaitClose: true,
    showConfirm: true,
    cookieSyncUrl: trimmed,
    initialCookies: cookieStr || undefined,
  });
  if (r === false) {
    return { confirmed: false, cookies: '', url: '' };
  }
  return r as Promise<InnerWebCloseResult>;
}

/**
 * 带 Cookie 的应用内打开（桌面子 WebView / 移动端 iframe 由 InnerWebPage 注入）
 */
export async function openUrlInAppWithCookies(
  url: string,
  cookies: string,
  title?: string,
  options?: { showConfirm?: boolean }
): Promise<void> {
  const trimmed = (url ?? '').trim();
  const cookieStr = (cookies ?? '').trim();
  if (!trimmed) return;

  if (!cookieStr || !/^https?:/i.test(trimmed)) {
    await openUrlInApp(trimmed, title, options);
    return;
  }

  if (
    !openInnerWeb({
      title: title ?? '网页',
      url: trimmed,
      showConfirm: options?.showConfirm ?? true,
      cookieSyncUrl: trimmed,
      initialCookies: cookieStr,
    })
  ) {
    console.error(OPEN_URL_LOG, '内嵌页未注册');
  }
}

/**
 * 书源脚本 startBrowser / startBrowserAwait：使用书源传入的标题（如「晴天小说后台」）
 */
export async function openLegadoBrowserInApp(
  url: string,
  cookies: string,
  title?: string,
  options?: { awaitClose?: false }
): Promise<void>;
export async function openLegadoBrowserInApp(
  url: string,
  cookies: string,
  title: string | undefined,
  options: { awaitClose: true }
): Promise<InnerWebCloseResult>;
export async function openLegadoBrowserInApp(
  url: string,
  cookies = '',
  title?: string,
  options?: { awaitClose?: boolean }
): Promise<InnerWebCloseResult | void> {
  const trimmed = url?.trim();
  if (!trimmed) {
    return options?.awaitClose
      ? { confirmed: false, cookies: '', url: '' }
      : undefined;
  }
  const pageTitle = (title ?? '').trim() || '网页';
  if (options?.awaitClose) {
    return openUrlInAppAwait(trimmed, cookies, pageTitle);
  }
  await openUrlInAppWithCookies(trimmed, cookies, pageTitle, { showConfirm: true });
}

/**
 * 以「书源设置」形式打开内嵌页：专用工具栏 + √ 同步 Cookie（与 loginUrl 中 control() 一致）
 */
export async function openSourceSettingsInApp(
  url: string,
  cookies?: string,
  options?: { awaitClose?: false }
): Promise<void>;
export async function openSourceSettingsInApp(
  url: string,
  cookies: string | undefined,
  options: { awaitClose: true }
): Promise<InnerWebCloseResult>;
export async function openSourceSettingsInApp(
  url: string,
  cookies = '',
  options?: { awaitClose?: boolean }
): Promise<InnerWebCloseResult | void> {
  const trimmed = url?.trim();
  if (!trimmed) {
    return options?.awaitClose
      ? { confirmed: false, cookies: '', url: '' }
      : undefined;
  }
  if (options?.awaitClose) {
    return openUrlInAppAwait(trimmed, cookies, SOURCE_SETTINGS_INNER_WEB_TITLE);
  }
  await openUrlInAppWithCookies(trimmed, cookies, SOURCE_SETTINGS_INNER_WEB_TITLE, {
    showConfirm: true,
  });
}

/**
 * 在系统默认浏览器中打开 URL
 */
export async function openUrlInBrowser(url: string): Promise<void> {
  const trimmed = url?.trim();
  if (!trimmed || (!trimmed.startsWith('http://') && !trimmed.startsWith('https://'))) {
    return;
  }
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(trimmed);
  } else {
    window.open(trimmed, '_blank', 'noopener,noreferrer');
  }
}
