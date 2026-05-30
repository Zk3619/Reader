/**
 * 规则脚本内 java.ajax 同步请求（对齐 Legado JsExtensions.ajax → runBlocking）
 */

import { get, post } from '@/lib/http';
import {
  buildSourceRequestHeaders,
  getOrCreateAndroidId,
  resolveSourceCookiesForHttp,
} from '@/lib/book-source/source-http';
import { mergeAjaxCookieHeaders, normalizeLegadoCookieHeader } from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import type { BookSource } from '@/types';

export type RuleScriptHttpOptions = {
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  source?: BookSource;
};

function applyJsonContentType(headers: Record<string, string>, body: string, method: string): void {
  const trimmed = body.trim();
  if (
    method === 'POST' &&
    ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']')))
  ) {
    headers['Content-Type'] ??= 'application/json';
  }
}

function buildRuleScriptRequestHeaders(
  url: string,
  options: RuleScriptHttpOptions,
): Record<string, string> {
  let headers = { ...(options.headers ?? {}) };
  if (options.source) {
    const fromSource = buildSourceRequestHeaders(options.source, url);
    const stored = resolveSourceCookiesForHttp(options.source, url).trim();
    // 规则 ajax 的 cookie 须覆盖库 Cookie（对齐 Legado urlOption > CookieStore）
    headers = mergeAjaxCookieHeaders({ ...fromSource, ...headers }, stored);
    if (headers.Cookie) {
      headers.Cookie = normalizeLegadoCookieHeader(headers.Cookie, getOrCreateAndroidId());
    }
    delete headers.cookie;
  }
  applyJsonContentType(headers, options.body ?? '', options.method);
  return headers;
}

/**
 * 规则脚本 ajax（经 @/lib/http 代理，支持 Cookie / User-Agent）
 */
export async function requestLegadoRuleScriptHttpAsync(
  url: string,
  options: RuleScriptHttpOptions,
): Promise<string> {
  const headers = buildRuleScriptRequestHeaders(url, options);
  const body = options.body ?? '';
  const reqOpts = {
    headers,
    timeout: 60_000,
    enableCookieJar: options.source?.enabledCookieJar,
    concurrentRate: options.source?.concurrentRate,
  };
  if (options.method === 'POST') {
    return post(url, body, reqOpts);
  }
  return get(url, reqOpts);
}
