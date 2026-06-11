/**
 * 书源脚本（登录 / 发现）共用的 baseUrl、localStorage 键与变量读写
 */

import type { BookSource } from '@/types';
import { setExploreInfoMapValue } from '@/lib/book-source/explore-info-map-store';
import { normalizeBookSourceServerUrl } from '@/lib/book-source/source-http';
import { stripLegadoSourceUrlMarker, stripMisplacedCookieFromHttpUrl } from '@/lib/book-source/utils';
import { bumpExploreSourceArgsVersion } from '@/stores/explore-source-args';
import {
  EXPLORE_BASE_URL_FALLBACK_SHIM,
  exploreScriptNeedsBaseUrlFallback,
  LEGADO_EXPLORE_DEVICE_JAVA_SHIM,
  patchExploreScriptForReaderWeb,
} from '@/lib/js-engine/legado/legado-explore-java-device';
import { parseHostsFromJsLib } from '@/lib/js-engine/legado/jslib-hosts';

export const STORAGE_PREFIX_ARGS = 'reader_source_args_';
export const STORAGE_PREFIX_COOKIES = 'reader_source_cookies_';
export const STORAGE_PREFIX_LOGIN = 'reader_source_login_';
/** CF 挑战后 panel 实际停留的 origin（镜像域，如 banzhu77777777.net） */
export const STORAGE_PREFIX_CF_ORIGIN = 'reader_source_cf_origin_';
/** CF 挑战时 panel 的 navigator.userAgent（须与后续 HTTP 一致） */
export const STORAGE_PREFIX_CF_UA = 'reader_source_cf_ua_';

/**
 * 书源变量 JSON 里表示「当前聚合服务器」的字段名。
 * Legado 常见 `server`；光遇等 jsLib 书源用 `线路`（与 BaseUrl 一致）。晴天发现/登录原生用 `server`。
 */
/** 读取聚合线路时 `线路` 优先于 `server`（光遇）；写入时两者镜像同步。 */
export const LEGADO_SERVER_ARG_KEYS = ['线路', 'server'] as const;

/** 规范化 args 对象中的服务器 URL 字段（gyks http→https 等） */
export function normalizeServerFieldsInSourceArgs(obj: Record<string, unknown>): void {
  for (const key of LEGADO_SERVER_ARG_KEYS) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) {
      obj[key] = normalizeBookSourceServerUrl(v);
    }
  }
}

/** 从书源变量 JSON 读取当前聚合线路（`线路` 优先于 `server`） */
export function readServerUrlFromSourceArgs(obj: Record<string, unknown>): string | null {
  for (const key of LEGADO_SERVER_ARG_KEYS) {
    const v = obj[key];
    if (typeof v === 'string' && isHttpUrl(v.trim())) {
      return normalizeBookSourceServerUrl(v);
    }
  }
  return null;
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test((s ?? '').trim());
}

/** 从 jsLib 中提取第一个聚合线路 */
export function firstHostFromJsLib(jsLib: unknown): string {
  return parseHostsFromJsLib(jsLib)[0] ?? '';
}

/** 从 jsLib 的 host(s) 数组提取全部聚合线路 */
export function hostsFromJsLib(jsLib: unknown): string[] {
  return parseHostsFromJsLib(jsLib);
}

export function storageKey(prefix: string, sourceUrl: string): string {
  try {
    return prefix + btoa(encodeURIComponent(sourceUrl)).replace(/[/+=]/g, '_');
  } catch {
    return prefix + String(sourceUrl).slice(0, 64);
  }
}

/**
 * 书源脚本 baseUrl（须为 http(s)）。
 * sourceUrl 常为名称时从 jsLib host 等兜底。
 */
