/**
 * 将 java.ajax 绑定到 QuickJS java 对象
 */

import type { QuickJSContext, QuickJSHandle } from 'quickjs-emscripten';
import { LEGADO_SUSPEND_MARKER } from '@/lib/js-engine/core/runtime';
import type { LegadoRunRuntime } from '@/lib/js-engine/legado/quickjs-runner';
import { bindVmFunction } from '@/lib/js-engine/legado/host/bind-vm';
import {
  isUserApiPost,
  mergeAjaxCookieHeaders,
  mergeLegadoCookieHeaderStrings,
  normalizeContentApiPostBody,
  normalizeLegadoCookieHeader,
  normalizeUserApiPostBody,
  resolveUserApiCookieHeader,
} from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { parseAjaxArgs } from '@/lib/js-engine/legado/host/parse-ajax';
import { SuspendScript } from '@/lib/js-engine/legado/suspend-script';

export type AjaxRequestFn = (resolvedUrl: string, call: {
  method: 'GET' | 'POST';
  body?: string;
  headers: Record<string, string>;
}) => Promise<string>;

export function bindJavaAjax(
  vm: QuickJSContext,
  javaObj: QuickJSHandle,
  rt: LegadoRunRuntime,
  options: {
    baseUrl: string;
    resolveUrl: (base: string, rel: string) => string;
    getCookie: (url: string) => string;
    request: AjaxRequestFn;
    applyDuration: (ms: number) => void;
    /** two-pass 首轮：不挂起，返回空并 push promise */
    twoPassDefer?: boolean;
    /** 修正 login_api 等 POST body（空体、双重 JSON 编码） */
    normalizePostBody?: (
      resolvedUrl: string,
      method: 'GET' | 'POST',
      body: string | undefined
    ) => string | undefined;
    /** 书源 args 中的 qttoken（晴天 checkStatus 等） */
    getArgToken?: () => string;
    /** 表单「密钥」字段 */
    getFormKey?: () => string;
    getDeviceId?: () => string;
  }
): void {
  const { coordinator } = rt;

  bindVmFunction(vm, javaObj, 'ajax', (...args) => {
    const urlArg = args[0] ? vm.dump(args[0]) : '';
    let optionsOrCb: Record<string, unknown> | ((body: string) => void) | undefined;
    let cb: ((body: string) => void) | undefined;

    if (args[1]) {
      const d = vm.dump(args[1]);
      if (typeof d === 'function') {
        optionsOrCb = d as (body: string) => void;
      } else if (d && typeof d === 'object') {
        optionsOrCb = d as Record<string, unknown>;
        if (args[2]) {
          const d2 = vm.dump(args[2]);
          if (typeof d2 === 'function') cb = d2 as (body: string) => void;
        }
      }
    }

    const parsed = parseAjaxArgs(
      urlArg as string | Record<string, unknown>,
      optionsOrCb,
      cb
    );
    if (!parsed) {
      return vm.newString('');
    }

    const { urlStr, method, body, headers, callback } = parsed;
    const resolvedUrl = options.resolveUrl(options.baseUrl, urlStr);

    const cached = coordinator.getCachedResponse(resolvedUrl, options.applyDuration);
    if (cached !== undefined) {
      if (callback) {
        try {
          callback(cached);
        } catch {
          /* ignore */
        }
      }
      return vm.newString(cached ?? '');
    }

    let scriptCookie =
      options.getCookie(resolvedUrl) || (options.baseUrl ? options.getCookie(options.baseUrl) : '');
    if (!scriptCookie && resolvedUrl.startsWith('http')) {
      try {
        scriptCookie = options.getCookie(new URL(resolvedUrl).origin);
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
      const deviceId = options.getDeviceId?.();
      hdrs.Cookie = normalizeLegadoCookieHeader(hdrs.Cookie, deviceId);
    }

    let reqBody = body;
    if (options.normalizePostBody) {
      reqBody = options.normalizePostBody(resolvedUrl, method, reqBody);
    }
    reqBody = normalizeUserApiPostBody(resolvedUrl, method, reqBody, {
      cookieStr: mergedCookie || hdrs.Cookie,
      formKey: options.getFormKey?.(),
      argToken: options.getArgToken?.(),
    });
    reqBody = normalizeContentApiPostBody(resolvedUrl, method, reqBody) ?? reqBody;
    if (isUserApiPost(resolvedUrl, method)) {
      const cookie = resolveUserApiCookieHeader(hdrs.Cookie ?? mergedCookie, {
        argToken: options.getArgToken?.(),
        formKey: options.getFormKey?.(),
        deviceId: options.getDeviceId?.(),
      });
      if (cookie) hdrs.Cookie = cookie;
      reqBody = undefined;
      delete hdrs['Content-Type'];
    }

    const requestStart = Date.now();
    const p = options.request(resolvedUrl, { method, body: reqBody, headers: hdrs });

    if (options.twoPassDefer) {
      p.then((text) => {
        const durationMs = Date.now() - requestStart;
        coordinator.recordDuration(resolvedUrl, durationMs, options.applyDuration);
        coordinator.cache.set(resolvedUrl, text);
        if (callback) {
          try {
            callback(text);
          } catch {
            /* ignore */
          }
        }
      }).catch(() => {
        const durationMs = Date.now() - requestStart;
        coordinator.recordDuration(resolvedUrl, durationMs, options.applyDuration);
        coordinator.cache.set(resolvedUrl, '');
        if (callback) callback('');
      });
      rt.pending.push(p);
      return vm.newString('');
    }

    const writeIdx = coordinator.writeIndex;
    coordinator.writeIndex += 1;
    coordinator.pendingSuspend = new SuspendScript(p, writeIdx, resolvedUrl, requestStart);
    // 同步 QuickJS 下 vm.throw 不会中断宿主函数，eval 会得到 undefined；须抛 JS Error 供 evalScript 挂起
    throw new Error(LEGADO_SUSPEND_MARKER);
  });
}
