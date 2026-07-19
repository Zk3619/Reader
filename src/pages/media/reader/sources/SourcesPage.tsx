/**
 * 来源页：虚拟列表浏览书源，点击行打开 AppDrawer 发现分类
 */

import { createSignal, createEffect, createResource, createMemo, onMount, onCleanup, Show } from 'solid-js';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { useChunkedFilter } from '@/lib/hooks/useChunkedFilter';
import {
  clearSourceCookieAndCfRecord,
  deleteBookSourceWithSessionPurge,
} from '@/lib/book-source/purge-source-session';
import * as sourcesDb from '@/lib/database/sources';
import type { BookSource } from '@/types';
import {
  clearExploreSectionsCache,
  getExploreSections,
  getExploreSectionsAsync,
  isExploreDrawerButtonSection,
  isExploreUrlScript,
  resolveExploreSectionsFromResource,
  resolveExploreSectionsResourceError,
  shouldShowExploreSectionsSkeleton,
  type ExploreSection,
} from '@/lib/book-source/explore-sections';
import { getPageNavigationRevision } from '@/lib/navigation/page-navigation-scope';
import { applyExploreSelectChange } from '@/lib/book-source/explore-select-change';
import { getExploreInfoMap } from '@/lib/book-source/explore-info-map-store';
import { runExploreSectionAction } from '@/lib/js-engine/legado/explore-section-action-runner';
import { createScriptNoticeBus } from '@/lib/book-source/rate-limit-guard';
import { getExploreSourceArgsVersion } from '@/stores/explore-source-args';
import { getLegadoSourceKey } from '@/lib/js-engine/legado/source-script-shared';
import { cn } from '@/lib/utils';
import {
  appDrawerScrollBody,
  hDrawerPanel,
  mainShellPageRoot,
  sourcesExploreDrawerWidth,
} from '@/lib/ui/viewport-classes';
import { isMobile } from '@/lib/platform/detect';
import {
  APP_DRAWER_CLOSE_BUTTON_CLASS,
  AppDrawer,
  AppDrawerBody,
  AppDrawerContent,
  AppDrawerHeader,
} from '@/components/shared/AppDrawer';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { RefreshIcon } from '@/components/shared/icons';
import { SourceExploreDrawerContent } from '@/components/media/reader/sources/SourceExploreDrawerContent';
import { DeleteSourceDialog } from '@/components/media/reader/sources/DeleteSourceDialog';
import { SourcePageListItem } from '@/components/media/reader/sources/SourcePageListItem';
import {
  buildSourceManageListRows,
  SourceManageListDragOverlay,
  VirtualSourceManageList,
  type SourceManageListRow,
} from '@/components/media/reader/sources/VirtualSourceManageList';
import {
  SOURCE_PAGE_LIST_ROW_HEIGHT_PX,
  isFirstGroupHeaderRow,
} from '@/components/media/reader/sources/source-list-layout';
import type { Id } from '@thisbeyond/solid-dnd';
import type { VirtualListSortableConfig } from '@/components/shared/virtual-list';
import { showAppToast } from '@/components/shared/AppToasts';
import { notifyPageError } from '@/lib/ui/page-notify';
import {
  buildSourceFilterGroupOptions,
  getEffectiveSourceListFilter,
  hasEffectiveSourceListFilter,
  type SourceListFilterCriteria,
  EMPTY_SOURCE_LIST_FILTER,
  shouldGroupSourcesByGroupName,
  type SourceSearchMode,
} from '@/lib/sources/source-list-filter';
import {
  bookSourcePageFilterIsPassThrough,
  bookSourcePageItemMatches,
  sortBookSourcesCopy,
} from '@/lib/sources/book-source-page-filter';
import { type SourceManageGroupMode, type SourceSortMode } from '@/lib/sources/source-sort';