export function getScriptBaseUrl(source: BookSource): string {
  try {
    const raw = localStorage.getItem(getSourceArgsKey(source));
    if (raw) {
      const fromArgs = readServerUrlFromSourceArgs(
        JSON.parse(raw) as Record<string, unknown>,
      );
      if (fromArgs) return fromArgs;
    }
  } catch {
    /* ignore */
  }
  const u = stripLegadoSourceUrlMarker(
    stripMisplacedCookieFromHttpUrl((source.sourceUrl ?? '').trim()),
  );
  if (u && isHttpUrl(u)) return normalizeBookSourceServerUrl(u);
  const candidates = [
    (source as Record<string, unknown>).exploreUrl,
    (source as Record<string, unknown>).searchUrl,
    (source as Record<string, unknown>).bookSourceUrl,
  ].filter((x): x is string => typeof x === 'string' && isHttpUrl(x));
  const first = candidates[0];
  if (first) {
    return normalizeBookSourceServerUrl(first);
  }
  const host = firstHostFromJsLib((source as Record<string, unknown>).jsLib);
  return host ? normalizeBookSourceServerUrl(host) : host;
}

/**
 * Legado 书源唯一键：BookSource.getKey() → bookSourceUrl（可为名称非 URL）
 * 变量 / Cookie / 登录信息均按此键隔离，不得优先 sourceUrl 以免与 Legado 存储错位。
 */
export function getLegadoSourceKey(source: BookSource): string {
  const src = source as Record<string, unknown>;
  return String(src.bookSourceUrl ?? source.sourceUrl ?? '').trim();
}


export function getSourceArgsKey(source: BookSource): string {
  return storageKey(STORAGE_PREFIX_ARGS, getLegadoSourceKey(source));
}

export function getSourceCookiesKey(source: BookSource): string {
  return storageKey(STORAGE_PREFIX_COOKIES, getLegadoSourceKey(source));
}

export function getSourceLoginKey(source: BookSource): string {
  return storageKey(STORAGE_PREFIX_LOGIN, getLegadoSourceKey(source));
}

/** 读取书源登录表单 JSON（供 getLoginInfoMap） */
export function readSourceLoginInfoMap(source: BookSource): Record<string, string> {
  try {
    const raw = localStorage.getItem(getSourceLoginKey(source));
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, string>;
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

/** 加载该书源持久化 cookie 表 */
export function loadSourceCookieStore(cookiesKey: string): Map<string, string> {
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
  return store;
}

function readServerUrlFromArgsJson(raw: string | null | undefined): string {
  if (!raw?.trim()) return '';
  try {
    return readServerUrlFromSourceArgs(JSON.parse(raw) as Record<string, unknown>) ?? '';
  } catch {
    return '';
  }
}

export function isLegadoServerArgKey(key: string): boolean {
  return (LEGADO_SERVER_ARG_KEYS as readonly string[]).includes(key);
}

/** 光遇等：线路 与 server 镜像一致，供 BaseUrl / getArguments 共用（晴天原生仅用 server） */
export function syncLegadoServerArgKeys(
  data: Record<string, unknown>,
  value: string,
): void {
  const normalized = normalizeBookSourceServerUrl(value.trim());
  if (!normalized) return;
  data['线路'] = normalized;
  data['server'] = normalized;
}

/** 写入书源变量 JSON；线路/server 变更时递增发现脚本版本 */
function normalizeSourceArgsJsonForPersist(val: string): string {
  const trimmed = val.trim();
  if (!trimmed.startsWith('{')) return val;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    normalizeServerFieldsInSourceArgs(obj);
    const server = readServerUrlFromSourceArgs(obj);
    if (server) syncLegadoServerArgKeys(obj, server);
    return JSON.stringify(obj);
  } catch {
    return val;
  }
}

export function persistSourceArgsJson(
  source: BookSource,
  argsKey: string,
  val: string,
): void {
  try {
    const toStore = normalizeSourceArgsJsonForPersist(val);
    const prev = localStorage.getItem(argsKey);
    localStorage.setItem(argsKey, toStore);
    const prevServer = readServerUrlFromArgsJson(prev);
    const nextServer = readServerUrlFromArgsJson(toStore);
    if (prevServer !== nextServer) {
      bumpExploreSourceArgsVersion(getLegadoSourceKey(source));
      if (nextServer) {
        setExploreInfoMapValue(getLegadoSourceKey(source), '线路', nextServer);
      }
    }
  } catch {
    /* ignore */
  }
}

function normalizeSourceArgsVariableJson(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return raw;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    normalizeServerFieldsInSourceArgs(obj);
    return JSON.stringify(obj);
  } catch {
    return raw;
  }
}

