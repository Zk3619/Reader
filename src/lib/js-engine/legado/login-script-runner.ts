/**
 * 书源登录脚本执行环境（Legado with-scope + java.ajax 挂起/恢复）
 * 提供：result、baseUrl、host、source.getLoginInfo/putLoginInfo、getArgument/setArgument、
 * cookie、java（ajax、toast、longToast、androidId、startBrowserAwait）
 */

import type { QuickJSContext } from 'quickjs-emscripten';
import { invoke } from '@tauri-apps/api/core';
import { get as httpGet, post, request as httpRequest } from '@/lib/http';
import { deleteCookie, getCookie } from '@/lib/http/cookie-manager';
import {
  getOrCreateAndroidId,
  legadoJavaAndroidId,
  legadoJavaDeviceID,
  normalizeBookSourceServerUrl,
  persistBookSourceDeviceId,
  resolveBookSourceDeviceId,
  resolveLegadoDeviceId,
  resetLegadoDeviceId,
} from '@/lib/book-source/source-http';
import { patchLegadoLoginUrlScript } from '@/lib/js-engine/legado/login-script-patches';
import { resolveUrl, stripMisplacedCookieFromHttpUrl } from '@/lib/book-source/utils';
import type { BookSource } from '@/types';
import { openLegadoBrowserInApp, openSourceSettingsInApp } from '@/lib/platform/open-url';
import { initQuickJSRuntime, isQuickJSFallback, LEGADO_SUSPEND_MARKER, setGlobalJson } from '@/lib/js-engine/core/runtime';
import {
  applyLegadoAggregationApiHeaders,
  extractLegadoCookieValue,
  extractQttokenKey,
  isInvalidLegadoToken,
  isUserApiPost,
  legadoAggregationApiHtmlHint,
  mergeAjaxCookieHeaders,
  mergeLegadoCookieHeaderStrings,
  normalizeControlSettingsCookieHeader,
  normalizeLegadoCookieHeader,
  normalizeUserApiPostBody,
  parseControlSettingsCookieMap,
  parseLegadoApiJsonResponse,
  resolveUserApiCookieHeader,
} from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { createLoginInjector } from '@/lib/js-engine/legado/login-inject';
import { runLegadoScriptQuickJS } from '@/lib/js-engine/legado/quickjs-runner';
import { handleReaderImportDeepLink } from '@/lib/platform/legado-import-uri';
import { legadoLoginScriptForReplay, wrapLegadoCatchRethrow } from '@/lib/js-engine/legado/script-wrap';
import {
  getScriptBaseUrl,
  getLegadoSourceKey,
  hostsFromJsLib,
  normalizeServerFieldsInSourceArgs,
  STORAGE_PREFIX_ARGS,
  STORAGE_PREFIX_COOKIES,
  storageKey,
} from '@/lib/js-engine/legado/source-script-shared';
import { installScriptDateShim } from '@/lib/js-engine/legado/script-date-shim';
import { SuspendScript } from '@/lib/js-engine/legado/suspend-script';

const SCRIPT_TIMEOUT_MS = 20000;
const MAX_LOGIN_SUSPEND_ROUNDS = 32;

function isLogoutLoginAction(action: string): boolean {
  return /^\s*logout\s*\(\s*\)\s*$/i.test(action.trim());
}

function isClearDeviceLoginAction(action: string): boolean {
  return /^\s*clearDevice\s*\(\s*\)\s*$/i.test(action.trim());
}

function normalizeToastText(msg: unknown): string {
  const text = msg == null ? '' : String(msg).trim();
  if (!text || text === 'undefined' || text === 'null') return '';
  return text;
}

/** 对齐 propagateLegadoCookieToStore：删除同一 server 在 store 中的全部键 */
function removeCookiesForUrlInStore(
  store: Map<string, string>,
  url: string,
  baseUrl?: string,
): void {
  const k = String(url ?? '').trim();
  if (!k) return;
  const toDelete = new Set<string>([k]);
  if (baseUrl?.trim()) toDelete.add(baseUrl.trim());
  try {
    const origin = new URL(k.includes('://') ? k : `https://${k}`).origin;
    toDelete.add(origin);
    for (const key of store.keys()) {
      if (key === origin || key.startsWith(`${origin}/`) || key.replace(/\/+$/, '') === origin) {
        toDelete.add(key);
      }
    }
  } catch {
    /* ignore */
  }
  for (const key of toDelete) store.delete(key);
}
/** startBrowserAwait 挂起索引（与 ajax writeIndex 区分，避免写入 ajax 回放队列） */
const BROWSER_SUSPEND_WRITE_INDEX = -1;
const STORAGE_PREFIX_LOGIN = 'reader_source_login_';

const LOG_TAG = '[login-script]';

function innerWebPoolOpts(source: BookSource): { bookSourceUrl?: string } {
  const url = (source.bookSourceUrl ?? source.sourceUrl)?.trim();
  return url ? { bookSourceUrl: url } : {};
}

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

/** 将 control 页 Cookie 写回 source.getVariable()（对齐 applyCookieSettings / 发现页 getArguments） */
export function syncControlSettingsToSourceArgs(
  source: BookSource,
  cookieHeader: string,
): void {
  const map = parseControlSettingsCookieMap(cookieHeader);
  if (map.size === 0) return;
  const argsKey = storageKey(STORAGE_PREFIX_ARGS, getLegadoSourceKey(source));
  try {
    const raw = localStorage.getItem(argsKey) ?? '{}';
    const obj = (JSON.parse(raw) as Record<string, string>) || {};
    for (const [key, value] of map) {
      const lk = key.toLowerCase();
      if (lk === 'qttoken' || lk === 'deviceid' || lk === 'device') continue;
      obj[key] = value;
    }
    normalizeServerFieldsInSourceArgs(obj);
    localStorage.setItem(argsKey, JSON.stringify(obj));
    console.warn(LOG_TAG, 'control 设置已同步到书源变量', {
      keys: [...map.keys()].filter((k) => !/^qttoken$/i.test(k)).slice(0, 12),
    });
  } catch (e) {
    console.warn(LOG_TAG, 'syncControlSettingsToSourceArgs failed', e);
  }
}

