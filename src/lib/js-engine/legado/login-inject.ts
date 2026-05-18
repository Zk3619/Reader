/**
 * 登录脚本 QuickJS 宿主 API 注入
 */

import type { QuickJSContext } from 'quickjs-emscripten';
import { setGlobalJson, setGlobalString } from '../core/runtime';
import type { LegadoInjector, LegadoRunRuntime } from './quickjs-runner';
import { bindVmFunction, bindVmObject } from './host/bind-vm';
import { bindJavaAjax, type AjaxRequestFn } from './host/build-ajax-vm';
import { injectDateShimVm } from './host/date-vm';

export interface LoginInjectContext {
  baseUrl: string;
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
    timeFormat: (ms: number) => string;
    startBrowser: (url: string) => void;
    base64Encode: (s: string) => string;
    base64Decode: (s: string) => string;
    request: AjaxRequestFn;
  };
  source: {
    getVariable: (key?: string) => string;
    setVariable: (val?: string) => void;
    getLoginInfo: () => string;
  };
}

export function createLoginInjector(ctx: LoginInjectContext): LegadoInjector {
  return (vm: QuickJSContext, rt: LegadoRunRuntime) => {
    const dateVm = injectDateShimVm(vm);
    rt.applyAjaxDuration = dateVm.applyAjaxDuration;

    setGlobalJson(vm, 'result', ctx.formValues);
    setGlobalString(vm, 'baseUrl', ctx.baseUrl);
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

    const sourceObj = bindVmObject(vm, 'source');
    bindVmFunction(vm, sourceObj, 'getVariable', (k) => {
      const key = k ? String(vm.dump(k)) : undefined;
      return vm.newString(ctx.source.getVariable(key));
    });
    bindVmFunction(vm, sourceObj, 'setVariable', (v) => {
      ctx.source.setVariable(v ? String(vm.dump(v)) : undefined);
    });
    bindVmFunction(vm, sourceObj, 'getLoginInfo', () => vm.newString(ctx.source.getLoginInfo()));
    sourceObj.dispose();

    const cookieObj = bindVmObject(vm, 'cookie');
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
    cookieObj.dispose();

    const javaObj = bindVmObject(vm, 'java');
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
    bindVmFunction(vm, javaObj, 'timeFormat', (t) => {
      const n = Number(vm.dump(t));
      return vm.newString(ctx.java.timeFormat(n));
    });
    bindVmFunction(vm, javaObj, 'startBrowser', (u) => {
      ctx.java.startBrowser(String(vm.dump(u)));
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
      getCookie: ctx.cookie.getCookie,
      request: ctx.java.request,
      applyDuration: dateVm.applyAjaxDuration,
    });

    javaObj.dispose();

    vm.evalCode(
      'globalThis.java.base64Encode = globalThis.__readerB64Enc;\n' +
        'globalThis.java.base64Decode = globalThis.__readerB64Dec;\n' +
        'globalThis.java.hexDecodeToString = globalThis.__readerHexDec;'
    );
  };
}
