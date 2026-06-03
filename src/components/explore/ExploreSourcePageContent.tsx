/**
 * 发现书籍列表内容区（无页头），供 ExploreSourcePage 复用
 */

import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  Show,
  onMount,
} from 'solid-js';
import { VirtualExploreBookGrid } from '@/components/explore/VirtualExploreBookGrid';
import {
  ExploreBookGridProvider,
  renderExploreBookGridCell,
  type ExploreBookGridContextValue,
} from '@/components/explore/ExploreBookGridContext';
import { createExploreBooksStore } from '@/components/explore/explore-books-store';
import { clearCoverSession } from '@/lib/http/cover-session';
import { Button } from '@/components/ui/button';
import { exploreBook } from '@/lib/book-source/explore';
import { isAbortError } from '@/lib/http';
import { searchBookToEphemeralBook } from '@/lib/bookshelf/book-to-search-book';
import type { BookSource } from '@/types';
import type { Book, SearchBook } from '@/types';
import type { ExploreSection } from '@/lib/book-source/explore-sections';
import { cn } from '@/lib/utils';
import { mainShellPageScroll } from '@/lib/ui/viewport-classes';
import { ExploreBookListSkeleton } from '@/components/explore/ExploreBookCardSkeleton';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  explorePaginationPreference,
  initExplorePaginationPreference,
} from '@/stores/explore-pagination-preference';
import { pageCacheStore } from '@/stores/page-cache';

export type { PaginationPreference } from '@/stores/explore-pagination-preference';
export { EXPLORE_PAGINATION_PREFERENCE_KEY } from '@/stores/explore-pagination-preference';

function readExplorePageCache(
  source: BookSource,
  sectionUrl: string,
  refreshKey: number,
) {
  if (refreshKey !== 0 || !sectionUrl) return null;
  const cacheSourceId = source.sourceId || source.sourceName;
  if (!cacheSourceId || typeof cacheSourceId !== 'string') return null;
  return pageCacheStore.getExploreCache(cacheSourceId, sectionUrl);
}

function buildListFetchKey(sectionUrl: string, refreshKey: number) {
  return `${sectionUrl}\0${refreshKey}`;
}

export interface ExploreSourcePageContentProps {
  source: BookSource;
  section: ExploreSection;
  /** 变更时触发重新加载 */
  refreshKey?: number;
  onOpenBook: (book: Book) => void;
  onOpenBookInfo?: (source: BookSource, book: SearchBook) => void;
  class?: string;
  /** 书籍网格滚动区 class；默认 mainShellPageScroll（移动壳层有底栏；桌面无底栏时由 App.css 加末尾留白） */
  listScrollClass?: string;
}