export function createSourceVariableHandlers(
  source: BookSource,
  argsKey: string
): {
  getVariable: (key?: string) => string;
  setVariable: (val?: string) => void;
} {
  return {
    getVariable(_key?: string) {
      try {
        const raw = localStorage.getItem(argsKey);
        if (raw != null && raw !== '') return normalizeSourceArgsVariableJson(raw);
      } catch {
        /* ignore */
      }
      const header = (source as Record<string, unknown>).header;
      return typeof header === 'string' && header ? header : '{}';
    },
    setVariable(val?: string) {
      if (typeof val === 'string') persistSourceArgsJson(source, argsKey, val);
    },
  };
}

/**
 * Legado 发现脚本常以 `JSON.stringify(finalData)` 作为末尾表达式返回值，
 * QuickJS 路径只读 global.result，需补赋值。
 */
/** 光遇聚合等书源 jsLib 中依赖 Legado Rhino `this` 的函数名（须在 CONTEXT_SHIM 之前绑定） */
const EXPLORE_JSLIB_THIS_BIND_TARGETS = [
  'getCloudSettings',
  '_getParsedVariable',
  'getLoginInfo',
  'deleteVariable',
  'getVariable',
  'setVariable',
  'BaseUrl',
  'switchToNextLine',
  'ste',
  'parseBadMap',
  'findItemIndex',
  'checkEnv',
  'getFqToken',
  'getToken',
  'removeAllCookies',
  'setAllCookies',
  'request',
  'parseJsonSafely',
  'removeAllImgTags',
  'paraForAndroid',
  'createSvg',
  'showCmt',
  'paraForiOS',
  'show',
  'createFilter',
  'createLoginFilter',
  'show',
  'renderVersionPage',
  'getHtmlSettings',
  'getServerSettings',
  'getSvgSettings',
  'login',
  'toggleLogs',
  'compareVersions',
  'fetchVersionData',
  'showError',
  'getSvgSettings',
  'initCustomStyles',
  'htmlEscape',
  'htmlUnescape',
  'updateHiddenSettings',
  'getNextStyleName',
  'addCustomStyle',
  'getSelectedStyleName',
  'deleteCustomStyle',
] as const;

function buildExploreJsLibThisBindLines(): string {
  const lines = [
    '(function __readerBindExploreJsLibThis() {',
    '  var __ctx = {};',
    '  try {',
    '    Object.defineProperties(__ctx, {',
    '      java: { get: function() { return java; }, configurable: true },',
    '      cache: { get: function() { return cache; }, configurable: true },',
    '      source: { get: function() { return source; }, configurable: true },',
    '    });',
    '  } catch (e) {}',
  ];
  for (const name of EXPLORE_JSLIB_THIS_BIND_TARGETS) {
    lines.push(
      `  if (typeof ${name} === 'function') {`,
      `    var __readerOrig_${name} = ${name};`,
      `    ${name} = function() { return __readerOrig_${name}.apply(__ctx, arguments); };`,
      `    __ctx.${name} = ${name};`,
      '  }',
    );
  }
  lines.push('})();');
  return lines.join('\n');
}

/**
 * jsLib 中 getVariable / BaseUrl / request 等使用 `this.java`、`this.source`；
 * 浏览器 Function + eval 下须显式 bind（对齐 rule-script-patches）。
 */
export const EXPLORE_JSLIB_THIS_BIND_SHIM = buildExploreJsLibThisBindLines();

/**
 * jsLib 中 setArguments / getFanqieCookie 依赖 Legado 的 this 绑定；
 * Web/QuickJS/with 作用域下需改为使用全局 source、cookie、java。
 */
