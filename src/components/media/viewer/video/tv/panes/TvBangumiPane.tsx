/**
 * 番剧浏览 + 搜索 + 详情 + 选源（BGM 元数据中心）
 */

import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
  type Accessor,
} from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppDropdownMenuIconTrigger,
} from '@/components/shared/AppDropdownMenu';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { AppTabs } from '@/components/shared/AppTabs';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { ChevronLeftIcon, ImageIcon, MoreIcon, RefreshIcon, CalendarDaysIcon, SortIcon, TagIcon, CalendarRangeIcon, GaugeIcon, EyeOffIcon, FilterIcon, PlayIcon, SquareIcon, StarIcon } from '@/components/shared/icons';
import { ExpandableIconSearch } from '@/components/shared/ExpandableIconSearch';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { TvVodCard } from '@/components/media/viewer/video/tv/cards/TvVodCard';
import {
  TvVodVirtualList,
  type TvVodListItem,
} from '@/components/media/viewer/video/tv/cards/TvVodVirtualList';
import {
  TvBangumiCarouselSkeleton,
  TvVodGridSkeleton,
} from '@/components/media/viewer/video/tv/hub/TvHubSkeletons';
import { BangumiTimelineDialog } from '@/components/media/viewer/video/tv/settings/BangumiTimelineDialog';
import {
  BangumiSearchClientFilterDialog,
  BangumiSearchRangeDialog,
  BangumiSearchSeasonDialog,
  BangumiSearchSortDialog,
  BangumiSearchTagsDialog,
  BangumiSearchWeekdayDialog,
} from '@/components/media/viewer/video/tv/settings/BangumiSearchFilterDialogs';
import { QuickScrollButtons } from '@/components/shell/QuickScrollButtons';
import { showAppToast } from '@/components/shared/AppToasts';
import { ViewerAppSelectContent } from '@/components/media/viewer/viewer-app-overlay';
import { pageToolbarBelowScroll, pageToolbarBelowScrollTrack } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import {
  displayName,
  bangumiSourceSearchKeywords,
  fetchBangumiCalendar,
  fetchBangumiComments,
  fetchBangumiCharacters,
  fetchBangumiStaff,
  fetchBangumiRankedList,
  fetchBangumiSubject,
  invalidateBangumiCalendarCache,
  searchBangumiSubjects,
  sortBangumiSubjects,
  type BangumiSubject,
  type BangumiComment,
  type BangumiCharacter,
  type BangumiStaff,
} from '@/lib/media/video/bangumi/meta';
import { Heart, MessageSquare } from 'lucide-solid';
import { BookCoverPreviewDialog } from '@/components/media/reader/books/BookCoverPreviewDialog';
import { exploreSkeletonPulseClass } from '@/lib/bookshelf/book-group-card-styles';
import {
  BANGUMI_STYLE_TAGS,
  BANGUMI_WEEKDAYS,
  currentBangumiWeekday,
} from '@/lib/media/video/bangumi/meta/tags';
import { ensureBangumiDaoMigrated } from '@/lib/media/video/bangumi/dao-bridge';
import {
  isBangumiKept,
  removeBangumiKeep,
  upsertBangumiKeep,
  upsertBangumiPlayHistory,
} from '@/lib/media/video/bangumi/dao-bridge';
import {
  getBangumiUi,
  getBangumiSearchPageSize,
  openBangumiSubject,
  patchBangumiSubject,
  backBangumiBrowse,
  backBangumiList,
  openBangumiSearch,
  setBangumiSearchFilter,
  setBangumiSearchKeyword,
  setBangumiSearchLoading,
  setBangumiSearchLoadingMore,
  setBangumiSearchMatchMode,
  setBangumiSearchResults,
  beginBangumiSourceSearch,
  updateBangumiRuleSearch,
  resetBangumiRuleSearch,
  stopBangumiSourceSearch,
  setBangumiView,
} from '@/stores/tv-hub/bangumi-ui';
import {
  getBangumiModulePrefs,
  setBangumiModulePrefs,
  type BangumiSourceControl,
  type BangumiTagControl,
} from '@/lib/media/video/bangumi/prefs';
import type {
  BangumiSearchFilterState,
  BangumiSearchMatchMode,
} from '@/lib/media/video/bangumi/meta/search-filter';
import { hasAdvancedSearchFilters } from '@/lib/media/video/bangumi/meta/search-filter';
import { loadBangumiRules } from '@/lib/media/video/bangumi/rules';
import {
  loadDetail,
  resolvePlayUrl,
  searchByRule,
  searchByRuleKeywords,
  searchRulesProgressive,
  type BangumiSearchHit,
} from '@/lib/media/video/bangumi/engine';
import { openRoutedPlayback } from '@/lib/media/video/playback/open-routed';
import { resolvePlaybackEngine } from '@/lib/media/video/playback/router';
import {
  applyTvPlaySessionUrl,
  beginTvPlaySession,
  failTvPlaySession,
  setTvPlaySessionLoading,
} from '@/stores/tv-hub/detail';
import { searchTraceMoe } from '@/lib/media/video/bangumi/meta/trace-moe';
import { tryMatchDanmaku } from '@/lib/media/video/danmaku/match';
import { cacheBangumiEpisode } from '@/lib/media/video/cache/episode-disk-cache';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import { MediaGroupId } from '@/types/book-group';
import { settingsState } from '@/stores/settings';

/** 对齐 Kazumi trends 分页 */
const TREND_PAGE_SIZE = 24;
/** 对齐 Kazumi getBangumiList 单次 limit=100 */
const TAG_PAGE_SIZE = 100;

type BangumiListCacheEntry = {
  items: BangumiSubject[];
  offset: number;
  hasMore: boolean;
};

/** 分类列表会话缓存：切回已加载过的分类不再打网 */
const bangumiListCache = new Map<string, BangumiListCacheEntry>();

function invalidateBangumiListCache(tag?: string) {
  if (tag == null) bangumiListCache.clear();
  else bangumiListCache.delete(tag);
}

const TAG_CHIP_CLASS = (selected: boolean) =>
  cn(
    'h-auto shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium shadow-sm',
    selected
      ? 'border-primary/50 bg-primary/5 text-foreground ring-1 ring-primary/30'
      : 'border-border/60 bg-background/80 hover:bg-accent hover:text-accent-foreground',
  );

/**
 * 徽标堆叠视口：规则/分类数量常达数十条，不限高会把内容区挤出屏幕。
 * 对齐 TvHomePaneToolbar 的 BELOW_STACK_SCROLL。
 */
const STACK_SCROLL_CLASS =
  'max-h-[min(36vh,14rem)] min-h-0 overflow-y-auto overscroll-contain scroll-gutter-stable-both';

function MenuRadioIndicator(props: { selected: boolean }) {
  return (
    <span
      class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none"
      aria-label={props.selected ? '已选' : '未选'}
    >
      <span class="relative flex size-4 items-center justify-center" aria-hidden>
        <span class="size-4 rounded-full border border-primary" />
        <Show when={props.selected}>
          <span class="absolute size-2 rounded-full bg-primary" />
        </Show>
      </span>
    </span>
  );
}

/** 列表标题下的分类 Tab：本地横滚视口（对齐 PageToolbar belowHorizontalWheel） */
function BangumiTagTabsBar(props: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [scrollRef, setScrollRef] = createSignal<HTMLDivElement | undefined>();

  createEffect(() => {
    const el = scrollRef();
    if (!el) return;
    const handler = (e: WheelEvent) => {
      const maxLeft = el.scrollWidth - el.clientWidth;
      if (maxLeft <= 0) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      e.preventDefault();
      e.stopPropagation();
      el.scrollLeft = Math.max(0, Math.min(el.scrollLeft + delta, maxLeft));
    };
    el.addEventListener('wheel', handler, { passive: false });
    onCleanup(() => el.removeEventListener('wheel', handler));
  });

  return (
    <div ref={setScrollRef} class={cn(pageToolbarBelowScroll, 'w-full min-w-0 max-w-full')}>
      <div class={cn(pageToolbarBelowScrollTrack, 'flex min-w-max items-center gap-2')}>
        <AppTabs
          value={props.value}
          onChange={props.onChange}
          options={[...BANGUMI_STYLE_TAGS]}
          labels={Object.fromEntries(BANGUMI_STYLE_TAGS.map((t) => [t, t]))}
          ariaLabel="番剧分类"
          variant="drawer-inline"
          layout="inline"
        />
      </div>
    </div>
  );
}

