/**
 * 书源 HTTP 请求：解析 server，注入 Cookie（对齐 Legado CookieStore + urlOption 合并）
 */

import type { BookSource } from '@/types';
import {
  getStoredLoginInfo,
  getStoredSourceCookiesForUrl,
  getStoredSourceCookiesMerged,
  readSourceCookieStore,
} from '@/lib/js-engine/legado/login-script-runner';
import {
  extractLegadoCookieValue,
  extractQttokenKey,
  mergeLegadoCookieHeaderStrings,
  normalizeLegadoCookieHeader,
} from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import {
  getSourceArgsKey,
  getSourceUrlIdentifier,
} from '@/lib/js-engine/legado/source-script-shared';
import { extractServerFromJsLib, parseHeaders } from '@/lib/book-source/utils';

export const LEGADO_DEVICE_ID_STORAGE_KEY = 'reader_login_android_id';

const ANDROID_ID_KEY = LEGADO_DEVICE_ID_STORAGE_KEY;

/** 书源「清除设备」：下次登录重新生成 deviceId */
export function resetLegadoDeviceId(): void {
  try {
    localStorage.removeItem(ANDROID_ID_KEY);
  } catch {
    /* ignore */
  }
}

/** 对齐 Settings.Secure.ANDROID_ID：16 位十六进制 */
function generateAndroidStyleDeviceId(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
}

/**
 * 持久化设备 ID（对齐 Legado AppConst.androidId / 登录 login_api 的 deviceId）
 * 已有 localStorage 值（含旧版 web_*）保持不变，避免已登录 token 与 device 脱钩。
 */
export function getOrCreateAndroidId(): string {
  try {
    const existing = localStorage.getItem(ANDROID_ID_KEY)?.trim();
    if (existing) return existing;
    const id = generateAndroidStyleDeviceId();
    localStorage.setItem(ANDROID_ID_KEY, id);
    return id;
  } catch {
    return generateAndroidStyleDeviceId();
  }
}

/** Legado Android：无 java.deviceID，书源 try/catch 后走 androidId */
export function legadoJavaDeviceID(): never {
  throw new Error('java.deviceID is not available on this platform');
}

export function legadoJavaAndroidId(): string {
  return getOrCreateAndroidId();
}

/** 构建 qtcookie 时优先用 Cookie 里登录写入的 deviceId，再回落 androidId */
export function resolveLegadoDeviceId(storedCookie?: string): string {
  const raw = String(storedCookie ?? '').trim();
  const fromCookie =
    extractLegadoCookieValue(raw, 'deviceId') ||
    extractLegadoCookieValue(raw, 'device');
  if (fromCookie) return fromCookie;
  return getOrCreateAndroidId();
}

