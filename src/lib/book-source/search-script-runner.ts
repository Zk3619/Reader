/**
 * 执行 Legado 风格 searchUrl 脚本（<js>...</js>）及内嵌 JS 表达式
 * 对齐 Legado AnalyzeUrl.analyzeJs / evalJS
 */

import { getBookSourcePage, postBookSourcePage } from '@/lib/book-source/source-http-cf';
import {
  resolveUrl,
  utf8FromBase64,
  utf8ToBase64,
  hexToUtf8,
} from '@/lib/book-source/utils';
import type { BookSource } from '@/types';
import {
  createQuickJSContext,
  evalCodeVoid,
  initQuickJSRuntime,
  isQuickJSFallback,
} from '@/lib/js-engine/core/runtime';
import { AjaxCoordinator } from '@/lib/js-engine/legado/host/ajax-coordinator';
import { createExploreInjector, flushExploreScriptToastBuffer } from '@/lib/js-engine/legado/explore-inject';
import type { LegadoRunRuntime } from '@/lib/js-engine/legado/quickjs-runner';
import { runLegadoScriptQuickJS } from '@/lib/js-engine/legado/quickjs-runner';
import {
  buildSearchTemplateContext,
  trySyncEvalSearchTemplate,
} from '@/lib/book-source/search-url-template-sync';
import { installScriptDateShim } from '@/lib/js-engine/legado/script-date-shim';
import {
  createLegadoScriptCookieApi,
} from '@/lib/js-engine/legado/login-script-runner';
import {
  createLegadoScriptCache,
  createSourceVariableHandlers,
  buildLegadoScriptSourceFace,
  buildLegadoExploreScriptBundle,
  EXPLORE_JSLIB_CONTEXT_SHIM,
  LEGADO_LEGACY_PACKAGES_SHIM,
  getScriptBaseUrl,
  getSourceArgsKey,
  getSourceCookiesKey,
  getLegadoSourceKey,
  hostsFromJsLib,
  loadSourceCookieStore,
} from '@/lib/js-engine/legado/source-script-shared';
import {
  legadoAesBase64DecodeToString,
  legadoJavaGetWebViewUA,
  legadoJavaMd5Encode,
} from '@/lib/js-engine/legado/legado-java-crypto';

const SCRIPT_TIMEOUT_MS = 15000;

export function extractSearchScript(searchUrl: string | undefined): string | null {
  if (typeof searchUrl !== 'string') return null;
  const s = searchUrl.trim();
  if (!s.startsWith('<js>')) return null;
  const end = s.indexOf('</js>');
  if (end === -1) return null;
  return s.slice(4, end).trim();
}

export function isScriptSearchUrl(searchUrl: string | undefined): boolean {
  return extractSearchScript(searchUrl) != null;
}

function buildSearchFullScript(scriptContent: string, jsLib: string): string {
  return buildLegadoExploreScriptBundle(jsLib, scriptContent);
}

function buildSearchInjectParams(source: BookSource, _keyword: string, _page: number) {
  const baseUrl = getScriptBaseUrl(source);
  const sourceUrl = getLegadoSourceKey(source);
  const argsKey = getSourceArgsKey(source);
  const cookiesKey = getSourceCookiesKey(source);
  const jsLib =
    typeof (source as Record<string, unknown>).jsLib === 'string'
      ? ((source as Record<string, unknown>).jsLib as string)
      : '';
  const hostList = hostsFromJsLib(jsLib);
  const hosts = hostList.length > 0 ? hostList : baseUrl ? [baseUrl] : [];
  const cookieStore = loadSourceCookieStore(cookiesKey);
  const cookieApi = createLegadoScriptCookieApi(source, baseUrl, cookieStore, { hostList: hosts });
  const sourceVars = createSourceVariableHandlers(source, argsKey);

  return {
    baseUrl,
    sourceUrl,
    hosts,
    cookieApi,
    sourceVars,
    jsLib,
    source,
  };
}

async function requestInScript(
  url: string,
  options: {
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    source: BookSource;
  },
): Promise<string> {
  const httpOpts = {
    headers: options.headers,
    timeout: 12000,
    enableCookieJar: options.source.enabledCookieJar,
    concurrentRate: options.source.concurrentRate,
  };
  if (options.method === 'POST') {
    return postBookSourcePage(options.source, url, options.body ?? '', httpOpts);
  }
  return getBookSourcePage(options.source, url, httpOpts);
}

