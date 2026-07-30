/**
 * 书源 HTTP 拉取 + Cloudflare 挑战处理（对齐探索/搜索页：检测挑战页 → 内嵌验证 → 重试）。
 */

import type { BookSource } from '@/types';
import { get, post, request, HttpError } from '@/lib/http';
import { isCloudflareBlockedResponse } from '@/lib/http/cloudflare-verification';
import { withBookSourceChallengeRetry } from '@/lib/cookie-hub';
import {
  fetchPageHtmlViaCfWebView,
  fetchPostHtmlViaCfWebView,
  isCfFetchRetryableError,
  shouldUseCfWebViewFetch,
  type CfPanelWaitOptions,
} from '@/lib/book-source/cf-webview-fetch';
import {
  alignUrlToBookSourceRequestOrigin,
  buildSourceRequestHeaders,
  isRetryableGatewayHttpError,
  listAggregationServerCandidates,
  replaceHttpUrlOrigin,
  resolveSourceCookiesForHttp,
  shouldUseAggregationServerFailover,
} from '@/lib/book-source/source-http';
import { decodeBookSourceResponseBytes } from '@/lib/book-source/response-charset';

export interface BookSourceHttpOpts {
  headers?: Record<string, string>;
  enableCookieJar?: boolean;
  concurrentRate?: string;
  timeout?: number;
  signal?: AbortSignal;
  ignorePageNavigationAbort?: boolean;
  allowNon2xx?: boolean;
  legadoMinimalHeaders?: boolean;
  responseCharset?: string;
  /** 跳过 CF 检测与内嵌验证（极少场景） */
  skipCf?: boolean;
  /** 内嵌 CF 验证页标题 */
  cfTitle?: string;
  /** CF WebView 拉取时等待 DOM 选择器（RSS/SPA） */
  cfPanelWait?: CfPanelWaitOptions;
  /** CF WebView 内用 fetch 取正文（RSS/XML） */
  cfUseFetch?: boolean;
  /** 即使已有 cf_clearance 也先直连；仅实际遇到挑战后切到 WebView。 */
  preferDirectHttp?: boolean;
}

function mergeBookSourceHeaders(
  source: BookSource,
  url: string,
  extra?: Record<string, string>,
): Record<string, string> {
  const headers = { ...buildSourceRequestHeaders(source, url), ...extra };
  const storedCookie = resolveSourceCookiesForHttp(source, url).trim();
  if (storedCookie) {
    const existing = (headers.Cookie ?? headers.cookie ?? '').trim();
    headers.Cookie = existing ? `${storedCookie}; ${existing}` : storedCookie;
    delete headers.cookie;
  }
  return headers;
}

function toHttpOpts(
  source: BookSource,
  headers: Record<string, string>,
  opts?: BookSourceHttpOpts,
) {
  return {
    headers,
    enableCookieJar: opts?.enableCookieJar ?? source.enabledCookieJar,
    concurrentRate: opts?.concurrentRate ?? source.concurrentRate,
    timeout: opts?.timeout ?? 30_000,
    signal: opts?.signal,
    ignorePageNavigationAbort: opts?.ignorePageNavigationAbort,
    allowNon2xx: opts?.allowNon2xx,
    legadoMinimalHeaders: opts?.legadoMinimalHeaders,
  };
}

async function withCfRetry(
  source: BookSource,
  getUrl: () => string,
  setUrl: (next: string) => void,
  fetchOnce: () => Promise<string>,
  opts?: { cfTitle?: string; onVerified?: () => void },
): Promise<string> {
  return withBookSourceChallengeRetry(source, getUrl(), fetchOnce, {
    title: opts?.cfTitle,
    onVerified: () => {
      setUrl(alignUrlToBookSourceRequestOrigin(getUrl(), source));
      opts?.onVerified?.();
    },
    isBlockedResult: (html) => isCloudflareBlockedResponse(200, html),
  });
}

