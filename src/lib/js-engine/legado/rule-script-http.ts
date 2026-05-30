/**
 * 规则脚本内 java.ajax 同步请求（对齐 Legado JsExtensions.ajax → AnalyzeUrl.setCookie）
 */

import { get, post } from '@/lib/http';
import { extractApiContent, summarizeApiContentResponse } from '@/lib/book-source/extract-api-content';
import {
  buildLegadoRuleScriptCookieHeader,
  resolveBookSourceServerUrl,
  resolveLegadoDeviceId,
  resolveSourceCookiesForHttp,
} from '@/lib/book-source/source-http';
import {
  extractQttokenKey,
  mergeAjaxCookieHeaders,
  mergeLegadoCookieHeaderStrings,
  normalizeContentApiPostBody,
  normalizeLegadoCookieHeader,
} from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { parseHeaders } from '@/lib/book-source/utils';
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
  const baseHeaders = options.source ? parseHeaders(options.source.header) : {};
  const scriptHeaders = { ...(options.headers ?? {}) };
  const stored = options.source
    ? resolveSourceCookiesForHttp(options.source, url).trim()
    : '';

  // Legado AnalyzeUrl.setCookie：CookieStore 先合并，urlOption（脚本 headers）同名键覆盖
  let headers = mergeAjaxCookieHeaders({ ...baseHeaders, ...scriptHeaders }, stored);
  const deviceId = resolveLegadoDeviceId(headers.Cookie ?? stored);
  if (headers.Cookie) {
    headers.Cookie = normalizeLegadoCookieHeader(headers.Cookie, deviceId);
  }
  delete headers.cookie;

  applyJsonContentType(headers, options.body ?? '', options.method);

  // 脚本 headers.cookie 为空 qttoken 时，回落书源 Cookie 表 / args.qttoken（对齐 Legado CookieStore）
  if (options.source) {
    const server = resolveBookSourceServerUrl(options.source);
    if (server && !extractQttokenKey(headers.Cookie ?? '')) {
      const fallback = buildLegadoRuleScriptCookieHeader(options.source, server);
      if (fallback) {
        headers.Cookie = normalizeLegadoCookieHeader(
          mergeLegadoCookieHeaderStrings(headers.Cookie ?? '', fallback),
          resolveLegadoDeviceId(mergeLegadoCookieHeaderStrings(headers.Cookie ?? '', fallback)),
        );
      }
    }
  }

  return headers;
}

/**
 * 规则脚本 ajax（经 @/lib/http 代理，支持 Cookie / User-Agent）
 */
export async function requestLegadoRuleScriptHttpAsync(
  url: string,
  options: RuleScriptHttpOptions,
): Promise<string> {
  const body =
    normalizeContentApiPostBody(url, options.method, options.body) ??
    options.body ??
    '';
  const headers = buildRuleScriptRequestHeaders(url, { ...options, body });
  const reqOpts = {
    headers,
    timeout: 60_000,
    enableCookieJar: options.source?.enabledCookieJar,
    concurrentRate: options.source?.concurrentRate,
  };
  if (options.method === 'POST') {
    return post(url, body, reqOpts).then((text) => {
      if (/\/content\b/.test(url) && options.source) {
        const trimmed = String(text ?? '').trim();
        if (trimmed.startsWith('{')) {
          try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            const content = extractApiContent(parsed);
            if (!content.trim()) {
              const post =
                body && body.trim().startsWith('{')
                  ? (JSON.parse(body) as Record<string, unknown>)
                  : {};
              console.warn('[rule-script] /content 无正文', {
                postSource: post.source,
                postTab: post.tab,
                postToneId: post.tone_id,
                item_id_post_len:
                  typeof post.item_id === 'string' ? post.item_id.length : 0,
                response: summarizeApiContentResponse(parsed),
                bodyPreview: trimmed.slice(0, 400),
              });
            }
          } catch {
            /* ignore */
          }
        }
      }
      return text;
    });
  }
  return get(url, reqOpts);
}
