/**
 * 前端执行 legado 风格发现页脚本（<js>...</js>）
 * 优先 QuickJS + 集中宿主 API；WASM 不可用时降级 with + Function。
 */

import { get as httpGet, post } from '@/lib/http';
import { resolveUrl } from '@/lib/book-source/utils';
import type { BookSource } from '@/types';
import { mapRawExploreItem, type ExploreSection } from '@/lib/book-source/explore-sections';
import { evalCodeVoid, initQuickJSRuntime, isQuickJSFallback } from '@/lib/js-engine/core/runtime';
import { createExploreInjector, flushExploreScriptToastBuffer } from '@/lib/js-engine/legado/explore-inject';
import { runLegadoScriptQuickJS } from '@/lib/js-engine/legado/quickjs-runner';
import { installScriptDateShim } from '@/lib/js-engine/legado/script-date-shim';
import {
  createLegadoScriptCookieApi,
} from '@/lib/js-engine/legado/login-script-runner';
import {
  buildLegadoExploreScriptBundle,
  createLegadoGetArguments,
  createLegadoScriptCache,
  createSourceVariableHandlers,
  getScriptBaseUrl,
  getSourceArgsKey,
  getSourceCookiesKey,
  getLegadoSourceKey,
  hostsFromJsLib,
  loadSourceCookieStore,
  readSourceLoginInfoMap,
} from '@/lib/js-engine/legado/source-script-shared';
import {
  readBookSourceQttoken,
  resolveBookSourceDeviceId,
  resolveBookSourceServerUrl,
} from '@/lib/book-source/source-http';

const SCRIPT_TIMEOUT_MS = 15000;

export type ExploreScriptRunOptions = {
  onScriptToast?: (msg?: unknown, level?: unknown) => void;
};

/** 从 exploreUrl 中提取 <js>...</js> 内的脚本内容 */
export function extractExploreScript(exploreUrl: string | undefined): string | null {
  if (typeof exploreUrl !== 'string') return null;
  const s = exploreUrl.trim();
  if (!s.startsWith('<js>')) return null;
  const end = s.indexOf('</js>');
  if (end === -1) return null;
  return s.slice(4, end).trim();
}

async function tryRunExploreScriptQuickJS(
  scriptContent: string,
  source: BookSource,
  options?: ExploreScriptRunOptions,
): Promise<ExploreSection[] | null> {
  await initQuickJSRuntime();
  if (isQuickJSFallback()) return null;

  const baseUrl = getScriptBaseUrl(source);
  const sourceUrl = getLegadoSourceKey(source);
  const argsKey = getSourceArgsKey(source);
  const cookiesKey = getSourceCookiesKey(source);
  const jsLib =
    typeof (source as Record<string, unknown>).jsLib === 'string'
      ? ((source as Record<string, unknown>).jsLib as string)
      : '';
  const hosts = hostsFromJsLib(jsLib);
  const hostList = hosts.length > 0 ? hosts : baseUrl ? [baseUrl] : [];

  const cookieStore = loadSourceCookieStore(cookiesKey);
  const cookieApi = createLegadoScriptCookieApi(source, baseUrl, cookieStore, { hostList });
  const sourceVars = createSourceVariableHandlers(source, argsKey);

  const fullScript = buildLegadoExploreScriptBundle(jsLib, scriptContent);

  const serverForToken = resolveBookSourceServerUrl(source) ?? baseUrl;
  const toastBuffer: Array<{ msg: unknown; level: unknown }> = [];
  const injector = createExploreInjector({
    baseUrl,
    sourceUrl,
    host: hostList,
    resolveUrl,
    getOrCreateDeviceId: () => resolveBookSourceDeviceId(source),
    getArgToken: () => readBookSourceQttoken(source, serverForToken),
    cookie: cookieApi,
    source: {
      ...sourceVars,
      getLoginInfoMap: () => readSourceLoginInfoMap(source),
    },
    scriptToastBuffer: toastBuffer,
    request: (resolvedUrl, call) => requestInScript(resolvedUrl, { ...call, source }),
  });

  try {
    // two-pass：首轮 ajax 返回空串，次轮走 URL 缓存。suspend 的挂起异常会被书源里 try/catch 吞掉（如 discovestyle）。
    const raw = await runLegadoScriptQuickJS({
      script: fullScript,
      baseUrl,
      timeoutMs: SCRIPT_TIMEOUT_MS,
      mode: 'two-pass',
      inject: injector,
      beforeEval: (vm) => {
        evalCodeVoid(vm, 'globalThis.result = undefined;');
      },
    });
    setTimeout(() => {
      flushExploreScriptToastBuffer(toastBuffer, options?.onScriptToast);
    }, 0);
    const sections = parseScriptResult(raw);
    if (sections.length === 0 && raw != null) {
      const preview =
        typeof raw === 'string'
          ? raw.slice(0, 200)
          : JSON.stringify(raw)?.slice(0, 200);
      console.warn('[explore-script] QuickJS result 未解析出条目', { preview });
    }
    return sections;
  } catch (e) {
    console.warn('[explore-script] QuickJS 失败，降级 Function', e);
    return null;
  }
}

