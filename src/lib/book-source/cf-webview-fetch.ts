/**
 * CF 站点：cf_clearance 绑定 WebView TLS 指纹，Tauri plugin-http 直连会 403。
 * 桌面端用后台 WebView 拉 HTML；移动端回退带 Client Hints 的 HTTP。
 */

import type { BookSource } from '@/types';
import { request, HttpError } from '@/lib/http';
import { isCloudflareBlockedResponse } from '@/lib/http/cloudflare-verification';
import { mergeLegadoCookieHeaderStrings } from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import {
  getCfActiveRequestOrigin,
  getCfActiveUserAgent,
  LEGADO_GYKS_DESKTOP_UA,
} from '@/lib/book-source/source-http';
import { syncSourceCookiePool } from '@/lib/book-source/source-cookie-pool';
import { applyCfBrowserDocumentHeaders } from '@/lib/book-source/cf-browser-headers';
import { decodeBookSourceResponseBytes } from '@/lib/book-source/response-charset';
import { fetchHtmlViaInnerWebProxySession } from '@/lib/http/inner-web-proxy-session';
import { releaseCfDeferredInnerWebDismiss } from '@/lib/platform/inner-web';
import { ensureInnerWebPanelForCfFetch } from '@/lib/platform/inner-web-tauri';
import { isMobile, isTauri } from '@/lib/platform/detect';

function throwCfChallengeError(pageUrl: string, kind: 'GET' | 'POST'): never {
  const label = kind === 'POST' ? 'CF POST 拉取' : 'CF 拉取';
  throw new HttpError(
    403,
    'Forbidden',
    pageUrl,
    `${label}仍返回挑战页，请重新完成验证`,
  );
}

export function cookieHeaderHasCfClearance(cookieHeader: string): boolean {
  // 仅 cf_clearance 表示已通过 JS 质询、绑定浏览器指纹（直连会 403，须 WebView）。
  // __cf_bm 是 CF bot 管理 cookie，正常直连也会下发，不代表该请求需要 WebView。
  return /(?:^|;\s*)cf_clearance=/i.test(cookieHeader.trim());
}

export function shouldUseCfWebViewFetch(
  source: BookSource | undefined,
  cookieHeader: string,
): boolean {
  if (!source || typeof window === 'undefined') return false;
  if (!getCfActiveRequestOrigin(source)) return false;
  return cookieHeaderHasCfClearance(cookieHeader);
}

/** CF WebView 拉取失败（超时/挑战/panel 未就绪）时可重新走内嵌页验证 */
export function isCfFetchRetryableError(error: unknown): boolean {
  if (typeof window === 'undefined') return false;
  if (error instanceof HttpError && (error.status === 403 || error.status === 503)) {
    return isCloudflareBlockedResponse(error.status, error.body ?? '');
  }
  const msg = error instanceof Error ? error.message : String(error);
  return /CF 拉取|WebJs 执行超时|内嵌 panel 未打开|内嵌网页面板未打开|挑战页|返回空正文/i.test(
    msg,
  );
}

/** panel 抓取前等待 SPA 列表渲染（由调用方传入 CSS 选择器，Rust 不写死站点路径） */
export interface CfPanelWaitOptions {
  selector: string;
  minCount?: number;
  timeoutMs?: number;
}

export interface CfWebViewFetchOptions {
  panelWait?: CfPanelWaitOptions;
  /** 用 panel 内 fetch 取正文（RSS/XML 避免导航空页） */
  useFetch?: boolean;
}

async function fetchPageHtmlViaTauriCfPanel(
  pageUrl: string,
  cookies: string,
  userAgent: string,
  delayMs: number,
  panelWait?: CfPanelWaitOptions,
  useFetch?: boolean,
): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  await ensureInnerWebPanelForCfFetch({
    seedUrl: pageUrl,
    cookies,
    userAgent,
  });
  const invokeFetch = () =>
    invoke<string>('fetch_inner_web_panel_html', {
      url: pageUrl,
      cookies: cookies || undefined,
      userAgent: userAgent || undefined,
      delayMs,
      waitSelector: panelWait?.selector?.trim() || undefined,
      waitMinCount: panelWait?.minCount,
      waitTimeoutMs: panelWait?.timeoutMs,
      useFetch: useFetch === true ? true : undefined,
    });
  try {
    return await invokeFetch();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/内嵌 panel 未打开|内嵌网页面板未打开/i.test(msg)) {
      await ensureInnerWebPanelForCfFetch({
        seedUrl: pageUrl,
        cookies,
        userAgent,
      });
      return await invokeFetch();
    }
    throw e;
  }
}