function mirrorControlCookieToSourceHosts(
  store: Map<string, string>,
  cookieHeader: string,
  source: BookSource,
  anchorUrl: string,
): void {
  const incoming = normalizeControlSettingsCookieHeader(cookieHeader);
  if (!incoming) return;
  const base = getScriptBaseUrl(source);
  const targets = new Set<string>();
  const add = (u: string) => {
    const t = u.trim();
    if (t.startsWith('http')) targets.add(t);
  };
  add(anchorUrl);
  const controlBase = anchorUrl.replace(/\/control\/?$/i, '');
  if (controlBase) add(controlBase);
  if (base) add(base);
  for (const h of hostsFromJsLib((source as Record<string, unknown>).jsLib)) add(h);
  for (const u of targets) {
    mergePlainCookieHeaderIntoStore(store, u, incoming, base);
  }
}

function syncWebViewCookiesToStore(
  store: {
    getCookie: (url: string) => string;
    setCookie: (url: string, value: string) => void;
    _store?: Map<string, string>;
  },
  source: BookSource,
  baseUrl: string,
  resolved: string,
  cookies: string,
  guard?: BrowserCookieSyncGuard
): void {
  const incoming = normalizeControlSettingsCookieHeader(cookies.trim());
  if (!incoming) {
    console.warn(LOG_TAG, '内嵌页 √ 未读到设置 Cookie，保留脚本表原值', {
      resolved: resolved.slice(0, 80),
    });
    return;
  }
  if (!isAuthOnlyLegadoCookieHeader(incoming)) {
    console.warn(LOG_TAG, '内嵌页 √ 同步 WebView Cookie（含非登录键）', {
      resolved: resolved.slice(0, 80),
      preview: incoming.replace(/qttoken=([^;]+)/i, 'qttoken=***').slice(0, 160),
    });
  }

  syncControlSettingsToSourceArgs(source, incoming);

  if (store._store instanceof Map) {
    mergePlainCookieHeaderIntoStore(store._store, resolved, incoming, baseUrl);
    mirrorControlCookieToSourceHosts(store._store, incoming, source, resolved);
  } else {
    const targets = new Set<string>([resolved]);
    const controlBase = resolved.replace(/\/control\/?$/i, '');
    if (controlBase && controlBase !== resolved) targets.add(controlBase);
    try {
      targets.add(new URL(resolved).origin);
    } catch {
      /* ignore */
    }
    if (baseUrl?.trim()) targets.add(baseUrl.trim());

    for (const target of targets) {
      const existing = getScriptCookieForUrl(store, target, baseUrl);
      const merged = existing
        ? mergeLegadoCookieHeaderStrings(existing, incoming)
        : incoming;
      store.setCookie(target, merged);
    }
  }
  guard?.recordSync(resolved);
}

function resolveBrowserOpenUrl(raw: string, baseUrl: string): string {
  const toOpen = raw.startsWith('data:') ? raw : urlForOpen(raw);
  const t = toOpen.trim();
  if (/^https?:/i.test(t)) {
    return stripMisplacedCookieFromHttpUrl(t);
  }
  if (/^(data:|legado:|yuedu:)/i.test(t)) {
    return t;
  }
  const resolved =
    baseUrl && !toOpen.startsWith('data:') ? resolveUrl(baseUrl, toOpen) : toOpen;
  return /^https?:/i.test(resolved)
    ? stripMisplacedCookieFromHttpUrl(resolved)
    : resolved;
}

/** 从脚本 Cookie 表按 URL 回退读取（勿经 cookieObj.getCookie，避免与 getScriptCookieForUrl 互调） */
function getCookieFromStore(
  store: Map<string, string>,
  resolved: string,
  baseUrl: string,
  options?: { omitBaseUrlFallback?: boolean },
): string {
  const read = (u: string) => (u?.trim() ? store.get(u.trim()) ?? '' : '');
  const controlBase = resolved.replace(/\/control\/?$/i, '');
  let cookieStr =
    read(resolved) ||
    (controlBase && controlBase !== resolved ? read(controlBase) : '');
  if (!cookieStr && !options?.omitBaseUrlFallback && baseUrl) {
    cookieStr = read(baseUrl);
  }
  if (
    !cookieStr &&
    resolved.startsWith('http') &&
    !/\/control\/?$/i.test(resolved)
  ) {
    const withControl = `${resolved.replace(/\/+$/, '')}/control`;
    cookieStr = read(withControl);
  }
  if (!cookieStr && resolved.startsWith('http')) {
    try {
      const u = new URL(resolved);
      cookieStr =
        read(u.origin) ||
        read(u.hostname) ||
        read(`https://${u.hostname}`) ||
        '';
    } catch {
      /* ignore */
    }
  }
  return cookieStr;
}

function getScriptCookieForUrl(
  cookieObj: { getCookie: (url: string) => string; _store?: Map<string, string> },
  resolved: string,
  baseUrl: string,
  options?: { omitBaseUrlFallback?: boolean },
): string {
  if (cookieObj._store instanceof Map) {
    return getCookieFromStore(cookieObj._store, resolved, baseUrl, options);
  }
  return cookieObj.getCookie(resolved) || '';
}

/** 与书源脚本 cookie 表一致（键可为 origin 或 fanqienovel.com 等裸 host） */
export function readSourceCookieStore(source: BookSource): Map<string, string> {
  const store = new Map<string, string>();
  const cookiesKey = storageKey(STORAGE_PREFIX_COOKIES, getLegadoSourceKey(source));
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
    const login = getStoredLoginInfo(getLegadoSourceKey(source));
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
  const raw = getScriptCookieForUrl(cookieObj, resolved, baseUrl).trim();
  if (!raw) return '';
  if (isPlainCookieHeader(raw)) {
    return normalizeControlSettingsCookieHeader(raw);
  }
  return normalizeLegadoCookieHeader(raw, getOrCreateAndroidId());
}

