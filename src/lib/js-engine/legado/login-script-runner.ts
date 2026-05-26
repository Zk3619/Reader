/**
 * 书源登录脚本执行环境（Legado with-scope + java.ajax 挂起/恢复）
 * 提供：result、baseUrl、host、source.getLoginInfo/putLoginInfo、getArgument/setArgument、
 * cookie、java（ajax、toast、longToast、androidId、startBrowserAwait）
 */

import type { QuickJSContext } from 'quickjs-emscripten';
import { invoke } from '@tauri-apps/api/core';
import { get as httpGet, post, request as httpRequest } from '@/lib/http';
import { deleteCookie } from '@/lib/http/cookie-manager';
import { resolveUrl } from '@/lib/book-source/utils';
import type { BookSource } from '@/types';
import { openLegadoBrowserInApp, openSourceSettingsInApp } from '@/lib/platform/open-url';
import { initQuickJSRuntime, isQuickJSFallback, LEGADO_SUSPEND_MARKER, setGlobalJson } from '@/lib/js-engine/core/runtime';
import {
  isUserApiPost,
  mergeAjaxCookieHeaders,
  normalizeControlSettingsCookieHeader,
  normalizeLegadoCookieHeader,
  mergeLegadoCookieHeaderStrings,
  normalizeUserApiPostBody,
  resolveUserApiCookieHeader,
} from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { createLoginInjector } from '@/lib/js-engine/legado/login-inject';
import { runLegadoScriptQuickJS } from '@/lib/js-engine/legado/quickjs-runner';
import { handleReaderImportDeepLink } from '@/lib/platform/legado-import-uri';
import { legadoLoginScriptForReplay, wrapLegadoCatchRethrow } from '@/lib/js-engine/legado/script-wrap';
import {
  getScriptBaseUrl,
  getSourceUrlIdentifier,
  STORAGE_PREFIX_ARGS,
  STORAGE_PREFIX_COOKIES,
  storageKey,
} from '@/lib/js-engine/legado/source-script-shared';
import { installScriptDateShim } from '@/lib/js-engine/legado/script-date-shim';
import { SuspendScript } from '@/lib/js-engine/legado/suspend-script';

const SCRIPT_TIMEOUT_MS = 20000;
/** startBrowserAwait 挂起索引（与 ajax writeIndex 区分，避免写入 ajax 回放队列） */
const BROWSER_SUSPEND_WRITE_INDEX = -1;
const STORAGE_PREFIX_LOGIN = 'reader_source_login_';
const ANDROID_ID_KEY = 'reader_login_android_id';

const LOG_TAG = '[login-script]';

/** Legado 格式：java.startBrowser 可能传入 "url,{json}"，只取逗号前的 URL 用于打开 */
function urlForOpen(url: string): string {
  const s = String(url ?? '').trim();
  const comma = s.indexOf(',');
  return comma > 0 ? s.slice(0, comma).trim() : s;
}

/** control() 重放时避免用 source.getVariable() 的旧 cookie 覆盖 WebView √ 同步结果 */
interface BrowserCookieSyncGuard {
  recordSync(resolved: string): void;
  markAwaitDone(): void;
  shouldSkipOverwrite(url: string): boolean;
}

function createBrowserCookieSyncGuard(baseUrl: string): BrowserCookieSyncGuard {
  let syncedResolved: string | null = null;
  let awaitDone = false;
  return {
    recordSync(resolved: string) {
      syncedResolved = resolved;
    },
    markAwaitDone() {
      awaitDone = true;
    },
    shouldSkipOverwrite(url: string): boolean {
      if (!awaitDone || !syncedResolved) return false;
      const target = (url || '').trim() || baseUrl;
      if (!target) return false;
      if (target === syncedResolved) return true;
      const controlBase = syncedResolved.replace(/\/control\/?$/i, '');
      if (controlBase && target === controlBase) return true;
      try {
        const a = new URL(target);
        const b = new URL(syncedResolved);
        if (a.origin === b.origin) return true;
      } catch {
        /* ignore */
      }
      if (target === baseUrl) return true;
      return false;
    },
  };
}

function syncWebViewCookiesToStore(
  store: { setCookie: (url: string, value: string) => void },
  baseUrl: string,
  resolved: string,
  cookies: string,
  guard?: BrowserCookieSyncGuard
): void {
  const trimmed = normalizeControlSettingsCookieHeader(cookies.trim());
  if (!trimmed) return;
  try {
    store.setCookie(new URL(resolved).origin, trimmed);
  } catch {
    /* ignore */
  }
  store.setCookie(resolved, trimmed);
  const controlBase = resolved.replace(/\/control\/?$/i, '');
  if (controlBase && controlBase !== resolved) {
    store.setCookie(controlBase, trimmed);
  }
  if (baseUrl) store.setCookie(baseUrl, trimmed);
  guard?.recordSync(resolved);
}

function resolveBrowserOpenUrl(raw: string, baseUrl: string): string {
  const toOpen = raw.startsWith('data:') ? raw : urlForOpen(raw);
  const t = toOpen.trim();
  if (/^(https?:|data:|legado:|yuedu:)/i.test(t)) {
    return t;
  }
  return baseUrl && !toOpen.startsWith('data:') ? resolveUrl(baseUrl, toOpen) : toOpen;
}

function getScriptCookieForUrl(
  cookieObj: { getCookie: (url: string) => string },
  resolved: string,
  baseUrl: string,
  options?: { omitBaseUrlFallback?: boolean }
): string {
  const controlBase = resolved.replace(/\/control\/?$/i, '');
  let cookieStr =
    cookieObj.getCookie(resolved) ||
    (controlBase && controlBase !== resolved ? cookieObj.getCookie(controlBase) : '');
  if (!cookieStr && !options?.omitBaseUrlFallback && baseUrl) {
    cookieStr = cookieObj.getCookie(baseUrl);
  }
  if (!cookieStr && resolved.startsWith('http')) {
    try {
      const u = new URL(resolved);
      cookieStr =
        cookieObj.getCookie(u.origin) ||
        cookieObj.getCookie(u.hostname) ||
        cookieObj.getCookie(`https://${u.hostname}`) ||
        '';
    } catch {
      /* ignore */
    }
  }
  return cookieStr;
}

/** 与书源脚本 cookie 表一致（键可为 origin 或 fanqienovel.com 等裸 host） */
export function readSourceCookieStore(source: BookSource): Map<string, string> {
  const store = new Map<string, string>();
  const cookiesKey = storageKey(STORAGE_PREFIX_COOKIES, getSourceUrlIdentifier(source));
  try {
    const raw = localStorage.getItem(cookiesKey);
    if (!raw) return store;
    const obj = JSON.parse(raw) as Record<string, string>;
    if (obj && typeof obj === 'object') {
      Object.entries(obj).forEach(([k, v]) => {
        if (typeof v === 'string') store.set(k, v);
      });
    }
  } catch {
    /* ignore */
  }
  return store;
}

/** 书源 cookie 存储键 → 可用作 Referer 的 origin（https://…/） */
export function cookieStorageKeyToOrigin(key: string): string | undefined {
  const k = key.trim();
  if (!k) return undefined;
  if (/^https?:\/\//i.test(k)) {
    try {
      return `${new URL(k).origin}/`;
    } catch {
      return undefined;
    }
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(k)) {
    return `https://${k}/`;
  }
  return undefined;
}

/** 封面：仅带图床域或含 sessionid 的读者端 Cookie，避免聚合站 qttoken 导致 403 */
export function getStoredSourceCookiesForCover(
  source: BookSource,
  coverUrl: string,
): string {
  let normalized = coverUrl.trim();
  if (normalized.startsWith('//')) {
    normalized =
      typeof window !== 'undefined'
        ? `${window.location.protocol}${normalized}`
        : `https:${normalized}`;
  }
  const direct = getStoredSourceCookiesForUrl(source, normalized, {
    omitBaseUrlFallback: true,
  });
  let merged = direct.trim();
  const coverHost = (() => {
    try {
      return new URL(normalized).hostname;
    } catch {
      return '';
    }
  })();

  const store = readSourceCookieStore(source);
  for (const [key, val] of store) {
    const v = (val ?? '').trim();
    if (!v) continue;
    const origin = cookieStorageKeyToOrigin(key);
    if (!origin) continue;
    let keyHost = '';
    try {
      keyHost = new URL(origin).hostname;
    } catch {
      continue;
    }
    const isCoverDomain = coverHost && keyHost === coverHost;
    const isReaderSession = /sessionid=/i.test(v);
    if (isCoverDomain || isReaderSession) {
      merged = mergeLegadoCookieHeaderStrings(
        merged,
        normalizeLegadoCookieHeader(v),
      );
    }
  }

  const fanqieBare = store.get('fanqienovel.com')?.trim();
  if (fanqieBare && /sessionid=/i.test(fanqieBare)) {
    merged = mergeLegadoCookieHeaderStrings(
      merged,
      normalizeLegadoCookieHeader(fanqieBare),
    );
  }

  try {
    const login = getStoredLoginInfo(getSourceUrlIdentifier(source));
    const manual = String(login['手动填写番茄token(可不填)'] ?? '').trim();
    if (manual) {
      const cookiePart = /sessionid=/i.test(manual)
        ? manual
        : `sessionid=${manual}`;
      merged = mergeLegadoCookieHeaderStrings(
        merged,
        normalizeLegadoCookieHeader(cookiePart),
      );
    }
  } catch {
    /* ignore */
  }

  return merged;
}