function scriptResultToString(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return JSON.stringify(raw);
}

/** 整段 searchUrl 脚本（含 jsLib） */
async function runSearchJsFullQuickJS(
  scriptContent: string,
  source: BookSource,
  keyword: string,
  page: number,
  onScriptToast?: (msg?: unknown, level?: unknown) => void,
): Promise<string | null> {
  await initQuickJSRuntime();
  if (isQuickJSFallback()) return null;

  const p = buildSearchInjectParams(source, keyword, page);
  const fullScript = buildSearchFullScript(scriptContent, p.jsLib);

  const toastBuffer: Array<{ msg: unknown; level: unknown }> = [];
  const injector = createExploreInjector({
    baseUrl: p.baseUrl,
    sourceUrl: p.sourceUrl,
    host: p.hosts,
    resolveUrl,
    getOrCreateDeviceId: () => 'web_reader',
    cookie: p.cookieApi,
    source: {
      ...buildLegadoScriptSourceFace(source, p.sourceVars, p.sourceUrl),
      header: typeof source.header === 'string' ? source.header : undefined,
    },
    searchKey: keyword,
    searchPage: page,
    request: (resolvedUrl, call) => requestInScript(resolvedUrl, { ...call, source }),
    scriptToastBuffer: toastBuffer,
  });

  try {
    const raw = await runLegadoScriptQuickJS({
      script: fullScript,
      baseUrl: p.baseUrl,
      timeoutMs: SCRIPT_TIMEOUT_MS,
      mode: 'two-pass',
      inject: injector,
      beforeEval: (vm) => {
        evalCodeVoid(vm, 'globalThis.result = undefined;');
      },
    });
    setTimeout(() => {
      flushExploreScriptToastBuffer(toastBuffer, onScriptToast);
    }, 0);
    return scriptResultToString(raw);
  } catch (e) {
    console.warn('[search-script] 整段脚本 QuickJS 失败，降级 Function', e);
    return null;
  }
}

function buildLegacyJavaApi(header?: string | null): Pick<
  Record<string, unknown>,
  'base64Encode' | 'base64Decode' | 'hexDecodeToString' | 'aesBase64DecodeToString' | 'getWebViewUA' | 'md5Encode'
> {
  return {
    base64Encode(str: unknown) {
      return utf8ToBase64(String(str ?? ''));
    },
    base64Decode(str: unknown) {
      return utf8FromBase64(String(str ?? ''));
    },
    hexDecodeToString(hex: unknown) {
      return hexToUtf8(String(hex ?? ''));
    },
    aesBase64DecodeToString(data: unknown, key: unknown, transformation: unknown, iv: unknown) {
      return legadoAesBase64DecodeToString(
        String(data ?? ''),
        String(key ?? ''),
        String(transformation ?? ''),
        String(iv ?? ''),
      );
    },
    getWebViewUA() {
      return legadoJavaGetWebViewUA(header);
    },
    md5Encode(input: unknown) {
      return legadoJavaMd5Encode(String(input ?? ''));
    },
  };
}

function sourceHasJsLib(source: BookSource): boolean {
  const jsLib = (source as Record<string, unknown>).jsLib;
  return typeof jsLib === 'string' && jsLib.trim().length > 0;
}