export function TvBangumiPane() {
  const ui = getBangumiUi;
  const [draftQ, setDraftQ] = createSignal('');
  const [tag, setTag] = createSignal<string>('热门');
  const [weekFilter, setWeekFilter] = createSignal(currentBangumiWeekday());
  const [calTick, setCalTick] = createSignal(0);
  const [prefsTick, setPrefsTick] = createSignal(0);
  const [timelineOpen, setTimelineOpen] = createSignal(false);
  const [keptIds, setKeptIds] = createSignal<Set<number>>(new Set());
  const [searchSortOpen, setSearchSortOpen] = createSignal(false);
  const [searchTagsOpen, setSearchTagsOpen] = createSignal(false);
  const [searchSeasonOpen, setSearchSeasonOpen] = createSignal(false);
  const [searchRangeOpen, setSearchRangeOpen] = createSignal(false);
  const [searchWeekdayOpen, setSearchWeekdayOpen] = createSignal(false);
  const [searchClientFilterOpen, setSearchClientFilterOpen] = createSignal(false);
  /** 选源页页头搜索草稿 */
  const [sourceDraftKw, setSourceDraftKw] = createSignal('');

  const [listItems, setListItems] = createSignal<BangumiSubject[]>([]);
  const [listLoading, setListLoading] = createSignal(false);
  const [listLoadingMore, setListLoadingMore] = createSignal(false);
  const [listHasMore, setListHasMore] = createSignal(true);
  const [listOffset, setListOffset] = createSignal(0);
  const [pageScrollEl, setPageScrollEl] = createSignal<HTMLDivElement | undefined>();

  const prefs = createMemo(() => {
    prefsTick();
    return getBangumiModulePrefs();
  });

  onMount(() => {
    void ensureBangumiDaoMigrated();
    void refreshKeptIds();
  });

  async function refreshKeptIds() {
    try {
      const rows = await TvDao.listKeepByGroup(MediaGroupId.VideoBangumi);
      setKeptIds(
        new Set(
          rows
            .map((r) => Number(r.vodId) || r.cid)
            .filter((n): n is number => typeof n === 'number' && n > 0),
        ),
      );
    } catch {
      setKeptIds(new Set<number>());
    }
  }

  const [calendar] = createResource(
    () => calTick(),
    () => fetchBangumiCalendar({ force: calTick() > 0 }),
  );

  const showCalendarSkeleton = useSkeletonLoading(
    () => calendar.loading && calendar() == null,
  );

  const calendarFlat = createMemo(() => {
    const days = calendar() || [];
    const wd = weekFilter();
    let items = days.find((d) => d.weekday === wd)?.items ?? [];
    const p = prefs();
    if (p.timelineOnlyWatching) {
      const ids = keptIds();
      items = items.filter((s) => ids.has(s.id));
    }
    return sortBangumiSubjects(items, p.timelineSort);
  });

  createEffect(() => {
    const t = tag();
    void ensureListForTag(t);
  });

  function pageSizeForTag(t: string) {
    return !t || t === '热门' ? TREND_PAGE_SIZE : TAG_PAGE_SIZE;
  }

  function applyListCache(entry: BangumiListCacheEntry) {
    setListItems(entry.items);
    setListOffset(entry.offset);
    setListHasMore(entry.hasMore);
    setListLoading(false);
  }

  function writeListCache(t: string, entry: BangumiListCacheEntry) {
    bangumiListCache.set(t, {
      items: entry.items.slice(),
      offset: entry.offset,
      hasMore: entry.hasMore,
    });
  }

  async function ensureListForTag(t: string, opts?: { force?: boolean }) {
    if (!opts?.force) {
      const hit = bangumiListCache.get(t);
      if (hit) {
        applyListCache(hit);
        return;
      }
    }

    const limit = pageSizeForTag(t);
    setListLoading(true);
    setListItems([]);
    setListHasMore(true);
    setListOffset(0);
    try {
      const r = await fetchBangumiRankedList({ tag: t, limit, offset: 0 });
      // 分类已切换则丢弃过期响应
      if (tag() !== t) return;
      const entry: BangumiListCacheEntry = {
        items: r.items,
        offset: r.items.length,
        hasMore: r.items.length >= limit,
      };
      writeListCache(t, entry);
      applyListCache(entry);
    } catch (e) {
      if (tag() !== t) return;
      setListItems([]);
      setListHasMore(false);
      setListLoading(false);
      void showAppToast({
        title: '列表加载失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  }

  async function loadMoreList() {
    if (listLoading() || listLoadingMore() || !listHasMore()) return;
    const t = tag();
    const limit = pageSizeForTag(t);
    const offset = listOffset();
    setListLoadingMore(true);
    try {
      const r = await fetchBangumiRankedList({ tag: t, limit, offset });
      if (tag() !== t) return;
      const existing = new Set(listItems().map((i) => i.id));
      const added = r.items.filter((i) => !existing.has(i.id));
      const nextItems = added.length ? [...listItems(), ...added] : listItems();
      if (added.length) setListItems(nextItems);
      const nextOffset = offset + r.items.length;
      const nextHasMore = r.items.length >= limit;
      setListOffset(nextOffset);
      setListHasMore(nextHasMore);
      writeListCache(t, { items: nextItems, offset: nextOffset, hasMore: nextHasMore });
    } catch {
      if (tag() === t) setListHasMore(false);
    } finally {
      if (tag() === t) setListLoadingMore(false);
    }
  }

  const showListSkeleton = useSkeletonLoading(
    () => listLoading() && listItems().length === 0,
  );

  const listVodItems = createMemo((): TvVodListItem[] => {
    const lang = settingsState.app.language;
    const showScore = prefs().showScoreBadge;
    return listItems().map((s) => ({
      key: `bgm|${s.id}|${lang}`,
      title: displayName(s, lang),
      coverUrl: s.cover || undefined,
      badge: showScore && s.score > 0 ? s.score.toFixed(1) : undefined,
      onOpen: () => openBangumiSubject(s, { from: 'browse' }),
    }));
  });

  async function runSearch(keyword?: string, opts?: { append?: boolean }) {
    const kw = (keyword ?? ui().searchKeyword).trim();
    const filter = ui().searchFilter;
    const pageSize = getBangumiSearchPageSize();
    const append = opts?.append === true;
    if (!append) {
      if (!kw && !hasAdvancedSearchFilters(filter)) {
        setBangumiSearchResults([], { keyword: kw, offset: 0, hasMore: false });
        return;
      }
      setBangumiSearchLoading(true);
    } else {
      if (ui().searchLoading || ui().searchLoadingMore || !ui().searchHasMore) return;
      setBangumiSearchLoadingMore(true);
    }
    try {
      const offset = append ? ui().searchOffset : 0;
      // 对齐 Kazumi：单次搜索最多连拉 3 页直到出现可见条目
      let nextOffset = offset;
      let added: BangumiSubject[] = [];
      let pages = 0;
      let hasMore = true;
      do {
        const r = await searchBangumiSubjects(kw, {
          limit: pageSize,
          offset: nextOffset,
          filter,
        });
        pages += 1;
        nextOffset += r.rawCount;
        hasMore = r.rawCount >= pageSize;
        const existing = new Set(
          (append ? ui().searchRawHits : []).map((i) => i.id).concat(added.map((i) => i.id)),
        );
        const pageNew = r.items.filter((i) => !existing.has(i.id));
        added = added.concat(pageNew);
        if (added.length) break;
      } while (hasMore && pages < 3 && !append);

      setBangumiSearchResults(added, {
        keyword: kw,
        append,
        offset: nextOffset,
        hasMore,
      });
    } catch (e) {
      if (!append) {
        setBangumiSearchResults([], { keyword: kw, offset: 0, hasMore: false });
      }
      void showAppToast({
        title: '搜索失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBangumiSearchLoading(false);
      setBangumiSearchLoadingMore(false);
    }
  }

  function applySearchFilterAndRefresh(patch: Partial<BangumiSearchFilterState>) {
    setBangumiSearchFilter(patch);
    void runSearch();
  }

  function goSearchFromBrowse() {
    const kw = draftQ().trim();
    openBangumiSearch(kw);
    if (kw) void runSearch(kw);
  }

  async function onTraceMoeFile(file: File) {
    try {
      const r = await searchTraceMoe(file);
      if (!r.bgmId && !r.title) {
        void showAppToast({ title: '未识别到番剧', variant: 'warning' });
        return;
      }
      if (r.bgmId) {
        const { openBangumiById } = await import('@/stores/tv-hub/bangumi-ui');
        await openBangumiById(r.bgmId, { from: 'browse' });
        return;
      }
      const title = (r.title || '').trim();
      openBangumiSearch(title);
      if (title) void runSearch(title);
    } catch (e) {
      void showAppToast({
        title: '以图搜番失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  }

  function setTagControl(mode: BangumiTagControl) {
    setBangumiModulePrefs({ tagControl: mode });
    setPrefsTick((n) => n + 1);
  }

  const browseToolbar = () => (
    <>
      <ExpandableIconSearch
        value={draftQ()}
        onValueChange={setDraftQ}
        onSearch={() => goSearchFromBrowse()}
        placeholder="搜索 Bangumi…"
        tooltip="搜索"
        aria-label="搜索 Bangumi"
      />
      <AppDropdownMenu>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={(triggerProps: Record<string, unknown>) => (
                <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                  <MoreIcon class="h-4 w-4" />
                  <span class="sr-only">更多</span>
                </AppDropdownMenuIconTrigger>
              )}
            />
          </AppTooltipTrigger>
          <AppTooltipContent>更多</AppTooltipContent>
        </AppTooltip>
        <AppDropdownMenuContent layout="compact" class="min-w-44">
          <AppDropdownMenuItem
            class="gap-2"
            onSelect={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = () => {
                const f = input.files?.[0];
                if (f) void onTraceMoeFile(f);
              };
              input.click();
            }}
          >
            <ImageIcon class="h-4 w-4 shrink-0" />
            <span>以图搜番</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            class="gap-2"
            onSelect={() => {
              invalidateBangumiCalendarCache();
              invalidateBangumiListCache();
              setCalTick((n) => n + 1);
              void ensureListForTag(tag(), { force: true });
              void refreshKeptIds();
            }}
          >
            <RefreshIcon class="h-4 w-4 shrink-0" />
            <span>刷新时间表 / 列表</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem class="gap-2" onSelect={() => setTimelineOpen(true)}>
            <CalendarDaysIcon class="h-4 w-4 shrink-0" />
            <span>时间表配置…</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
            分类展示
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setTagControl('tabs')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={prefs().tagControl === 'tabs'} />
            <span>分类 Tab</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setTagControl('stacked')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={prefs().tagControl === 'stacked'} />
            <span>徽标堆叠</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => setTagControl('menu')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={prefs().tagControl === 'menu'} />
            <span>分组下拉</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );

  const tagControlBar = () => {
    const mode = prefs().tagControl;
    if (mode === 'menu') {
      return (
        <AppSelect
          value={tag()}
          onChange={(value) => {
            if (value == null || value === tag()) return;
            setTag(value);
          }}
          options={[...BANGUMI_STYLE_TAGS]}
          itemComponent={(itemProps) => (
            <AppSelectItem item={itemProps.item}>{String(itemProps.item.rawValue)}</AppSelectItem>
          )}
        >
          <AppSelectTrigger
            layout="compact"
            class="h-8 w-28 justify-between gap-1 border-border/60 bg-background px-2.5 font-normal sm:w-32"
            aria-label="番剧分类"
          >
            <AppSelectValue>{() => tag()}</AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <ViewerAppSelectContent>
            <AppSelectListbox />
          </ViewerAppSelectContent>
        </AppSelect>
      );
    }
    return null;
  };

  const tagRowBelowTitle = () => {
    const mode = prefs().tagControl;
    if (mode === 'tabs') {
      return <BangumiTagTabsBar value={tag()} onChange={setTag} />;
    }
    if (mode === 'stacked') {
      return (
        <div class={STACK_SCROLL_CLASS}>
          <div class="flex flex-wrap items-center gap-1.5" role="listbox" aria-label="番剧分类">
            <For each={[...BANGUMI_STYLE_TAGS]}>
              {(t) => (
                <button type="button" class={TAG_CHIP_CLASS(tag() === t)} onClick={() => setTag(t)}>
                  {t}
                </button>
              )}
            </For>
          </div>
        </div>
      );
    }
    return null;
  };

  const MATCH_MODE_OPTIONS: Array<{
    value: BangumiSearchMatchMode;
    label: string;
    hint: string;
  }> = [
    { value: 'normal', label: '常规搜索', hint: '保留接口全部结果' },
    { value: 'exact', label: '精准搜索', hint: '片名须包含完整关键词' },
    { value: 'fuzzy', label: '模糊搜索', hint: '关键词字符按序出现在片名中' },
  ];

  const searchToolbar = () => (
    <>
      <ExpandableIconSearch
        value={ui().searchKeyword}
        onValueChange={setBangumiSearchKeyword}
        onSearch={() => void runSearch()}
        placeholder="搜索 Bangumi…"
        tooltip="搜索"
        aria-label="搜索 Bangumi"
        defaultExpanded
        disabled={ui().searchLoading}
      />
      <AppDropdownMenu>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={(triggerProps: Record<string, unknown>) => (
                <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                  <MoreIcon class="h-4 w-4" />
                  <span class="sr-only">更多</span>
                </AppDropdownMenuIconTrigger>
              )}
            />
          </AppTooltipTrigger>
          <AppTooltipContent>搜索筛选</AppTooltipContent>
        </AppTooltip>
        <AppDropdownMenuContent layout="compact" class="min-w-52">
          <AppDropdownMenuItem class="gap-2" onSelect={() => setSearchSortOpen(true)}>
            <SortIcon class="h-4 w-4 shrink-0" />
            <span>排序</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem class="gap-2" onSelect={() => setSearchTagsOpen(true)}>
            <TagIcon class="h-4 w-4 shrink-0" />
            <span>标签</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem class="gap-2" onSelect={() => setSearchSeasonOpen(true)}>
            <CalendarRangeIcon class="h-4 w-4 shrink-0" />
            <span>季度与日期</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem class="gap-2" onSelect={() => setSearchRangeOpen(true)}>
            <GaugeIcon class="h-4 w-4 shrink-0" />
            <span>数值范围</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem class="gap-2" onSelect={() => setSearchWeekdayOpen(true)}>
            <CalendarDaysIcon class="h-4 w-4 shrink-0" />
            <span>星期</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem class="gap-2" onSelect={() => setSearchClientFilterOpen(true)}>
            <EyeOffIcon class="h-4 w-4 shrink-0" />
            <span>过滤</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem class="pointer-events-none gap-2 text-xs text-muted-foreground">
            <FilterIcon class="h-4 w-4 shrink-0" />
            <span>搜索偏好</span>
          </AppDropdownMenuItem>
          <For each={MATCH_MODE_OPTIONS}>
            {(opt) => (
              <AppDropdownMenuItem
                onSelect={() => setBangumiSearchMatchMode(opt.value)}
                class="flex flex-col items-start gap-0.5"
              >
                <span class="flex w-full items-center gap-2">
                  <MenuRadioIndicator selected={ui().searchMatchMode === opt.value} />
                  <span>{opt.label}</span>
                </span>
                <span class="pl-6 text-[11px] text-muted-foreground">{opt.hint}</span>
              </AppDropdownMenuItem>
            )}
          </For>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );

  const sourceSearching = createMemo(
    () =>
      ui().view === 'sources' &&
      ui().sourceSearches.some((x) => x.status === 'pending'),
  );

  createEffect(() => {
    if (ui().view !== 'sources') return;
    const kw = ui().sourceKeyword;
    if (kw) setSourceDraftKw(kw);
  });

  const SOURCE_CONTROL_OPTIONS: Array<{
    value: BangumiSourceControl;
    label: string;
    hint: string;
  }> = [
    { value: 'stacked', label: '标签堆叠', hint: '全部源以徽标堆叠展示' },
    { value: 'tabs', label: '分页 Tabs', hint: '横向滚动切换源' },
    { value: 'menu', label: '下拉选择', hint: '用下拉菜单切换源' },
  ];

  const sourcesToolbar = () => (
    <>
      <ExpandableIconSearch
        value={sourceDraftKw()}
        onValueChange={setSourceDraftKw}
        onSearch={(v) => startBangumiSourceSearch(v)}
        placeholder="检索关键词…"
        tooltip="搜索"
        aria-label="检索关键词"
        defaultExpanded
        disabled={sourceSearching()}
      />
      <AppTooltip>
        <AppTooltipTrigger as="div">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-9 w-9"
            disabled={!sourceDraftKw().trim() && !sourceSearching()}
            aria-label={sourceSearching() ? '停止检索' : '开始检索'}
            onClick={() => {
              if (sourceSearching()) {
                stopBangumiSourceSearch();
                return;
              }
              startBangumiSourceSearch(sourceDraftKw());
            }}
          >
            <Show when={sourceSearching()} fallback={<PlayIcon class="h-4 w-4" />}>
              <SquareIcon class="h-4 w-4" />
            </Show>
          </Button>
        </AppTooltipTrigger>
        <AppTooltipContent>{sourceSearching() ? '停止检索' : '开始检索'}</AppTooltipContent>
      </AppTooltip>
      <AppDropdownMenu>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={(triggerProps: Record<string, unknown>) => (
                <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                  <MoreIcon class="h-4 w-4" />
                  <span class="sr-only">更多</span>
                </AppDropdownMenuIconTrigger>
              )}
            />
          </AppTooltipTrigger>
          <AppTooltipContent>更多</AppTooltipContent>
        </AppTooltip>
        <AppDropdownMenuContent layout="compact" class="min-w-52">
          <AppDropdownMenuItem class="pointer-events-none gap-2 text-xs text-muted-foreground">
            <span>源展示方式</span>
          </AppDropdownMenuItem>
          <For each={SOURCE_CONTROL_OPTIONS}>
            {(opt) => (
              <AppDropdownMenuItem
                onSelect={() => {
                  setBangumiModulePrefs({ sourceControl: opt.value });
                  setPrefsTick((n) => n + 1);
                }}
                class="flex flex-col items-start gap-0.5"
              >
                <span class="flex w-full items-center gap-2">
                  <MenuRadioIndicator selected={prefs().sourceControl === opt.value} />
                  <span>{opt.label}</span>
                </span>
                <span class="pl-6 text-[11px] text-muted-foreground">{opt.hint}</span>
              </AppDropdownMenuItem>
            )}
          </For>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );

  const sourcesBelow = () => (
    <div class="w-full min-w-0 px-1">
      <div class="search-loop-track">
        <div class={cn('search-loop-bar', sourceSearching() ? 'search-loop-bar--active' : '')} />
      </div>
    </div>
  );

  const shellLeading = () => {
    const v = ui().view;
    if (v === 'search') {
      return (
        <Button
          size="icon"
          variant="ghost"
          class="h-8 w-8"
          aria-label="返回番剧"
          onClick={() => backBangumiBrowse()}
        >
          <ChevronLeftIcon class="h-4 w-4" />
        </Button>
      );
    }
    if (v === 'sources') {
      return (
        <Button
          size="icon"
          variant="ghost"
          class="h-8 w-8"
          aria-label="返回详情"
          onClick={() => setBangumiView('detail')}
        >
          <ChevronLeftIcon class="h-4 w-4" />
        </Button>
      );
    }
    if (v === 'detail') {
      return (
        <Button
          size="icon"
          variant="ghost"
          class="h-8 w-8"
          aria-label="返回"
          onClick={() => backBangumiList()}
        >
          <ChevronLeftIcon class="h-4 w-4" />
        </Button>
      );
    }
    return undefined;
  };

  const shellTitle = () => {
    const v = ui().view;
    if (v === 'search') return '番剧搜索';
    if (v === 'sources') return '选源检索';
    if (v === 'detail') {
      const s = ui().subject;
      return s ? displayName(s, settingsState.app.language) : '番剧详情';
    }
    return undefined;
  };


  const shellDescription = () => {
    if (ui().view !== 'sources') return undefined;
    const kws = ui().sourceKeywords.length ? ui().sourceKeywords : [ui().sourceKeyword];
    const label = kws.filter(Boolean).map((k) => `「${k}」`).join(' · ') || '—';
    const pending = ui().sourceSearches.filter((x) => x.status === 'pending').length;
    const ok = ui().sourceSearches.filter((x) => x.status === 'success').length;
    return pending > 0
      ? `正在检索 ${label} · ${ok} 个源有结果 · 其余 ${pending} 个检索中`
      : `检索 ${label} · ${ok} 个源有结果`;
  };

  const isBrowse = () => ui().view === 'browse';

  return (
    <>
      <TvHubPageShell
        section="bangumi"
        title={shellTitle()}
        description={shellDescription()}
        leading={shellLeading()}
        scrollRef={setPageScrollEl}
        toolbar={
          isBrowse()
            ? browseToolbar()
            : ui().view === 'search'
              ? searchToolbar()
              : ui().view === 'sources'
                ? sourcesToolbar()
                : undefined
        }
        below={ui().view === 'sources' ? sourcesBelow() : undefined}
      >
        <Show when={isBrowse()}>
          <div class="flex flex-col gap-4 py-3">
            <section class="space-y-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="text-sm font-semibold">放送时间表</h3>
                <div class="flex flex-wrap gap-1">
                  <For each={[...BANGUMI_WEEKDAYS]}>
                    {(w) => (
                      <Button
                        size="sm"
                        variant={weekFilter() === w.weekday ? 'default' : 'outline'}
                        class="h-7 px-2 text-xs"
                        onClick={() => setWeekFilter(w.weekday)}
                      >
                        周{w.label}
                      </Button>
                    )}
                  </For>
                </div>
              </div>
              <Show when={showCalendarSkeleton()}>
                <TvBangumiCarouselSkeleton />
              </Show>
              <Show when={!showCalendarSkeleton()}>
                <SubjectCarousel
                  items={calendarFlat()}
                  onOpen={(s) => openBangumiSubject(s, { from: 'browse' })}
                  empty="暂无放送数据（需网络访问 Bangumi API）"
                />
              </Show>
            </section>

            <section class="space-y-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="text-sm font-semibold">
                  番剧列表
                  <Show when={listItems().length}>
                    <span class="ml-2 text-xs font-normal text-muted-foreground">
                      {listItems().length}
                      {listHasMore() ? '+' : ''} 部
                    </span>
                  </Show>
                </h3>
                <Show when={prefs().tagControl === 'menu'}>{tagControlBar()}</Show>
              </div>
              <Show when={prefs().tagControl !== 'menu'}>{tagRowBelowTitle()}</Show>

              <div class="relative w-full min-w-0">
                <Show when={showListSkeleton()}>
                  <TvVodGridSkeleton
                    class="min-h-40"
                    listInnerClass="px-1 pb-4 pt-1"
                    columnStrategy="container-responsive"
                  />
                </Show>
                <Show when={!showListSkeleton()}>
                  <Show
                    when={listItems().length > 0}
                    fallback={
                      <p class="px-1 py-6 text-xs text-muted-foreground">
                        {listLoading() ? '' : '暂无列表'}
                      </p>
                    }
                  >
                    <TvVodVirtualList
                      listInnerClass="px-1 pb-4 pt-1"
                      items={listVodItems}
                      columnStrategy="container-responsive"
                      externalScrollElement={pageScrollEl}
                      onScroll={(el) => {
                        const remain = el.scrollHeight - el.scrollTop - el.clientHeight;
                        if (remain < 280) void loadMoreList();
                      }}
                      scrollFooter={
                        <Show when={listLoadingMore() || !listHasMore()}>
                          <div class="py-4 text-center text-sm text-muted-foreground">
                            {listLoadingMore() ? '加载中…' : '没有更多了'}
                          </div>
                        </Show>
                      }
                    />
                  </Show>
                </Show>
              </div>
            </section>
          </div>
        </Show>

        <Show when={ui().view !== 'browse'}>
          <div class="flex flex-col gap-4 py-3">
            <Show when={ui().view === 'search'}>
              <BangumiSearchView
                scrollElement={pageScrollEl}
                onOpen={(s) => openBangumiSubject(s, { from: 'search' })}
                onLoadMore={() => void runSearch(undefined, { append: true })}
              />
            </Show>
            <Show when={ui().view === 'detail' || ui().view === 'sources'}>
              <BangumiDetailOrSources
                onKeepChanged={() => void refreshKeptIds()}
                sourceControl={prefs().sourceControl}
              />
            </Show>
          </div>
        </Show>
      </TvHubPageShell>

      <Show when={isBrowse()}>
        <QuickScrollButtons
          container={pageScrollEl}
          contentRevision={() =>
            `${tag()}|${weekFilter()}|${listItems().length}|${calendarFlat().length}`
          }
        />
      </Show>

      <BangumiTimelineDialog
        open={timelineOpen()}
        onOpenChange={setTimelineOpen}
        onApplied={() => setPrefsTick((n) => n + 1)}
      />
      <BangumiSearchSortDialog
        open={searchSortOpen()}
        onOpenChange={setSearchSortOpen}
        filter={() => ui().searchFilter}
        onApply={applySearchFilterAndRefresh}
      />
      <BangumiSearchTagsDialog
        open={searchTagsOpen()}
        onOpenChange={setSearchTagsOpen}
        filter={() => ui().searchFilter}
        onApply={applySearchFilterAndRefresh}
      />
      <BangumiSearchSeasonDialog
        open={searchSeasonOpen()}
        onOpenChange={setSearchSeasonOpen}
        filter={() => ui().searchFilter}
        onApply={applySearchFilterAndRefresh}
      />
      <BangumiSearchRangeDialog
        open={searchRangeOpen()}
        onOpenChange={setSearchRangeOpen}
        filter={() => ui().searchFilter}
        onApply={applySearchFilterAndRefresh}
      />
      <BangumiSearchWeekdayDialog
        open={searchWeekdayOpen()}
        onOpenChange={setSearchWeekdayOpen}
        filter={() => ui().searchFilter}
        onApply={applySearchFilterAndRefresh}
      />
      <BangumiSearchClientFilterDialog
        open={searchClientFilterOpen()}
        onOpenChange={setSearchClientFilterOpen}
        filter={() => ui().searchFilter}
        onApply={(patch) => setBangumiSearchFilter(patch)}
      />
    </>
  );
}

function BangumiSearchView(props: {
  onOpen: (s: BangumiSubject) => void;
  onLoadMore: () => void;
  scrollElement: Accessor<HTMLDivElement | undefined>;
}) {
  const ui = getBangumiUi;
  const lang = () => settingsState.app.language;
  const showScore = () => getBangumiModulePrefs().showScoreBadge;

  const searchVodItems = createMemo((): TvVodListItem[] =>
    ui().searchHits.map((s) => ({
      key: `bgm-search|${s.id}|${lang()}`,
      title: displayName(s, lang()),
      coverUrl: s.cover || undefined,
      badge: showScore() && s.score > 0 ? s.score.toFixed(1) : undefined,
      onOpen: () => props.onOpen(s),
    })),
  );

  return (
    <section class="space-y-3">
      <Show when={ui().searchLoading}>
        <TvVodGridSkeleton
          class="min-h-40"
          listInnerClass="px-1 pb-4 pt-1"
          columnStrategy="container-responsive"
          count={12}
        />
      </Show>
      <Show
        when={
          !ui().searchLoading &&
          !ui().searchKeyword.trim() &&
          ui().searchRawHits.length === 0
        }
      >
        <p class="py-10 text-center text-sm text-muted-foreground">
          输入关键词，或在「更多」中配置筛选后搜索
        </p>
      </Show>
      <Show when={!ui().searchLoading && (ui().searchKeyword.trim() || ui().searchRawHits.length > 0)}>
        <Show
          when={ui().searchHits.length}
          fallback={<p class="text-xs text-muted-foreground">无匹配结果</p>}
        >
          <TvVodVirtualList
            listInnerClass="px-1 pb-4 pt-1"
            items={searchVodItems}
            columnStrategy="container-responsive"
            externalScrollElement={props.scrollElement}
            scrollFooter={
              <div class="flex justify-center py-3">
                <Show when={ui().searchHasMore}>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ui().searchLoadingMore}
                    onClick={() => props.onLoadMore()}
                  >
                    {ui().searchLoadingMore ? '加载中…' : '加载更多'}
                  </Button>
                </Show>
                <Show when={!ui().searchHasMore && ui().searchHits.length}>
                  <p class="text-xs text-muted-foreground">没有更多了</p>
                </Show>
              </div>
            }
          />
        </Show>
      </Show>
    </section>
  );
}

function SubjectCarousel(props: {
  items: BangumiSubject[];
  onOpen: (s: BangumiSubject) => void;
  empty?: string;
}) {
  const lang = () => settingsState.app.language;
  const showScore = () => getBangumiModulePrefs().showScoreBadge;
  return (
    <Show
      when={props.items.length}
      fallback={<p class="text-xs text-muted-foreground">{props.empty || '暂无'}</p>}
    >
      <Carousel opts={{ align: 'start', dragFree: true }} class="w-full px-10">
        <CarouselContent class="-ml-2">
          <For each={props.items}>
            {(s) => (
              <CarouselItem class="basis-[28%] pl-2 sm:basis-[22%] md:basis-[16%] lg:basis-[12%]">
                <TvVodCard
                  title={displayName(s, lang())}
                  coverUrl={s.cover || undefined}
                  badge={showScore() && s.score > 0 ? s.score.toFixed(1) : undefined}
                  onOpen={() => props.onOpen(s)}
                />
              </CarouselItem>
            )}
          </For>
        </CarouselContent>
        <CarouselPrevious class="left-0" />
        <CarouselNext class="right-0" />
      </Carousel>
    </Show>
  );
}

function BangumiDetailOrSources(props: {
  onKeepChanged?: () => void;
  sourceControl?: BangumiSourceControl;
}) {
  const ui = getBangumiUi;
  return (
    <Show
      when={ui().view === 'sources'}
      fallback={<BangumiDetailView onKeepChanged={props.onKeepChanged} />}
    >
      <BangumiSourcesView sourceControl={props.sourceControl ?? 'stacked'} />
    </Show>
  );
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}天前`;
  return iso.slice(0, 10);
}

function ScoreStars(props: { score?: number; class?: string }) {
  const filled = () => {
    const s = Number(props.score ?? 0);
    if (!Number.isFinite(s) || s <= 0) return 0;
    // Bangumi 短评多为 1–10；星级按 /2
    return Math.max(0, Math.min(5, Math.round(s > 5 ? s / 2 : s)));
  };
  return (
    <span class={cn('inline-flex items-center gap-0.5 text-amber-500', props.class)} aria-hidden>
      <For each={[1, 2, 3, 4, 5]}>
        {(i) => (
          <StarIcon
            class={cn('h-3 w-3', i <= filled() ? 'fill-current' : 'opacity-25')}
          />
        )}
      </For>
    </span>
  );
}

type DetailTab = 'overview' | 'comments' | 'characters' | 'reviews' | 'staff';

const DETAIL_TABS: { value: DetailTab; label: string }[] = [
  { value: 'overview', label: '概览' },
  { value: 'comments', label: '吐槽' },
  { value: 'characters', label: '角色' },
  { value: 'reviews', label: '评论' },
  { value: 'staff', label: '制作人员' },
];

/** 会话级 Tab 缓存（按番剧 id），切换 Tab / 往返详情不重复请求 */
const bangumiCommentsCache = new Map<number, BangumiComment[]>();
const bangumiCharactersCache = new Map<number, BangumiCharacter[]>();
const bangumiStaffCache = new Map<number, BangumiStaff[]>();

/** 骨架块：对齐实际列表项尺寸/圆角，不用 Skeleton 组件 */
function Pulse(props: { class?: string }) {
  return <div class={cn(exploreSkeletonPulseClass, props.class)} aria-hidden />;
}

function CommentsSkeleton() {
  return (
    <ul class="space-y-3" aria-busy="true" aria-label="加载吐槽">
      <For each={[0, 1, 2, 3, 4]}>
        {() => (
          <li class="flex gap-2.5 rounded-lg border border-transparent p-1.5 text-xs">
            <Pulse class="h-9 w-9 shrink-0 rounded-full" />
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex items-center gap-2">
                <Pulse class="h-3.5 w-20 rounded" />
                <Pulse class="h-3 w-14 rounded" />
                <Pulse class="ml-auto h-3 w-12 rounded" />
              </div>
              <Pulse class="h-3 w-[92%] rounded" />
              <Pulse class="h-3 w-[70%] rounded" />
            </div>
          </li>
        )}
      </For>
    </ul>
  );
}

function CharacterGridSkeleton() {
  return (
    <ul class="grid gap-2 sm:grid-cols-2" aria-busy="true" aria-label="加载角色">
      <For each={[0, 1, 2, 3]}>
        {() => (
          <li class="flex gap-2.5 rounded-lg border border-border/50 p-2 text-xs">
            <Pulse class="h-14 w-14 shrink-0 rounded-md" />
            <div class="min-w-0 flex-1 space-y-0.5">
              <Pulse class="mt-0.5 h-3.5 w-[65%] rounded" />
              <Pulse class="h-2.5 w-[45%] rounded" />
              <Pulse class="h-2.5 w-12 rounded" />
              <Pulse class="h-2.5 w-[55%] rounded" />
            </div>
          </li>
        )}
      </For>
    </ul>
  );
}

function StaffListSkeleton() {
  return (
    <ul class="space-y-2" aria-busy="true" aria-label="加载制作人员">
      <For each={[0, 1, 2, 3, 4]}>
        {() => (
          <li class="flex items-center gap-2.5 rounded-lg border border-border/50 p-2 text-xs">
            <Pulse class="h-12 w-12 shrink-0 rounded-full" />
            <div class="min-w-0 flex-1 space-y-0.5">
              <Pulse class="h-3.5 w-[50%] rounded" />
              <Pulse class="h-2.5 w-[35%] rounded" />
              <Pulse class="h-2.5 w-[60%] rounded" />
            </div>
          </li>
        )}
      </For>
    </ul>
  );
}

function BangumiDetailView(props: { onKeepChanged?: () => void }) {
  const ui = getBangumiUi;
  const subject = () => ui().subject;
  const [kept, setKept] = createSignal(false);
  const [tab, setTab] = createSignal<DetailTab>('overview');
  const [summaryExpanded, setSummaryExpanded] = createSignal(false);
  const [coverPreviewOpen, setCoverPreviewOpen] = createSignal(false);

  // 卡片窄宽时改为上下布局
  const [cardEl, setCardEl] = createSignal<HTMLDivElement>();
  const [stacked, setStacked] = createSignal(false);

  // Tab 数据（会话级缓存 + 加载态）
  const [comments, setComments] = createSignal<BangumiComment[]>([]);
  const [commentsLoading, setCommentsLoading] = createSignal(false);
  const [commentsLoadingMore, setCommentsLoadingMore] = createSignal(false);
  const [characters, setCharacters] = createSignal<BangumiCharacter[]>([]);
  const [charactersLoading, setCharactersLoading] = createSignal(false);
  const [staff, setStaff] = createSignal<BangumiStaff[]>([]);
  const [staffLoading, setStaffLoading] = createSignal(false);

  createEffect(() => {
    const el = cardEl();
    if (!el || typeof ResizeObserver === 'undefined') return;
    const apply = () => setStacked(el.clientWidth < 440);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  });

  // 番剧切换：重置 + 从缓存 hydrate
  createEffect(() => {
    const id = ui().subjectId;
    if (!id) return;
    setTab('overview');
    setSummaryExpanded(false);
    setCoverPreviewOpen(false);
    setComments(bangumiCommentsCache.get(id) ?? []);
    setCharacters(bangumiCharactersCache.get(id) ?? []);
    setStaff(bangumiStaffCache.get(id) ?? []);
    void isBangumiKept(id).then(setKept);
    // 列表项常缺 summary/tags/rank，进入详情补全
    void fetchBangumiSubject(id)
      .then((full) => patchBangumiSubject(full))
      .catch(() => undefined);
  });

  // 懒加载当前 Tab（命中缓存则跳过网络）
  createEffect(() => {
    const id = ui().subjectId;
    const t = tab();
    if (!id) return;
    if (t === 'comments') void ensureComments(id);
    else if (t === 'characters') void ensureCharacters(id);
    else if (t === 'staff') void ensureStaff(id);
  });

  async function ensureComments(id: number) {
    if (bangumiCommentsCache.has(id)) return;
    setCommentsLoading(true);
    try {
      const data = await fetchBangumiComments(id, { limit: 20 });
      bangumiCommentsCache.set(id, data);
      if (ui().subjectId === id) setComments(data);
    } catch {
      /* 网络失败保留空表 */
    } finally {
      if (ui().subjectId === id) setCommentsLoading(false);
    }
  }

  async function ensureCharacters(id: number) {
    if (bangumiCharactersCache.has(id)) return;
    setCharactersLoading(true);
    try {
      const data = await fetchBangumiCharacters(id);
      bangumiCharactersCache.set(id, data);
      if (ui().subjectId === id) setCharacters(data);
    } catch {
      /* */
    } finally {
      if (ui().subjectId === id) setCharactersLoading(false);
    }
  }

  async function ensureStaff(id: number) {
    if (bangumiStaffCache.has(id)) return;
    setStaffLoading(true);
    try {
      const data = await fetchBangumiStaff(id);
      bangumiStaffCache.set(id, data);
      if (ui().subjectId === id) setStaff(data);
    } catch {
      /* */
    } finally {
      if (ui().subjectId === id) setStaffLoading(false);
    }
  }

  async function toggleKeep() {
    const s = subject();
    if (!s) return;
    if (kept()) {
      await removeBangumiKeep(s.id);
      setKept(false);
    } else {
      await upsertBangumiKeep({
        bgmId: s.id,
        title: displayName(s, settingsState.app.language),
        cover: s.cover,
      });
      setKept(true);
    }
    props.onKeepChanged?.();
  }

  function openSources() {
    const s = subject();
    if (!s) return;
    // 主程序语言优先，其次原名；两种名称都检索
    const keywords = bangumiSourceSearchKeywords(s, settingsState.app.language);
    startBangumiSourceSearch(keywords);
  }

  async function loadMoreComments() {
    const id = subject()?.id;
    if (!id || commentsLoadingMore()) return;
    setCommentsLoadingMore(true);
    try {
      const nextOffset = comments().length;
      const more = await fetchBangumiComments(id, { offset: nextOffset, limit: 20 });
      if (more.length) {
        const merged = [...comments(), ...more];
        bangumiCommentsCache.set(id, merged);
        setComments(merged);
      } else {
        void showAppToast({ title: '没有更多吐槽了', variant: 'default' });
      }
    } finally {
      setCommentsLoadingMore(false);
    }
  }

  const tagItems = createMemo(() => {
    const s = subject();
    if (!s) return [];
    if (s.tagItems?.length) return s.tagItems;
    return (s.tags || []).map((name) => ({ name, count: 0 }));
  });

  const summaryText = () => subject()?.summary?.trim() || '暂无简介';
  const summaryLong = () => summaryText().length > 180;

  const commentsBusy = () => commentsLoading() && comments().length === 0;
  const charactersBusy = () => charactersLoading() && characters().length === 0;
  const staffBusy = () => staffLoading() && staff().length === 0;

  return (
    <Show when={subject()}>
      {(s) => (
    <div class="flex flex-col gap-3 pb-3">
      {/* 顶部信息卡片 */}
      <div
        ref={setCardEl}
        class={cn(
          'flex shrink-0 gap-3 rounded-lg border border-border/60 bg-card p-3',
          stacked() ? 'flex-col items-stretch' : 'items-stretch',
        )}
      >
        <Show when={s().cover}>
          <button
            type="button"
            onClick={() => setCoverPreviewOpen(true)}
            class={cn(
              'group relative shrink-0 cursor-zoom-in overflow-hidden rounded-md shadow-sm',
              stacked() ? 'mx-auto h-56 w-40' : 'h-48 w-32',
            )}
            aria-label="查看封面大图"
          >
            <img
              src={s().cover}
              alt=""
              class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
            />
          </button>
        </Show>
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <p
            class="truncate text-base font-semibold"
            title={displayName(s(), settingsState.app.language)}
          >
            {displayName(s(), settingsState.app.language)}
          </p>
          <Show when={s().airDate}>
            <p class="truncate text-xs font-medium text-emerald-600 dark:text-emerald-400">
              放送开始: {s().airDate}
            </p>
          </Show>
          <Show when={s().score > 0 || s().votes > 0}>
            <div class="flex items-center gap-2 overflow-hidden text-xs">
              <Show when={s().score > 0}>
                <span class="shrink-0 text-sm font-bold tabular-nums">
                  {s().score.toFixed(1)}
                </span>
                <ScoreStars score={s().score} class="shrink-0" />
              </Show>
              <Show when={s().votes > 0}>
                <span class="truncate text-muted-foreground">{s().votes} 人评分</span>
              </Show>
            </div>
          </Show>
          <Show when={s().rank > 0}>
            <p class="truncate text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Bangumi Ranked: #{s().rank}
            </p>
          </Show>
          <Show when={s().eps}>
            <p class="truncate text-xs text-muted-foreground">全 {s().eps} 话</p>
          </Show>

          <div class="mt-auto flex items-center gap-1 pt-1">
            <AppTooltip>
              <AppTooltipTrigger as="div">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class={cn('h-9 w-9', kept() && 'text-rose-500')}
                  onClick={() => void toggleKeep()}
                  aria-label={kept() ? '取消追番' : '追番'}
                >
                  <Heart class={cn('h-5 w-5', kept() && 'fill-current')} />
                </Button>
              </AppTooltipTrigger>
              <AppTooltipContent layer="viewer">{kept() ? '已追' : '未追'}</AppTooltipContent>
            </AppTooltip>
            <AppTooltip>
              <AppTooltipTrigger as="div">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="h-9 w-9 text-emerald-600 dark:text-emerald-400"
                  onClick={() => void openSources()}
                  aria-label="开始观看"
                >
                  <PlayIcon class="h-5 w-5" />
                </Button>
              </AppTooltipTrigger>
              <AppTooltipContent layer="viewer">开始观看</AppTooltipContent>
            </AppTooltip>
          </div>
        </div>
      </div>

      <AppTabs
        value={tab()}
        onChange={(v) => setTab(v as DetailTab)}
        ariaLabel="番剧详情分区"
        variant="settings-equal-wrap"
        items={DETAIL_TABS}
        class="shrink-0"
      />

      <div class="min-w-0">
        <Show when={tab() === 'overview'}>
          <div class="space-y-4">
            <section class="space-y-2">
              <h3 class="text-sm font-semibold">简介</h3>
              <p
                class={cn(
                  'whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground',
                  !summaryExpanded() && summaryLong() && 'line-clamp-6',
                )}
              >
                {summaryText()}
              </p>
              <Show when={summaryLong()}>
                <div class="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    class="h-7 text-xs"
                    onClick={() => setSummaryExpanded((v) => !v)}
                  >
                    {summaryExpanded() ? '加载更少' : '加载更多'}
                  </Button>
                </div>
              </Show>
            </section>
            <Show when={tagItems().length}>
              <section class="space-y-2">
                <h3 class="text-sm font-semibold">标签</h3>
                <div class="flex flex-wrap gap-1.5">
                  <For each={tagItems()}>
                    {(t) => (
                      <span class="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[11px] transition-colors hover:bg-muted/70">
                        <span>{t.name}</span>
                        <Show when={t.count > 0}>
                          <span class="rounded bg-muted-foreground/15 px-1 text-[10px] text-muted-foreground">
                            {t.count}
                          </span>
                        </Show>
                      </span>
                    )}
                  </For>
                </div>
              </section>
            </Show>
          </div>
        </Show>

        <Show when={tab() === 'comments'}>
          <Show when={!commentsBusy()} fallback={<CommentsSkeleton />}>
            <Show
              when={comments().length}
              fallback={<p class="py-8 text-center text-xs text-muted-foreground">暂无吐槽</p>}
            >
              <ul class="space-y-3">
                <For each={comments()}>
                  {(c) => (
                    <li class="flex gap-2.5 rounded-lg border border-transparent p-1.5 text-xs transition-colors hover:border-border/50 hover:bg-muted/30">
                      <div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-500/20 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                        <Show when={c.avatar} fallback={c.userName.slice(0, 1) || '?'}>
                          <img src={c.avatar} alt="" class="h-full w-full object-cover" />
                        </Show>
                      </div>
                      <div class="min-w-0 flex-1 space-y-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="font-medium">{c.userName}</span>
                          <Show when={(c.score ?? 0) > 0}>
                            <ScoreStars score={c.score} />
                          </Show>
                          <Show when={c.updatedAt}>
                            <span class="ml-auto text-muted-foreground">
                              {formatRelativeTime(c.updatedAt)}
                            </span>
                          </Show>
                        </div>
                        <p class="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                          {c.comment}
                        </p>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
              <div class="mt-3 flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={commentsLoadingMore()}
                  onClick={() => void loadMoreComments()}
                >
                  {commentsLoadingMore() ? '加载中…' : '加载更多'}
                </Button>
              </div>
            </Show>
          </Show>
        </Show>

        <Show when={tab() === 'characters'}>
          <Show when={!charactersBusy()} fallback={<CharacterGridSkeleton />}>
            <Show
              when={characters().length}
              fallback={<p class="py-8 text-center text-xs text-muted-foreground">暂无角色信息</p>}
            >
              <ul class="grid gap-2 sm:grid-cols-2">
                <For each={characters()}>
                  {(ch) => (
                    <li class="flex gap-2.5 rounded-lg border border-border/50 p-2 text-xs transition-colors hover:bg-muted/30">
                      <div class="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                        <Show when={ch.avatar}>
                          <img src={ch.avatar} alt="" class="h-full w-full object-cover" />
                        </Show>
                      </div>
                      <div class="min-w-0 flex-1 space-y-0.5">
                        <p class="truncate font-medium">{ch.nameCn || ch.name}</p>
                        <Show when={ch.nameCn && ch.name && ch.nameCn !== ch.name}>
                          <p class="truncate text-[11px] text-muted-foreground">{ch.name}</p>
                        </Show>
                        <p class="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          {ch.relation}
                        </p>
                        <Show when={ch.actors.length}>
                          <p class="truncate text-[11px] text-muted-foreground">
                            CV: {ch.actors.join(' / ')}
                          </p>
                        </Show>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </Show>

        <Show when={tab() === 'reviews'}>
          <div class="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <MessageSquare class="h-8 w-8 opacity-40" />
            <p class="text-xs">长评区暂未接入（对齐 Kazumi TODO）。</p>
          </div>
        </Show>

        <Show when={tab() === 'staff'}>
          <Show when={!staffBusy()} fallback={<StaffListSkeleton />}>
            <Show
              when={staff().length}
              fallback={<p class="py-8 text-center text-xs text-muted-foreground">暂无制作人员信息</p>}
            >
              <ul class="space-y-2">
                <For each={staff()}>
                  {(st) => (
                    <li class="flex items-center gap-2.5 rounded-lg border border-border/50 p-2 text-xs transition-colors hover:bg-muted/30">
                      <div class="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
                        <Show when={st.avatar}>
                          <img src={st.avatar} alt="" class="h-full w-full object-cover" />
                        </Show>
                      </div>
                      <div class="min-w-0 flex-1 space-y-0.5">
                        <p class="truncate font-medium">{st.nameCn || st.name}</p>
                        <Show when={st.nameCn && st.name && st.nameCn !== st.name}>
                          <p class="truncate text-[11px] text-muted-foreground">{st.name}</p>
                        </Show>
                        <Show when={st.positions.length}>
                          <p class="truncate text-[11px] text-emerald-600 dark:text-emerald-400">
                            {st.positions.join(' / ')}
                          </p>
                        </Show>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </Show>
      </div>

      <Show when={s().cover}>
        <BookCoverPreviewDialog
          open={coverPreviewOpen()}
          onOpenChange={setCoverPreviewOpen}
          coverUrl={s().cover}
          bookUrl={s().cover}
          name={displayName(s(), settingsState.app.language)}
        />
      </Show>
    </div>
      )}
    </Show>
  );
}

/**
 * 对齐 Kazumi SourceSheet：立刻进入选源视图，并发渐进检索各规则。
 * keyword 可为单个（手动）或多个（语言名 + 原名）。
 */
function startBangumiSourceSearch(keyword: string | string[]) {
  const keywords = (Array.isArray(keyword) ? keyword : [keyword])
    .map((k) => k.trim())
    .filter(Boolean);
  if (!keywords.length) {
    void showAppToast({ title: '无法检索', description: '番剧标题为空', variant: 'warning' });
    return;
  }
  const rules = loadBangumiRules().filter((r) => r.enabled);
  if (!rules.length) {
    void showAppToast({
      title: '没有可用规则',
      description: '请在影视设置 → 番剧中添加或启用规则',
      variant: 'warning',
    });
    return;
  }
  const session = beginBangumiSourceSearch(
    rules.map((r) => ({ id: r.id, name: r.name })),
    keywords,
  );
  void searchRulesProgressive(rules, keywords, {
    isCancelled: () => getBangumiUi().sourceSession !== session,
    onRuleDone: (rule, result) => {
      if ('error' in result) {
        updateBangumiRuleSearch(session, rule.id, {
          status: 'error',
          hits: [],
          error: result.error,
        });
        return;
      }
      updateBangumiRuleSearch(session, rule.id, {
        status: result.hits.length ? 'success' : 'empty',
        hits: result.hits,
        error: undefined,
      });
    },
  });
}

function sourceStatusDotClass(status: string): string {
  switch (status) {
    case 'success':
      return 'bg-emerald-500';
    case 'empty':
      return 'bg-amber-500';
    case 'error':
      return 'bg-destructive';
    default:
      return 'bg-muted-foreground/50';
  }
}

function BangumiSourcesView(props: { sourceControl: BangumiSourceControl }) {
  const ui = getBangumiUi;
  const [busy, setBusy] = createSignal('');
  const [episodes, setEpisodes] = createSignal<
    { name: string; url: string; ruleId: string }[]
  >([]);
  const [activeHit, setActiveHit] = createSignal<BangumiSearchHit | null>(null);
  const [activeRuleId, setActiveRuleId] = createSignal('');
  /** 外置/libmpv 抽流中：对话框标题用分集名 */
  const [resolvingEpisode, setResolvingEpisode] = createSignal('');

  const sourceControl = () => props.sourceControl;

  createEffect(() => {
    const list = ui().sourceSearches;
    if (!list.length) {
      setActiveRuleId('');
      return;
    }
    const cur = activeRuleId();
    if (cur && list.some((x) => x.ruleId === cur)) return;
    const firstOk = list.find((x) => x.status === 'success');
    setActiveRuleId((firstOk || list[0]!).ruleId);
  });

  const activeSearch = createMemo(
    () => ui().sourceSearches.find((x) => x.ruleId === activeRuleId()) ?? null,
  );

  const pendingCount = createMemo(
    () => ui().sourceSearches.filter((x) => x.status === 'pending').length,
  );
  const successCount = createMemo(
    () => ui().sourceSearches.filter((x) => x.status === 'success').length,
  );

  const ruleStatusTitle = (item: { ruleName: string; status: string; hits: BangumiSearchHit[] }) =>
    `${item.ruleName} · ${
      item.status === 'pending'
        ? '检索中'
        : item.status === 'success'
          ? `${item.hits.length} 条`
          : item.status === 'empty'
            ? '无结果'
            : '失败'
    }`;

  function selectRule(ruleId: string) {
    setActiveRuleId(ruleId);
    setEpisodes([]);
    setActiveHit(null);
  }

  async function retryRule(ruleId: string) {
    const rule = loadBangumiRules().find((r) => r.id === ruleId);
    if (!rule) return;
    const kws = ui().sourceKeywords.length
      ? ui().sourceKeywords
      : [ui().sourceKeyword].filter(Boolean);
    if (!kws.length) return;
    const session = resetBangumiRuleSearch(ruleId);
    setEpisodes([]);
    setActiveHit(null);
    try {
      const hits =
        kws.length > 1
          ? await searchByRuleKeywords(rule, kws)
          : await searchByRule(rule, kws[0]!);
      if (getBangumiUi().sourceSession !== session) return;
      updateBangumiRuleSearch(session, ruleId, {
        status: hits.length ? 'success' : 'empty',
        hits,
        error: undefined,
      });
    } catch (e) {
      if (getBangumiUi().sourceSession !== session) return;
      updateBangumiRuleSearch(session, ruleId, {
        status: 'error',
        hits: [],
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function pickHit(hit: BangumiSearchHit) {
    setActiveHit(hit);
    setBusy('加载分集…');
    try {
      const rule = loadBangumiRules().find((r) => r.id === hit.ruleId);
      if (!rule) throw new Error('规则不存在');
      const detail = await loadDetail(rule, hit.url);
      setEpisodes(
        detail.episodes.map((ep) => ({
          name: ep.name,
          url: ep.url,
          ruleId: hit.ruleId,
        })),
      );
    } catch (e) {
      void showAppToast({
        title: '分集失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
      setEpisodes([]);
    } finally {
      setBusy('');
    }
  }

  type BangumiEpisodeRef = { name: string; url: string; ruleId: string };

  const episodeTitle = (epName: string) => {
    const s = ui().subject;
    const base = s ? displayName(s, settingsState.app.language) : '';
    return `${base} ${epName}`.trim();
  };

  /** 播放成功后的记账：追番历史 + 分集直链缓存 */
  async function recordEpisodePlay(ep: BangumiEpisodeRef, mediaUrl: string, detailUrl?: string) {
    const s = ui().subject;
    if (!s) return;
    await upsertBangumiPlayHistory({
      bgmId: s.id,
      title: displayName(s, settingsState.app.language),
      cover: s.cover,
      episodeName: ep.name,
      ruleId: ep.ruleId,
      detailUrl,
      episodeUrl: ep.url,
    });
    void cacheBangumiEpisode({
      bgmId: s.id,
      episodeUrl: ep.url,
      mediaUrl,
      title: episodeTitle(ep.name),
    }).catch(() => undefined);
  }

  /** Artplayer：先进播放页（播放器内显示「正在获取播放链接」），再抽流回写 */
  async function resolveIntoPlayPage(ep: BangumiEpisodeRef, detailUrl?: string) {
    const rule = loadBangumiRules().find((r) => r.id === ep.ruleId);
    if (!rule) {
      failTvPlaySession('规则不存在');
      return;
    }
    try {
      const resolved = await resolvePlayUrl(rule, ep.url);
      applyTvPlaySessionUrl({ url: resolved.url, headers: resolved.headers });
      await recordEpisodePlay(ep, resolved.url, detailUrl);
    } catch (e) {
      failTvPlaySession(e instanceof Error ? e.message : String(e));
    }
  }

  function startPlayPageSession(ep: BangumiEpisodeRef) {
    const list = episodes();
    const index = Math.max(
      0,
      list.findIndex((x) => x.url === ep.url),
    );
    const s = ui().subject;
    const ruleName =
      loadBangumiRules().find((r) => r.id === ep.ruleId)?.name || '番剧源';
    const detailUrl = activeHit()?.url;
    beginTvPlaySession({
      vod: {
        vod_id: `bangumi:${s?.id ?? ep.ruleId}`,
        vod_name: s ? displayName(s, settingsState.app.language) : '番剧',
        vod_pic: s?.cover ?? '',
        siteKey: 'bangumi',
      },
      flags: [
        {
          flag: ruleName,
          episodes: list.map((x) => ({ name: x.name, url: x.url })),
        },
      ],
      flagIndex: 0,
      episodeIndex: index,
      resolver: async ({ episodeIndex }) => {
        const target = list[episodeIndex];
        if (!target) return;
        setTvPlaySessionLoading();
        await resolveIntoPlayPage(target, detailUrl);
      },
    });
    void resolveIntoPlayPage(list[index] ?? ep, detailUrl);
  }

  /** 外置播放器 / libmpv：无播放页可承载 loading，用对话框提示 */
  async function playViaExternalEngine(ep: BangumiEpisodeRef) {
    const rule = loadBangumiRules().find((r) => r.id === ep.ruleId);
    if (!rule) return;
    setResolvingEpisode(ep.name);
    try {
      const resolved = await resolvePlayUrl(rule, ep.url);
      await openRoutedPlayback(resolved.url, {
        title: episodeTitle(ep.name),
        sourceKind: 'bangumi',
        headers: resolved.headers,
      });
      await recordEpisodePlay(ep, resolved.url, activeHit()?.url);
      try {
        const matched = await tryMatchDanmaku({
          fileNameHint: episodeTitle(ep.name),
          playUrl: resolved.url,
        });
        if (matched) {
          void showAppToast({
            title: '弹幕已匹配',
            description: `${matched.label}（${matched.danmu.length} 条）`,
            variant: 'success',
          });
        }
      } catch {
        /* 弹幕失败不影响播放 */
      }
    } catch (e) {
      void showAppToast({
        title: '播放失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setResolvingEpisode('');
    }
  }

  async function playEp(ep: BangumiEpisodeRef) {
    const rule = loadBangumiRules().find((r) => r.id === ep.ruleId);
    if (!rule || !ui().subject) return;
    const engine = resolvePlaybackEngine({ url: ep.url, sourceKind: 'bangumi' });
    if (engine === 'artplayer') {
      startPlayPageSession(ep);
      return;
    }
    await playViaExternalEngine(ep);
  }

  const ruleChips = () => (
    <div class={cn(STACK_SCROLL_CLASS, 'shrink-0')} role="listbox" aria-label="规则源">
      <div class="flex flex-wrap gap-1.5">
        <For each={ui().sourceSearches}>
          {(item) => (
            <button
              type="button"
              class={cn(
                'inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
                activeRuleId() === item.ruleId
                  ? 'border-primary bg-muted/50'
                  : 'border-border/60 hover:bg-muted/30',
              )}
              title={ruleStatusTitle(item)}
              onClick={() => selectRule(item.ruleId)}
            >
              <span
                class={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  sourceStatusDotClass(item.status),
                  item.status === 'pending' && 'animate-pulse',
                )}
              />
              <span class="truncate">{item.ruleName}</span>
            </button>
          )}
        </For>
      </div>
    </div>
  );

  const ruleTabs = () => (
    <div class="w-full min-w-0">
      <BangumiSourceTabsBar
        value={activeRuleId()}
        onChange={selectRule}
        items={ui().sourceSearches.map((x) => ({
          value: x.ruleId,
          label: x.ruleName,
          status: x.status,
        }))}
      />
    </div>
  );

  const ruleMenu = () => {
    const labelOf = (id: string) =>
      ui().sourceSearches.find((x) => x.ruleId === id)?.ruleName ?? '选择源';
    return (
      <div class="flex max-w-sm items-center gap-2">
        <AppSelect
          value={activeRuleId()}
          onChange={(value) => {
            if (value == null || value === activeRuleId()) return;
            selectRule(value);
          }}
          options={ui().sourceSearches.map((x) => x.ruleId)}
          itemComponent={(itemProps) => {
            const id = String(itemProps.item.rawValue);
            const item = ui().sourceSearches.find((x) => x.ruleId === id);
            return (
              <AppSelectItem item={itemProps.item}>
                <span class="inline-flex items-center gap-1.5">
                  <span
                    class={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      sourceStatusDotClass(item?.status ?? 'pending'),
                    )}
                  />
                  <span class="truncate">{item?.ruleName ?? id}</span>
                  <span class="text-[11px] text-muted-foreground">
                    {item?.status === 'pending'
                      ? '检索中'
                      : item?.status === 'success'
                        ? `${item.hits.length} 条`
                        : item?.status === 'empty'
                          ? '无结果'
                          : '失败'}
                  </span>
                </span>
              </AppSelectItem>
            );
          }}
        >
          <AppSelectTrigger
            layout="compact"
            class="h-8 w-44 justify-between gap-1 border-border/60 bg-background px-2.5 font-normal"
            aria-label="选择源"
          >
            <AppSelectValue>{() => labelOf(activeRuleId())}</AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <ViewerAppSelectContent>
            <AppSelectListbox />
          </ViewerAppSelectContent>
        </AppSelect>
      </div>
    );
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3">
      <p class="text-[11px] text-muted-foreground">
        {successCount()} 个源有结果
        <Show when={pendingCount() > 0}>
          <span> · 其余 {pendingCount()} 个检索中</span>
        </Show>
      </p>

      <Show
        when={ui().sourceSearches.length}
        fallback={
          <p class="text-xs text-muted-foreground">
            无可用规则。请在影视设置 → 番剧中添加/订阅规则。
          </p>
        }
      >
        <div class="flex min-h-0 flex-1 flex-col gap-3">
          <Show when={sourceControl() === 'stacked'}>{ruleChips()}</Show>
          <Show when={sourceControl() === 'tabs'}>{ruleTabs()}</Show>
          <Show when={sourceControl() === 'menu'}>{ruleMenu()}</Show>

          <Show when={activeSearch()} keyed>
            {(cur) => (
              <div class="flex min-h-0 flex-1 flex-col gap-2">
                <Show when={cur.status === 'pending'}>
                  <div class="flex flex-col items-center gap-2 py-10 text-xs text-muted-foreground">
                    <div
                      class={cn(exploreSkeletonPulseClass, 'h-8 w-8 rounded-full')}
                      aria-hidden
                    />
                    <p>正在检索…</p>
                  </div>
                </Show>

                <Show when={cur.status === 'error'}>
                  <div class="flex flex-col items-center gap-2 py-8 text-center text-xs">
                    <p class="text-destructive">检索失败</p>
                    <p class="max-w-md text-muted-foreground line-clamp-3" title={cur.error}>
                      {cur.error || '未知错误'}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => void retryRule(cur.ruleId)}>
                      重试
                    </Button>
                  </div>
                </Show>

                <Show when={cur.status === 'empty'}>
                  <div class="flex flex-col items-center gap-2 py-8 text-center text-xs text-muted-foreground">
                    <p>无结果</p>
                    <Button size="sm" variant="outline" onClick={() => void retryRule(cur.ruleId)}>
                      重试
                    </Button>
                  </div>
                </Show>

                <Show when={cur.status === 'success'}>
                  <ul class="space-y-1">
                    <For each={cur.hits}>
                      {(h) => (
                        <li>
                          <button
                            type="button"
                            class={cn(
                              'w-full rounded-md border px-3 py-2 text-left text-sm',
                              activeHit()?.url === h.url && 'border-primary bg-muted/40',
                            )}
                            disabled={!!busy()}
                            onClick={() => void pickHit(h)}
                          >
                            <span class="font-medium">{h.title}</span>
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>

                <Show when={busy() && !episodes().length}>
                  <p class="text-xs text-muted-foreground">{busy()}</p>
                </Show>
                <Show when={episodes().length}>
                  <div class="flex flex-wrap gap-2">
                    <For each={episodes()}>
                      {(ep) => (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!busy() || !!resolvingEpisode()}
                          onClick={() => void playEp(ep)}
                        >
                          {ep.name}
                        </Button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </Show>

      <AppDialog
        open={!!resolvingEpisode()}
        onOpenChange={(open) => {
          // 抽流进行中不允许关掉（避免误以为已取消）
          if (!open && resolvingEpisode()) return;
          if (!open) setResolvingEpisode('');
        }}
      >
        <AppDialogContent
          class="max-w-sm"
          portalToBody
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <AppDialogHeader showClose={false}>
            <AppDialogTitle>正在获取播放链接</AppDialogTitle>
            <AppDialogDescription>
              {resolvingEpisode()
                ? `「${resolvingEpisode()}」解析中，请稍候…`
                : '解析中，请稍候…'}
            </AppDialogDescription>
          </AppDialogHeader>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
}

/** 选源分页 Tabs：横向滚动 + 状态色点 */
function BangumiSourceTabsBar(props: {
  value: string;
  onChange: (value: string) => void;
  items: Array<{ value: string; label: string; status: string }>;
}) {
  const [scrollRef, setScrollRef] = createSignal<HTMLDivElement | undefined>();

  createEffect(() => {
    const el = scrollRef();
    if (!el) return;
    const handler = (e: WheelEvent) => {
      const maxLeft = el.scrollWidth - el.clientWidth;
      if (maxLeft <= 0) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      e.preventDefault();
      e.stopPropagation();
      el.scrollLeft = Math.max(0, Math.min(el.scrollLeft + delta, maxLeft));
    };
    el.addEventListener('wheel', handler, { passive: false });
    onCleanup(() => el.removeEventListener('wheel', handler));
  });

  return (
    <div ref={setScrollRef} class={cn(pageToolbarBelowScroll, 'w-full min-w-0 max-w-full')}>
      <div class={cn(pageToolbarBelowScrollTrack, 'flex min-w-max items-center gap-1.5')}>
        <For each={props.items}>
          {(item) => (
            <button
              type="button"
              class={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
                props.value === item.value
                  ? 'border-primary bg-muted/50'
                  : 'border-border/60 hover:bg-muted/30',
              )}
              onClick={() => props.onChange(item.value)}
            >
              <span
                class={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  sourceStatusDotClass(item.status),
                  item.status === 'pending' && 'animate-pulse',
                )}
              />
              {item.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
