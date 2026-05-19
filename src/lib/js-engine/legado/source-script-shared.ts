/**
 * 书源脚本（登录 / 发现）共用的 baseUrl、localStorage 键与变量读写
 */

import type { BookSource } from '@/types';

export const STORAGE_PREFIX_ARGS = 'reader_source_args_';
export const STORAGE_PREFIX_COOKIES = 'reader_source_cookies_';
export const STORAGE_PREFIX_LOGIN = 'reader_source_login_';

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

/** Legado 书源唯一标识（可为名称非 URL） */
export function getSourceUrlIdentifier(source: BookSource): string {
  const src = source as Record<string, unknown>;
  return String(source.sourceUrl ?? src.bookSourceUrl ?? src.sourceUrl ?? '').trim();
}

export function getSourceArgsKey(source: BookSource): string {
  return storageKey(STORAGE_PREFIX_ARGS, getSourceUrlIdentifier(source));
}

export function getSourceCookiesKey(source: BookSource): string {
  return storageKey(STORAGE_PREFIX_COOKIES, getSourceUrlIdentifier(source));
}

export function getSourceLoginKey(source: BookSource): string {
  return storageKey(STORAGE_PREFIX_LOGIN, getSourceUrlIdentifier(source));
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
        if (raw != null && raw !== '') return raw;
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

export function ensureExploreScriptSetsResult(script: string): string {
  const s = script.trimEnd();
  if (/\bresult\s*=\s*JSON\.stringify\s*\(/m.test(s)) return s;
  const m = s.match(/^([\s\S]*?)^(\s*)JSON\.stringify\s*\(\s*([\w$]+)\s*\)\s*;?\s*$/m);
  if (m) {
    return `${m[1]}${m[2]}result = JSON.stringify(${m[3]});`;
  }
  return s;
}
