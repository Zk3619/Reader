/**
 * 发现页：点击书源发现子项（分类/排行榜等）后展示该分类下的书籍列表
 * 参照 legado 的发现页：列表展示、分页加载、点击加入书架并打开
 */

import { createResource, createSignal, For, Show, onMount } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PageHeader } from '@/components/shell/PageHeader';
import { RefreshIcon, MoreIcon, Settings2Icon, BookCoverIcon } from '@/components/shared/icons';
import { exploreBook } from '@/lib/book-source/explore';
import { addSearchBookToShelf } from '@/lib/book-source/add-to-shelf';
import type { BookSource } from '@/types';
import type { Book, SearchBook } from '@/types';
import type { ExploreSection } from '@/lib/book-source/explore-sections';
import { cn } from '@/lib/utils';
import {
  discoverBookListCardClass,
  discoverBookListCoverClass,
  discoverBookListBodyClass,
  discoverBookListBadgeRowClass,
  discoverBookListBadgeClass,
  discoverBookListBadgeLastClass,
  discoverBookListBadgeEllipsisClass,
} from '@/lib/bookshelf/book-group-card-styles';
import {
  DISCOVER_BOOK_GRID_CLASS,
  DiscoverBookListSkeleton,
} from '@/pages/discover/DiscoverBookCardSkeleton';
import { DiscoverBookListIntro } from '@/pages/discover/DiscoverBookListIntro';
import { bookGroupCardPressHandlers } from '@/lib/bookshelf/book-group-card-press';
import { showAppToast } from '@/components/shared/AppToasts';
import { getStorage, setStorage } from '@/lib/platform/storage';
import { pageCacheStore } from '@/stores/page-cache';
import { tryFormatDisplayUpdateTime } from '@/lib/format/display-time';

/** 分页偏好类型 */
type PaginationPreference = 'scroll' | 'pagination';

/** 分页偏好存储键 */
const PAGINATION_PREFERENCE_KEY = 'discover_pagination_preference';

/** 默认分页偏好：滚动加载 */
const DEFAULT_PAGINATION_PREFERENCE: PaginationPreference = 'scroll';

/** 发现列表徽章顺序：source（站内来源如番茄/起点）→ status → tab → category（站点分类）→ tags → score；每项独立，仅在有值时显示 */
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

/** 按状态文案返回徽章颜色：已完结→success，连载中→warning，其余→secondary */
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
  // 空字符串或只包含空白/分隔符（如 " · "、"•"）时返回 '--'
  if (s === '' || /^[\s·•\-\u00B7\u2022]*$/.test(s)) return '--';
  return s;
}

/** 展示用章节名（去掉书源模板残留的「 • 」后缀） */
function displayChapterTitle(title: string | undefined): string {
  const cleaned = title?.trim().replace(/\s*[•·]\s*$/, '').trim();
  return normalizePlaceholder(cleaned);
}

export interface DiscoverPageProps {
  source: BookSource;
  section: ExploreSection;
  onBack: () => void;
  onOpenBook: (book: Book) => void;
  onOpenBookInfo?: (book: SearchBook) => void;
  /** 分页偏好对话框显示状态 */
  showPaginationPreferenceDialog?: boolean;
  /** 分页偏好对话框显示状态变化回调 */
  onPaginationPreferenceDialogChange?: (open: boolean) => void;
}

