/**
 * CF 站点：cf_clearance 绑定 WebView TLS 指纹，Tauri plugin-http 直连会 403。
 * 桌面端用后台 WebView 拉 HTML；移动端回退带 Client Hints 的 HTTP。
 */

import type { BookSource } from '@/types';
import { request, HttpError } from '@/lib/http';
import { isCloudflareBlockedResponse } from '@/lib/http/cloudflare-verification';
import { mergeLegadoCookieHeaderStrings } from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { getCfActiveRequestOrigin } from '@/lib/book-source/source-http';
import { syncSourceCookiePool } from '@/lib/book-source/source-cookie-pool';
import { applyCfBrowserDocumentHeaders } from '@/lib/book-source/cf-browser-headers';
import { decodeBookSourceResponseBytes } from '@/lib/book-source/response-charset';
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

  if (isTauri() && !isMobile()) {
    const { runBackstageFetchHtml } = await import('@/lib/rule-engine/webjs-tauri');
    const cookiesOnly = cookieMerged;
    const headersForWebview = { ...hdrs };
    delete headersForWebview.Cookie;
    delete headersForWebview.cookie;
    html = await runBackstageFetchHtml({
      url: pageUrl,
      cookies: cookiesOnly,
      headers: headersForWebview,
      delayMs: 2200,
      timeoutMs: 90_000,
    });
  } else {
    html = await fetchPageHtmlViaCfHttp(
      pageUrl,
      hdrs,
      source.enabledCookieJar === true,
    );
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
