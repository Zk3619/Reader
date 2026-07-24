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
  onMount,
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
import { AppTabs } from '@/components/shared/AppTabs';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { ChevronLeftIcon, ImageIcon, MoreIcon, RefreshIcon, CalendarDaysIcon, SortIcon, TagIcon, CalendarRangeIcon, GaugeIcon, EyeOffIcon, FilterIcon } from '@/components/shared/icons';
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
import { pageToolbarBelowScrollTrack } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import {
  displayName,
  fetchBangumiCalendar,
  fetchBangumiComments,
  fetchBangumiRankedList,
  invalidateBangumiCalendarCache,
  searchBangumiSubjects,
  sortBangumiSubjects,
  type BangumiSubject,
} from '@/lib/media/video/bangumi/meta';
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
  backBangumiBrowse,
  backBangumiList,
  openBangumiSearch,
  setBangumiSearchFilter,
  setBangumiSearchKeyword,
  setBangumiSearchLoading,
  setBangumiSearchLoadingMore,
  setBangumiSearchMatchMode,
  setBangumiSearchResults,
  setBangumiSourceHits,
  setBangumiView,
} from '@/stores/tv-hub/bangumi-ui';
import {
  getBangumiModulePrefs,
  setBangumiModulePrefs,
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
  searchAllRules,
  type BangumiSearchHit,
} from '@/lib/media/video/bangumi/engine';
import { openRoutedPlayback } from '@/lib/media/video/playback/open-routed';
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

