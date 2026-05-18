/**
 * 将 java.ajax 绑定到 QuickJS java 对象
 */

import type { QuickJSContext, QuickJSHandle } from 'quickjs-emscripten';
import { LEGADO_SUSPEND_MARKER } from '../../core/runtime';
import type { LegadoRunRuntime } from '../quickjs-runner';
import { bindVmFunction } from './bind-vm';
import { parseAjaxArgs } from './parse-ajax';
import { SuspendScript } from '../suspend-script';

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
      return vm.newString(cached);
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
    const hdrs = { ...headers };
    if (scriptCookie) hdrs.Cookie = scriptCookie;

    let reqBody = body;
    const isUserApi = /\/user_api\b/.test(resolvedUrl);
    if (isUserApi && method === 'POST' && reqBody == null) {
      const m = String(scriptCookie || '').match(/qttoken=([^;]+)/);
      const token = m ? m[1] : '';
      if (token) {
        reqBody = JSON.stringify({ key: token });
        hdrs['Content-Type'] = 'application/json';
      }
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
    const err = vm.newString(LEGADO_SUSPEND_MARKER);
    vm.throw(err);
    return err;
  });
}
