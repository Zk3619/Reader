/**
 * InnerWeb 页内链接导航：对齐 Legado ReadRssActivity WebView 内跳转 / 外链打开
 */

import { openExternalUrl } from '@/lib/platform/open-url';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  handleReaderImportDeepLink,
  isReaderImportDeepLink,
} from '@/lib/platform/legado-import-uri';
import {
  loadPersistedInnerWebSession,
  openInnerWeb,
  type InnerWebPayload,
} from '@/lib/platform/inner-web';

export const INNER_WEB_NAV_CHANNEL = 'reader-inner-web-navigate';

/** Legado 默认移动端 UA（ReadRssActivity upWebviewSettings） */
export const LEGADO_RSS_MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

/** iframe 内嵌页：postMessage 宿主 + 拦截 shell.open */
export function buildInnerWebNavigationBridgeScript(): string {
  const ch = INNER_WEB_NAV_CHANNEL;
  return (
    "(function(){if(window.__READER_INNER_WEB_NAV__)return;window.__READER_INNER_WEB_NAV__=true;" +
    `var ch='${ch}';` +
    "function nav(href,target){try{window.parent.postMessage({channel:ch,href:String(href||''),target:target||null},'*');}catch(_){}}" +
    "function installShellOpenShim(){try{var ti=window.__TAURI_INTERNALS__||{};if(!ti.plugins)ti.plugins={};window.__TAURI_INTERNALS__=ti;if(!window.__TAURI__)window.__TAURI__={};var shellOpen=function(u){nav(u,'_blank');return Promise.resolve();};var shellWrap={open:shellOpen};window.__TAURI__.shell=shellWrap;try{Object.defineProperty(window.__TAURI__,'shell',{configurable:true,enumerable:true,get:function(){return shellWrap;}});}catch(_){}}catch(_){}}" +
    "installShellOpenShim();" +
    "try{window.open=function(u,t){nav(u,t||'_blank');return null;};}catch(_){}" +
    "function bindLinkCapture(){document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var raw=a.getAttribute('href')||'';if(!raw||/^javascript:/i.test(raw)||raw.charAt(0)==='#')return;e.preventDefault();e.stopPropagation();nav(a.href,a.getAttribute('target'));},true);}" +
    "function onReady(){installShellOpenShim();bindLinkCapture();}" +
    "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',onReady);else onReady();" +
    "window.addEventListener('load',installShellOpenShim);" +
    "})();"
  );
}

function mergeInnerWebNavigatePayload(
  url: string,
  current?: InnerWebPayload | null,
): InnerWebPayload {
  const trimmed = url.trim();
  const cookies = current?.initialCookies?.trim() ?? '';
  const headers = { ...(current?.proxyForwardHeaders ?? {}) };
  if (!headers['User-Agent'] && !headers['user-agent']) {
    headers['User-Agent'] = LEGADO_RSS_MOBILE_UA;
  }
  return {
    title: current?.title ?? '网页',
    url: trimmed,
    cookieSyncUrl: trimmed,
    initialCookies: cookies || undefined,
    bookSourceUrl: current?.bookSourceUrl,
    proxyForwardHeaders: headers,
    useProxyDocument: Boolean(cookies) && Boolean(current?.useProxyDocument),
    showConfirm: current?.showConfirm,
    presentation: current?.presentation,
  };
}

/** 在当前 InnerWeb 会话内打开链接（同页或 _blank 均复用 Legado 式 WebView 导航） */
export async function navigateInnerWebLink(
  href: string,
  _target?: string | null,
): Promise<boolean> {
  const trimmed = href.trim();
  if (!trimmed) return false;

  if (isReaderImportDeepLink(trimmed)) {
    await handleReaderImportDeepLink(trimmed);
    return true;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const current = loadPersistedInnerWebSession();
    const opened = openInnerWeb(mergeInnerWebNavigatePayload(trimmed, current));
    if (opened) return true;
    showAppToast({ title: '无法打开链接', variant: 'destructive' });
    return false;
  }

  const opened = await openExternalUrl(trimmed);
  if (opened) return true;
  showAppToast({ title: '无法打开链接', variant: 'destructive' });
  return false;
}
