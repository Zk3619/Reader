/**
 * 书源脚本（登录 / 发现）共用的 baseUrl、localStorage 键与变量读写
 */

import type { BookSource } from '@/types';
import { normalizeBookSourceServerUrl } from '@/lib/book-source/source-http';

export const STORAGE_PREFIX_ARGS = 'reader_source_args_';
export const STORAGE_PREFIX_COOKIES = 'reader_source_cookies_';
export const STORAGE_PREFIX_LOGIN = 'reader_source_login_';

/**
 * 书源变量 JSON 里表示「当前聚合服务器」的字段名。
 * Legado 常见 `server`；光遇/晴天聚合等用 `线路`（与 jsLib BaseUrl 一致）。
 */
export const LEGADO_SERVER_ARG_KEYS = ['server', '线路'] as const;

/** 规范化 args 对象中的服务器 URL 字段（gyks http→https 等） */
export function normalizeServerFieldsInSourceArgs(obj: Record<string, unknown>): void {
  for (const key of LEGADO_SERVER_ARG_KEYS) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) {
      obj[key] = normalizeBookSourceServerUrl(v);
    }
  }
}

/** 从书源变量 JSON 读取第一个有效的服务器 URL */
export function readServerUrlFromSourceArgs(obj: Record<string, unknown>): string | null {
  for (const key of LEGADO_SERVER_ARG_KEYS) {
    const v = obj[key];
    if (typeof v === 'string' && isHttpUrl(v)) {
      return normalizeBookSourceServerUrl(v);
    }
  }
  return null;
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test((s ?? '').trim());
}

/** 从 jsLib 中提取第一个 http(s) 地址 */
export function firstHostFromJsLib(jsLib: unknown): string {
  const s = typeof jsLib === 'string' ? jsLib : '';
  const m = s.match(/['"](https?:\/\/[^'"]+)['"]/);
  return m ? m[1] : '';
}

/** 从 jsLib 的 host 数组提取全部 http(s) 地址 */
export function hostsFromJsLib(jsLib: unknown): string[] {
  const s = typeof jsLib === 'string' ? jsLib : '';
  const hosts: string[] = [];
  const re = /['"](https?:\/\/[^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    hosts.push(m[1]);
  }
  return hosts;
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
  const u = (source.sourceUrl ?? '').trim();
  if (u && isHttpUrl(u)) return u;
  const candidates = [
    (source as Record<string, unknown>).exploreUrl,
    (source as Record<string, unknown>).searchUrl,
    (source as Record<string, unknown>).bookSourceUrl,
  ].filter((x): x is string => typeof x === 'string' && isHttpUrl(x));
  const first = candidates[0];
  if (first) {
    try {
      return new URL(first).origin;
    } catch {
      return first;
    }
  }
  return firstHostFromJsLib((source as Record<string, unknown>).jsLib);
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
      try {
        if (typeof val === 'string') localStorage.setItem(argsKey, val);
      } catch {
        /* ignore */
      }
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
  'renderVersionPage',
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
`;

/**
 * 光遇 jsLib request() 在 java.ajax 返回空或非 JSON 时会同步递归 index+1 扫完全部线路。
 * Web 端 ajax 异步/挂起首轮常为空，须禁止同步扫线，改由宿主多轮重跑 + switchToNextLine。
 */
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
    var qttoken = __ctx.getToken ? __ctx.getToken() : '';
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
  '{"code":0,"msg":"","content":"","data":{"content":""},"__readerAjaxPending":true}';

/** jsLib + this 绑定 + 发现页兼容 shim + 用户脚本 */
export function buildLegadoExploreScriptBundle(jsLib: string, scriptContent: string): string {
  const body = ensureExploreScriptSetsResult(scriptContent);
  return [
    jsLib ? jsLib + '\n' : '',
    EXPLORE_JSLIB_THIS_BIND_SHIM,
    EXPLORE_JSLIB_CONTEXT_SHIM,
    GYKS_REQUEST_NO_SYNC_FAILOVER_SHIM,
    body,
  ].join('\n');
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
  };
}

export function ensureExploreScriptSetsResult(script: string): string {
  const s = script.trimEnd();
  // QuickJS 路径用 IIFE 包裹脚本，脚本内 `var result` 会遮蔽外层；须写入 globalThis.result
  if (/\b(?:globalThis\.)?result\s*=\s*JSON\.stringify\s*\(/m.test(s)) return s;
  const m = s.match(/^([\s\S]*?)^(\s*)JSON\.stringify\s*\(\s*([\w$]+)\s*\)\s*;?\s*$/m);
  if (m) {
    return `${m[1]}${m[2]}globalThis.result = JSON.stringify(${m[3]});`;
  }
  return s;
}
