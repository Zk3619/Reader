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
  LEGADO_AJAX_PENDING_JSON,
  createSourceVariableHandlers,
  buildLegadoScriptSourceFace,
  getSourceArgsKey,
  getLegadoSourceKey,
  hostsFromJsLib,
  createLegadoLoginInfoMap,
} from '@/lib/js-engine/legado/source-script-shared';
import {
  legadoAesBase64DecodeToString,
  legadoJavaMd5Encode,
} from '@/lib/js-engine/legado/legado-java-crypto';
import {
  buildRuleScriptFullBody,
  patchLegadoRuleScript,
} from '@/lib/js-engine/legado/rule-script-patches';
import { resolveJsLibString } from '@/lib/js-engine/legado/resolve-js-lib';
import { legadoCookieGetKey } from '@/lib/js-engine/legado/login-script-runner';
import { javaGetString, type JavaGetStringContext } from '@/lib/rule-engine/java-get-string';
import { createRuleJavaAnalyzeBridge } from '@/lib/rule-engine/rule-java-analyze-bridge';
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
  createLegadoStrResponse,
  isRuleScriptBrowserSuspend,
  rethrowDeferredRuleScriptSuspend,
} from '@/lib/js-engine/legado/rule-script-browser';
import {
  createLegadoJsoupScopeBindings,
  ruleJsExpectsHtmlElement,
  wrapRuleJsHtmlResult,
} from '@/lib/js-engine/legado/legado-jsoup';
import { SuspendScript } from '@/lib/js-engine/legado/suspend-script';
import { isLegadoBrowserPlaceholderContent } from '@/lib/book-source/extract-rule-content';
import { READER_LAST_BROWSER_URL_KEY } from '@/lib/js-engine/legado/rule-script-browser';

const SCRIPT_TIMEOUT_MS = 90_000;
const MAX_AJAX_ROUNDS = 8;
const POST_SUSPEND_WRITE_INDEX = -3;

function parseHeaderObject(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (value == null) continue;
    out[String(key)] = String(value);
  }
  return out;
}

function isRuleScriptPostSuspend(e: unknown): e is SuspendScript {
  return e instanceof SuspendScript && e.writeIndex === POST_SUSPEND_WRITE_INDEX;
}

