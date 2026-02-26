/**
 * 前端执行 legado 风格发现页脚本（<js>...</js>）
 * 与 legado 一致：若有书源 jsLib 则先执行 jsLib 再执行发现页脚本，形成完整脚本环境；
 * 若无 jsLib 则注入 baseUrl、source、java、getArguments、cookie（含 getCookie）等占位，保证脚本可运行。
 */

import { get as httpGet, post } from '@/lib/http';
import { resolveUrl } from './utils';
import type { BookSource } from '@/types';
import type { ExploreSection } from './explore-sections';

const SCRIPT_TIMEOUT_MS = 15000;

/** 从 exploreUrl 中提取 <js>...</js> 内的脚本内容 */
export function extractExploreScript(exploreUrl: string | undefined): string | null {
  if (typeof exploreUrl !== 'string') return null;
  const s = exploreUrl.trim();
  if (!s.startsWith('<js>')) return null;
  const end = s.indexOf('</js>');
  if (end === -1) return null;
  return s.slice(4, end).trim();
}

/**
 * 执行发现页脚本，返回解析后的发现子项列表
 *
 * 核心策略：用 with(__scope__) { eval(scriptText) } 运行脚本。
 * - with 使得 __scope__ 的所有属性成为脚本的「可见变量」。
 * - 脚本里 result = xxx 会写入 __scope__.result（因 __scope__ 已有 result 属性）。
 * - var result = xxx 在嵌套函数中创建局部变量，不影响 __scope__.result。
 * - 不使用 "use strict"（with 不兼容 strict mode）。
 * - 无需正则替换 result = → resultRef.value =，彻底消除漏匹配风险。
 */
export async function runExploreScript(
  scriptContent: string,
  source: BookSource
): Promise<ExploreSection[]> {
  const baseUrl = source.sourceUrl || '';

  // ── ajax 响应缓存 & 待完成请求 ──
  // Legado 的 java.ajax 是同步阻塞的，浏览器无法同步 HTTP。
  // 策略：第一次运行收集请求 → 异步获取 → 用缓存重放脚本。
  const ajaxCache = new Map<string, string>();
  let pending: Promise<unknown>[] = [];

  // ── 重要：with(scopeObj) 的查找优先级 > 函数作用域 ──
  // 只在 scopeObj 上放「脚本不会/不应自己定义」的环境变量；
  // getArguments / getFanqieCookie 等脚本自定义函数 **绝不能放在 scopeObj 上**，
  // 否则会覆盖脚本自身的同名 function 声明。
  const scopeObj: Record<string, unknown> = {
    result: undefined,
    baseUrl,

    source: {
      getVariable(_key?: string): string {
        const raw = (source as Record<string, unknown>).header;
        if (typeof raw === 'string' && raw) {
          try {
            const h = JSON.parse(raw) as Record<string, string>;
            if (typeof _key === 'string') {
              const k = _key.toLowerCase();
              const entry = Object.entries(h).find(([name]) => name.toLowerCase() === k);
              if (entry) return entry[1];
            }
          } catch { /* ignore */ }
        }
        return '';
      },
      setVariable(_val?: string) {
        // 本端暂不持久化书源变量；只是让脚本不报错
      },
    },

    java: {
      toast(_msg?: string) { /* 忽略 */ },
      /**
       * 兼容 Legado java.ajax 的两种调用模式：
       * 1. 同步返回：var res = java.ajax(url)  → 返回响应文本（需 replay）
       * 2. 异步回调：java.ajax(url, callback)   → 回调收到响应
       * 3. 带选项：  java.ajax(url, opts, cb)    → 同上
       */
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
          // 无回调 — 同步返回模式
          if (optionsOrCb && typeof optionsOrCb === 'object') {
            method = ((optionsOrCb.method as string) || 'GET').toUpperCase();
            body = optionsOrCb.body as string | undefined;
            const h = optionsOrCb.headers as Record<string, string> | undefined;
            if (h && typeof h === 'object') headers = { ...headers, ...h };
          }
        }

        let urlStr = typeof url === 'string' ? url : '';
        if (!urlStr && url && typeof url === 'object') {
          urlStr = (url as { url?: string }).url ?? (url as { href?: string }).href ?? '';
        }
        if (!urlStr || urlStr.includes('[object Object]')) {
          if (callback) callback('');
          return '';
        }
        const resolvedUrl = resolveUrl(baseUrl, urlStr);

        // ── 缓存命中：直接返回/回调 ──
        if (ajaxCache.has(resolvedUrl)) {
          const cached = ajaxCache.get(resolvedUrl)!;
          if (callback) {
            try { callback(cached); } catch (e) {
              console.warn('[explore-script] ajax callback error:', e);
            }
          }
          return cached;
        }

        // ── 缓存未命中：发起异步请求 ──
        const p = requestInScript(resolvedUrl, {
          method: method as 'GET' | 'POST',
          headers: Object.keys(headers).length ? headers : undefined,
          body,
          source,
        })
          .then((text) => {
            ajaxCache.set(resolvedUrl, text);
            if (callback) {
              try { callback(text); } catch (e) {
                console.warn('[explore-script] ajax callback error:', e);
              }
            }
          })
          .catch((e) => {
            console.warn('[explore-script] ajax failed:', e);
            ajaxCache.set(resolvedUrl, '');
            if (callback) callback('');
          });
        pending.push(p);

        // 同步返回空字符串（第一次运行时无数据；replay 时走缓存）
        return '';
      },
    },
  };

  // ── cookie / jsLib 处理 ──

  const jsLib = typeof (source as Record<string, unknown>).jsLib === 'string'
    ? (source as Record<string, unknown>).jsLib as string : '';

  const cookieRef: { getCookie?: () => string } = { getCookie: () => '' };
  scopeObj.cookie = cookieRef;
  scopeObj.cookieRef = cookieRef;

  // ── 兜底函数声明 ──
  const fallbackFunctions = [
    'function getArguments(a, k) { try { a = JSON.parse(a); } catch(e) { a = {}; } return k ? a[k] : a; }',
    'function getFanqieCookie() { return ""; }',
  ].join('\n');

  const bindGetFanqieCookie =
    "if (typeof getFanqieCookie === 'function') { getFanqieCookie = getFanqieCookie.bind({ cookie: cookieRef }); }";

  const fullScript = [
    fallbackFunctions,
    jsLib ? jsLib + '\n' : '',
    bindGetFanqieCookie,
    scriptContent,
  ].join('\n');

  // ── 沙箱函数 ──
  const run = new Function(
    '__scope__',
    'scriptText',
    'try { with(__scope__) { eval(scriptText); } } catch (e) { console.warn("[explore-script] run error:", e); }'
  );

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('发现页脚本执行超时')), SCRIPT_TIMEOUT_MS);
  });

  const runPromise = (async () => {
    // ── Pass 1: 执行脚本，收集 ajax 请求 ──
    run(scopeObj, fullScript);
    console.log('[explore-script] pass1 result:', typeof scopeObj.result,
      'pending:', pending.length, 'cache:', ajaxCache.size);

    if (pending.length > 0) {
      await Promise.all(pending);
      console.log('[explore-script] all ajax done, cache size:', ajaxCache.size);
    }

    // ── 如果 result 已有值（回调模式成功），直接返回 ──
    if (scopeObj.result !== undefined) {
      console.log('[explore-script] result set by callback, type:', typeof scopeObj.result,
        'preview:', typeof scopeObj.result === 'string'
        ? (scopeObj.result as string).slice(0, 300)
        : JSON.stringify(scopeObj.result)?.slice(0, 300));
      return scopeObj.result;
    }

    // ── Pass 2 (replay): 缓存已填充，重新执行脚本 ──
    // java.ajax 会命中缓存并同步返回数据，脚本完整执行。
    if (ajaxCache.size > 0) {
      console.log('[explore-script] replaying with cached data...');
      scopeObj.result = undefined;
      pending = [];
      run(scopeObj, fullScript);
      // 如果 replay 中有新的 ajax（回调模式），等待它们
      if (pending.length > 0) {
        await Promise.all(pending);
      }
      console.log('[explore-script] replay result:', typeof scopeObj.result,
        'preview:', typeof scopeObj.result === 'string'
        ? (scopeObj.result as string).slice(0, 300)
        : JSON.stringify(scopeObj.result)?.slice(0, 300));
    }

    return scopeObj.result;
  })();

  const raw = await Promise.race([runPromise, timeoutPromise]);
  const sections = parseScriptResult(raw);
  console.log('[explore-script] final:', sections.length, 'sections, first 3:', JSON.stringify(sections.slice(0, 3)));
  return sections;
}