export const EXPLORE_JSLIB_CONTEXT_SHIM = `
setArguments = function(key, value) {
  var open_argument = source.getVariable();
  open_argument = getArguments(open_argument, '');
  open_argument[key] = value;
  open_argument = JSON.stringify(open_argument);
  source.setVariable(open_argument);
  return open_argument;
};
getFanqieCookie = function() {
  try {
    return String(
      (typeof cookie !== 'undefined' && cookie.getCookie
        ? cookie.getCookie('fanqienovel.com')
        : '') ||
      (typeof java !== 'undefined' && typeof java.getCookie === 'function'
        ? java.getCookie('fanqienovel.com')
        : '') ||
      ''
    );
  } catch (e) {
    return '';
  }
};
(function __readerGetTokenFallback() {
  if (typeof getToken !== 'function') return;
  var __origGetToken = getToken;
  getToken = function() {
    var t = String(__origGetToken.apply(this, arguments) || '').trim();
    if (t.length > 10) return t;
    try {
      if (typeof cookie !== 'undefined' && cookie.getKey) {
        var line = '';
        if (typeof BaseUrl === 'function') {
          try { line = String(BaseUrl() || ''); } catch (e1) {}
        }
        if (!line && typeof host !== 'undefined' && host && host[0]) line = String(host[0]);
        if (!line && typeof baseUrl === 'string') line = baseUrl;
        var fromKey = cookie.getKey(line || baseUrl || '', 'qttoken');
        if (fromKey && String(fromKey).length > 10) return String(fromKey).trim();
      }
    } catch (e2) {}
    return t;
  };
})();
`;

/**
 * 光遇 jsLib request() 在 java.ajax 返回空或非 JSON 时会同步递归 index+1 扫完全部线路。
 * Web 端 ajax 异步/挂起首轮常为空，须禁止同步扫线，改由宿主多轮重跑 + switchToNextLine。
 */
/**
 * 光遇/晴天：switchToNextLine 仅用云端 hosts 时，手动 IP 线路 findIndex=-1 会被误切回 v1。
 * 合并云端 hosts 与 jsLib 本地 hosts，并把当前线路纳入轮转序列。
 */
export const GYKS_SWITCH_LINE_SHIM = `
(function __readerGyksSwitchLineFix() {
  if (typeof switchToNextLine !== 'function') return;
  function __readerNormalizeHost(u) {
    if (u == null || u === '') return '';
    return String(u).replace(/\\/+$/, '');
  }
  function __readerMergeHosts(cloudHosts) {
    var seen = {};
    var out = [];
    function add(raw) {
      var h = __readerNormalizeHost(raw);
      if (!h || seen[h]) return;
      seen[h] = true;
      out.push(h);
    }
    if (cloudHosts && cloudHosts.length) {
      for (var i = 0; i < cloudHosts.length; i++) add(cloudHosts[i]);
    }
    if (typeof hosts !== 'undefined' && hosts && hosts.length) {
      for (var j = 0; j < hosts.length; j++) add(hosts[j]);
    }
    return out;
  }
  switchToNextLine = function(toast) {
    if (toast == undefined) toast = false;
    var currentLine = '';
    try {
      if (typeof BaseUrl === 'function') currentLine = __readerNormalizeHost(BaseUrl.call(this));
    } catch (e1) {}
    var cloud = null;
    try {
      cloud = typeof getVariable === 'function' ? getVariable.call(this, '云端配置') : null;
    } catch (e2) {}
    var hostsbk = __readerMergeHosts(cloud && cloud.hosts);
    if (hostsbk.length === 0) return currentLine;
    if (hostsbk.length === 1) {
      if (typeof setVariable === 'function') setVariable.call(this, '线路', hostsbk[0], false);
      return hostsbk[0];
    }
    var idx = -1;
    for (var k = 0; k < hostsbk.length; k++) {
      if (hostsbk[k] === currentLine) { idx = k; break; }
    }
    if (idx < 0 && currentLine) {
      hostsbk = [currentLine].concat(hostsbk.filter(function(h) { return h !== currentLine; }));
      idx = 0;
    }
    var nextIndex = idx < 0 ? 0 : (idx + 1) % hostsbk.length;
    var nextLine = hostsbk[nextIndex];
    if (typeof setVariable === 'function') setVariable.call(this, '线路', nextLine, false);
    var switchToast = 'true';
    try {
      switchToast = typeof getVariable === 'function' ? (getVariable.call(this, '切换提醒') || 'true') : 'true';
    } catch (e3) {}
    if (toast && switchToast === 'true' && typeof java !== 'undefined' && java.longToast) {
      java.longToast('\\n' + toast + '\\n自动切换到:' + nextLine);
    }
    return nextLine;
  };
})();
`.trim();

