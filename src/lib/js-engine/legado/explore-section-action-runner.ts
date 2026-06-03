/**
 * 发现页 button/text action 执行（对齐 Legado ExploreAdapter.evalButtonClick）
 */

import type { BookSource } from '@/types';
import { resolveUrl } from '@/lib/book-source/utils';
import { initQuickJSRuntime, isQuickJSFallback, setGlobalJson } from '@/lib/js-engine/core/runtime';
import { installScriptDateShim } from '@/lib/js-engine/legado/script-date-shim';
import { createLegadoExploreJavaDeviceHandlers } from '@/lib/js-engine/legado/legado-explore-java-device';
import {
  createExploreInjector,
  flushExploreScriptToastBuffer,
  type ScriptToastEntry,
} from '@/lib/js-engine/legado/explore-inject';
import { runLegadoScriptQuickJS } from '@/lib/js-engine/legado/quickjs-runner';
import {
  createLegadoScriptCookieApi,
  getStoredSourceCookiesForInnerWeb,
} from '@/lib/js-engine/legado/login-script-runner';
import {
  buildLegadoExploreScriptBundle,
  createSourceVariableHandlers,
  getLegadoSourceKey,
  getScriptBaseUrl,
  getSourceArgsKey,
  getSourceCookiesKey,
  hostsFromJsLib,
  loadSourceCookieStore,
  readSourceLoginInfoMap,
} from '@/lib/js-engine/legado/source-script-shared';
import {
  readBookSourceQttoken,
  resolveBookSourceDeviceId,
  resolveBookSourceServerUrl,
} from '@/lib/book-source/source-http';
import { openLegadoBrowserInApp } from '@/lib/platform/open-url';
import { get as httpGet, post } from '@/lib/http';

const SCRIPT_TIMEOUT_MS = 15000;

function resolveExploreBrowserUrl(raw: string, baseUrl: string): string {
  const t = raw.trim();
  if (/^(https?:|data:|legado:|yuedu:)/i.test(t)) return t;
  return baseUrl && t ? resolveUrl(baseUrl, t) : t;
}

function isOpenableBrowserUrl(url: string): boolean {
  return /^(https?:|data:)/i.test(url.trim());
}

function persistCookieStore(cookiesKey: string, cookieStore: Map<string, string>): void {
  try {
    const obj: Record<string, string> = {};
    cookieStore.forEach((v, k) => {
      obj[k] = v;
    });
    if (Object.keys(obj).length > 0) {
      localStorage.setItem(cookiesKey, JSON.stringify(obj));
    }
  } catch (e) {
    console.warn('[explore-action] persist cookies failed', e);
  }
}

export type RunExploreSectionActionOptions = {
  infoMap?: Record<string, string>;
  onScriptToast?: (msg?: unknown, level?: unknown) => void;
  onRefreshExplore?: () => void | Promise<void>;
  onOpenSearch?: (query: string, source: BookSource) => void;
};

