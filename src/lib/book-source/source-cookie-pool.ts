/**
 * 书源 Cookie 池：localStorage 表 ↔ Tauri backstage / inner-web ↔ 纯 Web 代理会话
 */

import type { BookSource } from '@/types';
import { isTauri } from '@/lib/platform/detect';
import {
  readInnerWebProxySessionCookies,
} from '@/lib/http/inner-web-proxy-session';
import { mergeLegadoCookieHeaderStrings } from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { readSourceCookieStore } from '@/lib/js-engine/legado/login-script-runner';
import {
  getSourceUrlIdentifier,
  storageKey,
  STORAGE_PREFIX_COOKIES,
} from '@/lib/js-engine/legado/source-script-shared';
import { getActiveWebProxySessionId } from '@/lib/platform/inner-web';

function writeSourceCookieStore(source: BookSource, store: Map<string, string>): void {
  const cookiesKey = storageKey(STORAGE_PREFIX_COOKIES, getSourceUrlIdentifier(source));
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
): Promise<string> {
  if (!isTauri() || !url.startsWith('http')) return '';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const jar = await invoke<string>(command, { url });
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
    const jars = await Promise.all([
      readTauriJar('get_backstage_webview_cookies_for_url', pageUrl),
      readTauriJar('get_inner_web_panel_cookies_for_url', pageUrl),
      readTauriJar('get_webview_cookies_for_url', pageUrl),
    ]);
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
    await invoke('set_cookies_for_inner_web', { url: pageUrl, cookies: merged });
  } catch (e) {
    console.warn('[source-cookie-pool] 推送 inner-web Cookie 失败', e);
  }
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
