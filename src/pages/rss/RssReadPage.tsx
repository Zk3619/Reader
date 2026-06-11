/**
 * RSS 文章阅读页（WebView 模式，对齐 Legado ReadRssActivity）
 */

import { createSignal, Show, onMount, For } from 'solid-js';
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
import { Button } from '@/components/ui/button';
import { RefreshIcon, StarIcon } from '@/components/shared/icons';
import { RssReadWebView, navigateRssReadWebView } from '@/components/rss/RssReadWebView';
import { READER_BOOKSOURCE_IMPORT_NETWORK_EVENT } from '@/lib/platform/inner-web';
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

function decodeYueduImportUrl(href: string): string | null {
  if (!href.startsWith('yuedu:') && !href.startsWith('legado:')) return null;
  const q = href.indexOf('?');
  if (q < 0) return null;
  try {
    return new URLSearchParams(href.slice(q + 1)).get('src');
  } catch {
    return null;
  }
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

  async function pushEntry(
    source: RssSource,
    article: RssArticle | null,
    opts?: { openUrl?: string; useStartHtml?: boolean },
  ) {
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
      const title = article?.title ?? session.title;
      setStack((prev) => [
        ...prev,
        { source, article, session, title },
      ]);
      if (article?.link) {
        await markRssArticleAsRead(article.link, title);
        window.dispatchEvent(new CustomEvent('rss-articles-refresh'));
      }
    } catch (e) {
      console.error('加载 RSS 阅读会话失败:', e);
      setLoadError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useBackHandler(() => () => {
    const s = stack();
    if (s.length > 1) {
      setStack(s.slice(0, -1));
      return true;
    }
    props.onClose();
    return true;
  });

  onMount(async () => {
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
    const s = stack();
    if (s.length > 1) {
      setStack(s.slice(0, -1));
      setFrameTitle(undefined);
      return;
    }
    props.onClose();
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
    onShowPhoto: (src) => window.open(src, '_blank', 'noopener,noreferrer'),
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

    const action = resolveRssLinkScheme(href);
    if (action.type === 'blocked') return;

    if (action.type === 'import') {
      const src = decodeYueduImportUrl(action.url);
      if (src?.startsWith('http')) {
        window.dispatchEvent(
          new CustomEvent(READER_BOOKSOURCE_IMPORT_NETWORK_EVENT, {
            detail: { url: src },
          }),
        );
      }
      return;
    }

    if (action.type === 'external') {
      window.open(action.url, '_blank', 'noopener,noreferrer');
      return;
    }

    // http(s) 内嵌导航
    const nextUrl = action.url;
    const article = syntheticArticle(source, nextUrl);
    if (props.onOpenArticle && target === '_blank') {
      props.onOpenArticle(source, article);
      return;
    }

    if (source.ruleContent?.trim() && !source.singleUrl) {
      await pushEntry(source, article);
      return;
    }

    navigateRssReadWebView(nextUrl);
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

      <Show when={current()} keyed>
        {(entry) => (
          <RssReadWebView
            source={entry.source}
            session={entry.session}
            class="flex-1"
            onLinkClick={handleLinkClick}
            javaHandlers={javaHandlers()}
            onFrameTitle={(t) => {
              if (t && t !== entry.session.pageUrl) setFrameTitle(t);
            }}
          />
        )}
      </Show>

      <Show when={stack().length > 1}>
        <div class="flex shrink-0 gap-1 overflow-x-auto border-t px-2 py-1 text-xs text-muted-foreground">
          <For each={stack()}>
            {(item, i) => (
              <button
                type="button"
                class="max-w-[8rem] truncate rounded px-2 py-0.5 hover:bg-muted"
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
