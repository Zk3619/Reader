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
import { useBackHandler } from '@/lib/navigation/use-back-handler';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { showAppToast } from '@/components/shared/AppToasts';
import * as rssSourcesDb from '@/lib/database/rss-sources';
import * as rssArticlesDb from '@/lib/database/rss-articles';
import { parseSortUrls, pickDefaultSortEntry } from '@/lib/rss-source/sort-urls';
import { refreshRssArticlesForSource } from '@/lib/rss-source/refresh-articles';
import type { RssArticle, RssSource } from '@/types';
import { RssArticleListItems } from '@/components/rss/RssArticleListItems';
import { RefreshIcon } from '@/components/shared/icons';

export interface RssArticleListPageProps {
  sourceUrl: string;
  initialSortName?: string;
  onClose: () => void;
  onOpenArticle: (source: RssSource, article: RssArticle) => void;
}

export function RssArticleListPage(props: RssArticleListPageProps) {
  const [source, setSource] = createSignal<RssSource | null>(null);
  const [articles, setArticles] = createSignal<RssArticle[]>([]);
  const [sorts, setSorts] = createSignal<{ name: string; url: string }[]>([]);
  const [activeSort, setActiveSort] = createSignal('');
  const [loading, setLoading] = createSignal(true);
  const [refreshing, setRefreshing] = createSignal(false);

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
      const sortList = await parseSortUrls(s);
      setSorts(sortList);
      const defaultEntry = pickDefaultSortEntry(sortList, props.initialSortName);
      setActiveSort(defaultEntry.name);
      await refreshAndLoadArticles(defaultEntry.name, { silent: true });
    } finally {
      setLoading(false);
    }
  }

  async function refreshAndLoadArticles(
    sortName: string,
    options?: { silent?: boolean },
  ): Promise<number> {
    const s = source();
    if (!s) return 0;
    setRefreshing(true);
    try {
      const count = await refreshRssArticlesForSource(s, sortName);
      await loadArticles(sortName);
      if (!options?.silent) {
        showAppToast({ title: '刷新完成', description: `${count} 篇文章` });
      }
      window.dispatchEvent(new CustomEvent('rss-articles-refresh'));
      return count;
    } catch (e) {
      await loadArticles(sortName);
      showAppToast({
        title: '刷新失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
      return 0;
    } finally {
      setRefreshing(false);
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

  const handleRefresh = async () => {
    if (!source() || refreshing() || loading()) return;
    await refreshAndLoadArticles(activeSort());
  };

  const title = createMemo(() => source()?.sourceName ?? '文章列表');

  return (
    <div class="flex h-full min-h-0 flex-1 flex-col">
      <PageHeader
        title={title()}
        onBack={() => props.onClose()}
        actions={[
          {
            icon: RefreshIcon,
            label: '刷新',
            onClick: () => void handleRefresh(),
            disabled: refreshing(),
            iconClass: refreshing() ? 'animate-spin' : undefined,
          },
        ]}
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

      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2">
        <Show when={loading()}>
          <div class="space-y-2 py-4">
            <For each={Array.from({ length: 8 })}>
              {() => <div class="h-16 animate-pulse rounded-lg bg-muted/40" />}
            </For>
          </div>
        </Show>

        <Show when={!loading() && !refreshing() && articles().length === 0}>
          <div class="rounded-2xl border border-border/50 bg-card p-8 text-center text-muted-foreground">
            <p class="mb-4">暂无文章</p>
            <Button disabled={refreshing()} onClick={() => void handleRefresh()}>
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
    </div>
  );
}