function cookiesForInnerWeb(
  cookieObj: { getCookie: (url: string) => string },
  resolved: string,
  baseUrl: string
): string {
  return normalizeLegadoCookieHeader(
    getScriptCookieForUrl(cookieObj, resolved, baseUrl),
    getOrCreateAndroidId()
  );
}

/** 是否可在应用内打开（http(s) 或 data:，用于 startBrowser） */
function isOpenableUrl(url: string): boolean {
  return /^(https?:|data:)/i.test((url ?? '').trim());
}

function getOrCreateAndroidId(): string {
  try {
    let id = localStorage.getItem(ANDROID_ID_KEY);
    if (!id) {
      id = 'web_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(ANDROID_ID_KEY, id);
    }
    return id;
  } catch {
    return 'web_' + Date.now();
  }
}

/**
 * 仅同步清除 localStorage 中的 cookie/login 键（与 runLoginScript 使用相同 key）。
 * 用于「退出登录」时先立即清空，避免异步或后续脚本再写回。
 */
export function clearSourceLoginStateLocalStorageOnly(source: BookSource): void {
  if (!source || typeof source !== 'object') return;
  const src = source as Record<string, unknown>;
  const sourceUrl = String(
    source.sourceUrl ?? src.bookSourceUrl ?? src.sourceUrl ?? ''
  ).trim();
  const cookiesKey = storageKey(STORAGE_PREFIX_COOKIES, sourceUrl);
  const loginKey = storageKey(STORAGE_PREFIX_LOGIN, sourceUrl);
  try {
    localStorage.removeItem(cookiesKey);
    localStorage.removeItem(loginKey);
    console.warn(LOG_TAG, 'clearSourceLoginStateLocalStorageOnly', { cookiesKey, sourceUrl: sourceUrl.slice(0, 50) });
  } catch (e) {
    console.warn(LOG_TAG, 'clearSourceLoginStateLocalStorageOnly failed', e);
  }
}

/**
 * 清除该书源在本地的登录态（cookie、登录信息缓存），用于「退出登录」。
 * 会清除：1) localStorage 中的 reader_source_cookies_xxx / reader_source_login_xxx；
 * 2) HTTP cookie-manager 中该书源 baseUrl 对应域的 cookie（避免启用 cookieJar 时仍带旧 cookie）。
 */
export async function clearSourceLoginState(source: BookSource): Promise<void> {
  if (!source || typeof source !== 'object') {
    console.warn(LOG_TAG, 'clearSourceLoginState: source 无效', source);
    return;
  }
  const src = source as Record<string, unknown>;
  const sourceUrl = String(
    source.sourceUrl ?? src.bookSourceUrl ?? src.sourceUrl ?? ''
  ).trim();
  const cookiesKey = storageKey(STORAGE_PREFIX_COOKIES, sourceUrl);
  const loginKey = storageKey(STORAGE_PREFIX_LOGIN, sourceUrl);

  console.warn(LOG_TAG, 'clearSourceLoginState 开始', {
    cookiesKey,
    sourceUrl: sourceUrl.slice(0, 60),
  });

  try {
    localStorage.removeItem(cookiesKey);
    localStorage.removeItem(loginKey);
    const argsKey = storageKey(STORAGE_PREFIX_ARGS, sourceUrl);
    const rawArgs = localStorage.getItem(argsKey);
    if (rawArgs) {
      const obj = JSON.parse(rawArgs) as Record<string, string>;
      if (obj && typeof obj === 'object') {
        delete obj.qttoken;
        localStorage.setItem(argsKey, JSON.stringify(obj));
      }
    }
  } catch (e) {
    console.warn(LOG_TAG, 'clearSourceLoginState localStorage 失败', e);
  }

  try {
    const baseUrl = getScriptBaseUrl(source);
    if (baseUrl && /^https?:\/\//i.test(baseUrl)) {
      await deleteCookie(baseUrl);
    }
  } catch (e) {
    console.warn(LOG_TAG, 'clearSourceLoginState deleteCookie 失败', e);
  }
}

export type StoredSourceCookiesOptions = {
  /**
   * 封面等第三方 CDN：勿回落书源 baseUrl（避免聚合站 qttoken 发到无关图床导致 403）。
   */
  omitBaseUrlFallback?: boolean;
};

/** 读取该书源已持久化的 Cookie 串，供打开内嵌页时注入（与脚本内 cookie 表一致） */
export function getStoredSourceCookiesForUrl(
  source: BookSource,
  targetUrl: string,
  options?: StoredSourceCookiesOptions,
): string {
  const sourceUrl = getSourceUrlIdentifier(source);
  const cookiesKey = storageKey(STORAGE_PREFIX_COOKIES, sourceUrl);
  const store = new Map<string, string>();
  try {
    const raw = localStorage.getItem(cookiesKey);
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, string>;
      if (obj && typeof obj === 'object') {
        Object.entries(obj).forEach(([k, v]) => {
          if (typeof v === 'string') store.set(k, v);
        });
      }
    }
  } catch {
    /* ignore */
  }
  const cookieObj = { getCookie: (url: string) => store.get(url) ?? '' };
  const baseUrl = getScriptBaseUrl(source);
  const resolved =
    baseUrl && !targetUrl.trim().startsWith('data:')
      ? resolveUrl(baseUrl, targetUrl.trim())
      : targetUrl.trim();
  const raw = getScriptCookieForUrl(cookieObj, resolved, baseUrl, options);
  return normalizeLegadoCookieHeader(raw, getOrCreateAndroidId());
}

/** 合并该书源 cookie 表中所有域（如聚合站 + 番茄登录域） */
export function getStoredSourceCookiesMerged(source: BookSource): string {
  const sourceUrl = getSourceUrlIdentifier(source);
  const cookiesKey = storageKey(STORAGE_PREFIX_COOKIES, sourceUrl);
  let merged = '';
  try {
    const raw = localStorage.getItem(cookiesKey);
    if (!raw) return merged;
    const obj = JSON.parse(raw) as Record<string, string>;
    if (!obj || typeof obj !== 'object') return merged;
    for (const value of Object.values(obj)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      merged = mergeLegadoCookieHeaderStrings(
        merged,
        normalizeLegadoCookieHeader(value),
      );
    }
  } catch {
    /* ignore */
  }
  return merged;
}

/** 获取该书源在 localStorage 中保存的登录信息（邮箱、密码等），供登录对话框预填 */
export function getStoredLoginInfo(sourceUrl: string): Record<string, string> {
  try {
    const key = storageKey(STORAGE_PREFIX_LOGIN, sourceUrl ?? '');
    const raw = localStorage.getItem(key);
    if (raw == null || raw === '') return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof k === 'string' && (v === undefined || v === null || typeof v === 'string')) {
          out[k] = v == null ? '' : String(v);
        }
      }
      return out;
    }
  } catch {
    // ignore
  }
  return {};
}

export interface RunLoginScriptOptions {
  /** 当前表单值（对应 result） */
  formValues: Record<string, string>;
  /** 按钮 action，如 "login(true)"、"register()"、"control()" */
  action: string;
  onToast?: (message: string, long?: boolean) => void;
}

/**
 * 执行书源登录脚本：先运行 loginUrl 定义 login/register 等，再执行 action
 */
function parseLoginKeyFromResponse(
  result: string,
  baseUrl: string,
  cookieStore: Map<string, string>,
  resolvedUrl: string
): void {
  if (!result || !baseUrl || !/login|signin|auth/i.test(resolvedUrl)) return;
  try {
    const json = JSON.parse(result) as Record<string, unknown>;
    let keyVal = '';
    if (typeof json.key === 'string') keyVal = json.key;
    else if (typeof json.token === 'string') keyVal = json.token;
    else if (typeof json.accessToken === 'string') keyVal = json.accessToken;
    else if (typeof json.cookie === 'string') keyVal = json.cookie;
    else if (typeof json.data === 'string') keyVal = json.data;
    else if (json.data && typeof json.data === 'object' && json.data !== null) {
      const d = json.data as Record<string, unknown>;
      keyVal =
        typeof d.key === 'string'
          ? d.key
          : typeof d.token === 'string'
            ? d.token
            : typeof d['密钥'] === 'string'
              ? (d['密钥'] as string)
              : '';
    }
    if (!keyVal && typeof json['密钥'] === 'string') keyVal = json['密钥'] as string;
    if (keyVal) {
      const deviceId = getOrCreateAndroidId();
      const cookieValue =
        /qttoken=/.test(keyVal) || /^[a-zA-Z0-9_-]+=/.test(keyVal)
          ? keyVal
          : `qttoken=${keyVal};deviceId=${deviceId}`;
      cookieStore.set(baseUrl, cookieValue);
    }
  } catch {
    /* ignore */
  }
}