async function requestInScript(
  url: string,
  options: {
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    source: BookSource;
  },
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

/** 执行发现项 action（如 getCloudSettings(true) / getHtmlSettings()） */
export async function runExploreSectionAction(
  source: BookSource,
  action: string,
  options?: RunExploreSectionActionOptions,
): Promise<void> {
  const actionTrim = action.trim();
  if (!actionTrim) return;

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
  const serverForToken = resolveBookSourceServerUrl(source) ?? baseUrl;

  const cookieStore = loadSourceCookieStore(cookiesKey);
  const cookieApi = createLegadoScriptCookieApi(source, baseUrl, cookieStore, { hostList });
  const sourceVars = createSourceVariableHandlers(source, argsKey);
  const infoMap = { ...(options?.infoMap ?? {}) };

  const toastBuffer: ScriptToastEntry[] = [];
  const pendingBrowsers: Promise<unknown>[] = [];

  const openInnerWeb = (resolved: string, title?: string) => {
    if (!isOpenableBrowserUrl(resolved)) return;
    const cookies = getStoredSourceCookiesForInnerWeb(source, resolved);
    pendingBrowsers.push(
      openLegadoBrowserInApp(resolved, cookies, title?.trim(), {
        bookSourceUrl: source.bookSourceUrl,
      }),
    );
  };

  const refreshExplore = options?.onRefreshExplore;
  const onOpenSearch = options?.onOpenSearch
    ? (query: string) => options.onOpenSearch!(query, source)
    : undefined;

  await initQuickJSRuntime();
  if (isQuickJSFallback()) {
    await runExploreSectionActionLegacy(source, actionTrim, {
      baseUrl,
      argsKey,
      cookiesKey,
      jsLib,
      hostList,
      serverForToken,
      infoMap,
      onScriptToast: options?.onScriptToast,
      onRefreshExplore: refreshExplore,
      onOpenSearch,
    });
    return;
  }

  const initScript = buildLegadoExploreScriptBundle(jsLib, '/* explore-action-init */');

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
      loginUi: source.loginUi,
    },
    scriptToastBuffer: toastBuffer,
    infoMap,
    onRefreshExplore: refreshExplore,
    onOpenSearch,
    javaExtensions: {
      startBrowser: (url, title) => {
        const resolved = resolveExploreBrowserUrl(String(url ?? '').trim(), baseUrl);
        openInnerWeb(resolved, title);
      },
      showBrowser: (url, html, _preloadJs, _config) => {
        const rawUrl = String(url ?? '').trim();
        if (html && String(html).length > 0) {
          const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(String(html))}`;
          openInnerWeb(dataUrl, rawUrl || '书源设置');
          return;
        }
        const resolved = resolveExploreBrowserUrl(rawUrl, baseUrl);
        openInnerWeb(resolved, rawUrl);
      },
    },
    request: (resolvedUrl, call) => requestInScript(resolvedUrl, { ...call, source }),
  });

  try {
    await runLegadoScriptQuickJS({
      initScript,
      script: actionTrim,
      baseUrl,
      timeoutMs: SCRIPT_TIMEOUT_MS,
      mode: 'suspend',
      inject: (vm, rt) => {
        injector(vm, rt);
        setGlobalJson(vm, 'infoMap', infoMap);
      },
    });
    await Promise.all(pendingBrowsers);
    persistCookieStore(cookiesKey, cookieStore);
  } catch (e) {
    console.warn('[explore-action] action 执行失败', e);
    throw e;
  } finally {
    setTimeout(() => {
      flushExploreScriptToastBuffer(toastBuffer, options?.onScriptToast);
    }, 0);
  }
}

/** Function + with 降级（QuickJS 不可用时） */
async function runExploreSectionActionLegacy(
  source: BookSource,
  actionTrim: string,
  ctx: {
    baseUrl: string;
    argsKey: string;
    cookiesKey: string;
    jsLib: string;
    hostList: string[];
    serverForToken: string;
    infoMap: Record<string, string>;
    onScriptToast?: (msg?: unknown, level?: unknown) => void;
    onRefreshExplore?: () => void | Promise<void>;
    onOpenSearch?: (query: string) => void;
  },
): Promise<void> {
  const cookieStore = loadSourceCookieStore(ctx.cookiesKey);
  const cookieApi = createLegadoScriptCookieApi(source, ctx.baseUrl, cookieStore, {
    hostList: ctx.hostList,
  });
  const sourceVars = createSourceVariableHandlers(source, ctx.argsKey);
  const { PatchedDate } = installScriptDateShim();
  const deviceHandlers = createLegadoExploreJavaDeviceHandlers(source);
  const pendingBrowsers: Promise<unknown>[] = [];

  const openInnerWeb = (resolved: string, title?: string) => {
    if (!isOpenableBrowserUrl(resolved)) return;
    const cookies = getStoredSourceCookiesForInnerWeb(source, resolved);
    pendingBrowsers.push(
      openLegadoBrowserInApp(resolved, cookies, title?.trim(), {
        bookSourceUrl: source.bookSourceUrl,
      }),
    );
  };

  const scopeObj: Record<string, unknown> = {
    Date: PatchedDate,
    baseUrl: ctx.baseUrl,
    host: ctx.hostList,
    infoMap: ctx.infoMap,
    cookie: cookieApi,
    source: {
      getVariable: (key?: string) => sourceVars.getVariable(key),
      setVariable: (val?: string) => sourceVars.setVariable(val),
      getLoginInfoMap: () => readSourceLoginInfoMap(source),
      loginUi: source.loginUi,
    },
    java: {
      toast: (msg?: string) => ctx.onScriptToast?.(msg, 'info'),
      longToast: (msg?: string) => ctx.onScriptToast?.(msg, 'warning'),
      log: (...args: unknown[]) => {
        console.warn('[explore-action]', ...args);
        return args[0];
      },
      androidId: () => deviceHandlers.androidId(),
      deviceID: () => deviceHandlers.deviceID(),
      qread: () => deviceHandlers.qread(),
      refreshExplore: () => {
        void ctx.onRefreshExplore?.();
      },
      openBookSearch: (key?: string) => {
        const q = String(key ?? '').trim();
        if (q) ctx.onOpenSearch?.(q);
      },
      startBrowser: (url?: string, title?: string) => {
        openInnerWeb(resolveExploreBrowserUrl(String(url ?? '').trim(), ctx.baseUrl), title);
      },
      showBrowser: (url?: string, html?: string | null) => {
        const rawUrl = String(url ?? '').trim();
        if (html && String(html).length > 0) {
          openInnerWeb(
            `data:text/html;charset=utf-8,${encodeURIComponent(String(html))}`,
            rawUrl || '书源设置',
          );
          return;
        }
        openInnerWeb(resolveExploreBrowserUrl(rawUrl, ctx.baseUrl), rawUrl);
      },
      getCookie: (url: string) => cookieApi.getCookie(url),
      ajax: () => '',
    },
  };

  const fullScript = buildLegadoExploreScriptBundle(ctx.jsLib, actionTrim);
  const run = new Function(
    '__scope__',
    'scriptText',
    'try { with(__scope__) { eval(scriptText); } } catch (e) { console.warn("[explore-action] legacy:", e); throw e; }',
  );
  run(scopeObj, fullScript);
  await Promise.all(pendingBrowsers);
  persistCookieStore(ctx.cookiesKey, cookieStore);
}
