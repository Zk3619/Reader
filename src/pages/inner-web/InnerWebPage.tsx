/**
 * 内嵌网页：专用工具栏 + 内容区
 * - Tauri 桌面 https：主窗口内子 WebView + 专用工具栏（非 iframe）
 * - 纯 Web / data: HTML / 移动端：iframe + postMessage 桥
 */

import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import type { InnerWebPayload } from '@/lib/platform/inner-web';
import {
  cancelInnerWebClose,
  confirmInnerWebClose,
  suppressLoginDialogDismiss,
} from '@/lib/platform/inner-web';
import { startInnerWebBridge, stopInnerWebBridge } from '@/lib/platform/inner-web-bridge';
import { useInnerWebIframe, useInnerWebTauriPanel } from '@/lib/platform/inner-web-mode';
import {
  closeInnerWebTauriPanel,
  focusInnerWebTauriPanel,
  openInnerWebTauriPanel,
  repositionInnerWebTauriPanel,
  reloadInnerWebTauriPanel,
  type InnerWebPanelRect,
} from '@/lib/platform/inner-web-tauri';
import { isTauri } from '@/lib/platform/detect';
import { InnerWebToolbar } from './InnerWebToolbar';

export interface InnerWebPageProps {
  payload: InnerWebPayload;
  onBack: () => void;
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
  /** 挂载时快照，避免卸载/关闭后 props 已清空仍访问 payload */
  const snap = props.payload;
  const panelMode = useInnerWebTauriPanel({ url: snap.url, html: snap.html });
  const iframeMode = useInnerWebIframe({ url: snap.url, html: snap.html });
  const useHtml = Boolean(snap.html?.trim());
  const showConfirm = Boolean(snap.showConfirm);
  const pageUrl = snap.url?.trim() ?? '';

  const [confirmLoading, setConfirmLoading] = createSignal(false);
  const [iframeEl, setIframeEl] = createSignal<HTMLIFrameElement | undefined>();
  const [contentEl, setContentEl] = createSignal<HTMLDivElement | undefined>();

  const syncTauriPanel = async (rect?: InnerWebPanelRect) => {
    const el = contentEl();
    if (!el || !pageUrl.startsWith('http') || !panelMode) return;
    const r = rect ?? measureContentRect(el);
    const cookies = snap.initialCookies?.trim() ?? '';
    try {
      await openInnerWebTauriPanel(pageUrl, cookies, r);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void focusInnerWebTauriPanel();
        });
      });
    } catch (e) {
      console.warn('[InnerWebPage] openInnerWebTauriPanel failed', e);
    }
  };

  onMount(() => {
    let resizeObserver: ResizeObserver | undefined;
    let cancelled = false;

    if (iframeMode && pageUrl.startsWith('http')) {
      void startInnerWebBridge(pageUrl);
    }

    if (panelMode) {
      const attachPanel = () => {
        if (cancelled) return;
        const el = contentEl();
        if (!el) {
          requestAnimationFrame(attachPanel);
          return;
        }
        void syncTauriPanel();
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => {
            void repositionInnerWebTauriPanel(measureContentRect(el));
          });
          resizeObserver.observe(el);
        }
      };
      requestAnimationFrame(attachPanel);
    }

    onCleanup(() => {
      cancelled = true;
      resizeObserver?.disconnect();
      stopInnerWebBridge();
      if (panelMode) {
        void closeInnerWebTauriPanel();
      }
    });
  });

  const reinjectCookies = async () => {
    const cookies = snap.initialCookies?.trim();
    if (!pageUrl.startsWith('http') || !cookies || !isTauri()) return;
    if (panelMode) {
      await syncTauriPanel();
      return;
    }
    try {
      await invoke<string>('set_cookies_for_inner_web', { url: pageUrl, cookies });
    } catch (e) {
      console.warn('[InnerWebPage] 重新注入 Cookie 失败', e);
    }
  };

  const handleIframeLoad = () => {
    void reinjectCookies();
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
      await confirmInnerWebClose(snap.cookieSyncUrl);
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleRefresh = () => {
    if (panelMode) {
      void reloadInnerWebTauriPanel();
      return;
    }
    const el = iframeEl();
    if (!el) return;
    if (useHtml) {
      el.srcdoc = snap.html ?? '';
    } else if (snap.url) {
      el.src = snap.url;
    }
  };

  return (
    <div class="flex h-dvh min-h-0 w-full flex-col bg-background">
      <div class="reader-inner-web-toolbar-host shrink-0">
        <InnerWebToolbar
          title={snap.title}
          onBack={handleBack}
          onConfirm={handleConfirm}
          onRefresh={handleRefresh}
          showConfirm={showConfirm}
          confirmLoading={confirmLoading()}
          showWindowControls={panelMode}
          blurBeforeAction={false}
        />
      </div>
      <div ref={setContentEl} class="relative min-h-0 flex-1">
        <Show when={panelMode}>
          <div class="absolute inset-0 bg-background" aria-hidden="true" />
        </Show>
        <Show when={iframeMode}>
          <Show
            when={useHtml}
            fallback={
              <iframe
                ref={setIframeEl}
                class="reader-inner-web-iframe absolute inset-0 h-full w-full border-0 bg-background"
                title={snap.title}
                src={snap.url}
                allow="fullscreen"
                referrerpolicy="no-referrer-when-downgrade"
                onLoad={handleIframeLoad}
              />
            }
          >
            <iframe
              ref={setIframeEl}
              class="absolute inset-0 h-full w-full border-0 bg-background"
              title={snap.title}
              srcdoc={snap.html}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
              onLoad={handleIframeLoad}
            />
          </Show>
        </Show>
      </div>
    </div>
  );
}
