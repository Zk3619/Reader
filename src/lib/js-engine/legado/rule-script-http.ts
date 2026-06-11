/**
 * 规则脚本内 java.ajax 同步请求（对齐 Legado JsExtensions.ajax → AnalyzeUrl.setCookie）
 */

import { get, post } from '@/lib/http';
import { getBookSourcePage, postBookSourcePage } from '@/lib/book-source/source-http-cf';
import {
  extractApiErrorMessage,
  materializeAggregationContentBody,
  summarizeApiContentResponse,
} from '@/lib/book-source/extract-api-content';
import {
  summarizeContentPostBody,
} from '@/lib/book-source/content-post-debug';
import { scanImgTags } from '@/lib/media/text/scan-img-tags';
import {
  buildLegadoContentApiRequestHeaders,
  buildLegadoRuleScriptCookieHeader,
  resolveBookSourceServerUrl,
  resolveLegadoDeviceId,
  resolveSourceCookiesForHttp,
} from '@/lib/book-source/source-http';
import {
  extractQttokenKey,
  mergeAjaxCookieHeaders,
  mergeLegadoCookieHeaderStrings,
  normalizeLegadoCookieHeader,
} from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { parseHeaders } from '@/lib/book-source/utils';
import type { BookSource } from '@/types';
import {
  isAcwScChallengeHtml,
  mergeAcwCookieIntoHeaders,
  solveAndPersistAcwScCookie,
} from '@/lib/http/acw-sc-challenge';

export type RuleScriptHttpOptions = {
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  source?: BookSource;
  /** 规则 baseUrl，供蓝奏云等 POST 补 Referer */
  referer?: string;
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
  const deviceId = resolveLegadoDeviceId(
    headers.Cookie ?? stored,
    options.source,
  );
  if (headers.Cookie) {
    headers.Cookie = normalizeLegadoCookieHeader(headers.Cookie, deviceId);
  }
  delete headers.cookie;

  applyJsonContentType(headers, options.body ?? '', options.method);

  if (
    options.method === 'POST' &&
    options.body?.trim() &&
    !options.body.trim().startsWith('{') &&
    !options.body.trim().startsWith('[') &&
    !headers['Content-Type'] &&
    !headers['content-type']
  ) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const referer = options.referer?.trim();
  if (referer?.startsWith('http') && !headers.Referer && !headers.referer) {
    headers.Referer = referer;
  }

  if (/\/filemoreajax\.php/i.test(url) && options.method === 'POST') {
    headers['X-Requested-With'] ??= 'XMLHttpRequest';
    headers.Accept ??= 'application/json, text/javascript, */*; q=0.01';
  }

  // 脚本 headers.cookie 为空 qttoken 时，回落书源 Cookie 表 / args.qttoken（对齐 Legado CookieStore）
  if (options.source) {
    const server = resolveBookSourceServerUrl(options.source);
    if (server && !extractQttokenKey(headers.Cookie ?? '')) {
      const fallback = buildLegadoRuleScriptCookieHeader(options.source, server);
      if (fallback) {
        headers.Cookie = normalizeLegadoCookieHeader(
          mergeLegadoCookieHeaderStrings(headers.Cookie ?? '', fallback),
          resolveLegadoDeviceId(
            mergeLegadoCookieHeaderStrings(headers.Cookie ?? '', fallback),
            options.source,
          ),
        );
      }
    }
  }

  return headers;
}

async function maybeRetryRuleScriptHttpAfterAcw(
  url: string,
  options: RuleScriptHttpOptions,
  headers: Record<string, string>,
  body: string,
): Promise<string> {
  if (!options.source || !isAcwScChallengeHtml(body)) return body;
  const cookiePart = await solveAndPersistAcwScCookie(options.source, url, body);
  if (!cookiePart) return body;
  const retryHeaders = mergeAcwCookieIntoHeaders(headers, cookiePart);
  const reqOpts = {
    headers: retryHeaders,
    timeout: 60_000,
    enableCookieJar: options.source.enabledCookieJar,
    concurrentRate: options.source.concurrentRate,
  };
  try {
    const retryBody =
      options.method === 'POST'
        ? await postBookSourcePage(options.source, url, options.body ?? '', reqOpts)
        : await getBookSourcePage(options.source, url, reqOpts);
    return !isAcwScChallengeHtml(retryBody) ? retryBody : body;
  } catch {
    return body;
  }
}

/**
 * 规则脚本 ajax（经 @/lib/http 代理，支持 Cookie / User-Agent）
 */
