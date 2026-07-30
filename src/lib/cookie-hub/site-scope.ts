/**
 * Cookie Hub SiteScope：委托 source-cookie-pool（按 bookSourceUrl / scopeKey 隔离）
 */

import type { BookSource } from '@/types';
import {
  mirrorSourceCookiesToHttpJar,
  persistSourceCookieHeaderForPage,
} from '@/lib/book-source/source-cookie-pool';
import {
  getCfActiveRequestOrigin,
  getCfActiveUserAgent,
  resolveSourceCookiesForHttp,
  setCfActiveRequestOrigin,
  setCfActiveUserAgent,
} from '@/lib/book-source/source-http';
import type {
  CookieModuleId,
  ResolvedSiteCookies,
  SiteScopeId,
} from './types';
import { subscribeSiteScopeKey } from './types';

/** 将 BookSource 映射为阅读模块 SiteScope */
export function bookSourceToSiteScope(source: BookSource): SiteScopeId {
  const key =
    source.bookSourceUrl?.trim() ||
    source.sourceUrl?.trim() ||
    '';
  return { module: 'reader', scopeKey: key };
}

/** 由 SiteScope 构造临时 BookSource（供 cookie-pool / CF 引擎复用） */
export function siteScopeAsBookSource(
  scope: SiteScopeId,
  pageUrl?: string,
  existing?: BookSource,
): BookSource {
  if (existing) {
    const key = scope.scopeKey.trim();
    if (key && !(existing.bookSourceUrl?.trim() || existing.sourceUrl?.trim())) {
      return {
        ...existing,
        bookSourceUrl: key,
        sourceUrl: existing.sourceUrl?.trim() || deriveOrigin(pageUrl || key),
      } as BookSource;
    }
    return existing;
  }

  const scopeKey = scope.scopeKey.trim();
  const origin = deriveOrigin(pageUrl || scopeKey);
  const name = `${scope.module}:${scopeKey || origin}`;
  return {
    sourceUrl: origin,
    bookSourceUrl: scopeKey || `${origin}/#${scope.module}`,
    bookSourceName: name,
    sourceName: name,
    enabledCookieJar: true,
    sourceType: 0,
    customOrder: 0,
    enabled: true,
    enableExplore: false,
    lastUpdateTime: 0,
    respondTime: 0,
    weight: 0,
    eventListener: false,
    customButton: false,
    nextPageLazyLoad: false,
  } as BookSource;
}

function deriveOrigin(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  try {
    if (/^https?:\/\//i.test(t)) return new URL(t).origin;
  } catch {
    /* keep */
  }
  const withoutHash = t.split('#')[0] ?? t;
  try {
    if (/^https?:\/\//i.test(withoutHash)) return new URL(withoutHash).origin;
  } catch {
    /* keep */
  }
  return withoutHash.replace(/\/+$/, '');
}

export function resolveSiteCookies(
  scope: SiteScopeId,
  url: string,
  existing?: BookSource,
): ResolvedSiteCookies {
  const source = siteScopeAsBookSource(scope, url, existing);
  const cookies = resolveSourceCookiesForHttp(source, url).trim();
  const cfOrigin = getCfActiveRequestOrigin(source);
  const panelUa = getCfActiveUserAgent(source);
  return {
    scope,
    cookies,
    source: cookies ? 'site-pool' : 'none',
    cfOrigin,
    panelUa,
    updatedAt: Date.now(),
  };
}

export async function publishSiteCookies(
  scope: SiteScopeId,
  url: string,
  cookies: string,
  meta?: { ua?: string; cfOrigin?: string },
  existing?: BookSource,
): Promise<void> {
  const trimmed = cookies.trim();
  if (!trimmed || !url.trim().startsWith('http')) return;
  const source = siteScopeAsBookSource(scope, url, existing);
  persistSourceCookieHeaderForPage(source, url, trimmed);
  await mirrorSourceCookiesToHttpJar(url, trimmed);
  if (meta?.cfOrigin?.trim()) {
    setCfActiveRequestOrigin(source, meta.cfOrigin.trim());
  }
  if (meta?.ua?.trim()) {
    setCfActiveUserAgent(source, meta.ua.trim());
  }
}

/** 便捷：订阅模块 scope */
export function makeSubscribeScope(feedUrl: string): SiteScopeId {
  return {
    module: 'subscribe' satisfies CookieModuleId,
    scopeKey: subscribeSiteScopeKey(feedUrl),
  };
}

/** 弹幕 API 豆瓣 Cookie scope（与 bili 平台账号隔离） */
export function makeDoubanScope(): SiteScopeId {
  return {
    module: 'video',
    scopeKey: 'https://www.douban.com/#danmu-api',
  };
}

/** 番剧规则站点 scope：按 ruleId 隔离，同站不同规则不串 Cookie */
export function makeBangumiScope(ruleId: string, baseUrl?: string): SiteScopeId {
  const id = ruleId.trim() || 'unknown';
  let origin = 'https://bangumi.local';
  try {
    if (baseUrl?.trim() && /^https?:\/\//i.test(baseUrl.trim())) {
      origin = new URL(baseUrl.trim()).origin;
    }
  } catch {
    /* keep */
  }
  return {
    module: 'video',
    scopeKey: `${origin}/#bangumi:${id}`,
  };
}

