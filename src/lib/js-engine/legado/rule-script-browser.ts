/**
 * 规则脚本内 java.startBrowser / startBrowserAwait（对齐 Legado WebView + StrResponse.body()）
 */

import { resolveUrl } from '@/lib/book-source/utils';
import {
  resolveBookSourceServerUrl,
  resolveSourceCookiesForHttp,
} from '@/lib/book-source/source-http';
import { openLegadoBrowserInApp } from '@/lib/platform/open-url';
import type { InnerWebCloseResult } from '@/lib/platform/inner-web';
import { SuspendScript } from '@/lib/js-engine/legado/suspend-script';
import type { BookSource } from '@/types';

/** 与 login-script ajax 挂起索引区分 */
export const BROWSER_SUSPEND_WRITE_INDEX = -2;

export interface RuleScriptBrowserState {
  awaitDone: boolean;
  awaitBody: string;
}

export function createRuleScriptBrowserState(): RuleScriptBrowserState {
  return { awaitDone: false, awaitBody: '' };
}

/** Legado StrResponse：规则脚本常用 .body() */
export function createLegadoStrResponse(body: string) {
  const text = String(body ?? '');
  return {
    body(): string {
      return text;
    },
    url(): string {
      return '';
    },
    code(): number {
      return 200;
    },
    headers(): Record<string, string> {
      return {};
    },
  };
}

function urlForOpen(url: string): string {
  const s = String(url ?? '').trim();
  const comma = s.indexOf(',');
  return comma > 0 ? s.slice(0, comma).trim() : s;
}

export function resolveRuleScriptBrowserUrl(raw: string, baseUrl: string): string {
  const toOpen = raw.startsWith('data:') ? raw : urlForOpen(raw);
  const t = toOpen.trim();
  if (/^(https?:|data:|legado:|yuedu:)/i.test(t)) {
    return t;
  }
  return baseUrl && !toOpen.startsWith('data:') ? resolveUrl(baseUrl, toOpen) : toOpen;
}

export function isOpenableBrowserUrl(url: string): boolean {
  return /^(https?:|data:)/i.test((url ?? '').trim());
}

export function resolveRuleScriptBrowserCookies(
  bookSource: BookSource | undefined,
  resolved: string,
  baseUrl: string,
): string {
  if (!bookSource) return '';
  let c = resolveSourceCookiesForHttp(bookSource, resolved).trim();
  if (c) return c;
  const server = resolveBookSourceServerUrl(bookSource);
  if (server) {
    c = resolveSourceCookiesForHttp(bookSource, server).trim();
    if (c) return c;
  }
  if (baseUrl) {
    return resolveSourceCookiesForHttp(bookSource, baseUrl).trim();
  }
  return '';
}

export async function syncRuleScriptBrowserCookies(
  bookSource: BookSource,
  pageUrl: string,
  cookies: string,
): Promise<void> {
  const trimmed = cookies.trim();
  const url = pageUrl.trim();
  if (!trimmed || !url.startsWith('http')) return;
  try {
    const {
      persistSourceCookieHeaderForPage,
      pullSourceCookiesIntoStore,
      pushSourceCookiesToWebviews,
    } = await import('@/lib/book-source/source-cookie-pool');
    const { mergeLegadoCookieHeaderStrings } = await import(
      '@/lib/js-engine/legado/normalize-legado-ajax-body'
    );
    const { resolveSourceCookiesForHttp: resolveCookies } = await import(
      '@/lib/book-source/source-http'
    );
    await pullSourceCookiesIntoStore(bookSource, url);
    const fromStore = resolveCookies(bookSource, url).trim();
    const merged =
      fromStore && trimmed
        ? mergeLegadoCookieHeaderStrings(fromStore, trimmed)
        : trimmed || fromStore;
    if (merged.trim()) {
      persistSourceCookieHeaderForPage(bookSource, url, merged);
    }
    await pushSourceCookiesToWebviews(bookSource, url);
  } catch (e) {
    console.warn('[rule-script] 内嵌页 Cookie 同步失败', e);
  }
}

function innerWebPoolOpts(bookSource?: BookSource): { bookSourceUrl?: string } {
  const url = (bookSource?.bookSourceUrl ?? bookSource?.sourceUrl)?.trim();
  return url ? { bookSourceUrl: url } : {};
}

