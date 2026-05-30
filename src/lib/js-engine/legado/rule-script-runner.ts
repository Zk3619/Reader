/**
 * 书源规则 JS（正文/详情等）执行器
 * 对齐 Legado AnalyzeRule.evalJS bindings：src、java.getString(含嵌套 <js>)、java.ajax 同步语义
 */

import { resolveUrl } from '@/lib/book-source/utils';
import {
  getOrCreateAndroidId,
  resolveAggregationServerUrl,
  resolveSourceCookiesForHttp,
} from '@/lib/book-source/source-http';
import { requestLegadoRuleScriptHttpAsync } from '@/lib/js-engine/legado/rule-script-http';
import { parseAjaxArgs } from '@/lib/js-engine/legado/host/parse-ajax';
import {
  EXPLORE_JSLIB_CONTEXT_SHIM,
  createSourceVariableHandlers,
  hostsFromJsLib,
  getSourceArgsKey,
} from '@/lib/js-engine/legado/source-script-shared';
import {
  buildRuleScriptFullBody,
  patchLegadoRuleScript,
} from '@/lib/js-engine/legado/rule-script-patches';
import { extractLegadoCookieValue } from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { javaGetString, type JavaGetStringContext } from '@/lib/rule-engine/java-get-string';
import { splitSourceRule } from '@/lib/rule-engine/legado-source-rule';
import type { BookSource } from '@/types';
import type { JsContext } from '@/lib/js-engine/quickjs-sandbox';
import {
  normalizeJsRuleResult,
  wrapLegadoJsBodyWithImplicitReturn,
} from '@/lib/js-engine/quickjs-sandbox';

const SCRIPT_TIMEOUT_MS = 90_000;
const MAX_AJAX_ROUNDS = 8;

export function needsLegadoRuleScriptRunner(code: string): boolean {
  const t = String(code ?? '');
  return (
    /\bjava\.getString\b/.test(t) ||
    /\bjava\.ajax\b/.test(t) ||
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
      acc = scope.result == null ? '' : String(scope.result);
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

function isEmptyContentRuleResult(result: unknown): boolean {
  if (result == null) return false;
  try {
    const parsed = JSON.parse(String(result).trim()) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || !('content' in parsed)) return false;
    const content = parsed.content;
    return content == null || (typeof content === 'string' && !content.trim());
  } catch {
    return false;
  }
}

function ruleScriptResultLooksFinal(result: unknown): boolean {
  if (result == null) return false;
  const text = String(result).trim();
  if (!text) return false;
  if (/^[0-9a-f]+$/i.test(text) && text.length > 40) return false;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      const content = parsed.content;
      if (typeof content === 'string' && content.trim().length > 0) return true;
      if (typeof parsed.msg === 'string' && parsed.msg.trim().length > 0) return true;
      const nested = parsed.data;
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const inner = (nested as Record<string, unknown>).content;
        if (typeof inner === 'string' && inner.trim().length > 0) return true;
      }
    }
  } catch {
    return text.length > 0;
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
  const bookRecord = (context.book ?? {}) as Record<string, unknown>;
  const chapterRecord = (context.chapter ?? {}) as Record<string, unknown>;

  const ajaxCache = new Map<string, string>();
  let pending: Promise<void>[] = [];
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

  const buildScope = (): Record<string, unknown> => {
    const scope: Record<string, unknown> = {
      result: initialResult,
      src: ruleContent,
      baseUrl,
      host: hostList.length > 0 ? hostList : [baseUrl].filter(Boolean),
      getArguments,
      book: {
        ...bookRecord,
        getVariable(key?: string) {
          return readBookVariable(bookRecord, key);
        },
      },
      source: {
        ...sourceRecord,
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
      title: chapterRecord.title ?? '',
      JSON,
      cookie: (() => {
        const getCookie = (url: string) => {
          if (!bookSource) return '';
          const u = String(url).trim().replace(/\/+$/, '');
          let c = resolveSourceCookiesForHttp(bookSource, u).trim();
          if (c) return c;
          const server = resolveAggregationServerUrl(bookSource);
          if (server) return resolveSourceCookiesForHttp(bookSource, server).trim();
          return '';
        };
        return {
        getCookie,
        removeCookie() {},
        setCookie() {},
        getKey(cookieStrOrUrl: string, keyName?: string): string {
          let s: string;
          if (keyName != null && keyName !== '') {
            s = getCookie(cookieStrOrUrl);
          } else {
            s = String(cookieStrOrUrl ?? '').trim();
          }
          if (!s) return '';
          const searchKey = keyName != null && keyName !== '' ? keyName : 'qttoken';
          return extractLegadoCookieValue(s, searchKey);
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
          return getOrCreateAndroidId();
        },
        androidId() {
          return getOrCreateAndroidId();
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
        log() {},
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
          return '';
        },
      },
    };
    return scope;
  };

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('规则脚本执行超时')), SCRIPT_TIMEOUT_MS);
  });

  const runPromise = (async () => {
    let prevCacheSize = -1;
    for (let round = 0; round < MAX_AJAX_ROUNDS; round++) {
      pending = [];
      const scope = buildScope();

      let runError: unknown;
      try {
        runJsSnippet(script, scope, jsLib);
      } catch (e) {
        runError = e;
        console.warn('[rule-script] 执行报错:', e);
      }

      const hadAjax = pending.length > 0;
      if (runError && !hadAjax && round === 0) {
        throw runError;
      }
      if (hadAjax) {
        await Promise.all(pending);
      }

      if (ruleScriptResultLooksFinal(scope.result)) {
        return scope.result;
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
          return scope.result;
        }
      }

      if (!hadAjax || ajaxCache.size === prevCacheSize) {
        return scope.result ?? null;
      }
      prevCacheSize = ajaxCache.size;
    }
    return null;
  })();

  return Promise.race([runPromise, timeoutPromise]);
}
