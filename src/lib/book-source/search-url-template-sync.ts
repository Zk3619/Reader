/**
 * searchUrl / header 中 {{...}} 常见模板的同步求值（不跑 jsLib / QuickJS）
 */

import type { BookSource } from '@/types';
import { stripLegadoSourceUrlMarker } from '@/lib/book-source/utils';
import {
  getScriptBaseUrl,
  getSourceCookiesKey,
  getLegadoSourceKey,
  hostsFromJsLib,
  loadSourceCookieStore,
} from '@/lib/js-engine/legado/source-script-shared';

export type SearchTemplateContext = {
  baseUrl: string;
  sourceUrl: string;
  hosts: string[];
  keyword: string;
  page: number;
  cookieStore: Map<string, string>;
};

export function buildSearchTemplateContext(
  source: BookSource,
  keyword: string,
  page: number,
): SearchTemplateContext {
  const jsLib =
    typeof (source as Record<string, unknown>).jsLib === 'string'
      ? ((source as Record<string, unknown>).jsLib as string)
      : '';
  const baseUrl = getScriptBaseUrl(source);
  const hostList = hostsFromJsLib(jsLib);
  const hosts = hostList.length > 0 ? hostList : baseUrl ? [baseUrl] : [];
  return {
    baseUrl,
    sourceUrl: getLegadoSourceKey(source),
    hosts,
    keyword,
    page,
    cookieStore: loadSourceCookieStore(getSourceCookiesKey(source)),
  };
}

function cookieForUrl(store: Map<string, string>, urlOrKey: string, baseUrl: string): string {
  const k = urlOrKey.trim() || baseUrl;
  let s = store.get(k) ?? '';
  if (!s && k.startsWith('http')) {
    try {
      s = store.get(new URL(k).origin) ?? '';
    } catch {
      /* ignore */
    }
  }
  return s;
}

function normalizeExpr(expr: string): string {
  return expr.replace(/\s+/g, ' ').trim();
}

/** Legado 书源常用 source.getKey() / source.getkey()（HTTP 拼接须去掉 ##备注） */
function evalSourceGetKey(ctx: SearchTemplateContext): string {
  return stripLegadoSourceUrlMarker(ctx.sourceUrl);
}

function evalBhost(ctx: SearchTemplateContext): string {
  const h = ctx.hosts[0] ?? ctx.baseUrl ?? '';
  return h.replace(/\/+$/, '');
}

/**
 * 同步求值；无法识别时返回 null，由调用方走 QuickJS / Function。
 */
export function trySyncEvalSearchTemplate(
  expr: string,
  ctx: SearchTemplateContext,
): string | null {
  const raw = expr.trim();
  if (!raw) return '';

  const t = normalizeExpr(raw);
  const tl = t.toLowerCase();

  if (tl === 'key') return ctx.keyword;
  if (tl === 'page') return String(ctx.page);

  if (/^bhost\s*\(\s*\)$/i.test(t)) return evalBhost(ctx);
  if (/^host\s*\[\s*0\s*\]$/i.test(t)) return evalBhost(ctx);

  if (/^source\.getkey\s*\(\s*\)$/i.test(t)) return evalSourceGetKey(ctx);

  const removeCookie = t.match(
    /^cookie\.removecookie\s*\(\s*source\.getkey\s*\(\s*\)\s*\)$/i,
  );
  if (removeCookie) {
    ctx.cookieStore.delete(ctx.sourceUrl);
    if (ctx.baseUrl) ctx.cookieStore.delete(ctx.baseUrl);
    return '';
  }

  const getCookieSourceKey = t.match(
    /^cookie\.getcookie\s*\(\s*source\.getkey\s*\(\s*\)\s*\)$/i,
  );
  if (getCookieSourceKey) {
    return cookieForUrl(ctx.cookieStore, ctx.sourceUrl, ctx.baseUrl);
  }

  const getCookieArg = t.match(/^cookie\.getcookie\s*\(\s*(.+)\s*\)$/i);
  if (getCookieArg) {
    const arg = getCookieArg[1].trim().replace(/^['"]|['"]$/g, '');
    if (arg === 'source.getKey()' || arg.toLowerCase() === 'source.getkey()') {
      return cookieForUrl(ctx.cookieStore, ctx.sourceUrl, ctx.baseUrl);
    }
    if (arg === 'baseUrl' || arg === 'base_url') {
      return cookieForUrl(ctx.cookieStore, ctx.baseUrl, ctx.baseUrl);
    }
    if (
      (arg.startsWith("'") && arg.endsWith("'")) ||
      (arg.startsWith('"') && arg.endsWith('"'))
    ) {
      return cookieForUrl(ctx.cookieStore, arg.slice(1, -1), ctx.baseUrl);
    }
    if (arg.startsWith('http')) {
      return cookieForUrl(ctx.cookieStore, arg, ctx.baseUrl);
    }
  }

  const javaGetCookie = t.match(/^java\.getcookie\s*\(\s*(.+)\s*\)$/i);
  if (javaGetCookie) {
    const arg = javaGetCookie[1].trim().replace(/^['"]|['"]$/g, '');
    return cookieForUrl(ctx.cookieStore, arg, ctx.baseUrl);
  }

  return null;
}
