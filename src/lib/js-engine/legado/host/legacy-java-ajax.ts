/**
 * Function/with 降级路径的 java.ajax（对齐 build-ajax-vm + rule-script-runner）
 */

import {
  readLegadoAjaxCache,
  writeLegadoAjaxCache,
} from '@/lib/js-engine/legado/host/ajax-coordinator';
import { parseAjaxArgs } from '@/lib/js-engine/legado/host/parse-ajax';
import type { AjaxRequestFn } from '@/lib/js-engine/legado/host/build-ajax-vm';
import {
  applyLegadoAggregationApiHeaders,
  isUserApiPost,
  mergeAjaxCookieHeaders,
  mergeLegadoCookieHeaderStrings,
  normalizeContentApiPostBody,
  normalizeLegadoAjaxResponseBody,
  normalizeLegadoCookieHeader,
  normalizeUserApiPostBody,
  resolveUserApiCookieHeader,
} from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { LEGADO_AJAX_PENDING_JSON } from '@/lib/js-engine/legado/source-script-shared';

export type LegacyJavaAjaxOptions = {
  baseUrl: string;
  resolveUrl: (base: string, rel: string) => string;
  getCookie: (url: string) => string;
  request: AjaxRequestFn;
  applyDuration?: (ms: number) => void;
  getArgToken?: () => string;
  getDeviceId?: () => string;
  cache: Map<string, string>;
  durationCache: Map<string, number>;
  pending: Promise<unknown>[];
  onFailed?: (resolvedUrl: string, err: unknown) => void;
  onResolved?: (resolvedUrl: string, body: string, fromCache: boolean) => void;
};

export function createLegacyJavaAjax(options: LegacyJavaAjaxOptions) {
  const {
    baseUrl,
    resolveUrl,
    getCookie,
    request,
    applyDuration,
    getArgToken,
    getDeviceId,
    cache,
    durationCache,
    pending,
    onFailed,
    onResolved,
  } = options;

  return function legacyJavaAjax(
    url: string | Record<string, unknown>,
    optionsOrCb?: Record<string, unknown> | ((body: string) => void),
    cb?: (body: string) => void,
  ): string {
    const parsed = parseAjaxArgs(url, optionsOrCb, cb);
    if (!parsed) {
      if (typeof optionsOrCb === 'function') optionsOrCb('');
      else if (typeof cb === 'function') cb('');
      return '';
    }

    const { urlStr, method, body, headers, callback } = parsed;
    const resolvedUrl = resolveUrl(baseUrl, urlStr);

    const runCallback = (text: string) => {
      if (!callback) return;
      try {
        callback(text);
      } catch {
        /* ignore */
      }
    };

    const cached = readLegadoAjaxCache(cache, resolvedUrl);
    if (cached !== undefined) {
      const body = normalizeLegadoAjaxResponseBody(cached);
      const d = durationCache.get(resolvedUrl);
      if (d != null && d >= 0) applyDuration?.(d);
      runCallback(body);
      onResolved?.(resolvedUrl, body, true);
      return body;
    }

    let scriptCookie = getCookie(resolvedUrl) || (baseUrl ? getCookie(baseUrl) : '');
    if (!scriptCookie && resolvedUrl.startsWith('http')) {
      try {
        scriptCookie = getCookie(new URL(resolvedUrl).origin);
      } catch {
        /* ignore */
      }
    }
    const headerCookie = String(headers.Cookie ?? headers.cookie ?? '').trim();
    const mergedCookie =
      scriptCookie && headerCookie
        ? mergeLegadoCookieHeaderStrings(scriptCookie, headerCookie)
        : scriptCookie || headerCookie;
    const hdrs = mergeAjaxCookieHeaders(headers, mergedCookie);
    if (hdrs.Cookie?.trim()) {
      hdrs.Cookie = normalizeLegadoCookieHeader(hdrs.Cookie, getDeviceId?.());
    } else if (getArgToken?.()) {
      const tok = getArgToken()!.trim();
      if (tok) {
        hdrs.Cookie = normalizeLegadoCookieHeader(`qttoken=${tok};`, getDeviceId?.());
      }
    }

    let reqBody = body;
    reqBody = normalizeUserApiPostBody(resolvedUrl, method, reqBody, {
      cookieStr: mergedCookie || hdrs.Cookie,
      argToken: getArgToken?.(),
    });
    reqBody = normalizeContentApiPostBody(resolvedUrl, method, reqBody) ?? reqBody;
    if (isUserApiPost(resolvedUrl, method)) {
      const cookie = resolveUserApiCookieHeader(hdrs.Cookie ?? mergedCookie, {
        argToken: getArgToken?.(),
        deviceId: getDeviceId?.(),
      });
      if (cookie) hdrs.Cookie = cookie;
      reqBody = undefined;
      delete hdrs['Content-Type'];
    }

    const reqHeaders = applyLegadoAggregationApiHeaders(resolvedUrl, hdrs);

    const requestStart = Date.now();
    const p = request(resolvedUrl, { method, body: reqBody, headers: reqHeaders })
      .then((text) => {
        const durationMs = Date.now() - requestStart;
        if (durationMs >= 0) durationCache.set(resolvedUrl, durationMs);
        const body = normalizeLegadoAjaxResponseBody(text);
        writeLegadoAjaxCache(cache, resolvedUrl, body);
        runCallback(body);
        onResolved?.(resolvedUrl, body, false);
      })
      .catch((err) => {
        onFailed?.(resolvedUrl, err);
        const durationMs = Date.now() - requestStart;
        if (durationMs >= 0) durationCache.set(resolvedUrl, durationMs);
        runCallback('');
      });
    pending.push(p);
    return LEGADO_AJAX_PENDING_JSON;
  };
}