/** 是否可在应用内打开（http(s) 或 data:，用于 startBrowser） */
function isOpenableUrl(url: string): boolean {
  return /^(https?:|data:)/i.test((url ?? '').trim());
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
 * 清除该书源在本地的登录态（cookie、登录信息、args.qttoken/密钥）。
 * 书源 Cookie 存在 Reader 的 localStorage（非浏览器 Cookie），须显式清除。
 */
export async function clearSourceLoginState(
  source: BookSource,
  options?: { resetDeviceId?: boolean },
): Promise<void> {
  if (!source || typeof source !== 'object') {
    console.warn(LOG_TAG, 'clearSourceLoginState: source 无效', source);
    return;
  }
  const src = source as Record<string, unknown>;
  const sourceUrl = getLegadoSourceKey(source);
  const cookiesKey = storageKey(STORAGE_PREFIX_COOKIES, sourceUrl);
  const loginKey = storageKey(STORAGE_PREFIX_LOGIN, sourceUrl);
  const argsKey = storageKey(STORAGE_PREFIX_ARGS, sourceUrl);

  console.warn(LOG_TAG, 'clearSourceLoginState 开始', {
    cookiesKey,
    sourceUrl: sourceUrl.slice(0, 60),
    resetDeviceId: Boolean(options?.resetDeviceId),
  });

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
  } catch (e) {
    console.warn(LOG_TAG, 'clearSourceLoginState localStorage 失败', e);
  }

  if (options?.resetDeviceId) {
    resetLegadoDeviceId();
  }

  const hosts = new Set<string>();
  const baseUrl = getScriptBaseUrl(source);
  if (baseUrl) hosts.add(baseUrl);
  for (const h of hostsFromJsLib(src.jsLib)) hosts.add(h);

  for (const host of hosts) {
    try {
      if (/^https?:\/\//i.test(host)) await deleteCookie(host);
    } catch (e) {
      console.warn(LOG_TAG, 'clearSourceLoginState deleteCookie 失败', host, e);
    }
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
  const sourceUrl = getLegadoSourceKey(source);
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
  const baseUrl = getScriptBaseUrl(source);
  const resolved =
    baseUrl && !targetUrl.trim().startsWith('data:')
      ? resolveUrl(baseUrl, targetUrl.trim())
      : targetUrl.trim();
  const raw = getCookieFromStore(store, resolved, baseUrl, options);
  if (!raw.trim()) return '';
  if (isPlainCookieHeader(raw) && !isAuthOnlyLegadoCookieHeader(raw)) {
    return normalizeControlSettingsCookieHeader(raw);
  }
  return normalizeLegadoCookieHeader(raw, resolveLegadoDeviceId(raw, source));
}

/** 合并该书源 cookie 表中所有域（如聚合站 + 番茄登录域） */
export function getStoredSourceCookiesMerged(source: BookSource): string {
  const sourceUrl = getLegadoSourceKey(source);
  const cookiesKey = storageKey(STORAGE_PREFIX_COOKIES, sourceUrl);
  let merged = '';
  try {
    const raw = localStorage.getItem(cookiesKey);
    if (!raw) return merged;
    const obj = JSON.parse(raw) as Record<string, string>;
    if (!obj || typeof obj !== 'object') return merged;
    for (const value of Object.values(obj)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const part = normalizeStoredSourceCookieValue(value, source);
      if (!part) continue;
      merged = merged ? mergeLegadoCookieHeaderStrings(merged, part) : part;
    }
  } catch {
    /* ignore */
  }
  return merged;
}

/** 打开 /control 等书源设置内嵌页：合并当前 URL 键与全表，避免只注入 qttoken */
export function getStoredSourceCookiesForInnerWeb(
  source: BookSource,
  targetUrl: string,
): string {
  const perUrl = getStoredSourceCookiesForUrl(source, targetUrl).trim();
  const isControl = /\/control\/?$/i.test(targetUrl.trim());
  if (!isControl) return perUrl;
  const mergedAll = getStoredSourceCookiesMerged(source).trim();
  if (!perUrl && !mergedAll) return '';
  if (!perUrl) return mergedAll;
  if (!mergedAll) return perUrl;
  return normalizeControlSettingsCookieHeader(
    mergeLegadoCookieHeaderStrings(mergedAll, perUrl),
  );
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
/** 最近一次 login_api HTTP 响应（含 Set-Cookie），供登录结束后写入书源 cookie 表 */
let lastLoginApiHttpCapture: { url: string; body: string; setCookie: string } | null = null;

function resetLoginApiHttpCapture(): void {
  lastLoginApiHttpCapture = null;
}

function readSetCookieHeader(headers: Record<string, string>): string {
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'set-cookie' && v) return v;
  }
  return '';
}

function extractLoginKeyFromJson(json: Record<string, unknown>): string {
  const pick = (v: unknown): string => {
    if (v == null || v === '') return '';
    const s = String(v).trim();
    return isInvalidLegadoToken(s) ? '' : s;
  };
  let keyVal = pick(json.key);
  if (!keyVal) keyVal = pick(json.token);
  if (!keyVal) keyVal = pick(json.accessToken);
  if (!keyVal) keyVal = pick(json.cookie);
  if (!keyVal && typeof json.data === 'string') keyVal = pick(json.data);
  if (!keyVal && json.data && typeof json.data === 'object' && json.data !== null) {
    const d = json.data as Record<string, unknown>;
    keyVal = pick(d.key) || pick(d.token) || pick(d['密钥']);
  }
  if (!keyVal) keyVal = pick(json['密钥']);
  return keyVal;
}

function formatLegadoQttokenCookie(tokenOrCookie: string, deviceId: string): string {
  const raw = String(tokenOrCookie ?? '').trim();
  if (!raw) return '';
  if (/qttoken=/i.test(raw) || /^[a-zA-Z0-9_-]+=/.test(raw)) {
    return normalizeLegadoCookieHeader(raw, deviceId);
  }
  return normalizeLegadoCookieHeader(`qttoken=${raw};deviceId=${deviceId}`, deviceId);
}

function propagateLegadoCookieToStore(
  cookieStore: Map<string, string>,
  targetUrl: string,
  cookieValue: string,
  baseUrl?: string,
): void {
  const trimmed = String(cookieValue ?? '').trim();
  if (!trimmed || !extractQttokenKey(trimmed)) return;
  const write = (key: string) => {
    const k = String(key ?? '').trim();
    if (!k) return;
    cookieStore.set(k, trimmed);
    try {
      cookieStore.set(new URL(k.includes('://') ? k : `https://${k}`).origin, trimmed);
    } catch {
      /* ignore */
    }
  };
  write(targetUrl);
  write(normalizeBookSourceServerUrl(targetUrl));
  const controlBase = targetUrl.replace(/\/control\/?$/i, '');
  if (controlBase && controlBase !== targetUrl) {
    write(controlBase);
    write(normalizeBookSourceServerUrl(controlBase));
  }
  if (baseUrl?.trim()) {
    write(baseUrl);
    write(normalizeBookSourceServerUrl(baseUrl));
  }
}

function sanitizeLegadoCookieValue(value: string, deviceId: string): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  const token = extractQttokenKey(trimmed);
  if (!token) return '';
  if (isPlainCookieHeader(trimmed) && !isAuthOnlyLegadoCookieHeader(trimmed)) {
    const authPart = formatLegadoQttokenCookie(trimmed, deviceId);
    if (!authPart) return '';
    const settingsParts: string[] = [];
    for (const [key, val] of parseCookieHeaderPartsLocal(trimmed)) {
      const lk = key.toLowerCase();
      if (lk !== 'qttoken' && lk !== 'deviceid' && lk !== 'device') {
        settingsParts.push(`${key}=${val}`);
      }
    }
    const settingsStr = settingsParts.join('; ');
    return settingsStr
      ? mergeLegadoCookieHeaderStrings(authPart, settingsStr)
      : authPart;
  }
  return formatLegadoQttokenCookie(trimmed, deviceId);
}

