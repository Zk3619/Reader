/**
 * 发现子项点击行为：区分普通发现列表 vs Legado 内嵌页（startBrowser / ajax,options）
 */

import { post } from '@/lib/http';
import { parseAjaxArgs } from '@/lib/js-engine/legado/host/parse-ajax';
import { getScriptBaseUrl, getStoredSourceCookiesForUrl } from '@/lib/js-engine';
import { openLegadoBrowserInApp } from '@/lib/platform/open-url';
import {
  isLegadoAjaxBookListExploreUrl,
  isLegadoAjaxExploreUrl,
} from '@/lib/book-source/explore-legado-ajax';
import { resolveUrl } from '@/lib/book-source/utils';
import type { BookSource } from '@/types';
import type { ExploreSection } from '@/lib/book-source/explore-sections';

export { isLegadoAjaxBookListExploreUrl, isLegadoAjaxExploreUrl } from '@/lib/book-source/explore-legado-ajax';

/** 书源 JSON 中常见的 `{\{ ... }\}` 转义 */
function normalizeLegadoTemplate(url: string): string {
  return url
    .trim()
    .replace(/^\{\\+\{/, '{{')
    .replace(/\}\\+\}$/, '}}');
}

/** 解析 `{{java.startBrowser("url","标题");}}` */
export function parseLegadoStartBrowserFromExploreUrl(
  url: string
): { url: string; title?: string } | null {
  const normalized = normalizeLegadoTemplate(url);
  const m = normalized.match(
    /java\.startBrowser\s*\(\s*["']([^"']+)["']\s*(?:,\s*["']([^"']*)["'])?\s*\)/i
  );
  if (!m) return null;
  return { url: m[1], title: m[2] || undefined };
}

/** 是否应进入发现书籍列表页（普通 exploreUrl / 相对路径 / 含 {{page}} / 书单列 ajax） */
export function shouldOpenDiscoverPageForSection(section: ExploreSection): boolean {
  const url = section.url?.trim();
  if (!url) return false;
  if (parseLegadoStartBrowserFromExploreUrl(url)) return false;
  if (isLegadoAjaxBookListExploreUrl(url)) return true;
  if (isLegadoAjaxExploreUrl(url)) return false;
  return true;
}

function mergeCookieHeader(stored: string, headerCookie: string | undefined): string {
  const a = (stored ?? '').trim();
  const b = (headerCookie ?? '').trim();
  if (!a) return b;
  if (!b) return a;
  return `${a}; ${b}`;
}

/**
 * 在应用内打开发现子项（个人中心、登录番茄等），不进入 DiscoverPage
 * @returns 是否已处理
 */
export async function openExploreSectionInInnerWeb(
  source: BookSource,
  section: ExploreSection
): Promise<boolean> {
  const raw = section.url?.trim();
  if (!raw) return false;
  if (isLegadoAjaxBookListExploreUrl(raw)) return false;

  const baseUrl = getScriptBaseUrl(source);

  const browser = parseLegadoStartBrowserFromExploreUrl(raw);
  if (browser) {
    const resolved = baseUrl
      ? resolveUrl(baseUrl, browser.url)
      : browser.url;
    const cookies = getStoredSourceCookiesForUrl(source, resolved);
    await openLegadoBrowserInApp(
      resolved,
      cookies,
      browser.title?.trim() || section.title
    );
    return true;
  }

  if (isLegadoAjaxExploreUrl(raw)) {
    const ajax = parseAjaxArgs(raw)!;
    const resolved = baseUrl ? resolveUrl(baseUrl, ajax.urlStr) : ajax.urlStr;
    const stored = getStoredSourceCookiesForUrl(source, resolved);
    const cookies = mergeCookieHeader(
      stored,
      ajax.headers.Cookie ?? ajax.headers.cookie
    );

    if (ajax.method === 'POST') {
      const body =
        typeof ajax.body === 'string' ? ajax.body : JSON.stringify(ajax.body ?? '');
      const html = await post(resolved, body, {
        headers: { ...ajax.headers, ...(cookies ? { Cookie: cookies } : {}) },
        enableCookieJar: source.enabledCookieJar,
        concurrentRate: source.concurrentRate,
        timeout: 30000,
      });
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      await openLegadoBrowserInApp(dataUrl, '', section.title);
      return true;
    }

    await openLegadoBrowserInApp(resolved, cookies, section.title);
    return true;
  }

  return false;
}
