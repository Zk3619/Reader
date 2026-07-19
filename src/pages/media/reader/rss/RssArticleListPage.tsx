/**
 * RSS 文章列表页
 */

import {
  createSignal,
  createMemo,
  onMount,
  onCleanup,
  For,
  Show,
} from 'solid-js';
import {
  createVirtualListScrollCoalesce,
  setCoverLoadScrollIdleProbe,
  VirtualListScrollCoalesceContext,
} from '@/components/shared/virtual-list/virtual-list-scroll-coalesce';
import { useBackHandler } from '@/lib/navigation/use-back-handler';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import type { PageHeaderAction, PageHeaderDropdownItem } from '@/components/shell/PageHeader';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { showAppToast } from '@/components/shared/AppToasts';
import { RssReadHistoryDialog } from '@/components/media/reader/rss/RssReadHistoryDialog';
import * as rssSourcesDb from '@/lib/database/rss-sources';
import * as rssArticlesDb from '@/lib/database/rss-articles';
import {
  clearSortUrlCache,
  parseSortUrls,
  pickDefaultSortEntry,
} from '@/lib/rss-source/sort-urls';
import { isSourceVerificationCancelledError } from '@/lib/book-source/source-verification';
import {
  fetchRssArticlesForSource,
  persistRssArticlesForSource,
} from '@/lib/rss-source/refresh-articles';
import type { RssArticle, RssReadRecord, RssSource } from '@/types';
import { RssArticleListItems } from '@/components/media/reader/rss/RssArticleListItems';
import {
  BookshelfReadProgressIcon,
  FileTextIcon,
  FolderRefreshIcon,
  ListRefreshIcon,
  MoreIcon,
  PencilIcon,
  RefreshIcon,
  TrashIcon,
} from '@/components/shared/icons';

const RSS_ARTICLE_STYLE_LABELS = ['默认布局', '大图布局', '双列布局', '瀑布布局', '三列布局'] as const;

type RefreshKind = 'sort' | 'content' | 'all';

const RSS_OVERLAY_DROPDOWN_Z = 'z-[120]';

export interface RssArticleListPageProps {
  sourceUrl: string;
  initialSortName?: string;
  onClose: () => void;
  onOpenArticle: (source: RssSource, article: RssArticle) => void;
  onSourceEdit?: (source: RssSource) => void;
  onOpenSourceVariables?: (source: RssSource) => void;
  onOpenHistoryRecord?: (record: RssReadRecord) => void;
}