/** 使用书源请求（统一走 get/post，便于 Tauri 绕过 CORS） */
async function requestInScript(
  url: string,
  options: {
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    source: BookSource;
  }
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

const EXPLORE_LIST_KEYS = [
  'personalCenter',
  'header',
  'top',
  'rankings',
  'categories',
  'tags',
  'list',
  'data',
  'sections',
  'items',
  'children',
];

/** 从对象中按 listKeys 抽出数组并扁平；无则返回 [] */
function flattenToItems(obj: Record<string, unknown>): unknown[] {
  const arr: unknown[] = [];
  for (const key of EXPLORE_LIST_KEYS) {
    const val = obj[key];
    if (Array.isArray(val)) arr.push(...val);
  }
  return arr;
}

/** 将脚本返回值解析为 ExploreSection[]；支持扁平的 [{title,url}] 或多块结构 { data, rankings, ... } 或 API 字符串 "{\"code\":0,\"data\":[...]}" */
function parseScriptResult(raw: unknown): ExploreSection[] {
  if (raw == null) return [];

  let arr: unknown[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        arr = parsed;
      } else if (parsed && typeof parsed === 'object') {
        arr = flattenToItems(parsed as Record<string, unknown>);
        if (arr.length === 0) arr = [parsed];
      } else {
        arr = [parsed];
      }
    } catch {
      return [];
    }
  } else if (typeof raw === 'object') {
    arr = flattenToItems(raw as Record<string, unknown>);
    if (arr.length === 0) arr = [raw];
  }

  const sections: ExploreSection[] = [];
  for (const item of arr) {
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const title = o.title ?? o.name ?? o.label;
      const url = o.url ?? o.link;
      if (title != null && String(title).trim()) {
        const styleRaw = o.style;
        let style: ExploreSection['style'] | undefined;
        if (styleRaw && typeof styleRaw === 'object' && !Array.isArray(styleRaw)) {
          const s = styleRaw as Record<string, unknown>;
          const grow = s.layout_flexGrow;
          const basis = s.layout_flexBasisPercent;
          if (typeof grow === 'number' || typeof basis === 'number') {
            style = {};
            if (typeof grow === 'number') style.layout_flexGrow = grow;
            if (typeof basis === 'number') style.layout_flexBasisPercent = basis;
          }
        }
        sections.push({
          title: String(title).trim(),
          url: typeof url === 'string' ? url : undefined,
          style,
        });
      }
    }
  }
  return sections;
}
