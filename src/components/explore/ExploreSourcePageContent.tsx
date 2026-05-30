/**
 * 发现书籍列表内容区（无页头），供 ScoutPage / ExploreSourcePage 复用
 */

import { createEffect, createResource, createSignal, For, onCleanup, Show, onMount } from 'solid-js';
import { VirtualExploreBookGrid } from '@/components/explore/VirtualExploreBookGrid';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BookCoverImg } from '@/components/books/BookCoverImg';
import { BookCoverIcon } from '@/components/shared/icons';
import { exploreBook } from '@/lib/book-source/explore';
import { isAbortError } from '@/lib/http';
import { searchBookToEphemeralBook } from '@/lib/bookshelf/book-to-search-book';
import type { BookSource } from '@/types';
import type { Book, SearchBook } from '@/types';
import type { ExploreSection } from '@/lib/book-source/explore-sections';
import { cn } from '@/lib/utils';
import { mainShellPageScroll } from '@/lib/ui/viewport-classes';
import {
  exploreBookListCardClass,
  exploreBookListCoverClass,
  exploreBookListBodyClass,
  exploreBookListBadgeRowClass,
  exploreBookListBadgeClass,
  exploreBookListBadgeLastClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { ExploreBookListSkeleton } from '@/components/explore/ExploreBookCardSkeleton';
import { ExploreBookListIntro } from '@/components/explore/ExploreBookListIntro';
import { bookGroupCardPressHandlers } from '@/lib/bookshelf/book-group-card-press';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  explorePaginationPreference,
  initExplorePaginationPreference,
} from '@/stores/explore-pagination-preference';
import { pageCacheStore } from '@/stores/page-cache';
import { tryFormatDisplayUpdateTime } from '@/lib/format/display-time';
import {
  buildBadgeTooltipText,
  buildExploreBadgeEntries,
  BOOK_BADGE_TOOLTIP_CONTENT_CLASS,
} from '@/lib/bookshelf/book-badge-utils';

export type { PaginationPreference } from '@/stores/explore-pagination-preference';
export { EXPLORE_PAGINATION_PREFERENCE_KEY } from '@/stores/explore-pagination-preference';

function normalizePlaceholder(v: string | undefined): string {
  if (v == null) return '--';
  const s = String(v).trim();
  if (s === '' || /^[\s·•\-\u00B7\u2022]*$/.test(s)) return '--';
  return s;
}

function displayChapterTitle(title: string | undefined): string {
  const cleaned = title?.trim().replace(/\s*[•·]\s*$/, '').trim();
  return normalizePlaceholder(cleaned);
}

function ExploreBookBadgeRow(props: { book: SearchBook }) {
  const entries = () => buildExploreBadgeEntries(props.book);
  const tooltipText = () => buildBadgeTooltipText(entries());

  return (
    <Show when={entries().length > 0}>
      <Tooltip>
        <TooltipTrigger as="div" class={exploreBookListBadgeRowClass()}>
          <For each={entries()}>
            {(entry, i) => {
              const isLast = i() === entries().length - 1;
              return (
                <Badge
                  variant={entry.variant}
                  class={isLast ? exploreBookListBadgeLastClass() : exploreBookListBadgeClass()}
                >
                  <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                    {entry.value}
                  </span>
                </Badge>
              );
            }}
          </For>
        </TooltipTrigger>
        <TooltipContent class={BOOK_BADGE_TOOLTIP_CONTENT_CLASS}>
          {tooltipText()}
        </TooltipContent>
      </Tooltip>
    </Show>
  );
}

export interface ExploreSourcePageContentProps {
  source: BookSource;
  section: ExploreSection;
  /** 变更时触发重新加载 */
  refreshKey?: number;
  onOpenBook: (book: Book) => void;
  onOpenBookInfo?: (source: BookSource, book: SearchBook) => void;
  class?: string;
}

