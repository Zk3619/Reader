/**
 * 书源管理：多选列表 + 启用开关 + 批量操作
 */

import {
  createSignal,
  createEffect,
  createMemo,
  onMount,
  onCleanup,
  For,
  Show,
} from 'solid-js';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { useChunkedFilter } from '@/lib/hooks/useChunkedFilter';
import * as sourcesDb from '@/lib/database/sources';
import {
  clearSourceCookieAndCfRecord,
  deleteBookSourceWithSessionPurge,
  purgeBookSourceSession,
} from '@/lib/book-source/purge-source-session';
import type { BookSource } from '@/types';
import { cn } from '@/lib/utils';
import { mainShellPageRoot, appDialogScrollBodySpaceY4 } from '@/lib/ui/viewport-classes';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import {
  SourcesManagePageToolbar,
  SourcesManageToolbarLeading,
} from '@/components/sources/SourcesManagePageToolbar';
import { SourcesFilterDialog } from '@/components/sources/SourcesFilterDialog';
import { DeleteSourceDialog } from '@/components/sources/DeleteSourceDialog';
import { useSuppressClickAfterDrag } from '@/components/shared/virtual-list/use-suppress-click-after-drag';
import type { VirtualListSortableConfig } from '@/components/shared/virtual-list';
import {
  buildSourceManageListRows,
  SourceManageListDragOverlay,
  VirtualSourceManageList,
  type SourceManageListRow,
} from '@/components/sources/VirtualSourceManageList';
import { isFirstGroupHeaderRow } from '@/components/sources/source-list-layout';
import type { Id } from '@thisbeyond/solid-dnd';
import { showAppToast } from '@/components/shared/AppToasts';
import { ChevronDownIcon } from '@/components/shared/icons';
import { Button } from '@/components/ui/button';
import { TruncatedTooltip } from '@/components/shared/TruncatedTooltip';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { AppSwitch, AppSwitchControl, AppSwitchThumb } from '@/components/shared/AppSwitch';
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuTrigger,
} from '@/components/shared/AppContextMenu';
import {
  AppDropdownMenu,
  AppDropdownMenuButtonTrigger,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  AppDialogScrollBody,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { validateSources, type SourceValidationResult, type ValidateResultKind } from '@/lib/book-source/validate';
import { Badge } from '@/components/ui/badge';
import {
  bookSourcePageFilterIsPassThrough,
  bookSourcePageItemMatches,
  sortBookSourcesCopy,
} from '@/lib/sources/book-source-page-filter';
import {
  formatSourceListFilterSummary,
  formatSourceListToolbarDescription,
  buildSourceFilterGroupOptions,
  hasEffectiveSourceListFilter,
  EMPTY_SOURCE_LIST_FILTER,
  UNGROUPED_SOURCE_LABEL,
  type SourceSearchMode,
  type SourceListFilterCriteria,
} from '@/lib/sources/source-list-filter';
import {
  getSourceDomain,
  SOURCE_MANAGE_SORT_OPTIONS,
  type SourceSortMode,
  type SourceManageGroupMode,
} from '@/lib/sources/source-sort';

const BATCH_MENU_TRIGGER_CLASS = 'gap-1.5 group/trigger';
const BATCH_MENU_CHEVRON_CLASS =
  'h-4 w-4 shrink-0 opacity-50 transition-transform duration-200 group-data-expanded/trigger:rotate-180';

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10;

function useLongPressContextMenu(triggerRef: () => HTMLElement | null) {
  let pressStartTime = 0;
  let pressStartX = 0;
  let pressStartY = 0;
  let hasMoved = false;
  let longPressTimer: number | null = null;
  let longPressTriggered = false;
  let contextMenuTriggered = false;

  const onPointerDown = (e: MouseEvent | TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    if ('button' in e && (e as MouseEvent).button !== 0) return;
    pressStartTime = Date.now();
    pressStartX = clientX;
    pressStartY = clientY;
    hasMoved = false;
    longPressTriggered = false;
    contextMenuTriggered = false;
    longPressTimer = window.setTimeout(() => {
      if (!hasMoved) longPressTriggered = true;
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: MouseEvent | TouchEvent) => {
    if (pressStartTime === 0) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    const dist = Math.sqrt((clientX - pressStartX) ** 2 + (clientY - pressStartY) ** 2);
    if (dist > MOVE_THRESHOLD && longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (dist > MOVE_THRESHOLD) hasMoved = true;
  };

  const onPointerUp = (e: MouseEvent | TouchEvent) => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    const el = triggerRef();
    if (longPressTriggered && !hasMoved && el) {
      const clientX = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientY : (e as MouseEvent).clientY;
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY }));
      contextMenuTriggered = true;
      setTimeout(() => {
        contextMenuTriggered = false;
      }, 100);
    }
    pressStartTime = 0;
    hasMoved = false;
    longPressTriggered = false;
  };

  const shouldPreventClick = () => contextMenuTriggered;
  return { onPointerDown, onPointerMove, onPointerUp, shouldPreventClick };
}

