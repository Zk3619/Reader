/**
 * 登录脚本 QuickJS 宿主 API 注入
 */

import type { QuickJSContext } from 'quickjs-emscripten';
import { evalCodeVoid, LEGADO_SUSPEND_MARKER, setGlobalJson, setGlobalString } from '@/lib/js-engine/core/runtime';
import type { LegadoInjector, LegadoRunRuntime } from '@/lib/js-engine/legado/quickjs-runner';
import { bindGlobalVmObject, bindVmFunction, vmNewLegadoStrResponse } from '@/lib/js-engine/legado/host/bind-vm';
import { createLegadoStrResponse } from '@/lib/js-engine/legado/rule-script-browser';
import { bindJavaAjax, type AjaxRequestFn } from '@/lib/js-engine/legado/host/build-ajax-vm';
import { injectDateShimVm } from '@/lib/js-engine/legado/host/date-vm';
import { injectLegadoEncodingUtils } from '@/lib/js-engine/legado/host/encode-vm';
import { injectRhinoLegadoShims } from '@/lib/js-engine/legado/host/rhino-shim-vm';

export interface LoginInjectContext {
  baseUrl: string;
  /** 书源 sourceUrl / bookSourceUrl（Legado 全局变量 sourceUrl） */
  sourceUrl: string;
  formValues: Record<string, string>;
  host: string[];
  resolveUrl: (base: string, rel: string) => string;
  getArgument: (key: string) => string;
  setArgument: (key: string, value: string) => void;
  putLoginInfo: (json: string) => void;
  cookie: {
    getCookie: (url: string) => string;
    setCookie: (url: string, value: string) => void;
    removeCookie: (url: string) => void;
    getKey: (cookieStrOrUrl: string, keyName?: string) => string;
  };
  java: {
    toast: (msg?: string) => void;
    longToast: (msg?: string) => void;
    log: (...args: unknown[]) => unknown;
    getLastAjaxDuration: () => number | undefined;
    androidId: () => string;
    deviceID: () => string;
    timeFormat: (ms: number) => string;
    startBrowser: (url: string, title?: string) => void;
    openUrl: (url: string) => void;
    base64Encode: (s: string) => string;
    base64Decode: (s: string) => string;
    request: AjaxRequestFn;
  };
  source: {
    getVariable: (key?: string) => string;
    setVariable: (val?: string) => void;
    getLoginInfo: () => string;
    putLoginInfo: (json: string) => boolean;
    getKey: () => string;
  };
  startBrowserAwait: (
    url: string,
    title?: string,
  ) => ReturnType<typeof createLegadoStrResponse>;
  /** 登录 POST body 兜底（邮箱/密码来自表单） */
  normalizeAjaxBody?: (
    resolvedUrl: string,
    method: 'GET' | 'POST',
    body?: string
  ) => string | undefined;
  getArgToken?: () => string;
  getFormKey?: () => string;
  getDeviceId?: () => string;
}