/** 避免 getCloudSettings 在「云端配置」为空时访问 undefined.version */
export const EXPLORE_GET_CLOUD_SETTINGS_GUARD_SHIM = `
(function() {
  if (typeof getCloudSettings !== 'function') return;
  var __origGCS = getCloudSettings;
  getCloudSettings = function(r) {
    var cfg = null;
    try {
      cfg = typeof getVariable === 'function' ? getVariable('云端配置') : null;
    } catch (e) { cfg = null; }
    if (cfg == null || cfg === '') {
      if (r === undefined) r = false;
      if (!r) return;
    }
    try {
      return __origGCS(r);
    } catch (e) {
      try {
        if (typeof java !== 'undefined' && java.log) {
          java.log('getCloudSettings: ' + (e && e.message != null ? e.message : e));
        }
      } catch (_) {}
    }
  };
})();
`.trim();

export const GYKS_REQUEST_NO_SYNC_FAILOVER_SHIM = `
(function __readerGyksRequestNoSyncFailover() {
  if (typeof request !== 'function') return;
  var __ctx = {};
  try {
    Object.defineProperties(__ctx, {
      java: { get: function() { return java; }, configurable: true },
      cache: { get: function() { return cache; }, configurable: true },
      source: { get: function() { return source; }, configurable: true },
    });
  } catch (e) {}
  function __readerBindCtxFn(orig) {
    if (typeof orig !== 'function') return;
    return function() { return orig.apply(__ctx, arguments); };
  }
  if (typeof BaseUrl === 'function') {
    var __readerOrigBaseUrl = BaseUrl;
    __ctx.BaseUrl = __readerBindCtxFn(__readerOrigBaseUrl);
  }
  if (typeof getToken === 'function') {
    var __readerOrigGetToken = getToken;
    __ctx.getToken = __readerBindCtxFn(__readerOrigGetToken);
  }
  if (typeof getVariable === 'function') {
    var __readerOrigGetVariable = getVariable;
    __ctx.getVariable = __readerBindCtxFn(__readerOrigGetVariable);
  }
  if (typeof switchToNextLine === 'function') {
    var __readerOrigSwitchLine = switchToNextLine;
    __ctx.switchToNextLine = __readerBindCtxFn(__readerOrigSwitchLine);
  }
  function __readerResolveBaseUrl() {
    if (__ctx.BaseUrl) return String(__ctx.BaseUrl()).replace(/\\/+$/, '');
    if (typeof bhost === 'function') {
      try { return String(bhost()).replace(/\\/+$/, ''); } catch (e3) {}
    }
    if (typeof host !== 'undefined' && host && host[0]) {
      return String(host[0]).replace(/\\/+$/, '');
    }
    if (typeof baseUrl === 'string' && baseUrl) {
      return String(baseUrl).replace(/\\/+$/, '');
    }
    return '';
  }
  function __readerRequestImpl(url, method, body, req) {
    if (method == undefined) method = 'GET';
    if (body == undefined) body = {};
    if (req == undefined) req = true;
    var urla = url;
    if (!String(url).includes('http')) {
      var base = __readerResolveBaseUrl();
      urla = base + url;
    }
    var javaRef = __ctx.java || (typeof java !== 'undefined' ? java : null);
    if (!javaRef) return '';
    var device = '';
    try {
      device = javaRef.androidId();
    } catch (e1) {
      try {
        device = javaRef.deviceID();
      } catch (e2) {}
    }
    var qttoken = '';
    try {
      if (typeof getToken === 'function') {
        qttoken = String(getToken.call(__ctx)).trim();
      } else if (__ctx.getToken) {
        qttoken = String(__ctx.getToken()).trim();
      }
    } catch (eTok) {}
    if ((!qttoken || qttoken.length <= 10) && typeof cookie !== 'undefined' && cookie.getKey) {
      try {
        var line = __readerResolveBaseUrl();
        if (!line && typeof host !== 'undefined' && host && host[0]) line = String(host[0]);
        var fromKey = cookie.getKey(line || '', 'qttoken');
        if (fromKey && String(fromKey).length > 10) qttoken = String(fromKey).trim();
      } catch (eCk) {}
    }
    var options = {
      method: method,
      headers: {
        cookie: 'qttoken=' + qttoken + ';deviceId=' + device + ';',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    };
    urla = urla + ',' + JSON.stringify(options);
    if (req === false) return urla;
    javaRef.log(urla);
    var startTime = new Date().getTime();
    var data = '';
    var requestTimedOut = false;
    var requestFailed = false;
    try {
      data = javaRef.ajax(urla);
      var parsed = JSON.parse(data);
      if (parsed && parsed.__readerAjaxPending) return '';
    } catch (error) {
      requestFailed = true;
    } finally {
      var duration = new Date().getTime() - startTime;
      var timeout = __ctx.getVariable ? (__ctx.getVariable('超时时间') || '5') : '5';
      timeout = parseInt(timeout, 10) * 1000;
      if (!requestFailed && duration > timeout) requestTimedOut = true;
    }
    if (requestTimedOut) {
      var timeoutSwitch = __ctx.getVariable ? (__ctx.getVariable('超时自动切换') || 'true') : 'true';
      if (timeoutSwitch !== 'false' && __ctx.switchToNextLine) {
        javaRef.log('检测到当前线路较慢，已切换线路');
        __ctx.switchToNextLine('⚠️当前线路较慢');
      }
      return data;
    }
    if (requestFailed) {
      try {
        var cloud = __ctx.getVariable && __ctx.getVariable('云端配置');
        var hostsbk = (cloud && cloud['hosts']) || (typeof hosts !== 'undefined' ? hosts : []);
        var autoSwitch = __ctx.getVariable ? (__ctx.getVariable('自动切换') || 'true') : 'true';
        if (hostsbk.length > 1 && autoSwitch !== 'false' && __ctx.switchToNextLine) {
          __ctx.switchToNextLine('❌线路报错');
        }
      } catch (e3) {}
      return '';
    }
    return data;
  }
  request = function() {
    return __readerRequestImpl.apply(__ctx, arguments);
  };
  __ctx.request = request;
})();
`.trim();