function persistScriptCookieStoreToLocal(
  cookieStore: Map<string, string>,
  cookiesKey: string,
): void {
  try {
    const obj: Record<string, string> = {};
    cookieStore.forEach((v, k) => {
      obj[k] = v;
    });
    if (Object.keys(obj).length > 0) {
      localStorage.setItem(cookiesKey, JSON.stringify(obj));
    }
  } catch (e) {
    console.warn(LOG_TAG, 'persist cookies failed', e);
  }
}

/** @internal compat tests */
export function sanitizeLegadoCookieValueForStore(
  value: string,
  deviceId: string,
): string {
  return sanitizeLegadoCookieValue(value, deviceId);
}

function parseCookieHeaderPartsLocal(cookieStr: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of String(cookieStr ?? '').split(';')) {
    const t = part.trim();
    const i = t.indexOf('=');
    if (i > 0) map.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
  }
  return map;
}

/** Legado 登录态 Cookie 通常仅 qttoken / deviceId（对齐 CookieStore 单键登录与书源设置多键并存） */
function isAuthOnlyLegadoCookieHeader(cookieStr: string): boolean {
  const map = parseCookieHeaderPartsLocal(cookieStr);
  if (map.size === 0) return true;
  for (const key of map.keys()) {
    const lk = key.toLowerCase();
    if (lk !== 'qttoken' && lk !== 'deviceid' && lk !== 'device') return false;
  }
  return true;
}

/**
 * 书源脚本 objectToCookieString / WebView 读出的多键 `name=value; …` 串。
 * 含 qttoken 时若还有其它键，仍按整段合并（勿走 propagate 仅写 token）。
 */
function isPlainCookieHeader(value: string): boolean {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('[')) return false;
  if (!/=/.test(trimmed)) return false;
  return !extractQttokenKey(trimmed) || !isAuthOnlyLegadoCookieHeader(trimmed);
}

/** 书源表单条 Cookie：保留 mem_* 等设置键，勿 normalizeLegado 剥除 */
function normalizeStoredSourceCookieValue(value: string, source: BookSource): string {
  const v = value.trim();
  if (!v) return '';
  if (isPlainCookieHeader(v) && !isAuthOnlyLegadoCookieHeader(v)) {
    return normalizeControlSettingsCookieHeader(v);
  }
  if (isAuthOnlyLegadoCookieHeader(v)) {
    return normalizeLegadoCookieHeader(v, resolveLegadoDeviceId(v, source));
  }
  const token = extractQttokenKey(v);
  if (token) {
    return sanitizeLegadoCookieValue(v, resolveLegadoDeviceId(v, source));
  }
  return normalizeControlSettingsCookieHeader(v);
}

function mergePlainCookieHeaderIntoStore(
  store: Map<string, string>,
  targetUrl: string,
  cookieHeader: string,
  baseUrl?: string,
): void {
  const incoming = normalizeControlSettingsCookieHeader(cookieHeader);
  if (!incoming) return;
  const targets = new Set<string>();
  const k = targetUrl.trim();
  if (!k) return;
  targets.add(k);
  const controlBase = k.replace(/\/control\/?$/i, '');
  if (controlBase && controlBase !== k) targets.add(controlBase);
  try {
    targets.add(new URL(k.includes('://') ? k : `https://${k}`).origin);
  } catch {
    /* ignore */
  }
  if (baseUrl?.trim()) targets.add(baseUrl.trim());

  for (const t of targets) {
    const existing = getCookieFromStore(store, t, baseUrl ?? '');
    store.set(
      t,
      existing ? mergeLegadoCookieHeaderStrings(existing, incoming) : incoming,
    );
  }
}

function setCookieInScriptStore(
  store: Map<string, string>,
  url: string,
  value: string,
  baseUrl: string,
  guard?: BrowserCookieSyncGuard,
): void {
  if (guard?.shouldSkipOverwrite(url)) {
    console.warn(LOG_TAG, '跳过 setCookie（control 重放阶段，避免 getVariable 旧值覆盖内嵌页同步结果）', {
      url: (url || baseUrl).slice(0, 80),
    });
    return;
  }
  const k = url || baseUrl;
  const raw = String(value ?? '').trim();
  if (!raw) return;

  if (isPlainCookieHeader(raw)) {
    mergePlainCookieHeaderIntoStore(store, k, raw, baseUrl);
  }

  const cleaned = sanitizeLegadoCookieValue(raw, getOrCreateAndroidId());
  if (cleaned) {
    if (isAuthOnlyLegadoCookieHeader(raw)) {
      propagateLegadoCookieToStore(store, k, cleaned, baseUrl);
    } else {
      mergePlainCookieHeaderIntoStore(store, k, cleaned, baseUrl);
    }
    return;
  }
  if (isPlainCookieHeader(raw)) return;

  console.warn(LOG_TAG, 'skip setCookie: invalid qttoken', {
    url: k.slice(0, 80),
  });
}

