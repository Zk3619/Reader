/**
 * 书源规则 JS（正文/详情等）执行器
 * 对齐 Legado AnalyzeRule.evalJS bindings：src、java.getString(含嵌套 <js>)、java.ajax 同步语义
 */

import { extractApiContent } from '@/lib/book-source/extract-api-content';
import { resolveUrl } from '@/lib/book-source/utils';
import {
  legadoJavaAndroidId,
  legadoJavaDeviceID,
  resolveBookSourceServerUrl,
  resolveSourceCookiesForHttp,
} from '@/lib/book-source/source-http';
import { requestLegadoRuleScriptHttpAsync } from '@/lib/js-engine/legado/rule-script-http';
import { parseAjaxArgs } from '@/lib/js-engine/legado/host/parse-ajax';
import {
  EXPLORE_JSLIB_CONTEXT_SHIM,
  LEGADO_AJAX_PENDING_JSON,
  createSourceVariableHandlers,
  hostsFromJsLib,
  getSourceArgsKey,
  readSourceLoginInfoMap,
} from '@/lib/js-engine/legado/source-script-shared';
import {
  buildRuleScriptFullBody,
  patchLegadoRuleScript,
} from '@/lib/js-engine/legado/rule-script-patches';
import { legadoCookieGetKey } from '@/lib/js-engine/legado/login-script-runner';
import { javaGetString, type JavaGetStringContext } from '@/lib/rule-engine/java-get-string';
import { splitSourceRule } from '@/lib/rule-engine/legado-source-rule';
import type { BookSource } from '@/types';
import type { JsContext } from '@/lib/js-engine/quickjs-sandbox';
import {
  normalizeJsRuleResult,
  wrapLegadoJsBodyWithImplicitReturn,
} from '@/lib/js-engine/quickjs-sandbox';
import {
  createRuleScriptBrowserHandlers,
  createRuleScriptBrowserState,
  isRuleScriptBrowserSuspend,
} from '@/lib/js-engine/legado/rule-script-browser';
import type { SuspendScript } from '@/lib/js-engine/legado/suspend-script';

const SCRIPT_TIMEOUT_MS = 90_000;
const MAX_AJAX_ROUNDS = 8;

export function needsLegadoRuleScriptRunner(code: string): boolean {
  const t = String(code ?? '');
  return (
    /\bjava\.getString\b/.test(t) ||
    /\bjava\.get\b/.test(t) ||
    /\bjava\.ajax\b/.test(t) ||
    /\bjava\.startBrowser\b/.test(t) ||
    /\bjava\.startBrowserAwait\b/.test(t) ||
    /\bjava\.hexDecodeToString\b/.test(t) ||
    /\bgetArguments\b/.test(t) ||
    /\bsrc\.match\b/.test(t) ||
    /\bPackages\.java\b/.test(t) ||
    /\bsource\.bookSourceComment\b/.test(t)
  );
}

function normalizeSourceForLegado(source: Record<string, unknown> | undefined): Record<string, unknown> {
  const s = { ...(source ?? {}) };
  const comment =
    s.bookSourceComment ??
    s.sourceComment ??
    '';
  s.bookSourceComment = comment;
  s.sourceComment = comment;
  s.bookSourceUrl = s.bookSourceUrl ?? s.sourceUrl ?? '';
  return s;
}

function buildJavaGetStringContext(
  scope: Record<string, unknown>,
  ctx: JsContext,
): JavaGetStringContext {
  const content =
    (typeof scope.src === 'string' && scope.src) ||
    ctx.ruleContent ||
    (typeof ctx.result === 'string' ? ctx.result : '') ||
    '';
  return {
    content,
    contentType: ctx.ruleContentType,
    baseUrl: ctx.baseUrl,
    variables: ctx.variables,
    getVariable: (key) => {
      const v = ctx.variables?.[key];
      return v == null ? '' : String(v);
    },
  };
}