async function withAggregationServerFailover(
  source: BookSource,
  url: string,
  fetch: (tryUrl: string) => Promise<string>,
  logTag = 'book-source',
): Promise<string> {
  if (!shouldUseAggregationServerFailover(source, url)) {
    return fetch(url);
  }

  const servers = listAggregationServerCandidates(source, url);
  let lastError: unknown;
  for (let i = 0; i < servers.length; i++) {
    const server = servers[i]!;
    const tryUrl = i === 0 ? url : replaceHttpUrlOrigin(url, server);
    try {
      return await fetch(tryUrl);
    } catch (e) {
      lastError = e;
      if (isRetryableGatewayHttpError(e) && i < servers.length - 1) {
        if (import.meta.env.DEV) {
          console.warn(`[${logTag}] 网关错误，尝试下一条线路`, {
            status: (e as HttpError).status,
            server,
            path: tryUrl.replace(/^https?:\/\/[^/]+/, ''),
          });
        }
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

/** 书源 GET（含 CF 挑战；聚合书源 502/503/504 自动切换线路） */
export async function getBookSourcePage(
  source: BookSource,
  url: string,
  opts?: BookSourceHttpOpts,
): Promise<string> {
  return withAggregationServerFailover(source, url, (tryUrl) =>
    getBookSourcePageDirect(source, tryUrl, opts),
  );
}

async function getBookSourcePageDirect(
  source: BookSource,
  url: string,
  opts?: BookSourceHttpOpts,
): Promise<string> {
  if (opts?.skipCf) {
    const headers = mergeBookSourceHeaders(source, url, opts.headers);
    return get(url, toHttpOpts(source, headers, opts));
  }

  let requestUrl = alignUrlToBookSourceRequestOrigin(url, source);
  let useWebViewAfterChallenge = false;

  const fetchOnce = async (): Promise<string> => {
    const headers = mergeBookSourceHeaders(source, requestUrl, opts?.headers);
    const cookieForCf = (headers.Cookie ?? '').trim();
    try {
      if (
        shouldUseCfWebViewFetch(source, cookieForCf) &&
        (!opts?.preferDirectHttp || useWebViewAfterChallenge)
      ) {
        return await fetchPageHtmlViaCfWebView(
          source,
          requestUrl,
          cookieForCf,
          headers,
          { panelWait: opts?.cfPanelWait, useFetch: opts?.cfUseFetch },
        );
      }
      return await get(requestUrl, toHttpOpts(source, headers, opts));
    } catch (error) {
      // WebView 抓取空正文/超时：转成可触发 CF 重试的 HttpError
      if (isCfFetchRetryableError(error)) {
        throw new HttpError(
          403,
          'Forbidden',
          requestUrl,
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    }
  };

  return withCfRetry(
    source,
    () => requestUrl,
    (next) => {
      requestUrl = next;
    },
    fetchOnce,
    {
      cfTitle: opts?.cfTitle,
      onVerified: () => {
        useWebViewAfterChallenge = true;
      },
    },
  );
}

/** 书源 POST（含 CF 挑战；聚合书源 502/503/504 自动切换线路） */
export async function postBookSourcePage(
  source: BookSource,
  url: string,
  body: string,
  opts?: BookSourceHttpOpts,
): Promise<string> {
  return withAggregationServerFailover(source, url, (tryUrl) =>
    postBookSourcePageDirect(source, tryUrl, body, opts),
  );
}

async function postBookSourcePageDirect(
  source: BookSource,
  url: string,
  body: string,
  opts?: BookSourceHttpOpts,
): Promise<string> {
  if (opts?.skipCf) {
    const headers = mergeBookSourceHeaders(source, url, opts.headers);
    return post(url, body, toHttpOpts(source, headers, opts));
  }

  let requestUrl = alignUrlToBookSourceRequestOrigin(url, source);

  const fetchOnce = async (): Promise<string> => {
    const headers = mergeBookSourceHeaders(source, requestUrl, opts?.headers);
    const cookieForCf = (headers.Cookie ?? '').trim();
    if (shouldUseCfWebViewFetch(source, cookieForCf)) {
      return fetchPostHtmlViaCfWebView(
        source,
        requestUrl,
        body,
        headers,
        cookieForCf,
        opts?.responseCharset,
      );
    }
    const httpOpts = toHttpOpts(source, headers, opts);
    if (opts?.responseCharset) {
      const res = await request(requestUrl, {
        ...httpOpts,
        method: 'POST',
        body,
      });
      return decodeBookSourceResponseBytes(
        await res.arrayBuffer(),
        opts.responseCharset,
      );
    }
    return post(requestUrl, body, httpOpts);
  };

  return withCfRetry(
    source,
    () => requestUrl,
    (next) => {
      requestUrl = next;
    },
    fetchOnce,
    { cfTitle: opts?.cfTitle },
  );
}