/** ajax 等待中占位 JSON（与 rule-script-runner 一致，避免 request() JSON.parse 失败扫线） */
export const LEGADO_AJAX_PENDING_JSON =
  '{"code":0,"msg":"","content":"","data":[],"__readerAjaxPending":true}';

/** two-pass 首轮 discovestyle 等须得到空数组而非 pending 对象，避免 style_list.filter 抛错 */
export const EXPLORE_DISCOVERSTYLE_AJAX_GUARD = `
(function __readerDiscovestyleAjaxGuard() {
  if (typeof java === 'undefined' || typeof java.ajax !== 'function') return;
  var __origAjax = java.ajax;
  java.ajax = function(url) {
    var res = __origAjax.apply(this, arguments);
    if (typeof res !== 'string' || res.indexOf('__readerAjaxPending') < 0) return res;
    var urlStr = typeof url === 'string' ? url : (url && (url.url || url.href)) || '';
    if (String(urlStr).indexOf('discovestyle') >= 0) {
      return '{"code":0,"msg":"","data":[]}';
    }
    return res;
  };
})();
`.trim();

/** jsLib + this 绑定 + 发现页兼容 shim + 用户脚本 */
export function buildLegadoExploreScriptBundle(jsLib: string, scriptContent: string): string {
  const body = ensureExploreScriptSetsResult(scriptContent);
  const parts: string[] = [];
  if (jsLib) parts.push(jsLib);
  if (exploreScriptNeedsBaseUrlFallback(jsLib, body)) {
    parts.push(EXPLORE_BASE_URL_FALLBACK_SHIM);
  }
  parts.push(
    EXPLORE_JSLIB_THIS_BIND_SHIM,
    EXPLORE_JSLIB_CONTEXT_SHIM,
    EXPLORE_GET_CLOUD_SETTINGS_GUARD_SHIM,
    GYKS_SWITCH_LINE_SHIM,
    GYKS_REQUEST_NO_SYNC_FAILOVER_SHIM,
    EXPLORE_DISCOVERSTYLE_AJAX_GUARD,
    // two-pass 每轮 eval 都会重跑；须在书源 device_type 探测前覆盖 java.qread/deviceID
    LEGADO_EXPLORE_DEVICE_JAVA_SHIM,
    body,
  );
  return parts.join('\n');
}

