/**
 * 发现书籍列表内容区（无页头），供 ScoutPage / ExploreSourcePage 复用
 */

import { createResource, createSignal, For, Show, onMount } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { BookCoverImg } from '@/components/books/BookCoverImg';
import { BookCoverIcon } from '@/components/shared/icons';
import { exploreBook } from '@/lib/book-source/explore';
import { addSearchBookToShelf } from '@/lib/book-source/add-to-shelf';
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
  exploreBookListBadgeEllipsisClass,
} from '@/lib/bookshelf/book-group-card-styles';
import {
  EXPLORE_BOOK_GRID_CLASS,
  ExploreBookListSkeleton,
} from '@/pages/explore/ExploreBookCardSkeleton';
import { ExploreBookListIntro } from '@/pages/explore/ExploreBookListIntro';
import { bookGroupCardPressHandlers } from '@/lib/bookshelf/book-group-card-press';
import { showAppToast } from '@/components/shared/AppToasts';
import { getStorage, setStorage } from '@/lib/platform/storage';
import { pageCacheStore } from '@/stores/page-cache';
import { tryFormatDisplayUpdateTime } from '@/lib/format/display-time';

export type PaginationPreference = 'scroll' | 'pagination';

export const EXPLORE_PAGINATION_PREFERENCE_KEY = 'explore_pagination_preference';

const DEFAULT_PAGINATION_PREFERENCE: PaginationPreference = 'scroll';

const BADGE_KEYS = ['source', 'status', 'tab', 'category', 'tags', 'score'] as const;
type BadgeKey = (typeof BADGE_KEYS)[number];

function getBadgeEntries(sb: SearchBook): { key: BadgeKey; value: string }[] {
  const entries: { key: BadgeKey; value: string }[] = [];
  for (const key of BADGE_KEYS) {
    const v = sb[key];
    const value = v != null ? String(v).trim() : '';
    if (value) entries.push({ key, value });
  }
  return entries;
}

type DisplayBadgeEntry = {
  key: BadgeKey | 'ellipsis';
  value: string;
  isEllipsis?: boolean;
};

function getDisplayBadgeEntries(sb: SearchBook): DisplayBadgeEntry[] {
  const entries = getBadgeEntries(sb);
  const MAX_BADGES = 4;
  if (entries.length <= MAX_BADGES) return entries;
  return [...entries.slice(0, MAX_BADGES - 1), { key: 'ellipsis', value: '···', isEllipsis: true }];
}

function getStatusBadgeVariant(status: string): 'success' | 'warning' | 'secondary' | 'default' {
  const s = status.trim();
  if (/已完结|完结|完成/i.test(s)) return 'success';
  if (/连载|更新中/i.test(s)) return 'warning';
  if (/已出版|出版/i.test(s)) return 'secondary';
  return 'default';
}

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

export interface ExploreSourcePageContentProps {
  source: BookSource;
  section: ExploreSection;
  /** 变更时触发重新加载 */
  refreshKey?: number;
  onOpenBook: (book: Book) => void;
  onOpenBookInfo?: (source: BookSource, book: SearchBook) => void;
  showPaginationPreferenceDialog?: boolean;
  onPaginationPreferenceDialogChange?: (open: boolean) => void;
  class?: string;
}