export function DiscoverPage(props: DiscoverPageProps) {
  const [page, setPage] = createSignal(1);
  const [allBooks, setAllBooks] = createSignal<SearchBook[]>([]);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [addingBookUrl, setAddingBookUrl] = createSignal<string | null>(null);
  const [refreshKey, setRefreshKey] = createSignal(0);
  const [paginationPreference, setPaginationPreference] = createSignal<PaginationPreference>(DEFAULT_PAGINATION_PREFERENCE);

  const sectionUrl = () => props.section.url ?? '';
  const hasPagination = () => sectionUrl().includes('{{page}}') || sectionUrl().includes('{page}');
  const useScrollLoad = () => paginationPreference() === 'scroll';

  const [firstPageResource] = createResource(
    () => ({ source: props.source, sectionUrl: sectionUrl(), refreshKey: refreshKey() }),
    async ({ source, sectionUrl }) => {
      if (!sectionUrl) return [];
      
      // 检查缓存
      const cacheSourceId = (source.sourceId || source.sourceName) as string | undefined;
      const cached = cacheSourceId ? pageCacheStore.getDiscoverCache(cacheSourceId, sectionUrl) : null;
      
      if (cached && refreshKey() === 0) {
        // 使用缓存数据（仅在非手动刷新时）
        console.log('[DiscoverPage] 使用缓存数据，书籍数:', cached.allBooks.length);
        setAllBooks(cached.allBooks);
        setPage(cached.page);
        return cached.books;
      }
      
      // 获取新数据
      const list = await exploreBook(source, 1, sectionUrl);
      setAllBooks(list);
      
      // 保存到缓存
      if (cacheSourceId) {
        pageCacheStore.setDiscoverCache(
          cacheSourceId,
          sectionUrl,
          list,
          1,
          list
        );
      }
      
      return list;
    }
  );

  const books = () => firstPageResource.state === 'ready' ? allBooks() : [];
  const loading = () => firstPageResource.loading;
  const error = () => firstPageResource.error;

  // 加载分页偏好设置
  onMount(async () => {
    const saved = await getStorage<PaginationPreference>(PAGINATION_PREFERENCE_KEY);
    if (saved === 'scroll' || saved === 'pagination') {
      setPaginationPreference(saved);
    }
  });

  // 保存分页偏好设置
  const savePaginationPreference = async (pref: PaginationPreference) => {
    setPaginationPreference(pref);
    await setStorage(PAGINATION_PREFERENCE_KEY, pref);
  };

  // 刷新：通过改变 refreshKey 触发资源重新加载，并清除缓存
  const refresh = () => {
    // 清除缓存，强制重新加载
    const cacheSourceId = props.source.sourceId || props.source.sourceName;
    if (cacheSourceId && typeof cacheSourceId === 'string') {
      pageCacheStore.clearDiscoverCache(cacheSourceId, sectionUrl());
    }
    setRefreshKey((k) => k + 1);
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
      
      // 更新缓存
      const cacheSourceId = props.source.sourceId || props.source.sourceName;
      if (cacheSourceId && typeof cacheSourceId === 'string') {
        pageCacheStore.updateDiscoverCache(
          cacheSourceId,
          sectionUrl(),
          (cache) => ({
            ...cache,
            allBooks: updatedBooks,
            page: next,
            timestamp: Date.now(),
          })
        );
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
    // 如果提供了 onOpenBookInfo 回调，跳转到书籍信息页；否则直接加入书架并打开
    if (props.onOpenBookInfo) {
      props.onOpenBookInfo(sb);
    } else {
      // 兼容旧行为：直接加入书架并打开
      handleAddAndOpen(sb);
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
    <section class="flex h-dvh min-h-0 flex-col overflow-hidden">
      <PageHeader
        onBack={props.onBack}
        title={`${props.source.sourceName} · ${props.section.title}`}
        subtitle="发现"
        pinToTop
        draggable={true}
        actions={[
          {
            icon: RefreshIcon,
            label: '刷新',
            onClick: refresh,
            disabled: loading(),
            showTooltip: true,
            iconClass: cn('transition-transform', loading() && 'animate-spin'),
          },
          {
            icon: MoreIcon,
            label: '更多',
            isDropdown: true,
            dropdownItems: [
              {
                icon: Settings2Icon,
                label: '分页偏好',
                onClick: () => props.onPaginationPreferenceDialogChange?.(true),
              },
            ],
          },
        ]}
        class="border-b"
      />

      <div
        class="min-h-0 flex-1 overflow-y-auto scroll-gutter-stable-both overscroll-contain p-4 sm:p-6 lg:p-8"
        onScroll={handleContentScroll}
      >

      <Show when={loading()}>
        <DiscoverBookListSkeleton />
      </Show>

      <Show when={error()}>
        <div class="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-6">
          <div class="mb-4 text-center text-sm text-destructive">
            <p class="font-medium mb-1">加载失败</p>
            <p class="text-xs text-destructive/80 wrap-break-word">{String(error())}</p>
          </div>
          <div class="flex justify-center">
            <Button variant="outline" size="sm" onClick={refresh}>
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
        <ul class={DISCOVER_BOOK_GRID_CLASS}>
          <For each={books()}>
            {(sb) => (
              <li class="w-full">
                <button
                  type="button"
                  class={discoverBookListCardClass(
                    addingBookUrl() === sb.bookUrl && 'pointer-events-none opacity-70',
                  )}
                  onClick={() => handleBookClick(sb)}
                  {...bookGroupCardPressHandlers}
                >
                  <div class={discoverBookListCoverClass()}>
                    {sb.coverUrl ? (
                      <img
                        src={sb.coverUrl}
                        alt=""
                        class="h-full w-full object-cover"
                        loading="lazy"
                        draggable={false}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div class={cn('hidden h-full w-full items-center justify-center', !sb.coverUrl && 'flex')}>
                      <BookCoverIcon class="h-8 w-8 text-muted-foreground" size={32} />
                    </div>
                  </div>
                  <div class={discoverBookListBodyClass('text-left')}>
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
                          <div class={discoverBookListBadgeRowClass()}>
                            <For each={entries}>
                              {(entry, i) => {
                                const len = entries.length;
                                const badgeClass = () => {
                                  const idx = i();
                                  const isLast = idx === len - 1;
                                  const nextIsEllipsis = !isLast && entries[idx + 1]?.isEllipsis;
                                  if (entry.isEllipsis) return discoverBookListBadgeEllipsisClass();
                                  if (isLast) return discoverBookListBadgeLastClass();
                                  if (nextIsEllipsis) return discoverBookListBadgeLastClass();
                                  return discoverBookListBadgeClass();
                                };
                                return (
                                  <Badge
                                    variant={
                                      entry.isEllipsis
                                        ? 'outline'
                                        : entry.key === 'status'
                                          ? getStatusBadgeVariant(entry.value)
                                          : 'secondary'
                                    }
                                    class={badgeClass()}
                                    title={entry.isEllipsis ? '更多徽标已省略' : entry.value}
                                  >
                                    <Show when={!entry.isEllipsis} fallback={entry.value}>
                                      <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                                        {entry.value}
                                      </span>
                                    </Show>
                                  </Badge>
                                );
                              }}
                            </For>
                          </div>
                        );
                      })()}
                    </Show>
                    <DiscoverBookListIntro>
                      简介：{sb.intro?.trim() || '暂无简介'}
                    </DiscoverBookListIntro>
                  </div>
                </button>
              </li>
            )}
          </For>
        </ul>

        {/* 分页按钮：仅在分页模式下显示 */}
        <Show when={hasPagination() && books().length > 0 && !useScrollLoad()}>
          <div class="mt-6 flex justify-center">
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={loadingMore()}
            >
              {loadingMore() ? '加载中…' : '加载更多'}
            </Button>
          </div>
        </Show>

        {/* 滚动加载提示：仅在滚动模式下显示 */}
        <Show when={hasPagination() && books().length > 0 && useScrollLoad() && loadingMore()}>
          <div class="mt-4 flex justify-center">
            <p class="text-sm text-muted-foreground">加载中…</p>
          </div>
        </Show>
      </Show>

      {/* 分页偏好配置对话框 */}
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
                <RadioGroupItem value="scroll" id="scroll" />
                <Label for="scroll" class="flex-1 cursor-pointer">
                  <div class="font-medium">滚动加载</div>
                  <div class="text-xs text-muted-foreground">滚动到底部时自动加载更多</div>
                </Label>
              </div>
              <div class="flex items-center space-x-2">
                <RadioGroupItem value="pagination" id="pagination" />
                <Label for="pagination" class="flex-1 cursor-pointer">
                  <div class="font-medium">分页列表</div>
                  <div class="text-xs text-muted-foreground">点击"加载更多"按钮手动加载</div>
                </Label>
              </div>
            </RadioGroup>
          </div>
        </AppDialogContent>
      </AppDialog>
      </div>
    </section>
  );
}