export function legadoCookieGetKey(
  _store: Map<string, string>,
  getCookieFn: (url: string) => string,
  cookieStrOrUrl: string,
  keyName?: string,
  source?: BookSource,
): string {
  let s: string;
  if (keyName != null && keyName !== '') {
    s = getCookieFn(cookieStrOrUrl);
  } else {
    s = String(cookieStrOrUrl ?? '').trim();
  }
  const searchKey = keyName != null && keyName !== '' ? keyName : 'qttoken';
  if (searchKey === 'device' || searchKey === 'deviceId') {
    return resolveLegadoDeviceId(s, source);
  }
  if (!s) return '';
  if (searchKey === 'qttoken') {
    const token = extractQttokenKey(s);
    return token;
  }
  return extractLegadoCookieValue(s, searchKey);
}

function sanitizeLegadoCookieStore(cookieStore: Map<string, string>, deviceId: string): void {
  for (const [key, value] of Array.from(cookieStore.entries())) {
    const cleaned = sanitizeLegadoCookieValue(value, deviceId);
    if (!cleaned) cookieStore.delete(key);
    else if (cleaned !== value) cookieStore.set(key, cleaned);
  }
}

function applyLoginKeyToStore(
  cookieStore: Map<string, string>,
  baseUrl: string,
  keyVal: string,
  deviceId: string,
): void {
  const cookieValue = formatLegadoQttokenCookie(keyVal, deviceId);
  if (!cookieValue) return;
  propagateLegadoCookieToStore(cookieStore, baseUrl, cookieValue, baseUrl);
}

function persistQttokenToArgsAndLoginInfo(
  keyVal: string,
  formValues: Record<string, string>,
  loginKey: string,
  argsKey: string,
): void {
  const token = extractQttokenKey(keyVal) || keyVal;
  if (!token) return;
  try {
    const rawArgs = localStorage.getItem(argsKey) ?? '{}';
    const args = (JSON.parse(rawArgs) as Record<string, string>) || {};
    args.qttoken = token;
    localStorage.setItem(argsKey, JSON.stringify(args));
  } catch {
    /* ignore */
  }
  try {
    const rawLogin = localStorage.getItem(loginKey) ?? JSON.stringify(formValues);
    const login = (JSON.parse(rawLogin) as Record<string, string>) || { ...formValues };
    login['密钥'] = token;
    localStorage.setItem(loginKey, JSON.stringify(login));
  } catch {
    /* ignore */
  }
}

function applySetCookieHeaderToStore(
  cookieStore: Map<string, string>,
  baseUrl: string,
  setCookieHeader: string,
  deviceId: string,
): boolean {
  const header = String(setCookieHeader ?? '').trim();
  if (!header) return false;
  const parts = header.split(/,(?=[^;]+=)/);
  let applied = false;
  for (const part of parts) {
    const nv = part.trim().split(';')[0]?.trim() ?? '';
    const eq = nv.indexOf('=');
    if (eq <= 0) continue;
    const name = nv.slice(0, eq).trim();
    const value = nv.slice(eq + 1).trim();
    if (!name || isInvalidLegadoToken(value)) continue;
    if (/^qttoken$/i.test(name)) {
      applyLoginKeyToStore(cookieStore, baseUrl, value, deviceId);
      applied = true;
    }
  }
  return applied;
}

async function syncLegadoCookieStoreFromHttpJar(
  source: BookSource,
  baseUrl: string,
  cookieStore: Map<string, string>,
): Promise<void> {
  if (!source.enabledCookieJar) return;
  const deviceId = getOrCreateAndroidId();
  const urls = new Set<string>([baseUrl]);
  try {
    const raw = localStorage.getItem(storageKey(STORAGE_PREFIX_ARGS, getLegadoSourceKey(source)));
    if (raw) {
      const server = (JSON.parse(raw) as Record<string, unknown>).server;
      if (typeof server === 'string' && server.trim()) urls.add(server.trim());
    }
  } catch {
    /* ignore */
  }
  for (const u of urls) {
    try {
      const jar = (await getCookie(u))?.trim();
      if (!jar) continue;
      const cleaned = sanitizeLegadoCookieValue(jar, deviceId);
      if (cleaned) propagateLegadoCookieToStore(cookieStore, u, cleaned, baseUrl);
    } catch {
      /* ignore */
    }
  }
}

async function verifyLegadoUserApiSession(
  source: BookSource,
  serverUrl: string,
  cookieStore: Map<string, string>,
): Promise<boolean> {
  const stored =
    cookieStore.get(serverUrl) ||
    cookieStore.get(`${serverUrl}/`) ||
    cookieStore.get(new URL(serverUrl).origin);
  if (!stored?.trim()) return false;

  const url = `${serverUrl.replace(/\/+$/, '')}/user_api`;
  try {
    const headers = applyLegadoAggregationApiHeaders(
      url,
      mergeSourceHeaders(source, {
        Cookie: normalizeLegadoCookieHeader(stored, resolveLegadoDeviceId(stored)),
      }),
    );
    const response = await httpRequest(url, {
      method: 'POST',
      headers,
      enableCookieJar: source.enabledCookieJar,
      allowNon2xx: true,
      timeout: 12_000,
    });
    const text = await response.text();
    const json = parseLegadoApiJsonResponse(text);
    if (!json) {
      console.warn(LOG_TAG, 'user_api 登录校验失败：响应非 JSON', {
        preview: text.slice(0, 120),
        hint: text.trim().startsWith('<') ? legadoAggregationApiHtmlHint() : undefined,
      });
      return false;
    }
    const ok = json.id != null;
    console.warn(LOG_TAG, 'user_api 登录校验', {
      ok,
      msg: typeof json.msg === 'string' ? json.msg.slice(0, 80) : undefined,
    });
    return ok;
  } catch (e) {
    console.warn(LOG_TAG, 'user_api 登录校验失败', e);
    return false;
  }
}

