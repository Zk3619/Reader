/**
 * 内嵌网页：专用工具栏 + 内容区
 * - Tauri 桌面（panel / auto）：主窗口内子 WebView + 专用工具栏
 * - Tauri 桌面（iframe 或 auto 回退）：iframe + ensure_inner_web_iframe_scripts 跨域 Cookie 桥
 * - 纯 Web / 移动端：https 或 data 仍用 iframe + postMessage 桥
 */

import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import type { InnerWebPayload } from '@/lib/platform/inner-web';
import {
  cancelInnerWebClose,
  confirmInnerWebClose,
  INNER_WEB_REFRESH_EVENT,
  setInnerWebCookiesUseMainWebview,
  READER_BOOKSOURCE_IMPORT_NETWORK_EVENT,
  suppressLoginDialogDismiss,
  updateInnerWebPayload,
  type ReaderBooksourceImportNetworkDetail,
} from '@/lib/platform/inner-web';
import { startInnerWebBridge, stopInnerWebBridge } from '@/lib/platform/inner-web-bridge';
import {
  markInnerWebPanelSessionFallback,
  useInnerWebIframe,
  useInnerWebTauriPanel,
} from '@/lib/platform/inner-web-mode';
import {
  closeInnerWebTauriPanel,
  focusInnerWebTauriPanel,
  openInnerWebTauriPanel,
  repositionInnerWebTauriPanel,
  reloadInnerWebTauriPanel,
  type InnerWebPanelRect,
} from '@/lib/platform/inner-web-tauri';
import { isTauri } from '@/lib/platform/detect';
import {
  buildInnerWebDocumentProxyUrl,
  createInnerWebProxySession,
  deleteInnerWebProxySession,
  shouldUseInnerWebDocumentProxy,
} from '@/lib/http/inner-web-proxy-session';
import { setActiveWebProxySessionId } from '@/lib/platform/inner-web';
import { isInnerWebPanelMaskVisible } from '@/lib/platform/inner-web-panel-overlay';
import type { ResolvedInnerWebPresentation } from '@/lib/platform/inner-web-presentation';
import {
  injectInnerWebBaseTag,
  shouldUseInnerWebSrcdoc,
} from '@/lib/platform/inner-web-document-html';
import { InnerWebHeader } from '@/components/inner-web/InnerWebHeader';
import { useInnerWebDrawerClosing } from '@/components/inner-web/InnerWebDrawerShell';
import { LoaderIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';

const INNER_WEB_YUEDU_CHANNEL = 'reader-inner-web-yuedu';

/** Legado「一键导入」yuedu:// → postMessage 宿主；仅内嵌 data: HTML iframe 可注入 */
function injectYueduBooksourceBridge(frame: HTMLIFrameElement): void {
  try {
    const doc = frame.contentDocument;
    const root = doc?.documentElement;
    if (!root || doc.getElementById('reader-yuedu-import-bridge')) return;
    const s = doc.createElement('script');
    s.id = 'reader-yuedu-import-bridge';
    const ch = INNER_WEB_YUEDU_CHANNEL;
    s.textContent =
      "(function(){if(document.documentElement.dataset.readerYuedu)return;document.documentElement.dataset.readerYuedu='1';" +
      "function decode(h){if(!h||h.indexOf('yuedu:')!==0)return null;var q=h.indexOf('?');if(q<0)return null;try{return new URLSearchParams(h.slice(q+1)).get('src')}catch(_){return null}}" +
      `document.addEventListener('click',function(e){var g=e.target,a=g&&g.closest&&g.closest('a[href^="yuedu:"]');if(!a)return;var raw=a.getAttribute('href')||a.href;var src=decode(raw);if(!src||src.indexOf('http')!==0)return;e.preventDefault();e.stopPropagation();if(window.parent&&window.parent!==window)window.parent.postMessage({channel:'${ch}',src:src},'*')},true);` +
      '})();';
    root.appendChild(s);
  } catch {
    /* ignore */
  }
}

export interface InnerWebPageProps {
  /** 关闭动画 / dismiss 期间可能短暂为 null */
  payload: InnerWebPayload | null | undefined;
  /** 展示配置（drawer 时控制顶栏与高度） */
  resolved?: ResolvedInnerWebPresentation;
}

function measureContentRect(el: HTMLElement): InnerWebPanelRect {
  const r = el.getBoundingClientRect();
  return {
    x: r.left,
    y: r.top,
    width: r.width,
    height: r.height,
  };
}

export function InnerWebPage(props: InnerWebPageProps) {
  const payload = () => props.payload ?? null;
  /** 挂载时的 payload，供 √ 确认与标题在 teardown 期间使用 */
  const snap = props.payload;
  const content = () => {
    const p = payload();
    return { url: p?.url, html: p?.html };
  };
  const panelMode = createMemo(() => useInnerWebTauriPanel(content()));
  const iframeMode = createMemo(() => useInnerWebIframe(content()));
  const pageUrl = () => payload()?.url?.trim() ?? '';
  const initialCookies = () => payload()?.initialCookies?.trim() ?? '';
  const isLoading = () => Boolean(payload()?.loading);
  const [proxyFailed, setProxyFailed] = createSignal(false);
  const [iframeSrc, setIframeSrc] = createSignal<string | undefined>();
  const useHtmlContent = () => {
    const p = payload();
    if (!p) return false;
    return shouldUseInnerWebSrcdoc(pageUrl(), p.html, {
      useProxyDocument: p.useProxyDocument,
      proxyFailed: proxyFailed(),
    });
  };
  /** 代理 doc 就绪前禁止回退到书源直连 URL */
  const iframeDocumentSrc = () => {
    const src = iframeSrc();
    if (src) return src;
    const p = payload();
    if (!p || (p.useProxyDocument && !proxyFailed())) return undefined;
    const url = pageUrl();
    return url.startsWith('http') ? url : undefined;
  };
  const embeddedHtml = () => {
    const p = payload();
    if (!p) return '';
    const html = p.html?.trim() ?? '';
    if (!html) return '';
    return injectInnerWebBaseTag(html, pageUrl());
  };
  const isDrawer = () => props.resolved?.layout === 'drawer';
  const drawerClosing = useInnerWebDrawerClosing();
  /** 代理 doc URL 尚未创建完成（勿因 html 回退缓存提前结束等待） */
  const waitingForProxySrc = () => {
    if (!iframeMode()) return false;
    const p = payload();
    if (!p || !p.useProxyDocument || proxyFailed()) return false;
    return !iframeSrc();
  };
  /** 加载遮罩（不阻止 iframe 挂载，避免 onLoad 无法触发） */
  const showContentLoading = () => {
    if (drawerClosing()) return false;
    if (waitingForProxySrc()) return true;
    return isLoading();
  };
  /** iframe 可挂载：代理 URL 就绪，或 srcdoc，或无代理直连 */
  const canMountIframe = () => {
    if (!iframeMode() || drawerClosing()) return false;
    if (waitingForProxySrc()) return false;
    if (useHtmlContent()) return true;
    if (iframeDocumentSrc()) return true;
    return false;
  };
  const showConfirm = () =>
    props.resolved ? props.resolved.header.showConfirm : Boolean(snap?.showConfirm);
  const showWindowControls = () =>
    props.resolved ? props.resolved.header.showWindowControls : panelMode();

  const [confirmLoading, setConfirmLoading] = createSignal(false);
  const [iframeEl, setIframeEl] = createSignal<HTMLIFrameElement | undefined>();
  const [contentEl, setContentEl] = createSignal<HTMLDivElement | undefined>();
  let webProxySessionId: string | undefined;
  let proxyBootstrapInflightKey: string | null = null;
  let proxyBootstrapReadyKey: string | null = null;

  /** srcdoc iframe：用于校验 yuedu:// postMessage 来源 */
  let yueduBridgeIframe: HTMLIFrameElement | undefined;
  /** 合并短时间内的重复 sync（createEffect 与 payload 更新） */
  let panelSyncInflight: Promise<void> | null = null;
  let panelSyncKey = '';
  let panelSyncGeneration = 0;

  createEffect(() => {
    const url = pageUrl();
    if (!iframeMode() || !url.startsWith('http') || proxyFailed() || iframeSrc()) return;
    const p = payload();
    if (!p) return;
    const cookies = initialCookies();
    const wantProxy =
      Boolean(p.useProxyDocument) ||
      shouldUseInnerWebDocumentProxy(url, cookies);
    if (!wantProxy || !cookies) return;

    const key = `${url}\0${cookies}`;
    if (proxyBootstrapReadyKey === key || proxyBootstrapInflightKey === key) return;
    proxyBootstrapInflightKey = key;

    void (async () => {
      try {
        const sessionId = await createInnerWebProxySession(
          url,
          cookies,
          p.proxyForwardHeaders,
        );
        if (proxyBootstrapInflightKey !== key) {
          void deleteInnerWebProxySession(sessionId);
          return;
        }
        webProxySessionId = sessionId;
        setActiveWebProxySessionId(sessionId);
        setIframeSrc(buildInnerWebDocumentProxyUrl(sessionId, url));
        proxyBootstrapReadyKey = key;
      } catch (e) {
        if (proxyBootstrapInflightKey !== key) return;
        console.warn('[InnerWebPage] 内嵌页文档代理失败，回退 srcdoc/直连', e);
        setProxyFailed(true);
        updateInnerWebPayload({ useProxyDocument: false });
        if (!p.html?.trim()) {
          setIframeSrc(url);
        }
      } finally {
        if (proxyBootstrapInflightKey === key) {
          proxyBootstrapInflightKey = null;
        }
      }
    })();
  });

  const fallbackPanelToIframe = (reason: unknown) => {
    console.warn('[InnerWebPage] 原生内嵌 WebView 不可用，回退 iframe', reason);
    markInnerWebPanelSessionFallback();
    setInnerWebCookiesUseMainWebview(true);
    panelSyncInflight = null;
    panelSyncKey = '';
    void closeInnerWebTauriPanel();
    const url = pageUrl();
    if (url.startsWith('http')) {
      void startInnerWebBridge(url);
    }
  };

  const syncTauriPanel = (rect?: InnerWebPanelRect) => {
    const el = contentEl();
    if (!el || !panelMode()) return;
    const r = rect ?? measureContentRect(el);
    const cookies = initialCookies();
    const nav =
      pageUrl().startsWith('http')
        ? `url:${pageUrl()}`
        : useHtmlContent()
          ? `html:${embeddedHtml().length}`
          : '';
    if (!nav) return;
    const key = `${nav}\0${cookies}\0${r.x},${r.y},${r.width},${r.height}`;
    if (panelSyncInflight && panelSyncKey === key) {
      return panelSyncInflight;
    }
    panelSyncKey = key;
    const generation = ++panelSyncGeneration;

    const job = (async () => {
      try {
        if (pageUrl().startsWith('http')) {
          await openInnerWebTauriPanel({ url: pageUrl(), cookies, rect: r });
        } else if (useHtmlContent()) {
          await openInnerWebTauriPanel({ html: embeddedHtml(), cookies, rect: r });
        } else {
          return;
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            void focusInnerWebTauriPanel();
          });
        });
      } catch (e) {
        if (generation === panelSyncGeneration) {
          fallbackPanelToIframe(e);
        }
      } finally {
        if (generation === panelSyncGeneration) {
          panelSyncInflight = null;
        }
      }
    })();

    panelSyncInflight = job;
    return job;
  };

  const handleRefresh = () => {
    if (panelMode()) {
      void reloadInnerWebTauriPanel();
      return;
    }
    const el = iframeEl();
    if (!el) return;
    void (async () => {
      // 勿在刷新前 pull iframe：document.cookie 可能落后于代理 API 已写入会话的配置
      if (useHtmlContent()) {
        el.srcdoc = embeddedHtml();
      } else if (webProxySessionId) {
        const proxyUrl = buildInnerWebDocumentProxyUrl(webProxySessionId, pageUrl());
        setIframeSrc(proxyUrl);
        el.src = proxyUrl;
      } else if (snap?.url) {
        el.src = snap.url;
      }
    })();
  };

  onMount(() => {
    let resizeObserver: ResizeObserver | undefined;
    let cancelled = false;

    const onRefreshKey = () => handleRefresh();
    window.addEventListener(INNER_WEB_REFRESH_EVENT, onRefreshKey);

    const onYueduBooksourceImport = (ev: MessageEvent) => {
      const d = ev.data as { channel?: string; src?: unknown } | undefined;
      if (!d || d.channel !== INNER_WEB_YUEDU_CHANNEL || typeof d.src !== 'string') return;
      const u = d.src.trim();
      if (!u.startsWith('http')) return;
      if (ev.source !== yueduBridgeIframe?.contentWindow) return;
      suppressLoginDialogDismiss();
      window.dispatchEvent(
        new CustomEvent<ReaderBooksourceImportNetworkDetail>(READER_BOOKSOURCE_IMPORT_NETWORK_EVENT, {
          detail: { url: u },
        })
      );
    };
    window.addEventListener('message', onYueduBooksourceImport);

    if (iframeMode()) {
      setInnerWebCookiesUseMainWebview(true);
      void closeInnerWebTauriPanel();
      if (pageUrl().startsWith('http')) {
        void startInnerWebBridge(pageUrl());
      }
    } else {
      setInnerWebCookiesUseMainWebview(false);
    }

    createEffect(() => {
      if (!panelMode()) return;
      const el = contentEl();
      if (!el) return;
      if (useHtmlContent() && isLoading()) return;
      void syncTauriPanel();
    });

    createEffect(() => {
      if (!panelMode() || !isDrawer() || !drawerClosing()) return;
      void closeInnerWebTauriPanel();
    });

    createEffect(() => {
      const p = payload();
      if (!proxyFailed() || !p?.html?.trim()) return;
      if (p.loading) {
        updateInnerWebPayload({ loading: false });
      }
    });

    if (panelMode()) {
      const attachResizeObserver = () => {
        if (cancelled) return;
        const el = contentEl();
        if (!el) {
          requestAnimationFrame(attachResizeObserver);
          return;
        }
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => {
            void repositionInnerWebTauriPanel(measureContentRect(el));
          });
          resizeObserver.observe(el);
        }
      };
      requestAnimationFrame(attachResizeObserver);
    }

    onCleanup(() => {
      cancelled = true;
      panelSyncInflight = null;
      panelSyncKey = '';
      window.removeEventListener(INNER_WEB_REFRESH_EVENT, onRefreshKey);
      window.removeEventListener('message', onYueduBooksourceImport);
      resizeObserver?.disconnect();
      stopInnerWebBridge();
      proxyBootstrapInflightKey = null;
      proxyBootstrapReadyKey = null;
      if (webProxySessionId) {
        void deleteInnerWebProxySession(webProxySessionId);
        setActiveWebProxySessionId(null);
        webProxySessionId = undefined;
      }
      if (panelMode()) {
        void closeInnerWebTauriPanel();
      }
    });
  });

  const reinjectCookies = async () => {
    const cookies = initialCookies();
    if (!pageUrl().startsWith('http') || !cookies || !isTauri()) return;
    if (panelMode()) {
      await syncTauriPanel();
      return;
    }
    try {
      await invoke<string>('set_cookies_for_inner_web', {
        url: pageUrl(),
        cookies,
        useMainWebview: true,
      });
    } catch (e) {
      console.warn('[InnerWebPage] 重新注入 Cookie 失败', e);
    }
  };

  const handleIframeLoad = (ev: Event) => {
    void reinjectCookies();
    if (!useHtmlContent()) return;
    const el = ev.currentTarget;
    if (el instanceof HTMLIFrameElement) {
      yueduBridgeIframe = el;
      injectYueduBooksourceBridge(el);
    }
  };

  const handleBack = (e?: Event) => {
    e?.preventDefault();
    e?.stopPropagation();
    suppressLoginDialogDismiss();
    cancelInnerWebClose();
  };

  const handleConfirm = async (e?: Event) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (confirmLoading()) return;
    suppressLoginDialogDismiss();
    setConfirmLoading(true);
    try {
      const p = payload() ?? snap;
      await confirmInnerWebClose(p?.cookieSyncUrl ?? p?.url, p?.bookSourceUrl);
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <div
      class={cn(
        'flex min-h-0 w-full flex-col bg-background',
        isDrawer() ? 'h-full' : 'h-dvh',
      )}
    >
      <div class="reader-inner-web-toolbar-host shrink-0">
        <InnerWebHeader
          title={snap?.title ?? '内嵌网页'}
          onBack={handleBack}
          onConfirm={handleConfirm}
          onRefresh={handleRefresh}
          showConfirm={showConfirm()}
          confirmLoading={confirmLoading()}
          showWindowControls={showWindowControls()}
          blurBeforeAction={false}
          pageUrl={pageUrl() || snap?.url}
          cookieSyncUrl={snap?.cookieSyncUrl}
          class={cn(
            isDrawer() && 'reader-inner-web-header--embedded',
            props.resolved?.header.compact && 'reader-inner-web-header--compact',
            props.resolved?.header.class,
          )}
        />
      </div>
      <div
        ref={setContentEl}
        class={cn(
          'relative min-h-0 flex-1',
          drawerClosing() && 'overflow-hidden bg-background',
        )}
      >
        <Show when={showContentLoading()}>
          <div
            class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background"
            role="status"
            aria-live="polite"
          >
            <LoaderIcon class="h-8 w-8 animate-spin text-muted-foreground" />
            <p class="text-sm text-muted-foreground">加载中…</p>
          </div>
        </Show>
        <Show when={panelMode()}>
          <div
            class="absolute inset-0 bg-background"
            classList={{ 'bg-muted/30': isInnerWebPanelMaskVisible() }}
            aria-hidden="true"
          />
          <Show when={isInnerWebPanelMaskVisible()}>
            <div
              class="pointer-events-none absolute inset-0 z-1 flex flex-col items-center justify-center gap-2 bg-muted/40 px-6 text-center"
              role="status"
              aria-live="polite"
            >
              <p class="text-sm font-medium text-foreground">网页已暂时隐藏</p>
              <p class="max-w-xs text-xs text-muted-foreground">
                正在显示菜单或对话框。关闭后将自动恢复浏览。
              </p>
            </div>
          </Show>
        </Show>
        <Show when={canMountIframe()}>
          <Show
            when={useHtmlContent()}
            fallback={
              <Show when={iframeDocumentSrc()}>
                <iframe
                  ref={setIframeEl}
                  class="reader-inner-web-iframe absolute inset-0 h-full w-full border-0 bg-background"
                  title={snap?.title ?? '内嵌网页'}
                  src={iframeDocumentSrc()}
                  allow="fullscreen"
                  referrerpolicy="no-referrer-when-downgrade"
                  onLoad={handleIframeLoad}
                />
              </Show>
            }
          >
            <iframe
              ref={setIframeEl}
              class="reader-inner-web-iframe absolute inset-0 h-full w-full border-0 bg-background"
              title={snap?.title ?? '内嵌网页'}
              srcdoc={embeddedHtml()}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
              onLoad={handleIframeLoad}
            />
          </Show>
        </Show>
      </div>
    </div>
  );
}