export function createLoginInjector(ctx: LoginInjectContext): LegadoInjector {
  return (vm: QuickJSContext, rt: LegadoRunRuntime) => {
    const dateVm = injectDateShimVm(vm);
    rt.applyAjaxDuration = dateVm.applyAjaxDuration;
    injectLegadoEncodingUtils(vm);
    injectRhinoLegadoShims(vm);

    setGlobalJson(vm, 'result', ctx.formValues);
    setGlobalString(vm, 'baseUrl', ctx.baseUrl);
    setGlobalString(vm, 'sourceUrl', ctx.sourceUrl);
    setGlobalString(vm, 'bookSourceUrl', ctx.sourceUrl);
    setGlobalJson(vm, 'host', ctx.host);

    bindVmFunction(vm, vm.global, 'putLoginInfo', (h) => {
      ctx.putLoginInfo(String(vm.dump(h)));
    });

    bindVmFunction(vm, vm.global, 'getArgument', (h) => {
      return vm.newString(ctx.getArgument(String(vm.dump(h))));
    });

    bindVmFunction(vm, vm.global, 'setArgument', (k, v) => {
      ctx.setArgument(String(vm.dump(k)), String(vm.dump(v)));
    });

    bindGlobalVmObject(vm, 'source', (sourceObj) => {
      bindVmFunction(vm, sourceObj, 'getVariable', (k) => {
        const key = k ? String(vm.dump(k)) : undefined;
        return vm.newString(ctx.source.getVariable(key));
      });
      bindVmFunction(vm, sourceObj, 'setVariable', (v) => {
        ctx.source.setVariable(v ? String(vm.dump(v)) : undefined);
      });
      bindVmFunction(vm, sourceObj, 'getLoginInfo', () => vm.newString(ctx.source.getLoginInfo()));
      bindVmFunction(vm, sourceObj, 'putLoginInfo', (h) => {
        const ok = ctx.source.putLoginInfo(String(vm.dump(h)));
        return vm.newNumber(ok ? 1 : 0);
      });
      bindVmFunction(vm, sourceObj, 'getKey', () => vm.newString(ctx.source.getKey()));
    });

    bindGlobalVmObject(vm, 'cookie', (cookieObj) => {
      bindVmFunction(vm, cookieObj, 'getCookie', (u) =>
        vm.newString(ctx.cookie.getCookie(String(vm.dump(u))))
      );
      bindVmFunction(vm, cookieObj, 'setCookie', (u, v) => {
        ctx.cookie.setCookie(String(vm.dump(u)), String(vm.dump(v)));
      });
      bindVmFunction(vm, cookieObj, 'removeCookie', (u) => {
        ctx.cookie.removeCookie(String(vm.dump(u)));
      });
      bindVmFunction(vm, cookieObj, 'getKey', (a, b) => {
        const key = b != null && vm.dump(b) !== undefined ? String(vm.dump(b)) : undefined;
        return vm.newString(ctx.cookie.getKey(String(vm.dump(a)), key));
      });
    });

    bindGlobalVmObject(vm, 'java', (javaObj) => {
      bindVmFunction(vm, javaObj, 'toast', (m) => {
        ctx.java.toast(m ? String(vm.dump(m)) : undefined);
      });
      bindVmFunction(vm, javaObj, 'longToast', (m) => {
        ctx.java.longToast(m ? String(vm.dump(m)) : undefined);
      });
      bindVmFunction(vm, javaObj, 'log', (...args) => {
        const native = args.map((a) => vm.dump(a));
        const first = ctx.java.log(...native);
        return vm.newString(first == null ? '' : String(first));
      });
      bindVmFunction(vm, javaObj, 'getLastAjaxDuration', () => {
        const d = ctx.java.getLastAjaxDuration() ?? rt.coordinator.lastAjaxDurationMs;
        return vm.newNumber(d ?? 0);
      });
      bindVmFunction(vm, javaObj, 'androidId', () => vm.newString(ctx.java.androidId()));
      bindVmFunction(vm, javaObj, 'deviceID', () => vm.newString(ctx.java.deviceID()));
      /** 轻阅读检测：本端非轻阅读，保持无操作，避免落入「请先填写邮箱」分支 */
      bindVmFunction(vm, javaObj, 'qread', () => {});
      bindVmFunction(vm, javaObj, 'timeFormat', (t) => {
        const n = Number(vm.dump(t));
        return vm.newString(ctx.java.timeFormat(n));
      });
      bindVmFunction(vm, javaObj, 'startBrowser', (u, title) => {
        ctx.java.startBrowser(
          String(vm.dump(u)),
          title != null && vm.dump(title) !== undefined ? String(vm.dump(title)) : undefined
        );
      });
      bindVmFunction(vm, javaObj, 'openUrl', (u) => {
        ctx.java.openUrl(String(vm.dump(u)));
      });
      bindVmFunction(vm, javaObj, 'startBrowserAwait', (u, title) => {
        try {
          const resp = ctx.startBrowserAwait(
            String(vm.dump(u)),
            title != null ? String(vm.dump(title)) : undefined,
          );
          return vmNewLegadoStrResponse(vm, resp.body());
        } catch (e) {
          if (e instanceof Error && e.message === LEGADO_SUSPEND_MARKER) throw e;
          throw e;
        }
      });
      bindVmFunction(vm, javaObj, 'base64Encode', (s) =>
        vm.newString(ctx.java.base64Encode(String(vm.dump(s))))
      );
      bindVmFunction(vm, javaObj, 'base64Decode', (s) =>
        vm.newString(ctx.java.base64Decode(String(vm.dump(s))))
      );

      bindJavaAjax(vm, javaObj, rt, {
        baseUrl: ctx.baseUrl,
        resolveUrl: ctx.resolveUrl,
        // 须用箭头函数：build-ajax-vm 以 options.getCookie(url) 调用，不能直接传方法引用
        getCookie: (url) => ctx.cookie.getCookie(url),
        request: ctx.java.request,
        applyDuration: dateVm.applyAjaxDuration,
        normalizePostBody: ctx.normalizeAjaxBody,
        getArgToken: ctx.getArgToken,
        getFormKey: ctx.getFormKey,
        getDeviceId: ctx.getDeviceId,
      });
    });

    evalCodeVoid(
      vm,
      'globalThis.java.base64Encode = globalThis.__readerB64Enc;\n' +
        'globalThis.java.base64Decode = globalThis.__readerB64Dec;\n' +
        'globalThis.java.hexDecodeToString = globalThis.__readerHexDec;\n' +
        'if (typeof globalThis.java.createSymmetricCrypto !== "function") {\n' +
        '  globalThis.java.createSymmetricCrypto = function(alg, key) {\n' +
        '    return { encrypt: function(info) { return String(info == null ? "" : info); }, decryptStr: function(d) { return String(d == null ? "" : d); } };\n' +
        '  };\n' +
        '}'
    );
  };
}