export function ExploreSourcePageContent(props: ExploreSourcePageContentProps) {
  const [page, setPage] = createSignal(1);
  const [allBooks, setAllBooks] = createSignal<SearchBook[]>([]);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [addingBookUrl, setAddingBookUrl] = createSignal<string | null>(null);
  const [paginationPreference, setPaginationPreference] = createSignal<PaginationPreference>(
    DEFAULT_PAGINATION_PREFERENCE,
  );

  const sectionUrl = () => props.section.url ?? '';
  const hasPagination = () => sectionUrl().includes('{{page}}') || sectionUrl().includes('{page}');
  const useScrollLoad = () => paginationPreference() === 'scroll';
  const refreshKey = () => props.refreshKey ?? 0;

  const [firstPageResource] = createResource(
    () => ({
      source: props.source,
      sectionUrl: sectionUrl(),
      refreshKey: refreshKey(),
      sectionTitle: props.section.title,
    }),
    async ({ source, sectionUrl, refreshKey: rk }) => {
      if (!sectionUrl) return [];

      const cacheSourceId = (source.sourceId || source.sourceName) as string | undefined;
      const cached = cacheSourceId ? pageCacheStore.getExploreCache(cacheSourceId, sectionUrl) : null;

      if (cached && rk === 0) {
        setAllBooks(cached.allBooks);
        setPage(cached.page);
        return cached.books;
      }

      const list = await exploreBook(source, 1, sectionUrl);
      setAllBooks(list);

      if (cacheSourceId) {
        pageCacheStore.setExploreCache(cacheSourceId, sectionUrl, list, 1, list);
      }

      return list;
    },
  );

  const books = () => (firstPageResource.state === 'ready' ? allBooks() : []);
  const loading = () => firstPageResource.loading;
  const error = () => firstPageResource.error;

  onMount(async () => {
    const saved = await getStorage<PaginationPreference>(EXPLORE_PAGINATION_PREFERENCE_KEY);
    if (saved === 'scroll' || saved === 'pagination') {
      setPaginationPreference(saved);
    }
  });

  const savePaginationPreference = async (pref: PaginationPreference) => {
    setPaginationPreference(pref);
    await setStorage(EXPLORE_PAGINATION_PREFERENCE_KEY, pref);
  };

  const clearCacheAndReload = () => {
    const cacheSourceId = props.source.sourceId || props.source.sourceName;
    if (cacheSourceId && typeof cacheSourceId === 'string') {
      pageCacheStore.clearExploreCache(cacheSourceId, sectionUrl());
    }
    setPage(1);
  };

  const loadMore = async () => {
    if (!hasPagination() || loadingMore()) return;
    const next = page() + 1;
    setLoadingMore(true);
    try {
      const list = await exploreBook(props.source, next, sectionUrl());
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
      console.error('加载更多失败:', e);
      showAppToast({ title: '加载失败', description: String(e), variant: 'destructive' });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleContentScroll = (e: Event & { currentTarget: HTMLDivElement }) => {
    if (!useScrollLoad() || !hasPagination() || loadingMore()) return;
    const el = e.currentTarget;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom < 100) {
      loadMore();
    }
  };

  const handleBookClick = (sb: SearchBook) => {
    if (props.onOpenBookInfo) {
      props.onOpenBookInfo(props.source, sb);
    } else {
      void handleAddAndOpen(sb);
    }
  };

  const handleAddAndOpen = async (sb: SearchBook) => {
    if (addingBookUrl() === sb.bookUrl) return;
    setAddingBookUrl(sb.bookUrl);
    try {
      const book = await addSearchBookToShelf(sb);
      if (book) {
        props.onOpenBook(book);
      } else {
        showAppToast({ title: '加入书架失败', variant: 'destructive' });
      }
    } catch (e) {
      console.error('加入书架失败:', e);
      showAppToast({ title: '加入书架失败', description: String(e), variant: 'destructive' });
    } finally {
      setAddingBookUrl(null);
    }
  };

  return (
    <div
      class={cn(mainShellPageScroll, 'h-full', props.class)}
      onScroll={handleContentScroll}
    >
      <Show when={loading()}>
        <ExploreBookListSkeleton />
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
        <ul class={EXPLORE_BOOK_GRID_CLASS}>
          <For each={books()}>
            {(sb) => (
              <li class="w-full">
                <button
                  type="button"
                  class={exploreBookListCardClass(
                    addingBookUrl() === sb.bookUrl && 'pointer-events-none opacity-70',
                  )}
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
                      <Show
                        when={addingBookUrl() === sb.bookUrl}
                        fallback={(() => {
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
                      >
                        <span class="text-primary">正在加入书架…</span>
                      </Show>
                    </p>
                    <Show when={getDisplayBadgeEntries(sb).length > 0}>
                      {(() => {
                        const entries = getDisplayBadgeEntries(sb);
                        return (
                          <div class={exploreBookListBadgeRowClass()}>
                            <For each={entries}>
                              {(entry, i) => {
                                const len = entries.length;
                                const badgeClass = () => {
                                  const idx = i();
                                  const isLast = idx === len - 1;
                                  const nextIsEllipsis = !isLast && entries[idx + 1]?.isEllipsis;
                                  if (entry.isEllipsis) return exploreBookListBadgeEllipsisClass();
                                  if (isLast) return exploreBookListBadgeLastClass();
                                  if (nextIsEllipsis) return exploreBookListBadgeLastClass();
                                  return exploreBookListBadgeClass();
                                };
                                const badgeLabel =
                                  entry.isEllipsis ? '更多徽标已省略' : entry.value;
                                return (
                                  <Tooltip>
                                    <TooltipTrigger
                                      as={Badge}
                                      variant={
                                        entry.isEllipsis
                                          ? 'outline'
                                          : entry.key === 'status'
                                            ? getStatusBadgeVariant(entry.value)
                                            : 'secondary'
                                      }
                                      class={badgeClass()}
                                    >
                                      <Show when={!entry.isEllipsis} fallback={entry.value}>
                                        <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                                          {entry.value}
                                        </span>
                                      </Show>
                                    </TooltipTrigger>
                                    <TooltipContent>{badgeLabel}</TooltipContent>
                                  </Tooltip>
                                );
                              }}
                            </For>
                          </div>
                        );
                      })()}
                    </Show>
                    <ExploreBookListIntro>
                      简介：{sb.intro?.trim() || '暂无简介'}
                    </ExploreBookListIntro>
                  </div>
                </button>
              </li>
            )}
          </For>
        </ul>

        <Show when={hasPagination() && books().length > 0 && !useScrollLoad()}>
          <div class="mt-6 flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={loadingMore()}>
              {loadingMore() ? '加载中…' : '加载更多'}
            </Button>
          </div>
        </Show>

        <Show when={hasPagination() && books().length > 0 && useScrollLoad() && loadingMore()}>
          <div class="mt-4 flex justify-center">
            <p class="text-sm text-muted-foreground">加载中…</p>
          </div>
        </Show>
      </Show>

      <AppDialog
        open={props.showPaginationPreferenceDialog ?? false}
        onOpenChange={(open) => props.onPaginationPreferenceDialogChange?.(open)}
      >
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>分页偏好</AppDialogTitle>
            <AppDialogDescription>选择发现页的加载方式</AppDialogDescription>
          </AppDialogHeader>
          <div class="min-h-0 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
            <RadioGroup
              value={paginationPreference()}
              onChange={(value) => savePaginationPreference(value as PaginationPreference)}
              class="space-y-3"
            >
              <div class="flex items-center space-x-2">
                <RadioGroupItem value="scroll" id="explore-scroll" />
                <Label for="explore-scroll" class="flex-1 cursor-pointer">
                  <div class="font-medium">滚动加载</div>
                  <div class="text-xs text-muted-foreground">滚动到底部时自动加载更多</div>
                </Label>
              </div>
              <div class="flex items-center space-x-2">
                <RadioGroupItem value="pagination" id="explore-pagination" />
                <Label for="explore-pagination" class="flex-1 cursor-pointer">
                  <div class="font-medium">分页列表</div>
                  <div class="text-xs text-muted-foreground">点击「加载更多」按钮手动加载</div>
                </Label>
              </div>
            </RadioGroup>
          </div>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
}
