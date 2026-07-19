/**
 * RSS 文章阅读页（WebView 模式，对齐 Legado ReadRssActivity）
 */

import { createSignal, Show, onMount, onCleanup, For } from 'solid-js';
import { useBackHandler } from '@/lib/navigation/use-back-handler';
import { PageHeader } from '@/components/shell/PageHeader';
import {
  prepareRssReadSession,
  type RssReadSession,
} from '@/lib/rss-source/rss-read-session';
import {
  evalRssShouldOverrideUrlLoading,
  resolveRssLinkScheme,
} from '@/lib/rss-source/rss-url-loading';
import { markRssArticleAsRead } from '@/lib/database/rss-read-records';
import * as rssStarsDb from '@/lib/database/rss-stars';
import type { RssArticle, RssSource } from '@/types';
import { showAppToast } from '@/components/shared/AppToasts';
import { openRssExternalLink, openRssUrlInInnerWeb } from '@/lib/rss-source/rss-inner-web';
import { onInnerWebDismissed, cancelInnerWebClose, isInnerWebSessionActive } from '@/lib/platform/inner-web';
import { Button } from '@/components/ui/button';
import { RefreshIcon, StarIcon } from '@/components/shared/icons';
import { RssReadWebView } from '@/components/media/reader/rss/RssReadWebView';
import { handleReaderImportDeepLink } from '@/lib/platform/legado-import-uri';
import type { RssJavaOpenHandlers } from '@/lib/rss-source/rss-java-bridge';

export interface RssReadPageProps {
  source: RssSource;
  /** 文章阅读；无文章时走 singleUrl / startHtml */
  article?: RssArticle | null;
  /** 对齐 Legado openUrl 参数 */
  openUrl?: string;
  /** 强制 startHtml 模式 */
  useStartHtml?: boolean;
  onClose: () => void;
  /** 栈式打开子文章（同 singleTop 源内导航） */
  onOpenArticle?: (source: RssSource, article: RssArticle) => void;
  onOpenLogin?: (source: RssSource) => void | Promise<void>;
  onOpenSort?: (source: RssSource, sortName?: string, sortUrl?: string) => void;
  onOpenSearch?: (keyword: string) => void;
}

interface ReadStackEntry {
  source: RssSource;
  article: RssArticle | null;
  session: RssReadSession;
  title: string;
}

function syntheticArticle(source: RssSource, link: string, title?: string): RssArticle {
  return {
    origin: source.sourceUrl,
    link,
    title: title ?? link,
    sort: '',
    order: 0,
    group: '默认分组',
    read: false,
    type: source.type ?? 0,
    durPos: 0,
  };
}

