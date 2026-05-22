/**
 * 纯 Web 下跨域书源请求走同源 /__reader_http（Vite dev/preview 中间件），
 * 避免 CORS；含 Cookie 时一并解决浏览器 forbidden 头限制。
 */

import { isTauri } from '@/lib/platform/detect';

const PROXY_SEGMENT = '__reader_http';

/** 请求头中携带 Cookie 的键（代理会转为上游 Cookie 头） */
export const WEB_PROXY_COOKIE_HEADER = 'X-Reader-Cookie';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/** 同源 HTTP 代理路径（如 /__reader_http），供图片等资源改写 URL */
export function resolveWebHttpProxyPath(): string {
  const external = import.meta.env.VITE_WEB_HTTP_PROXY as string | undefined;
  if (external?.trim()) {
    const base = external.trim().replace(/\/$/, '');
    return base.includes('?') ? base.split('?')[0]! : base;
  }
  const baseUrl = import.meta.env.BASE_URL || '/';
  return new URL(PROXY_SEGMENT, new URL(baseUrl, window.location.href)).pathname;
}

export function isWebHttpProxyNeeded(): boolean {
  return !isTauri() && typeof window !== 'undefined';
}

export function isCrossOriginHttpUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (typeof window === 'undefined') return true;
  try {
    return new URL(url).origin !== window.location.origin;
  } catch {
    return false;
  }
}

/** 已是同源 __reader_http 代理地址（含历史错误规范化 host） */
export function isReaderHttpProxyUrl(url: string): boolean {
  if (!url.includes(PROXY_SEGMENT)) return false;
  try {
    const base =
      typeof window !== 'undefined' ? window.location.href : 'http://127.0.0.1/';
    const parsed = new URL(url, base);
    if (parsed.hostname === PROXY_SEGMENT) return true;
    return parsed.pathname.includes(PROXY_SEGMENT);
  } catch {
    return url.includes(PROXY_SEGMENT);
  }
}

export function headersNeedWebHttpProxy(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((k) => {
    const lower = k.toLowerCase();
    return lower === 'cookie' || lower === WEB_PROXY_COOKIE_HEADER.toLowerCase();
  });
}

/** 纯 Web：跨域书源请求或含 Cookie 头时须走同源 __reader_http（避免 CORS / forbidden 头） */
export function shouldUseWebHttpProxy(
  targetUrl: string,
  headers: Record<string, string> = {},
): boolean {
  if (!isWebHttpProxyNeeded()) return false;
  if (isReaderHttpProxyUrl(targetUrl)) return false;
  if (headersNeedWebHttpProxy(headers)) return true;
  return isCrossOriginHttpUrl(targetUrl);
}

export type WebHttpProxyRequest = {
  url: string;
  init: RequestInit;
};

/**
 * 将须代理的请求改写为走同源 __reader_http；同源且无 Cookie 时返回 null。
 */
export function toWebHttpProxyRequest(
  targetUrl: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | FormData | ArrayBuffer;
    redirect?: RequestRedirect;
    signal?: AbortSignal;
  }
): WebHttpProxyRequest | null {
  if (!shouldUseWebHttpProxy(targetUrl, options.headers ?? {})) {
    return null;
  }

  const headers = { ...(options.headers ?? {}) };
  let cookie = '';
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'cookie') {
      cookie = value;
      delete headers[key];
    }
  }

  const forwardHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    forwardHeaders[key] = value;
  }
  if (cookie) {
    forwardHeaders[WEB_PROXY_COOKIE_HEADER] = cookie;
  }

  const proxyPath = resolveWebHttpProxyPath();
  const proxyUrl = `${proxyPath}?target=${encodeURIComponent(targetUrl)}`;

  return {
    url: proxyUrl,
    init: {
      method: options.method ?? 'GET',
      headers: forwardHeaders,
      body: options.body as BodyInit | undefined,
      redirect: options.redirect,
      signal: options.signal,
      credentials: 'same-origin',
    },
  };
}
