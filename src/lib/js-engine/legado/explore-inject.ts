/**
 * 发现页脚本 QuickJS 宿主 API 注入
 */

import type { QuickJSContext } from 'quickjs-emscripten';
import { evalCodeVoid, setGlobalJson, setGlobalString } from '@/lib/js-engine/core/runtime';
import type { LegadoInjector, LegadoRunRuntime } from '@/lib/js-engine/legado/quickjs-runner';
import { bindGlobalVmObject, bindVmFunction, vmNewStringRecordObject } from '@/lib/js-engine/legado/host/bind-vm';
import { bindJavaAjax, type AjaxRequestFn } from '@/lib/js-engine/legado/host/build-ajax-vm';
import { injectDateShimVm } from '@/lib/js-engine/legado/host/date-vm';
import { injectLegadoEncodingUtils } from '@/lib/js-engine/legado/host/encode-vm';
import { injectRhinoLegadoShims } from '@/lib/js-engine/legado/host/rhino-shim-vm';

export interface ExploreInjectContext {
  baseUrl: string;
  sourceUrl: string;
  host: string[];
  resolveUrl: (base: string, rel: string) => string;
  getOrCreateDeviceId: () => string;
  /** 书源 args 中的 qttoken（与登录脚本一致，供 ajax Cookie 补全） */
  getArgToken?: () => string;
  /** 登录表单「密钥」字段 */
  getFormKey?: () => string;
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
    getKey?: () => string;
  };
  request: AjaxRequestFn;
  /** 搜索 URL 脚本：关键词与页码 */
  searchKey?: string;
  searchPage?: number;
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
    if (ctx.searchKey != null) {
      setGlobalString(vm, 'key', ctx.searchKey);
    }
    if (ctx.searchPage != null) {
      evalCodeVoid(vm, `globalThis.page = ${ctx.searchPage};`);
    }
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
      bindVmFunction(vm, cookieObj, 'removecookie', (u) => {
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
      if (ctx.source.getKey) {
        const sourceKey = ctx.source.getKey!;
        bindVmFunction(vm, sourceObj, 'getKey', () => vm.newString(sourceKey()));
        bindVmFunction(vm, sourceObj, 'getkey', () => vm.newString(sourceKey()));
      }
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
        twoPassDefer: rt.coordinator.mode === 'two-pass',
        getDeviceId: ctx.getOrCreateDeviceId,
        getArgToken: ctx.getArgToken,
        getFormKey: ctx.getFormKey,
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
        '}\n' +
        'if (typeof globalThis.bhost !== "function") {\n' +
        '  globalThis.bhost = function() {\n' +
        '    try { return (globalThis.host && globalThis.host[0]) || globalThis.baseUrl || ""; }\n' +
        '    catch (e) { return globalThis.baseUrl || ""; }\n' +
        '  };\n' +
        '}'
    );
  };
}
