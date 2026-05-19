/**
 * 发现页：点击书源发现子项（分类/排行榜等）后展示该分类下的书籍列表
 * 参照 legado 的发现页：列表展示、分页加载、点击加入书架并打开
 */

import { createResource, createSignal, For, Show, onMount, onCleanup } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { dialogViewportLimits } from '@/lib/viewport-classes';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PageHeader } from '@/components/PageHeader';
import { RefreshIcon, MoreIcon, Settings2Icon, BookCoverIcon } from '@/components/icons';
import { exploreBook } from '@/lib/book-source/explore';
import { addSearchBookToShelf } from '@/lib/book-source/add-to-shelf';
import type { BookSource } from '@/types';
import type { Book, SearchBook } from '@/types';
import type { ExploreSection } from '@/lib/book-source/explore-sections';
import { cn } from '@/lib/utils';
import { showAppToast } from '@/components/AppToasts';
import { getStorage, setStorage } from '@/lib/platform/storage';
import { pageCacheStore } from '@/stores/page-cache';

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

  // 滚动监听：当滚动到底部时自动加载更多（仅在滚动加载模式下）
  onMount(() => {
    if (!useScrollLoad() || !hasPagination()) return;

    const handleScroll = () => {
      if (loadingMore()) return;

      // 查找主滚动容器（#main-content-container）
      const container = document.getElementById('main-content-container');
      if (!container) return;

      // 检查是否滚动到底部（距离底部100px内）
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const distanceToBottom = scrollHeight - scrollTop - clientHeight;

      // 当距离底部小于100px时，触发加载更多
      if (distanceToBottom < 100) {
        loadMore();
      }
    };

    // 监听主滚动容器的滚动事件
    const container = document.getElementById('main-content-container');
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      onCleanup(() => {
        container.removeEventListener('scroll', handleScroll);
      });
    }
  });

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
    <section class="flex h-full flex-col">
      {/* 统一页面头部 - 独立页面模式下强制显示 */}
      <PageHeader
        onBack={props.onBack}
        title={`${props.source.sourceName} · ${props.section.title}`}
        subtitle="发现"
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

      {/* 内容区域 */}
      <div class="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">

      <Show when={loading()}>
        <ul class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          <For each={[1, 2, 3, 4, 5, 6, 7, 8, 9]}>
            {() => (
              <li class="w-full">
                <div class="flex w-full items-stretch gap-3 rounded-xl border border-border/60 bg-card p-3">
                  {/* 封面 skeleton */}
                  <div class="h-24 w-16 shrink-0 rounded-md bg-muted/60 animate-pulse" />
                  {/* 右侧信息 skeleton */}
                  <div class="min-w-0 flex-1 flex flex-col gap-0.5">
                    {/* 书名 */}
                    <div class="h-5 w-3/4 rounded bg-muted/60 animate-pulse" />
                    {/* 作者行 */}
                    <div class="h-3 w-1/2 rounded bg-muted/60 animate-pulse" />
                    {/* 徽章行 */}
                    <div class="flex flex-wrap gap-1.5 mt-0.5">
                      <div class="h-5 w-12 rounded-md bg-muted/60 animate-pulse" />
                      <div class="h-5 w-16 rounded-md bg-muted/60 animate-pulse" />
                      <div class="h-5 w-14 rounded-md bg-muted/60 animate-pulse" />
                      <div class="h-5 w-20 rounded-md bg-muted/60 animate-pulse" />
                      <div class="h-5 w-16 rounded-md bg-muted/60 animate-pulse" />
                    </div>
                    {/* 简介（2行） */}
                    <div class="h-3 w-full rounded bg-muted/60 animate-pulse mt-0.5" />
                    <div class="h-3 w-4/5 rounded bg-muted/60 animate-pulse" />
                    {/* 最新章节行 */}
                    <div class="h-3 w-2/3 rounded bg-muted/60 animate-pulse mt-0.5" />
                  </div>
                </div>
              </li>
            )}
          </For>
        </ul>
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
        <ul class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          <For each={books()}>
            {(sb) => (
              <li>
                <button
                  type="button"
                  class={cn(
                    'group flex w-full items-stretch gap-3 rounded-xl border border-border/60 bg-card p-3 text-left shadow-sm transition-all',
                    'hover:border-primary/40 hover:shadow-md',
                    'active:scale-[0.99]',
                    addingBookUrl() === sb.bookUrl && 'pointer-events-none opacity-70'
                  )}
                  onClick={() => handleBookClick(sb)}
                >
                  {/* 封面：固定宽高，列表行内不占过多空间 */}
                  <div class="h-24 w-16 shrink-0 overflow-hidden rounded-md bg-muted/50">
                    {sb.coverUrl ? (
                      <img
                        src={sb.coverUrl}
                        alt=""
                        class="h-full w-full object-cover"
                        loading="lazy"
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
                  {/* 右侧：书名、作者、徽章、简介、最新章节·更新时间、字数等 */}
                  <div class="min-w-0 flex-1 flex flex-col gap-0.5 text-left">
                    <p class="truncate font-medium text-foreground">{sb.name}</p>
                    <p class="text-xs text-muted-foreground truncate">
                      作者：{sb.author || '—'}
                      <Show when={sb.chapterWordCountText ?? sb.wordCount}>
                        <span class="ml-1">· {sb.chapterWordCountText ?? sb.wordCount}</span>
                      </Show>
                    </p>
                    <div class="flex flex-wrap gap-1.5 mt-0.5">
                      <For each={getBadgeEntries(sb)}>
                        {(entry) => (
                          <Badge
                            variant={entry.key === 'status' ? getStatusBadgeVariant(entry.value) : 'secondary'}
                            class="text-[10px] px-1.5 py-0 font-normal"
                          >
                            {entry.value}
                          </Badge>
                        )}
                      </For>
                    </div>
                    <p class="line-clamp-2 text-xs text-muted-foreground mt-0.5">
                      简介：{sb.intro?.trim() || '暂无简介'}
                    </p>
                    <p class="truncate text-xs text-muted-foreground mt-0.5">
                      最新章节：{normalizePlaceholder(sb.latestChapterTitle)} · {normalizePlaceholder(sb.latestChapterUpdateTime)}
                    </p>
                    <Show when={addingBookUrl() === sb.bookUrl}>
                      <span class="text-xs text-primary mt-1">已加书架</span>
                    </Show>
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
      <Dialog 
        open={props.showPaginationPreferenceDialog ?? false} 
        onOpenChange={(open) => props.onPaginationPreferenceDialogChange?.(open)}
      >
        <DialogContent class={`${dialogViewportLimits} flex flex-col overflow-hidden p-0`}>
          <DialogHeader class="shrink-0 px-6 pt-6">
            <DialogTitle>分页偏好</DialogTitle>
            <DialogDescription>选择发现页的加载方式</DialogDescription>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>
      </div>
    </section>
  );
}