async function fetchPageHtmlViaCfHttp(
  url: string,
  headers: Record<string, string>,
  enabledCookieJar: boolean,
): Promise<string> {
  const hdrs = { ...headers };
  applyCfBrowserDocumentHeaders(hdrs);
  const res = await request(url, {
    method: 'GET',
    headers: hdrs,
    enableCookieJar: enabledCookieJar,
  });
  return res.text();
}

/** 用 WebView（桌面）或增强 HTTP（移动）加载页面正文 */
export async function fetchPageHtmlViaCfWebView(
  source: BookSource,
  url: string,
  cookies: string,
  headers: Record<string, string>,
  options?: CfWebViewFetchOptions,
): Promise<string> {
  const pageUrl = url.trim();
  if (!pageUrl.startsWith('http')) {
    throw new Error('CF 拉取需要 http(s) URL');
  }

  await syncSourceCookiePool(source, pageUrl);

  const hdrs = { ...headers };
  const cookieMerged = mergeLegadoCookieHeaderStrings(
    cookies.trim(),
    String(hdrs.Cookie ?? hdrs.cookie ?? '').trim(),
  );
  if (cookieMerged) {
    hdrs.Cookie = cookieMerged;
  }
  delete hdrs.cookie;

  let html = '';

  try {
  if (isTauri() && !isMobile()) {
    const cfUa = getCfActiveUserAgent(source)?.trim() || LEGADO_GYKS_DESKTOP_UA;
    const delayMs = options?.panelWait
      ? 5000
      : cookieHeaderHasCfClearance(cookieMerged)
        ? 4000
        : 2200;
    // cf_clearance 绑定 panel WebView 指纹；backstage 实例不同会导致 403/超时
    html = await fetchPageHtmlViaTauriCfPanel(
      pageUrl,
      cookieMerged,
      cfUa,
      delayMs,
      options?.panelWait,
      options?.useFetch,
    );
  } else if (!isTauri()) {
    const headersForSession = { ...hdrs };
    delete headersForSession.Cookie;
    delete headersForSession.cookie;
    /** 与 CF 验证 panel 一致：勿注入书源 Android UA，由代理使用浏览器 UA */
    delete headersForSession['User-Agent'];
    delete headersForSession['user-agent'];
    html = await fetchHtmlViaInnerWebProxySession(
      pageUrl,
      cookieMerged,
      headersForSession,
      { cloudflareChallenge: cookieHeaderHasCfClearance(cookieMerged) },
    );
  } else {
    html = await fetchPageHtmlViaCfHttp(
      pageUrl,
      hdrs,
      source.enabledCookieJar === true,
    );
  }
  } finally {
    releaseCfDeferredInnerWebDismiss();
  }

  if (!html.trim()) {
    throw new Error('CF 拉取返回空正文');
  }
  if (isCloudflareBlockedResponse(200, html)) {
    throwCfChallengeError(pageUrl, 'GET');
  }
  return html;
}

/** 搜索 POST（如 banzhu /s.php）：须 WebView 内 fetch，plugin-http 会 403 */
export async function fetchPostHtmlViaCfWebView(
  source: BookSource,
  url: string,
  body: string,
  headers: Record<string, string>,
  cookies: string,
  responseCharset?: string,
): Promise<string> {
  const pageUrl = url.trim();
  if (!pageUrl.startsWith('http')) {
    throw new Error('CF POST 拉取需要 http(s) URL');
  }

  await syncSourceCookiePool(source, pageUrl);

  const hdrs = { ...headers };
  const cookieMerged = mergeLegadoCookieHeaderStrings(
    cookies.trim(),
    String(hdrs.Cookie ?? hdrs.cookie ?? '').trim(),
  );
  delete hdrs.Cookie;
  delete hdrs.cookie;

  let html = '';
  if (isTauri() && !isMobile()) {
    const { runBackstageFetchPost } = await import('@/lib/rule-engine/webjs-tauri');
    html = await runBackstageFetchPost({
      url: pageUrl,
      body,
      cookies: cookieMerged,
      headers: hdrs,
      responseCharset,
      timeoutMs: 90_000,
    });
  } else {
    if (cookieMerged) hdrs.Cookie = cookieMerged;
    applyCfBrowserDocumentHeaders(hdrs);
    const res = await request(pageUrl, {
      method: 'POST',
      headers: hdrs,
      body,
      enableCookieJar: source.enabledCookieJar === true,
    });
    html = await decodeBookSourceResponseBytes(
      await res.arrayBuffer(),
      responseCharset,
    );
  }

  if (!html.trim()) {
    throw new Error('CF POST 拉取返回空正文');
  }
  if (isCloudflareBlockedResponse(200, html)) {
    throwCfChallengeError(pageUrl, 'POST');
  }
  return html;
}