/** sortUrl/header 中 {{getUrl()}} 等依赖 jsLib 的表达式 */
function expressionLikelyNeedsJsLib(expr: string, source: BookSource): boolean {
  if (!sourceHasJsLib(source)) return false;
  const t = expr.trim();
  if (!t || !/\b[a-zA-Z_$][\w$]*\s*\(/.test(t)) return false;
  if (trySyncEvalSearchTemplate(t, buildSearchTemplateContext(source, '', 1)) != null) {
    return false;
  }
  return true;
}

function buildLegacyScope(
  source: BookSource,
  keyword: string,
  page: number,
  onScriptToast?: (msg?: unknown, level?: unknown) => void,
): Record<string, unknown> {
  const p = buildSearchInjectParams(source, keyword, page);
  const ajaxCache = new Map<string, string>();
  const { PatchedDate, applyAjaxDuration } = installScriptDateShim();

  const scopeObj: Record<string, unknown> = {
    Date: PatchedDate,
    key: keyword,
    page,
    baseUrl: p.baseUrl,
    host: p.hosts,
    result: undefined,
    cookie: p.cookieApi,
    cache: createLegadoScriptCache(),
    source: buildLegadoScriptSourceFace(source, p.sourceVars, p.sourceUrl),
    Packages: LEGADO_LEGACY_PACKAGES_SHIM,
    bhost: () => (p.hosts[0] as string) || p.baseUrl || '',
    getArguments: (a: string, k?: string) => {
      try {
        const obj = JSON.parse(a) as Record<string, unknown>;
        return k != null && k !== '' ? String(obj[k] ?? '') : obj;
      } catch {
        if (k != null && k !== '') {
          const key = String(k).trim().toLowerCase();
          if (key === 'server') return p.hosts[0] || p.baseUrl || '';
          return '';
        }
        return {};
      }
    },
    java: {
      ...buildLegacyJavaApi(typeof source.header === 'string' ? source.header : undefined),
      toast(msg?: unknown, level?: unknown) {
        onScriptToast?.(msg, level ?? 'info');
      },
      longToast(msg?: unknown) {
        onScriptToast?.(msg, 'warning');
      },
      log(...args: unknown[]) {
        console.warn('[search-script]', ...args);
      },
      ajax(
        url: string | Record<string, unknown>,
        optionsOrCb?: Record<string, unknown> | ((body: string) => void),
        cb?: (body: string) => void,
      ): string {
        let method = 'GET';
        let body: string | undefined;
        let headers: Record<string, string> = {};
        let callback: ((body: string) => void) | null = null;

        if (typeof optionsOrCb === 'function') {
          callback = optionsOrCb;
        } else if (typeof cb === 'function') {
          callback = cb;
          if (optionsOrCb && typeof optionsOrCb === 'object') {
            method = ((optionsOrCb.method as string) || 'GET').toUpperCase();
            body = optionsOrCb.body as string | undefined;
            const h = optionsOrCb.headers as Record<string, string> | undefined;
            if (h) headers = { ...headers, ...h };
          }
        } else if (optionsOrCb && typeof optionsOrCb === 'object') {
          method = ((optionsOrCb.method as string) || 'GET').toUpperCase();
          body = optionsOrCb.body as string | undefined;
          const h = optionsOrCb.headers as Record<string, string> | undefined;
          if (h) headers = { ...headers, ...h };
        }

        const urlStr = typeof url === 'string' ? url : '';
        if (!urlStr) {
          callback?.('');
          return '';
        }
        const resolvedUrl = resolveUrl(p.baseUrl, urlStr);
        if (ajaxCache.has(resolvedUrl)) {
          const cached = ajaxCache.get(resolvedUrl)!;
          callback?.(cached);
          return cached;
        }

        const requestStart = Date.now();
        void requestInScript(resolvedUrl, {
          method: method as 'GET' | 'POST',
          headers: Object.keys(headers).length ? headers : undefined,
          body,
          source,
        })
          .then((text) => {
            applyAjaxDuration(Date.now() - requestStart);
            ajaxCache.set(resolvedUrl, text);
            callback?.(text);
          })
          .catch(() => {
            ajaxCache.set(resolvedUrl, '');
            callback?.('');
          });
        return '';
      },
    },
  };

  return scopeObj;
}

async function runSearchJsFullLegacy(
  scriptContent: string,
  source: BookSource,
  keyword: string,
  page: number,
  onScriptToast?: (msg?: unknown, level?: unknown) => void,
): Promise<string> {
  const p = buildSearchInjectParams(source, keyword, page);
  const scopeObj = buildLegacyScope(source, keyword, page, onScriptToast);
  const fullScript = buildSearchFullScript(scriptContent, p.jsLib);

  const run = new Function(
    '__scope__',
    'scriptText',
    'try { with(__scope__) { const __ret = eval(scriptText); if ((__scope__.result === undefined || __scope__.result === null) && __ret !== undefined && __ret !== null) { __scope__.result = __ret; } } } catch (e) { console.warn("[search-script] run error:", e); }',
  );

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('搜索脚本执行超时')), SCRIPT_TIMEOUT_MS);
  });

  const runPromise = (async () => {
    for (let round = 0; round < 6; round++) {
      run(scopeObj, fullScript);
      const ret = scopeObj.result;
      if (ret !== undefined && ret !== null) return ret;
      if (round >= 5) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    return scopeObj.result;
  })();

  const raw = await Promise.race([runPromise, timeoutPromise]);
  return scriptResultToString(raw);
}