export function RssReadPage(props: RssReadPageProps) {
  const [stack, setStack] = createSignal<ReadStackEntry[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [starred, setStarred] = createSignal(false);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  /** iframe 标题单独更新，避免改 stack 导致 WebView 重挂载 */
  const [frameTitle, setFrameTitle] = createSignal<string | undefined>();

  const current = () => {
    const s = stack();
    return s.length > 0 ? s[s.length - 1]! : null;
  };

  /** url 模式外链已交给 InnerWeb；关闭 InnerWeb 后应退出阅读页 */
  const [urlDelegatedToInnerWeb, setUrlDelegatedToInnerWeb] = createSignal(false);

  /** 丢弃过期 pushEntry（StrictMode 双挂载 / 快速切换文章） */
  let loadSeq = 0;
  let loadAbort: AbortController | null = null;
  let autoCloseOnInnerWebDismiss = false;

  const isLoadCurrent = (seq: number, signal: AbortSignal) =>
    seq === loadSeq && !signal.aborted;

  async function pushEntry(
    source: RssSource,
    article: RssArticle | null,
    opts?: { openUrl?: string; useStartHtml?: boolean },
  ) {
    loadAbort?.abort();
    const controller = new AbortController();
    loadAbort = controller;
    const seq = ++loadSeq;

    setLoading(true);
    setLoadError(null);
    setFrameTitle(undefined);
    try {
      const session = await prepareRssReadSession({
        source,
        article,
        openUrl: opts?.openUrl,
        useStartHtml: opts?.useStartHtml,
      });
      if (!isLoadCurrent(seq, controller.signal)) return;

      const title = article?.title ?? session.title;
      setStack((prev) => [
        ...prev,
        { source, article, session, title },
      ]);

      if (session.mode === 'url' && session.directUrl?.startsWith('http')) {
        const openResult = await openRssUrlInInnerWeb(source, session.directUrl, {
          title,
          cookies: session.cookies,
          headers: session.headers,
          onUnavailable: 'iframe',
        });
        if (!isLoadCurrent(seq, controller.signal)) return;

        if (openResult === 'inner-web') {
          autoCloseOnInnerWebDismiss = true;
          setUrlDelegatedToInnerWeb(true);
        } else {
          autoCloseOnInnerWebDismiss = false;
          setUrlDelegatedToInnerWeb(false);
          if (openResult === 'browser') {
            if (stack().length <= 1) {
              props.onClose();
              return;
            }
            setStack((s) => s.slice(0, -1));
            return;
          }
        }
      } else {
        autoCloseOnInnerWebDismiss = false;
        setUrlDelegatedToInnerWeb(false);
      }

      if (article?.link) {
        await markRssArticleAsRead(article.link, title);
        if (!isLoadCurrent(seq, controller.signal)) return;
        window.dispatchEvent(new CustomEvent('rss-articles-refresh'));
      }
    } catch (e) {
      if (!isLoadCurrent(seq, controller.signal)) return;
      console.error('加载 RSS 阅读会话失败:', e);
      setLoadError(e instanceof Error ? e.message : '加载失败');
    } finally {
      if (isLoadCurrent(seq, controller.signal)) {
        setLoading(false);
      }
    }
  }

  onCleanup(() => {
    loadAbort?.abort();
    loadAbort = null;
    loadSeq += 1;
  });

  const popReadStackOrClose = () => {
    const s = stack();
    if (s.length > 1) {
      setStack(s.slice(0, -1));
      setFrameTitle(undefined);
      return;
    }
    props.onClose();
  };

  const handleReadBack = () => {
    if (autoCloseOnInnerWebDismiss && isInnerWebSessionActive()) {
      cancelInnerWebClose();
      return;
    }
    popReadStackOrClose();
  };

  useBackHandler(() => () => {
    handleReadBack();
    return true;
  });

  onMount(async () => {
    const offInnerWebDismiss = onInnerWebDismissed(() => {
      if (!autoCloseOnInnerWebDismiss) return;
      autoCloseOnInnerWebDismiss = false;
      setUrlDelegatedToInnerWeb(false);
      popReadStackOrClose();
    });

    onCleanup(offInnerWebDismiss);

    const article = props.article ?? null;
    if (article?.link) {
      const existing = await rssStarsDb.getRssStar(article.origin, article.link);
      setStarred(!!existing);
    }
    await pushEntry(props.source, article, {
      openUrl: props.openUrl,
      useStartHtml: props.useStartHtml,
    });
  });

  const handleBack = () => {
    handleReadBack();
  };

  const headerTitle = () => {
    const entry = current();
    return frameTitle() ?? entry?.title ?? props.article?.title ?? props.source.sourceName;
  };

  const refreshCurrent = async () => {
    const entry = current();
    if (!entry) return;
    const { source, article } = entry;
    setStack((s) => s.slice(0, -1));
    await pushEntry(source, article);
  };

  const openExternalInInnerWeb = async (
    url: string,
    title?: string,
    session?: ReadStackEntry['session'],
  ) => {
    const entry = current();
    const source = entry?.source ?? props.source;
    const sess = session ?? entry?.session;
    await openRssExternalLink(source, url, {
      title: title ?? entry?.title,
      cookies: sess?.cookies,
      headers: sess?.headers,
      onUnavailable: 'browser',
    });
  };

  const showRssWebView = () => {
    const entry = current();
    if (!entry) return false;
    if (entry.session.mode !== 'url') return true;
    return !urlDelegatedToInnerWeb();
  };

  const webViewEntry = () => {
    const entry = current();
    if (!entry || !showRssWebView()) return null;
    return entry;
  };

  const javaHandlers = (): RssJavaOpenHandlers => ({
    onOpenLogin: (s) => props.onOpenLogin?.(s),
    onOpenSort: (s, sortName) => props.onOpenSort?.(s, sortName),
    onOpenRss: (s, url, title) => {
      if (!url?.trim()) {
        if (s.singleUrl) {
          void pushEntry(s, syntheticArticle(s, s.sourceUrl, title ?? s.sourceName));
        } else if (s.startHtml?.trim()) {
          void pushEntry(s, null, { useStartHtml: true });
        } else {
          props.onOpenSort?.(s);
        }
        return;
      }
      const article = syntheticArticle(s, url, title);
      if (props.onOpenArticle) {
        props.onOpenArticle(s, article);
      } else {
        void pushEntry(s, article);
      }
    },
    onOpenSearch: (kw) => props.onOpenSearch?.(kw),
    onShowPhoto: (src) => void openExternalInInnerWeb(src),
  });

  const toggleStar = async () => {
    const entry = current();
    const a = entry?.article ?? props.article;
    if (!a?.link) {
      showAppToast({ title: '当前页无法收藏', variant: 'destructive' });
      return;
    }
    if (starred()) {
      await rssStarsDb.deleteRssStar(a.origin, a.link);
      setStarred(false);
      showAppToast({ title: '已取消收藏' });
    } else {
      await rssStarsDb.insertRssStar({
        ...a,
        starTime: Date.now(),
        group: a.group || '默认分组',
      });
      setStarred(true);
      showAppToast({ title: '已收藏' });
    }
  };

  const handleLinkClick = async (href: string, target?: string | null) => {
    const entry = current();
    if (!entry) return;
    const { source, session } = entry;
    const baseUrl = session.documentBaseUrl ?? session.pageUrl;

    const intercepted = await evalRssShouldOverrideUrlLoading(
      { source, baseUrl },
      href,
    );
    if (intercepted) return;

    const action = resolveRssLinkScheme(href, baseUrl);
    if (action.type === 'blocked') {
      showAppToast({ title: '无法打开链接', variant: 'destructive' });
      return;
    }

    if (action.type === 'import') {
      await handleReaderImportDeepLink(action.url);
      return;
    }

    if (action.type === 'external') {
      await openExternalInInnerWeb(action.url);
      return;
    }

    // http(s) 内嵌导航
    const nextUrl = action.url;
    const article = syntheticArticle(source, nextUrl);
    if (target === '_blank') {
      await openExternalInInnerWeb(nextUrl, article.title, session);
      return;
    }

    if (source.ruleContent?.trim() && !source.singleUrl) {
      await pushEntry(source, article);
      return;
    }

    // 无 ruleContent 的外链：InnerWeb 打开，避免 RSS iframe 跨域受限
    await openExternalInInnerWeb(nextUrl, article.title, session);
  };

  return (
    <div class="relative flex h-full min-h-0 flex-1 flex-col">
      <PageHeader
        title={headerTitle()}
        onBack={handleBack}
        actions={[
          {
            icon: RefreshIcon,
            label: '刷新',
            onClick: () => void refreshCurrent(),
          },
          {
            icon: StarIcon,
            label: starred() ? '取消收藏' : '收藏',
            onClick: () => void toggleStar(),
            iconClass: starred() ? 'fill-primary text-primary' : undefined,
          },
        ]}
      />

      <Show when={loading()}>
        <div class="pointer-events-none absolute inset-x-0 top-12 bottom-0 z-20 flex items-center justify-center bg-background/70">
          <span class="text-muted-foreground">加载中…</span>
        </div>
      </Show>

      <Show when={loadError()}>
        <div class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center text-muted-foreground">
          <p>{loadError()}</p>
          <Button variant="outline" onClick={() => window.open(props.article?.link ?? props.source.sourceUrl, '_blank')}>
            在浏览器中打开
          </Button>
        </div>
      </Show>

      <Show when={webViewEntry()} keyed>
        {(entry) => (
          <RssReadWebView
            source={entry.source}
            session={entry.session}
            class="flex-1"
            onLinkClick={handleLinkClick}
            onOpenExternal={(url) => openExternalInInnerWeb(url, undefined, entry.session)}
            javaHandlers={javaHandlers()}
            onFrameTitle={(t) => {
              if (t && t !== entry.session.pageUrl) setFrameTitle(t);
            }}
          />
        )}
      </Show>

      <Show when={current()?.session.mode === 'url' && urlDelegatedToInnerWeb()}>
        <div class="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
          <p>正在内嵌页中阅读…</p>
        </div>
      </Show>

      <Show when={stack().length > 1}>
        <div class="flex shrink-0 gap-1 overflow-x-auto border-t px-2 py-1 text-xs text-muted-foreground">
          <For each={stack()}>
            {(item, i) => (
              <button
                type="button"
                class="max-w-32 truncate rounded px-2 py-0.5 hover:bg-muted"
                classList={{ 'bg-muted font-medium text-foreground': i() === stack().length - 1 }}
                onClick={() => setStack(stack().slice(0, i() + 1))}
              >
                {item.title.slice(0, 40)}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