export function ExploreSourcePageContent(props: ExploreSourcePageContentProps) {
  const initialSectionUrl = props.section.url ?? '';
  const initialRefreshKey = props.refreshKey ?? 0;
  const initialFetchKey = buildListFetchKey(initialSectionUrl, initialRefreshKey);
  const initialCache = readExplorePageCache(props.source, initialSectionUrl, initialRefreshKey);

  const exploreBooks = createExploreBooksStore();
  if (initialCache) {
    exploreBooks.replaceAll(initialCache.allBooks);
  }

  const [page, setPage] = createSignal(initialCache?.page ?? 1);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(initialCache?.hasMore !== false);
  const sectionUrl = () => props.section.url ?? '';
  const hasPagination = () => sectionUrl().includes('{{page}}') || sectionUrl().includes('{page}');
  const useScrollLoad = () => explorePaginationPreference() === 'scroll';
  const refreshKey = () => props.refreshKey ?? 0;

  /** 当前分类列表请求标识；切换分类时变更，用于丢弃过期响应 */
  const listFetchKey = () => buildListFetchKey(sectionUrl(), refreshKey());

  const [committedFetchKey, setCommittedFetchKey] = createSignal<string | null>(
    initialCache ? initialFetchKey : null,
  );

  let loadMoreAbort: AbortController | null = null;

  const isFetchKeyCurrent = (fetchKey: string) => listFetchKey() === fetchKey;

  const abortLoadMore = () => {
    loadMoreAbort?.abort();
    loadMoreAbort = null;
  };

  createEffect(() => {
    const fetchKey = listFetchKey();
    abortLoadMore();
    clearCoverSession();

    const cached = readExplorePageCache(props.source, sectionUrl(), refreshKey());
    if (cached) {
      exploreBooks.replaceAll(cached.allBooks);
      setPage(cached.page);
      setHasMore(cached.hasMore !== false);
      setCommittedFetchKey(fetchKey);
      return;
    }

    setPage(1);
    exploreBooks.clear();
    setHasMore(true);
    setCommittedFetchKey(null);
  });

  onCleanup(() => {
    abortLoadMore();
  });

  const [firstPageResource] = createResource(
    () => ({
      source: props.source,
      sectionUrl: sectionUrl(),
      refreshKey: refreshKey(),
      sectionTitle: props.section.title,
      fetchKey: listFetchKey(),
    }),
    async ({ source, sectionUrl, refreshKey: rk, fetchKey }) => {
      if (!sectionUrl) return [];

      const controller = new AbortController();
      onCleanup(() => controller.abort());

      const cached = readExplorePageCache(source, sectionUrl, rk);
      const cacheSourceId = (source.sourceId || source.sourceName) as string | undefined;

      if (cached && rk === 0) {
        if (!isFetchKeyCurrent(fetchKey)) return [];
        exploreBooks.replaceAll(cached.allBooks);
        setPage(cached.page);
        setHasMore(cached.hasMore !== false);
        setCommittedFetchKey(fetchKey);
        return cached.books;
      }

      try {
        const list = await exploreBook(source, 1, sectionUrl, { signal: controller.signal });
        if (!isFetchKeyCurrent(fetchKey)) return [];

        exploreBooks.replaceAll(list);
        setCommittedFetchKey(fetchKey);

        if (cacheSourceId) {
          pageCacheStore.setExploreCache(cacheSourceId, sectionUrl, list, 1, list, true);
        }

        return list;
      } catch (e) {
        if (isAbortError(e)) return [];
        throw e;
      }
    },
  );

  const books = createMemo(() => {
    if (committedFetchKey() !== listFetchKey()) return [];
    return exploreBooks.orderedBooks();
  });

  /** fetchKey 已提交即可展示（含挂载/切换时从页缓存同步灌入 store），避免重进时骨架屏 */
  const loading = createMemo(() => committedFetchKey() !== listFetchKey());

  const error = () =>
    committedFetchKey() === listFetchKey() ? firstPageResource.error : undefined;

  onMount(() => void initExplorePaginationPreference());

  const clearCacheAndReload = () => {
    const cacheSourceId = props.source.sourceId || props.source.sourceName;
    if (cacheSourceId && typeof cacheSourceId === 'string') {
      pageCacheStore.clearExploreCache(cacheSourceId, sectionUrl());
    }
    setPage(1);
    setHasMore(true);
  };

  const loadMore = async () => {
    if (!hasPagination() || loadingMore() || !hasMore()) return;
    const fetchKeyAtStart = listFetchKey();
    abortLoadMore();
    const controller = new AbortController();
    loadMoreAbort = controller;
    const next = page() + 1;
    const cacheSourceId = props.source.sourceId || props.source.sourceName;
    setLoadingMore(true);
    try {
      const list = await exploreBook(props.source, next, sectionUrl(), {
        signal: controller.signal,
      });
      if (!isFetchKeyCurrent(fetchKeyAtStart) || controller.signal.aborted) return;
      exploreBooks.appendAll(list);
      setPage(next);

      if (list.length === 0) {
        setHasMore(false);
        if (cacheSourceId && typeof cacheSourceId === 'string') {
          pageCacheStore.updateExploreCache(cacheSourceId, sectionUrl(), (cache) => ({
            ...cache,
            hasMore: false,
            timestamp: Date.now(),
          }));
        }
      } else if (cacheSourceId && typeof cacheSourceId === 'string') {
        const updatedBooks = exploreBooks.orderedBooks();
        pageCacheStore.updateExploreCache(cacheSourceId, sectionUrl(), (cache) => ({
          ...cache,
          allBooks: [...updatedBooks],
          page: next,
          hasMore: true,
          timestamp: Date.now(),
        }));
      }
    } catch (e) {
      if (isAbortError(e)) return;
      console.error('加载更多失败:', e);
      showAppToast({ title: '加载失败', description: String(e), variant: 'destructive' });
    } finally {
      if (loadMoreAbort === controller) {
        loadMoreAbort = null;
      }
      setLoadingMore(false);
    }
  };

  let lastScrollTopForLoadMore = 0;
  const handleContentScroll = (el: HTMLDivElement) => {
    const top = el.scrollTop;
    const scrollTopMoved = top !== lastScrollTopForLoadMore;
    lastScrollTopForLoadMore = top;
    if (!useScrollLoad() || !hasPagination() || loadingMore() || !hasMore()) return;
    if (!scrollTopMoved) return;
    const distanceToBottom = el.scrollHeight - top - el.clientHeight;
    if (distanceToBottom < 100) {
      loadMore();
    }
  };

  const exploreGridCtx = createMemo<ExploreBookGridContextValue>(() => ({
    store: exploreBooks,
    source: props.source,
    onOpen: (sb: SearchBook) => {
      if (props.onOpenBookInfo) {
        props.onOpenBookInfo(props.source, sb);
      } else {
        props.onOpenBook(searchBookToEphemeralBook(sb));
      }
    },
    onCoverUrlRefreshed: exploreBooks.patchCoverUrl,
  }));

  const scrollListFooter = createMemo(() => {
    if (!hasPagination() || !useScrollLoad() || books().length === 0) return undefined;
    if (!loadingMore() && hasMore()) return undefined;
    return (
      <div class="py-4 text-center text-sm text-muted-foreground">
        <Show when={loadingMore()} fallback="没有更多了">
          加载中…
        </Show>
      </div>
    );
  });

  return (
    <div class={cn('flex h-full min-h-0 flex-1 flex-col overflow-hidden my-1', props.class)}>
      <Show when={loading()}>
        <div class={cn(mainShellPageScroll, 'min-h-0 flex-1')}>
          <ExploreBookListSkeleton />
        </div>
      </Show>

      <Show when={error()}>
        <div class="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-6">
          <div class="mb-4 text-center text-sm text-destructive">
            <p class="mb-1 font-medium">加载失败</p>
            <p class="wrap-break-word text-xs text-destructive/80">{String(error())}</p>
          </div>
          <div class="flex justify-center">
            <Button variant="outline" size="sm" onClick={clearCacheAndReload}>
              刷新重试
            </Button>
          </div>
        </div>
      </Show>

      <Show when={!loading() && !error() && books().length === 0}>
        <div class="rounded-xl border border-border/50 bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
          该分类下暂无书籍
        </div>
      </Show>

      <Show when={!loading() && !error() && books().length > 0}>
        <ExploreBookGridProvider value={exploreGridCtx()}>
          <VirtualExploreBookGrid
            class={cn(props.listScrollClass ?? mainShellPageScroll, 'min-h-0 flex-1')}
            items={books}
            onScroll={handleContentScroll}
            getItemKey={(sb) => sb.bookUrl}
            renderEntityByKey={renderExploreBookGridCell}
            scrollFooter={scrollListFooter()}
          />
        </ExploreBookGridProvider>

        <Show when={hasPagination() && books().length > 0 && !useScrollLoad() && hasMore()}>
          <div class="shrink-0 py-4 flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={loadingMore()}>
              {loadingMore() ? '加载中…' : '加载更多'}
            </Button>
          </div>
        </Show>

        <Show when={hasPagination() && books().length > 0 && !useScrollLoad() && !hasMore()}>
          <div class="shrink-0 py-4 flex justify-center">
            <p class="text-sm text-muted-foreground">没有更多了</p>
          </div>
        </Show>
      </Show>

    </div>
  );
}