/** Legado getArguments(open_argument, key) */
export function createLegadoGetArguments(
  fallbackServer?: string,
): (openArgument: string, key?: string) => unknown {
  return (openArgument: string, key?: string) => {
    try {
      const obj = JSON.parse(openArgument) as Record<string, unknown>;
      return key != null && key !== '' ? obj[key] : obj;
    } catch {
      if (key != null && key !== '') {
        const k = String(key).trim().toLowerCase();
        if (k === 'server') return fallbackServer ?? '';
        return '';
      }
      return {};
    }
  };
}

/** jsLib 中 cache.put / cache.get */
export function createLegadoScriptCache(): {
  put: (key: string, value: unknown) => void;
  get: (key: string) => unknown;
  remove: (key: string) => void;
  putMemory: (key: string, value: unknown) => void;
  getFromMemory: (key: string) => unknown;
} {
  const legadoMemory = new Map<string, unknown>();
  return {
    put(key: string, value: unknown) {
      legadoMemory.set(String(key), value);
    },
    get(key: string) {
      return legadoMemory.has(String(key)) ? legadoMemory.get(String(key)) : null;
    },
    remove(key: string) {
      legadoMemory.delete(String(key));
    },
    putMemory(key: string, value: unknown) {
      legadoMemory.set(String(key), value);
    },
    getFromMemory(key: string) {
      const v = legadoMemory.get(String(key));
      return v === undefined ? 0 : v;
    },
  };
}

export function ensureExploreScriptSetsResult(script: string): string {
  let s = patchExploreScriptForReaderWeb(script.trimEnd());
  // QuickJS 路径用 IIFE 包裹脚本，脚本内 `var result` 会遮蔽外层；须写入 globalThis.result
  if (/\b(?:globalThis\.)?result\s*=\s*JSON\.stringify\s*\(/m.test(s)) return s;
  const m = s.match(/^([\s\S]*?)^(\s*)JSON\.stringify\s*\(\s*([\w$]+)\s*\)\s*;?\s*$/m);
  if (m) {
    return `${m[1]}${m[2]}result = globalThis.result = JSON.stringify(${m[3]});`;
  }
  // 光遇 gysearch 等：末行 `data:;base64,...` 模板字符串
  if (!/\b(?:globalThis\.)?result\s*=/.test(s)) {
    const tail = s.match(/^([\s\S]*?)(\n\s*)(`data:[^`]*`)\s*;?\s*$/);
    if (tail) {
      return `${tail[1]}${tail[2]}globalThis.result = ${tail[3]};`;
    }
  }
  return s;
}