/**
 * 执行发现页脚本，返回解析后的发现子项列表
 */
export async function runExploreScript(
  scriptContent: string,
  source: BookSource,
  options?: ExploreScriptRunOptions,
): Promise<ExploreSection[]> {
  const quick = await tryRunExploreScriptQuickJS(scriptContent, source, options);
  if (quick != null && quick.length > 0) {
    console.log('[explore-script] QuickJS final:', quick.length, 'sections');
    return quick;
  }
  if (quick != null && quick.length === 0) {
    console.warn('[explore-script] QuickJS 返回 0 条，降级 Function');
  }

  return runExploreScriptLegacy(scriptContent, source, options);
}

/** Function + with 降级路径 */
async function runExploreScriptLegacy(
  scriptContent: string,
  source: BookSource,
  options?: ExploreScriptRunOptions,
): Promise<ExploreSection[]> {
  const baseUrl = getScriptBaseUrl(source);
  const argsKey = getSourceArgsKey(source);
  const cookiesKey = getSourceCookiesKey(source);
  const jsLib =
    typeof (source as Record<string, unknown>).jsLib === 'string'
      ? ((source as Record<string, unknown>).jsLib as string)
      : '';

  const hosts = hostsFromJsLib(jsLib);
  const hostList = hosts.length > 0 ? hosts : baseUrl ? [baseUrl] : [];

  const cookieStore = loadSourceCookieStore(cookiesKey);
  const cookieApi = createLegadoScriptCookieApi(source, baseUrl, cookieStore, { hostList });
  const sourceVars = createSourceVariableHandlers(source, argsKey);

  const safeScriptToast = (msg?: unknown, level?: unknown) => {
    queueMicrotask(() => {
      try {
        options?.onScriptToast?.(msg, level);
      } catch (e) {
        console.warn('[explore-script] toast failed', e);
      }
    });
  };

  const ajaxCache = new Map<string, string>();
  const ajaxDurationCache = new Map<string, number>();
  const { PatchedDate, applyAjaxDuration } = installScriptDateShim();
  let pending: Promise<unknown>[] = [];

  const scopeObj: Record<string, unknown> = {
    Date: PatchedDate,
    result: undefined,
    baseUrl,
    host: hostList,
    cache: createLegadoScriptCache(),
    getArguments: createLegadoGetArguments(hostList[0] || baseUrl),
    bhost: () => hostList[0] || baseUrl || '',
    cookie: cookieApi,
    cookieRef: cookieApi,

    source: {
      getVariable: (key?: string) => sourceVars.getVariable(key),
      setVariable: (val?: string) => sourceVars.setVariable(val),
      getLoginInfoMap: () => readSourceLoginInfoMap(source),
    },

    java: {
      toast(msg?: string, level?: string) {
        safeScriptToast(msg, level ?? 'info');
      },
      longToast(msg?: string) {
        safeScriptToast(msg, 'warning');
      },
      log(...args: unknown[]) {
        console.warn('[explore-script]', ...args);
        return args[0];
      },
      androidId: () => resolveBookSourceDeviceId(source),
      deviceID: () => resolveBookSourceDeviceId(source),
      qread() {},
      startBrowser(_url?: string) {},
      getCookie(url: string) {
        return cookieApi.getCookie(url);
      },
      ajax(
        url: string | Record<string, unknown>,
        optionsOrCb?: Record<string, unknown> | ((body: string) => void),
        cb?: (body: string) => void
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
            if (h && typeof h === 'object') headers = { ...headers, ...h };
          }
        } else if (optionsOrCb && typeof optionsOrCb === 'object') {
          method = ((optionsOrCb.method as string) || 'GET').toUpperCase();
          body = optionsOrCb.body as string | undefined;
          const h = optionsOrCb.headers as Record<string, string> | undefined;
          if (h && typeof h === 'object') headers = { ...headers, ...h };
        }

        let urlStr = typeof url === 'string' ? url : '';
        if (!urlStr && url && typeof url === 'object') {
          urlStr = (url as { url?: string }).url ?? (url as { href?: string }).href ?? '';
        }
        if (!urlStr || urlStr.includes('[object Object]')) {
          if (callback) callback('');
          return '';
        }
        const resolvedUrl = resolveUrl(baseUrl, urlStr);

        if (ajaxCache.has(resolvedUrl)) {
          const d = ajaxDurationCache.get(resolvedUrl);
          if (d != null && d >= 0) applyAjaxDuration(d);
          const cached = ajaxCache.get(resolvedUrl)!;
          if (callback) {
            try {
              callback(cached);
            } catch (e) {
              console.warn('[explore-script] ajax callback error:', e);
            }
          }
          return cached;
        }

        const requestStart = Date.now();
        const p = requestInScript(resolvedUrl, {
          method: method as 'GET' | 'POST',
          headers: Object.keys(headers).length ? headers : undefined,
          body,
          source,
        })
          .then((text) => {
            const durationMs = Date.now() - requestStart;
            if (durationMs >= 0) ajaxDurationCache.set(resolvedUrl, durationMs);
            ajaxCache.set(resolvedUrl, text);
            if (callback) {
              try {
                callback(text);
              } catch (e) {
                console.warn('[explore-script] ajax callback error:', e);
              }
            }
          })
          .catch((e) => {
            console.warn('[explore-script] ajax failed:', e);
            const durationMs = Date.now() - requestStart;
            if (durationMs >= 0) ajaxDurationCache.set(resolvedUrl, durationMs);
            ajaxCache.set(resolvedUrl, '');
            if (callback) callback('');
          });
        pending.push(p);
        return '';
      },
    },
    toast(msg?: string, level?: string) {
      safeScriptToast(msg, level ?? 'info');
    },
    longToast(msg?: string) {
      safeScriptToast(msg, 'warning');
    },
  };

  const fullScript = buildLegadoExploreScriptBundle(jsLib, scriptContent);

  const run = new Function(
    '__scope__',
    'scriptText',
    'try { with(__scope__) { eval(scriptText); } } catch (e) { console.warn("[explore-script] run error:", e); }'
  );

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('发现页脚本执行超时')), SCRIPT_TIMEOUT_MS);
  });

  const runPromise = (async () => {
    const maxRounds = 6;
    let prevCacheSize = -1;
    for (let round = 0; round < maxRounds; round++) {
      if (round > 0) {
        scopeObj.result = undefined;
        pending = [];
      }
      run(scopeObj, fullScript);
      const hadAsyncAjax = pending.length > 0;
      if (hadAsyncAjax) await Promise.all(pending);
      // 脚本在 java.ajax 返回空串时已执行 result=JSON.stringify(...)，须等 ajax 入缓存后重跑
      if (scopeObj.result !== undefined) {
        if (hadAsyncAjax && round < maxRounds - 1) {
          scopeObj.result = undefined;
          prevCacheSize = ajaxCache.size;
          continue;
        }
        return scopeObj.result;
      }
      if (ajaxCache.size === 0 || ajaxCache.size === prevCacheSize) break;
      prevCacheSize = ajaxCache.size;
    }
    return scopeObj.result;
  })();

  const raw = await Promise.race([runPromise, timeoutPromise]);
  const sections = parseScriptResult(raw);
  console.log('[explore-script] legacy final:', sections.length, 'sections');
  return sections;
}

