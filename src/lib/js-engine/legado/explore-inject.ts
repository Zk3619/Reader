/**
 * 发现页脚本 QuickJS 宿主 API 注入
 */

import type { QuickJSContext } from 'quickjs-emscripten';
import { evalCodeVoid, setGlobalJson, setGlobalString } from '../core/runtime';
import type { LegadoInjector, LegadoRunRuntime } from './quickjs-runner';
import { bindGlobalVmObject, bindVmFunction, vmNewStringRecordObject } from './host/bind-vm';
import { bindJavaAjax, type AjaxRequestFn } from './host/build-ajax-vm';
import { injectDateShimVm } from './host/date-vm';
import { injectLegadoEncodingUtils } from './host/encode-vm';
import { injectRhinoLegadoShims } from './host/rhino-shim-vm';

export interface ExploreInjectContext {
  baseUrl: string;
  sourceUrl: string;
  host: string[];
  resolveUrl: (base: string, rel: string) => string;
  getOrCreateDeviceId: () => string;
  cookie: {
    getCookie: (url: string) => string;
    setCookie: (url: string, value: string) => void;
    removeCookie: (url: string) => void;
    getKey: (cookieStrOrUrl: string, keyName?: string) => string;
  };
  source: {
    getVariable: (key?: string) => string;
    setVariable: (val?: string) => void;
    getLoginInfoMap: () => Record<string, string>;
  };
  request: AjaxRequestFn;
}

export function createExploreInjector(ctx: ExploreInjectContext): LegadoInjector {
  return (vm: QuickJSContext, rt: LegadoRunRuntime) => {
    const dateVm = injectDateShimVm(vm);
    rt.applyAjaxDuration = dateVm.applyAjaxDuration;
    injectLegadoEncodingUtils(vm);
    injectRhinoLegadoShims(vm);

    setGlobalString(vm, 'baseUrl', ctx.baseUrl);
    setGlobalString(vm, 'sourceUrl', ctx.sourceUrl);
    setGlobalString(vm, 'bookSourceUrl', ctx.sourceUrl);
    setGlobalJson(vm, 'host', ctx.host.length > 0 ? ctx.host : [ctx.baseUrl]);
    evalCodeVoid(vm, 'result = undefined;');

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

    bindGlobalVmObject(vm, 'source', (sourceObj) => {
      bindVmFunction(vm, sourceObj, 'getVariable', (k) => {
        const key = k ? String(vm.dump(k)) : undefined;
        return vm.newString(ctx.source.getVariable(key));
      });
      bindVmFunction(vm, sourceObj, 'setVariable', (v) => {
        ctx.source.setVariable(v ? String(vm.dump(v)) : undefined);
      });
      bindVmFunction(vm, sourceObj, 'getLoginInfoMap', () =>
        vmNewStringRecordObject(vm, ctx.source.getLoginInfoMap())
      );
    });

    bindGlobalVmObject(vm, 'java', (javaObj) => {
      bindVmFunction(vm, javaObj, 'toast', () => {});
      bindVmFunction(vm, javaObj, 'longToast', () => {});
      bindVmFunction(vm, javaObj, 'log', (...args) => {
        console.warn('[explore-script]', ...args.map((a) => vm.dump(a)));
        return vm.newString('');
      });
      bindVmFunction(vm, javaObj, 'androidId', () => vm.newString(ctx.getOrCreateDeviceId()));
      bindVmFunction(vm, javaObj, 'deviceID', () => vm.newString(ctx.getOrCreateDeviceId()));
      bindVmFunction(vm, javaObj, 'qread', () => {});
      bindVmFunction(vm, javaObj, 'startBrowser', () => {});
      bindVmFunction(vm, javaObj, 'getCookie', (u) =>
        vm.newString(ctx.cookie.getCookie(String(vm.dump(u))))
      );

      bindJavaAjax(vm, javaObj, rt, {
        baseUrl: ctx.baseUrl,
        resolveUrl: ctx.resolveUrl,
        getCookie: (url) => ctx.cookie.getCookie(url),
        request: ctx.request,
        applyDuration: dateVm.applyAjaxDuration,
      });
    });

    evalCodeVoid(
      vm,
      'globalThis.java.base64Encode = globalThis.__readerB64Enc;\n' +
        'globalThis.java.base64Decode = globalThis.__readerB64Dec;\n' +
        'globalThis.java.hexDecodeToString = globalThis.__readerHexDec;\n' +
        'if (typeof globalThis.getArguments !== "function") {\n' +
        '  function getArguments(a, k) {\n' +
        '    try { a = JSON.parse(a); } catch(e) { a = {}; }\n' +
        '    return k ? a[k] : a;\n' +
        '  }\n' +
        '}'
    );
  };
}