export function needsLegadoRuleScriptRunner(code: string): boolean {
  const t = String(code ?? '');
  return (
    /\bjava\.getString\b/.test(t) ||
    /\bjava\.get\b/.test(t) ||
    /\bjava\.ajax\b/.test(t) ||
    /\bjava\.post\b/.test(t) ||
    /\bjava\.encodeURI\b/.test(t) ||
    /\borg\.jsoup\b/.test(t) ||
    /\bjava\.startBrowser\b/.test(t) ||
    /\bjava\.startBrowserAwait\b/.test(t) ||
    /\bjava\.hexDecodeToString\b/.test(t) ||
    /\bgetArguments\b/.test(t) ||
    /\bsrc\.match\b/.test(t) ||
    /\bPackages\.java\b/.test(t) ||
    /\bsource\.bookSourceComment\b/.test(t) ||
    /\bsource\.getVariable\b/.test(t) ||
    /\bsource\.setVariable\b/.test(t) ||
    ruleJsExpectsHtmlElement(t)
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
  const fullBody = buildRuleScriptFullBody(userBody, jsLib);
  const fn = new Function('__scope__', 'with (__scope__) {\n' + fullBody + '\n}');
  const out = fn(scope);
  rethrowDeferredRuleScriptSuspend(scope);
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

/** 脚本未改写 result 时勿把章节页 HTML 当作规则输出（常见于脚本抛错或仅 ajax 挂起） */
function isUnmodifiedRuleScriptInput(
  result: unknown,
  initialResult: unknown,
  ruleContent: string,
): boolean {
  const ruleInputText =
    typeof ruleContent === 'string' ? ruleContent : String(ruleContent ?? '');
  const baseline =
    typeof initialResult === 'string' ? initialResult : ruleInputText;
  if (result == null || result !== baseline) return false;
  const text = String(result).trim();
  const input = ruleInputText.trim();
  if (!text || !input) return false;
  if (text === input) return true;
  if (text.startsWith('<') && input.startsWith('<') && text.length >= 500 && input.length >= 500) {
    return true;
  }
  return false;
}

function finishRuleScriptResult(
  result: unknown,
  initialResult: unknown,
  ruleContent: string,
): unknown {
  if (isUnmodifiedRuleScriptInput(result, initialResult, ruleContent)) {
    return null;
  }
  return result;
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
    if (isLegadoBrowserPlaceholderContent(text)) return false;
    if (/^[0-9a-f]+$/i.test(text) && text.length > 40) return true;
    if (text.startsWith('<') && text.length >= 500) return false;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return text.length < 80;
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
  if (isLegadoBrowserPlaceholderContent(text)) return true;
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
  const jsLib = await resolveJsLibString(
    typeof sourceRecord.jsLib === 'string' ? (sourceRecord.jsLib as string) : '',
  );
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
  const postCache = new Map<string, string>();
  let pending: Promise<void>[] = [];
  const browserState = createRuleScriptBrowserState();
  /** Legado 多轮 ajax 重跑时仍保留规则入口 result（如 data: tocUrl 的 hex 载荷） */
  const initialResult = normalizeJsRuleResult(context.result);
  const ruleInputText =
    typeof ruleContent === 'string' ? ruleContent : String(ruleContent ?? '');
  /** 章节 HTML：result 为字符串；列表项 @js：result 为 Jsoup Element（result.select 等） */
  const scriptResultBinding = ruleJsExpectsHtmlElement(script)
    ? wrapRuleJsHtmlResult(initialResult, {
        content: ruleInputText,
        contentType: context.ruleContentType,
      })
    : typeof initialResult === 'string'
      ? initialResult
      : ruleInputText;

  const baseUrl = context.baseUrl || String(sourceRecord.bookSourceUrl ?? sourceRecord.sourceUrl ?? '');
  const hostList = hostsFromJsLib(sourceRecord.jsLib);
  const analyzeBridge = createRuleJavaAnalyzeBridge({
    baseUrl,
    initialContent: ruleInputText,
  });

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
    let browserHandlers: ReturnType<typeof createRuleScriptBrowserHandlers>;
    const resolveRuleScriptCookie = (url: string): string => {
      if (!bookSource) return '';
      const u = String(url).trim().replace(/\/+$/, '');
      let c = resolveSourceCookiesForHttp(bookSource, u).trim();
      if (c) return c;
      for (const h of hostList) {
        c = resolveSourceCookiesForHttp(bookSource, h).trim();
        if (c) return c;
      }
      const server = resolveBookSourceServerUrl(bookSource);
      if (server) return resolveSourceCookiesForHttp(bookSource, server).trim();
      return '';
    };
    const cookieApi = {
      getCookie: resolveRuleScriptCookie,
      removeCookie() {},
      setCookie() {},
      getKey(cookieStrOrUrl: string, keyName?: string): string {
        return legadoCookieGetKey(
          new Map(),
          resolveRuleScriptCookie,
          cookieStrOrUrl,
          keyName,
          bookSource,
        );
      },
    };
    const scope: Record<string, unknown> = {
      ...createLegadoJsoupScopeBindings(),
      result: scriptResultBinding,
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
        ...(bookSource && sourceVariableHandlers
          ? buildLegadoScriptSourceFace(
              bookSource,
              sourceVariableHandlers,
              getLegadoSourceKey(bookSource),
            )
          : bookSource
            ? { getLoginInfoMap: () => createLegadoLoginInfoMap(bookSource) }
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
      toast(msg?: unknown, level?: unknown) {
        context.onScriptToast?.(msg, level ?? 'info');
      },
      longToast(msg?: unknown) {
        context.onScriptToast?.(msg, 'warning');
      },
      cookie: cookieApi,
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
        md5Encode(input: unknown) {
          return legadoJavaMd5Encode(String(input ?? ''));
        },
        aesBase64DecodeToString(data: unknown, key: unknown, transformation: unknown, iv: unknown) {
          return legadoAesBase64DecodeToString(
            String(data ?? ''),
            String(key ?? ''),
            String(transformation ?? ''),
            String(iv ?? ''),
          );
        },
        toast(msg?: unknown, level?: unknown) {
          context.onScriptToast?.(msg, level ?? 'info');
        },
        longToast(msg?: unknown) {
          context.onScriptToast?.(msg, 'warning');
        },
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
          return executeLegadoGetStringRule(String(rule ?? ''), scope, context, jsLib);
        },
        setContent(content: unknown, url?: unknown) {
          return analyzeBridge.setContent(content, url);
        },
        setBaseUrl(url: unknown) {
          return analyzeBridge.setBaseUrl(url);
        },
        getElements(ruleStr: string) {
          return analyzeBridge.getElements(ruleStr);
        },
        getElement(ruleStr: string) {
          const list = analyzeBridge.getElements(ruleStr);
          return list[0] ?? '';
        },
        /** 对齐 Legado / explore-script-runner：脚本常用 java.getCookie(url) */
        getCookie(url: string) {
          return cookieApi.getCookie(url);
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
            referer: baseUrl,
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
        post(urlArg: unknown, bodyArg?: unknown, headersArg?: unknown) {
          const urlRaw = String(urlArg ?? '').trim();
          if (!urlRaw) return createLegadoStrResponse('');
          const resolved = /^https?:\/\//i.test(urlRaw)
            ? urlRaw
            : resolveUrl(baseUrl, urlRaw);
          const body =
            bodyArg == null
              ? ''
              : typeof bodyArg === 'string'
                ? bodyArg
                : JSON.stringify(bodyArg);
          const headers = parseHeaderObject(headersArg);
          const cacheKey = buildRuleScriptAjaxCacheKey(resolved, 'POST', body);
          const cached = postCache.get(cacheKey);
          if (cached !== undefined) {
            return createLegadoStrResponse(cached);
          }
          const p = requestLegadoRuleScriptHttpAsync(resolved, {
            method: 'POST',
            headers,
            body,
            source: bookSource,
            referer: baseUrl,
          })
            .then((text) => {
              postCache.set(cacheKey, String(text ?? ''));
            })
            .catch((e) => {
              console.warn('[rule-script] post failed:', resolved, e);
              postCache.set(cacheKey, '');
            });
          pending.push(p);
          throw new SuspendScript(
            p.then(() => ''),
            POST_SUSPEND_WRITE_INDEX,
            resolved,
            Date.now(),
          );
        },
        encodeURI(value: unknown) {
          return encodeURI(String(value ?? ''));
        },
        encodeURIComponent(value: unknown) {
          return encodeURIComponent(String(value ?? ''));
        },
        startBrowser(url: unknown, title?: unknown) {
          browserHandlers.startBrowser(
            String(url ?? ''),
            title == null ? undefined : String(title),
          );
        },
        startBrowserAwait(url: unknown, title?: unknown) {
          return browserHandlers.startBrowserAwait(
            String(url ?? ''),
            title == null ? undefined : String(title),
          );
        },
      },
    };
    browserHandlers = createRuleScriptBrowserHandlers({
      bookSource,
      baseUrl,
      state: browserState,
      pending,
      variables: context.variables as Record<string, unknown> | undefined,
      scope,
      nonBlockingBrowserAwait: context.nonBlockingBrowserAwait,
    });
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
    if (isUnmodifiedRuleScriptInput(result, initialResult, ruleContent)) {
      const lastUrl = String(
        (context.variables as Record<string, unknown> | undefined)?.[
          READER_LAST_BROWSER_URL_KEY
        ] ?? '',
      ).trim();
      if (
        context.nonBlockingBrowserAwait &&
        lastUrl.startsWith('http')
      ) {
        return '请刷新尝试播放';
      }
    }
    return finishRuleScriptResult(result, initialResult, ruleContent);
  };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let rejectScriptTimeout: ((reason: Error) => void) | undefined;
  const armScriptTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(
      () => rejectScriptTimeout?.(new Error('规则脚本执行超时')),
      SCRIPT_TIMEOUT_MS,
    );
  };
  const timeoutPromise = new Promise<never>((_, reject) => {
    rejectScriptTimeout = reject as (reason: Error) => void;
    armScriptTimeout();
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
        } else if (isRuleScriptPostSuspend(e)) {
          browserSuspend = e;
        } else {
          runError = e;
          console.warn('[rule-script] 执行报错:', e);
        }
      }

      if (browserSuspend) {
        if (timeoutId) clearTimeout(timeoutId);
        await browserSuspend.promise;
        armScriptTimeout();
        continue;
      }

      const hadAjax = pending.length > 0;
      if (runError) {
        if (isUnmodifiedRuleScriptInput(scope.result, initialResult, ruleContent)) {
          return finishRuleScript(null);
        }
        if (!hadAjax && round === 0) {
          throw runError;
        }
      }
      if (pending.length > 0) {
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