/** 从表单或已持久化的 loginInfo 读取邮箱/密码（loginUi 字段名：邮箱、密码） */
function getLoginFormCredentials(
  formValues: Record<string, string>,
  loginKey?: string
): { email: string; password: string } {
  let email = String(formValues['邮箱'] ?? '').trim();
  let password = String(formValues['密码'] ?? '').trim();
  if ((!email || !password) && loginKey) {
    try {
      const raw = localStorage.getItem(loginKey);
      if (raw) {
        const stored = JSON.parse(raw) as Record<string, string>;
        if (stored && typeof stored === 'object') {
          if (!email) email = String(stored['邮箱'] ?? '').trim();
          if (!password) password = String(stored['密码'] ?? '').trim();
        }
      }
    } catch {
      /* ignore */
    }
  }
  return { email, password };
}

/**
 * 晴天 login_api：空 body / 双重 JSON 编码会触发「请求参数解析失败」。
 * 对话框登录时以表单为准重建 body，避免挂起重跑后脚本侧 result 与请求体不一致。
 */
function normalizeLoginApiPostBody(
  resolvedUrl: string,
  method: 'GET' | 'POST',
  body: string | undefined,
  formValues: Record<string, string>,
  loginKey?: string
): string | undefined {
  if (method !== 'POST' || !/\/login_api\b/.test(resolvedUrl)) return body;

  const { email, password } = getLoginFormCredentials(formValues, loginKey);
  if (!email || !password) {
    console.warn(LOG_TAG, 'login_api 缺少邮箱或密码', {
      formKeys: Object.keys(formValues),
      bodyLen: (body ?? '').length,
    });
    return body;
  }

  const canonical = JSON.stringify({ register_email: email, password });
  let b = (body ?? '').trim();
  if (b.startsWith('"') && b.endsWith('"')) {
    try {
      const inner = JSON.parse(b);
      if (typeof inner === 'string') b = inner.trim();
    } catch {
      /* keep */
    }
  }

  if (!b || b === '{}' || b !== canonical || body !== canonical) {
    if (b && b !== canonical) {
      console.warn(LOG_TAG, 'login_api 已用表单重建请求体', {
        prevPreview: b.slice(0, 80),
        nextLen: canonical.length,
      });
    }
    return canonical;
  }
  return canonical;
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

/** 表单「密钥」、已持久化 loginInfo、args.qttoken（供 user_api / checkStatus） */
function resolveLoginFormKey(
  formValues: Record<string, string>,
  loginKey: string,
  argsKey: string
): string {
  const fromForm = String(formValues['密钥'] ?? '').trim();
  if (fromForm) return fromForm;
  try {
    const raw = localStorage.getItem(loginKey);
    if (raw) {
      const k = String((JSON.parse(raw) as Record<string, string>)['密钥'] ?? '').trim();
      if (k) return k;
    }
  } catch {
    /* ignore */
  }
  return readArgToken(argsKey);
}

/** QuickJS 执行登录脚本；成功返回 true，失败返回 false 以降级 Function */
async function tryRunLoginScriptQuickJS(
  source: BookSource,
  options: RunLoginScriptOptions,
  keys: { loginKey: string; argsKey: string; cookiesKey: string; baseUrl: string; loginUrlScript: string }
): Promise<boolean> {
  await initQuickJSRuntime();
  if (isQuickJSFallback()) return false;

  const { formValues, action, onToast } = options;
  const { loginKey, argsKey, cookiesKey, baseUrl, loginUrlScript } = keys;
  const sourceUrl = getSourceUrlIdentifier(source);

  let suppressResumeToast = false;
  const isWaitingToast = (msg?: string) =>
    typeof msg === 'string' && (/正在检测|请稍等|正在登录中/.test(msg));

  const toast = (msg?: string) => {
    if (suppressResumeToast && isWaitingToast(msg)) return;
    if (typeof msg === 'string' && onToast) onToast(msg, false);
  };
  const longToast = (msg?: string) => {
    if (suppressResumeToast && isWaitingToast(msg)) return;
    if (typeof msg === 'string' && onToast) onToast(msg, true);
  };

  const cookieStore = new Map<string, string>();
  try {
    const raw = localStorage.getItem(cookiesKey);
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, string>;
      if (obj && typeof obj === 'object') {
        Object.entries(obj).forEach(([k, v]) => {
          if (typeof v === 'string') cookieStore.set(k, v);
        });
      }
    }
  } catch {
    /* ignore */
  }

  const browserCookieGuard = createBrowserCookieSyncGuard(baseUrl);

  const cookieObj = {
    _store: cookieStore,
    getCookie(url: string): string {
      return this._store.get(url || baseUrl) ?? '';
    },
    setCookie(url: string, value: string): void {
      if (browserCookieGuard.shouldSkipOverwrite(url)) {
        console.warn(LOG_TAG, 'skip setCookie after startBrowserAwait sync', {
          url: (url || baseUrl).slice(0, 80),
        });
        return;
      }
      this._store.set(url || baseUrl, value);
    },
    removeCookie(url: string): void {
      this._store.delete(url || baseUrl);
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

  const pending: Promise<unknown>[] = [];
  let lastAjaxDurationMs: number | undefined;

  const jsLib =
    typeof (source as Record<string, unknown>).jsLib === 'string'
      ? ((source as Record<string, unknown>).jsLib as string)
      : '';

  const fallbackFunctions =
    'function getArguments(a, k) { try { a = JSON.parse(a); } catch(e) { a = {}; } return k ? a[k] : a; }';
  // login_api 等 try/catch 在 loginUrl 内，必须注入挂起重抛（否则 catch 会 toast __READER_LEGADO_SUSPEND__）
  const fullScript = wrapLegadoCatchRethrow(
    [fallbackFunctions, jsLib ? jsLib + '\n' : '', loginUrlScript].join('\n')
  );
  const actionTrim = (action || '').trim();
  const resolveFormKey = () => resolveLoginFormKey(formValues, loginKey, argsKey);

  const refreshResultGlobal = (vm: QuickJSContext) => {
    setGlobalJson(vm, 'result', formValues);
  };

  try {
    try {
      localStorage.setItem(loginKey, JSON.stringify(formValues));
    } catch {
      /* ignore */
    }

    suppressResumeToast = true;
    await runLegadoScriptQuickJS({
      initScript: fullScript,
      script: actionTrim,
      baseUrl,
      timeoutMs: SCRIPT_TIMEOUT_MS,
      mode: 'suspend',
      wrapCatchRethrow: false,
      inject: (vm, rt) => {
        const browserAwaitDone = { value: false };
        const injector = createLoginInjector({
          baseUrl,
          sourceUrl,
          formValues,
          host: [baseUrl],
          resolveUrl,
          normalizeAjaxBody: (url, method, body) => {
            let b = normalizeLoginApiPostBody(url, method, body, formValues, loginKey);
            const cookieStr =
              cookieObj.getCookie(url) ||
              cookieObj.getCookie(baseUrl) ||
              (() => {
                try {
                  return cookieObj.getCookie(new URL(url).origin);
                } catch {
                  return '';
                }
              })();
            b = normalizeUserApiPostBody(url, method, b, {
              cookieStr,
              formKey: resolveFormKey(),
              argToken: readArgToken(argsKey),
            });
            return b;
          },
          getArgToken: () => readArgToken(argsKey),
          getFormKey: resolveFormKey,
          getDeviceId: () => getOrCreateAndroidId(),
          getArgument: (key) => {
            try {
              const raw = localStorage.getItem(argsKey);
              if (!raw) return '';
              return (JSON.parse(raw) as Record<string, string>)[key] ?? '';
            } catch {
              return '';
            }
          },
          setArgument: (key, value) => {
            try {
              const raw = localStorage.getItem(argsKey) ?? '{}';
              const obj = (JSON.parse(raw) as Record<string, string>) || {};
              obj[key] = value;
              localStorage.setItem(argsKey, JSON.stringify(obj));
            } catch (e) {
              console.warn(LOG_TAG, 'setArgument failed:', e);
            }
          },
          putLoginInfo: (jsonStr) => {
            try {
              localStorage.setItem(loginKey, jsonStr);
            } catch (e) {
              console.warn(LOG_TAG, 'putLoginInfo failed:', e);
            }
          },
          cookie: cookieObj,
          source: {
            getVariable: (_key?: string) => {
              try {
                const raw = localStorage.getItem(argsKey);
                if (raw != null && raw !== '') return raw;
              } catch {
                /* ignore */
              }
              const header = (source as Record<string, unknown>).header;
              return typeof header === 'string' && header ? header : '{}';
            },
            setVariable: (val?: string) => {
              try {
                if (typeof val === 'string') localStorage.setItem(argsKey, val);
              } catch (e) {
                console.warn(LOG_TAG, 'source.setVariable failed:', e);
              }
            },
            getLoginInfo: () => {
              try {
                return localStorage.getItem(loginKey) ?? '{}';
              } catch {
                return '{}';
              }
            },
            putLoginInfo: (jsonStr: string) => {
              try {
                localStorage.setItem(loginKey, jsonStr);
                return true;
              } catch (e) {
                console.warn(LOG_TAG, 'source.putLoginInfo failed:', e);
                return false;
              }
            },
            getKey: () => sourceUrl,
          },
          java: {
            toast,
            longToast,
            log: (...args) => {
              console.warn(LOG_TAG, 'script log', ...args);
              return args[0];
            },
            getLastAjaxDuration: () => lastAjaxDurationMs,
            androidId: getOrCreateAndroidId,
            deviceID: getOrCreateAndroidId,
            timeFormat: (timestampMs) => {
              const d = new Date(timestampMs);
              if (isNaN(d.getTime())) return '';
              const y = d.getFullYear();
              const M = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              const h = String(d.getHours()).padStart(2, '0');
              const m = String(d.getMinutes()).padStart(2, '0');
              const s = String(d.getSeconds()).padStart(2, '0');
              return `${y}-${M}-${day} ${h}:${m}:${s}`;
            },
            startBrowser: (url, title?: string) => {
              const raw = (url || '').trim();
              const resolved = resolveBrowserOpenUrl(raw, baseUrl);
              if (/^(legado|yuedu):\/\//i.test(resolved)) {
                pending.push(handleReaderImportDeepLink(resolved));
                return;
              }
              if (onToast) {
                onToast(
                  isOpenableUrl(resolved)
                    ? `正在打开: ${(title || resolved).slice(0, 50)}…`
                    : `[startBrowser] URL 无效: ${resolved.slice(0, 40)}`,
                  false
                );
              }
              const cookieStr = cookiesForInnerWeb(cookieObj, resolved, baseUrl);
              pending.push(
                isOpenableUrl(resolved)
                  ? openLegadoBrowserInApp(resolved, cookieStr, title)
                  : Promise.resolve()
              );
            },
            openUrl: (url: string) => {
              const raw = (url || '').trim();
              const resolved = resolveBrowserOpenUrl(raw, baseUrl);
              if (/^(legado|yuedu):\/\//i.test(resolved)) {
                pending.push(handleReaderImportDeepLink(resolved));
                return;
              }
              if (!isOpenableUrl(resolved)) return;
              const cookieStr = cookiesForInnerWeb(cookieObj, resolved, baseUrl);
              pending.push(openLegadoBrowserInApp(resolved, cookieStr, undefined));
            },
            base64Encode: (str) => {
              try {
                return btoa(unescape(encodeURIComponent(String(str ?? ''))));
              } catch {
                return '';
              }
            },
            base64Decode: (str) => {
              try {
                return decodeURIComponent(escape(atob(String(str ?? ''))));
              } catch {
                return '';
              }
            },
            request: (resolvedUrl, call) =>
              requestInScript(resolvedUrl, { ...call, source }),
          },
          startBrowserAwait: (url, title) => {
            if (browserAwaitDone.value) return;
            const raw = (url || '').trim();
            const resolved = resolveBrowserOpenUrl(raw, baseUrl);
            if (/^(legado|yuedu):\/\//i.test(resolved)) {
              const p = handleReaderImportDeepLink(resolved).then(() => '');
              throw new SuspendScript(p, BROWSER_SUSPEND_WRITE_INDEX, resolved, Date.now());
            }
            if (onToast) {
              onToast(
                isOpenableUrl(resolved)
                  ? `正在打开: ${(title || resolved).slice(0, 50)}…`
                  : `[startBrowserAwait] URL 无效`,
                false
              );
            }
            if (!isOpenableUrl(resolved)) return;
            const cookieStr = cookiesForInnerWeb(cookieObj, resolved, baseUrl);
            const p = openLegadoBrowserInApp(resolved, cookieStr, title, { awaitClose: true })
              .then((r) => {
                if (r.confirmed && r.cookies) {
                  syncWebViewCookiesToStore(
                    cookieObj,
                    baseUrl,
                    resolved,
                    r.cookies,
                    browserCookieGuard
                  );
                }
                return '';
              })
              .catch((e) => {
                console.warn(LOG_TAG, 'startBrowserAwait open failed', e);
                return '';
              })
              .finally(() => {
                browserAwaitDone.value = true;
                browserCookieGuard.markAwaitDone();
              });
            rt.coordinator.pendingSuspend = new SuspendScript(
              p,
              BROWSER_SUSPEND_WRITE_INDEX,
              resolved,
              Date.now()
            );
            throw new Error(LEGADO_SUSPEND_MARKER);
          },
        });
        injector(vm, rt);
        lastAjaxDurationMs = rt.coordinator.lastAjaxDurationMs;
      },
      beforeEval: refreshResultGlobal,
      onAjaxSettled: (url, body) => {
        lastAjaxDurationMs = undefined;
        // login_api 须在 action 重放时由书源脚本 cookie.setCookie；ajax 返回后立刻写入会导致 login(true) 误判「已登录」
        if (!/\/login_api\b/.test(url)) {
          parseLoginKeyFromResponse(body, baseUrl, cookieStore, url);
        }
        if (/\/login_api\b/.test(url)) {
          try {
            const json = JSON.parse(body) as { code?: number; msg?: string };
            console.warn(LOG_TAG, 'login_api 响应', {
              code: json.code,
              msg: json.msg,
              bodyLen: body.length,
            });
          } catch {
            console.warn(LOG_TAG, 'login_api 响应非 JSON', {
              bodyPreview: body.slice(0, 120),
            });
          }
        }
        if (/\/user_api\b/.test(url)) {
          try {
            const json = JSON.parse(body) as { code?: number; msg?: string; id?: unknown };
            console.warn(LOG_TAG, 'user_api 响应', {
              code: json.code,
              msg: json.msg,
              hasId: json.id != null,
            });
          } catch {
            console.warn(LOG_TAG, 'user_api 响应非 JSON', { bodyPreview: body.slice(0, 120) });
          }
        }
        if (/login|signin|auth/i.test(url)) {
          const short = /(\d{3})\s*:?/.exec(body)?.[1] ?? body.slice(0, 40);
          if (body && !body.trim().startsWith('{') && onToast) {
            onToast(`登录请求失败: ${short}`, true);
          }
        }
      },
    });
    while (pending.length > 0) {
      await Promise.all(pending.splice(0, pending.length));
    }

    try {
      const obj: Record<string, string> = {};
      cookieStore.forEach((v, k) => {
        obj[k] = v;
      });
      if (Object.keys(obj).length > 0) {
        localStorage.setItem(cookiesKey, JSON.stringify(obj));
      }
    } catch (e) {
      console.warn(LOG_TAG, 'QuickJS persist cookies failed', e);
    }

    console.warn(LOG_TAG, 'runLoginScript QuickJS 完成');
    return true;
  } catch (e) {
    console.warn(LOG_TAG, 'QuickJS 登录脚本失败，降级 Function', e);
    return false;
  }
}

export async function runLoginScript(
  source: BookSource,
  options: RunLoginScriptOptions
): Promise<void> {
  const { formValues, action, onToast } = options;
  const baseUrl = getScriptBaseUrl(source);
  const loginUrlScript = (source.loginUrl ?? '').trim();
  if (!loginUrlScript) return;
  console.warn(LOG_TAG, 'runLoginScript', { action: action?.slice(0, 50), baseUrl: baseUrl?.slice(0, 60) });

  const sourceUrl = getSourceUrlIdentifier(source);
  const loginKey = storageKey(STORAGE_PREFIX_LOGIN, sourceUrl);
  const argsKey = storageKey(STORAGE_PREFIX_ARGS, sourceUrl);
  const cookiesKey = storageKey(STORAGE_PREFIX_COOKIES, sourceUrl);

  // 若本次是退出登录，先清空 localStorage 再加载，这样无论对话框是否为新代码都能清掉 cookie
  const isLogoutAction = /^\s*logout\s*\(\s*\)\s*$/.test((action ?? '').trim());
  if (isLogoutAction) {
    try {
      localStorage.removeItem(cookiesKey);
      localStorage.removeItem(loginKey);
      const rawArgs = localStorage.getItem(argsKey);
      if (rawArgs) {
        const obj = JSON.parse(rawArgs) as Record<string, string>;
        if (obj && typeof obj === 'object') {
          delete obj.qttoken;
          localStorage.setItem(argsKey, JSON.stringify(obj));
        }
      }
      console.warn(LOG_TAG, 'runLoginScript(logout) 已清除 localStorage', { cookiesKey, argsKey });
    } catch (e) {
      console.warn(LOG_TAG, 'runLoginScript(logout) 清除 localStorage 失败', e);
    }
    try {
      await clearSourceLoginState(source);
    } catch (e) {
      console.warn(LOG_TAG, 'runLoginScript(logout) 清除 HTTP Cookie 失败', e);
    }
  }

  if (
    await tryRunLoginScriptQuickJS(source, options, {
      baseUrl,
      loginUrlScript,
      loginKey,
      argsKey,
      cookiesKey,
    })
  ) {
    return;
  }

  const ajaxCache = new Map<string, string>();
  /** 各 URL 真实 ajax 耗时（ms），供缓存命中时恢复测延迟 */
  const ajaxDurationCache = new Map<string, number>();
  const { PatchedDate, applyAjaxDuration } = installScriptDateShim();

  let pending: Promise<unknown>[] = [];
  /** startBrowserAwait 已关闭内嵌页，重放脚本时不再打开 */
  let browserAwaitDone = false;
  /** 恢复执行时仅屏蔽「正在检测」「请稍等」类重复提示，不屏蔽检测/登录结果通知 */
  let suppressResumeToast = false;
  const isWaitingToast = (msg?: string) =>
    typeof msg === 'string' && (/正在检测|请稍等|正在登录中/.test(msg));

  const toast = (msg?: string) => {
    if (suppressResumeToast && isWaitingToast(msg)) return;
    if (typeof msg === 'string' && onToast) onToast(msg, false);
  };
  const longToast = (msg?: string) => {
    if (suppressResumeToast && isWaitingToast(msg)) return;
    if (typeof msg === 'string' && onToast) onToast(msg, true);
  };

  const cookieStore = new Map<string, string>();
  try {
    const raw = localStorage.getItem(cookiesKey);
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, string>;
      if (obj && typeof obj === 'object') {
        Object.entries(obj).forEach(([k, v]) => {
          if (typeof v === 'string') cookieStore.set(k, v);
        });
      }
    }
  } catch (e) {
    console.warn(LOG_TAG, 'load cookies failed', { key: cookiesKey, error: e });
  }
  if (cookieStore.size > 0) {
    console.warn(LOG_TAG, 'loaded cookies from storage', {
      key: cookiesKey,
      count: cookieStore.size,
      keys: Array.from(cookieStore.keys()).slice(0, 10),
    });
  }
  const browserCookieGuard = createBrowserCookieSyncGuard(baseUrl);
  const cookieObj = {
    _store: cookieStore,
    getCookie(url: string): string {
      const k = url || baseUrl;
      return this._store.get(k) ?? '';
    },
    setCookie(url: string, value: string): void {
      if (browserCookieGuard.shouldSkipOverwrite(url)) {
        console.warn(LOG_TAG, 'skip setCookie after startBrowserAwait sync', {
          url: (url || baseUrl).slice(0, 80),
        });
        return;
      }
      const k = url || baseUrl;
      this._store.set(k, value);
      console.warn(LOG_TAG, 'cookie.setCookie', {
        key: k,
        valuePreview: String(value ?? '').slice(0, 120),
      });
    },
    removeCookie(url: string): void {
      const k = url || baseUrl;
      this._store.delete(k);
    },
    /** 单参数：从 cookie 字符串中取 qttoken 值；两参数：cookie.getKey(url, keyName) 取该 url 下 cookie 中指定 key 的值（晴天聚合 loginqt 等用） */
    getKey(cookieStrOrUrl: string, keyName?: string): string {
      let s: string;
      if (keyName != null && keyName !== '') {
        s = this.getCookie(cookieStrOrUrl);
      } else {
        s = String(cookieStrOrUrl ?? '').trim();
      }
      if (!s) return '';
      const parts = s.split(';');
      const searchKey = keyName != null && keyName !== '' ? keyName : 'qttoken';
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.includes(searchKey)) {
          const eq = trimmed.indexOf('=');
          return eq >= 0 ? trimmed.slice(eq + 1).trim() : '';
        }
      }
      return '';
    },
  };

  const scopeObj: Record<string, unknown> = {
    Date: PatchedDate,
    result: { ...formValues },
    baseUrl,
    host: [baseUrl],
    _ajaxResults: [] as string[],
    _ajaxReadIndex: 0,
    _ajaxWriteIndex: 0,
    /** 最近一次 ajax 的真实耗时（ms），供脚本显示「解析耗时」；因重跑时从缓存返回，Date.now() 差值为 ~0 */
    __lastAjaxDurationMs__: undefined as number | undefined,
  };

  function recordAjaxDuration(resolvedUrl: string, durationMs: number) {
    if (durationMs < 0) return;
    ajaxDurationCache.set(resolvedUrl, durationMs);
    scopeObj.__lastAjaxDurationMs__ = durationMs;
    // 不在挂起完成时注入 Date boost（整段脚本会重跑，开头 date1 会误消费）
  }

  function restoreAjaxDurationForUrl(resolvedUrl: string) {
    const d = ajaxDurationCache.get(resolvedUrl);
    if (d != null && d >= 0) {
      scopeObj.__lastAjaxDurationMs__ = d;
      applyAjaxDuration(d);
    }
  }

  Object.assign(scopeObj, {
    source: {
      /** 书源脚本用 getVariable() 取“参数”JSON（server/tab/sources 等），须与 setVariable 持久化到同一 argsKey，否则 getArgument('server') 为空导致登录请求 404 */
      getVariable(_key?: string): string {
        try {
          const raw = localStorage.getItem(argsKey);
          if (raw != null && raw !== '') return raw;
        } catch { /* ignore */ }
        const header = (source as Record<string, unknown>).header;
        if (typeof header === 'string' && header) return header;
        return '{}';
      },
      setVariable(val?: string): void {
        try {
          if (typeof val === 'string') localStorage.setItem(argsKey, val);
        } catch (e) {
          console.warn('[login-script] source.setVariable failed:', e);
        }
      },
      getLoginInfo(): string {
        try {
          return localStorage.getItem(loginKey) ?? '{}';
        } catch {
          return '{}';
        }
      },
    },

    putLoginInfo(jsonStr: string) {
      try {
        localStorage.setItem(loginKey, jsonStr);
      } catch (e) {
        console.warn('[login-script] putLoginInfo failed:', e);
      }
    },

    getArgument(key: string): string {
      try {
        const raw = localStorage.getItem(argsKey);
        if (!raw) return '';
        const obj = JSON.parse(raw) as Record<string, string>;
        return obj[key] ?? '';
      } catch {
        return '';
      }
    },
    setArgument(key: string, value: string) {
      try {
        const raw = localStorage.getItem(argsKey) ?? '{}';
        const obj = (JSON.parse(raw) as Record<string, string>) || {};
        obj[key] = value;
        localStorage.setItem(argsKey, JSON.stringify(obj));
      } catch (e) {
        console.warn('[login-script] setArgument failed:', e);
      }
    },

    cookie: cookieObj,

    java: {
      toast,
      longToast,
      /** Legado：脚本内打印日志，本端输出到 console；与 Legado 一致返回首个参数 */
      log(...args: unknown[]): unknown {
        console.warn(LOG_TAG, 'script log', ...args);
        return args[0];
      },
      /** 最近一次 ajax 的真实耗时（ms）。因 SuspendScript 重跑后从缓存返回，脚本内 Date.now() 差值为 ~0，可用此显示解析耗时 */
      getLastAjaxDuration(): number | undefined {
        return scopeObj.__lastAjaxDurationMs__ as number | undefined;
      },
      /** Legado 设备 ID，本端用 localStorage 持久化一个固定字符串 */
      androidId(): string {
        return getOrCreateAndroidId();
      },
      deviceID(): string {
        return getOrCreateAndroidId();
      },
      /** 时间戳（ms）格式化为 yyyy-MM-dd HH:mm:ss，供 checkStatus 等显示 */
      timeFormat(timestampMs: number): string {
        const d = new Date(typeof timestampMs === 'number' ? timestampMs : Number(timestampMs));
        if (isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const M = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        const s = String(d.getSeconds()).padStart(2, '0');
        return `${y}-${M}-${day} ${h}:${m}:${s}`;
      },
      /** 在应用内打开 URL 并挂起，直至用户点击 √（与 Legado WebViewActivity menu_ok 一致） */
      startBrowserAwait(url: string, title?: string): Promise<string> {
        if (browserAwaitDone) return Promise.resolve('');
        const raw = (url || '').trim();
        const resolved = resolveBrowserOpenUrl(raw, baseUrl);
        if (/^(legado|yuedu):\/\//i.test(resolved)) {
          const p = handleReaderImportDeepLink(resolved).then(() => '');
          throw new SuspendScript(p, BROWSER_SUSPEND_WRITE_INDEX, resolved, Date.now());
        }
        const ok = isOpenableUrl(resolved);
        console.warn(LOG_TAG, 'startBrowserAwait', {
          raw: raw.slice(0, 80),
          resolved: resolved.slice(0, 80),
          title: (title ?? '').slice(0, 40),
          baseUrl: baseUrl?.slice(0, 60),
          willOpen: ok,
        });
        if (onToast) {
          onToast(
            ok ? `正在打开: ${(title || resolved).slice(0, 50)}…` : `[startBrowserAwait] URL 无效，未打开: ${resolved.slice(0, 40)}`,
            false
          );
        }
        if (!ok) return Promise.resolve('');
        const cookieStr = cookiesForInnerWeb(cookieObj, resolved, baseUrl);
        console.warn(LOG_TAG, 'startBrowserAwait cookie', {
          resolved: resolved.slice(0, 80),
          cookiePreview: (cookieStr || '').replace(/qttoken=([^;]+)/, 'qttoken=***').slice(0, 120),
          hasCookie: !!cookieStr,
        });
        const p = openLegadoBrowserInApp(resolved, cookieStr, title, { awaitClose: true })
          .then((r) => {
            if (r.confirmed && r.cookies) {
              syncWebViewCookiesToStore(
                cookieObj,
                baseUrl,
                resolved,
                r.cookies,
                browserCookieGuard
              );
            }
            console.warn(LOG_TAG, 'startBrowserAwait 已关闭', { confirmed: r.confirmed });
            return '';
          })
          .catch((e) => {
            console.warn(LOG_TAG, 'startBrowserAwait open failed', e);
            return '';
          })
          .finally(() => {
            browserAwaitDone = true;
            browserCookieGuard.markAwaitDone();
          });
        throw new SuspendScript(p, BROWSER_SUSPEND_WRITE_INDEX, resolved, Date.now());
      },
      /** Legado：打开 URL（不等待）；http(s)/data: 走内嵌页；legado/yuedu 走书源导入 */
      startBrowser(url: string, title?: string): void {
        const raw = (url || '').trim();
        const resolved = resolveBrowserOpenUrl(raw, baseUrl);
        if (/^(legado|yuedu):\/\//i.test(resolved)) {
          pending.push(handleReaderImportDeepLink(resolved));
          return;
        }
        const ok = isOpenableUrl(resolved);
        console.warn(LOG_TAG, 'startBrowser', {
          raw: raw.slice(0, 80),
          resolved: resolved.slice(0, 80),
          title: (title ?? '').slice(0, 40),
          baseUrl: baseUrl?.slice(0, 60),
          willOpen: ok,
        });
        if (onToast) {
          onToast(
            ok ? `正在打开: ${(title || resolved).slice(0, 50)}…` : `[startBrowser] URL 无效，未打开: ${resolved.slice(0, 40)}`,
            false
          );
        }
        const cookieStr = cookiesForInnerWeb(cookieObj, resolved, baseUrl);
        console.warn(LOG_TAG, 'startBrowser cookie', {
          resolved: resolved.slice(0, 80),
          baseUrl: baseUrl?.slice(0, 80),
          cookiePreview: (cookieStr || '').replace(/qttoken=([^;]+)/, 'qttoken=***').slice(0, 120),
          hasCookie: !!cookieStr,
        });
        const p: Promise<void> = ok
          ? openLegadoBrowserInApp(resolved, cookieStr, title)
          : Promise.resolve();
        pending.push(p);
      },
      /** Legado JsExtensions.openUrl：支持 legado/yuedu 导入与内嵌 http(s)/data: */
      openUrl(url: string): void {
        const raw = (url || '').trim();
        const resolved = resolveBrowserOpenUrl(raw, baseUrl);
        if (/^(legado|yuedu):\/\//i.test(resolved)) {
          pending.push(handleReaderImportDeepLink(resolved));
          return;
        }
        if (!isOpenableUrl(resolved)) return;
        const cookieStr = cookiesForInnerWeb(cookieObj, resolved, baseUrl);
        pending.push(openLegadoBrowserInApp(resolved, cookieStr, undefined));
      },
      base64Encode(str: string): string {
        try {
          return btoa(unescape(encodeURIComponent(String(str ?? ''))));
        } catch {
          return '';
        }
      },
      base64Decode(str: string): string {
        try {
          return decodeURIComponent(escape(atob(String(str ?? ''))));
        } catch {
          return '';
        }
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
        } else {
          if (optionsOrCb && typeof optionsOrCb === 'object') {
            method = ((optionsOrCb.method as string) || 'GET').toUpperCase();
            body = optionsOrCb.body as string | undefined;
            const h = optionsOrCb.headers as Record<string, string> | undefined;
            if (h && typeof h === 'object') headers = { ...headers, ...h };
          }
        }

        let urlStr = typeof url === 'string' ? url : '';
        if (!urlStr && url != null && typeof url === 'object') {
          const u = url as Record<string, unknown>;
          if (Array.isArray(url) && url.length > 0) {
            urlStr = String((url as unknown[])[0] ?? '');
          } else {
            urlStr = (u.url ?? u.href ?? '') as string;
          }
        }
        // Legado 常用单参数格式：java.ajax(`${base_url}/login_api,${options}`)，逗号后为 JSON options
        if (urlStr && !optionsOrCb && typeof urlStr === 'string') {
          const comma = urlStr.indexOf(',');
          if (comma > 0) {
            const after = urlStr.slice(comma + 1).trim();
            urlStr = urlStr.slice(0, comma).trim();
            if (after && (after.startsWith('{') || after.startsWith('['))) {
              try {
                const opts = JSON.parse(after) as Record<string, unknown>;
                if (!optionsOrCb || typeof optionsOrCb !== 'object') {
                  method = ((opts.method as string) || method).toUpperCase();
                  if (opts.body != null) body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
                  const h = opts.headers as Record<string, string> | undefined;
                  if (h && typeof h === 'object') headers = { ...headers, ...h };
                }
              } catch { /* 逗号后非 JSON 则整段当 URL */ }
            }
          }
        }
        if (!urlStr || urlStr.includes('[object Object]')) {
          if (callback) callback('');
          return '';
        }
        const resolvedUrl = resolveUrl(baseUrl, urlStr);
        const results = scopeObj._ajaxResults as string[];
        const readIdx = scopeObj._ajaxReadIndex as number;
        if (results[readIdx] !== undefined) {
          scopeObj._ajaxReadIndex = readIdx + 1;
          restoreAjaxDurationForUrl(resolvedUrl);
          const out = results[readIdx];
          if (callback) {
            try {
              callback(out);
            } catch (e) {
              console.warn('[login-script] ajax callback error:', e);
            }
          }
          return out;
        }

        console.warn(LOG_TAG, 'ajax 请求', {
          url: resolvedUrl,
          method: method as string,
          hasBody: !!body,
          bodyLength: typeof body === 'string' ? body.length : 0,
        });

        if (ajaxCache.has(resolvedUrl)) {
          restoreAjaxDurationForUrl(resolvedUrl);
          const cached = ajaxCache.get(resolvedUrl)!;
          if (callback) {
            try {
              callback(cached);
            } catch (e) {
              console.warn('[login-script] ajax callback error:', e);
            }
          }
          return cached;
        }

        const writeIdx = scopeObj._ajaxWriteIndex as number;
        (scopeObj as Record<string, unknown>)._ajaxWriteIndex = writeIdx + 1;
        let scriptCookie =
          cookieObj.getCookie(resolvedUrl) || (baseUrl ? cookieObj.getCookie(baseUrl) : '');
        if (!scriptCookie && resolvedUrl.startsWith('http')) {
          try {
            scriptCookie = cookieObj.getCookie(new URL(resolvedUrl).origin);
          } catch {
            /* ignore */
          }
        }
        const mergedCookie = scriptCookie || String(headers.Cookie ?? headers.cookie ?? '').trim();
        headers = mergeAjaxCookieHeaders(headers, mergedCookie);
        if (mergedCookie) {
          console.warn(LOG_TAG, 'ajax 使用 cookie', {
            url: resolvedUrl,
            baseUrl: baseUrl?.slice(0, 80),
            cookiePreview: mergedCookie.slice(0, 120),
          });
        } else {
          console.warn(LOG_TAG, 'ajax 无 cookie', {
            url: resolvedUrl,
            baseUrl: baseUrl?.slice(0, 80),
            storeSize: cookieStore.size,
            storeKeys: Array.from(cookieStore.keys()).slice(0, 5),
          });
        }
        let normalizedBody = normalizeLoginApiPostBody(
          resolvedUrl,
          method as 'GET' | 'POST',
          typeof body === 'string' ? body : undefined,
          formValues,
          loginKey
        );
        const formKey = resolveLoginFormKey(formValues, loginKey, argsKey);
        normalizedBody = normalizeUserApiPostBody(
          resolvedUrl,
          method as 'GET' | 'POST',
          normalizedBody,
          {
            cookieStr: mergedCookie,
            formKey,
            argToken: readArgToken(argsKey),
          }
        );
        if (isUserApiPost(resolvedUrl, method)) {
          const cookie = resolveUserApiCookieHeader(headers.Cookie ?? mergedCookie, {
            formKey,
            argToken: readArgToken(argsKey),
            deviceId: getOrCreateAndroidId(),
          });
          if (cookie) headers = { ...headers, Cookie: cookie };
          body = undefined;
        } else if (normalizedBody !== undefined) {
          body = normalizedBody;
        }
        const p = requestInScript(resolvedUrl, {
          method: method as 'GET' | 'POST',
          headers: Object.keys(headers).length ? headers : undefined,
          body,
          source,
        });
        throw new SuspendScript(p, writeIdx, resolvedUrl, Date.now());
      },
    },
  });

  // 防止书源 jsLib/loginUrl 中覆盖 java（导致 java.timeFormat 等丢失），锁定为不可写
  Object.defineProperty(scopeObj, 'java', {
    value: scopeObj.java,
    writable: false,
    configurable: false,
  });

  const jsLib =
    typeof (source as Record<string, unknown>).jsLib === 'string'
      ? ((source as Record<string, unknown>).jsLib as string)
      : '';

  const fallbackFunctions = [
    'function getArguments(a, k) { try { a = JSON.parse(a); } catch(e) { a = {}; } return k ? a[k] : a; }',
  ].join('\n');

  const fullScript = [fallbackFunctions, jsLib ? jsLib + '\n' : '', loginUrlScript].join('\n');
  const actionTrim = (action || '').trim();
  const replayScript = wrapLegadoCatchRethrow(
    `${legadoLoginScriptForReplay(fullScript)}\n; ${actionTrim}`
  );

  const run = new Function(
    '__scope__',
    'scriptText',
    'try { with(__scope__) { eval(scriptText); } } catch (e) { if (!(e && e.name === "SuspendScript")) console.warn("[login-script] run error:", e); throw e; }'
  );

  console.warn(LOG_TAG, '执行 action', { action: actionTrim.slice(0, 60) });

  let loginTimeoutId: ReturnType<typeof setTimeout> | undefined;
  let rejectLoginTimeout: ((e: Error) => void) | undefined;
  const armLoginTimeout = () => {
    if (loginTimeoutId !== undefined) clearTimeout(loginTimeoutId);
    loginTimeoutId = setTimeout(
      () => rejectLoginTimeout?.(new Error('登录脚本执行超时')),
      SCRIPT_TIMEOUT_MS
    );
  };
  const disarmLoginTimeout = () => {
    if (loginTimeoutId !== undefined) clearTimeout(loginTimeoutId);
    loginTimeoutId = undefined;
  };
  const timeoutPromise = new Promise<never>((_, reject) => {
    rejectLoginTimeout = reject;
    armLoginTimeout();
  });

  const runPromise = (async () => {
    try {
      scopeObj.result = formValues;
      (scopeObj.putLoginInfo as (s: string) => void)(JSON.stringify(formValues));

      scopeObj._ajaxResults = [];
      scopeObj._ajaxReadIndex = 0;
      scopeObj._ajaxWriteIndex = 0;
      suppressResumeToast = false;
      browserAwaitDone = false;
      while (true) {
        try {
          scopeObj.result = formValues;
          (scopeObj.putLoginInfo as (s: string) => void)(JSON.stringify(formValues));
          run(scopeObj, replayScript);
          break;
        } catch (e) {
          if (e instanceof SuspendScript) {
            suppressResumeToast = true;
            let result = '';
            disarmLoginTimeout();
            try {
              try {
                result = await e.promise;
              } catch (err) {
                console.warn(LOG_TAG, 'suspend failed:', err);
                const msg = err instanceof Error ? err.message : String(err);
                result = msg;
                if (e.writeIndex >= 0) {
                  const short = /(\d{3})\s*:?/.exec(msg)?.[1] ?? msg.slice(0, 40);
                  if (onToast) onToast(`登录请求失败: ${short}`, true);
                }
              }
            } finally {
              armLoginTimeout();
            }
            if (e.writeIndex < 0) {
              console.warn(LOG_TAG, '内嵌网页已关闭，继续执行脚本');
              continue;
            }
            const durationMs = Date.now() - e.requestStart;
            recordAjaxDuration(e.resolvedUrl, durationMs);
            (scopeObj._ajaxResults as string[])[e.writeIndex] = result ?? '';
            ajaxCache.set(e.resolvedUrl, result);
            const isLoginUrl = /login|signin|auth/i.test(e.resolvedUrl);
            console.warn(LOG_TAG, 'ajax 完成', {
              url: e.resolvedUrl.slice(0, 70),
              resultLength: result?.length ?? 0,
              isLoginUrl,
            });
            // 书源未调用 cookie.setCookie 时：从登录接口响应中解析 key/token 并写入 cookie 表，供 user_api 等请求使用。
            // login_api 须在 action 重放时由书源写入，勿在重放 login(true) 前写入（否则误判「已登录」）。
            if (result && baseUrl && isLoginUrl && !/\/login_api\b/.test(e.resolvedUrl)) {
              console.warn(LOG_TAG, '登录接口响应，尝试解析 key', {
                url: e.resolvedUrl.slice(0, 80),
                bodyLength: result.length,
                bodyPreview: result.slice(0, 200),
              });
              try {
                const json = JSON.parse(result) as Record<string, unknown>;
                let keyVal = '';
                if (typeof json.key === 'string') keyVal = json.key;
                else if (typeof json.token === 'string') keyVal = json.token;
                else if (typeof json.accessToken === 'string') keyVal = json.accessToken;
                else if (typeof json.cookie === 'string') keyVal = json.cookie;
                else if (typeof json.data === 'string') keyVal = json.data;
                else if (json.data && typeof json.data === 'object' && json.data !== null) {
                  const d = json.data as Record<string, unknown>;
                  keyVal =
                    typeof d.key === 'string'
                      ? d.key
                      : typeof d.token === 'string'
                        ? d.token
                        : typeof (d as Record<string, unknown>)['密钥'] === 'string'
                          ? (d as Record<string, unknown>)['密钥'] as string
                          : '';
                }
                if (!keyVal && typeof (json as Record<string, unknown>)['密钥'] === 'string') {
                  keyVal = (json as Record<string, unknown>)['密钥'] as string;
                }
                if (keyVal) {
                  // 晴天聚合等：服务器与 getKey() 认 qttoken=xxx;deviceId=yyy，与书源 login 内 setCookie 格式一致
                  const deviceId = getOrCreateAndroidId();
                  const cookieValue =
                    /qttoken=/.test(keyVal) || /^[a-zA-Z0-9_-]+=/.test(keyVal)
                      ? keyVal
                      : `qttoken=${keyVal};deviceId=${deviceId}`;
                  cookieStore.set(baseUrl, cookieValue);
                  console.warn(LOG_TAG, '从登录响应写入 cookie', {
                    url: e.resolvedUrl.slice(0, 80),
                    keyPreview: keyVal.slice(0, 40),
                    format: 'qttoken;deviceId',
                  });
                } else {
                  const code = json.code;
                  const msg = typeof json.msg === 'string' ? json.msg : '';
                  console.warn(LOG_TAG, '登录响应中未解析到 key', {
                    url: e.resolvedUrl.slice(0, 80),
                    jsonKeys: Object.keys(json),
                    code,
                    msg,
                  });
                  if (/\/login_api\b/.test(e.resolvedUrl) && code === -1) {
                    const email = String(formValues['邮箱'] ?? '').trim();
                    const password = String(formValues['密码'] ?? '').trim();
                    if (!email || !password) {
                      if (onToast) onToast('请先填写邮箱和密码后再登录', true);
                    } else if (msg && onToast) {
                      onToast(msg, true);
                    }
                  }
                }
              } catch (parseErr) {
                console.warn(LOG_TAG, '登录响应解析失败，无法写入 cookie', {
                  url: e.resolvedUrl.slice(0, 80),
                  error: parseErr,
                  bodyPreview: result.slice(0, 150),
                });
              }
            }
          } else {
            throw e;
          }
        }
      }
      let round = 0;
      while (pending.length > 0) {
        const batch = pending.splice(0, pending.length);
        round += 1;
        console.warn(LOG_TAG, `pending 第 ${round} 轮`, { count: batch.length });
        await Promise.all(batch);
      }
      if (round > 0) console.warn(LOG_TAG, 'pending 已全部完成', { rounds: round });
    } finally {
      try {
        const obj: Record<string, string> = {};
        cookieStore.forEach((v, k) => {
          obj[k] = v;
        });
        const entries = Object.entries(obj);
        if (entries.length > 0) {
          console.warn(LOG_TAG, 'persist cookies to storage', {
            key: cookiesKey,
            count: entries.length,
            keys: entries.map(([k]) => k).slice(0, 10),
          });
          localStorage.setItem(cookiesKey, JSON.stringify(obj));
        } else {
          console.warn(LOG_TAG, 'persist cookies skipped (empty)', { key: cookiesKey });
        }
      } catch (e) {
        console.warn(LOG_TAG, 'persist cookies failed', e);
      }
    }
  })();

  await Promise.race([runPromise, timeoutPromise]);
}

