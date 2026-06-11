/**
 * RSS 阅读 WebView：iframe + Cookie 代理，对齐 Legado ReadRssActivity WebView
 */

import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js';
import type { RssReadSession } from '@/lib/rss-source/rss-read-session';
import type { RssSource } from '@/types';
import {
  RSS_READ_CHANNEL,
  buildRssJavaOpenShim,
  buildRssResourceGuardScript,
  handleRssJavaOpen,
  type RssJavaOpenHandlers,
} from '@/lib/rss-source/rss-java-bridge';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import { installWebJsRpcDispatcher } from '@/lib/rule-engine/webjs-java-rpc';
import { injectInnerWebBaseTag } from '@/lib/platform/inner-web-document-html';
import {
  buildInnerWebDocumentProxyUrl,
  createInnerWebProxySession,
  deleteInnerWebProxySession,
  shouldUseInnerWebDocumentProxy,
} from '@/lib/http/inner-web-proxy-session';
import { injectRssContentImageProxy } from '@/lib/rss-source/rss-html';
import {
  buildRssParentFetchBridgeScript,
  rssContentNeedsSubframeBridge,
} from '@/lib/rss-source/rss-parent-fetch-bridge';
import { buildRssSubframeFetchPatch } from '@/lib/rss-source/rss-subframe-fetch-patch';
import {
  buildRssDataDocumentUrl,
  reviveRssInlineScripts,
  RSS_IMG_CHANNEL,
  shouldUseRssContentSrcdoc,
} from '@/lib/rss-source/rss-content-document';
import { loadRssArticleCoverBlob } from '@/lib/rss-source/rss-cover-image';
import { RSS_FETCH_CHANNEL } from '@/lib/rss-source/rss-parent-fetch-bridge';
import { request } from '@/lib/http';
import { cn } from '@/lib/utils';

function buildRssReadBridgeScript(): string {
  return (
    "(function(){if(document.documentElement.dataset.readerRssBridge)return;" +
    "document.documentElement.dataset.readerRssBridge='1';" +
    `var ch='${RSS_READ_CHANNEL}';` +
    "document.addEventListener('click',function(e){" +
    "var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;" +
    "var raw=a.getAttribute('href')||'';if(!raw||raw.indexOf('javascript:')===0)return;" +
    "if(raw.charAt(0)==='#')return;" +
    "e.preventDefault();e.stopPropagation();" +
    "try{window.parent.postMessage({channel:ch,action:'link',href:a.href,target:a.getAttribute('target')},'*');}catch(_){}" +
    "},true);" +
    "})();"
  );
}

function injectScriptIntoFrame(frame: HTMLIFrameElement, id: string, code: string): void {
  const trimmed = code.trim();
  if (!trimmed) return;
  try {
    const doc = frame.contentDocument;
    if (!doc || doc.getElementById(id)) return;
    const s = doc.createElement('script');
    s.id = id;
    s.textContent = trimmed;
    (doc.head || doc.body || doc.documentElement).appendChild(s);
  } catch {
    /* 跨域 */
  }
}

function wrapRssDocumentHtml(session: RssReadSession): string {
  const base = session.documentBaseUrl ?? session.pageUrl;
  let html = session.html?.trim() ?? '';
  if (!html) return '';
  if (!/<html[\s>]/i.test(html)) {
    html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
  }
  html = injectInnerWebBaseTag(html, base);
  html = injectRssContentImageProxy(html);
  return html;
}

function sessionLoadKey(session: RssReadSession): string {
  return [
    session.mode,
    session.pageUrl,
    session.directUrl ?? '',
    session.documentBaseUrl ?? '',
    session.html?.length ?? 0,
    session.injectJs?.length ?? 0,
    session.contentProxySessionId ?? '',
  ].join('\0');
}

export interface RssReadWebViewProps {
  source: RssSource;
  session: RssReadSession;
  class?: string;
  onLinkClick: (href: string, target?: string | null) => void | Promise<void>;
  onFrameTitle?: (title: string) => void;
  javaHandlers?: RssJavaOpenHandlers;
}