function applyBrowserCloseResult(
  state: RuleScriptBrowserState,
  r: InnerWebCloseResult,
): void {
  state.awaitBody = '';
  state.awaitDone = true;
  if (import.meta.env.DEV) {
    console.log('[rule-script] startBrowserAwait 已关闭', {
      confirmed: r.confirmed,
      cookieLen: (r.cookies ?? '').length,
    });
  }
}

export interface RuleScriptBrowserHandlers {
  startBrowser(url: string, title?: string): void;
  startBrowserAwait(url: string, title?: string): ReturnType<typeof createLegadoStrResponse>;
}

/** 规则脚本 startBrowser* 打开的内嵌页 URL，供正文占位提示后再次打开 */
export const READER_LAST_BROWSER_URL_KEY = '__readerLastBrowserUrl';

/** 延迟到 runJsSnippet 结束后抛出，避免书源 try/catch 吞掉 SuspendScript */
export const READER_DEFERRED_SUSPEND_KEY = '__readerDeferredSuspend';

export function createRuleScriptBrowserHandlers(options: {
  bookSource?: BookSource;
  baseUrl: string;
  state: RuleScriptBrowserState;
  pending: Promise<void>[];
  variables?: Record<string, unknown>;
  scope: Record<string, unknown>;
  /** 正文视频书源：打开播放页后继续执行，不等待 √ */
  nonBlockingBrowserAwait?: boolean;
}): RuleScriptBrowserHandlers {
  const { bookSource, baseUrl, state, pending, variables, scope, nonBlockingBrowserAwait } =
    options;

  const rememberBrowserUrl = (resolved: string) => {
    if (variables && isOpenableBrowserUrl(resolved)) {
      variables[READER_LAST_BROWSER_URL_KEY] = resolved;
    }
  };
  const poolOpts = innerWebPoolOpts(bookSource);

  return {
    startBrowser(url: string, title?: string) {
      const resolved = resolveRuleScriptBrowserUrl(String(url ?? ''), baseUrl);
      if (!isOpenableBrowserUrl(resolved)) return;
      rememberBrowserUrl(resolved);
      const cookieStr = resolveRuleScriptBrowserCookies(bookSource, resolved, baseUrl);
      pending.push(
        openLegadoBrowserInApp(resolved, cookieStr, title, poolOpts).then(() => undefined),
      );
    },

    startBrowserAwait(url: string, title?: string) {
      if (nonBlockingBrowserAwait) {
        this.startBrowser(url, title);
        return createLegadoStrResponse('');
      }
      if (state.awaitDone) {
        return createLegadoStrResponse(state.awaitBody);
      }
      const resolved = resolveRuleScriptBrowserUrl(String(url ?? ''), baseUrl);
      if (!isOpenableBrowserUrl(resolved)) {
        state.awaitDone = true;
        return createLegadoStrResponse('');
      }
      rememberBrowserUrl(resolved);
      const cookieStr = resolveRuleScriptBrowserCookies(bookSource, resolved, baseUrl);
      const p = openLegadoBrowserInApp(resolved, cookieStr, title, {
        awaitClose: true,
        ...poolOpts,
      })
        .then(async (r) => {
          if (r.confirmed && r.cookies?.trim() && bookSource) {
            await syncRuleScriptBrowserCookies(bookSource, resolved, r.cookies);
          }
          applyBrowserCloseResult(state, r);
        })
        .catch((e) => {
          console.warn('[rule-script] startBrowserAwait 打开失败', e);
          applyBrowserCloseResult(state, {
            confirmed: false,
            cookies: '',
            url: resolved,
          });
        });
      scope[READER_DEFERRED_SUSPEND_KEY] = new SuspendScript(
        p.then(() => ''),
        BROWSER_SUSPEND_WRITE_INDEX,
        resolved,
        Date.now(),
      );
      return createLegadoStrResponse('');
    },
  };
}

export function rethrowDeferredRuleScriptSuspend(scope: Record<string, unknown>): void {
  const deferred = scope[READER_DEFERRED_SUSPEND_KEY];
  if (deferred instanceof SuspendScript) {
    delete scope[READER_DEFERRED_SUSPEND_KEY];
    throw deferred;
  }
}

export function isRuleScriptBrowserSuspend(e: unknown): e is SuspendScript {
  return e instanceof SuspendScript && e.writeIndex === BROWSER_SUSPEND_WRITE_INDEX;
}