/** 从书源 header 解析出请求头（User-Agent 等），并与脚本传入的 headers 合并 */
function mergeSourceHeaders(
  source: BookSource,
  scriptHeaders?: Record<string, string>
): Record<string, string> {
  const out = { ...(scriptHeaders ?? {}) };
  const raw = (source as Record<string, unknown>).header;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      for (const [k, v] of Object.entries(parsed)) {
        if (v != null && String(v).trim() !== '') out[k] = String(v);
      }
    } catch {
      /* ignore */
    }
  }
  return out;
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
  const headers = mergeSourceHeaders(options.source, options.headers);
  if (
    options.method === 'POST' &&
    typeof options.body === 'string' &&
    options.body.trim().startsWith('{') &&
    !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')
  ) {
    headers['Content-Type'] = 'application/json';
  }
  const common = {
    headers,
    timeout: 12000,
    enableCookieJar: options.source.enabledCookieJar,
    concurrentRate: options.source.concurrentRate,
    allowNon2xx: true, // 登录/检测接口 4xx 时仍返回 body，供书源解析 code/msg
  };
  if (options.method === 'POST') {
    const postBody = options.body;
    const bodyLen = postBody?.length ?? 0;
    if (/\/login_api\b/.test(url)) {
      console.warn(LOG_TAG, 'login_api 请求', {
        method: options.method,
        bodyLen,
        hasContentType: Object.keys(headers).some((k) => k.toLowerCase() === 'content-type'),
        bodyPreview: (postBody ?? '')
          .replace(/"password":"[^"]*"/, '"password":"***"')
          .slice(0, 120),
      });
    }
    if (/\/user_api\b/.test(url)) {
      const cookieHdr = headers.Cookie ?? headers.cookie ?? '';
      console.warn(LOG_TAG, 'user_api 请求', {
        bodyLen,
        hasCookie: Boolean(cookieHdr),
        cookiePreview: String(cookieHdr).replace(/qttoken=([^;]+)/, 'qttoken=***').slice(0, 80),
      });
    }
    const text =
      postBody != null && postBody !== ''
        ? await post(url, postBody, common)
        : await httpRequest(url, { ...common, method: 'POST' }).then((r) => r.text());
    if (/\/login_api\b/.test(url)) {
      try {
        const json = JSON.parse(text) as { code?: number; msg?: string };
        console.warn(LOG_TAG, 'login_api HTTP 响应', { code: json.code, msg: json.msg });
      } catch {
        console.warn(LOG_TAG, 'login_api HTTP 响应非 JSON', {
          preview: text.slice(0, 120),
        });
      }
    }
    return text;
  }
  return httpGet(url, common);
}

