/**
 * 书籍详情 ruleBookInfo 中的 Legado <js> 规则（如晴天聚合简介块）
 */

import { get as httpGet, post } from '@/lib/http';
import {
  buildSourceRequestHeaders,
  getOrCreateAndroidId,
  resolveBookSourceServerUrl,
  resolveSourceCookiesForHttp,
} from '@/lib/book-source/source-http';
import {
  getStoredSourceCookiesForUrl,
} from '@/lib/js-engine/legado/login-script-runner';
import {
  mergeAjaxCookieHeaders,
  mergeLegadoCookieHeaderStrings,
  normalizeLegadoCookieHeader,
} from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { resolveUrl } from '@/lib/book-source/utils';
import type { BookSource } from '@/types';
import {
  evalCodeVoid,
  initQuickJSRuntime,
  isQuickJSFallback,
  setGlobalJson,
} from '@/lib/js-engine/core/runtime';
import { createExploreInjector } from '@/lib/js-engine/legado/explore-inject';
import { runLegadoScriptQuickJS } from '@/lib/js-engine/legado/quickjs-runner';
import {
  createSourceVariableHandlers,
  EXPLORE_JSLIB_CONTEXT_SHIM,
  getScriptBaseUrl,
  getSourceArgsKey,
  getSourceCookiesKey,
  getSourceUrlIdentifier,
  hostsFromJsLib,
  loadSourceCookieStore,
  readSourceLoginInfoMap,
} from '@/lib/js-engine/legado/source-script-shared';
const SCRIPT_TIMEOUT_MS = 20000;

function extractJsRule(rule: string): string | null {
  const s = rule.trim();
  if (!s.startsWith('<js>')) return null;
  const end = s.indexOf('</js>');
  if (end === -1) return null;
  return s.slice(4, end).trim();
}

function readArgToken(argsKey: string): string {
  try {
    const raw = localStorage.getItem(argsKey);
    if (!raw) return '';
    return String((JSON.parse(raw) as Record<string, string>).qttoken ?? '').trim();
  } catch {
    return '';
  }
}

function createCookieApi(
  source: BookSource,
  baseUrl: string,
  hostList: string[],
  store: Map<string, string>,
) {
  return {
    getCookie(url: string): string {
      const k = (url || baseUrl).trim();
      const fromStore = getStoredSourceCookiesForUrl(source, k);
      if (fromStore) return fromStore;
      for (const h of hostList) {
        const merged = getStoredSourceCookiesForUrl(source, h);
        if (merged) return merged;
      }
      const fromResolver = resolveSourceCookiesForHttp(source, k);
      if (fromResolver) return fromResolver;
      let s = store.get(k) ?? '';
      if (!s && k.startsWith('http')) {
        try {
          s = store.get(new URL(k).origin) ?? store.get(k) ?? '';
        } catch {
          /* ignore */
        }
      }
      return s ? normalizeLegadoCookieHeader(s, getOrCreateAndroidId()) : '';
    },
    setCookie(url: string, value: string): void {
      store.set(url || baseUrl, value);
    },
    removeCookie(url: string): void {
      store.delete(url || baseUrl);
    },
    getKey(cookieStrOrUrl: string, keyName?: string): string {
      let s: string;
      if (keyName != null && keyName !== '') {
        s = this.getCookie(cookieStrOrUrl);
      } else {
        s = String(cookieStrOrUrl ?? '').trim();
      }
      if (!s) return '';
      const searchKey = keyName != null && keyName !== '' ? keyName : 'qttoken';
      for (const part of s.split(';')) {
        const trimmed = part.trim();
        if (trimmed.includes(searchKey)) {
          const eq = trimmed.indexOf('=');
          return eq >= 0 ? trimmed.slice(eq + 1).trim() : '';
        }
      }
      return '';
    },
  };
}

function ensureIntroScriptReturns(script: string): string {
  const body = script.trim();
  if (/\breturn\s+/.test(body)) return body;
  return `${body}\nreturn info;`;
}

async function requestInScript(
  resolvedUrl: string,
  call: { method?: string; body?: string; headers?: Record<string, string>; source: BookSource },
  source: BookSource,
): Promise<string> {
  const method = (call.method ?? 'GET').toUpperCase();
  const scriptHeaders = call.headers ?? {};
  const deviceId = getOrCreateAndroidId();
  let headers = buildSourceRequestHeaders(source, resolvedUrl);
  const scriptCookie = String(
    scriptHeaders.Cookie ?? scriptHeaders.cookie ?? '',
  ).trim();
  const storedCookie = String(headers.Cookie ?? '').trim();
  const mergedCookie = normalizeLegadoCookieHeader(
    mergeLegadoCookieHeaderStrings(storedCookie, scriptCookie),
    deviceId,
  );
  headers = mergeAjaxCookieHeaders(
    { ...headers, ...scriptHeaders },
    mergedCookie,
  );

  const common = {
    headers,
    enableCookieJar: source.enabledCookieJar,
    concurrentRate: source.concurrentRate,
    timeout: SCRIPT_TIMEOUT_MS,
    allowNon2xx: true,
  };

  if (method === 'POST') {
    return post(resolvedUrl, call.body ?? '', common);
  }
  return httpGet(resolvedUrl, common);
}

