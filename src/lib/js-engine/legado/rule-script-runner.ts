/**
 * 书源规则 JS（正文/详情等）执行器
 * 对齐 Legado AnalyzeRule.evalJS bindings：src、java.getString(含嵌套 <js>)、java.ajax 同步语义
 */

import { get, post } from '@/lib/http';
import { buildSourceRequestHeaders } from '@/lib/book-source/source-http';
import { resolveUrl } from '@/lib/book-source/utils';
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

const SCRIPT_BINDING_NAMES = [
  'result',
  'src',
  'baseUrl',
  'book',
  'source',
  'chapter',
  'title',
  'java',
  'JSON',
  'Packages',
] as const;

/** 对齐 evalJsFallback：显式参数 + 末行表达式自动 return（不可用 eval，否则 Illegal return） */
function runJsSnippet(snippet: string, scope: Record<string, unknown>): unknown {
  const body = wrapLegadoJsBodyWithImplicitReturn(snippet);
  const fn = new Function(...SCRIPT_BINDING_NAMES, body);
  const out = fn(
    scope.result,
    scope.src,
    scope.baseUrl,
    scope.book,
    scope.source,
    scope.chapter,
    scope.title,
    scope.java,
    scope.JSON,
    scope.Packages,
  );
  if (out !== undefined && out !== null) {
    scope.result = out;
  }
  return out;
}

function executeLegadoGetStringRule(
  rule: string,
  scope: Record<string, unknown>,
  ctx: JsContext,
): string {
  const segments = splitSourceRule(rule);
  if (segments.length === 0) {
    return javaGetString(rule, buildJavaGetStringContext(scope, ctx));
  }

  let acc = '';
  for (const seg of segments) {
    if (seg.mode === 'js') {
      runJsSnippet(seg.ruleStr, scope);
      acc = scope.result == null ? '' : String(scope.result);
    } else {
      acc = javaGetString(seg.ruleStr, buildJavaGetStringContext(scope, ctx));
      scope.result = acc;
    }
  }
  return acc;
}

async function requestInRuleScript(
  url: string,
  options: {
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    source?: BookSource;
  },
): Promise<string> {
  const headers = options.headers ?? {};
  const reqOpts = {
    headers,
    timeout: 60_000,
    enableCookieJar: options.source?.enabledCookieJar,
    concurrentRate: options.source?.concurrentRate,
  };
  if (options.method === 'POST') {
    return post(url, options.body ?? '', reqOpts);
  }
  return get(url, reqOpts);
}

/**
 * 执行含 java.ajax / java.getString(<js>) 的规则脚本（多轮 ajax 缓存重跑，对齐 Legado）
 */
export async function runLegadoRuleScript(
  code: string,
  context: JsContext,
  bookSource?: BookSource,
): Promise<unknown> {
  const ruleContent =
    context.ruleContent ??
    (typeof context.result === 'string' ? context.result : String(context.result ?? ''));

  const sourceRecord = normalizeSourceForLegado(
    context.source as Record<string, unknown> | undefined,
  );
  const bookRecord = (context.book ?? {}) as Record<string, unknown>;
  const chapterRecord = (context.chapter ?? {}) as Record<string, unknown>;

  const ajaxCache = new Map<string, string>();
  let pending: Promise<void>[] = [];

  const baseUrl = context.baseUrl || String(sourceRecord.bookSourceUrl ?? sourceRecord.sourceUrl ?? '');

  const buildScope = (): Record<string, unknown> => {
    const scope: Record<string, unknown> = {
      result: normalizeJsRuleResult(context.result),
      src: ruleContent,
      baseUrl,
      book: bookRecord,
      source: sourceRecord,
      chapter: chapterRecord,
      title: chapterRecord.title ?? '',
      JSON,
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
        toast() {},
        longToast() {},
        log() {},
        getString(rule: string) {
          const hit = executeLegadoGetStringRule(String(rule ?? ''), scope, context);
          scope.result = hit;
          return hit;
        },
        ajax(urlArg: unknown, optionsArg?: unknown) {
          let urlStr = '';
          let method: 'GET' | 'POST' = 'GET';
          let body: string | undefined;
          let headers: Record<string, string> = {};

          if (typeof urlArg === 'string') {
            urlStr = urlArg.trim();
          } else if (urlArg && typeof urlArg === 'object') {
            const o = urlArg as Record<string, unknown>;
            urlStr = String(o.url ?? o.href ?? '').trim();
          }

          if (optionsArg && typeof optionsArg === 'object' && !Array.isArray(optionsArg)) {
            const o = optionsArg as Record<string, unknown>;
            const m = String(o.method ?? 'GET').toUpperCase();
            if (m === 'POST') method = 'POST';
            if (o.body != null) {
              body = typeof o.body === 'string' ? o.body : JSON.stringify(o.body);
            }
            if (o.headers && typeof o.headers === 'object') {
              for (const [k, v] of Object.entries(o.headers as Record<string, unknown>)) {
                headers[String(k)] = String(v);
              }
            }
          }

          if (!urlStr) return '';

          const resolved = /^https?:\/\//i.test(urlStr)
            ? urlStr
            : resolveUrl(baseUrl, urlStr);

          if (ajaxCache.has(resolved)) {
            return ajaxCache.get(resolved) ?? '';
          }

          if (bookSource) {
            headers = {
              ...buildSourceRequestHeaders(bookSource, resolved),
              ...headers,
            };
          }

          const p = requestInRuleScript(resolved, {
            method,
            headers,
            body,
            source: bookSource,
          })
            .then((text) => {
              ajaxCache.set(resolved, text);
            })
            .catch((e) => {
              console.warn('[rule-script] ajax failed:', resolved, e);
              ajaxCache.set(resolved, '');
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
      if (round > 0) {
        scope.result = undefined;
      }

      try {
        runJsSnippet(code.trim(), scope);
      } catch (e) {
        console.warn('[rule-script] 执行报错:', e);
        if (round === 0) throw e;
      }

      const hadAjax = pending.length > 0;
      if (hadAjax) {
        await Promise.all(pending);
      }

      if (scope.result !== undefined && String(scope.result).length > 0) {
        if (hadAjax && round < MAX_AJAX_ROUNDS - 1) {
          prevCacheSize = ajaxCache.size;
          continue;
        }
        return scope.result;
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
