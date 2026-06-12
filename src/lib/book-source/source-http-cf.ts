/**
 * 书源 HTTP 拉取 + Cloudflare 挑战处理（对齐探索/搜索页：检测挑战页 → 内嵌验证 → 重试）。
 */

import type { BookSource } from '@/types';
import { get, post, request, HttpError } from '@/lib/http';
import {
  isCloudflareBlockedResponse,
  resolveCloudflareViaInnerWeb,
  shouldOfferCloudflareVerification,
} from '@/lib/http/cloudflare-verification';
import {
  fetchPageHtmlViaCfWebView,
  fetchPostHtmlViaCfWebView,
  shouldUseCfWebViewFetch,
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
  allowNon2xx?: boolean;
  legadoMinimalHeaders?: boolean;
  responseCharset?: string;
  /** 跳过 CF 检测与内嵌验证（极少场景） */
  skipCf?: boolean;
  /** 内嵌 CF 验证页标题 */
  cfTitle?: string;
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
    allowNon2xx: opts?.allowNon2xx,
    legadoMinimalHeaders: opts?.legadoMinimalHeaders,
  };
}

async function withCfRetry(
  source: BookSource,
  getUrl: () => string,
  setUrl: (next: string) => void,
  fetchOnce: () => Promise<string>,
  opts?: { cfTitle?: string },
): Promise<string> {
  const openCfAndRetry = async (cfError?: unknown): Promise<string> => {
    const blockedUrl = cfError instanceof HttpError ? cfError.url : undefined;
    const verified = await resolveCloudflareViaInnerWeb({
      url: getUrl(),
      blockedUrl,
      source,
      title: opts?.cfTitle,
    });
    if (!verified) {
      throw new HttpError(403, 'Forbidden', getUrl(), 'Cloudflare 验证未完成');
    }
    setUrl(alignUrlToBookSourceRequestOrigin(getUrl(), source));
    return fetchOnce();
  };

  try {
    let html = await fetchOnce();
    if (isCloudflareBlockedResponse(200, html)) {
      html = await openCfAndRetry(undefined);
    }
    return html;
  } catch (e) {
    if (!shouldOfferCloudflareVerification(e)) throw e;
    if (source.enabledCookieJar) {
      try {
        let html = await fetchOnce();
        if (isCloudflareBlockedResponse(200, html)) {
          html = await openCfAndRetry(undefined);
        }
        return html;
      } catch (retryErr) {
        if (!shouldOfferCloudflareVerification(retryErr)) throw retryErr;
        return openCfAndRetry(retryErr);
      }
    }
    return openCfAndRetry(e);
  }
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

  const fetchOnce = async (): Promise<string> => {
    const headers = mergeBookSourceHeaders(source, requestUrl, opts?.headers);
    const cookieForCf = (headers.Cookie ?? '').trim();
    if (shouldUseCfWebViewFetch(source, cookieForCf)) {
      return fetchPageHtmlViaCfWebView(source, requestUrl, cookieForCf, headers);
    }
    return get(requestUrl, toHttpOpts(source, headers, opts));
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

/** @deprecated 已内置于 get/postBookSourcePage，保留别名避免外部引用断裂 */
export async function fetchBookSourcePageWithServerFailover(
  source: BookSource,
  url: string,
  options: {
    method?: 'GET' | 'POST';
    body?: string;
    logTag?: string;
  } & BookSourceHttpOpts = {},
): Promise<string> {
  const method = options.method ?? 'GET';
  const body = options.body ?? '';
  const { logTag: _logTag, method: _m, body: _b, ...httpOpts } = options;
  if (method === 'POST') {
    return postBookSourcePage(source, url, body, httpOpts);
  }
  return getBookSourcePage(source, url, httpOpts);
}
