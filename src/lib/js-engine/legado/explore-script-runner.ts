/**
 * 前端执行 legado 风格发现页脚本（<js>...</js>）
 * 优先 QuickJS + 集中宿主 API；WASM 不可用时降级 with + Function。
 */

import { getBookSourcePage, postBookSourcePage } from '@/lib/book-source/source-http-cf';
import { resolveUrl } from '@/lib/book-source/utils';
import type { BookSource } from '@/types';
import { mapRawExploreItem, type ExploreSection } from '@/lib/book-source/explore-sections';
import { evalCodeVoid, initQuickJSRuntime, isQuickJSFallback } from '@/lib/js-engine/core/runtime';
import { createExploreInjector, flushExploreScriptToastBuffer } from '@/lib/js-engine/legado/explore-inject';
import { createLegacyJavaAjax } from '@/lib/js-engine/legado/host/legacy-java-ajax';
import { parseLegadoApiJsonResponse } from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { runLegadoScriptQuickJS } from '@/lib/js-engine/legado/quickjs-runner';
import { installScriptDateShim } from '@/lib/js-engine/legado/script-date-shim';
import {
  createLegadoScriptCookieApi,
} from '@/lib/js-engine/legado/login-script-runner';
import {
  createLegadoExploreJavaDeviceHandlers,
  LEGADO_EXPLORE_DEVICE_JAVA_SHIM,
} from '@/lib/js-engine/legado/legado-explore-java-device';
import {
  buildLegadoExploreScriptBundle,
  createLegadoGetArguments,
  createLegadoScriptCache,
  createSourceVariableHandlers,
  getLegadoSourceKey,
  getScriptBaseUrl,
  getSourceArgsKey,
  getSourceCookiesKey,
  hostsFromJsLib,
  loadSourceCookieStore,
  buildLegadoScriptSourceFace,
} from '@/lib/js-engine/legado/source-script-shared';
import {
  readBookSourceQttoken,
  resolveBookSourceDeviceId,
  resolveBookSourceServerUrl,
} from '@/lib/book-source/source-http';

const SCRIPT_TIMEOUT_MS = 30_000;

export type ExploreScriptRunOptions = {
  onScriptToast?: (msg?: unknown, level?: unknown) => void;
};

/** 从 exploreUrl 中提取 @js: / <js>...</js> 内的脚本内容 */
export function extractExploreScript(exploreUrl: string | undefined): string | null {
  if (typeof exploreUrl !== 'string') return null;
  const s = exploreUrl.trim();
  if (/^@js:/i.test(s)) return s.replace(/^@js:/i, '').trim() || null;
  if (!s.startsWith('<js>')) return null;
  const end = s.indexOf('</js>');
  if (end === -1) return null;
  return s.slice(4, end).trim();
}

function logExploreScriptDiagnostics(sections: ExploreSection[], engine: 'quickjs' | 'legacy'): void {
  if (!import.meta.env.DEV) return;
  const selectTitles = sections.filter((s) => s.type === 'select').map((s) => s.title);
  const hasSigma = sections.some((s) => s.title.includes('Sigma'));
  const hasLoginSwitch = sections.some((s) => s.title.includes('点击登录可切换来源'));
  const textCount = sections.filter((s) => s.type === 'text').length;
  const buttonActions = sections.filter((s) => s.type === 'button' && s.action).length;
  console.log(`[explore-script] ${engine} parsed`, {
    total: sections.length,
    selects: selectTitles.length,
    selectTitles: selectTitles.slice(0, 6),
    textCount,
    buttonActions,
    hasSigma,
    hasLoginSwitch,
    head: sections.slice(0, 8).map((s) => `${s.title}${s.type ? `[${s.type}]` : ''}`),
  });
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
    source: buildLegadoScriptSourceFace(source, sourceVars, sourceUrl),
    scriptToastBuffer: toastBuffer,
    request: (resolvedUrl, call) => requestInScript(resolvedUrl, { ...call, source }),
  });

  try {
    const expectsDiscovestyle = scriptContent.includes(GYKS_DISCOVERSTYLE_MARKER);
    // two-pass：首轮 ajax 返回 pending，次轮走 URL 缓存。suspend 的挂起异常会被书源里 try/catch 吞掉（如 discovestyle）。
    const raw = await runLegadoScriptQuickJS({
      script: fullScript,
      baseUrl,
      timeoutMs: SCRIPT_TIMEOUT_MS,
      mode: 'two-pass',
      twoPassMaxRounds: expectsDiscovestyle ? 10 : 6,
      twoPassContinueWhile: expectsDiscovestyle
        ? (result, { round, maxRounds, hadPending }) => {
            const sectionCount = parseScriptResult(result).length;
            const incomplete = sectionCount < GYKS_DISCOVERSTYLE_MIN_SECTIONS;
            return round < maxRounds - 1 && (hadPending || incomplete);
          }
        : undefined,
      inject: injector,
      beforeEval: (vm) => {
        evalCodeVoid(vm, 'globalThis.result = undefined;');
        evalCodeVoid(vm, LEGADO_EXPLORE_DEVICE_JAVA_SHIM);
      },
    });
    const sections = parseScriptResult(raw);
    logExploreScriptDiagnostics(sections, 'quickjs');
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
  } finally {
    setTimeout(() => {
      flushExploreScriptToastBuffer(toastBuffer, options?.onScriptToast);
    }, 0);
  }
}