export function RssArticleListPage(props: RssArticleListPageProps) {
  const scrollCoalesce = createVirtualListScrollCoalesce();
  onMount(() => {
    setCoverLoadScrollIdleProbe(() => scrollCoalesce.isScrollIdle());
  });
  onCleanup(() => setCoverLoadScrollIdleProbe(null));

  const [source, setSource] = createSignal<RssSource | null>(null);
  const [articles, setArticles] = createSignal<RssArticle[]>([]);
  const [sorts, setSorts] = createSignal<{ name: string; url: string }[]>([]);
  const [activeSort, setActiveSort] = createSignal('');
  const [loading, setLoading] = createSignal(true);
  const [refreshKind, setRefreshKind] = createSignal<RefreshKind | null>(null);
  const [historyOpen, setHistoryOpen] = createSignal(false);
  const [clearDialogOpen, setClearDialogOpen] = createSignal(false);

  const headerBusy = () => refreshKind() !== null || loading();

  useBackHandler(() => () => {
    props.onClose();
    return true;
  });

  async function loadArticles(sortName: string) {
    const s = source();
    if (!s) return;
    const list = await rssArticlesDb.getRssArticlesByOriginAndSort(s.sourceUrl, sortName);
    setArticles(list);
  }

  async function reloadSorts(s: RssSource, preferredSort?: string): Promise<string> {
    const sortList = await parseSortUrls(s);
    setSorts(sortList);
    const current = activeSort();
    const next =
      preferredSort ??
      (sortList.some((entry) => entry.name === current)
        ? current
        : pickDefaultSortEntry(sortList, props.initialSortName).name);
    setActiveSort(next);
    return next;
  }

  async function init() {
    setLoading(true);
    try {
      const s = await rssSourcesDb.getRssSource(props.sourceUrl);
      if (!s) {
        showAppToast({ title: '订阅源不存在', variant: 'destructive' });
        props.onClose();
        return;
      }
      setSource(s);
      const sortName = await reloadSorts(s, props.initialSortName);
      await refreshAndLoadArticles(sortName, { silent: true });
    } finally {
      setLoading(false);
    }
  }

  function schedulePersistArticles(
    s: RssSource,
    resolvedSort: string,
    fetched: RssArticle[],
  ): void {
    void persistRssArticlesForSource(s, resolvedSort, fetched)
      .then(() => {
        window.dispatchEvent(new CustomEvent('rss-articles-refresh'));
        return loadArticles(resolvedSort);
      })
      .catch((e) => {
        console.error('[RSS] 文章持久化失败', e);
      });
  }

  async function refreshAndLoadArticles(
    sortName: string,
    options?: { silent?: boolean; kind?: RefreshKind },
  ): Promise<number> {
    const s = source();
    if (!s) return 0;
    const kind = options?.kind ?? (options?.silent ? null : 'content');
    if (kind) setRefreshKind(kind);
    try {
      const { articles: fetched, sortName: resolvedSort } =
        await fetchRssArticlesForSource(s, sortName);
      setArticles(fetched);
      schedulePersistArticles(s, resolvedSort, fetched);
      if (!options?.silent) {
        showAppToast({ title: '刷新完成', description: `${fetched.length} 篇文章` });
      }
      return fetched.length;
    } catch (e) {
      if (isSourceVerificationCancelledError(e)) {
        setArticles([]);
        return 0;
      }
      await loadArticles(sortName);
      showAppToast({
        title: '刷新失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
      return 0;
    } finally {
      if (kind) setRefreshKind(null);
    }
  }

  async function handleRefreshSort() {
    const s = source();
    if (!s || headerBusy()) return;
    setRefreshKind('sort');
    try {
      clearSortUrlCache(s);
      const latest = await rssSourcesDb.getRssSource(s.sourceUrl);
      if (!latest) return;
      setSource(latest);
      const sortName = await reloadSorts(latest);
      showAppToast({ title: '分类已刷新' });
      await loadArticles(sortName);
    } catch (e) {
      showAppToast({
        title: '刷新分类失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setRefreshKind(null);
    }
  }

  async function handleRefreshContent() {
    if (!source() || headerBusy()) return;
    await refreshAndLoadArticles(activeSort(), { kind: 'content' });
  }

  async function handleRefreshAll() {
    const s = source();
    if (!s || headerBusy()) return;
    setRefreshKind('all');
    try {
      clearSortUrlCache(s);
      const latest = await rssSourcesDb.getRssSource(s.sourceUrl);
      if (!latest) return;
      setSource(latest);
      const sortName = await reloadSorts(latest);
      const { articles: fetched, sortName: resolvedSort } =
        await fetchRssArticlesForSource(latest, sortName);
      setArticles(fetched);
      schedulePersistArticles(latest, resolvedSort, fetched);
      showAppToast({ title: '刷新完成', description: `${fetched.length} 篇文章` });
    } catch (e) {
      if (isSourceVerificationCancelledError(e)) {
        setArticles([]);
      } else {
        await loadArticles(activeSort());
        showAppToast({
          title: '刷新失败',
          description: e instanceof Error ? e.message : '请稍后重试',
          variant: 'destructive',
        });
      }
    } finally {
      setRefreshKind(null);
    }
  }

  async function handleSetArticleStyle(style: number) {
    const s = source();
    if (!s || s.articleStyle === style) return;
    const updated: RssSource = { ...s, articleStyle: style };
    await rssSourcesDb.updateRssSource(updated);
    setSource(updated);
  }

  async function handleClearArticles() {
    const s = source();
    if (!s) return;
    try {
      await rssArticlesDb.deleteRssArticlesByOrigin(s.sourceUrl);
      setArticles([]);
      setClearDialogOpen(false);
      showAppToast({ title: '已清除内容', description: s.sourceName });
      window.dispatchEvent(new CustomEvent('rss-articles-refresh'));
    } catch (e) {
      showAppToast({
        title: '清除失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  onMount(() => {
    void init();
    const handler = () => {
      const sort = activeSort();
      if (sort != null) void loadArticles(sort);
    };
    window.addEventListener('rss-articles-refresh', handler);
    onCleanup(() => window.removeEventListener('rss-articles-refresh', handler));
  });

  const handleSortChange = async (name: string) => {
    if (name === activeSort()) return;
    setActiveSort(name);
    setLoading(true);
    try {
      await refreshAndLoadArticles(name, { silent: true });
    } finally {
      setLoading(false);
    }
  };

  const showSortBar = createMemo(() => {
    const s = source();
    return Boolean(s?.sortUrl?.trim()) || sorts().length > 1;
  });

  const title = createMemo(() => source()?.sourceName ?? '文章列表');

  const moreDropdownItems = createMemo((): PageHeaderDropdownItem[] => {
    const items: PageHeaderDropdownItem[] = [
      {
        icon: FileTextIcon,
        label: '设置源变量',
        onClick: () => {
          const s = source();
          if (s) props.onOpenSourceVariables?.(s);
        },
      },
      {
        icon: PencilIcon,
        label: '编辑源',
        onClick: () => {
          const s = source();
          if (s) props.onSourceEdit?.(s);
        },
      },
      {
        icon: BookshelfReadProgressIcon,
        label: '阅读记录',
        onClick: () => setHistoryOpen(true),
      },
      {
        icon: TrashIcon,
        label: '清除内容',
        onClick: () => setClearDialogOpen(true),
      },
      { separator: true, separatorOnly: true, label: '' },
    ];
    RSS_ARTICLE_STYLE_LABELS.forEach((label, index) => {
      items.push({
        label,
        radio: {
          selected: () => (source()?.articleStyle ?? 0) === index,
          onSelect: () => void handleSetArticleStyle(index),
        },
      });
    });
    return items;
  });

  const headerActions = createMemo((): PageHeaderAction[] => {
    const busy = headerBusy();
    const spinAll = refreshKind() === 'all' ? 'animate-spin' : undefined;

    return [
      {
        icon: FolderRefreshIcon,
        label: '刷新分类',
        onClick: (): void => {
          void handleRefreshSort();
        },
        disabled: busy,
      },
      {
        icon: ListRefreshIcon,
        label: '刷新内容',
        onClick: (): void => {
          void handleRefreshContent();
        },
        disabled: busy,
      },
      {
        icon: RefreshIcon,
        label: '刷新',
        onClick: (): void => {
          void handleRefreshAll();
        },
        disabled: busy,
        iconClass: spinAll,
      },
      {
        icon: MoreIcon,
        label: '更多',
        isDropdown: true,
        dropdownPortalZClass: RSS_OVERLAY_DROPDOWN_Z,
        dropdownItems: moreDropdownItems(),
      },
    ];
  });

  return (
    <div class="flex h-full min-h-0 flex-1 flex-col">
      <PageHeader
        title={title()}
        onBack={() => props.onClose()}
        actions={headerActions()}
      />

      <Show when={showSortBar()}>
        <div class="shrink-0 border-b border-border/40 bg-muted/20 px-3 py-2">
          <div class="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
            <For each={sorts()}>
              {(sort) => (
                <Button
                  size="sm"
                  class="h-8 shrink-0 rounded-full px-3 text-xs"
                  variant={activeSort() === sort.name ? 'default' : 'outline'}
                  onClick={() => void handleSortChange(sort.name)}
                >
                  {sort.name || '默认'}
                </Button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <VirtualListScrollCoalesceContext.Provider value={scrollCoalesce}>
        <div
          class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2"
          onScroll={() => scrollCoalesce.markScrolling()}
        >
          <Show when={loading()}>
            <div class="space-y-2 py-4">
              <For each={Array.from({ length: 8 })}>
                {() => <div class="h-16 animate-pulse rounded-lg bg-muted/40" />}
              </For>
            </div>
          </Show>

          <Show when={!loading() && refreshKind() === null && articles().length === 0}>
            <div class="rounded-2xl border border-border/50 bg-card p-8 text-center text-muted-foreground">
              <p class="mb-4">暂无文章</p>
              <Button disabled={headerBusy()} onClick={() => void handleRefreshAll()}>
                刷新
              </Button>
            </div>
          </Show>

          <Show when={!loading() && articles().length > 0}>
            <RssArticleListItems
              articles={articles()}
              source={source()!}
              articleStyle={source()?.articleStyle ?? 0}
              onSelect={(article) => {
                const s = source();
                if (s) props.onOpenArticle(s, article);
              }}
            />
          </Show>
        </div>
      </VirtualListScrollCoalesceContext.Provider>

      <RssReadHistoryDialog
        open={historyOpen()}
        onOpenChange={setHistoryOpen}
        origin={source()?.sourceUrl}
        onOpenRecord={props.onOpenHistoryRecord}
      />

      <AppDialog open={clearDialogOpen()} onOpenChange={setClearDialogOpen} modal>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>清除内容</AppDialogTitle>
            <AppDialogDescription>
              将清除「{source()?.sourceName}」的全部文章缓存，订阅源本身不会删除。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setClearDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void handleClearArticles()}>
              清除
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
}
