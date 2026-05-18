/**
 * 发现页脚本 QuickJS 宿主 API 注入
 */

import type { QuickJSContext } from 'quickjs-emscripten';
import { setGlobalString } from '../core/runtime';
import type { LegadoInjector, LegadoRunRuntime } from './quickjs-runner';
import { bindVmFunction, bindVmObject } from './host/bind-vm';
import { bindJavaAjax, type AjaxRequestFn } from './host/build-ajax-vm';
import { injectDateShimVm } from './host/date-vm';

export interface ExploreInjectContext {
  baseUrl: string;
  resolveUrl: (base: string, rel: string) => string;
  getCookie: () => string;
  source: {
    getVariable: (key?: string) => string;
    setVariable: (val?: string) => void;
  };
  request: AjaxRequestFn;
}

export function createExploreInjector(ctx: ExploreInjectContext): LegadoInjector {
  return (vm: QuickJSContext, rt: LegadoRunRuntime) => {
    const dateVm = injectDateShimVm(vm);
    rt.applyAjaxDuration = dateVm.applyAjaxDuration;

    setGlobalString(vm, 'baseUrl', ctx.baseUrl);
    vm.evalCode('result = undefined;');

    const cookieRef = vm.newObject();
    bindVmFunction(vm, cookieRef, 'getCookie', () => vm.newString(ctx.getCookie()));
    vm.setProp(vm.global, 'cookie', cookieRef);
    vm.setProp(vm.global, 'cookieRef', cookieRef);

    const sourceObj = bindVmObject(vm, 'source');
    bindVmFunction(vm, sourceObj, 'getVariable', (k) => {
      const key = k ? String(vm.dump(k)) : undefined;
      return vm.newString(ctx.source.getVariable(key));
    });
    bindVmFunction(vm, sourceObj, 'setVariable', (v) => {
      ctx.source.setVariable(v ? String(vm.dump(v)) : undefined);
    });
    sourceObj.dispose();

    const javaObj = bindVmObject(vm, 'java');
    bindVmFunction(vm, javaObj, 'toast', () => {});

    bindJavaAjax(vm, javaObj, rt, {
      baseUrl: ctx.baseUrl,
      resolveUrl: ctx.resolveUrl,
      getCookie: () => ctx.getCookie(),
      request: ctx.request,
      applyDuration: dateVm.applyAjaxDuration,
      twoPassDefer: true,
    });
    javaObj.dispose();
    cookieRef.dispose();

    vm.evalCode(`
      function getArguments(a, k) {
        try { a = JSON.parse(a); } catch(e) { a = {}; }
        return k ? a[k] : a;
      }
      function getFanqieCookie() { return ""; }
    `);
  };
}
