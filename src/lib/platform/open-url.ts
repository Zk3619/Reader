/**
 * 应用内打开 URL：统一走 InnerWeb 浮层。
 * Tauri 桌面 https 使用独立子 WebView；移动端 / 纯 Web 使用 iframe。
 * 系统浏览器仍用 openUrlInBrowser。
 */

import { parseDataHtmlUrl } from '@/lib/platform/data-url';
import { isTauri } from '@/lib/platform/detect';
import {
  openInnerWeb,
  openInnerWebAwait,
  type InnerWebCloseResult,
  type InnerWebPayload,
} from '@/lib/platform/inner-web';

const OPEN_URL_LOG = '[openUrlInApp]';

/** 书源登录/设置内嵌页标题（与 Legado WebViewActivity、control() 一致） */
export const SOURCE_SETTINGS_INNER_WEB_TITLE = '书源设置';

export interface InnerWebOpenOptions {
  showConfirm?: boolean;
  awaitClose?: boolean;
  cookieSyncUrl?: string;
  initialCookies?: string;
  /** 书源 bookSourceUrl，用于统一 Cookie 池双向同步 */
  bookSourceUrl?: string;
}

function buildInnerWebPayload(
  trimmed: string,
  title: string | undefined,
  options?: InnerWebOpenOptions,
): InnerWebPayload | null {
  const base: InnerWebPayload = {
    title: title ?? '网页',
    showConfirm: options?.showConfirm,
    cookieSyncUrl: options?.cookieSyncUrl ?? trimmed,
    initialCookies: options?.initialCookies,
    bookSourceUrl: options?.bookSourceUrl?.trim() || undefined,
  };

  if (trimmed.startsWith('data:')) {
    const html = parseDataHtmlUrl(trimmed);
    if (!html) {
      console.warn(OPEN_URL_LOG, 'data: 无法解析为 HTML', trimmed.slice(0, 80));
      return null;
    }
    return { ...base, html };
  }

  if (trimmed.startsWith('reader-login-open://')) {
    console.warn(
      OPEN_URL_LOG,
      'reader-login-open:// 不能用于 iframe，请使用 set_cookies_for_inner_web',
      trimmed.slice(0, 80),
    );
    return null;
  }

  return { ...base, url: trimmed };
}

function resolveInnerWebUrl(
  url: string,
  title?: string,
  options?: InnerWebOpenOptions,
): boolean | Promise<InnerWebCloseResult> {
  const trimmed = url.trim();
  if (!trimmed) return false;

  const payload = buildInnerWebPayload(trimmed, title, options);
  if (!payload) return false;

  return options?.awaitClose ? openInnerWebAwait(payload) : openInnerWeb(payload);
}

/**
 * 在应用内打开 URL（http(s)、data:）
 */
export async function openUrlInApp(
  url: string,
  title?: string,
  options?: Pick<InnerWebOpenOptions, 'showConfirm' | 'bookSourceUrl'>,
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
  const r = resolveInnerWebUrl(trimmed, title, { showConfirm: options?.showConfirm, bookSourceUrl: options?.bookSourceUrl });
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
  title?: string,
  options?: Pick<InnerWebOpenOptions, 'bookSourceUrl'>,
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
    bookSourceUrl: options?.bookSourceUrl,
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
  options?: Pick<InnerWebOpenOptions, 'showConfirm' | 'bookSourceUrl'>,
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
      bookSourceUrl: options?.bookSourceUrl,
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
  options?: { awaitClose?: false; bookSourceUrl?: string },
): Promise<void>;
export async function openLegadoBrowserInApp(
  url: string,
  cookies: string,
  title: string | undefined,
  options: { awaitClose: true; bookSourceUrl?: string },
): Promise<InnerWebCloseResult>;
export async function openLegadoBrowserInApp(
  url: string,
  cookies = '',
  title?: string,
  options?: { awaitClose?: boolean; bookSourceUrl?: string },
): Promise<InnerWebCloseResult | void> {
  const trimmed = url?.trim();
  if (!trimmed) {
    return options?.awaitClose
      ? { confirmed: false, cookies: '', url: '' }
      : undefined;
  }
  const pageTitle = (title ?? '').trim() || '网页';
  const poolOpts = { bookSourceUrl: options?.bookSourceUrl };
  if (options?.awaitClose) {
    return openUrlInAppAwait(trimmed, cookies, pageTitle, poolOpts);
  }
  await openUrlInAppWithCookies(trimmed, cookies, pageTitle, {
    showConfirm: true,
    ...poolOpts,
  });
}

/**
 * 以「书源设置」形式打开内嵌页：专用工具栏 + √ 同步 Cookie（与 loginUrl 中 control() 一致）
 */
export async function openSourceSettingsInApp(
  url: string,
  cookies?: string,
  options?: { awaitClose?: false; bookSourceUrl?: string },
): Promise<void>;
export async function openSourceSettingsInApp(
  url: string,
  cookies: string | undefined,
  options: { awaitClose: true; bookSourceUrl?: string },
): Promise<InnerWebCloseResult>;
export async function openSourceSettingsInApp(
  url: string,
  cookies = '',
  options?: { awaitClose?: boolean; bookSourceUrl?: string },
): Promise<InnerWebCloseResult | void> {
  const trimmed = url?.trim();
  if (!trimmed) {
    return options?.awaitClose
      ? { confirmed: false, cookies: '', url: '' }
      : undefined;
  }
  const poolOpts = { bookSourceUrl: options?.bookSourceUrl };
  if (options?.awaitClose) {
    return openUrlInAppAwait(trimmed, cookies, SOURCE_SETTINGS_INNER_WEB_TITLE, poolOpts);
  }
  await openUrlInAppWithCookies(trimmed, cookies, SOURCE_SETTINGS_INNER_WEB_TITLE, {
    showConfirm: true,
    ...poolOpts,
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