/**
 * 执行发现页脚本，返回解析后的发现子项列表
 */
const GYKS_DISCOVERSTYLE_MARKER = 'discovestyle';
/** 含 discovestyle 时仅 qtsj 筛选条数会落在该区间 */
const GYKS_DISCOVERSTYLE_MIN_SECTIONS = 20;

export async function runExploreScript(
  scriptContent: string,
  source: BookSource,
  options?: ExploreScriptRunOptions,
): Promise<ExploreSection[]> {
  const expectsDiscovestyle = scriptContent.includes(GYKS_DISCOVERSTYLE_MARKER);

  // discovestyle 依赖多轮 ajax 缓存；QuickJS two-pass 在 hadPending=false 时会过早返回 8 条
  if (!expectsDiscovestyle) {
    const quick = await tryRunExploreScriptQuickJS(scriptContent, source, options);
    if (quick != null && quick.length > 0) {
      console.log('[explore-script] QuickJS final:', quick.length, 'sections');
      return quick;
    }
    if (quick != null && quick.length === 0) {
      console.warn('[explore-script] QuickJS 返回 0 条，降级 Function');
    }
  } else {
    const quick = await tryRunExploreScriptQuickJS(scriptContent, source, options);
    if (quick != null && quick.length >= GYKS_DISCOVERSTYLE_MIN_SECTIONS) {
      console.log('[explore-script] QuickJS final:', quick.length, 'sections');
      return quick;
    }
    if (quick != null && quick.length > 0) {
      console.warn(
        `[explore-script] QuickJS 仅 ${quick.length} 条（discovestyle 可能未加载），降级 Function`,
      );
    } else if (quick != null && quick.length === 0) {
      console.warn('[explore-script] QuickJS 返回 0 条，降级 Function');
    }
  }

  const raw = await runExploreScriptLegacyRaw(scriptContent, source, options);
  const sections = parseScriptResult(raw);
  logExploreScriptDiagnostics(sections, 'legacy');
  console.log('[explore-script] legacy final:', sections.length, 'sections');
  return sections;
}

/** 执行发现脚本并返回原始结果（用于 sortUrl 等需解析纯文本的场景） */
export async function runExploreScriptRawValue(
  scriptContent: string,
  source: BookSource,
  options?: ExploreScriptRunOptions,
): Promise<unknown> {
  const expectsDiscovestyle = scriptContent.includes(GYKS_DISCOVERSTYLE_MARKER);
  if (!expectsDiscovestyle) {
    const quickRaw = await tryRunExploreScriptQuickJSRaw(scriptContent, source, options);
    if (quickRaw !== undefined) return quickRaw;
  }
  return runExploreScriptLegacyRaw(scriptContent, source, options);
}

async function tryRunExploreScriptQuickJSRaw(
  scriptContent: string,
  source: BookSource,
  options?: ExploreScriptRunOptions,
): Promise<unknown | undefined> {
  await initQuickJSRuntime();
  if (isQuickJSFallback()) return undefined;

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
    source: buildLegadoScriptSourceFace(source, sourceVars, sourceUrl),
    scriptToastBuffer: toastBuffer,
    request: (resolvedUrl, call) => requestInScript(resolvedUrl, { ...call, source }),
  });

  try {
    const expectsDiscovestyle = scriptContent.includes(GYKS_DISCOVERSTYLE_MARKER);
    const raw = await runLegadoScriptQuickJS({
      script: fullScript,
      baseUrl,
      timeoutMs: SCRIPT_TIMEOUT_MS,
      mode: 'two-pass',
      twoPassMaxRounds: expectsDiscovestyle ? 10 : 6,
      twoPassContinueWhile: expectsDiscovestyle
        ? (result, { round, maxRounds, hadPending }) => {
            const sectionCount = parseScriptResult(result).length;
            const incomplete = sectionCount < GYKS_DISCOVERSTYLE_MIN_SECTIONS;
            return round < maxRounds - 1 && (hadPending || incomplete);
          }
        : undefined,
      inject: injector,
      beforeEval: (vm) => {
        evalCodeVoid(vm, 'globalThis.result = undefined;');
        evalCodeVoid(vm, LEGADO_EXPLORE_DEVICE_JAVA_SHIM);
      },
    });
    return raw;
  } catch {
    return undefined;
  } finally {
    setTimeout(() => {
      flushExploreScriptToastBuffer(toastBuffer, options?.onScriptToast);
    }, 0);
  }
}

