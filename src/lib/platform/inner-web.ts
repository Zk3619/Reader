/**
 * 应用内嵌网页浮层（专用工具栏 + iframe），供书源脚本、登录页等场景复用。
 * 层级高于 Dialog/登录弹窗（z-50），严格低于 AppToast（z-200，见 App.css）。
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './detect';
import { startInnerWebBridge, stopInnerWebBridge } from './inner-web-bridge';
import {
  closeInnerWebTauriPanel,
  setInnerWebSessionActive,
} from './inner-web-tauri';
import { useInnerWebIframe, useInnerWebTauriPanel } from './inner-web-mode';

export interface InnerWebPayload {
  title: string;
  /** 直接嵌入的 HTML（优先于 url） */
  html?: string;
  /** http(s) 可在 iframe 中加载的地址 */
  url?: string;
  /** 显示右上角 √（Legado WebViewActivity menu_ok） */
  showConfirm?: boolean;
  /** 点击 √ 时从 WebView 同步 Cookie 所用的 URL（默认 url） */
  cookieSyncUrl?: string;
  /** 打开前注入 WebView 的 Cookie 串（iframe 每次 load 会重新注入） */
  initialCookies?: string;
}

export interface InnerWebCloseResult {
  confirmed: boolean;
  cookies: string;
  url: string;
}

type OpenFn = (payload: InnerWebPayload) => void;
type CloseFn = () => void;

const INNER_WEB_SESSION_STORAGE_KEY = 'reader_inner_web_session_v1';
export const INNER_WEB_REFRESH_EVENT = 'reader-inner-web-refresh';

/** 内嵌晴天等页 yuedu:// 书源导入桥：转成「网络导入书源」预填 URL */
export const READER_BOOKSOURCE_IMPORT_NETWORK_EVENT = 'reader-booksource-import-network';

export type ReaderBooksourceImportNetworkDetail = { url: string };

let openEmbedded: OpenFn | null = null;
let closeOverlay: CloseFn | null = null;
let refreshGuardInstalled = false;

let pendingAwait: {
  resolve: (r: InnerWebCloseResult) => void;
  cookieSyncUrl?: string;
} | null = null;

/** 关闭 inner-web 后短暂忽略登录 Dialog 的 onOpenChange(false)，避免点击穿透误关 */
let suppressLoginDialogDismissUntil = 0;

export function isInnerWebSessionActive(): boolean {
  if (typeof document === 'undefined') return false;
  return document.body.classList.contains('reader-inner-web-session');
}

export function suppressLoginDialogDismiss(ms = 450): void {
  suppressLoginDialogDismissUntil = Date.now() + ms;
}

export function shouldSuppressLoginDialogDismiss(): boolean {
  return Date.now() < suppressLoginDialogDismissUntil || isInnerWebSessionActive();
}