/**
 * 执行 ruleBookInfo.intro 的 Legado JS（result = 详情 API 的 data 对象）
 */
export async function runBookInfoIntroScript(
  source: BookSource,
  detailData: Record<string, unknown>,
  detailUrl: string,
  bookUrl: string,
  options?: { durChapterTitle?: string },
): Promise<string | undefined> {
  const introRule = source.ruleBookInfo?.intro;
  const scriptContent = introRule ? extractJsRule(introRule) : null;
  if (!scriptContent) return undefined;

  await initQuickJSRuntime();
  if (isQuickJSFallback()) {
    console.warn('[book-info-script] QuickJS 不可用，跳过 Legado 简介脚本');
    return undefined;
  }

  const baseUrl =
    resolveBookSourceServerUrl(source) ||
    getScriptBaseUrl(source) ||
    (() => {
      try {
        return new URL(detailUrl).origin;
      } catch {
        return detailUrl;
      }
    })();
  const sourceUrl = getSourceUrlIdentifier(source);
  const argsKey = getSourceArgsKey(source);
  const cookiesKey = getSourceCookiesKey(source);
  const jsLib =
    typeof (source as Record<string, unknown>).jsLib === 'string'
      ? ((source as Record<string, unknown>).jsLib as string)
      : '';
  const hosts = hostsFromJsLib(jsLib);
  const hostList = hosts.length > 0 ? hosts : [new URL(detailUrl).origin];

  const cookieStore = loadSourceCookieStore(cookiesKey);
  const cookieApi = createCookieApi(source, baseUrl, hostList, cookieStore);
  const sourceVars = createSourceVariableHandlers(source, argsKey);

  const durTitle = options?.durChapterTitle ?? '';
  const loginInfo = readSourceLoginInfoMap(source);

  const body = ensureIntroScriptReturns(scriptContent);
  const fullScript = [
    jsLib ? jsLib + '\n' : '',
    EXPLORE_JSLIB_CONTEXT_SHIM,
    body,
  ].join('\n');

  const injector = createExploreInjector({
    baseUrl,
    sourceUrl,
    host: hostList,
    resolveUrl,
    getOrCreateDeviceId: getOrCreateAndroidId,
    getArgToken: () => readArgToken(argsKey),
    getFormKey: () => String(loginInfo['密钥'] ?? '').trim(),
    cookie: cookieApi,
    source: {
      ...sourceVars,
      getLoginInfoMap: () => readSourceLoginInfoMap(source),
    },
    request: (resolvedUrl, call) =>
      requestInScript(resolvedUrl, { ...call, source }, source),
  });

  try {
    const raw = await runLegadoScriptQuickJS({
      script: fullScript,
      baseUrl: bookUrl,
      timeoutMs: SCRIPT_TIMEOUT_MS,
      mode: 'suspend',
      inject: (vm, rt) => {
        injector(vm, rt);
        evalCodeVoid(
          vm,
          `globalThis.__readerPutStore = globalThis.__readerPutStore || {};
if (typeof globalThis.java === 'object' && globalThis.java) {
  globalThis.java.put = function(k, v) {
    globalThis.__readerPutStore[String(k)] = String(v);
  };
  globalThis.java.get = function(k) {
    return globalThis.__readerPutStore[String(k)] || '';
  };
}`,
        );
        setGlobalJson(vm, 'result', detailData);
        const bookHandle = vm.newObject();
        const setProp = (key: string, val: string) => {
          const h = vm.newString(val);
          vm.setProp(bookHandle, key, h);
          h.dispose();
        };
        setProp('durChapterTitle', durTitle);
        vm.setProp(vm.global, 'book', bookHandle);
        bookHandle.dispose();
        evalCodeVoid(
          vm,
          `globalThis.book.readConfig = null;
globalThis.book.getVariable = function(k){ return ''; };
globalThis.book.setUseReplaceRule = function(v){
  globalThis.book.readConfig = globalThis.book.readConfig || {};
  globalThis.book.readConfig.useReplaceRule = v;
};`,
        );
      },
      beforeEval: (vm) => {
        setGlobalJson(vm, 'result', detailData);
      },
    });

    if (raw == null) return undefined;
    if (typeof raw === 'string') {
      const t = raw.trim();
      return t || undefined;
    }
    if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
    if (typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      if ('book_name' in o || 'book_id' in o) {
        console.warn(
          '[book-info-script] 脚本返回了详情 JSON 对象而非简介文本，将使用字段回退',
        );
        return undefined;
      }
    }
    return JSON.stringify(raw);
  } catch (e) {
    console.warn('[book-info-script] 简介脚本执行失败:', e);
    return undefined;
  }
}