/**
 * 在 scope 上执行规则脚本（with + jsLib，对齐 Legado / explore-script-runner）
 * 避免 Function 形参与书源内 let sources/title 等冲突
 */
function runJsSnippet(
  snippet: string,
  scope: Record<string, unknown>,
  jsLib: string,
): unknown {
  const userBody = wrapLegadoJsBodyWithImplicitReturn(patchLegadoRuleScript(snippet));
  const fullBody = [
    buildRuleScriptFullBody(userBody, jsLib),
    EXPLORE_JSLIB_CONTEXT_SHIM,
  ]
    .filter(Boolean)
    .join('\n');
  const fn = new Function('__scope__', `with (__scope__) {\n${fullBody}\n}`);
  const out = fn(scope);
  if (out !== undefined && out !== null) {
    scope.result = out;
  }
  return out;
}

function executeLegadoGetStringRule(
  rule: string,
  scope: Record<string, unknown>,
  ctx: JsContext,
  jsLib: string,
): string {
  const segments = splitSourceRule(rule);
  if (segments.length === 0) {
    return javaGetString(rule, buildJavaGetStringContext(scope, ctx));
  }

  let acc = '';
  for (const seg of segments) {
    if (seg.mode === 'js') {
      runJsSnippet(seg.ruleStr, scope, jsLib);
      acc = scope.result == null ? '' : serializeRuleScriptResult(scope.result);
    } else {
      acc = javaGetString(seg.ruleStr, buildJavaGetStringContext(scope, ctx));
      scope.result = acc;
    }
  }
  return acc;
}

function readBookVariable(bookRecord: Record<string, unknown>, key?: string): string {
  const raw = String(bookRecord.variable ?? '');
  if (!key) return raw;
  if (!raw.trim()) return '';
  try {
    const map = JSON.parse(raw) as Record<string, unknown>;
    const v = map[key];
    return v == null ? '' : String(v);
  } catch {
    return key === 'custom' ? raw : '';
  }
}

/** POST /content 等同 URL 不同 body 须区分缓存键 */
export function buildRuleScriptAjaxCacheKey(
  url: string,
  method: string,
  body?: string,
): string {
  return `${method.toUpperCase()}\0${url}\0${body ?? ''}`;
}

/** ajax 已拿到 /content 但 paraFor* 抛错时，从缓存提取正文 */
function tryContentFromRuleScriptAjaxCache(
  ajaxCache: Map<string, string>,
): string | null {
  for (const body of ajaxCache.values()) {
    const text = body.trim();
    if (!text) continue;
    const extracted = extractApiContent(text);
    if (extracted?.trim()) {
      return extracted;
    }
  }
  return null;
}

function serializeRuleScriptResult(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** /catalog 等：code=0 且 data 为章节数组，不是「空正文」 */
function isLegadoCatalogTocApiResult(result: unknown): boolean {
  let parsed: Record<string, unknown> | null = null;
  if (typeof result === 'object' && result != null && !Array.isArray(result)) {
    parsed = result as Record<string, unknown>;
  } else if (typeof result === 'string') {
    const text = result.trim();
    if (!text.startsWith('{')) return false;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return false;
    }
  }
  if (!parsed || typeof parsed !== 'object') return false;
  if ('code' in parsed && parsed.code !== 0 && parsed.code !== '0') return false;
  const data = parsed.data;
  if (Array.isArray(data) && data.length > 0) return true;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const nested = data as Record<string, unknown>;
    for (const key of ['data', 'list', 'items', 'chapters']) {
      const rows = nested[key];
      if (Array.isArray(rows) && rows.length > 0) return true;
    }
  }
  return false;
}

function readRuleScriptContentField(parsed: Record<string, unknown>): string {
  const content = parsed.content;
  return typeof content === 'string' ? content.trim() : '';
}