interface SourceManageListItemProps {
  source: BookSource;
  showGroupBadge: boolean;
  selected: boolean;
  onToggleSelection: () => void;
  onSelectionChange: (checked: boolean) => void;
  onSourceEdit?: (source: BookSource) => void;
  onSourceVariables?: (source: BookSource) => void;
  onPinSource: (source: BookSource) => void;
  onClearCookieCf?: (source: BookSource) => void;
  onDeleteSource: (source: BookSource) => void;
  onEnableChange: (source: BookSource, enabled: boolean) => Promise<void>;
}

function SourceManageListItem(props: SourceManageListItemProps) {
  let triggerEl: HTMLDivElement | null = null;
  const { onPointerDown, onPointerMove, onPointerUp, shouldPreventClick } =
    useLongPressContextMenu(() => triggerEl);
  const shouldPreventClickAfterDrag = useSuppressClickAfterDrag();

  const shouldBlockRowClick = () =>
    shouldPreventClick() || shouldPreventClickAfterDrag();

  return (
    <div class="box-border h-full pb-2">
      <div class="h-12 overflow-hidden rounded-lg border border-border/50 bg-card">
        <AppContextMenu>
          <AppContextMenuTrigger
            as="div"
            ref={(el) => {
              triggerEl = el;
            }}
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onTouchStart={onPointerDown}
            onTouchMove={onPointerMove}
            onTouchEnd={onPointerUp}
            class={cn(
              'flex h-12 cursor-pointer items-center gap-3 px-3 text-sm transition-all',
              'hover:bg-accent/30',
            )}
            onClick={(e: MouseEvent) => {
              if (shouldBlockRowClick()) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              props.onToggleSelection();
            }}
            role="button"
            tabIndex={0}
          >
            <div
              class="shrink-0 flex items-center"
              onClick={(e: MouseEvent) => e.stopPropagation()}
              role="presentation"
            >
              <Checkbox
                checked={props.selected}
                onChange={(checked: boolean) => props.onSelectionChange(checked)}
                aria-label={`选择 ${props.source.sourceName}`}
              />
            </div>
            <div class="min-w-0 flex-1 flex items-center gap-2 overflow-hidden">
              <TruncatedTooltip
                as="span"
                text={props.source.sourceName}
                class="min-w-0 shrink font-medium text-foreground"
              />
              <Show when={props.showGroupBadge && props.source.sourceGroup}>
                <TruncatedTooltip
                  as="span"
                  text={props.source.sourceGroup!}
                  class="min-w-0 shrink-2 rounded bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
                />
              </Show>
            </div>
            <div
              class="shrink-0 flex items-center"
              onClick={(e: MouseEvent) => e.stopPropagation()}
              role="presentation"
            >
              <AppSwitch
                checked={props.source.enabled}
                onChange={(checked: boolean) => void props.onEnableChange(props.source, checked)}
                aria-label={props.source.enabled ? '禁用书源' : '启用书源'}
              >
                <AppSwitchControl class="data-disabled:cursor-not-allowed">
                  <AppSwitchThumb />
                </AppSwitchControl>
              </AppSwitch>
            </div>
          </AppContextMenuTrigger>
          <AppContextMenuContent>
            <AppContextMenuItem onSelect={() => props.onSourceEdit?.(props.source)}>
              编辑
            </AppContextMenuItem>
            <AppContextMenuItem onSelect={() => props.onSourceVariables?.(props.source)}>
              设置源变量
            </AppContextMenuItem>
            <AppContextMenuItem onSelect={() => props.onPinSource(props.source)}>
              置顶
            </AppContextMenuItem>
            <AppContextMenuItem onSelect={() => props.onClearCookieCf?.(props.source)}>
              清除 Cookie/CF 记录
            </AppContextMenuItem>
            <AppContextMenuItem
              class="text-destructive focus:text-destructive"
              onSelect={() => props.onDeleteSource(props.source)}
            >
              删除
            </AppContextMenuItem>
          </AppContextMenuContent>
        </AppContextMenu>
      </div>
    </div>
  );
}