function hostnameOf(urlOrHost: string): string | undefined {
  const s = urlOrHost.trim();
  if (!s) return undefined;
  try {
    return new URL(s.includes('://') ? s : `https://${s}`).hostname;
  } catch {
    return s.replace(/^https?:\/\//i, '').split('/')[0] || undefined;
  }
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function readSourceArgsField(source: BookSource, field: string): string {
  try {
    const raw = localStorage.getItem(getSourceArgsKey(source));
    if (!raw?.trim()) return '';
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const v = obj[field];
    return v == null ? '' : String(v).trim();
  } catch {
    return '';
  }
}

/** Cookie 表 → args.qttoken → loginInfo.密钥 */
export function readBookSourceQttoken(source: BookSource, serverUrl: string): string {
  const fromCookie = extractQttokenKey(resolveSourceCookiesForHttp(source, serverUrl));
  if (fromCookie) return fromCookie;
  const fromArgs = readSourceArgsField(source, 'qttoken');
  if (fromArgs) return extractQttokenKey(fromArgs) || fromArgs;
  try {
    const login = getStoredLoginInfo(getSourceUrlIdentifier(source));
    const key = login['密钥']?.trim();
    if (key) return extractQttokenKey(key) || key;
  } catch {
    /* ignore */
  }
  return '';
}

/** 与 Legado login：getArgument('server') || host[0] */
export function resolveBookSourceServerUrl(source: BookSource): string | null {
  try {
    const raw = localStorage.getItem(getSourceArgsKey(source));
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const server = obj.server;
      if (typeof server === 'string' && isHttpUrl(server)) {
        return server.trim().replace(/\/+$/, '');
      }
    }
  } catch {
    /* ignore */
  }

  const fromJsLib = extractServerFromJsLib(source as unknown as Record<string, unknown>);
  if (fromJsLib) return fromJsLib.replace(/\/+$/, '');

  return null;
}

/**
 * 书源 Cookie：与 Legado cookie 表键（origin、server、裸 host）对齐。
 */
export function resolveSourceCookiesForHttp(
  source: BookSource,
  requestUrl: string,
): string {
  const direct = getStoredSourceCookiesForUrl(source, requestUrl).trim();
  if (direct) return direct;

  const server = resolveBookSourceServerUrl(source);
  if (server) {
    const fromServer = getStoredSourceCookiesForUrl(source, server).trim();
    if (fromServer) return fromServer;
  }

  const reqHost = hostnameOf(requestUrl);
  if (reqHost) {
    const deviceId = getOrCreateAndroidId();
    for (const [key, value] of readSourceCookieStore(source).entries()) {
      if (!value?.trim()) continue;
      const keyHost = hostnameOf(key);
      if (keyHost && keyHost === reqHost) {
        return normalizeLegadoCookieHeader(value, deviceId);
      }
    }
  }

  return getStoredSourceCookiesMerged(source);
}

/**
 * 对齐 Legado ruleContent / ruleToc 脚本内 qtcookie 构建：
 * `qttoken=${cookie.getKey(server,'qttoken')}; deviceId=${device2};`
 */
export function buildLegadoRuleScriptCookieHeader(
  source: BookSource,
  serverUrl: string,
): string {
  const stored = resolveSourceCookiesForHttp(source, serverUrl).trim();
  const token = readBookSourceQttoken(source, serverUrl);
  if (!token) return '';
  const deviceId = resolveLegadoDeviceId(stored);
  return `qttoken=${token}; deviceId=${deviceId};`;
}

/**
 * 对齐 AnalyzeUrl.setCookie：CookieStore 与 header 合并（后者同名覆盖前者）
 */
export function buildSourceRequestHeaders(
  source: BookSource,
  requestUrl: string,
): Record<string, string> {
  const headers = parseHeaders(source.header);
  const stored = resolveSourceCookiesForHttp(source, requestUrl);
  const cookieHeader = mergeLegadoCookieHeaderStrings(
    stored,
    headers.Cookie ?? headers.cookie ?? '',
  );
  if (cookieHeader) {
    headers.Cookie = normalizeLegadoCookieHeader(
      cookieHeader,
      resolveLegadoDeviceId(cookieHeader),
    );
    delete headers.cookie;
  } else if (resolveBookSourceServerUrl(source)) {
    console.warn(
      '[source-http] 书源 API 未找到登录 Cookie，正文可能按游客限额返回。请在该书源重新登录。',
      { url: requestUrl.slice(0, 96) },
    );
  }
  return headers;
}

/**
 * 直连书源 API（无 rule JS）时，须与 ruleContent ajax headers.cookie 一致。
 * 对齐 Legado：urlOption cookie 覆盖 CookieStore。
 */
export function buildBookSourceApiRequestHeaders(
  source: BookSource,
  requestUrl: string,
): Record<string, string> {
  const headers = buildSourceRequestHeaders(source, requestUrl);
  const server = resolveBookSourceServerUrl(source);
  if (!server) return headers;
  const scriptCookie = buildLegadoRuleScriptCookieHeader(source, server);
  if (!scriptCookie) return headers;
  const mergedCookie = mergeLegadoCookieHeaderStrings(
    headers.Cookie ?? '',
    scriptCookie,
  );
  headers.Cookie = normalizeLegadoCookieHeader(
    mergedCookie,
    resolveLegadoDeviceId(mergedCookie),
  );
  return headers;
}