/** 轻量求值 {{...}} / 内嵌短 JS（不加载 jsLib，避免污染全局） */
async function evalExprQuickJS(
  expr: string,
  source: BookSource,
  keyword: string,
  page: number,
): Promise<string | null> {
  await initQuickJSRuntime();
  if (isQuickJSFallback()) return null;

  const vm = createQuickJSContext();
  if (!vm) return null;

  const p = buildSearchInjectParams(source, keyword, page);
  const injector = createExploreInjector({
    baseUrl: p.baseUrl,
    sourceUrl: p.sourceUrl,
    host: p.hosts,
    resolveUrl,
    getOrCreateDeviceId: () => 'web_reader',
    cookie: p.cookieApi,
    source: {
      ...buildLegadoScriptSourceFace(source, p.sourceVars, p.sourceUrl),
    },
    searchKey: keyword,
    searchPage: page,
    request: (resolvedUrl, call) => requestInScript(resolvedUrl, { ...call, source }),
  });

  try {
    const coordinator = new AjaxCoordinator('two-pass', false);
    const rt: LegadoRunRuntime = {
      coordinator,
      pending: [],
      deferredCallbackHandles: [],
      setGlobalResult: () => {},
      getGlobalResult: () => undefined,
    };
    injector(vm, rt);
    evalCodeVoid(vm, EXPLORE_JSLIB_CONTEXT_SHIM);

    const safeExpr = expr.trim();
    const script = `(function(){ try { return (${safeExpr}); } catch(e) { return ""; } })();`;
    const r = vm.evalCode(script);
    if (r.error) {
      const err = vm.dump(r.error);
      r.error.dispose();
      console.warn('[search-script] 表达式 QuickJS 失败:', err, safeExpr.slice(0, 80));
      return null;
    }
    const value = scriptResultToString(vm.dump(r.value));
    r.value.dispose();
    return value;
  } catch (e) {
    console.warn('[search-script] 表达式 QuickJS 异常:', e);
    return null;
  } finally {
    vm.dispose();
  }
}

function evalExprLegacy(
  expr: string,
  source: BookSource,
  keyword: string,
  page: number,
): string {
  const scope = buildLegacyScope(source, keyword, page);
  const paramNames = Object.keys(scope);
  const paramValues = paramNames.map((k) => scope[k]);
  try {
    const fn = new Function(
      ...paramNames,
      `"use strict"; return (${expr.trim()});`,
    );
    const out = fn(...paramValues);
    return scriptResultToString(out);
  } catch (e) {
    console.warn('[search-script] 表达式 Function 失败:', e, expr.slice(0, 80));
    return '';
  }
}

/** 执行 searchUrl 整段 <js> 脚本，返回解析后的 URL 字符串（可含尾部 UrlOption JSON） */
export async function runSearchUrlScript(
  scriptContent: string,
  source: BookSource,
  keyword: string,
  page = 1,
  options?: { onScriptToast?: (msg?: unknown, level?: unknown) => void },
): Promise<string> {
  const onScriptToast = options?.onScriptToast;
  const quick = await runSearchJsFullQuickJS(scriptContent, source, keyword, page, onScriptToast);
  if (quick != null && quick.trim()) return quick.trim();
  return (await runSearchJsFullLegacy(scriptContent, source, keyword, page, onScriptToast)).trim();
}

/**
 * 执行单条 JS 表达式（用于 {{...}} 或内嵌 <js> 块）
 * 常见模板走同步路径；依赖 jsLib 的（如 {{getUrl()}}）回退整包 jsLib 执行
 */
export async function evalSearchUrlExpression(
  expr: string,
  source: BookSource,
  keyword: string,
  page: number,
  prevResult = '',
): Promise<string> {
  const trimmed = expr.trim();
  if (!trimmed) return prevResult;

  if (expressionLikelyNeedsJsLib(trimmed, source)) {
    const withLib = await runSearchUrlScript(
      `result = (${trimmed});`,
      source,
      keyword,
      page,
    );
    if (withLib.trim()) return withLib.trim();
  }

  const tplCtx = buildSearchTemplateContext(source, keyword, page);
  const sync = trySyncEvalSearchTemplate(trimmed, tplCtx);
  if (sync != null) return sync;

  const quick = await evalExprQuickJS(trimmed, source, keyword, page);
  if (quick != null && quick !== '') return quick;

  const legacy = evalExprLegacy(trimmed, source, keyword, page);
  if (legacy !== '') return legacy;

  return prevResult;
}

