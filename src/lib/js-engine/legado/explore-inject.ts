/**
 * 发现页脚本 QuickJS 宿主 API 注入
 */

import type { QuickJSContext } from 'quickjs-emscripten';
import { createRoot } from 'solid-js';
import { evalCodeVoid, setGlobalJson, setGlobalString } from '@/lib/js-engine/core/runtime';
import { getLegadoScriptVmDepth } from '@/lib/js-engine/legado/legado-vm-guard';
import type { LegadoInjector, LegadoRunRuntime } from '@/lib/js-engine/legado/quickjs-runner';
import {
  bindGlobalVmObject,
  bindVmFunction,
  vmDumpOptional,
  vmNewStringRecordObject,
} from '@/lib/js-engine/legado/host/bind-vm';
import { bindJavaAjax, type AjaxRequestFn } from '@/lib/js-engine/legado/host/build-ajax-vm';
import { injectDateShimVm } from '@/lib/js-engine/legado/host/date-vm';
import { injectLegadoEncodingUtils } from '@/lib/js-engine/legado/host/encode-vm';
import {
  legadoAesBase64DecodeToString,
  legadoJavaGetWebViewUA,
  legadoJavaMd5Encode,
} from '@/lib/js-engine/legado/legado-java-crypto';
import { injectBrowserLegadoShims } from '@/lib/js-engine/legado/host/browser-shim-vm';
import { injectRhinoLegadoShims } from '@/lib/js-engine/legado/host/rhino-shim-vm';
import { isSourceVerificationCancelledError } from '@/lib/book-source/source-verification';
import { LEGADO_SUSPEND_MARKER } from '@/lib/js-engine/core/runtime';
import { SuspendScript } from '@/lib/js-engine/legado/suspend-script';
import { writeLegadoAjaxCache } from '@/lib/js-engine/legado/host/ajax-coordinator';
import type { LegadoScriptSourceFace } from '@/lib/js-engine/legado/source-script-shared';
import { LEGADO_EXPLORE_DEVICE_JAVA_SHIM } from '@/lib/js-engine/legado/legado-explore-java-device';
import { createLegadoGetArguments } from '@/lib/js-engine/legado/source-script-shared';

export type ScriptToastEntry = { msg: unknown; level: unknown };

/** VM 结束后将缓冲 toast 刷到 UI（须在 QuickJS eval 完全结束之后调用） */
export function flushExploreScriptToastBuffer(
  buffer: ScriptToastEntry[],
  onScriptToast?: (msg?: unknown, level?: unknown) => void,
): void {
  if (!onScriptToast || buffer.length === 0) return;
  const entries = buffer.splice(0, buffer.length);
  const emit = () => {
    for (const t of entries) {
      try {
        onScriptToast(t.msg, t.level);
      } catch (e) {
        console.warn('[explore-script] toast failed', e);
      }
    }
  };
  const run = () => {
    if (getLegadoScriptVmDepth() > 0) {
      queueMicrotask(run);
      return;
    }
    createRoot(emit);
  };
  queueMicrotask(run);
}

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
  source: LegadoScriptSourceFace & {
    /** 请求头 JSON / @js（getWebViewUA 兜底） */
    header?: string;
  };
  /** VM 执行期间仅写入此数组，禁止同步调 Solid toast */
  scriptToastBuffer?: ScriptToastEntry[];
  /** 无 buffer 时的降级（搜索脚本等）；仍须避免在 VM 内同步调 UI */
  onToast?: (msg?: unknown, level?: unknown) => void;
  request: AjaxRequestFn;
  /** 搜索 URL 脚本：关键词与页码 */
  searchKey?: string;
  searchPage?: number;
  /** 发现 button/text action：Legado infoMap */
  infoMap?: Record<string, string>;
  /** java.refreshExplore() */
  onRefreshExplore?: () => void | Promise<void>;
  /** java.openBookSearch(keyword) */
  onOpenSearch?: (query: string) => void;
  /** java.getVerificationCode(imageUrl) */
  onVerificationCode?: (imageUrl: string) => Promise<string>;
  /** 扩展 java API（发现 action 内 startBrowser / showBrowser 等） */
  javaExtensions?: {
    startBrowser?: (url: string, title?: string) => void;
    showBrowser?: (
      url: string,
      html?: string | null,
      preloadJs?: string | null,
      config?: string | null,
    ) => void;
    /** 图片验证码 / 自定义输入（sortUrl 搜索关键词等） */
    getVerificationCode?: (imageUrl: string) => Promise<string>;
  };
}

