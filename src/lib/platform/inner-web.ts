/**
 * 应用内嵌网页浮层（专用工具栏 + iframe），供书源脚本、登录页等场景复用。
 * 层级高于 Dialog/登录弹窗（z-50），严格低于 AppToast（z-200，见 App.css）。
 */

import { invoke } from '@tauri-apps/api/core';
import { stripMisplacedCookieFromHttpUrl } from '@/lib/book-source/utils';
import { isTauri } from '@/lib/platform/detect';
import {
  INNER_WEB_MESSAGE_CHANNEL,
  startInnerWebBridge,
  stopInnerWebBridge,
} from '@/lib/platform/inner-web-bridge';
import {
  bumpInnerWebPanelSessionEpoch,
  closeInnerWebTauriPanel,
  setInnerWebSessionActive,
} from '@/lib/platform/inner-web-tauri';
import {
  isBookSourceControlUrl,
  onInnerWebSessionEnded,
  setInnerWebForceTauriPanel,
  useInnerWebIframe,
  useInnerWebTauriPanel,
} from '@/lib/platform/inner-web-mode';
import {
  getInnerWebCookiesUseMainWebview,
  innerWebCookieInvokeArgs,
  resolveInnerWebCookiesUseMainWebview,
  setInnerWebCookiesUseMainWebview,
} from '@/lib/platform/inner-web-cookie-webview';
import {
  applyInnerWebSessionBodyClasses,
  clearInnerWebSessionBodyClasses,
  resolveInnerWebPresentation,
  type InnerWebPresentation,
} from '@/lib/platform/inner-web-presentation';
import { resetInnerWebPanelOverlayOnDismiss } from '@/lib/platform/inner-web-panel-overlay';

export {
  getInnerWebCookiesUseMainWebview,
  setInnerWebCookiesUseMainWebview,
} from '@/lib/platform/inner-web-cookie-webview';

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
  /** 用于 Cookie 池双向同步的书源 URL（bookSourceUrl） */
  bookSourceUrl?: string;
  /** 浮层展示配置（段评等为底部 drawer preset） */
  presentation?: InnerWebPresentation;
  /** 内容加载中（先开抽屉/顶栏，再异步填充 html） */
  loading?: boolean;
  /** 纯 Web：优先 __reader_http/doc 代理（页内 fetch 劫持），段评等动态页须开启 */
  useProxyDocument?: boolean;
  /** 创建代理会话时附带的书源请求头（User-Agent 等） */
  proxyForwardHeaders?: Record<string, string>;
  /**
   * Cloudflare 验证：Tauri 用原生 panel；纯 Web 走 __reader_http 同源代理。
   */
  cloudflareVerification?: boolean;
  /**
   * 强制 Tauri 原生 panel（忽略设置 iframe / auto 回退）。
   * 用于平台登录等被 X-Frame-Options 拦住的站点。
   */
  forceTauriPanel?: boolean;
}

export interface InnerWebCloseResult {
  confirmed: boolean;
  cookies: string;
  url: string;
  /** Legado startBrowserAwait().body()：线路设置等 data: HTML 页在 √ 时的 document 快照 */
  body?: string;
  /** Tauri panel 过 CF 时的 navigator.userAgent（须在 panel 关闭前读取） */
  panelUserAgent?: string;
}

type OpenFn = (payload: InnerWebPayload) => void;
type CloseFn = () => void;
type PatchFn = (payload: InnerWebPayload) => void;

const INNER_WEB_SESSION_STORAGE_KEY = 'reader_inner_web_session_v1';
export const INNER_WEB_REFRESH_EVENT = 'reader-inner-web-refresh';

/** 内嵌晴天等页 yuedu:// 书源导入桥：转成「网络导入书源」预填 URL */
export const READER_BOOKSOURCE_IMPORT_NETWORK_EVENT = 'reader-booksource-import-network';

export type ReaderBooksourceImportNetworkDetail = { url: string };

let openEmbedded: OpenFn | null = null;
let closeOverlay: CloseFn | null = null;
let patchEmbedded: PatchFn | null = null;
let refreshGuardInstalled = false;