function waitPointerGestureEnd(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** 由 App 根组件注册：显示内嵌网页浮层 */
export function registerInnerWebOpener(fn: OpenFn): void {
  openEmbedded = fn;
}

/** 由 App 根组件注册：关闭浮层 */
export function registerInnerWebClose(fn: CloseFn): void {
  closeOverlay = fn;
}

function persistInnerWebSession(payload: InnerWebPayload): void {
  try {
    sessionStorage.setItem(INNER_WEB_SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function clearInnerWebSessionStorage(): void {
  try {
    sessionStorage.removeItem(INNER_WEB_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** 页面刷新后同步读取内嵌页会话（供 App 初始 signal 使用） */
export function loadPersistedInnerWebSession(): InnerWebPayload | null {
  try {
    const raw = sessionStorage.getItem(INNER_WEB_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as InnerWebPayload;
    if (!p?.title || (!p.html?.trim() && !p.url?.trim())) {
      clearInnerWebSessionStorage();
      return null;
    }
    return p;
  } catch {
    clearInnerWebSessionStorage();
    return null;
  }
}

function installInnerWebRefreshGuard(): void {
  if (refreshGuardInstalled || typeof window === 'undefined') return;
  refreshGuardInstalled = true;
  window.addEventListener(
    'keydown',
    (e) => {
      if (!loadPersistedInnerWebSession() && !isInnerWebSessionActive()) return;
      const isRefresh =
        e.key === 'F5' ||
        (e.key === 'r' && (e.ctrlKey || e.metaKey)) ||
        (e.key === 'R' && (e.ctrlKey || e.metaKey));
      if (!isRefresh) return;
      e.preventDefault();
      window.dispatchEvent(new CustomEvent(INNER_WEB_REFRESH_EVENT));
    },
    { capture: true }
  );
}

/** 刷新后恢复内嵌页：重建 bridge / body 会话类（不重复 openEmbedded） */
export function applyRestoredInnerWebSession(payload: InnerWebPayload): void {
  installInnerWebRefreshGuard();
  if (useInnerWebIframe({ url: payload.url, html: payload.html })) {
    if (payload.url?.startsWith('http')) {
      void startInnerWebBridge(payload.url);
    }
  }
  setSessionActive(true, payload);
}

function setSessionActive(active: boolean, payload?: InnerWebPayload): void {
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('reader-inner-web-session', active);
  }
  if (active) {
    installInnerWebRefreshGuard();
  }
  if (payload && useInnerWebTauriPanel({ url: payload.url, html: payload.html })) {
    void setInnerWebSessionActive(active);
  } else if (!active && isTauri()) {
    void setInnerWebSessionActive(false);
  }
}

async function dismissOverlay(): Promise<void> {
  suppressLoginDialogDismiss();
  stopInnerWebBridge();
  try {
    await closeInnerWebTauriPanel();
    const { closeInnerWebChildWindow } = await import('./inner-web-child-window');
    await closeInnerWebChildWindow();
  } catch (e) {
    console.warn('[inner-web] close inner web views failed', e);
  }
  await waitPointerGestureEnd();
  clearInnerWebSessionStorage();
  document.body.classList.remove('reader-inner-web-session');
  await setInnerWebSessionActive(false);
  closeOverlay?.();
}

export function openInnerWeb(payload: InnerWebPayload): boolean {
  if (!openEmbedded) return false;
  const html = payload.html?.trim() || undefined;
  const url = payload.url?.trim() || undefined;
  if (!html && !url) return false;
  try {
    if (useInnerWebIframe({ url, html })) {
      if (url?.startsWith('http')) {
        void startInnerWebBridge(url);
      }
    }
    const normalized: InnerWebPayload = {
      title: payload.title || '网页',
      html,
      url,
      showConfirm: payload.showConfirm,
      cookieSyncUrl: payload.cookieSyncUrl?.trim() || url || undefined,
      initialCookies: payload.initialCookies?.trim() || undefined,
    };
    persistInnerWebSession(normalized);
    openEmbedded(normalized);
    setSessionActive(true, normalized);
    return true;
  } catch (e) {
    console.error('[inner-web] openInnerWeb failed', e);
    return false;
  }
}

/**
 * 打开内嵌页并等待用户点击 √ 或返回取消（Legado startBrowserAwait / getVerificationResult）
 */
export function openInnerWebAwait(
  payload: InnerWebPayload & { cookieSyncUrl?: string }
): Promise<InnerWebCloseResult> {
  const cookieSyncUrl =
    payload.cookieSyncUrl?.trim() || payload.url?.trim() || '';
  return new Promise((resolve) => {
    pendingAwait = { resolve, cookieSyncUrl: cookieSyncUrl || undefined };
    try {
      const opened = openInnerWeb({
        ...payload,
        showConfirm: true,
        cookieSyncUrl: cookieSyncUrl || undefined,
      });
      if (!opened) {
        pendingAwait = null;
        resolve({ confirmed: false, cookies: '', url: cookieSyncUrl });
      }
    } catch (e) {
      console.error('[inner-web] openInnerWebAwait failed', e);
      pendingAwait = null;
      resolve({ confirmed: false, cookies: '', url: cookieSyncUrl });
    }
  });
}

/** 读取内嵌 WebView / iframe 当前 URL 的 Cookie（供「更多 → 查看 Cookie」） */
export async function readInnerWebCookies(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed.startsWith('http')) return '';
  if (isTauri()) {
    try {
      return await invoke<string>('get_webview_cookies_for_url', { url: trimmed });
    } catch (e) {
      console.warn('[inner-web] get_webview_cookies_for_url failed', e);
    }
  }
  return '';
}

/** 用户点击 √（Legado menu_ok） */
export async function confirmInnerWebClose(cookieSyncUrl?: string): Promise<void> {
  const session = pendingAwait;
  const url = (cookieSyncUrl ?? session?.cookieSyncUrl ?? '').trim();
  let cookies = '';
  if (url) {
    cookies = await readInnerWebCookies(url);
  }
  session?.resolve({ confirmed: true, cookies, url });
  pendingAwait = null;
  await dismissOverlay();
}

/** 返回或取消：不确认 */
export function cancelInnerWebClose(): void {
  pendingAwait?.resolve({ confirmed: false, cookies: '', url: '' });
  pendingAwait = null;
  void dismissOverlay();
}

export function isInnerWebAwaiting(): boolean {
  return pendingAwait != null;
}