export function RssReadWebView(props: RssReadWebViewProps) {
  const [iframeEl, setIframeEl] = createSignal<HTMLIFrameElement | undefined>();
  const [proxySrc, setProxySrc] = createSignal<string | undefined>();
  const [loading, setLoading] = createSignal(true);
  const [proxyFailed, setProxyFailed] = createSignal(false);
  let proxySessionId: string | undefined;
  let contentProxySessionIdRef: string | undefined;
  let appliedLoadKey = '';
  let loadWatchdog: ReturnType<typeof setTimeout> | undefined;

  const loadKey = createMemo(() => sessionLoadKey(props.session));
  const useHtml = createMemo(() => Boolean(props.session.html?.trim()));
  const pageUrl = createMemo(() => props.session.directUrl ?? props.session.pageUrl);
  const cookies = createMemo(() => props.session.cookies?.trim() ?? '');
  const contentProxyId = createMemo(
    () => props.session.contentProxySessionId ?? contentProxySessionIdRef,
  );

  const embeddedHtml = createMemo(() => {
    if (!useHtml()) return '';
    return wrapRssDocumentHtml(props.session);
  });

  const useSrcdocForContent = createMemo(() => shouldUseRssContentSrcdoc());

  const fetchSubframeHtml = async (url: string): Promise<string> => {
    const trimmed = url.trim();
    const proxyId = contentProxyId();
    const target =
      proxyId && /^https?:/i.test(trimmed)
        ? buildInnerWebDocumentProxyUrl(proxyId, trimmed)
        : trimmed;
    const res = await request(target, {
      headers: props.session.headers,
      enableCookieJar: true,
      timeout: 60_000,
    });
    return res.text();
  };

  const clearLoadWatchdog = () => {
    if (loadWatchdog) {
      clearTimeout(loadWatchdog);
      loadWatchdog = undefined;
    }
  };

  const armLoadWatchdog = () => {
    clearLoadWatchdog();
    loadWatchdog = setTimeout(() => setLoading(false), 20_000);
  };

  const wantProxy = createMemo(() => {
    const url = pageUrl();
    if (useHtml() || !url.startsWith('http') || proxyFailed()) return false;
    const c = cookies();
    return Boolean(c) || shouldUseInnerWebDocumentProxy(url, c);
  });

  const navigateUrl = createMemo(() => {
    if (useHtml()) return undefined;
    const url = pageUrl();
    if (!url.startsWith('http')) return undefined;
    if (wantProxy()) return proxySrc();
    return url;
  });

  /** 须在写入 srcdoc 之前安装，供正文内 ajaxAwait 拉分页 */
  createEffect(() => {
    const book = rssAsBookSource(props.source);
    const baseUrl = props.session.documentBaseUrl ?? props.session.pageUrl;
    const uninstall = installWebJsRpcDispatcher({
      baseUrl,
      source: book,
      headers: props.session.headers,
      cookies: props.session.cookies,
      jsLib: props.source.jsLib,
    });
    onCleanup(uninstall);
  });

  const injectBridgeToFrame = (frame: HTMLIFrameElement) => {
    try {
      const doc = frame.contentDocument;
      if (!doc?.documentElement) return;
      injectScriptIntoFrame(frame, 'reader-rss-java-open', buildRssJavaOpenShim());
      const guard = buildRssResourceGuardScript(props.source);
      if (guard) injectScriptIntoFrame(frame, 'reader-rss-resource-guard', guard);
      injectScriptIntoFrame(frame, 'reader-rss-read-bridge', buildRssReadBridgeScript());
    } catch {
      /* 跨域无法注入 */
    }
  };

  const handleFrameLoad = () => {
    clearLoadWatchdog();
    setLoading(false);
    const frame = iframeEl();
    if (!frame) return;
    injectBridgeToFrame(frame);
    try {
      const doc = frame.contentDocument;
      if (doc && useHtml()) {
        const win = doc.defaultView as (Window & { __READER_RSS_FETCH__?: unknown }) | null;
        if (
          props.session.enableJs !== false &&
          rssContentNeedsSubframeBridge(props.session.html ?? '', true) &&
          !win?.__READER_RSS_FETCH__
        ) {
          injectScriptIntoFrame(frame, 'reader-rss-fetch-bridge', buildRssParentFetchBridgeScript());
          injectScriptIntoFrame(frame, 'reader-rss-iframe-patch', buildRssSubframeFetchPatch());
        }
        const revived = reviveRssInlineScripts(doc);
        if (import.meta.env.DEV && revived > 0) {
          console.info('[RssReadWebView] 复活正文脚本', revived);
        }
      }
    } catch {
      /* ignore */
    }
    if (props.session.enableJs) {
      injectScriptIntoFrame(frame, 'reader-rss-inject-js', props.session.injectJs ?? '');
    }
    try {
      const t = frame.contentDocument?.title?.trim();
      if (t) props.onFrameTitle?.(t);
    } catch {
      /* ignore */
    }
  };

  /** 会话切换：重置代理并拉取 proxy 文档 URL */
  createEffect(() => {
    loadKey();
    const url = pageUrl();
    const c = cookies();
    appliedLoadKey = '';
    setProxySrc(undefined);
    setProxyFailed(false);
    setLoading(true);

    if (useHtml() || !url.startsWith('http') || proxyFailed()) return;

    const needProxy = Boolean(c) || shouldUseInnerWebDocumentProxy(url, c);
    if (!needProxy) return;

    let cancelled = false;
    void (async () => {
      try {
        const sessionId = await createInnerWebProxySession(url, c, props.session.headers);
        if (cancelled) {
          void deleteInnerWebProxySession(sessionId);
          return;
        }
        proxySessionId = sessionId;
        setProxySrc(buildInnerWebDocumentProxyUrl(sessionId, url));
      } catch (e) {
        console.warn('[RssReadWebView] 代理会话失败，回退直连', e);
        if (!cancelled) setProxyFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  });

  /** 仅在 loadKey / 导航 URL 变化时写入 iframe，避免重复 reload 闪烁 */
  createEffect(() => {
    const key = loadKey();
    const frame = iframeEl();
    if (!frame) return;

    if (useHtml()) {
      const html = embeddedHtml();
      if (!html || appliedLoadKey === key) return;
      appliedLoadKey = key;
      frame.removeAttribute('src');
      if (useSrcdocForContent()) {
        frame.removeAttribute('src');
        frame.srcdoc = html;
      } else {
        frame.removeAttribute('srcdoc');
        frame.src = buildRssDataDocumentUrl(html);
      }
      setLoading(true);
      armLoadWatchdog();
      return;
    }

    const url = navigateUrl();
    if (!url || appliedLoadKey === `${key}\0${url}`) return;
    appliedLoadKey = `${key}\0${url}`;
    frame.removeAttribute('srcdoc');
    frame.src = url;
    setLoading(true);
    armLoadWatchdog();
  });

  onMount(() => {
    const onMessage = (ev: MessageEvent) => {
      const d = ev.data as {
        channel?: string;
        action?: string;
        href?: string;
        target?: string;
        name?: string;
        url?: string;
        title?: string;
        origin?: string;
        src?: string;
        id?: string;
        ok?: boolean;
        body?: string;
        error?: string;
      };
      if (!d?.channel) return;
      const frame = iframeEl();

      if (d.channel === RSS_FETCH_CHANNEL && d.id && d.url) {
        void (async () => {
          const target = frame?.contentWindow;
          if (!target) return;
          try {
            const body = await fetchSubframeHtml(String(d.url));
            if (import.meta.env.DEV) {
              console.info('[RssReadWebView] 分页 HTML', {
                url: String(d.url).slice(0, 120),
                length: body.length,
              });
            }
            target.postMessage(
              { channel: RSS_FETCH_CHANNEL, id: d.id, ok: true, body },
              '*',
            );
          } catch (e) {
            console.warn('[RssReadWebView] 分页 HTML 失败', d.url, e);
            target.postMessage(
              {
                channel: RSS_FETCH_CHANNEL,
                id: d.id,
                ok: false,
                error: e instanceof Error ? e.message : String(e),
              },
              '*',
            );
          }
        })();
        return;
      }

      if (d.channel === RSS_IMG_CHANNEL && d.id && d.url) {
        void (async () => {
          const target = frame?.contentWindow;
          if (!target) return;
          try {
            const blobUrl = await loadRssArticleCoverBlob(props.source, String(d.url));
            if (!blobUrl) throw new Error('图片加载失败');
            target.postMessage(
              { channel: RSS_IMG_CHANNEL, id: d.id, ok: true, blobUrl },
              '*',
            );
          } catch (e) {
            if (import.meta.env.DEV) {
              console.warn('[RssReadWebView] 正文图失败', d.url, e);
            }
            target.postMessage(
              {
                channel: RSS_IMG_CHANNEL,
                id: d.id,
                ok: false,
                error: e instanceof Error ? e.message : String(e),
              },
              '*',
            );
          }
        })();
        return;
      }

      if (frame && ev.source !== frame.contentWindow) return;
      if (d.channel !== RSS_READ_CHANNEL) return;

      if (d.action === 'link' && d.href) {
        void props.onLinkClick(d.href, d.target ?? null);
        return;
      }
      if (d.action === 'javaOpen' && d.name && props.javaHandlers) {
        void handleRssJavaOpen(
          props.source,
          props.javaHandlers,
          d.name,
          d.url,
          d.title,
          d.origin,
        );
        return;
      }
      if (d.action === 'showPhoto' && d.src?.trim()) {
        props.javaHandlers?.onShowPhoto?.(d.src.trim(), props.source.sourceUrl);
      }
    };
    window.addEventListener('message', onMessage);

    const navHandler = (ev: Event) => {
      const url = (ev as CustomEvent<{ url: string }>).detail?.url?.trim();
      if (!url) return;
      void navigateTo(url);
    };
    window.addEventListener('reader-rss-read-navigate', navHandler);

    onCleanup(() => {
      clearLoadWatchdog();
      window.removeEventListener('message', onMessage);
      window.removeEventListener('reader-rss-read-navigate', navHandler);
      if (proxySessionId) {
        void deleteInnerWebProxySession(proxySessionId);
        proxySessionId = undefined;
      }
      const proxyId = contentProxySessionIdRef ?? props.session.contentProxySessionId;
      if (proxyId) {
        void deleteInnerWebProxySession(proxyId);
        contentProxySessionIdRef = undefined;
      }
    });
  });

  createEffect(() => {
    contentProxySessionIdRef = props.session.contentProxySessionId;
  });

  const navigateTo = async (url: string) => {
    const frame = iframeEl();
    if (!frame) return;
    setLoading(true);
    appliedLoadKey = '';

    const c = cookies();
    const headers = props.session.headers;
    const needProxy =
      !proxyFailed() &&
      (Boolean(c) || shouldUseInnerWebDocumentProxy(url, c));

    if (needProxy && c) {
      try {
        if (proxySessionId) await deleteInnerWebProxySession(proxySessionId);
        const sessionId = await createInnerWebProxySession(url, c, headers);
        proxySessionId = sessionId;
        const proxyUrl = buildInnerWebDocumentProxyUrl(sessionId, url);
        setProxySrc(proxyUrl);
        frame.removeAttribute('srcdoc');
        frame.src = proxyUrl;
        appliedLoadKey = `nav\0${url}\0${proxyUrl}`;
      } catch {
        frame.src = url;
        appliedLoadKey = `nav\0${url}`;
      }
      armLoadWatchdog();
      return;
    }

    frame.removeAttribute('srcdoc');
    frame.src = url;
    appliedLoadKey = `nav\0${url}`;
    armLoadWatchdog();
  };

  return (
    <div class={cn('relative min-h-0 flex-1', props.class)}>
      <Show when={loading()}>
        <div class="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <div
            class="size-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
            role="status"
            aria-label="加载中"
          />
        </div>
      </Show>
      <iframe
        ref={setIframeEl}
        class="h-full w-full border-0 bg-background"
        title={props.session.title}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onLoad={handleFrameLoad}
      />
    </div>
  );
}

/** 通知当前 RssReadWebView 导航到 URL */
export function navigateRssReadWebView(url: string): void {
  window.dispatchEvent(new CustomEvent('reader-rss-read-navigate', { detail: { url } }));
}