/** Function + with 降级路径 */
async function runExploreScriptLegacyRaw(
  scriptContent: string,
  source: BookSource,
  options?: ExploreScriptRunOptions,
): Promise<unknown> {
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

  const deviceHandlers = createLegadoExploreJavaDeviceHandlers(source);
  const serverForToken = resolveBookSourceServerUrl(source) ?? baseUrl;

  const logDiscovestyleAjax = import.meta.env.DEV
    ? (resolvedUrl: string, body: string, fromCache: boolean) => {
        if (!resolvedUrl.includes('discovestyle')) return;
        const parsed = parseLegadoApiJsonResponse(body);
        const data = parsed?.data;
        const dataLen = Array.isArray(data) ? data.length : -1;
        console.log('[explore-script] discovestyle ajax', {
          fromCache,
          bodyLen: body.length,
          dataLen,
          url: resolvedUrl.slice(0, 120),
        });
      }
    : undefined;

  const scopeObj: Record<string, unknown> = {
    Date: PatchedDate,
    result: undefined,
    baseUrl,
    host: hostList,
    cache: createLegadoScriptCache(),
    getArguments: createLegadoGetArguments(hostList[0] || baseUrl),
    bhost: () => hostList[0] || baseUrl || '',
    infoMap: {} as Record<string, string>,
    cookie: cookieApi,
    cookieRef: cookieApi,

    source: buildLegadoScriptSourceFace(source, sourceVars, sourceUrl),

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
      androidId: () => deviceHandlers.androidId(),
      deviceID: () => deviceHandlers.deviceID(),
      qread: () => deviceHandlers.qread(),
      reLoginView() {
        /* 光遇 checkEnv */
      },
      startBrowser(_url?: string) {},
      getCookie(url: string) {
        return cookieApi.getCookie(url);
      },
      ajax: createLegacyJavaAjax({
        baseUrl,
        resolveUrl,
        getCookie: (url) => cookieApi.getCookie(url),
        request: (resolvedUrl, call) => requestInScript(resolvedUrl, { ...call, source }),
        applyDuration: applyAjaxDuration,
        getArgToken: () => readBookSourceQttoken(source, serverForToken),
        getDeviceId: () => resolveBookSourceDeviceId(source),
        cache: ajaxCache,
        durationCache: ajaxDurationCache,
        pending,
        onFailed: (url, err) => {
          if (import.meta.env.DEV && url.includes('discovestyle')) {
            console.warn('[explore-script] discovestyle ajax failed:', url, err);
          } else {
            console.warn('[explore-script] ajax failed:', err);
          }
        },
        onResolved: logDiscovestyleAjax,
      }),
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

  /** ensureExploreScriptSetsResult 写入 globalThis.result；with 作用域内 scope.result 不会自动同步 */
  const pullLegacyExploreScriptResult = (scopeResult: unknown): unknown => {
    if (scopeResult !== undefined && scopeResult !== null) return scopeResult;
    const g = globalThis as { result?: unknown };
    const fromGlobal = g.result;
    if (fromGlobal !== undefined && fromGlobal !== null) {
      g.result = undefined;
      return fromGlobal;
    }
    return scopeResult;
  };

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('发现页脚本执行超时')), SCRIPT_TIMEOUT_MS);
  });

  const runPromise = (async () => {
    const expectsDiscovestyle = scriptContent.includes(GYKS_DISCOVERSTYLE_MARKER);
    const maxRounds = expectsDiscovestyle ? 10 : 6;
    let prevCacheSize = -1;
    for (let round = 0; round < maxRounds; round++) {
      if (round > 0) {
        scopeObj.result = undefined;
        pending = [];
      }
      run(scopeObj, fullScript);
      scopeObj.result = pullLegacyExploreScriptResult(scopeObj.result);
      const hadAsyncAjax = pending.length > 0;
      if (hadAsyncAjax) await Promise.all(pending);
      // 脚本在 java.ajax 返回空串时已执行 result=JSON.stringify(...)，须等 ajax 入缓存后重跑
      if (scopeObj.result !== undefined) {
        const expectsDiscovestyle = scriptContent.includes(GYKS_DISCOVERSTYLE_MARKER);
        const sectionCount = parseScriptResult(scopeObj.result).length;
        const discovestyleIncomplete =
          expectsDiscovestyle && sectionCount < GYKS_DISCOVERSTYLE_MIN_SECTIONS;
        if (round < maxRounds - 1 && (hadAsyncAjax || discovestyleIncomplete)) {
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

  return Promise.race([runPromise, timeoutPromise]);
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
  const httpOpts = {
    headers: options.headers,
    timeout: 12_000,
  };
  if (options.method === 'POST') {
    return postBookSourcePage(options.source, url, options.body ?? '', httpOpts);
  }
  return getBookSourcePage(options.source, url, httpOpts);
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