export interface SourcesPageProps {
  /** 搜索关键词，在当前列表内过滤书源 */
  sourceSearchQuery?: string;
  /** 搜索模式（来源于 sources_page_prefs，各页扩展规则不同） */
  sourceSearchMode?: SourceSearchMode;
  /** 为 true 且当前为全部/筛选时，按分组名分块显示 */
  sourcesGroupByGroupName?: boolean;
  /** 分组列表加载完成回调 */
  onGroupsLoaded?: (groups: string[]) => void;
  /** 书源数量变化回调，供标题下方描述「共 x 个书源」使用 */
  onSourceCountChange?: (count: number) => void;
  /** 编辑书源 */
  onSourceEdit?: (source: BookSource) => void;
  /** 书源登录：打开该书源的登录页（仅当书源支持登录时显示） */
  onSourceLogin?: (source: BookSource) => void;
  /** 设置书源变量 */
  onSourceVariables?: (source: BookSource) => void;
  /** 书源搜索：使用该书源进行搜索（仅当书源支持搜索时显示） */
  onSourceSearch?: (source: BookSource) => void;
  /** 发现页搜索框/脚本：带关键词打开搜索 */
  onOpenBookSearch?: (query: string, source: BookSource) => void;
  /** 点击发现子项（分类/排行榜等），由 App 打开发现页或书籍列表 */
  onExploreSectionClick?: (source: BookSource, section: ExploreSection) => void;
  /** 当前展开的书源 URL（由 App 持有，避免切页后收起） */
  expandedSourceUrl?: string | null;
  /** 展开状态变化 */
  onExpandedSourceUrlChange?: (sourceUrl: string | null) => void;
  /**
   * 是否呈现抽屉 UI（为 false 时保留 expandedSourceUrl 但关闭抽屉，如进入发现子页全屏）
   * @default true
   */
  exploreDrawerPresentationOpen?: boolean;
  /** 对话框筛选条件 */
  appliedFilter?: SourceListFilterCriteria;
  /** 全部分组名（用于筛选归一化：全选/全不选视为不限制） */
  filterGroupNames?: string[];
  /** 排序方式 */
  sortMode?: SourceSortMode;
  /** 反向排序（手动排序时无效） */
  sortReverse?: boolean;
  /** 拖拽排序开关（持久化于 sources_page_prefs） */
  enableDragSort?: boolean;
  /** 按 bookSourceType 过滤（0–4） */
  sourceTypeFilter?: number;
}