function resolveLoginServerUrl(source: BookSource, baseUrl: string): string {
  try {
    const raw = localStorage.getItem(storageKey(STORAGE_PREFIX_ARGS, getLegadoSourceKey(source)));
    if (raw) {
      const server = (JSON.parse(raw) as Record<string, unknown>).server;
      if (typeof server === 'string' && /^https?:\/\//i.test(server.trim())) {
        return normalizeBookSourceServerUrl(server.trim());
      }
    }
  } catch {
    /* ignore */
  }
  return normalizeBookSourceServerUrl(baseUrl);
}

async function finalizeLegadoLoginCookies(options: {
  source: BookSource;
  baseUrl: string;
  cookieStore: Map<string, string>;
  formValues: Record<string, string>;
  loginKey: string;
  argsKey: string;
  isLoginAction: boolean;
}): Promise<void> {
  const { source, baseUrl, cookieStore, formValues, loginKey, argsKey, isLoginAction } = options;
  const deviceId = resolveBookSourceDeviceId(source);
  const serverUrl = resolveLoginServerUrl(source, baseUrl);

  if (isLoginAction && lastLoginApiHttpCapture) {
    const { body, setCookie, url } = lastLoginApiHttpCapture;
    let keyFromApi = '';
    const loginJson = parseLegadoApiJsonResponse(body);
    if (loginJson) {
      const code = loginJson.code;
      if (code === 0 || code === '0') {
        keyFromApi = extractLoginKeyFromJson(loginJson);
      }
      console.warn(LOG_TAG, 'login_api 解析', {
        url: url.slice(0, 80),
        bodyLen: body.length,
        jsonKeys: Object.keys(loginJson),
        keyLen: keyFromApi.length,
        hasValidKey: Boolean(keyFromApi),
      });
    } else if (body.trim().startsWith('<')) {
      console.warn(LOG_TAG, 'login_api 返回 HTML 而非 JSON', {
        url: url.slice(0, 80),
        bodyPreview: body.slice(0, 120),
        hint: legadoAggregationApiHtmlHint(),
      });
    }

    let keyVal = keyFromApi || resolveLoginFormKey(formValues, loginKey, argsKey);

    if (keyVal) {
      applyLoginKeyToStore(cookieStore, serverUrl, keyVal, deviceId);
      persistQttokenToArgsAndLoginInfo(keyVal, formValues, loginKey, argsKey);
      persistBookSourceDeviceId(source, deviceId);
    } else if (setCookie) {
      applySetCookieHeaderToStore(cookieStore, serverUrl, setCookie, deviceId);
    }

    const storedForVerify =
      cookieStore.get(serverUrl) ||
      cookieStore.get(`${serverUrl}/`) ||
      (() => {
        try {
          return cookieStore.get(new URL(serverUrl).origin);
        } catch {
          return undefined;
        }
      })();
    const hasSessionMaterial =
      Boolean(keyVal) || Boolean(extractQttokenKey(storedForVerify ?? ''));

    let sessionOk = false;
    if (hasSessionMaterial) {
      sessionOk = await verifyLegadoUserApiSession(source, serverUrl, cookieStore);
      if (!sessionOk) {
        const formKey = resolveLoginFormKey(formValues, loginKey, argsKey);
        if (formKey && formKey !== keyVal) {
          applyLoginKeyToStore(cookieStore, serverUrl, formKey, deviceId);
          persistQttokenToArgsAndLoginInfo(formKey, formValues, loginKey, argsKey);
          sessionOk = await verifyLegadoUserApiSession(source, serverUrl, cookieStore);
        }
      }
    }

    if (!sessionOk) {
      console.warn(LOG_TAG, 'login 后 user_api 未通过，/content 可能失败', {
        serverUrl,
        hadValidApiKey: Boolean(keyFromApi),
        skippedVerify: !hasSessionMaterial,
        hint: !keyFromApi && body.trim().startsWith('<')
          ? legadoAggregationApiHtmlHint()
          : '请填写登录表单「密钥」后重新登录，或确认晴天账号已开通',
      });
    }
  }

  await syncLegadoCookieStoreFromHttpJar(source, baseUrl, cookieStore);
  sanitizeLegadoCookieStore(cookieStore, deviceId);
}