/** 列表区高度：取较大值，矮视口仍至少 36rem，由整页滚动露出，避免 65dvh 缩成看不见 */
const BANGUMI_LIST_VIEWPORT_CLASS =
  'relative h-[max(65dvh,36rem)] w-full overflow-hidden';

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

  const [listItems, setListItems] = createSignal<BangumiSubject[]>([]);
  const [listLoading, setListLoading] = createSignal(false);
  const [listLoadingMore, setListLoadingMore] = createSignal(false);
  const [listHasMore, setListHasMore] = createSignal(true);
  const [listOffset, setListOffset] = createSignal(0);
  const [listScrollRoot, setListScrollRoot] = createSignal<HTMLElement | undefined>();

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
      return (
        <div class={cn(pageToolbarBelowScrollTrack, 'flex min-w-max items-center gap-2')}>
          <AppTabs
            value={tag()}
            onChange={(v) => setTag(v)}
            options={[...BANGUMI_STYLE_TAGS]}
            labels={Object.fromEntries(BANGUMI_STYLE_TAGS.map((t) => [t, t]))}
            ariaLabel="番剧分类"
            variant="drawer-inline"
            layout="inline"
          />
        </div>
      );
    }
    if (mode === 'stacked') {
      return (
        <div class="flex flex-wrap items-center gap-1.5" role="listbox" aria-label="番剧分类">
          <For each={[...BANGUMI_STYLE_TAGS]}>
            {(t) => (
              <button type="button" class={TAG_CHIP_CLASS(tag() === t)} onClick={() => setTag(t)}>
                {t}
              </button>
            )}
          </For>
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
    if (v === 'detail' || v === 'sources') {
      const s = ui().subject;
      return s ? displayName(s, settingsState.app.language) : '番剧详情';
    }
    return undefined;
  };

  const isBrowse = () => ui().view === 'browse';

  return (
    <>
      <TvHubPageShell
        section="bangumi"
        title={shellTitle()}
        leading={shellLeading()}
        toolbar={
          isBrowse() ? browseToolbar() : ui().view === 'search' ? searchToolbar() : undefined
        }
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

              <div class={cn(BANGUMI_LIST_VIEWPORT_CLASS, 'relative')}>
                <Show when={showListSkeleton()}>
                  <TvVodGridSkeleton class="h-full min-h-0 overflow-y-auto" />
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
                      class="h-full min-h-0"
                      listInnerClass="px-1 pb-4 pt-1"
                      items={listVodItems}
                      scrollGutter="single"
                      onScrollContainer={(el) => setListScrollRoot(el)}
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
                <QuickScrollButtons
                  container={listScrollRoot}
                  contentRevision={() => `${listItems().length}|${tag()}`}
                />
              </div>
            </section>
          </div>
        </Show>

        <Show when={ui().view !== 'browse'}>
          <div class="flex flex-col gap-4 py-3">
            <Show when={ui().view === 'search'}>
              <BangumiSearchView
                onOpen={(s) => openBangumiSubject(s, { from: 'search' })}
                onLoadMore={() => void runSearch(undefined, { append: true })}
              />
            </Show>
            <Show when={ui().view === 'detail' || ui().view === 'sources'}>
              <BangumiDetailOrSources onKeepChanged={() => void refreshKeptIds()} />
            </Show>
          </div>
        </Show>
      </TvHubPageShell>

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
}) {
  const ui = getBangumiUi;
  const lang = () => settingsState.app.language;
  const showScore = () => getBangumiModulePrefs().showScoreBadge;
  return (
    <section class="space-y-3">
      <Show when={ui().searchLoading}>
        <TvVodGridSkeleton class="min-h-40" count={12} />
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
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            <For each={ui().searchHits}>
              {(s) => (
                <TvVodCard
                  title={displayName(s, lang())}
                  coverUrl={s.cover || undefined}
                  badge={showScore() && s.score > 0 ? s.score.toFixed(1) : undefined}
                  onOpen={() => props.onOpen(s)}
                />
              )}
            </For>
          </div>
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

function BangumiDetailOrSources(props: { onKeepChanged?: () => void }) {
  const ui = getBangumiUi;
  return (
    <Show when={ui().view === 'sources'} fallback={<BangumiDetailView onKeepChanged={props.onKeepChanged} />}>
      <BangumiSourcesView />
    </Show>
  );
}

function BangumiDetailView(props: { onKeepChanged?: () => void }) {
  const ui = getBangumiUi;
  const subject = () => ui().subject;
  const [kept, setKept] = createSignal(false);
  const [comments] = createResource(
    () => subject()?.id,
    (id) => (id ? fetchBangumiComments(id) : Promise.resolve([])),
  );

  createEffect(() => {
    const id = subject()?.id;
    if (!id) return;
    void isBangumiKept(id).then(setKept);
  });

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

  async function openSources() {
    const s = subject();
    if (!s) return;
    const kw = displayName(s, settingsState.app.language);
    const { hits, errors } = await searchAllRules(loadBangumiRules(), kw);
    if (errors.length) {
      void showAppToast({
        title: '部分规则失败',
        description: errors.slice(0, 3).join('；'),
        variant: 'warning',
      });
    }
    setBangumiSourceHits(hits, kw);
  }

  return (
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap gap-4">
        <Show when={subject()?.cover}>
          <img
            src={subject()!.cover}
            alt=""
            class="h-48 w-36 shrink-0 rounded-md object-cover"
          />
        </Show>
        <div class="min-w-0 flex-1 space-y-2 text-sm">
          <p class="text-muted-foreground">
            {subject()?.airDate || '—'}
            <Show when={subject()!.score > 0}> · 评分 {subject()!.score.toFixed(1)}</Show>
          </p>
          <p class="whitespace-pre-wrap text-xs leading-relaxed opacity-90">
            {subject()?.summary || '暂无简介'}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void toggleKeep()}>
              {kept() ? '取消收藏' : '加入收藏'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void openSources()}>
              选源播放
            </Button>
          </div>
        </div>
      </div>
      <section class="space-y-2">
        <h3 class="text-sm font-semibold">短评</h3>
        <Show
          when={(comments() || []).length}
          fallback={<p class="text-xs text-muted-foreground">暂无短评</p>}
        >
          <ul class="space-y-2">
            <For each={comments() || []}>
              {(c) => (
                <li class="rounded-md border border-border/60 p-2 text-xs">
                  <div class="mb-1 font-medium">{c.userName}</div>
                  <p class="whitespace-pre-wrap text-muted-foreground">{c.comment}</p>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
    </div>
  );
}

function BangumiSourcesView() {
  const ui = getBangumiUi;
  const [busy, setBusy] = createSignal('');
  const [episodes, setEpisodes] = createSignal<
    { name: string; url: string; ruleId: string }[]
  >([]);
  const [activeHit, setActiveHit] = createSignal<BangumiSearchHit | null>(null);

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

  async function playEp(ep: { name: string; url: string; ruleId: string }) {
    const rule = loadBangumiRules().find((r) => r.id === ep.ruleId);
    const s = ui().subject;
    if (!rule || !s) return;
    setBusy(ep.url);
    try {
      const resolved = await resolvePlayUrl(rule, ep.url);
      const title = `${displayName(s, settingsState.app.language)} ${ep.name}`;
      await openRoutedPlayback(resolved.url, {
        title,
        sourceKind: 'bangumi',
        headers: resolved.headers,
      });
      await upsertBangumiPlayHistory({
        bgmId: s.id,
        title: displayName(s, settingsState.app.language),
        cover: s.cover,
        episodeName: ep.name,
        ruleId: rule.id,
        detailUrl: activeHit()?.url,
        episodeUrl: ep.url,
      });
      try {
        const matched = await tryMatchDanmaku({
          fileNameHint: title,
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
        /* */
      }
      void cacheBangumiEpisode({
        bgmId: s.id,
        episodeUrl: ep.url,
        mediaUrl: resolved.url,
        title,
      }).catch(() => undefined);
    } catch (e) {
      void showAppToast({
        title: '播放失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy('');
    }
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <div class="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setBangumiView('detail')}>
          返回详情
        </Button>
        <h2 class="text-sm font-semibold">
          选源 · {ui().sourceKeyword || displayName(ui().subject!, settingsState.app.language)}
        </h2>
      </div>
      <Show
        when={ui().sourceHits.length}
        fallback={
          <p class="text-xs text-muted-foreground">
            无规则命中。请在影视设置 → 番剧中添加/订阅规则。
          </p>
        }
      >
        <ul class="space-y-1">
          <For each={ui().sourceHits}>
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
                  <span class="ml-2 text-xs text-muted-foreground">{h.ruleName}</span>
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
                disabled={!!busy()}
                onClick={() => void playEp(ep)}
              >
                {busy() === ep.url ? '…' : ep.name}
              </Button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