export async function requestLegadoRuleScriptHttpAsync(
  url: string,
  options: RuleScriptHttpOptions,
): Promise<string> {
  // 书源脚本已 JSON.stringify(params)：与 Legado AnalyzeUrl 一致，原样发送 POST body
  const body = options.body ?? '';
  const isContentPost =
    options.method === 'POST' && /\/content\b/.test(url);
  const headers = isContentPost
    ? buildLegadoContentApiRequestHeaders(
      options.source,
      url,
      options.headers,
    )
    : buildRuleScriptRequestHeaders(url, { ...options, body });
  const reqOpts = {
    headers,
    timeout: 60_000,
    enableCookieJar: options.source?.enabledCookieJar,
    concurrentRate: options.source?.concurrentRate,
    legadoMinimalHeaders: isContentPost,
  };
  const logContentPostResponse = (text: string) => {
    if (!/\/content\b/.test(url) || !options.source) return;
    const trimmed = String(text ?? '').trim();
    if (!trimmed.startsWith('{')) return;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const rawContentField =
        typeof parsed.content === 'string' ? parsed.content : '';
      const materialized = rawContentField.includes('<')
        ? rawContentField
        : materializeAggregationContentBody(rawContentField);
      const contentImgCount = materialized.includes('<')
        ? scanImgTags(materialized).length
        : 0;
      if (rawContentField.trim()) {
        const cookieHdr = String(headers.cookie ?? headers.Cookie ?? '');
        const deviceId = resolveLegadoDeviceId(cookieHdr, options.source);
        const logPayload = {
          ...summarizeApiContentResponse(parsed),
          contentImgCount,
          contentIsHex: rawContentField !== materialized,
          post: summarizeContentPostBody(body),
          contentsLen: Array.isArray(parsed.contents) ? parsed.contents.length : undefined,
          deviceIdHint:
            deviceId.length >= 8
              ? `${deviceId.slice(0, 4)}…${deviceId.slice(-4)}`
              : deviceId || undefined,
        };
        if (import.meta.env.DEV) {
          console.log('[rule-script] /content 响应', logPayload);
        } else if (contentImgCount > 0 && contentImgCount <= 12) {
          console.warn('[rule-script] /content 响应（图片偏少）', logPayload);
        }
      }
      if (!rawContentField.trim()) {
        const postPayload =
          body && body.trim().startsWith('{')
            ? (JSON.parse(body) as Record<string, unknown>)
            : {};
        const cookieHdr = String(headers.cookie ?? headers.Cookie ?? '');
        const qttoken = extractQttokenKey(cookieHdr);
        const deviceId = (
          cookieHdr.match(/(?:^|;)\s*deviceId=([^;]+)/i)?.[1] ?? ''
        ).trim();
        const postItemId =
          typeof postPayload.item_id === 'string' ? postPayload.item_id : '';
        const tokenHint =
          qttoken.length >= 8
            ? `${qttoken.slice(0, 4)}…${qttoken.slice(-4)}`
            : '';
        const deviceHint =
          deviceId.length >= 8
            ? `${deviceId.slice(0, 4)}…${deviceId.slice(-4)}`
            : deviceId;
        console.warn('[rule-script] /content 无正文', {
          postSource: postPayload.source,
          postSources: postPayload.sources,
          postTab: postPayload.tab,
          postToneId: postPayload.tone_id,
          item_id_post_len: postItemId.length,
          item_id_starts_with_eyJ: postItemId.startsWith('eyJ'),
          hasQttoken: Boolean(qttoken),
          qttokenLen: qttoken.length,
          qttokenHint: tokenHint || undefined,
          deviceIdLen: deviceId.length,
          deviceIdHint: deviceHint || undefined,
          response: summarizeApiContentResponse(parsed),
          apiErr: extractApiErrorMessage(parsed),
          bodyPreview: trimmed.slice(0, 400),
        });
      }
    } catch {
      /* ignore */
    }
  };

  if (options.method === 'POST') {
    const text = options.source
      ? await postBookSourcePage(options.source, url, body, reqOpts)
      : await post(url, body, reqOpts);
    logContentPostResponse(text);
    const retried = await maybeRetryRuleScriptHttpAfterAcw(url, options, headers, text);
    if (/\/filemoreajax\.php/i.test(url) && import.meta.env.DEV) {
      const preview = retried.trim().slice(0, 120);
      if (!preview.startsWith('{')) {
        console.warn('[rule-script] filemoreajax 非 JSON 响应', { url: url.slice(0, 160), preview });
      }
    }
    return retried;
  }
  const text = options.source
    ? await getBookSourcePage(options.source, url, reqOpts)
    : await get(url, reqOpts);
  return maybeRetryRuleScriptHttpAfterAcw(url, options, headers, text);
}