function isLegadoRuleScriptChapterEntryPayload(result: unknown): boolean {
  let parsed: Record<string, unknown> | null = null;
  if (typeof result === 'object' && result != null && !Array.isArray(result)) {
    parsed = result as Record<string, unknown>;
  } else {
    const text = String(result ?? '').trim();
    if (!text || (/^[0-9a-f]+$/i.test(text) && text.length > 40)) return false;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return false;
    }
  }
  if (!parsed || typeof parsed !== 'object') return false;
  const hasChapterKeys =
    ('item_id' in parsed || 'book_id' in parsed) &&
    ('sources' in parsed || 'source' in parsed || 'tab' in parsed);
  return hasChapterKeys && !readRuleScriptContentField(parsed);
}

function isEmptyContentRuleResult(result: unknown): boolean {
  if (result == null) return false;
  if (isLegadoCatalogTocApiResult(result)) return false;
  if (isLegadoRuleScriptChapterEntryPayload(result)) return true;
  let parsed: Record<string, unknown> | null = null;
  if (typeof result === 'object' && !Array.isArray(result)) {
    parsed = result as Record<string, unknown>;
  } else {
    const text = String(result).trim();
    if (/^[0-9a-f]+$/i.test(text) && text.length > 40) return true;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return true;
    }
  }
  if (!parsed || typeof parsed !== 'object') return false;
  if (parsed.__readerAjaxPending === true) return true;
  if (!('code' in parsed)) {
    return !Object.values(parsed).some((v) => typeof v === 'string' && v.trim().length > 0);
  }
  if ('code' in parsed && parsed.code !== 0 && parsed.code !== '0') return true;
  return !readRuleScriptContentField(parsed);
}