function parseLoginKeyFromResponse(
  result: string,
  baseUrl: string,
  cookieStore: Map<string, string>,
  resolvedUrl: string
): void {
  if (!result || !baseUrl || !/login|signin|auth/i.test(resolvedUrl)) return;
  try {
    const json = JSON.parse(result) as Record<string, unknown>;
    const keyVal = extractLoginKeyFromJson(json);
    if (keyVal) {
      applyLoginKeyToStore(cookieStore, baseUrl, keyVal, getOrCreateAndroidId());
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
  keys: {
    loginKey: string;
    argsKey: string;
    cookiesKey: string;
    baseUrl: string;
    loginUrlScript: string;
    skipLoginPersistence?: boolean;
    isClearDeviceAction?: boolean;
  },
): Promise<boolean> {
  await initQuickJSRuntime();
  if (isQuickJSFallback()) return false;

  const { formValues, action, onToast } = options;
  const {
    loginKey,
    argsKey,
    cookiesKey,
    baseUrl,
    loginUrlScript,
    skipLoginPersistence = false,
    isClearDeviceAction = false,
  } = keys;
  const sourceUrl = getLegadoSourceKey(source);

  let suppressResumeToast = false;
  const isWaitingToast = (msg?: string) =>
    typeof msg === 'string' && (/正在检测|请稍等|正在登录中/.test(msg));

  const toast = (msg?: string) => {
    if (suppressResumeToast && isWaitingToast(msg)) return;
    const text = normalizeToastText(msg);
    if (text && onToast) onToast(text, false);
  };
  const longToast = (msg?: string) => {
    if (suppressResumeToast && isWaitingToast(msg)) return;
    const text = normalizeToastText(msg);
    if (text && onToast) onToast(text, true);
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
      return getCookieFromStore(this._store, url || baseUrl, baseUrl);
    },
    setCookie(url: string, value: string): void {
      setCookieInScriptStore(this._store, url, value, baseUrl, browserCookieGuard);
    },
    removeCookie(url: string): void {
      removeCookiesForUrlInStore(this._store, url || baseUrl, baseUrl);
    },
    getKey(cookieStrOrUrl: string, keyName?: string): string {
      return legadoCookieGetKey(
        this._store,
        (u) => getCookieFromStore(this._store, u, baseUrl),
        cookieStrOrUrl,
        keyName,
      );
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
    if (!skipLoginPersistence) setGlobalJson(vm, 'result', formValues);
  };

  try {
    if (!skipLoginPersistence) {
      try {
        localStorage.setItem(loginKey, JSON.stringify(formValues));
      } catch {
        /* ignore */
      }
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
          getDeviceId: () => resolveBookSourceDeviceId(source),
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
              normalizeServerFieldsInSourceArgs(obj);
              localStorage.setItem(argsKey, JSON.stringify(obj));
            } catch (e) {
              console.warn(LOG_TAG, 'setArgument failed:', e);
            }
          },
          putLoginInfo: (jsonStr) => {
            if (skipLoginPersistence) return;
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
              if (skipLoginPersistence) return false;
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
            androidId: legadoJavaAndroidId,
            deviceID: legadoJavaDeviceID,
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
                  ? openLegadoBrowserInApp(resolved, cookieStr, title, innerWebPoolOpts(source))
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
              pending.push(
                openLegadoBrowserInApp(resolved, cookieStr, undefined, innerWebPoolOpts(source)),
              );
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
            const p = openLegadoBrowserInApp(resolved, cookieStr, title, {
              awaitClose: true,
              ...innerWebPoolOpts(source),
            })
              .then((r) => {
                console.warn(LOG_TAG, 'startBrowserAwait 已关闭', {
                  confirmed: r.confirmed,
                  cookieLen: (r.cookies ?? '').length,
                });
                if (r.confirmed && r.cookies?.trim()) {
                  syncWebViewCookiesToStore(
                    cookieObj,
                    source,
                    baseUrl,
                    resolved,
                    r.cookies,
                    browserCookieGuard
                  );
                  persistScriptCookieStoreToLocal(cookieStore, cookiesKey);
                } else if (r.confirmed) {
                  console.warn(LOG_TAG, 'startBrowserAwait √ 但 cookies 为空，未写入脚本表');
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
          const json = parseLegadoApiJsonResponse(body);
          if (json) {
            const parsedKey = extractLoginKeyFromJson(json);
            console.warn(LOG_TAG, 'login_api 响应', {
              code: json.code,
              msg: json.msg,
              bodyLen: body.length,
              hasValidKey: Boolean(parsedKey),
              keyLen: parsedKey.length,
            });
          } else {
            console.warn(LOG_TAG, 'login_api 响应非 JSON', {
              bodyPreview: body.slice(0, 120),
              hint: body.trim().startsWith('<') ? legadoAggregationApiHtmlHint() : undefined,
            });
          }
        }
        if (/\/user_api\b/.test(url)) {
          const json = parseLegadoApiJsonResponse(body);
          if (json) {
            console.warn(LOG_TAG, 'user_api 响应', {
              code: json.code,
              msg: json.msg,
              hasId: json.id != null,
            });
          } else {
            console.warn(LOG_TAG, 'user_api 响应非 JSON', {
              bodyPreview: body.slice(0, 120),
              hint: body.trim().startsWith('<') ? legadoAggregationApiHtmlHint() : undefined,
            });
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

    if (skipLoginPersistence) {
      cookieStore.clear();
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
      } catch {
        /* ignore */
      }
    } else {
      const isLoginAction = /login\s*\(\s*true\s*\)/.test(actionTrim);
      await finalizeLegadoLoginCookies({
        source,
        baseUrl,
        cookieStore,
        formValues,
        loginKey,
        argsKey,
        isLoginAction,
      });

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
    }
    if (isClearDeviceAction) {
      resetLegadoDeviceId();
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
  const loginUrlScript = patchLegadoLoginUrlScript((source.loginUrl ?? '').trim());
  if (!loginUrlScript) return;
  resetLoginApiHttpCapture();
  console.warn(LOG_TAG, 'runLoginScript', { action: action?.slice(0, 50), baseUrl: baseUrl?.slice(0, 60) });

  const sourceUrl = getLegadoSourceKey(source);
  const loginKey = storageKey(STORAGE_PREFIX_LOGIN, sourceUrl);
  const argsKey = storageKey(STORAGE_PREFIX_ARGS, sourceUrl);
  const cookiesKey = storageKey(STORAGE_PREFIX_COOKIES, sourceUrl);

  const actionTrimEarly = (action ?? '').trim();
  const isLogoutAction = isLogoutLoginAction(actionTrimEarly);
  const isClearDeviceAction = isClearDeviceLoginAction(actionTrimEarly);
  /** 仅退出登录：禁止 putLoginInfo 写回密钥，结束时清空 cookie 存储 */
  const skipLoginPersistence = isLogoutAction;

  if (isLogoutAction) {
    try {
      await clearSourceLoginState(source);
    } catch (e) {
      console.warn(LOG_TAG, 'runLoginScript(logout) 清除登录态失败', e);
    }
  }

  if (
    await tryRunLoginScriptQuickJS(source, options, {
      baseUrl,
      loginUrlScript,
      loginKey,
      argsKey,
      cookiesKey,
      skipLoginPersistence,
      isClearDeviceAction,
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
    const text = normalizeToastText(msg);
    if (text && onToast) onToast(text, false);
  };
  const longToast = (msg?: string) => {
    if (suppressResumeToast && isWaitingToast(msg)) return;
    const text = normalizeToastText(msg);
    if (text && onToast) onToast(text, true);
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
      return getCookieFromStore(this._store, url || baseUrl, baseUrl);
    },
    setCookie(url: string, value: string): void {
      const k = url || baseUrl;
      const before = getCookieFromStore(this._store, k, baseUrl);
      setCookieInScriptStore(this._store, url, value, baseUrl, browserCookieGuard);
      const after = getCookieFromStore(this._store, k, baseUrl);
      if (after && after !== before) {
        console.warn(LOG_TAG, 'cookie.setCookie', {
          key: k,
          valuePreview: after.replace(/qttoken=([^;]+)/, 'qttoken=***').slice(0, 120),
        });
      }
    },
    removeCookie(url: string): void {
      removeCookiesForUrlInStore(this._store, url || baseUrl, baseUrl);
    },
    /** 单参数：从 cookie 字符串中取 qttoken 值；两参数：cookie.getKey(url, keyName) 取该 url 下 cookie 中指定 key 的值（晴天聚合 loginqt 等用） */
    getKey(cookieStrOrUrl: string, keyName?: string): string {
      return legadoCookieGetKey(
        this._store,
        (u) => getCookieFromStore(this._store, u, baseUrl),
        cookieStrOrUrl,
        keyName,
      );
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
      if (skipLoginPersistence) return;
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
        normalizeServerFieldsInSourceArgs(obj);
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
        return legadoJavaAndroidId();
      },
      deviceID(): string {
        legadoJavaDeviceID();
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
        const p = openLegadoBrowserInApp(resolved, cookieStr, title, {
          awaitClose: true,
          ...innerWebPoolOpts(source),
        })
          .then((r) => {
            console.warn(LOG_TAG, 'startBrowserAwait 已关闭', {
              confirmed: r.confirmed,
              cookieLen: (r.cookies ?? '').length,
            });
            if (r.confirmed && r.cookies?.trim()) {
              syncWebViewCookiesToStore(
                cookieObj,
                source,
                baseUrl,
                resolved,
                r.cookies,
                browserCookieGuard
              );
              persistScriptCookieStoreToLocal(cookieStore, cookiesKey);
            } else if (r.confirmed) {
              console.warn(LOG_TAG, 'startBrowserAwait √ 但 cookies 为空，未写入脚本表');
            }
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
          ? openLegadoBrowserInApp(resolved, cookieStr, title, innerWebPoolOpts(source))
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
        pending.push(
          openLegadoBrowserInApp(resolved, cookieStr, undefined, innerWebPoolOpts(source)),
        );
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
      if (!skipLoginPersistence) {
        (scopeObj.putLoginInfo as (s: string) => void)(JSON.stringify(formValues));
      }

      scopeObj._ajaxResults = [];
      scopeObj._ajaxReadIndex = 0;
      scopeObj._ajaxWriteIndex = 0;
      suppressResumeToast = false;
      browserAwaitDone = false;
      let suspendRounds = 0;
      while (true) {
        try {
          scopeObj.result = formValues;
          if (!skipLoginPersistence) {
            (scopeObj.putLoginInfo as (s: string) => void)(JSON.stringify(formValues));
          }
          run(scopeObj, replayScript);
          break;
        } catch (e) {
          if (e instanceof SuspendScript) {
            suspendRounds += 1;
            if (suspendRounds > MAX_LOGIN_SUSPEND_ROUNDS) {
              if (onToast) onToast('登录脚本 ajax 轮次过多，已中止', true);
              break;
            }
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
                const keyVal = extractLoginKeyFromJson(json);
                if (keyVal) {
                  applyLoginKeyToStore(cookieStore, baseUrl, keyVal, getOrCreateAndroidId());
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
      if (skipLoginPersistence) {
        cookieStore.clear();
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
        } catch (e) {
          console.warn(LOG_TAG, 'logout/clearDevice 清理 localStorage 失败', e);
        }
      } else {
        const isLoginAction = /login\s*\(\s*true\s*\)/.test((action ?? '').trim());
        await finalizeLegadoLoginCookies({
          source,
          baseUrl,
          cookieStore,
          formValues,
          loginKey,
          argsKey,
          isLoginAction,
        });
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
      if (isClearDeviceAction) {
        resetLegadoDeviceId();
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
  const headers = applyLegadoAggregationApiHeaders(
    url,
    mergeSourceHeaders(options.source, options.headers),
  );
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
    if (/\/login_api\b/.test(url)) {
      const response =
        postBody != null && postBody !== ''
          ? await httpRequest(url, { ...common, method: 'POST', body: postBody })
          : await httpRequest(url, { ...common, method: 'POST' });
      const text = await response.text();
      lastLoginApiHttpCapture = {
        url,
        body: text,
        setCookie: readSetCookieHeader(response.headers),
      };
      const json = parseLegadoApiJsonResponse(text);
      if (json) {
        const parsedKey = extractLoginKeyFromJson(json);
        console.warn(LOG_TAG, 'login_api HTTP 响应', {
          code: json.code,
          msg: json.msg,
          hasValidKey: Boolean(parsedKey),
          keyLen: parsedKey.length,
          hasSetCookie: Boolean(lastLoginApiHttpCapture.setCookie),
        });
      } else {
        console.warn(LOG_TAG, 'login_api HTTP 响应非 JSON', {
          preview: text.slice(0, 120),
          hint: text.trim().startsWith('<') ? legadoAggregationApiHtmlHint() : undefined,
        });
      }
      return text;
    }
    const text =
      postBody != null && postBody !== ''
        ? await post(url, postBody, common)
        : await httpRequest(url, { ...common, method: 'POST' }).then((r) => r.text());
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
      await openSourceSettingsInApp(item.url.trim(), (item.cookies ?? '').trim(), {
        bookSourceUrl: source.bookSourceUrl,
      }).catch((e) => {
        console.warn(LOG_TAG, 'open with cookies failed, fallback to plain url', e);
        return openSourceSettingsInApp(item.url.trim(), '', {
          bookSourceUrl: source.bookSourceUrl,
        });
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
        void openSourceSettingsInApp(u, '', { bookSourceUrl: source.bookSourceUrl });
      }
    }
  }
  return output;
}
