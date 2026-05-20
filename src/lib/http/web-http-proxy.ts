/**
 * 纯 Web 下浏览器禁止在 fetch 中设置 Cookie 等 forbidden 头。
 * 通过同源 /__reader_http 代理（Vite dev/preview 中间件）转发真实 Cookie。
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

function resolveProxyEndpoint(): string {
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

export function headersNeedWebHttpProxy(headers: Record<string, string>): boolean {
  if (!isWebHttpProxyNeeded()) return false;
  return Object.keys(headers).some((k) => {
    const lower = k.toLowerCase();
    return lower === 'cookie' || lower === WEB_PROXY_COOKIE_HEADER.toLowerCase();
  });
}

export type WebHttpProxyRequest = {
  url: string;
  init: RequestInit;
};

/**
 * 将带 Cookie 的请求改写为走同源代理；无 Cookie 时返回 null，仍直连 fetch。
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
  if (!headersNeedWebHttpProxy(options.headers ?? {})) {
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

  const proxyPath = resolveProxyEndpoint();
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
