/**
 * 书源 Cookie 池：localStorage 表 ↔ Tauri backstage / inner-web ↔ 纯 Web 代理会话
 */

import type { BookSource } from '@/types';
import { isTauri } from '@/lib/platform/detect';
import {
  readInnerWebProxySessionCookies,
} from '@/lib/http/inner-web-proxy-session';
import {
  legadoInnerWebCookieSyncUrls,
  mergeLegadoCookieHeaderStrings,
  normalizeControlSettingsCookieHeader,
} from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { isBookSourceControlUrl } from '@/lib/platform/inner-web-mode';
import { readSourceCookieStore } from '@/lib/js-engine/legado/login-script-runner';
import {
  getLegadoSourceKey,
  storageKey,
  STORAGE_PREFIX_COOKIES,
} from '@/lib/js-engine/legado/source-script-shared';
import { getActiveWebProxySessionId } from '@/lib/platform/inner-web';
import { getInnerWebCookiesUseMainWebview } from '@/lib/platform/inner-web-cookie-webview';

function writeSourceCookieStore(source: BookSource, store: Map<string, string>): void {
  const cookiesKey = storageKey(STORAGE_PREFIX_COOKIES, getLegadoSourceKey(source));
  const obj: Record<string, string> = {};
  store.forEach((v, k) => {
    obj[k] = v;
  });
  try {
    localStorage.setItem(cookiesKey, JSON.stringify(obj));
  } catch (e) {
    console.warn('[source-cookie-pool] 写入失败', e);
  }
}

function mergeHeaderIntoStore(
  store: Map<string, string>,
  pageUrl: string,
  sourceUrl: string,
  cookieHeader: string,
): void {
  const trimmed = cookieHeader.trim();
  if (!trimmed) return;
  try {
    store.set(new URL(pageUrl).origin, trimmed);
  } catch {
    /* ignore */
  }
  store.set(pageUrl, trimmed);
  if (sourceUrl) store.set(sourceUrl, trimmed);
}

async function readTauriJar(
  command: string,
  url: string,
  useMainWebview = false,
): Promise<string> {
  if (!isTauri() || !url.startsWith('http')) return '';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const jar = await invoke<string>(command, {
      url,
      ...(useMainWebview ? { useMainWebview: true } : {}),
    });
    return jar?.trim() ?? '';
  } catch {
    return '';
  }
}

/** 从各 WebView / 代理会话拉取 Cookie 合并进书源表 */
export async function pullSourceCookiesIntoStore(
  source: BookSource,
  pageUrl: string,
): Promise<void> {
  const store = readSourceCookieStore(source);
  const sourceUrl = source.sourceUrl ?? '';

  const sessionId = getActiveWebProxySessionId();
  if (sessionId) {
    const proxyJar = (await readInnerWebProxySessionCookies(sessionId)).trim();
    if (proxyJar) mergeHeaderIntoStore(store, pageUrl, sourceUrl, proxyJar);
  }

  if (isTauri()) {
    const useMain = getInnerWebCookiesUseMainWebview();
    if (!useMain) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('flush_inner_web_panel_document_cookie');
      } catch {
        /* panel 未打开 */
      }
    }
    const jobs: Promise<string>[] = [
      readTauriJar('get_backstage_webview_cookies_for_url', pageUrl),
    ];
    if (!useMain) {
      jobs.push(readTauriJar('get_inner_web_panel_cookies_for_url', pageUrl));
    }
    jobs.push(readTauriJar('get_webview_cookies_for_url', pageUrl, useMain));
    const jars = await Promise.all(jobs);
    for (const jar of jars) {
      if (jar) mergeHeaderIntoStore(store, pageUrl, sourceUrl, jar);
    }
  }

  writeSourceCookieStore(source, store);
}