export interface SourcesManagePageProps {
  onClose?: () => void;
  sourceSearchMode?: SourceSearchMode;
  onSourceSearchModeChange?: (mode: SourceSearchMode) => void;
  enableDragSort?: boolean;
  onEnableDragSortChange?: (value: boolean) => void;
  onSourceEdit?: (source: BookSource) => void;
  onSourceVariables?: (source: BookSource) => void;
  onSourcesNew?: () => void;
  onSourcesImportLocal?: () => void;
  onSourcesImportNetwork?: () => void;
  onSourcesImportQR?: () => void;
  onSourcesImportCode?: () => void;
  onOpenSourceGroupManage?: () => void;
}

export function SourcesManagePage(props: SourcesManagePageProps) {
  const [sources, setSources] = createSignal<BookSource[]>([]);
  const [sourceGroups, setSourceGroups] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [sortMode, setSortMode] = createSignal<SourceSortMode>('manual');
  const [sortReverse, setSortReverse] = createSignal(false);
  const [groupMode, setGroupMode] = createSignal<SourceManageGroupMode>('flat');
  const [filterDialogOpen, setFilterDialogOpen] = createSignal(false);
  const [appliedFilter, setAppliedFilter] = createSignal<SourceListFilterCriteria>(EMPTY_SOURCE_LIST_FILTER);
  const [selectedSourceUrls, setSelectedSourceUrls] = createSignal<Set<string>>(new Set());
  const [sourceToDelete, setSourceToDelete] = createSignal<BookSource | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false);
  const [batchDeleteCount, setBatchDeleteCount] = createSignal(0);
  const [validateDialogOpen, setValidateDialogOpen] = createSignal(false);
  const [validateResults, setValidateResults] = createSignal<SourceValidationResult[]>([]);
  const [validateLoading, setValidateLoading] = createSignal(false);
  const [validateProgress, setValidateProgress] = createSignal<{ current: number; total: number; name: string } | null>(null);

  const showSkeleton = useSkeletonLoading(loading, { delay: 100, minDisplayTime: 300 });
  const selectedCount = () => selectedSourceUrls().size;

  async function loadSources() {
    setLoading(true);
    setError(null);
    try {
      const list = await sourcesDb.getAllSources();
      setSources(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载书源失败';
      setError(msg);
      setSources([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadGroups() {
    try {
      const groups = await sourcesDb.getAllSourceGroups();
      setSourceGroups(groups);
    } catch (e) {
      console.error('加载书源分组失败:', e);
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

  const filterGroupOptions = createMemo(() => buildSourceFilterGroupOptions(sourceGroups()));

  const filterDeps = createMemo(() => ({
    criteria: appliedFilter(),
    query: searchQuery(),
    mode: props.sourceSearchMode ?? 'name',
    sortMode: sortMode(),
    sortReverse: sortReverse(),
    groups: filterGroupOptions(),
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
    match: (source) =>
      bookSourcePageItemMatches(
        source,
        filterDeps().criteria,
        filterDeps().groups,
        filterDeps().query,
        filterDeps().mode,
      ),
    postProcess: (matched) =>
      sortBookSourcesCopy(matched, filterDeps().sortMode, filterDeps().sortReverse),
    progressLabel: '正在筛选书源',
  });

  const pageDescription = () => {
    const count = filteredSources().length;
    const allGroups = filterGroupOptions();
    if (hasEffectiveSourceListFilter(appliedFilter(), allGroups)) {
      return formatSourceListToolbarDescription({
        criteria: appliedFilter(),
        allGroupNames: allGroups,
        count,
      });
    }
    return `共 ${count} 个书源`;
  };

  const filterTooltip = () =>
    formatSourceListFilterSummary(appliedFilter(), filterGroupOptions());

  const displayGroups = createMemo(() => {
    const list = filteredSources();
    const mode = groupMode();
    if (mode === 'flat') return [{ name: '', sources: list }];
    const map = new Map<string, BookSource[]>();
    for (const s of list) {
      const key =
        mode === 'by-domain'
          ? getSourceDomain(s.sourceUrl)
          : (s.sourceGroup || '').trim() || UNGROUPED_SOURCE_LABEL;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries())
      .sort((a, b) =>
        a[0] === UNGROUPED_SOURCE_LABEL ? 1 : b[0] === UNGROUPED_SOURCE_LABEL ? -1 : a[0].localeCompare(b[0], 'zh-CN'),
      )
      .map(([name, items]) => ({ name, sources: items }));
  });

  const listRows = createMemo(() => buildSourceManageListRows(displayGroups(), groupMode()));

  const isFilterEmpty = () => !hasEffectiveSourceListFilter(appliedFilter(), filterGroupOptions());

  const listSortableEnabled = createMemo(
    () =>
      (props.enableDragSort ?? true) &&
      sortMode() === 'manual' &&
      groupMode() === 'flat' &&
      !searchQuery().trim() &&
      isFilterEmpty() &&
      filteredSources().length === sources().length,
  );

  const sortableSourceIds = createMemo(() => filteredSources().map((s) => s.sourceUrl));

  /** 平铺 + 手动排序 + 拖拽开关开启时挂载拖拽上下文 */
  const sourceListSortable = createMemo(():
    | VirtualListSortableConfig<SourceManageListRow>
    | undefined => {
    if (!(props.enableDragSort ?? true)) return undefined;
    if (sortMode() !== 'manual' || groupMode() !== 'flat') return undefined;
    return {
      enabled: listSortableEnabled,
      ids: sortableSourceIds,
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

  const allFilteredSelected = createMemo(() => {
    const list = filteredSources();
    if (list.length === 0) return false;
    const selected = selectedSourceUrls();
    return list.every((s) => selected.has(s.sourceUrl));
  });

  const filteredSelectedCount = createMemo(() => {
    const selected = selectedSourceUrls();
    return filteredSources().filter((s) => selected.has(s.sourceUrl)).length;
  });

  function isSelected(sourceUrl: string) {
    return selectedSourceUrls().has(sourceUrl);
  }

  function toggleSelection(sourceUrl: string) {
    const next = new Set(selectedSourceUrls());
    if (next.has(sourceUrl)) next.delete(sourceUrl);
    else next.add(sourceUrl);
    setSelectedSourceUrls(next);
  }

  function selectAll() {
    setSelectedSourceUrls(() => new Set(filteredSources().map((s) => s.sourceUrl)));
  }

  function clearSelection() {
    setSelectedSourceUrls(() => new Set<string>());
  }

  function invertSelection() {
    const current = selectedSourceUrls();
    const allUrls = new Set(filteredSources().map((s) => s.sourceUrl));
    const next = new Set<string>();
    allUrls.forEach((url) => {
      if (!current.has(url)) next.add(url);
    });
    setSelectedSourceUrls(next);
  }

  function toggleSelectAll() {
    if (allFilteredSelected()) clearSelection();
    else selectAll();
  }

  function handleGroupModeChange(mode: SourceManageGroupMode) {
    setGroupMode(mode);
  }

  async function handlePinSource(source: BookSource) {
    const list = sources();
    const minOrder = list.length > 0 ? Math.min(...list.map((s) => s.customOrder)) : 0;
    try {
      await sourcesDb.updateSourceOrder(source.sourceUrl, minOrder - 1);
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已置顶', description: `「${source.sourceName}」已移至列表顶部`, variant: 'default' });
    } catch (e) {
      console.error('置顶失败:', e);
      showAppToast({ title: '置顶失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
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
    } catch (e) {
      console.error('删除书源失败:', e);
      showAppToast({ title: '删除书源失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  async function batchEnable() {
    const urls = [...selectedSourceUrls()];
    if (urls.length === 0) return;
    try {
      for (const url of urls) await sourcesDb.enableSource(url, true);
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已启用', description: `已启用 ${urls.length} 个书源`, variant: 'default' });
      clearSelection();
      loadSources();
    } catch (e) {
      showAppToast({ title: '批量启用失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  async function batchDisable() {
    const urls = [...selectedSourceUrls()];
    if (urls.length === 0) return;
    try {
      for (const url of urls) await sourcesDb.enableSource(url, false);
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已禁用', description: `已禁用 ${urls.length} 个书源`, variant: 'default' });
      clearSelection();
      loadSources();
    } catch (e) {
      showAppToast({ title: '批量禁用失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  function openBatchDeleteConfirm() {
    setBatchDeleteCount(selectedSourceUrls().size);
  }

  async function handleBatchDeleteConfirm() {
    const urls = [...selectedSourceUrls()];
    setBatchDeleteCount(0);
    if (urls.length === 0) return;
    try {
      for (const url of urls) {
        const source = sources().find((s) => s.sourceUrl === url);
        if (source) {
          await purgeBookSourceSession(source);
        }
        await sourcesDb.deleteSource(url);
      }
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已删除', description: `已删除 ${urls.length} 个书源`, variant: 'default' });
      clearSelection();
      loadSources();
    } catch (e) {
      showAppToast({ title: '批量删除失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  async function batchPinToTop() {
    const list = sources();
    const urls = [...selectedSourceUrls()];
    if (urls.length === 0) return;
    const minOrder = list.length > 0 ? Math.min(...list.map((s) => s.customOrder)) : 0;
    try {
      for (let i = 0; i < urls.length; i++) {
        await sourcesDb.updateSourceOrder(urls[i], minOrder - 1 - i);
      }
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已置顶', description: `已将 ${urls.length} 个书源移至顶部`, variant: 'default' });
      clearSelection();
      loadSources();
    } catch (e) {
      showAppToast({ title: '批量置顶失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  async function batchPinToBottom() {
    const list = sources();
    const urls = [...selectedSourceUrls()];
    if (urls.length === 0) return;
    const maxOrder = list.length > 0 ? Math.max(...list.map((s) => s.customOrder)) : 0;
    try {
      for (let i = 0; i < urls.length; i++) {
        await sourcesDb.updateSourceOrder(urls[i], maxOrder + 1 + i);
      }
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已置底', description: `已将 ${urls.length} 个书源移至底部`, variant: 'default' });
      clearSelection();
      loadSources();
    } catch (e) {
      showAppToast({ title: '批量置底失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  function batchExport() {
    const list = sources();
    const selected = list.filter((s) => selectedSourceUrls().has(s.sourceUrl));
    if (selected.length === 0) return;
    try {
      const json = JSON.stringify(selected, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `书源_${selected.length}个_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showAppToast({ title: '已导出', description: `已导出 ${selected.length} 个书源`, variant: 'default' });
      clearSelection();
    } catch (e) {
      showAppToast({ title: '导出失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  async function batchValidate() {
    const urls = [...selectedSourceUrls()];
    if (urls.length === 0) return;
    const list = sources().filter((s) => urls.includes(s.sourceUrl));
    if (list.length === 0) return;
    setValidateDialogOpen(true);
    setValidateResults([]);
    setValidateLoading(true);
    setValidateProgress({ current: 0, total: list.length, name: '' });
    try {
      const results = await validateSources(list, (current, total, name) => {
        setValidateProgress({ current, total, name });
      });
      setValidateResults(results);
      setValidateProgress(null);
      const ok = results.filter((r) =>
        [r.search, r.explore, r.toc, r.content].every((c) => c.kind === 'success' || c.kind === 'skip'),
      ).length;
      showAppToast({ title: '校验完成', description: `${ok}/${results.length} 个书源通过`, variant: 'default' });
    } catch (e) {
      showAppToast({ title: '校验失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
      setValidateResults([]);
    } finally {
      setValidateLoading(false);
      setValidateProgress(null);
    }
  }

  async function batchEnableExplore() {
    const urls = [...selectedSourceUrls()];
    if (urls.length === 0) return;
    try {
      for (const url of urls) await sourcesDb.enableExplore(url, true);
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已启用发现', description: `已为 ${urls.length} 个书源启用发现`, variant: 'default' });
      clearSelection();
      loadSources();
    } catch (e) {
      showAppToast({ title: '批量启用发现失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  async function batchDisableExplore() {
    const urls = [...selectedSourceUrls()];
    if (urls.length === 0) return;
    try {
      for (const url of urls) await sourcesDb.enableExplore(url, false);
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已禁用发现', description: `已为 ${urls.length} 个书源禁用发现`, variant: 'default' });
      clearSelection();
      loadSources();
    } catch (e) {
      showAppToast({ title: '批量禁用发现失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  function checkLabel(kind: ValidateResultKind, message?: string): string {
    switch (kind) {
      case 'success': return '通过';
      case 'skip': return '跳过';
      case 'timeout': return '超时';
      case 'network_error': return '网络错误';
      case 'js_error': return 'JS错误';
      case 'search_empty': return '搜索为空';
      case 'explore_empty': return '发现为空';
      case 'toc_empty': return '目录为空';
      case 'content_empty': return '正文为空';
      default: return message || kind;
    }
  }

  function checkVariant(kind: ValidateResultKind): 'success' | 'secondary' | 'error' | 'warning' {
    if (kind === 'success') return 'success';
    if (kind === 'skip') return 'secondary';
    return 'error';
  }

  createEffect(() => {
    if (sortMode() === 'manual' && sortReverse()) {
      setSortReverse(false);
    }
  });

  return (
    <div class={cn('@container', mainShellPageRoot)}>
      <PageToolbar
        title="书源管理"
        description={pageDescription()}
        titleSlot={
          <PageToolbarTitleDropdown
            title="书源管理"
            description={pageDescription()}
            dropdownEnabled={false}
          />
        }
        leading={<SourcesManageToolbarLeading onBack={() => props.onClose?.()} />}
      >
        <SourcesManagePageToolbar
          searchQuery={searchQuery()}
          onSearchQueryChange={setSearchQuery}
          sortMode={sortMode()}
          sortReverse={sortReverse()}
          sortOptions={SOURCE_MANAGE_SORT_OPTIONS}
          onSortModeChange={setSortMode}
          onSortReverseChange={setSortReverse}
          filterTooltip={filterTooltip()}
          onOpenFilterDialog={() => setFilterDialogOpen(true)}
          groupMode={groupMode()}
          onGroupModeChange={handleGroupModeChange}
          sourceSearchMode={props.sourceSearchMode}
          onSourceSearchModeChange={props.onSourceSearchModeChange}
          onSourcesNew={props.onSourcesNew}
          onSourcesImportLocal={props.onSourcesImportLocal}
          onSourcesImportNetwork={props.onSourcesImportNetwork}
          onSourcesImportQR={props.onSourcesImportQR}
          onSourcesImportCode={props.onSourcesImportCode}
          onOpenSourceGroupManage={props.onOpenSourceGroupManage}
          enableDragSort={props.enableDragSort ?? true}
          onEnableDragSortChange={props.onEnableDragSortChange}
        />
      </PageToolbar>

      <SourcesFilterDialog
        open={filterDialogOpen()}
        onOpenChange={setFilterDialogOpen}
        sourceGroups={sourceGroups()}
        appliedFilter={appliedFilter()}
        onApply={setAppliedFilter}
      />

      <div class="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
        <Show when={filtering() && filterProgressText()}>
          <div class="shrink-0 px-3 pb-2 text-center text-xs text-muted-foreground">
            {filterProgressText()}
          </div>
        </Show>
        <Show when={error()}>
          <p class="shrink-0 px-1 pb-2 text-sm text-destructive">{error()}</p>
        </Show>
        <Show when={showSkeleton()}>
          <ul class="shrink-0 space-y-2 px-1">
            <For each={[1, 2, 3, 4, 5]}>
              {() => (
                <li class="flex h-12 items-center gap-3 rounded-lg border border-border/50 bg-card px-3 animate-pulse">
                  <span class="h-4 w-4 rounded bg-muted" />
                  <span class="h-4 flex-1 rounded bg-muted" />
                  <span class="h-5 w-9 rounded-full bg-muted" />
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={!loading() && !showSkeleton() && sources().length === 0}>
          <div class="flex flex-1 items-center justify-center px-1">
            <div class="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
              <p>暂无书源</p>
              <p class="mt-1">可通过「更多」新建或导入书源</p>
            </div>
          </div>
        </Show>
        <Show when={!loading() && !showSkeleton() && sources().length > 0 && filteredSources().length === 0 && !filtering()}>
          <div class="flex flex-1 items-center justify-center px-1">
            <div class="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
              <p>无匹配书源</p>
              <p class="mt-1">尝试修改搜索关键词或筛选条件</p>
            </div>
          </div>
        </Show>
        <Show when={!loading() && !showSkeleton() && filteredSources().length > 0}>
          <VirtualSourceManageList
            rows={listRows()}
            class="px-1"
            sortable={sourceListSortable()}
            renderDragOverlay={
              sourceListSortable() ? renderSourceDragOverlay : undefined
            }
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
                <SourceManageListItem
                  source={source}
                  showGroupBadge={row.showGroupBadge}
                  selected={isSelected(source.sourceUrl)}
                  onToggleSelection={() => toggleSelection(source.sourceUrl)}
                  onSelectionChange={(checked) => {
                    const next = new Set(selectedSourceUrls());
                    if (checked) next.add(source.sourceUrl);
                    else next.delete(source.sourceUrl);
                    setSelectedSourceUrls(next);
                  }}
                  onSourceEdit={props.onSourceEdit}
                  onSourceVariables={props.onSourceVariables}
                  onPinSource={handlePinSource}
                  onClearCookieCf={(s) => void handleClearCookieCf(s)}
                  onDeleteSource={(s) => {
                    setSourceToDelete(s);
                    setDeleteDialogOpen(true);
                  }}
                  onEnableChange={async (s, checked) => {
                    try {
                      await sourcesDb.enableSource(s.sourceUrl, checked);
                      window.dispatchEvent(new CustomEvent('sources-refresh'));
                      loadSources();
                    } catch (e) {
                      showAppToast({
                        title: '操作失败',
                        description: e instanceof Error ? e.message : '请稍后重试',
                        variant: 'destructive',
                      });
                    }
                  }}
                />
              );
            }}
          </VirtualSourceManageList>
        </Show>
      </div>

      <div class="shrink-0 border-t border-border px-3 py-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleSelectAll} disabled={filteredSources().length === 0}>
              {allFilteredSelected() ? '取消全选' : '全选'}({filteredSelectedCount()}/{filteredSources().length})
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection} disabled={selectedCount() === 0}>
              取消选中
            </Button>
            <Button variant="outline" size="sm" onClick={invertSelection} disabled={filteredSources().length === 0}>
              反选
            </Button>
          </div>
          <div class="flex min-[448px]:hidden! items-center gap-2">
            <AppDropdownMenu>
              <AppDropdownMenuTrigger
                as={(p: Record<string, unknown>) => (
                  <AppDropdownMenuButtonTrigger
                    triggerProps={p}
                    variant="outline"
                    size="sm"
                    class={BATCH_MENU_TRIGGER_CLASS}
                  >
                    操作
                    <ChevronDownIcon class={BATCH_MENU_CHEVRON_CLASS} />
                  </AppDropdownMenuButtonTrigger>
                )}
              />
              <AppDropdownMenuContent layout="compact">
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => batchEnable()}>启用所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => batchDisable()}>禁用所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => batchEnableExplore()}>启用发现</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => batchDisableExplore()}>禁用发现</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => batchPinToTop()}>置顶所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => batchPinToBottom()}>置底所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => batchExport()}>导出所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => batchValidate()}>校验所选</AppDropdownMenuItem>
                <AppDropdownMenuItem
                  disabled={selectedCount() === 0}
                  class="text-destructive focus:text-destructive"
                  onSelect={() => openBatchDeleteConfirm()}
                >
                  删除所选
                </AppDropdownMenuItem>
              </AppDropdownMenuContent>
            </AppDropdownMenu>
          </div>
          <div class="hidden min-[448px]:flex xl:hidden! items-center gap-2">
            <Button variant="destructive" size="sm" onClick={openBatchDeleteConfirm} disabled={selectedCount() === 0}>
              删除所选
            </Button>
            <AppDropdownMenu>
              <AppDropdownMenuTrigger
                as={(p: Record<string, unknown>) => (
                  <AppDropdownMenuButtonTrigger
                    triggerProps={p}
                    variant="outline"
                    size="sm"
                    class={BATCH_MENU_TRIGGER_CLASS}
                  >
                    更多
                    <ChevronDownIcon class={BATCH_MENU_CHEVRON_CLASS} />
                  </AppDropdownMenuButtonTrigger>
                )}
              />
              <AppDropdownMenuContent layout="compact">
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => batchEnable()}>启用所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => batchDisable()}>禁用所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => batchEnableExplore()}>启用发现</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => batchDisableExplore()}>禁用发现</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => batchPinToTop()}>置顶所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => batchPinToBottom()}>置底所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => batchExport()}>导出所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => batchValidate()}>校验所选</AppDropdownMenuItem>
              </AppDropdownMenuContent>
            </AppDropdownMenu>
          </div>
          <div class="hidden xl:flex! flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={batchEnable} disabled={selectedCount() === 0}>启用所选</Button>
            <Button variant="outline" size="sm" onClick={batchDisable} disabled={selectedCount() === 0}>禁用所选</Button>
            <Button variant="outline" size="sm" onClick={batchEnableExplore} disabled={selectedCount() === 0}>启用发现</Button>
            <Button variant="outline" size="sm" onClick={batchDisableExplore} disabled={selectedCount() === 0}>禁用发现</Button>
            <Button variant="outline" size="sm" onClick={batchPinToTop} disabled={selectedCount() === 0}>置顶所选</Button>
            <Button variant="outline" size="sm" onClick={batchPinToBottom} disabled={selectedCount() === 0}>置底所选</Button>
            <Button variant="outline" size="sm" onClick={batchExport} disabled={selectedCount() === 0}>导出所选</Button>
            <Button variant="outline" size="sm" onClick={batchValidate} disabled={selectedCount() === 0}>校验所选</Button>
            <Button variant="destructive" size="sm" onClick={openBatchDeleteConfirm} disabled={selectedCount() === 0}>删除所选</Button>
          </div>
        </div>
      </div>

      <DeleteSourceDialog
        open={deleteDialogOpen()}
        onOpenChange={setDeleteDialogOpen}
        source={sourceToDelete()}
        onConfirm={handleConfirmDelete}
      />

      <AppDialog open={batchDeleteCount() > 0} onOpenChange={(open) => !open && setBatchDeleteCount(0)}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>删除所选书源</AppDialogTitle>
            <AppDialogDescription>
              确定删除所选 {batchDeleteCount()} 个书源？删除后无法恢复。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteCount(0)}>取消</Button>
            <Button variant="destructive" onClick={handleBatchDeleteConfirm}>删除</Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <AppDialog open={validateDialogOpen()} onOpenChange={setValidateDialogOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>书源校验结果</AppDialogTitle>
            <AppDialogDescription>
              <Show when={validateLoading() && validateProgress()}>
                {validateProgress()!.current} / {validateProgress()!.total}：{validateProgress()!.name || '…'}
              </Show>
              <Show when={!validateLoading() && validateResults().length > 0}>
                共 {validateResults().length} 个书源，可查看各检查项结果。
              </Show>
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogScrollBody class={appDialogScrollBodySpaceY4}>
            <Show when={validateLoading() && validateResults().length === 0}>
              <p class="text-sm text-muted-foreground">正在校验中…</p>
            </Show>
            <For each={validateResults()}>
              {(r) => (
                <div class="rounded-lg border border-border/60 p-3 space-y-2">
                  <AppTooltip>
                    <AppTooltipTrigger as="div" class="font-medium text-sm truncate">{r.sourceName}</AppTooltipTrigger>
                    <AppTooltipContent>{r.sourceName}</AppTooltipContent>
                  </AppTooltip>
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div class="flex flex-col gap-0.5">
                      <span class="text-muted-foreground">搜索</span>
                      <Badge variant={checkVariant(r.search.kind)} class="w-fit">{checkLabel(r.search.kind, r.search.message)}</Badge>
                    </div>
                    <div class="flex flex-col gap-0.5">
                      <span class="text-muted-foreground">发现</span>
                      <Badge variant={checkVariant(r.explore.kind)} class="w-fit">{checkLabel(r.explore.kind, r.explore.message)}</Badge>
                    </div>
                    <div class="flex flex-col gap-0.5">
                      <span class="text-muted-foreground">目录</span>
                      <Badge variant={checkVariant(r.toc.kind)} class="w-fit">{checkLabel(r.toc.kind, r.toc.message)}</Badge>
                    </div>
                    <div class="flex flex-col gap-0.5">
                      <span class="text-muted-foreground">正文</span>
                      <Badge variant={checkVariant(r.content.kind)} class="w-fit">{checkLabel(r.content.kind, r.content.message)}</Badge>
                    </div>
                  </div>
                </div>
              )}
            </For>
          </AppDialogScrollBody>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setValidateDialogOpen(false)}>关闭</Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
}