async function requestInScript(
  url: string,
  options: {
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    source: BookSource;
  }
): Promise<string> {
  if (options.method === 'POST') {
    return post(url, options.body ?? '', {
      headers: options.headers,
      timeout: 12000,
      enableCookieJar: options.source.enabledCookieJar,
      concurrentRate: options.source.concurrentRate,
    });
  }
  return httpGet(url, {
    headers: options.headers,
    timeout: 12000,
    enableCookieJar: options.source.enabledCookieJar,
    concurrentRate: options.source.concurrentRate,
  });
}

const EXPLORE_LIST_KEYS = [
  'personalCenter',
  'header',
  'top',
  'rankings',
  'categories',
  'tags',
  'list',
  'data',
  'sections',
  'items',
  'children',
];

function flattenToItems(obj: Record<string, unknown>): unknown[] {
  const arr: unknown[] = [];
  for (const key of EXPLORE_LIST_KEYS) {
    const val = obj[key];
    if (Array.isArray(val)) arr.push(...val);
  }
  return arr;
}

function parseScriptResult(raw: unknown): ExploreSection[] {
  if (raw == null) return [];

  let arr: unknown[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        arr = parsed;
      } else if (parsed && typeof parsed === 'object') {
        arr = flattenToItems(parsed as Record<string, unknown>);
        if (arr.length === 0) arr = [parsed];
      } else {
        arr = [parsed];
      }
    } catch {
      return [];
    }
  } else if (typeof raw === 'object') {
    arr = flattenToItems(raw as Record<string, unknown>);
    if (arr.length === 0) arr = [raw];
  }

  const sections: ExploreSection[] = [];
  for (const item of arr) {
    if (item && typeof item === 'object') {
      const mapped = mapRawExploreItem(item as Record<string, unknown>);
      if (mapped) sections.push(mapped);
    }
  }
  return sections;
}
