/**
 * 聚合书源（晴天等）HTTP 请求：解析用户所选 server，并注入登录 Cookie。
 * 与 explore.ts / login-script-runner 的 cookie 表一致。
 */

import type { BookSource } from '@/types';
import {
  getStoredSourceCookiesForUrl,
  getStoredSourceCookiesMerged,
  readSourceCookieStore,
} from '@/lib/js-engine/legado/login-script-runner';
import { normalizeLegadoCookieHeader } from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import {
  getSourceArgsKey,
} from '@/lib/js-engine/legado/source-script-shared';
import { extractServerFromJsLib, parseHeaders } from '@/lib/book-source/utils';

const ANDROID_ID_KEY = 'reader_login_android_id';

function getOrCreateAndroidId(): string {
  try {
    let id = localStorage.getItem(ANDROID_ID_KEY);
    if (!id) {
      id = 'web_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(ANDROID_ID_KEY, id);
    }
    return id;
  } catch {
    return 'web_' + Date.now();
  }
}

function hostnameOf(urlOrHost: string): string | undefined {
  const s = urlOrHost.trim();
  if (!s) return undefined;
  try {
    return new URL(s.includes('://') ? s : `https://${s}`).hostname;
  } catch {
    return s.replace(/^https?:\/\//i, '').split('/')[0] || undefined;
  }
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

/** 与 Legado login：getArgument('server') || host[0] */
export function resolveAggregationServerUrl(source: BookSource): string | null {
  try {
    const raw = localStorage.getItem(getSourceArgsKey(source));
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const server = obj.server;
      if (typeof server === 'string' && isHttpUrl(server)) {
        return server.trim().replace(/\/+$/, '');
      }
    }
  } catch {
    /* ignore */
  }

  const fromJsLib = extractServerFromJsLib(source as unknown as Record<string, unknown>);
  if (fromJsLib) return fromJsLib.replace(/\/+$/, '');

  return null;
}

function mergeCookieHeader(stored: string, headerCookie?: string): string {
  const a = (stored ?? '').trim();
  const b = (headerCookie ?? '').trim();
  if (!a) return b;
  if (!b) return a;
  return `${a}; ${b}`;
}

/**
 * 聚合 / 登录书源 Cookie：与 Legado cookie 表键（origin、server、裸 host）对齐。
 * getStoredSourceCookiesForUrl 单独有时匹配不到（如 cookie 键为 server 而请求为 /content）。
 */
export function resolveSourceCookiesForHttp(
  source: BookSource,
  requestUrl: string,
): string {
  const direct = getStoredSourceCookiesForUrl(source, requestUrl).trim();
  if (direct) return direct;

  const server = resolveAggregationServerUrl(source);
  if (server) {
    const fromServer = getStoredSourceCookiesForUrl(source, server).trim();
    if (fromServer) return fromServer;
  }

  const reqHost = hostnameOf(requestUrl);
  if (reqHost) {
    const deviceId = getOrCreateAndroidId();
    for (const [key, value] of readSourceCookieStore(source).entries()) {
      if (!value?.trim()) continue;
      const keyHost = hostnameOf(key);
      if (keyHost && keyHost === reqHost) {
        return normalizeLegadoCookieHeader(value, deviceId);
      }
    }
  }

  return getStoredSourceCookiesMerged(source);
}

/** 书源 header + 已登录 Cookie（供 catalog/content/detail 等直连 API） */
export function buildSourceRequestHeaders(
  source: BookSource,
  requestUrl: string,
): Record<string, string> {
  const headers = parseHeaders(source.header);
  const stored = resolveSourceCookiesForHttp(source, requestUrl);
  const cookieHeader = mergeCookieHeader(stored, headers.Cookie ?? headers.cookie);
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
    delete headers.cookie;
  } else if (resolveAggregationServerUrl(source)) {
    console.warn(
      '[source-http] 聚合 API 未找到登录 Cookie，正文可能按游客限额返回。请在该书源重新登录。',
      { url: requestUrl.slice(0, 96) },
    );
  }
  return headers;
}