/** 待打开 URL 及其 cookie（与 Rust UrlWithCookies 对齐） */
export interface UrlWithCookies {
  url: string;
  cookies: string;
}

/** Rust 侧脚本引擎执行结果（与 src-tauri login_script_engine 对齐） */
export interface RunLoginScriptRustOutput {
  toasts: Array<{ message: string; long: boolean }>;
  argsJson: string;
  loginInfoJson: string;
  urlsToOpen: string[];
  /** 与 urlsToOpen 一一对应，带 cookie 的 URL（新窗口用自定义协议注入 cookie 避免未登录） */
  urlCookies?: UrlWithCookies[];
  /** 本次运行结束时的 cookie 表（JSON），持久化后下次运行传入，使检测登录/用户后台等请求带 cookie */
  cookiesJson?: string;
  error?: string;
}

/**
 * 使用 Rust 侧脚本引擎执行登录（备选）：java.ajax 真阻塞，解析耗时可正确测量。
 * 仅 Tauri 环境有效；需以 cargo build --features login-script-engine 构建。
 * 成功时返回输出（含 loginInfoJson），便于对话框更新表单显示。
 */
export async function runLoginScriptRust(
  source: BookSource,
  options: RunLoginScriptOptions
): Promise<RunLoginScriptRustOutput> {
  const { formValues, action, onToast } = options;
  const baseUrl = getScriptBaseUrl(source);
  const loginUrlScript = (source.loginUrl ?? '').trim();
  if (!loginUrlScript) {
    return { toasts: [], argsJson: '{}', loginInfoJson: '{}', urlsToOpen: [], urlCookies: [], cookiesJson: '{}' };
  }

  const sourceUrl = source.sourceUrl ?? '';
  const loginKey = storageKey(STORAGE_PREFIX_LOGIN, sourceUrl);
  const argsKey = storageKey(STORAGE_PREFIX_ARGS, sourceUrl);
  const cookiesKey = storageKey(STORAGE_PREFIX_COOKIES, sourceUrl);

  const argsJson = (() => {
    try {
      return localStorage.getItem(argsKey) ?? '{}';
    } catch {
      return '{}';
    }
  })();
  const loginInfoJson = (() => {
    try {
      return localStorage.getItem(loginKey) ?? '{}';
    } catch {
      return '{}';
    }
  })();
  const cookiesJson = (() => {
    try {
      return localStorage.getItem(cookiesKey) ?? '{}';
    } catch {
      return '{}';
    }
  })();

  const input = {
    baseUrl,
    loginUrlScript,
    jsLib: String((source as Record<string, unknown>).jsLib ?? ''),
    header: String((source as Record<string, unknown>).header ?? ''),
    formValues: { ...formValues },
    action: (action || '').trim(),
    argsJson,
    loginInfoJson,
    cookiesJson,
    androidId: getOrCreateAndroidId(),
  };

  const output = await invoke<RunLoginScriptRustOutput>('run_login_script_rust', { input });

  if (output.error) {
    throw new Error(output.error);
  }

  for (const t of output.toasts ?? []) {
    if (onToast && t.message?.trim()) onToast(t.message.trim(), t.long);
  }
  try {
    if (output.argsJson != null) localStorage.setItem(argsKey, output.argsJson);
    if (output.loginInfoJson != null) localStorage.setItem(loginKey, output.loginInfoJson);
    if (output.cookiesJson != null) localStorage.setItem(cookiesKey, output.cookiesJson);
  } catch (e) {
    console.warn(LOG_TAG, 'persist args/loginInfo/cookies failed', e);
  }
  const urlCookies = output.urlCookies ?? [];
  if (urlCookies.length > 0) {
    for (const item of urlCookies) {
      if (!item?.url?.trim()) continue;
      const uOpen = item.url.trim();
      if (/^(legado|yuedu):\/\//i.test(uOpen)) {
        void handleReaderImportDeepLink(uOpen);
        continue;
      }
      if (!/^https?:/i.test(uOpen)) continue;
      await openSourceSettingsInApp(item.url.trim(), (item.cookies ?? '').trim()).catch((e) => {
        console.warn(LOG_TAG, 'open with cookies failed, fallback to plain url', e);
        return openSourceSettingsInApp(item.url.trim(), '');
      });
    }
  } else {
    for (const url of output.urlsToOpen ?? []) {
      const u = url?.trim() ?? '';
      if (!u) continue;
      if (/^(legado|yuedu):\/\//i.test(u)) {
        void handleReaderImportDeepLink(u);
        continue;
      }
      if (/^(https?:|data:)/i.test(u)) {
        void openSourceSettingsInApp(u, '');
      }
    }
  }
  return output;
}