type InnerWebDismissListener = () => void;
const innerWebDismissListeners = new Set<InnerWebDismissListener>();

/** 内嵌页完全关闭后通知（drawer 动画结束或全屏 dismiss 完成） */
export function onInnerWebDismissed(listener: InnerWebDismissListener): () => void {
  innerWebDismissListeners.add(listener);
  return () => {
    innerWebDismissListeners.delete(listener);
  };
}

function notifyInnerWebDismissed(): void {
  for (const listener of innerWebDismissListeners) {
    try {
      listener();
    } catch (e) {
      console.warn('[inner-web] dismiss listener failed', e);
    }
  }
}

let pendingAwait: {
  resolve: (r: InnerWebCloseResult) => void;
  cookieSyncUrl?: string;
  bookSourceUrl?: string;
} | null = null;

/** 纯 Web 内嵌页文档代理会话（供 confirm 时读取 Cookie） */
let activeWebProxySessionId: string | null = null;

/** Tauri CF 验证 √ 后暂缓关闭 panel，供同实例 WebView 拉取列表/正文 */
let cfPanelDeferredDismiss = false;

export function isCfPanelDeferredDismiss(): boolean {
  return cfPanelDeferredDismiss;
}

function markCfPanelDeferredDismiss(): void {
  cfPanelDeferredDismiss = true;
}

/** CF 拉取结束后关闭 panel / 内嵌页 */
export function releaseCfDeferredInnerWebDismiss(): void {
  if (!cfPanelDeferredDismiss) return;
  cfPanelDeferredDismiss = false;
  void requestInnerWebDismiss();
}

export function setActiveWebProxySessionId(sessionId: string | null): void {
  activeWebProxySessionId = sessionId;
}

export function getActiveWebProxySessionId(): string | null {
  return activeWebProxySessionId;
}

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

/** 由 App 根组件注册：更新已打开的 inner-web payload（段评异步加载 html 等） */
export function registerInnerWebPatch(fn: PatchFn): void {
  patchEmbedded = fn;
}

