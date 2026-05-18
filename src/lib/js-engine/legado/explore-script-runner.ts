/**
 * 前端执行 legado 风格发现页脚本（<js>...</js>）
 * 优先 QuickJS + 集中宿主 API；WASM 不可用时降级 with + Function。
 */

import { get as httpGet, post } from '@/lib/http';
import { resolveUrl } from '@/lib/book-source/utils';
import type { BookSource } from '@/types';
import type { ExploreSection } from '@/lib/book-source/explore-sections';
import { isQuickJSFallback } from '../core/runtime';
import { createExploreInjector } from './explore-inject';
import { runLegadoScriptQuickJS } from './quickjs-runner';
import { installScriptDateShim } from './script-date-shim';

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

async function tryRunExploreScriptQuickJS(
  scriptContent: string,
  source: BookSource
): Promise<ExploreSection[] | null> {
  if (isQuickJSFallback()) return null;

  const baseUrl = source.sourceUrl || '';
  const jsLib =
    typeof (source as Record<string, unknown>).jsLib === 'string'
      ? ((source as Record<string, unknown>).jsLib as string)
      : '';

  const bindGetFanqieCookie =
    "if (typeof getFanqieCookie === 'function') { getFanqieCookie = getFanqieCookie.bind({ cookie: cookieRef }); }";

  const fullScript = [
    'function getArguments(a, k) { try { a = JSON.parse(a); } catch(e) { a = {}; } return k ? a[k] : a; }',
    'function getFanqieCookie() { return ""; }',
    jsLib ? jsLib + '\n' : '',
    bindGetFanqieCookie,
    scriptContent,
  ].join('\n');

  const injector = createExploreInjector({
    baseUrl,
    resolveUrl,
    getCookie: () => '',
    source: {
      getVariable: (_key?: string) => {
        const raw = (source as Record<string, unknown>).header;
        if (typeof raw === 'string' && raw) {
          try {
            const h = JSON.parse(raw) as Record<string, string>;
            if (typeof _key === 'string') {
              const k = _key.toLowerCase();
              const entry = Object.entries(h).find(([name]) => name.toLowerCase() === k);
              if (entry) return entry[1];
            }
          } catch {
            /* ignore */
          }
        }
        return '';
      },
      setVariable: () => {},
    },
    request: (resolvedUrl, call) => requestInScript(resolvedUrl, { ...call, source }),
  });

  try {
    const raw = await runLegadoScriptQuickJS({
      script: fullScript,
      baseUrl,
      timeoutMs: SCRIPT_TIMEOUT_MS,
      mode: 'two-pass',
      inject: injector,
    });
    return parseScriptResult(raw);
  } catch (e) {
    console.warn('[explore-script] QuickJS 失败，降级 Function', e);
    return null;
  }
}

/**
 * 执行发现页脚本，返回解析后的发现子项列表
 */
export async function runExploreScript(
  scriptContent: string,
  source: BookSource
): Promise<ExploreSection[]> {
  const quick = await tryRunExploreScriptQuickJS(scriptContent, source);
  if (quick) {
    console.log('[explore-script] QuickJS final:', quick.length, 'sections');
    return quick;
  }

  return runExploreScriptLegacy(scriptContent, source);
}

/** Function + with 降级路径 */
async function runExploreScriptLegacy(
  scriptContent: string,
  source: BookSource
): Promise<ExploreSection[]> {
  const baseUrl = source.sourceUrl || '';

  const ajaxCache = new Map<string, string>();
  const ajaxDurationCache = new Map<string, number>();
  const { PatchedDate, applyAjaxDuration } = installScriptDateShim();
  let pending: Promise<unknown>[] = [];

  const scopeObj: Record<string, unknown> = {
    Date: PatchedDate,
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
      setVariable(_val?: string) {},
    },

    java: {
      toast(_msg?: string) {},
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
        } else if (optionsOrCb && typeof optionsOrCb === 'object') {
          method = ((optionsOrCb.method as string) || 'GET').toUpperCase();
          body = optionsOrCb.body as string | undefined;
          const h = optionsOrCb.headers as Record<string, string> | undefined;
          if (h && typeof h === 'object') headers = { ...headers, ...h };
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

        if (ajaxCache.has(resolvedUrl)) {
          const d = ajaxDurationCache.get(resolvedUrl);
          if (d != null && d >= 0) applyAjaxDuration(d);
          const cached = ajaxCache.get(resolvedUrl)!;
          if (callback) {
            try { callback(cached); } catch (e) {
              console.warn('[explore-script] ajax callback error:', e);
            }
          }
          return cached;
        }

        const requestStart = Date.now();
        const p = requestInScript(resolvedUrl, {
          method: method as 'GET' | 'POST',
          headers: Object.keys(headers).length ? headers : undefined,
          body,
          source,
        })
          .then((text) => {
            const durationMs = Date.now() - requestStart;
            if (durationMs >= 0) ajaxDurationCache.set(resolvedUrl, durationMs);
            ajaxCache.set(resolvedUrl, text);
            if (callback) {
              try { callback(text); } catch (e) {
                console.warn('[explore-script] ajax callback error:', e);
              }
            }
          })
          .catch((e) => {
            console.warn('[explore-script] ajax failed:', e);
            const durationMs = Date.now() - requestStart;
            if (durationMs >= 0) ajaxDurationCache.set(resolvedUrl, durationMs);
            ajaxCache.set(resolvedUrl, '');
            if (callback) callback('');
          });
        pending.push(p);
        return '';
      },
    },
  };

  const jsLib =
    typeof (source as Record<string, unknown>).jsLib === 'string'
      ? ((source as Record<string, unknown>).jsLib as string)
      : '';

  const cookieRef: { getCookie?: () => string } = { getCookie: () => '' };
  scopeObj.cookie = cookieRef;
  scopeObj.cookieRef = cookieRef;

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

  const run = new Function(
    '__scope__',
    'scriptText',
    'try { with(__scope__) { eval(scriptText); } } catch (e) { console.warn("[explore-script] run error:", e); }'
  );

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('发现页脚本执行超时')), SCRIPT_TIMEOUT_MS);
  });

  const runPromise = (async () => {
    run(scopeObj, fullScript);
    if (pending.length > 0) await Promise.all(pending);
    if (scopeObj.result !== undefined) return scopeObj.result;
    if (ajaxCache.size > 0) {
      scopeObj.result = undefined;
      pending = [];
      run(scopeObj, fullScript);
      if (pending.length > 0) await Promise.all(pending);
    }
    return scopeObj.result;
  })();

  const raw = await Promise.race([runPromise, timeoutPromise]);
  const sections = parseScriptResult(raw);
  console.log('[explore-script] legacy final:', sections.length, 'sections');
  return sections;
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

function flattenToItems(obj: Record<string, unknown>): unknown[] {
  const arr: unknown[] = [];
  for (const key of EXPLORE_LIST_KEYS) {
    const val = obj[key];
    if (Array.isArray(val)) arr.push(...val);
  }
  return arr;
}

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
