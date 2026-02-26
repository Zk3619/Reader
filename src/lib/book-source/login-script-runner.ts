/**
 * 书源登录脚本执行环境（与 explore-script-runner 风格一致）
 * 提供：result、baseUrl、host、source.getLoginInfo/putLoginInfo、getArgument/setArgument、
 * cookie、java（ajax、toast、longToast、androidId、startBrowserAwait）
 */

import { invoke } from '@tauri-apps/api/core';
import { get as httpGet, post } from '@/lib/http';
import { deleteCookie } from '@/lib/http/cookie-manager';
import { resolveUrl } from './utils';
import type { BookSource } from '@/types';
import { openUrlInApp } from '@/lib/platform/open-url';

const SCRIPT_TIMEOUT_MS = 20000;
const STORAGE_PREFIX_LOGIN = 'reader_source_login_';
const STORAGE_PREFIX_ARGS = 'reader_source_args_';
const STORAGE_PREFIX_COOKIES = 'reader_source_cookies_';
const ANDROID_ID_KEY = 'reader_login_android_id';

const LOG_TAG = '[login-script]';

/** 脚本内 java.ajax() 需同步返回响应体（Legado 行为），用挂起/恢复实现：抛出此错误后由 runner 等待请求完成并重跑脚本 */
class SuspendScript extends Error {
  constructor(
    public promise: Promise<string>,
    public writeIndex: number,
    public resolvedUrl: string
  ) {
    super('SuspendScript');
    this.name = 'SuspendScript';
  }
}

/** Legado 格式：java.startBrowser 可能传入 "url,{json}"，只取逗号前的 URL 用于打开 */
function urlForOpen(url: string): string {
  const s = String(url ?? '').trim();
  const comma = s.indexOf(',');
  return comma > 0 ? s.slice(0, comma).trim() : s;
}

/** 是否可在应用内打开（http(s) 或 data:，用于 startBrowser） */
function isOpenableUrl(url: string): boolean {
  return /^(https?:|data:)/i.test((url ?? '').trim());
}

/** 在 Tauri 桌面端优先用 open_url_with_cookies（原生 set_cookie + 新窗口），否则用 prepare_login_open + 协议打开 */
async function openUrlWithOptionalCookies(
  url: string,
  cookieStr: string,
  title: string
): Promise<void> {
  const trimmed = (url ?? '').trim();
  const hasCookie = typeof cookieStr === 'string' && cookieStr.trim().length > 0;
  if (!hasCookie || !/^https?:/i.test(trimmed)) {
    await openUrlInApp(trimmed, title);
    return;
  }
  try {
    await invoke('open_url_with_cookies', {
      url: trimmed,
      cookies: cookieStr.trim(),
      title: title || '书源设置',
    });
    return;
  } catch {
    /* 无 open_url_with_cookies（如移动端）或调用失败，回退到协议方式 */
  }
  try {
    const id = await invoke<string>('prepare_login_open', {
      url: trimmed,
      cookies: cookieStr.trim(),
    });
    if (id) {
      await openUrlInApp(`reader-login-open://open?id=${encodeURIComponent(id)}`, title);
      return;
    }
  } catch {
    /* 非 Tauri 或调用失败，直接打开 */
  }
  await openUrlInApp(trimmed, title);
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

function storageKey(prefix: string, sourceUrl: string): string {
  try {
    return prefix + btoa(encodeURIComponent(sourceUrl)).replace(/[/+=]/g, '_');
  } catch {
    return prefix + String(sourceUrl).slice(0, 64);
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
/** 仅当为 http(s) 时视为有效 baseUrl，避免把书源名称等当 URL */
function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test((s ?? '').trim());
}

/** 从 jsLib 中提取第一个 http(s) 地址（如 host = ['https://v1.gyks.cf', ...]） */
function firstHostFromJsLib(jsLib: unknown): string {
  const s = typeof jsLib === 'string' ? jsLib : '';
  const m = s.match(/['"](https?:\/\/[^'"]+)['"]/);
  return m ? m[1] : '';
}

/**
 * 取书源用于脚本的 baseUrl，必须是 http(s)。
 * 很多 Legado 书源把 bookSourceUrl 写成名称（如「晴天融合VIP4.0」）作为唯一标识，非 URL，
 * 故会从 exploreUrl/searchUrl 或 jsLib 的 host 数组兜底取第一个可用地址。
 */
function getScriptBaseUrl(source: BookSource): string {
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
      const origin = new URL(first).origin;
      return origin;
    } catch {
      return first;
    }
  }
  const fromJs = firstHostFromJsLib((source as Record<string, unknown>).jsLib);
  if (fromJs) {
    console.debug(LOG_TAG, 'baseUrl 从 jsLib host 兜底（书源 sourceUrl 非 http(s)，为名称/标识）', { sourceUrl: u.slice(0, 30), fromJs: fromJs.slice(0, 50) });
    return fromJs;
  }
  return '';
}