function ruleScriptResultLooksFinal(result: unknown): boolean {
  if (result == null) return false;
  if (isLegadoCatalogTocApiResult(result)) return true;
  if (typeof result === 'object') {
    const parsed = result as Record<string, unknown>;
    if ('code' in parsed && parsed.code !== 0 && parsed.code !== '0') {
      return false;
    }
    return readRuleScriptContentField(parsed).length > 0;
  }
  const text = String(result).trim();
  if (!text) return false;
  if (/^[0-9a-f]+$/i.test(text) && text.length > 40) return false;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      if ('code' in parsed && parsed.code !== 0 && parsed.code !== '0') {
        return false;
      }
      return readRuleScriptContentField(parsed).length > 0;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * 执行含 java.ajax / java.getString(<js>) 的规则脚本（多轮 ajax 缓存重跑，对齐 Legado）
 */
export async function runLegadoRuleScript(
  code: string,
  context: JsContext,
  bookSource?: BookSource,
): Promise<unknown> {
  const script = code.trim();
  const ruleContent =
    context.ruleContent ??
    (typeof context.result === 'string' ? context.result : String(context.result ?? ''));

  const sourceRecord = normalizeSourceForLegado(
    context.source as Record<string, unknown> | undefined,
  );
  const jsLib =
    typeof sourceRecord.jsLib === 'string' ? (sourceRecord.jsLib as string) : '';
  const chapterRecord = (context.chapter ?? {}) as Record<string, unknown>;
  const bookRecord: Record<string, unknown> = {
    type: 0,
    ...(context.book && typeof context.book === 'object'
      ? (context.book as Record<string, unknown>)
      : {}),
  };
  const tabForBookType = String(
    (context.variables as Record<string, string> | undefined)?.tab ??
      chapterRecord.tab ??
      '',
  ).trim();
  if (tabForBookType === '漫画') {
    bookRecord.type = 64;
  } else if (tabForBookType === '小说') {
    bookRecord.type = 8;
  } else if (tabForBookType === '听书') {
    bookRecord.type = 32;
  } else if (tabForBookType === '短剧') {
    bookRecord.type = 16;
  }

  const ajaxCache = new Map<string, string>();
  let pending: Promise<void>[] = [];
  const browserState = createRuleScriptBrowserState();
  /** Legado 多轮 ajax 重跑时仍保留规则入口 result（如 data: tocUrl 的 hex 载荷） */
  const initialResult = normalizeJsRuleResult(context.result);

  const baseUrl = context.baseUrl || String(sourceRecord.bookSourceUrl ?? sourceRecord.sourceUrl ?? '');
  const hostList = hostsFromJsLib(sourceRecord.jsLib);

  const readSourceVariable = (): string => {
    if (!bookSource || typeof localStorage === 'undefined') return '';
    try {
      return localStorage.getItem(getSourceArgsKey(bookSource)) ?? '';
    } catch {
      return '';
    }
  };

  const getArguments = (openArgument: unknown, key?: string): unknown => {
    let parsed: Record<string, unknown> = {};
    if (typeof openArgument === 'string' && openArgument.trim()) {
      try {
        parsed = JSON.parse(openArgument) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
    } else if (openArgument && typeof openArgument === 'object') {
      parsed = openArgument as Record<string, unknown>;
    }
    if (key) return parsed[key];
    return parsed;
  };

  const sourceVariableHandlers =
    bookSource != null
      ? createSourceVariableHandlers(bookSource, getSourceArgsKey(bookSource))
      : null;

  const chapterVars = (context.variables ?? {}) as Record<string, string>;
  const legadoSources =
    chapterVars.sources || chapterVars.source || String(chapterRecord.sources ?? chapterRecord.source ?? '');
  const legadoTab = chapterVars.tab || String(chapterRecord.tab ?? '');
  const legadoTitle = chapterVars.title || String(chapterRecord.title ?? '');
  const legadoBookId = chapterVars.book_id || '';
  const legadoUrl = chapterVars.url || String(chapterRecord.url ?? '');

  const legadoMemory = new Map<string, unknown>();
  const legadoCache = {
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

  const buildScope = (): Record<string, unknown> => {
    const browserHandlers = createRuleScriptBrowserHandlers({
      bookSource,
      baseUrl,
      state: browserState,
      pending,
    });
    const scope: Record<string, unknown> = {
      result: initialResult,
      src: ruleContent,
      /** 对齐 Legado 规则隐式绑定：data: 章节 hex 载荷或 AnalyzeUrl 正文 */
      content: ruleContent,
      cache: legadoCache,
      baseUrl,
      host: hostList.length > 0 ? hostList : [baseUrl].filter(Boolean),
      bhost: () => (hostList[0] || baseUrl || '').replace(/\/+$/, ''),
      // 对齐 Legado 规则脚本隐式绑定（ruleContent 在解析 res 前会 java.put('sources', sources)）
      sources: legadoSources,
      tab: legadoTab,
      book_id: legadoBookId,
      url: legadoUrl,
      getArguments,
      book: Object.assign(bookRecord, {
        getVariable(key?: string) {
          return readBookVariable(bookRecord, key);
        },
      }),
      source: {
        ...sourceRecord,
        ...(bookSource
          ? { getLoginInfoMap: () => readSourceLoginInfoMap(bookSource) }
          : {}),
        getVariable(key?: string) {
          if (sourceVariableHandlers) {
            return sourceVariableHandlers.getVariable(key);
          }
          if (!key) return readSourceVariable();
          try {
            const raw = readSourceVariable();
            if (!raw.trim()) return '';
            return String(getArguments(raw, key) ?? '');
          } catch {
            return '';
          }
        },
        setVariable(val?: string) {
          sourceVariableHandlers?.setVariable(val);
        },
      },
      chapter: chapterRecord,
      title: legadoTitle || String(chapterRecord.title ?? ''),
      JSON,
      cookie: (() => {
        const getCookie = (url: string) => {
          if (!bookSource) return '';
          const u = String(url).trim().replace(/\/+$/, '');
          let c = resolveSourceCookiesForHttp(bookSource, u).trim();
          if (c) return c;
          const server = resolveBookSourceServerUrl(bookSource);
          if (server) return resolveSourceCookiesForHttp(bookSource, server).trim();
          return '';
        };
        return {
        getCookie,
        removeCookie() {},
        setCookie() {},
        getKey(cookieStrOrUrl: string, keyName?: string): string {
          return legadoCookieGetKey(
            new Map(),
            getCookie,
            cookieStrOrUrl,
            keyName,
            bookSource,
          );
        },
        };
      })(),
      Packages: {
        java: {
          lang: {
            Thread: {
              sleep: () => {},
            },
          },
        },
      },
      java: {
        put(key: string, val: unknown) {
          const k = String(key);
          if (context.variables) context.variables[k] = val;
        },
        get(key: string) {
          const v = context.variables?.[String(key).trim()];
          return v == null ? '' : String(v);
        },
        base64Decode(str: string) {
          try {
            return typeof atob !== 'undefined'
              ? decodeURIComponent(escape(atob(String(str))))
              : String(str);
          } catch {
            return String(str);
          }
        },
        base64Encode(str: string) {
          try {
            return typeof btoa !== 'undefined'
              ? btoa(unescape(encodeURIComponent(String(str))))
              : String(str);
          } catch {
            return String(str);
          }
        },
        hexDecodeToString(hex: string) {
          try {
            const text = String(hex ?? '');
            const bytes = new Uint8Array(
              (text.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)),
            );
            return new TextDecoder('utf-8').decode(bytes);
          } catch {
            return String(hex);
          }
        },
        deviceID() {
          legadoJavaDeviceID();
        },
        androidId() {
          return legadoJavaAndroidId(bookSource);
        },
        getWebViewUA() {
          const hdr = bookSource?.header;
          if (hdr) {
            try {
              const parsed = JSON.parse(hdr) as Record<string, string>;
              const ua = parsed['User-Agent'] ?? parsed['user-agent'];
              if (ua?.trim()) return ua.trim();
            } catch {
              /* ignore */
            }
          }
          return 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36';
        },
        toast() {},
        longToast() {},
        qread() {
          throw new Error('qread unavailable');
        },
        log(...args: unknown[]) {
          const msg = args.map((a) => String(a ?? '')).join(' ');
          if (msg.includes('线路报错，自动切换下一个')) {
            if (import.meta.env.DEV) {
              console.debug('[rule-script]', msg);
            }
            return;
          }
          if (import.meta.env.DEV) {
            console.log('[rule-script]', ...args);
          }
        },
        getString(rule: string) {
          const hit = executeLegadoGetStringRule(String(rule ?? ''), scope, context, jsLib);
          scope.result = hit;
          return hit;
        },
        ajax(urlArg: unknown, optionsArg?: unknown) {
          let ajaxInput = '';
          if (typeof urlArg === 'string') {
            ajaxInput = urlArg.trim();
          } else if (urlArg && typeof urlArg === 'object') {
            const o = urlArg as Record<string, unknown>;
            ajaxInput = String(o.url ?? o.href ?? '').trim();
          }

          const parsed =
            typeof optionsArg === 'object' && optionsArg != null
              ? parseAjaxArgs(
                  typeof urlArg === 'string' ? urlArg : (ajaxInput as string),
                  optionsArg as Record<string, unknown>,
                )
              : parseAjaxArgs(ajaxInput);

          if (!parsed?.urlStr) return '';

          const resolved = /^https?:\/\//i.test(parsed.urlStr)
            ? parsed.urlStr
            : resolveUrl(baseUrl, parsed.urlStr);

          const cacheKey = buildRuleScriptAjaxCacheKey(
            resolved,
            parsed.method,
            parsed.body,
          );
          if (ajaxCache.has(cacheKey)) {
            return ajaxCache.get(cacheKey) ?? '';
          }

          const req = {
            method: parsed.method,
            headers: parsed.headers,
            body: parsed.body,
            source: bookSource,
          };

          const p = requestLegadoRuleScriptHttpAsync(resolved, req)
            .then((text) => {
              const body = String(text ?? '');
              if (body.trim()) {
                ajaxCache.set(cacheKey, body);
              }
            })
            .catch((e) => {
              console.warn('[rule-script] ajax failed:', resolved, e);
            });

          pending.push(p);
          return LEGADO_AJAX_PENDING_JSON;
        },
        startBrowser: browserHandlers.startBrowser,
        startBrowserAwait: browserHandlers.startBrowserAwait,
      },
    };
    return scope;
  };

  const syncBookScopeBack = (): void => {
    if (context.book && typeof context.book === 'object') {
      const target = context.book as Record<string, unknown>;
      if (bookRecord.imageStyle != null) target.imageStyle = bookRecord.imageStyle;
      if (bookRecord.type != null) target.type = bookRecord.type;
    }
  };

  const finishRuleScript = (result: unknown): unknown => {
    syncBookScopeBack();
    return result;
  };

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('规则脚本执行超时')), SCRIPT_TIMEOUT_MS);
  });

  const runPromise = (async () => {
    let prevCacheSize = -1;
    let scope = buildScope();
    for (let round = 0; round < MAX_AJAX_ROUNDS; round++) {
      pending = [];
      scope = buildScope();

      let runError: unknown;
      let browserSuspend: SuspendScript | null = null;
      try {
        runJsSnippet(script, scope, jsLib);
      } catch (e) {
        if (isRuleScriptBrowserSuspend(e)) {
          browserSuspend = e;
        } else {
          runError = e;
          console.warn('[rule-script] 执行报错:', e);
        }
      }

      if (browserSuspend) {
        await browserSuspend.promise;
        continue;
      }

      const hadAjax = pending.length > 0;
      if (runError && !hadAjax && round === 0) {
        throw runError;
      }
      if (hadAjax) {
        await Promise.all(pending);
      }

      if (ruleScriptResultLooksFinal(scope.result)) {
        return finishRuleScript(scope.result);
      }

      const hexLike =
        typeof scope.result === 'string' &&
        /^[0-9a-f]+$/i.test(scope.result.trim()) &&
        scope.result.trim().length > 40;
      if (hexLike && ajaxCache.size > 0) {
        const fromAjax = tryContentFromRuleScriptAjaxCache(ajaxCache);
        if (fromAjax) {
          return finishRuleScript(fromAjax);
        }
      }

      if (scope.result !== undefined && String(scope.result).length > 0) {
        const emptyContentPayload = isEmptyContentRuleResult(scope.result);
        if (
          (hadAjax || emptyContentPayload) &&
          round < MAX_AJAX_ROUNDS - 1 &&
          (hadAjax || ajaxCache.size > prevCacheSize)
        ) {
          prevCacheSize = ajaxCache.size;
          continue;
        }
        if (!emptyContentPayload) {
          return finishRuleScript(scope.result);
        }
      }

      if (!hadAjax || ajaxCache.size === prevCacheSize) {
        const scopeResultEmpty =
          scope.result == null || String(scope.result).trim() === '';
        const fromAjax = scopeResultEmpty
          ? tryContentFromRuleScriptAjaxCache(ajaxCache)
          : null;
        if (fromAjax) {
          return finishRuleScript(fromAjax);
        }
        return finishRuleScript(scope.result ?? null);
      }
      prevCacheSize = ajaxCache.size;
    }
    const scopeResultEmpty =
      scope.result == null || String(scope.result).trim() === '';
    const fromAjax = scopeResultEmpty
      ? tryContentFromRuleScriptAjaxCache(ajaxCache)
      : null;
    if (fromAjax) {
      return finishRuleScript(fromAjax);
    }
    return finishRuleScript(scope.result ?? null);
  })();

  return Promise.race([runPromise, timeoutPromise]);
}