function normalizeInnerWebPayload(payload: InnerWebPayload): InnerWebPayload | null {
  const html = payload.html?.trim() || undefined;
  const rawUrl = payload.url?.trim() || undefined;
  const url =
    rawUrl && /^https?:/i.test(rawUrl)
      ? stripMisplacedCookieFromHttpUrl(rawUrl)
      : rawUrl;
  if (!html && !url) return null;
  const rawSync = payload.cookieSyncUrl?.trim() || url || undefined;
  const cookieSyncUrl =
    rawSync && /^https?:/i.test(rawSync)
      ? stripMisplacedCookieFromHttpUrl(rawSync)
      : rawSync;
  return {
    title: payload.title || '网页',
    html,
    url,
    showConfirm: payload.showConfirm,
    cookieSyncUrl,
    initialCookies: payload.initialCookies?.trim() || undefined,
    bookSourceUrl: payload.bookSourceUrl?.trim() || undefined,
    presentation: payload.presentation,
    loading: payload.loading,
    useProxyDocument: payload.useProxyDocument,
    proxyForwardHeaders: payload.proxyForwardHeaders,
    cloudflareVerification: payload.cloudflareVerification,
    forceTauriPanel: payload.forceTauriPanel,
  };
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
    if (active && payload) {
      applyInnerWebSessionBodyClasses(
        resolveInnerWebPresentation(payload.presentation, {
          showConfirm: payload.showConfirm,
        }),
      );
    } else if (!active) {
      clearInnerWebSessionBodyClasses();
    }
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

let dismissOverlayInflight: Promise<void> | null = null;

async function dismissOverlay(): Promise<void> {
  if (dismissOverlayInflight) return dismissOverlayInflight;

  dismissOverlayInflight = (async () => {
    bumpInnerWebPanelSessionEpoch();
    suppressLoginDialogDismiss();
    stopInnerWebBridge();
    try {
      await closeInnerWebTauriPanel();
      const { closeInnerWebChildWindow } = await import('./inner-web-child-window');
      await closeInnerWebChildWindow();
    } catch (e) {
      console.warn('[inner-web] close inner web views failed', e);
    }
    resetInnerWebPanelOverlayOnDismiss();
    await waitPointerGestureEnd();
    clearInnerWebSessionStorage();
    clearInnerWebSessionBodyClasses();
    await setInnerWebSessionActive(false);
    onInnerWebSessionEnded();
    setInnerWebCookiesUseMainWebview(false);
    closeOverlay?.();
    notifyInnerWebDismissed();
    pendingDismissResolve?.();
    pendingDismissResolve = null;
  })().finally(() => {
    dismissOverlayInflight = null;
  });

  return dismissOverlayInflight;
}

function isDrawerInnerWebSession(payload?: InnerWebPayload | null): boolean {
  const p = payload ?? loadPersistedInnerWebSession();
  if (!p) return false;
  return (
    resolveInnerWebPresentation(p.presentation, { showConfirm: p.showConfirm }).layout ===
    'drawer'
  );
}

let pendingDismissResolve: (() => void) | null = null;

/** corvu 抽屉关闭过渡时长（对齐 AppDrawer `duration-300`） */
export const INNER_WEB_DRAWER_TRANSITION_MS = 300;

let innerWebDrawerAnimatedDismiss: (() => void) | null = null;

/** 关闭 inner-web：drawer 先播 corvu 动画，全屏直接 dismiss */
function requestInnerWebDismiss(): Promise<void> {
  if (isDrawerInnerWebSession() && innerWebDrawerAnimatedDismiss) {
    return new Promise((resolve) => {
      pendingDismissResolve = resolve;
      innerWebDrawerAnimatedDismiss!();
    });
  }
  return dismissOverlay();
}

export function openInnerWeb(payload: InnerWebPayload): boolean {
  if (!openEmbedded) return false;
  const normalized = normalizeInnerWebPayload(payload);
  if (!normalized) return false;
  const { html, url } = normalized;
  try {
    setInnerWebForceTauriPanel(Boolean(normalized.forceTauriPanel));
    const iframeMode = useInnerWebIframe({ url, html });
    const bookSourceControl = Boolean(url && isBookSourceControlUrl(url));
    setInnerWebCookiesUseMainWebview(
      normalized.cloudflareVerification ||
        bookSourceControl ||
        normalized.forceTauriPanel
        ? false
        : resolveInnerWebCookiesUseMainWebview({
            iframeMode,
            useProxyDocument: normalized.useProxyDocument,
          }),
    );
    if (iframeMode) {
      void closeInnerWebTauriPanel();
      if (url?.startsWith('http')) {
        void startInnerWebBridge(url);
      }
    }
    persistInnerWebSession(normalized);
    const syncUrl = normalized.cookieSyncUrl ?? url ?? '';
    if (normalized.bookSourceUrl && syncUrl.startsWith('http')) {
      void (async () => {
        try {
          const { getSource } = await import('@/lib/database/sources');
          const { pushSourceCookiesToWebviews } = await import(
            '@/lib/book-source/source-cookie-pool'
          );
          const src = await getSource(normalized.bookSourceUrl!);
          if (src) await pushSourceCookiesToWebviews(src, syncUrl);
        } catch (e) {
          console.warn('[inner-web] 打开前回灌 Cookie 池失败', e);
        }
      })();
    }
    openEmbedded(normalized);
    setSessionActive(true, normalized);
    if (useInnerWebTauriPanel({ url, html })) {
      resetInnerWebPanelOverlayOnDismiss();
      void invoke('set_inner_web_panel_visible', { visible: true }).catch((e) => {
        console.warn('[inner-web] set_inner_web_panel_visible(true) failed', e);
      });
    }
    return true;
  } catch (e) {
    console.error('[inner-web] openInnerWeb failed', e);
    return false;
  }
}

/** 更新当前 inner-web 会话（须已打开）；用于段评等先开 UI 再注入 html */
export function updateInnerWebPayload(partial: Partial<InnerWebPayload>): boolean {
  const current = loadPersistedInnerWebSession();
  if (!current || !patchEmbedded) return false;
  const merged = normalizeInnerWebPayload({ ...current, ...partial, title: partial.title ?? current.title });
  if (!merged) return false;
  persistInnerWebSession(merged);
  patchEmbedded(merged);
  return true;
}

/**
 * 打开内嵌页并等待用户点击 √ 或返回取消（Legado startBrowserAwait / getVerificationResult）
 */
export function openInnerWebAwait(payload: InnerWebPayload): Promise<InnerWebCloseResult> {
  const cookieSyncUrl =
    payload.cookieSyncUrl?.trim() || payload.url?.trim() || '';
  return new Promise((resolve) => {
    pendingAwait = {
      resolve,
      cookieSyncUrl: cookieSyncUrl || undefined,
      bookSourceUrl: payload.bookSourceUrl?.trim() || undefined,
    };
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

/** 向内嵌 iframe 请求 document HTML（代理页 postMessage；srcdoc 优先走 contentDocument） */
async function requestIframeDocumentHtml(frameWindow: Window): Promise<string> {
  return new Promise((resolve) => {
    const id = `html-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timeout = window.setTimeout(() => resolve(''), 1200);
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== frameWindow) return;
      const d = ev.data as { channel?: string; id?: string; result?: unknown };
      if (d?.channel !== INNER_WEB_MESSAGE_CHANNEL || d.id !== id) return;
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMsg);
      resolve(String(d.result ?? ''));
    };
    window.addEventListener('message', onMsg);
    frameWindow.postMessage(
      { channel: INNER_WEB_MESSAGE_CHANNEL, id, method: 'readDocumentHtml' },
      '*',
    );
  });
}

/** √ 前抓取内嵌页 HTML（光遇 getServerSettings 解析 serverValue 等） */
export async function pullInnerWebDocumentHtmlFromFrames(): Promise<string> {
  if (typeof document === 'undefined') return '';

  // Tauri panel 无 iframe：须用 WebView2 ExecuteScript 从子 WebView 同步取 HTML
  if (isTauri()) {
    try {
      const html = (await invoke<string>('capture_inner_web_panel_document_html')).trim();
      console.warn('[inner-web] panel capture', { len: html.length });
      if (html) return html;
    } catch (e) {
      console.warn('[inner-web] capture_inner_web_panel_document_html failed', e);
    }
  }

  const frames = document.querySelectorAll('iframe.reader-inner-web-iframe');
  for (const el of frames) {
    const frame = el as HTMLIFrameElement;
    try {
      const doc = frame.contentDocument;
      if (doc?.documentElement) {
        const html = doc.documentElement.outerHTML;
        if (html.trim()) return html;
      }
    } catch {
      /* cross-origin */
    }
    const win = frame.contentWindow;
    if (!win) continue;
    try {
      const html = (await requestIframeDocumentHtml(win)).trim();
      if (html) return html;
    } catch (e) {
      console.warn('[inner-web] requestIframeDocumentHtml failed', e);
    }
  }

  return '';
}

/** 向内嵌 iframe 请求 document.cookie（Tauri / 代理会话在 √ 前同步用） */
async function requestIframeDocumentCookie(frameWindow: Window): Promise<string> {
  return new Promise((resolve) => {
    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timeout = window.setTimeout(() => resolve(''), 800);
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== frameWindow) return;
      const d = ev.data as { channel?: string; id?: string; result?: unknown };
      if (d?.channel !== INNER_WEB_MESSAGE_CHANNEL || d.id !== id) return;
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMsg);
      resolve(String(d.result ?? ''));
    };
    window.addEventListener('message', onMsg);
    frameWindow.postMessage(
      { channel: INNER_WEB_MESSAGE_CHANNEL, id, method: 'readDocumentCookie' },
      '*',
    );
  });
}

/** 从所有内嵌 iframe 拉取 document.cookie，并写入 Tauri Cookie 罐或代理会话 */
export async function pullInnerWebDocumentCookiesFromFrames(
  pageUrl: string,
  options?: { proxySessionId?: string },
): Promise<string> {
  if (typeof document === 'undefined') return '';
  const trimmed = pageUrl.trim();
  if (!trimmed.startsWith('http')) return '';

  const frames = document.querySelectorAll('iframe.reader-inner-web-iframe');
  for (const el of frames) {
    const win = (el as HTMLIFrameElement).contentWindow;
    if (!win) continue;
    try {
      const docCookie = (await requestIframeDocumentCookie(win)).trim();
      if (!docCookie) continue;
      const sid = options?.proxySessionId ?? activeWebProxySessionId;
      if (sid) {
        const { mergeInnerWebProxySessionCookies } = await import(
          '@/lib/http/inner-web-proxy-session'
        );
        await mergeInnerWebProxySessionCookies(sid, docCookie);
      } else if (isTauri()) {
        await invoke(
          'sync_document_cookies_for_inner_web',
          innerWebCookieInvokeArgs({ url: trimmed, cookies: docCookie }),
        );
      }
      return docCookie;
    } catch (e) {
      console.warn('[inner-web] pullInnerWebDocumentCookiesFromFrames failed', e);
    }
  }
  return '';
}

/** 纯 Web 代理 iframe：向子页索取 document.cookie 并写入代理会话（刷新 / √ 前调用） */
export async function pullInnerWebProxyCookiesFromIframe(
  sessionId: string,
  pageUrl: string,
): Promise<void> {
  await pullInnerWebDocumentCookiesFromFrames(pageUrl, { proxySessionId: sessionId });
}

function isValidCookieSyncUrl(url: string): boolean {
  const u = url.trim();
  if (!u.startsWith('http')) return false;
  try {
    return Boolean(new URL(u).hostname);
  } catch {
    return false;
  }
}

/** CF / 挑战后跳转：合并初始 cookieSyncUrl、会话 url、panel 当前址等读取目标 */
async function resolveInnerWebCookieReadTargets(pageUrl: string): Promise<string[]> {
  const { legadoInnerWebCookieSyncUrls } = await import(
    '@/lib/js-engine/legado/normalize-legado-ajax-body'
  );
  const targets = new Set<string>(legadoInnerWebCookieSyncUrls(pageUrl));
  const session = loadPersistedInnerWebSession();
  if (session?.url?.startsWith('http')) {
    for (const u of legadoInnerWebCookieSyncUrls(session.url)) targets.add(u);
  }
  if (session?.cloudflareVerification) {
    if (isTauri()) {
      try {
        const panelUrl = (await invoke<string>('get_inner_web_panel_current_url')).trim();
        if (panelUrl.startsWith('http')) {
          for (const u of legadoInnerWebCookieSyncUrls(panelUrl)) targets.add(u);
        }
      } catch (e) {
        console.warn('[inner-web] 读取 panel 当前 URL 失败（CF Cookie 同步）', e);
      }
    } else if (typeof document !== 'undefined') {
      const frame = document.querySelector(
        'iframe.reader-inner-web-iframe',
      ) as HTMLIFrameElement | null;
      const src = frame?.src?.trim() ?? '';
      if (src.startsWith('http')) {
        for (const u of legadoInnerWebCookieSyncUrls(src)) targets.add(u);
      }
    }
  }
  return [...targets].filter(isValidCookieSyncUrl);
}

/** 从代理会话读取 Cookie（HttpOnly 的 cf_clearance 仅在此） */
async function readProxySessionCookieHeader(
  sessionId: string,
  pageUrl: string,
): Promise<string> {
  const { normalizeControlSettingsCookieHeader } = await import(
    '@/lib/js-engine/legado/normalize-legado-ajax-body'
  );
  const { readInnerWebProxySessionCookies } = await import(
    '@/lib/http/inner-web-proxy-session'
  );
  await pullInnerWebProxyCookiesFromIframe(sessionId, pageUrl);
  const raw = await readInnerWebProxySessionCookies(sessionId);
  return normalizeControlSettingsCookieHeader(raw.trim());
}

/** 读取内嵌 WebView / iframe 当前 URL 的 Cookie（供「更多 → 查看 Cookie」、登录 √ 同步） */
export async function readInnerWebCookies(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!isValidCookieSyncUrl(trimmed)) return '';
  const { normalizeControlSettingsCookieHeader, mergeLegadoCookieHeaderStrings } =
    await import('@/lib/js-engine/legado/normalize-legado-ajax-body');
  const normalize = (raw: string) => normalizeControlSettingsCookieHeader(raw.trim());
  const mergeChunks = (parts: string[]) => {
    let out = '';
    for (const p of parts) {
      const n = normalize(p);
      if (!n) continue;
      out = out ? mergeLegadoCookieHeaderStrings(out, n) : n;
    }
    return out;
  };

  const proxySessionId = activeWebProxySessionId;
  if (proxySessionId) {
    try {
      const fromProxy = await readProxySessionCookieHeader(proxySessionId, trimmed);
      if (fromProxy) return fromProxy;
    } catch (e) {
      console.warn('[inner-web] read proxy session cookies failed', e);
    }
  }

  const readTargets = await resolveInnerWebCookieReadTargets(trimmed);
  const chunks: string[] = [];
  const useMain = getInnerWebCookiesUseMainWebview();

  if (isTauri()) {
    if (!useMain) {
      try {
        await invoke('flush_inner_web_panel_document_cookie');
      } catch {
        /* panel 未打开 */
      }
      for (const target of readTargets) {
        try {
          chunks.push(
            await invoke<string>('get_inner_web_panel_cookies_for_url', { url: target }),
          );
        } catch {
          // panel 未打开
        }
      }
    }
    for (const target of readTargets) {
      if (proxySessionId) {
        const fromFrame = await pullInnerWebDocumentCookiesFromFrames(target, {
          proxySessionId,
        });
        if (fromFrame) chunks.push(fromFrame);
      } else {
        const fromFrame = await pullInnerWebDocumentCookiesFromFrames(target);
        if (fromFrame) chunks.push(fromFrame);
      }
      if (proxySessionId) continue;
      try {
        chunks.push(
          await invoke<string>(
            'get_webview_cookies_for_url',
            innerWebCookieInvokeArgs({ url: target }),
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/URL 无效|empty host/i.test(msg)) {
          console.warn('[inner-web] get_webview_cookies_for_url failed', msg);
        }
      }
    }
  } else {
    for (const target of readTargets) {
      const fromFrame = await pullInnerWebDocumentCookiesFromFrames(target, {
        proxySessionId: proxySessionId ?? undefined,
      });
      if (fromFrame) chunks.push(fromFrame);
    }
  }

  return mergeChunks(chunks);
}

/** √ 确认前多次读取（panel 刷新 / 代理会话落盘可能有短暂延迟） */
export async function readInnerWebCookiesForConfirm(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!isValidCookieSyncUrl(trimmed)) return '';

  const snapSessionId = activeWebProxySessionId;
  const attempts = snapSessionId ? 4 : 3;

  for (let i = 0; i < attempts; i++) {
    if (isTauri() && !getInnerWebCookiesUseMainWebview()) {
      try {
        await invoke('flush_inner_web_panel_document_cookie');
      } catch {
        /* panel 未打开 */
      }
    }
    if (snapSessionId) {
      try {
        const fromProxy = await readProxySessionCookieHeader(snapSessionId, trimmed);
        if (fromProxy.trim()) return fromProxy;
      } catch {
        /* retry */
      }
    }
    const merged = await readInnerWebCookies(trimmed);
    if (merged.trim()) return merged;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, snapSessionId ? 200 : 150));
    }
  }
  return '';
}

/** 用户点击 √（Legado menu_ok） */
export async function confirmInnerWebClose(
  cookieSyncUrl?: string,
  bookSourceUrl?: string,
): Promise<void> {
  const session = pendingAwait;
  const persisted = loadPersistedInnerWebSession();
  const url = (cookieSyncUrl ?? session?.cookieSyncUrl ?? persisted?.cookieSyncUrl ?? '').trim();
  const sourceKey =
    bookSourceUrl?.trim() ||
    session?.bookSourceUrl?.trim() ||
    persisted?.bookSourceUrl?.trim() ||
    undefined;

  // 须在 panel 关闭前抓取 HTML / Cookie / UA；并行读取，避免 √ 后 panel 已销毁
  const needCookies = isValidCookieSyncUrl(url);
  const [bodyResult, cookiesResult, panelUaResult] = await Promise.all([
    pullInnerWebDocumentHtmlFromFrames().catch((e) => {
      console.warn('[inner-web] pullInnerWebDocumentHtmlFromFrames failed', e);
      return '';
    }),
    needCookies
      ? readInnerWebCookiesForConfirm(url).catch((e) => {
          console.warn('[inner-web] readInnerWebCookiesForConfirm failed', e);
          return '';
        })
      : Promise.resolve(''),
    isTauri()
      ? invoke<string>('get_inner_web_panel_user_agent').catch((e) => {
          console.warn('[inner-web] get_inner_web_panel_user_agent failed', e);
          return '';
        })
      : Promise.resolve(''),
  ]);

  let body = bodyResult;
  if (!body.trim()) {
    console.warn('[inner-web] confirm: document body empty', { url: url.slice(0, 120) });
  }

  let cookies = cookiesResult;
  if (url.startsWith('http') && sourceKey && cookies.trim()) {
    try {
      const { syncSourceCookiesAfterInnerWeb } = await import(
        '@/lib/book-source/source-cookie-pool'
      );
      const { getSource } = await import('@/lib/database/sources');
      const src = await getSource(sourceKey);
      if (src) {
        cookies = await syncSourceCookiesAfterInnerWeb(src, url, cookies);
      } else {
        const { getRssSource } = await import('@/lib/database/rss-sources');
        const { rssAsBookSource } = await import('@/lib/rss-source/rss-as-book-source');
        const rss = await getRssSource(sourceKey);
        if (rss) {
          cookies = await syncSourceCookiesAfterInnerWeb(rssAsBookSource(rss), url, cookies);
        }
      }
    } catch (e) {
      console.warn('[inner-web] cookie pool sync failed', e);
    }
  }

  const panelUserAgent = String(panelUaResult ?? '').trim() || undefined;
  session?.resolve({ confirmed: true, cookies, url, body, panelUserAgent });
  pendingAwait = null;
  const sessionPayload = loadPersistedInnerWebSession();
  if (sessionPayload?.cloudflareVerification && isTauri()) {
    markCfPanelDeferredDismiss();
    void invoke('set_inner_web_panel_visible', { visible: false }).catch(() => {
      /* panel 可能已隐藏 */
    });
  }
  // 不 await：立即让登录脚本继续，关闭动画与 panel 在后台完成
  void requestInnerWebDismiss();
}

/** 关闭内嵌页会话（await 完成后再打开主程序浮层，避免 #root 仍被 pointer-events 锁定） */
export async function dismissInnerWebSession(): Promise<void> {
  pendingAwait?.resolve({ confirmed: false, cookies: '', url: '' });
  pendingAwait = null;
  await requestInnerWebDismiss();
}

/** 返回或取消：不确认 */
export function cancelInnerWebClose(): void {
  void dismissInnerWebSession();
}

export function isInnerWebAwaiting(): boolean {
  return pendingAwait != null;
}

/** 由 InnerWebDrawerShell 注册：关闭 inner-web 时先播放抽屉动画 */
export function setInnerWebDrawerAnimatedDismiss(handler: (() => void) | null): void {
  innerWebDrawerAnimatedDismiss = handler;
}

/** 抽屉关闭动画结束后清空会话（由 InnerWebDrawerShell 在过渡完成后调用） */
export function completeInnerWebDrawerDismiss(): void {
  innerWebDrawerAnimatedDismiss = null;
  void dismissOverlay();
}