export async function runLoginScript(
  source: BookSource,
  options: RunLoginScriptOptions
): Promise<void> {
  const { formValues, action, onToast } = options;
  const baseUrl = getScriptBaseUrl(source);
  const loginUrlScript = (source.loginUrl ?? '').trim();
  if (!loginUrlScript) return;
  if (onToast) onToast(`脚本执行: ${(action || '').trim().slice(0, 40) || '(空)'}`, false);
  console.warn(LOG_TAG, 'runLoginScript', { action: action?.slice(0, 50), baseUrl: baseUrl?.slice(0, 60) });

  const srcRecord = source as Record<string, unknown>;
  const sourceUrl = String(
    source.sourceUrl ?? srcRecord.bookSourceUrl ?? srcRecord.sourceUrl ?? ''
  ).trim();
  const loginKey = storageKey(STORAGE_PREFIX_LOGIN, sourceUrl);
  const argsKey = storageKey(STORAGE_PREFIX_ARGS, sourceUrl);
  const cookiesKey = storageKey(STORAGE_PREFIX_COOKIES, sourceUrl);

  // 若本次是退出登录，先清空 localStorage 再加载，这样无论对话框是否为新代码都能清掉 cookie
  const isLogoutAction = /^\s*logout\s*\(\s*\)\s*$/.test((action ?? '').trim());
  if (isLogoutAction) {
    try {
      localStorage.removeItem(cookiesKey);
      localStorage.removeItem(loginKey);
      console.warn(LOG_TAG, 'runLoginScript(logout) 已清除 localStorage', { cookiesKey });
    } catch (e) {
      console.warn(LOG_TAG, 'runLoginScript(logout) 清除 localStorage 失败', e);
    }
  }

  const ajaxCache = new Map<string, string>();
  let pending: Promise<unknown>[] = [];
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
  const cookieObj = {
    _store: cookieStore,
    getCookie(url: string): string {
      const k = url || baseUrl;
      return this._store.get(k) ?? '';
    },
    setCookie(url: string, value: string): void {
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
    result: { ...formValues },
    baseUrl,
    host: [baseUrl],
    _ajaxResults: [] as string[],
    _ajaxReadIndex: 0,
    _ajaxWriteIndex: 0,
    /** 最近一次 ajax 的真实耗时（ms），供脚本显示「解析耗时」；因重跑时从缓存返回，Date.now() 差值为 ~0 */
    __lastAjaxDurationMs__: undefined as number | undefined,

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
      /** 在应用内打开 URL（书源设置/更新页等）；仅 http(s) 会真正打开窗口；同源时带上脚本内 cookie 以保持登录态 */
      startBrowserAwait(url: string): Promise<string> {
        const raw = (url || '').trim();
        const toOpen = raw.startsWith('data:') ? raw : urlForOpen(raw);
        const resolved = baseUrl && !toOpen.startsWith('data:') ? resolveUrl(baseUrl, toOpen) : toOpen;
        const ok = isOpenableUrl(resolved);
        console.warn(LOG_TAG, 'startBrowserAwait', {
          raw: raw.slice(0, 80),
          toOpen: toOpen.slice(0, 60),
          resolved: resolved.slice(0, 80),
          baseUrl: baseUrl?.slice(0, 60),
          willOpen: ok,
        });
        if (onToast) onToast(ok ? `正在打开: ${resolved.slice(0, 50)}…` : `[startBrowserAwait] URL 无效，未打开: ${resolved.slice(0, 40)}`, false);
        let cookieStr = cookieObj.getCookie(resolved) || (baseUrl ? cookieObj.getCookie(baseUrl) : '');
        if (!cookieStr && resolved.startsWith('http')) {
          try {
            cookieStr = cookieObj.getCookie(new URL(resolved).origin);
          } catch {
            /* ignore */
          }
        }
        console.warn(LOG_TAG, 'startBrowserAwait cookie', {
          resolved: resolved.slice(0, 80),
          baseUrl: baseUrl?.slice(0, 80),
          cookiePreview: (cookieStr || '').slice(0, 120),
          hasCookie: !!cookieStr,
        });
        const p = ok
          ? openUrlWithOptionalCookies(resolved, cookieStr, '书源设置').then(() => '')
          : Promise.resolve('');
        pending.push(p);
        return p;
      },
      /** Legado：打开 URL（不等待），本端与 startBrowserAwait 相同：仅 http(s) 打开，同源带 cookie */
      startBrowser(url: string): void {
        const raw = (url || '').trim();
        const toOpen = raw.startsWith('data:') ? raw : urlForOpen(raw);
        const resolved = baseUrl && !toOpen.startsWith('data:') ? resolveUrl(baseUrl, toOpen) : toOpen;
        const ok = isOpenableUrl(resolved);
        console.warn(LOG_TAG, 'startBrowser', {
          raw: raw.slice(0, 80),
          toOpen: toOpen.slice(0, 60),
          resolved: resolved.slice(0, 80),
          baseUrl: baseUrl?.slice(0, 60),
          willOpen: ok,
        });
        if (onToast) onToast(ok ? `正在打开: ${resolved.slice(0, 50)}…` : `[startBrowser] URL 无效，未打开: ${resolved.slice(0, 40)}`, false);
        let cookieStr = cookieObj.getCookie(resolved) || (baseUrl ? cookieObj.getCookie(baseUrl) : '');
        if (!cookieStr && resolved.startsWith('http')) {
          try {
            cookieStr = cookieObj.getCookie(new URL(resolved).origin);
          } catch {
            /* ignore */
          }
        }
        console.warn(LOG_TAG, 'startBrowser cookie', {
          resolved: resolved.slice(0, 80),
          baseUrl: baseUrl?.slice(0, 80),
          cookiePreview: (cookieStr || '').slice(0, 120),
          hasCookie: !!cookieStr,
        });
        const p: Promise<void> = ok
          ? openUrlWithOptionalCookies(resolved, cookieStr, '书源设置')
          : Promise.resolve();
        pending.push(p);
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
        if (scriptCookie) {
          headers = { ...headers, Cookie: scriptCookie };
          console.warn(LOG_TAG, 'ajax 使用 cookie', {
            url: resolvedUrl,
            baseUrl: baseUrl?.slice(0, 80),
            cookiePreview: scriptCookie.slice(0, 120),
          });
        } else {
          console.warn(LOG_TAG, 'ajax 无 cookie', {
            url: resolvedUrl,
            baseUrl: baseUrl?.slice(0, 80),
            storeSize: cookieStore.size,
            storeKeys: Array.from(cookieStore.keys()).slice(0, 5),
          });
        }
        // 晴天聚合 user_api 额外需要 body 里带 key；若脚本未提供 body，则从 cookie.qttoken 注入 JSON body
        const isUserApi = /\/user_api\b/.test(resolvedUrl);
        if (isUserApi && method === 'POST' && body == null) {
          const m = String(scriptCookie || '').match(/qttoken=([^;]+)/);
          const token = m ? m[1] : '';
          if (token) {
            body = JSON.stringify({ key: token });
            headers = {
              ...headers,
              'Content-Type': 'application/json',
            };
            console.warn(LOG_TAG, 'user_api 注入 body.key', {
              url: resolvedUrl.slice(0, 80),
              tokenPreview: token.slice(0, 8),
            });
          }
        }
        const p = requestInScript(resolvedUrl, {
          method: method as 'GET' | 'POST',
          headers: Object.keys(headers).length ? headers : undefined,
          body,
          source,
        });
        throw new SuspendScript(p, writeIdx, resolvedUrl);
      },
    },
  };

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

  const run = new Function(
    '__scope__',
    'scriptText',
    'try { with(__scope__) { eval(scriptText); } } catch (e) { console.warn("[login-script] run error:", e); throw e; }'
  );

  // 书源在 loginUrl 里用 function login() {} 等定义函数，action 必须在同一 eval 作用域内执行才能访问这些函数
  const scriptThenAction = fullScript + '\n; ' + (action || '').trim();
  /** 在每条 catch 开头注入：若是 SuspendScript 则直接抛出，避免书源脚本把挂起当成登录失败提示 */
  const wrappedScript = scriptThenAction.replace(
    /\} catch \s*\(\s*(\w+)\s*\)\s*\{/g,
    (_m, id) => `} catch (${id}) { if (${id} && ${id}.name === 'SuspendScript') throw ${id}; `
  );
  console.warn(LOG_TAG, '执行 action', { action: (action || '').slice(0, 60) });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('登录脚本执行超时')), SCRIPT_TIMEOUT_MS);
  });

  const runPromise = (async () => {
    try {
      scopeObj.result = formValues;
      (scopeObj.putLoginInfo as (s: string) => void)(JSON.stringify(formValues));

      run(scopeObj, fullScript);
      while (pending.length > 0) {
        const batch = pending.splice(0, pending.length);
        await Promise.all(batch);
      }

      if (ajaxCache.size > 0) {
        scopeObj.result = formValues;
        (scopeObj.putLoginInfo as (s: string) => void)(JSON.stringify(formValues));
        pending = [];
        run(scopeObj, fullScript);
        while (pending.length > 0) {
          const batch = pending.splice(0, pending.length);
          await Promise.all(batch);
        }
      }

      scopeObj._ajaxResults = [];
      scopeObj._ajaxReadIndex = 0;
      scopeObj._ajaxWriteIndex = 0;
      suppressResumeToast = false;
      while (true) {
        try {
          run(scopeObj, wrappedScript);
          break;
        } catch (e) {
          if (e instanceof SuspendScript) {
            suppressResumeToast = true;
            const requestStart = Date.now();
            let result = '';
            try {
              result = await e.promise;
            } catch (err) {
              console.warn(LOG_TAG, 'ajax failed:', err);
              const msg = err instanceof Error ? err.message : String(err);
              result = msg;
              const short = /(\d{3})\s*:?/.exec(msg)?.[1] ?? msg.slice(0, 40);
              if (onToast) onToast(`登录请求失败: ${short}`, true);
            }
            scopeObj.__lastAjaxDurationMs__ = Date.now() - requestStart;
            (scopeObj._ajaxResults as string[])[e.writeIndex] = result ?? '';
            ajaxCache.set(e.resolvedUrl, result);
            const isLoginUrl = /login|signin|auth/i.test(e.resolvedUrl);
            console.warn(LOG_TAG, 'ajax 完成', {
              url: e.resolvedUrl.slice(0, 70),
              resultLength: result?.length ?? 0,
              isLoginUrl,
            });
            // 书源未调用 cookie.setCookie 时：从登录接口响应中解析 key/token 并写入 cookie 表，供 user_api 等请求使用
            if (result && baseUrl && isLoginUrl) {
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
                  console.warn(LOG_TAG, '登录响应中未解析到 key', {
                    url: e.resolvedUrl.slice(0, 80),
                    jsonKeys: Object.keys(json),
                    code: json.code,
                  });
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
  const common = {
    headers,
    timeout: 12000,
    enableCookieJar: options.source.enabledCookieJar,
    concurrentRate: options.source.concurrentRate,
    allowNon2xx: true, // 登录/检测接口 4xx 时仍返回 body，供书源解析 code/msg
  };
  if (options.method === 'POST') {
    return post(url, options.body ?? '', common);
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

  if (onToast) onToast(`脚本执行(Rust): ${(action || '').trim().slice(0, 40) || '(空)'}`, false);

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
      if (!item?.url?.trim() || !/^https?:/i.test(item.url.trim())) continue;
      try {
        const id = await invoke<string>('prepare_login_open', {
          url: item.url.trim(),
          cookies: (item.cookies ?? '').trim(),
        });
        if (id) await openUrlInApp(`reader-login-open://open?id=${encodeURIComponent(id)}`, '书源设置');
      } catch (e) {
        console.warn(LOG_TAG, 'open with cookies failed, fallback to plain url', e);
        openUrlInApp(item.url.trim(), '书源设置');
      }
    }
  } else {
    for (const url of output.urlsToOpen ?? []) {
      if (url?.trim() && /^(https?:|data:)/i.test(url.trim())) {
        openUrlInApp(url.trim(), '书源设置');
      }
    }
  }
  return output;
}