/** 将书源表 Cookie 推送到 backstage / inner-web（Tauri） */
export async function pushSourceCookiesToWebviews(
  source: BookSource,
  pageUrl: string,
): Promise<void> {
  if (!isTauri() || !pageUrl.startsWith('http')) return;

  const store = readSourceCookieStore(source);
  let merged = '';
  for (const v of store.values()) {
    if (!v?.trim()) continue;
    merged = merged ? mergeLegadoCookieHeaderStrings(merged, v.trim()) : v.trim();
  }
  if (!merged) return;

  const { invoke } = await import('@tauri-apps/api/core');

  try {
    await invoke('set_cookies_for_backstage_webview', { url: pageUrl, cookies: merged });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // backstage WebView 仅在 WebJs 登录等场景懒创建，内嵌页打开前未创建属预期
    if (!msg.includes('后台 WebView 未创建')) {
      console.warn('[source-cookie-pool] 推送 backstage Cookie 失败', e);
    }
  }

  try {
    const useMain = getInnerWebCookiesUseMainWebview();
    await invoke('set_cookies_for_inner_web', {
      url: pageUrl,
      cookies: merged,
      ...(useMain ? { useMainWebview: true } : {}),
    });
  } catch (e) {
    console.warn('[source-cookie-pool] 推送 inner-web Cookie 失败', e);
  }
}

/** 将 √ 后合并好的 Cookie 头写入书源表（多 URL 键，供 applyCookieSettings / HTTP 读取） */
export function persistSourceCookieHeaderForPage(
  source: BookSource,
  pageUrl: string,
  cookieHeader: string,
): void {
  const trimmed = cookieHeader.trim();
  if (!trimmed) return;
  const store = readSourceCookieStore(source);
  const sourceUrl = source.sourceUrl ?? '';
  for (const target of legadoInnerWebCookieSyncUrls(pageUrl)) {
    mergeHeaderIntoStore(store, target, sourceUrl, trimmed);
  }
  writeSourceCookieStore(source, store);
}

/** 双向合并：拉取各端 → 写表 → 推回各 WebView */
export async function syncSourceCookiePool(
  source: BookSource,
  pageUrl: string,
): Promise<void> {
  if (!pageUrl.startsWith('http')) return;
  await pullSourceCookiesIntoStore(source, pageUrl);
  await pushSourceCookiesToWebviews(source, pageUrl);
}

/** CF / 登录后：将书源 Cookie 头同步进 HTTP CookieJar（对齐 CookieStore.replaceCookie） */
export async function mirrorSourceCookiesToHttpJar(
  pageUrl: string,
  cookieHeader: string,
): Promise<void> {
  const trimmed = cookieHeader.trim();
  if (!trimmed || !pageUrl.startsWith('http')) return;
  try {
    const { replacePersistentCookie } = await import('@/lib/http/cookie-jar');
    await replacePersistentCookie(pageUrl, trimmed);
  } catch (e) {
    console.warn('[source-cookie-pool] mirrorSourceCookiesToHttpJar failed', e);
  }
}

/** √ 后：代理会话 / WebView → 书源表 → CookieJar */
export async function syncSourceCookiesAfterInnerWeb(
  source: BookSource,
  pageUrl: string,
  cookieHeaderFromUi?: string,
): Promise<string> {
  const url = pageUrl.trim();
  if (!url.startsWith('http')) return '';

  await pullSourceCookiesIntoStore(source, url);

  const { resolveSourceCookiesForHttp } = await import('@/lib/book-source/source-http');
  let merged = resolveSourceCookiesForHttp(source, url).trim();
  const fromUi = normalizeControlSettingsCookieHeader(cookieHeaderFromUi?.trim() ?? '');
  if (fromUi) {
    merged = merged
      ? mergeLegadoCookieHeaderStrings(merged, fromUi)
      : fromUi;
  }
  if (merged) {
    persistSourceCookieHeaderForPage(source, url, merged);
    await mirrorSourceCookiesToHttpJar(url, merged);
    if (isBookSourceControlUrl(url)) {
      const { syncControlSettingsToSourceArgs } = await import(
        '@/lib/js-engine/legado/login-script-runner'
      );
      syncControlSettingsToSourceArgs(source, merged);
    }
  }
  await pushSourceCookiesToWebviews(source, url);
  return merged;
}
