/**
 * 书源 HTTP 请求：解析 server，注入 Cookie（对齐 Legado CookieStore + urlOption 合并）
 */

import type { BookSource } from '@/types';
import {
  getStoredLoginInfo,
  getStoredSourceCookiesForUrl,
  getStoredSourceCookiesMerged,
  readSourceCookieStore,
  sanitizeLegadoCookieValueForStore,
} from '@/lib/js-engine/legado/login-script-runner';
import {
  extractLegadoCookieValue,
  extractQttokenKey,
  mergeLegadoCookieHeaderStrings,
  isLegadoPlaceholderCookieHeader,
  normalizeLegadoCookieHeader,
} from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import {
  firstHostFromJsLib,
  getScriptBaseUrl,
  getSourceArgsKey,
  getLegadoSourceKey,
  hostsFromJsLib,
  normalizeServerFieldsInSourceArgs,
  readServerUrlFromSourceArgs,
  STORAGE_PREFIX_CF_ORIGIN,
  STORAGE_PREFIX_CF_UA,
  storageKey,
} from '@/lib/js-engine/legado/source-script-shared';
import {
  extractServerFromJsLib,
  parseHeaders,
  stripMisplacedCookieFromHttpUrl,
} from '@/lib/book-source/utils';

export const LEGADO_DEVICE_ID_STORAGE_KEY = 'reader_login_android_id';

const ANDROID_ID_KEY = LEGADO_DEVICE_ID_STORAGE_KEY;

/** 对齐 Legado「其它设置」常用桌面 UA（聚合 gyks 与移动端书源 header 区分） */
export const LEGADO_GYKS_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export function isGyksAggregationHost(requestUrl: string): boolean {
  try {
    const host = new URL(
      requestUrl.includes('://') ? requestUrl : `https://${requestUrl}`,
    ).hostname;
    return /(?:^|\.)gyks\.cf$/i.test(host);
  } catch {
    return false;
  }
}

/** 502/503/504 时允许切换聚合书源下一条线路 */
export function isRetryableGatewayHttpError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error)) return false;
  const status = (error as { status: unknown }).status;
  return status === 502 || status === 503 || status === 504;
}

function normalizeAggregationServerUrl(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/\/+$/, '');
}

function aggregationServerOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** 书源配置的聚合线路（线路变量 + jsLib hosts），不含请求 URL 本身 */
export function listKnownAggregationServers(source: BookSource): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string | null | undefined) => {
    const trimmed = normalizeAggregationServerUrl(raw);
    if (!trimmed || !/^https?:\/\//i.test(trimmed) || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  add(resolveBookSourceServerUrl(source));
  add(getScriptBaseUrl(source));
  const jsLib = (source as Record<string, unknown>).jsLib;
  for (const host of hostsFromJsLib(jsLib)) add(host);
  return out;
}

/** 对齐 detail/catalog：当前请求线路优先，其余按书源配置顺序 */
export function listAggregationServerCandidates(
  source: BookSource,
  requestUrl?: string,
): string[] {
  const known = listKnownAggregationServers(source);
  if (!requestUrl) return known;

  const requestOrigin = aggregationServerOrigin(requestUrl);
  if (!requestOrigin) return known;

  const idx = known.findIndex((server) => aggregationServerOrigin(server) === requestOrigin);
  if (idx <= 0) return known;
  const ordered = [...known];
  const [current] = ordered.splice(idx, 1);
  ordered.unshift(current);
  return ordered;
}

export function replaceHttpUrlOrigin(url: string, serverOrigin: string): string {
  try {
    const target = new URL(url);
    const base = normalizeAggregationServerUrl(serverOrigin);
    const next = new URL(base.includes('://') ? base : `https://${base}`);
    target.protocol = next.protocol;
    target.hostname = next.hostname;
    target.port = next.port;
    return target.toString();
  } catch {
    return url;
  }
}

/** 聚合书源多线路：请求 URL 的 origin 须在书源已知线路中 */
export function shouldUseAggregationServerFailover(
  source: BookSource,
  requestUrl: string,
): boolean {
  const known = listKnownAggregationServers(source);
  if (known.length <= 1) return false;
  if (isGyksAggregationHost(requestUrl)) return true;
  const origin = aggregationServerOrigin(requestUrl);
  if (!origin) return false;
  return known.some((server) => aggregationServerOrigin(server) === origin);
}

export function applyGyksAggregationUserAgent(
  headers: Record<string, string>,
  requestUrl: string,
): void {
  if (isGyksAggregationHost(requestUrl)) {
    headers['User-Agent'] = LEGADO_GYKS_DESKTOP_UA;
  }
}

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

export function legadoJavaAndroidId(source?: BookSource): string {
  return resolveBookSourceDeviceId(source);
}

/**
 * 聚合书源 deviceId：书源变量 deviceId（与 Legado 对齐）> 本地 androidId。
 * 与 Legado 共用账号时，请在书源变量 JSON 中设置 `"deviceId":"715526ded4651ef6"`（Legado 日志中的值）。
 */
export function resolveBookSourceDeviceId(source?: BookSource): string {
  if (source) {
    const pinned = readBookSourceArgsField(source, 'deviceId');
    if (pinned) return pinned;
  }
  return getOrCreateAndroidId();
}

/** 登录成功后持久化 deviceId，便于与 Legado 手动对齐 */
export function persistBookSourceDeviceId(source: BookSource, deviceId: string): void {
  const id = deviceId.trim();
  if (!id) return;
  try {
    const key = getSourceArgsKey(source);
    const raw = localStorage.getItem(key) ?? '{}';
    const obj = JSON.parse(raw) as Record<string, unknown>;
    obj.deviceId = id;
    normalizeServerFieldsInSourceArgs(obj);
    localStorage.setItem(key, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

/** 构建 qtcookie：书源变量 deviceId 优先，其次 Cookie，再回落 androidId */
export function resolveLegadoDeviceId(
  storedCookie?: string,
  source?: BookSource,
): string {
  if (source) {
    const pinned = readBookSourceArgsField(source, 'deviceId');
    if (pinned) return pinned;
  }
  const raw = String(storedCookie ?? '').trim();
  const fromCookie =
    extractLegadoCookieValue(raw, 'deviceId') ||
    extractLegadoCookieValue(raw, 'device');
  if (fromCookie) return fromCookie;
  return resolveBookSourceDeviceId(source);
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

function originOfHttpUrl(url: string): string | undefined {
  const s = url.trim();
  if (!s.startsWith('http')) return undefined;
  try {
    return new URL(s).origin;
  } catch {
    return undefined;
  }
}

function cookieHeaderHasCfClearance(cookieHeader: string): boolean {
  return /(?:^|;\s*)(?:cf_clearance|__cf_bm)=/i.test(cookieHeader.trim());
}

/** 书源目录域（sourceUrl / bookSourceUrl） */
export function resolveBookSourceCatalogOrigin(source: BookSource): string {
  const su = (source.sourceUrl ?? source.bookSourceUrl ?? '').trim();
  if (!su?.startsWith('http')) return '';
  return originOfHttpUrl(su) ?? su.replace(/\/+$/, '');
}

/**
 * HTTP 请求应使用的站点 origin：CF 通过后优先镜像域（对齐 Legado bhost 换站）。
 */
export function getCfActiveRequestOrigin(source: BookSource): string | undefined {
  try {
    const key = storageKey(STORAGE_PREFIX_CF_ORIGIN, getLegadoSourceKey(source));
    const raw = localStorage.getItem(key)?.trim();
    if (raw?.startsWith('http')) return originOfHttpUrl(raw) ?? undefined;
  } catch {
    /* ignore */
  }
  return undefined;
}

export function setCfActiveRequestOrigin(source: BookSource, origin: string): void {
  const o = originOfHttpUrl(origin);
  if (!o) return;
  try {
    const key = storageKey(STORAGE_PREFIX_CF_ORIGIN, getLegadoSourceKey(source));
    localStorage.setItem(key, o);
  } catch {
    /* ignore */
  }
}

export function clearCfActiveRequestOrigin(source: BookSource): void {
  try {
    localStorage.removeItem(storageKey(STORAGE_PREFIX_CF_ORIGIN, getLegadoSourceKey(source)));
    localStorage.removeItem(storageKey(STORAGE_PREFIX_CF_UA, getLegadoSourceKey(source)));
  } catch {
    /* ignore */
  }
}

export function getCfActiveUserAgent(source: BookSource): string | undefined {
  try {
    const key = storageKey(STORAGE_PREFIX_CF_UA, getLegadoSourceKey(source));
    const raw = localStorage.getItem(key)?.trim();
    return raw || undefined;
  } catch {
    return undefined;
  }
}

export function setCfActiveUserAgent(source: BookSource, userAgent: string): void {
  const ua = userAgent.trim();
  if (!ua) return;
  try {
    const key = storageKey(STORAGE_PREFIX_CF_UA, getLegadoSourceKey(source));
    localStorage.setItem(key, ua);
  } catch {
    /* ignore */
  }
}

export function resolveBookSourceRequestOrigin(source: BookSource): string {
  return getCfActiveRequestOrigin(source) || resolveBookSourceCatalogOrigin(source);
}

/**
 * 发现/章节 URL 仍指向书源目录域时，改写到 CF 活跃镜像域（Cookie 与 cf_clearance 所在域）。
 */
export function alignUrlToBookSourceRequestOrigin(
  url: string,
  source: BookSource,
): string {
  const target = url.trim();
  if (!target.startsWith('http')) return target;
  const active = getCfActiveRequestOrigin(source);
  const catalog = resolveBookSourceCatalogOrigin(source);
  if (!active || !catalog || active === catalog) return target;
  try {
    const u = new URL(target);
    const cat = new URL(catalog);
    const act = new URL(active);
    if (u.hostname === cat.hostname) {
      u.protocol = act.protocol;
      u.hostname = act.hostname;
      return u.href;
    }
  } catch {
    /* ignore */
  }
  return target;
}

function alignRefererToRequestOrigin(
  headers: Record<string, string>,
  source: BookSource,
): void {
  const active = getCfActiveRequestOrigin(source);
  const catalog = resolveBookSourceCatalogOrigin(source);
  if (!active || !catalog || active === catalog) return;
  const refKey = headers.Referer != null ? 'Referer' : headers.referer != null ? 'referer' : '';
  if (!refKey) return;
  const refVal = headers[refKey]?.trim();
  if (!refVal?.startsWith('http')) return;
  try {
    const ref = new URL(refVal);
    const cat = new URL(catalog);
    const act = new URL(active);
    if (ref.hostname === cat.hostname) {
      ref.protocol = act.protocol;
      ref.hostname = act.hostname;
      headers[refKey] = ref.href;
    }
  } catch {
    /* ignore */
  }
}

/** 晴天等聚合服：统一 https，避免 http 登录 Cookie 与 https API 不一致 */
export function normalizeBookSourceServerUrl(url: string): string {
  const trimmed = stripMisplacedCookieFromHttpUrl(url.trim()).replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    if (u.protocol === 'http:' && /(?:^|\.)gyks\.cf$/i.test(u.hostname)) {
      u.protocol = 'https:';
      return u.toString().replace(/\/+$/, '');
    }
  } catch {
    /* ignore */
  }
  return trimmed;
}

function alternateOriginScheme(url: string): string | null {
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`);
    u.protocol = u.protocol === 'https:' ? 'http:' : 'https:';
    return u.origin;
  } catch {
    return null;
  }
}

export function readBookSourceArgsField(source: BookSource, field: string): string {
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
  const fromArgs = readBookSourceArgsField(source, 'qttoken');
  if (fromArgs) return extractQttokenKey(fromArgs) || fromArgs;
  try {
    const login = getStoredLoginInfo(getLegadoSourceKey(source));
    const key = login['密钥']?.trim();
    if (key) return extractQttokenKey(key) || key;
  } catch {
    /* ignore */
  }
  return '';
}

/** 与 Legado：getArgument('server') || getVariable('线路') || hosts[0] */
export function resolveBookSourceServerUrl(source: BookSource): string | null {
  try {
    const raw = localStorage.getItem(getSourceArgsKey(source));
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const fromArgs = readServerUrlFromSourceArgs(obj);
      if (fromArgs) return fromArgs;
    }
  } catch {
    /* ignore */
  }

  const src = source as unknown as Record<string, unknown>;
  const fromJsLib = extractServerFromJsLib(src);
  if (fromJsLib) return normalizeBookSourceServerUrl(fromJsLib);

  const firstHost = firstHostFromJsLib(src.jsLib);
  if (firstHost) return normalizeBookSourceServerUrl(firstHost);

  return null;
}

/**
 * 书源 Cookie：与 Legado cookie 表键（origin、server、裸 host）对齐。
 */
export function resolveSourceCookiesForHttp(
  source: BookSource,
  requestUrl: string,
): string {
  const alignedUrl = alignUrlToBookSourceRequestOrigin(requestUrl, source);
  const direct = getStoredSourceCookiesForUrl(source, alignedUrl).trim();
  const cfOrigin = getCfActiveRequestOrigin(source);
  if (cfOrigin && cfOrigin !== originOfHttpUrl(alignedUrl)) {
    const fromCf = getStoredSourceCookiesForUrl(source, cfOrigin).trim();
    if (fromCf && cookieHeaderHasCfClearance(fromCf)) {
      return direct ? mergeLegadoCookieHeaderStrings(fromCf, direct) : fromCf;
    }
  }
  if (direct) return direct;

  const altOrigin = alternateOriginScheme(alignedUrl);
  if (altOrigin) {
    const fromAlt = getStoredSourceCookiesForUrl(source, altOrigin).trim();
    if (fromAlt) return fromAlt;
  }

  const server = resolveBookSourceServerUrl(source);
  if (server) {
    const fromServer = getStoredSourceCookiesForUrl(source, server).trim();
    if (fromServer) return fromServer;
  }

  const reqHost = hostnameOf(alignedUrl);
  if (reqHost) {
    for (const [key, value] of readSourceCookieStore(source).entries()) {
      if (!value?.trim()) continue;
      const keyHost = hostnameOf(key);
      if (keyHost && keyHost === reqHost) {
        return sanitizeLegadoCookieValueForStore(
          value,
          resolveLegadoDeviceId(value, source),
        );
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
  const deviceId = resolveLegadoDeviceId(stored, source);
  return `qttoken=${token}; deviceId=${deviceId};`;
}

/**
 * 对齐 Legado ruleContent：cookie.getKey(device) 优先，否则 java.androidId()
 */
export function buildLegadoRuleContentCookieHeader(
  source: BookSource,
  serverUrl: string,
): string {
  const stored = resolveSourceCookiesForHttp(source, serverUrl).trim();
  const token =
    extractLegadoCookieValue(stored, 'qttoken') || readBookSourceQttoken(source, serverUrl);
  if (!token) return stored;
  let device2 = extractLegadoCookieValue(stored, 'device');
  if (!device2) device2 = resolveBookSourceDeviceId(source);
  return `qttoken=${token}; deviceId=${device2};`;
}

/**
 * 对齐 AnalyzeUrl.setCookie：CookieStore 与 header 合并（后者同名覆盖前者）
 */
export function buildSourceRequestHeaders(
  source: BookSource,
  requestUrl: string,
): Record<string, string> {
  const alignedUrl = alignUrlToBookSourceRequestOrigin(requestUrl, source);
  const headers = parseHeaders(source.header);
  alignRefererToRequestOrigin(headers, source);
  const cfUa = getCfActiveUserAgent(source);
  if (cfUa) {
    headers['User-Agent'] = cfUa;
    delete headers['user-agent'];
  }
  const stored = resolveSourceCookiesForHttp(source, alignedUrl);
  const fromHeaderRaw = headers.Cookie ?? headers.cookie ?? '';
  const fromHeader = isLegadoPlaceholderCookieHeader(fromHeaderRaw) ? '' : fromHeaderRaw;
  const cookieHeader = mergeLegadoCookieHeaderStrings(stored, fromHeader);
  if (cookieHeader) {
    headers.Cookie = normalizeLegadoCookieHeader(
      cookieHeader,
      resolveLegadoDeviceId(cookieHeader, source),
    );
    delete headers.cookie;
  } else if (resolveBookSourceServerUrl(source)) {
    console.warn(
      '[source-http] 书源 API 未找到登录 Cookie，正文可能按游客限额返回。请在该书源重新登录。',
      { url: requestUrl.slice(0, 96) },
    );
  }
  applyGyksAggregationUserAgent(headers, requestUrl);
  return headers;
}

/** 对齐 Legado ruleContent ajax op.headers：`cookie` + `Content-Type`（小写键名） */
export function formatLegadoRuleContentAjaxHeaders(cookie: string): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const ck = cookie.trim();
  if (ck) headers.cookie = ck;
  return headers;
}

/**
 * 对齐 Legado ruleContent `java.log(op)`：仅 `cookie` + `Content-Type`，不合并书源 header/Accept。
 * 脚本已提供 cookie 时原样使用（含 `; deviceId=…;` 空格与末尾分号）。
 */
export function buildLegadoContentApiRequestHeaders(
  source: BookSource | undefined,
  requestUrl: string,
  scriptHeaders?: Record<string, string>,
): Record<string, string> {
  const fromScript = String(
    scriptHeaders?.cookie ?? scriptHeaders?.Cookie ?? '',
  ).trim();
  if (fromScript) {
    if (source && !extractQttokenKey(fromScript)) {
      const server = resolveBookSourceServerUrl(source) ?? requestUrl;
      const built = buildLegadoRuleContentCookieHeader(source, server);
      if (built.trim()) {
        return formatLegadoRuleContentAjaxHeaders(built);
      }
    }
    const cookie = source
      ? normalizeLegadoCookieHeader(
        fromScript,
        resolveLegadoDeviceId(fromScript, source),
      )
      : fromScript;
    return formatLegadoRuleContentAjaxHeaders(cookie);
  }
  if (!source) {
    return formatLegadoRuleContentAjaxHeaders('');
  }
  const server = resolveBookSourceServerUrl(source) ?? requestUrl;
  const built = buildLegadoRuleContentCookieHeader(source, server);
  return formatLegadoRuleContentAjaxHeaders(built);
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
    resolveLegadoDeviceId(mergedCookie, source),
  );
  return headers;
}