export function ExploreSourcePageContent(props: ExploreSourcePageContentProps) {
  const [page, setPage] = createSignal(1);
  const [allBooks, setAllBooks] = createSignal<SearchBook[]>([]);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const sectionUrl = () => props.section.url ?? '';
  const hasPagination = () => sectionUrl().includes('{{page}}') || sectionUrl().includes('{page}');
  const useScrollLoad = () => explorePaginationPreference() === 'scroll';
  const refreshKey = () => props.refreshKey ?? 0;

  /** 当前分类列表请求标识；切换分类时变更，用于丢弃过期响应 */
  const listFetchKey = () => `${sectionUrl()}\0${refreshKey()}`;

  const [committedFetchKey, setCommittedFetchKey] = createSignal<string | null>(null);

  let loadMoreAbort: AbortController | null = null;

  const isFetchKeyCurrent = (fetchKey: string) => listFetchKey() === fetchKey;

  const abortLoadMore = () => {
    loadMoreAbort?.abort();
    loadMoreAbort = null;
  };

  createEffect(() => {
    listFetchKey();
    abortLoadMore();
    setPage(1);
    setAllBooks([]);
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

      const cacheSourceId = (source.sourceId || source.sourceName) as string | undefined;
      const cached = cacheSourceId ? pageCacheStore.getExploreCache(cacheSourceId, sectionUrl) : null;

      if (cached && rk === 0) {
        if (!isFetchKeyCurrent(fetchKey)) return [];
        setAllBooks(cached.allBooks);
        setPage(cached.page);
        setCommittedFetchKey(fetchKey);
        return cached.books;
      }

      try {
        const list = await exploreBook(source, 1, sectionUrl, { signal: controller.signal });
        if (!isFetchKeyCurrent(fetchKey)) return [];

        setAllBooks(list);
        setCommittedFetchKey(fetchKey);

        if (cacheSourceId) {
          pageCacheStore.setExploreCache(cacheSourceId, sectionUrl, list, 1, list);
        }

        return list;
      } catch (e) {
        if (isAbortError(e)) return [];
        throw e;
      }
    },
  );

  const books = () =>
    committedFetchKey() === listFetchKey() && firstPageResource.state === 'ready'
      ? allBooks()
      : [];
  const loading = () =>
    firstPageResource.loading || committedFetchKey() !== listFetchKey();
  const error = () =>
    committedFetchKey() === listFetchKey() ? firstPageResource.error : undefined;

  onMount(() => void initExplorePaginationPreference());

  const clearCacheAndReload = () => {
    const cacheSourceId = props.source.sourceId || props.source.sourceName;
    if (cacheSourceId && typeof cacheSourceId === 'string') {
      pageCacheStore.clearExploreCache(cacheSourceId, sectionUrl());
    }
    setPage(1);
  };

  const loadMore = async () => {
    if (!hasPagination() || loadingMore()) return;
    const fetchKeyAtStart = listFetchKey();
    abortLoadMore();
    const controller = new AbortController();
    loadMoreAbort = controller;
    const next = page() + 1;
    setLoadingMore(true);
    try {
      const list = await exploreBook(props.source, next, sectionUrl(), {
        signal: controller.signal,
      });
      if (!isFetchKeyCurrent(fetchKeyAtStart) || controller.signal.aborted) return;
      const updatedBooks = [...allBooks(), ...list];
      setAllBooks(updatedBooks);
      setPage(next);

      const cacheSourceId = props.source.sourceId || props.source.sourceName;
      if (cacheSourceId && typeof cacheSourceId === 'string') {
        pageCacheStore.updateExploreCache(cacheSourceId, sectionUrl(), (cache) => ({
          ...cache,
          allBooks: updatedBooks,
          page: next,
          timestamp: Date.now(),
        }));
      }

      if (list.length === 0) {
        showAppToast({ title: '没有更多了', variant: 'default' });
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

  const handleContentScroll = (el: HTMLDivElement) => {
    if (!useScrollLoad() || !hasPagination() || loadingMore()) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom < 100) {
      loadMore();
    }
  };

  const handleBookClick = (sb: SearchBook) => {
    if (props.onOpenBookInfo) {
      props.onOpenBookInfo(props.source, sb);
    } else {
      props.onOpenBook(searchBookToEphemeralBook(sb));
    }
  };

  return (
    <div class={cn('flex h-full min-h-0 flex-1 flex-col overflow-hidden', props.class)}>
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
        <VirtualExploreBookGrid
          class={cn(mainShellPageScroll, 'min-h-0 flex-1')}
          items={books()}
          onScroll={handleContentScroll}
        >
          {(sb) => (
            <li class="w-full">
              <button
                type="button"
                class={exploreBookListCardClass()}
                onClick={() => handleBookClick(sb)}
                {...bookGroupCardPressHandlers}
              >
                <div class={exploreBookListCoverClass()}>
                  <BookCoverImg
                    src={sb.coverUrl}
                    referer={sb.origin}
                    source={props.source}
                    bookUrl={sb.bookUrl}
                    onCoverUrlRefreshed={(url) => {
                      setAllBooks((prev) =>
                        prev.map((b) =>
                          b.bookUrl === sb.bookUrl ? { ...b, coverUrl: url } : b,
                        ),
                      );
                    }}
                    alt=""
                    class="h-full w-full object-cover"
                    loading="lazy"
                    draggable={false}
                    fallback={
                      <div class="flex h-full w-full items-center justify-center">
                        <BookCoverIcon class="h-8 w-8 text-muted-foreground" size={32} />
                      </div>
                    }
                  />
                </div>
                <div class={exploreBookListBodyClass('text-left')}>
                  <p class="m-0 shrink-0 truncate font-medium leading-5 text-foreground">{sb.name}</p>
                  <p class="m-0 shrink-0 truncate text-xs leading-5 text-muted-foreground">
                    作者：{sb.author || '—'}
                    <Show when={sb.chapterWordCountText ?? sb.wordCount}>
                      <span class="ml-1">· {sb.chapterWordCountText ?? sb.wordCount}</span>
                    </Show>
                  </p>
                  <p class="m-0 shrink-0 truncate text-xs leading-5 text-muted-foreground">
                    {(() => {
                      const updateLabel = tryFormatDisplayUpdateTime(sb.latestChapterUpdateTime);
                      return (
                        <>
                          最新章节：{displayChapterTitle(sb.latestChapterTitle)}
                          <Show when={updateLabel}>
                            <span> · {updateLabel}</span>
                          </Show>
                        </>
                      );
                    })()}
                  </p>
                  <ExploreBookBadgeRow book={sb} />
                  <ExploreBookListIntro>
                    简介：{sb.intro?.trim() || '暂无简介'}
                  </ExploreBookListIntro>
                </div>
              </button>
            </li>
          )}
        </VirtualExploreBookGrid>

        <Show when={hasPagination() && books().length > 0 && !useScrollLoad()}>
          <div class="shrink-0 py-4 flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={loadingMore()}>
              {loadingMore() ? '加载中…' : '加载更多'}
            </Button>
          </div>
        </Show>

        <Show when={hasPagination() && books().length > 0 && useScrollLoad() && loadingMore()}>
          <div class="shrink-0 py-4 flex justify-center">
            <p class="text-sm text-muted-foreground">加载中…</p>
          </div>
        </Show>
      </Show>

    </div>
  );
}