export function SourcesPage(props: SourcesPageProps) {
  const [sources, setSources] = createSignal<BookSource[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [localExpandedSourceUrl, setLocalExpandedSourceUrl] = createSignal<string | null>(null);
  const expandedSourceUrl = () =>
    props.expandedSourceUrl !== undefined ? props.expandedSourceUrl : localExpandedSourceUrl();
  const setExpandedSourceUrl = (url: string | null) => {
    if (props.onExpandedSourceUrlChange) {
      props.onExpandedSourceUrlChange(url);
    } else {
      setLocalExpandedSourceUrl(url);
    }
  };
  const [sourceToDelete, setSourceToDelete] = createSignal<BookSource | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false);
  const showSkeleton = useSkeletonLoading(loading, { delay: 100, minDisplayTime: 300 });

  async function loadGroups() {
    try {
      const groups = await sourcesDb.getAllSourceGroups();
      props.onGroupsLoaded?.(groups);
    } catch (e) {
      notifyPageError(
        '加载书源分组失败',
        e instanceof Error ? e.message : undefined,
      );
    }
  }

  async function loadSources() {
    setLoading(true);
    try {
      setSources(await sourcesDb.getAllSources());
    } catch (e) {
      notifyPageError(
        '加载书源失败',
        e instanceof Error ? e.message : undefined,
      );
      setSources([]);
    } finally {
      setLoading(false);
    }
  }

  onMount(() => {
    loadGroups();
    loadSources();
  });

  let sourcesRefreshFromSelf = false;

  function notifySourcesRefresh() {
    sourcesRefreshFromSelf = true;
    window.dispatchEvent(new CustomEvent('sources-refresh'));
    sourcesRefreshFromSelf = false;
  }

  const handler = () => {
    if (sourcesRefreshFromSelf) return;
    loadGroups();
    loadSources();
  };
  onMount(() => {
    window.addEventListener('sources-refresh', handler);
    onCleanup(() => window.removeEventListener('sources-refresh', handler));
  });

  function toggleExpand(sourceUrl: string) {
    const prev = expandedSourceUrl();
    const next = prev === sourceUrl ? null : sourceUrl;
    setExpandedSourceUrl(next);
    if (next !== prev) {
      setLoadedExploreArgsVersion(-1);
    }
  }

  const filterGroupOptions = createMemo(() =>
    buildSourceFilterGroupOptions(props.filterGroupNames ?? []),
  );

  const filterDeps = createMemo(() => ({
    criteria: props.appliedFilter ?? EMPTY_SOURCE_LIST_FILTER,
    query: props.sourceSearchQuery ?? '',
    mode: props.sourceSearchMode ?? 'name',
    sortMode: props.sortMode ?? 'manual',
    sortReverse: props.sortReverse ?? false,
    groups: filterGroupOptions(),
    sourceType: props.sourceTypeFilter,
  }));

  const { filtered: filteredSources, filtering, progressText: filterProgressText } = useChunkedFilter({
    items: sources,
    deps: () => filterDeps(),
    isPassThrough: () =>
      bookSourcePageFilterIsPassThrough(
        sources(),
        filterDeps().criteria,
        filterDeps().groups,
        filterDeps().query,
      ),
    match: (source) => {
      if (
        filterDeps().sourceType != null &&
        source.sourceType !== filterDeps().sourceType
      ) {
        return false;
      }
      return bookSourcePageItemMatches(
        source,
        filterDeps().criteria,
        filterDeps().groups,
        filterDeps().query,
        filterDeps().mode,
      );
    },
    postProcess: (matched) =>
      sortBookSourcesCopy(matched, filterDeps().sortMode, filterDeps().sortReverse),
    progressLabel: '正在筛选书源',
  });

  createEffect(() => {
    props.onSourceCountChange?.(filteredSources().length);
  });

  /** 当「按分组名显示」且当前为全部/筛选时，按 sourceGroup 分块；否则单块（当前列表） */
  const displayGroups = createMemo(() => {
    const list = filteredSources();
    if (
      !props.sourcesGroupByGroupName ||
      !shouldGroupSourcesByGroupName(
        getEffectiveSourceListFilter(
          props.appliedFilter ?? EMPTY_SOURCE_LIST_FILTER,
          filterGroupOptions(),
        ).groupNames,
      )
    )
      return [{ name: '', sources: list }];
    const map = new Map<string, BookSource[]>();
    for (const s of list) {
      const g = (s.sourceGroup || '').trim() || '未分组';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(s);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] === '未分组' ? 1 : b[0] === '未分组' ? -1 : a[0].localeCompare(b[0])))
      .map(([name, sources]) => ({ name, sources }));
  });

  const listGroupMode = (): SourceManageGroupMode =>
    props.sourcesGroupByGroupName &&
      shouldGroupSourcesByGroupName(props.appliedFilter?.groupNames ?? [])
      ? 'by-group'
      : 'flat';

  const listRows = createMemo(() => buildSourceManageListRows(displayGroups(), listGroupMode()));

  const isFilterEmpty = () =>
    !hasEffectiveSourceListFilter(
      props.appliedFilter ?? EMPTY_SOURCE_LIST_FILTER,
      filterGroupOptions(),
    );

  const listSortableEnabled = createMemo(
    () =>
      (props.enableDragSort ?? true) &&
      (props.sortMode ?? 'manual') === 'manual' &&
      listGroupMode() === 'flat' &&
      !(props.sourceSearchQuery ?? '').trim() &&
      isFilterEmpty() &&
      filteredSources().length === sources().length,
  );

  const sourceListSortable = createMemo(():
    | VirtualListSortableConfig<SourceManageListRow>
    | undefined => {
    if (!(props.enableDragSort ?? true)) return undefined;
    if ((props.sortMode ?? 'manual') !== 'manual' || listGroupMode() !== 'flat') return undefined;
    return {
      enabled: listSortableEnabled,
      ids: () => filteredSources().map((s) => s.sourceUrl),
      onReorder: handleSourcesReorder,
      persistOnly: true,
    };
  });

  async function handleSourcesReorder(orderedIds: Id[]) {
    try {
      for (let i = 0; i < orderedIds.length; i++) {
        await sourcesDb.updateSourceOrder(String(orderedIds[i]), i);
      }
      const byUrl = new Map(sources().map((s) => [s.sourceUrl, s]));
      for (let i = 0; i < orderedIds.length; i++) {
        const source = byUrl.get(String(orderedIds[i]));
        if (source) source.customOrder = i;
      }
      notifySourcesRefresh();
    } catch (e) {
      showAppToast({
        title: '排序失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
      await loadSources();
    }
  }

  function renderSourceDragOverlay(activeId: Id | null) {
    if (activeId == null) return null;
    const url = String(activeId);
    const row = listRows().find(
      (r): r is Extract<SourceManageListRow, { type: 'source' }> =>
        r.type === 'source' && r.source.sourceUrl === url,
    );
    if (!row) return null;
    return (
      <SourceManageListDragOverlay
        source={row.source}
        showGroupBadge={row.showGroupBadge}
      />
    );
  }

  const expandedSource = () => {
    const url = expandedSourceUrl();
    return url ? sources().find((s) => s.sourceUrl === url) ?? null : null;
  };
  const exploreArgsVersion = () => {
    const s = expandedSource();
    return s ? getExploreSourceArgsVersion(getLegadoSourceKey(s)) : 0;
  };
  const [loadedExploreArgsVersion, setLoadedExploreArgsVersion] = createSignal(-1);
  const [dynamicSections, { refetch: refetchExploreSections }] = createResource(
    () => {
      const v = exploreArgsVersion();
      const s = expandedSource();
      return s && isExploreUrlScript(s.exploreUrl)
        ? { source: s, argsVersion: v, navRevision: getPageNavigationRevision() }
        : null;
    },
    (ctx) => getExploreSectionsAsync(ctx.source, ctx.argsVersion)
  );

  createEffect(() => {
    const s = expandedSource();
    if (!s || !isExploreUrlScript(s.exploreUrl)) {
      setLoadedExploreArgsVersion(exploreArgsVersion());
      return;
    }
    if (dynamicSections.state === 'ready' && !dynamicSections.loading) {
      setLoadedExploreArgsVersion(exploreArgsVersion());
    }
  });

  const exploreDrawerOpen = () =>
    expandedSourceUrl() != null && (props.exploreDrawerPresentationOpen ?? true);

  /** 移动端底部抽屉，桌面 / Web 右侧侧栏抽屉 */
  const exploreDrawerSide = () => (isMobile() ? 'bottom' : 'right') as 'bottom' | 'right';

  const exploreDrawerContentClass = () =>
    exploreDrawerSide() === 'right'
      ? cn('flex h-full flex-col', sourcesExploreDrawerWidth)
      : cn('flex flex-col', hDrawerPanel, 'max-h-[75dvh]');

  const drawerSectionsLoading = () => {
    const s = expandedSource();
    if (!s) return false;
    return shouldShowExploreSectionsSkeleton(
      isExploreUrlScript(s.exploreUrl),
      exploreArgsVersion(),
      loadedExploreArgsVersion(),
      dynamicSections,
    );
  };

  const drawerSections = (): ExploreSection[] => {
    const s = expandedSource();
    if (!s) return [];
    if (!isExploreUrlScript(s.exploreUrl)) return getExploreSections(s);
    if (drawerSectionsLoading()) return [];
    return resolveExploreSectionsFromResource(dynamicSections);
  };

  const drawerSectionsError = () => {
    const s = expandedSource();
    if (!s || !isExploreUrlScript(s.exploreUrl)) return false;
    return resolveExploreSectionsResourceError(dynamicSections) != null;
  };

  const drawerSectionsErrorMessage = () => {
    const err = resolveExploreSectionsResourceError(dynamicSections);
    return err instanceof Error ? err.message : err != null ? String(err) : undefined;
  };

  async function handleExploreSelectChange(
    source: BookSource,
    section: ExploreSection,
    value: string,
  ) {
    setLoadedExploreArgsVersion(-1);
    await applyExploreSelectChange(source, section, value, {
      onRefreshExplore: async () => {
        clearExploreSectionsCache(getLegadoSourceKey(source));
        await refetchExploreSections();
      },
      onOpenSearch: (query, src) => {
        props.onOpenBookSearch?.(query.trim(), src);
      },
    });
  }

  async function handleExploreSectionAction(source: BookSource, section: ExploreSection) {
    const action = section.action?.trim();
    if (!action) return;
    const noticeBus = createScriptNoticeBus(source.sourceName, '发现');
    try {
      const sourceKey = getLegadoSourceKey(source);
      await runExploreSectionAction(source, action, {
        infoMap: getExploreInfoMap(sourceKey),
        onScriptToast: noticeBus.onScriptToast,
        onRefreshExplore: async () => {
          clearExploreSectionsCache(sourceKey);
          await refetchExploreSections();
        },
        onOpenSearch: (query, src) => {
          if (query.trim()) {
            props.onOpenBookSearch?.(query.trim(), src);
          } else {
            props.onSourceSearch?.(src);
          }
        },
      });
      clearExploreSectionsCache(sourceKey);
      await refetchExploreSections();
    } catch (e) {
      console.error('发现 action 执行失败:', e);
      showAppToast({
        title: '操作失败',
        description: e instanceof Error ? e.message : section.title,
        variant: 'destructive',
      });
    }
  }

  async function handleExploreSectionClick(source: BookSource, section: ExploreSection) {
    if (isExploreDrawerButtonSection(section) && section.action?.trim()) {
      await handleExploreSectionAction(source, section);
      return;
    }
    await props.onExploreSectionClick?.(source, section);
  }

  async function handleRefreshExploreDrawer() {
    const url = expandedSourceUrl();
    if (!url) return;
    try {
      const s = expandedSource();
      if (!s) return;
      clearExploreSectionsCache(getLegadoSourceKey(s));
      await loadSources();
      const fresh = expandedSource();
      if (!fresh) return;
      if (isExploreUrlScript(fresh.exploreUrl)) {
        setLoadedExploreArgsVersion(-1);
        await refetchExploreSections();
      }
      showAppToast({
        title: '已刷新',
        description: `「${fresh.sourceName}」发现分类已重新加载`,
        variant: 'default',
      });
    } catch (e) {
      console.error('刷新发现分类失败:', e);
      showAppToast({
        title: '刷新失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  async function handlePinSource(source: BookSource) {
    const list = sources();
    const minOrder = list.length > 0 ? Math.min(...list.map((s) => s.customOrder)) : 0;
    const newOrder = minOrder - 1;
    try {
      await sourcesDb.updateSourceOrder(source.sourceUrl, newOrder);
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已置顶', description: `「${source.sourceName}」已移至列表顶部`, variant: 'default' });
    } catch (e) {
      console.error('置顶失败:', e);
      showAppToast({ title: '置顶失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  /** 书源是否支持登录（有 loginUrl 或 loginCheckJs，对齐 legado） */
  function hasLogin(source: BookSource) {
    return !!(source.loginUrl?.trim() || source.loginCheckJs?.trim());
  }

  /** 书源是否支持搜索（有 searchUrl，对齐 legado） */
  function hasSearch(source: BookSource) {
    return !!source.searchUrl?.trim();
  }

  /** 刷新：重新加载书源列表（对齐 legado 书源项右键「刷新」） */
  function handleSourceRefresh(source: BookSource) {
    window.dispatchEvent(new CustomEvent('sources-refresh'));
    loadSources();
    showAppToast({ title: '已刷新', description: `「${source.sourceName}」`, variant: 'default' });
  }

  async function handleClearCookieCf(source: BookSource) {
    try {
      await clearSourceCookieAndCfRecord(source);
      showAppToast({
        title: '已清除',
        description: `「${source.sourceName}」的 Cookie/CF 记录`,
      });
    } catch (e) {
      showAppToast({
        title: '清除失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  async function handleConfirmDelete() {
    const source = sourceToDelete();
    if (!source) return;
    try {
      await deleteBookSourceWithSessionPurge(source);
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已删除书源', description: `「${source.sourceName}」已删除`, variant: 'default' });
      setSourceToDelete(null);
      setExpandedSourceUrl(null);
    } catch (e) {
      console.error('删除书源失败:', e);
      showAppToast({ title: '删除书源失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  return (
    <div class={cn('@container', mainShellPageRoot, 'flex min-h-0 flex-1 flex-col overflow-hidden pt-2')}>
      <Show when={filtering() && filterProgressText()}>
        <p class="shrink-0 px-1 pb-2 text-center text-xs text-muted-foreground">{filterProgressText()}</p>
      </Show>
      <Show when={showSkeleton()}>
        <ul class="shrink-0 space-y-2 px-1">
          {[1, 2, 3, 4, 5].map(() => (
            <li class="flex h-12 animate-pulse items-center gap-3 rounded-lg border border-border/50 bg-card px-3">
              <span class="h-4 w-20 rounded bg-muted" />
              <span class="h-4 flex-1 rounded bg-muted" />
            </li>
          ))}
        </ul>
      </Show>
      <Show when={!loading() && !showSkeleton() && sources().length === 0}>
        <div class="flex flex-1 items-center justify-center px-1">
          <div class="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
            <p>暂无书源</p>
            <p class="mt-1">可通过「更多 → 书源管理」新建或导入书源</p>
          </div>
        </div>
      </Show>
      <Show when={!loading() && !showSkeleton() && sources().length > 0 && filteredSources().length === 0 && !filtering()}>
        <div class="flex flex-1 items-center justify-center px-1">
          <div class="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
            <p>无匹配书源</p>
            <p class="mt-1">尝试修改搜索关键词或切换分组</p>
          </div>
        </div>
      </Show>
      <Show when={!loading() && !showSkeleton() && filteredSources().length > 0}>
        <VirtualSourceManageList
          rows={listRows()}
          sourceRowHeightPx={SOURCE_PAGE_LIST_ROW_HEIGHT_PX}
          class="min-h-0 flex-1 px-1 pb-4"
          sortable={sourceListSortable()}
          renderDragOverlay={sourceListSortable() ? renderSourceDragOverlay : undefined}
        >
          {(row, index) => {
            if (row.type === 'header') {
              return (
                <div
                  class={cn(
                    'box-border flex h-full items-end px-1 pb-1.5',
                    !isFirstGroupHeaderRow(listRows(), index) && 'pt-2',
                  )}
                >
                  <h3 class="min-w-0 truncate text-sm font-medium text-muted-foreground">
                    {row.title}
                  </h3>
                </div>
              );
            }
            const source = row.source;
            return (
              <SourcePageListItem
                source={source}
                showGroupBadge={row.showGroupBadge}
                expanded={expandedSourceUrl() === source.sourceUrl}
                onToggleExpand={() => toggleExpand(source.sourceUrl)}
                onSourceEdit={props.onSourceEdit}
                onPinSource={handlePinSource}
                onSourceLogin={props.onSourceLogin}
                onSourceVariables={props.onSourceVariables}
                onSourceSearch={props.onSourceSearch}
                onSourceRefresh={handleSourceRefresh}
                onClearCookieCf={(s) => void handleClearCookieCf(s)}
                onDeleteSource={(s) => {
                  setSourceToDelete(s);
                  setDeleteDialogOpen(true);
                }}
                hasLogin={hasLogin}
                hasSearch={hasSearch}
              />
            );
          }}
        </VirtualSourceManageList>
      </Show>

      <DeleteSourceDialog
        open={deleteDialogOpen()}
        onOpenChange={setDeleteDialogOpen}
        source={sourceToDelete()}
        onConfirm={handleConfirmDelete}
      />

      <AppDrawer
        open={exploreDrawerOpen()}
        onOpenChange={(open) => {
          // 进入发现子页等仅隐藏抽屉时勿清空展开书源，以便返回时无感恢复
          if (!open && (props.exploreDrawerPresentationOpen ?? true)) {
            setExpandedSourceUrl(null);
          }
        }}
        side={exploreDrawerSide()}
        snapPoints={[0, 1]}
        defaultSnapPoint={1}
      >
        <AppDrawerContent
          class={exploreDrawerContentClass()}
          showNativeDragHandle={false}
        >
          <AppDrawerHeader
            title={expandedSource()?.sourceName ?? '发现'}
            actions={
              <AppTooltip>
                <AppTooltipTrigger as="div" class="shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    class={APP_DRAWER_CLOSE_BUTTON_CLASS}
                    disabled={drawerSectionsLoading()}
                    aria-label="刷新发现分类"
                    onClick={() => void handleRefreshExploreDrawer()}
                  >
                    <RefreshIcon
                      class={cn('h-4 w-4', drawerSectionsLoading() && 'animate-spin')}
                    />
                    <span class="sr-only">刷新发现分类</span>
                  </Button>
                </AppTooltipTrigger>
                <AppTooltipContent>刷新发现分类</AppTooltipContent>
              </AppTooltip>
            }
          />
          <AppDrawerBody class={appDrawerScrollBody}>
            <Show when={expandedSource()}>
              {(source) => (
                <SourceExploreDrawerContent
                  source={source()}
                  sections={drawerSections}
                  loading={drawerSectionsLoading}
                  error={drawerSectionsError}
                  errorMessage={drawerSectionsErrorMessage}
                  onExploreSectionClick={handleExploreSectionClick}
                  onExploreSectionAction={handleExploreSectionAction}
                  onExploreSelectChange={handleExploreSelectChange}
                />
              )}
            </Show>
          </AppDrawerBody>
        </AppDrawerContent>
      </AppDrawer>
    </div>
  );
}