export function createExploreInjector(ctx: ExploreInjectContext): LegadoInjector {
  return (vm: QuickJSContext, rt: LegadoRunRuntime) => {
    const captureScriptToast = (msg?: unknown, level?: unknown) => {
      if (ctx.scriptToastBuffer) {
        ctx.scriptToastBuffer.push({ msg, level });
        return;
      }
      if (!ctx.onToast) return;
      queueMicrotask(() => {
        try {
          ctx.onToast!(msg, level);
        } catch (e) {
          console.warn('[explore-script] toast failed', e);
        }
      });
    };
    const dateVm = injectDateShimVm(vm);
    rt.applyAjaxDuration = dateVm.applyAjaxDuration;
    injectLegadoEncodingUtils(vm);
    injectRhinoLegadoShims(vm);
    injectBrowserLegadoShims(vm, ctx.baseUrl);

    setGlobalString(vm, 'baseUrl', ctx.baseUrl);
    setGlobalString(vm, 'sourceUrl', ctx.sourceUrl);
    setGlobalString(vm, 'bookSourceUrl', ctx.sourceUrl);
    setGlobalJson(vm, 'host', ctx.host.length > 0 ? ctx.host : [ctx.baseUrl]);
    setGlobalJson(vm, 'infoMap', ctx.infoMap ?? {});
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
        const key = k ? String(vmDumpOptional(vm, k) ?? '') : undefined;
        return vm.newString(ctx.source.getVariable(key));
      });
      bindVmFunction(vm, sourceObj, 'setVariable', (v) => {
        ctx.source.setVariable(v ? String(vmDumpOptional(vm, v) ?? '') : undefined);
      });
      bindVmFunction(vm, sourceObj, 'getLoginInfoMap', () => {
        const record = ctx.source.getLoginInfoMap();
        const obj = vm.newObject();
        bindVmFunction(vm, obj, 'get', (key) => {
          const k = String(vmDumpOptional(vm, key) ?? '');
          const v = record.get(k);
          if (v == null) return vm.null;
          const handle = vm.newString(v);
          return handle;
        });
        return obj;
      });
      if (ctx.source.getKey) {
        const sourceKey = ctx.source.getKey;
        bindVmFunction(vm, sourceObj, 'getKey', () => vm.newString(sourceKey()));
        bindVmFunction(vm, sourceObj, 'getkey', () => vm.newString(sourceKey()));
      }
      if (ctx.source.loginUrl) {
        const loginUrlHandle = vm.newString(ctx.source.loginUrl);
        vm.setProp(sourceObj, 'loginUrl', loginUrlHandle);
        loginUrlHandle.dispose();
      }
      if (ctx.source.loginUi != null && ctx.source.loginUi !== '') {
        const loginUiHandle = vm.newString(ctx.source.loginUi);
        vm.setProp(sourceObj, 'loginUi', loginUiHandle);
        loginUiHandle.dispose();
      }
      if (ctx.source.variableComment) {
        const vcHandle = vm.newString(ctx.source.variableComment);
        vm.setProp(sourceObj, 'variableComment', vcHandle);
        vcHandle.dispose();
      }
      for (const [prop, val] of [
        ['jsLib', ctx.source.jsLib],
        ['ruleArticles', ctx.source.ruleArticles],
        ['searchUrl', ctx.source.searchUrl],
      ] as const) {
        if (val) {
          const handle = vm.newString(val);
          vm.setProp(sourceObj, prop, handle);
          handle.dispose();
        }
      }
    });

    bindGlobalVmObject(vm, 'java', (javaObj) => {
      bindVmFunction(vm, javaObj, 'toast', (msg, level) => {
        captureScriptToast(vmDumpOptional(vm, msg), vmDumpOptional(vm, level));
      });
      bindVmFunction(vm, javaObj, 'longToast', (msg) => {
        captureScriptToast(vmDumpOptional(vm, msg), 'warning');
      });
      bindVmFunction(vm, javaObj, 'log', (...args) => {
        const parts = args.map((a) => vm.dump(a));
        const msg = parts.map((p) => String(p ?? '')).join(' ');
        if (msg === LEGADO_SUSPEND_MARKER || msg.includes(LEGADO_SUSPEND_MARKER)) {
          return;
        }
        if (msg.includes('线路报错，自动切换下一个')) {
          if (import.meta.env.DEV) {
            console.debug('[explore-script]', msg);
          }
        } else if (import.meta.env.DEV) {
          console.log('[explore-script]', ...parts);
        }
      });
      bindVmFunction(vm, javaObj, 'androidId', () =>
        vm.newString(ctx.getOrCreateDeviceId()),
      );
      bindVmFunction(vm, javaObj, 'startBrowser', (u, title) => {
        if (ctx.javaExtensions?.startBrowser) {
          ctx.javaExtensions.startBrowser(
            String(vmDumpOptional(vm, u) ?? ''),
            title != null ? String(vmDumpOptional(vm, title) ?? '') : undefined,
          );
        }
      });
      bindVmFunction(vm, javaObj, 'showBrowser', (u, html, preloadJs, config) => {
        if (ctx.javaExtensions?.showBrowser) {
          ctx.javaExtensions.showBrowser(
            String(vmDumpOptional(vm, u) ?? ''),
            html != null ? String(vmDumpOptional(vm, html) ?? '') : null,
            preloadJs != null ? String(vmDumpOptional(vm, preloadJs) ?? '') : null,
            config != null ? String(vmDumpOptional(vm, config) ?? '') : null,
          );
        }
      });
      bindVmFunction(vm, javaObj, 'reLoginView', () => {
        /* 光遇 checkEnv：typeof java.reLoginView === 'function' */
      });
      bindVmFunction(vm, javaObj, 'refreshExplore', () => {
        if (ctx.onRefreshExplore) {
          queueMicrotask(() => {
            try {
              void ctx.onRefreshExplore!();
            } catch (e) {
              console.warn('[explore-script] refreshExplore failed', e);
            }
          });
        }
      });
      bindVmFunction(vm, javaObj, 'openBookSearch', (key) => {
        const q = String(vmDumpOptional(vm, key) ?? '').trim();
        if (q && ctx.onOpenSearch) {
          queueMicrotask(() => {
            try {
              ctx.onOpenSearch!(q);
            } catch (e) {
              console.warn('[explore-script] openBookSearch failed', e);
            }
          });
        }
      });
      bindVmFunction(vm, javaObj, 'getCookie', (u) =>
        vm.newString(ctx.cookie.getCookie(String(vm.dump(u))))
      );
      bindVmFunction(vm, javaObj, 'getWebViewUA', () =>
        vm.newString(legadoJavaGetWebViewUA(ctx.source.header)),
      );
      bindVmFunction(vm, javaObj, 'aesBase64DecodeToString', (data, key, transform, iv) =>
        vm.newString(
          legadoAesBase64DecodeToString(
            String(vmDumpOptional(vm, data) ?? ''),
            String(vmDumpOptional(vm, key) ?? ''),
            String(vmDumpOptional(vm, transform) ?? ''),
            String(vmDumpOptional(vm, iv) ?? ''),
          ),
        ),
      );
      bindVmFunction(vm, javaObj, 'md5Encode', (input) =>
        vm.newString(legadoJavaMd5Encode(String(vmDumpOptional(vm, input) ?? ''))),
      );
      bindVmFunction(vm, javaObj, 'getVerificationCode', (imageUrl) => {
        const url = String(vmDumpOptional(vm, imageUrl) ?? '');
        const cached = rt.coordinator.getCachedResponse(url);
        if (cached !== undefined) return vm.newString(cached);
        const ask = ctx.javaExtensions?.getVerificationCode ?? ctx.onVerificationCode;
        if (!ask) return vm.newString('');

        const requestStart = Date.now();
        const promise = ask(url).then(
          (text) => {
            const body = text ?? '';
            rt.coordinator.recordDuration(url, Date.now() - requestStart);
            writeLegadoAjaxCache(rt.coordinator.cache, url, body);
            return body;
          },
          (error) => {
            rt.coordinator.recordDuration(url, Date.now() - requestStart);
            if (isSourceVerificationCancelledError(error)) {
              throw error;
            }
            writeLegadoAjaxCache(rt.coordinator.cache, url, '');
            return '';
          },
        );

        // two-pass：同步返回空串，脚本 try/catch 不会吞挂起标记；第二轮从 cache 回放用户输入
        if (rt.coordinator.mode === 'two-pass') {
          rt.pending.push(promise);
          return vm.newString('');
        }

        const writeIdx = rt.coordinator.writeIndex;
        rt.coordinator.writeIndex += 1;
        rt.coordinator.pendingSuspend = new SuspendScript(promise, writeIdx, url, requestStart);
        throw new Error(LEGADO_SUSPEND_MARKER);
      });

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
      // qread/deviceID 由纯 JS shim 提供（bundle 每轮 eval 也会重跑）；inject 阶段先设一次
      evalCodeVoid(vm, LEGADO_EXPLORE_DEVICE_JAVA_SHIM);
    });

    const getArgumentsHost = createLegadoGetArguments(ctx.host[0] || ctx.baseUrl);
    bindVmFunction(vm, vm.global, '__readerGetArguments', (a, k) => {
      const arg = a ? String(vm.dump(a)) : '';
      const key = k != null && vm.dump(k) !== undefined ? String(vm.dump(k)) : undefined;
      const out = getArgumentsHost(arg, key);
      if (out != null && typeof out === 'object') {
        const flat: Record<string, string> = {};
        for (const [entryKey, entryVal] of Object.entries(out as Record<string, unknown>)) {
          flat[entryKey] =
            entryVal != null && typeof entryVal === 'object'
              ? JSON.stringify(entryVal)
              : String(entryVal ?? '');
        }
        return vmNewStringRecordObject(vm, flat);
      }
      return vm.newString(out == null ? '' : String(out));
    });
    evalCodeVoid(
      vm,
      'globalThis.java.base64Encode = globalThis.__readerB64Enc;\n' +
      'globalThis.java.base64Decode = globalThis.__readerB64Dec;\n' +
      'globalThis.java.hexDecodeToString = globalThis.__readerHexDec;\n' +
      'if (typeof globalThis.getArguments !== "function") {\n' +
      '  globalThis.getArguments = function(a, k) {\n' +
      '    return globalThis.__readerGetArguments(a, k);\n' +
      '  };\n' +
      '}\n' +
      'if (typeof globalThis.bhost !== "function") {\n' +
      '  globalThis.bhost = function() {\n' +
      '    try { return (globalThis.host && globalThis.host[0]) || globalThis.baseUrl || ""; }\n' +
      '    catch (e) { return globalThis.baseUrl || ""; }\n' +
      '  };\n' +
      '}\n' +
      'if (typeof globalThis.toast !== "function") {\n' +
      '  globalThis.toast = function(msg, level) { return globalThis.java.toast(msg, level); };\n' +
      '}\n' +
      'if (typeof globalThis.longToast !== "function") {\n' +
      '  globalThis.longToast = function(msg) { return globalThis.java.longToast(msg); };\n' +
      '}'
    );
  };
}
