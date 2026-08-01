/**
 * 订阅模块管理页
 * 添加订阅、OPML（全量/按分类精选合集）、多选批量操作、分类管理。
 */

import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import {
  DragDropProvider,
  DragDropSensors,
  SortableProvider,
} from '@thisbeyond/solid-dnd';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AppSwitch,
  AppSwitchControl,
  AppSwitchThumb,
} from '@/components/shared/AppSwitch';
import {
  AppDropdownMenu,
  AppDropdownMenuButtonTrigger,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
} from '@/components/shared/AppTooltip';
import {
  ChevronDownIcon,
  FolderTreeIcon,
  ImportIcon,
  ExportIcon,
  MoreIcon,
  PencilIcon,
  PlusIcon,
  Settings2Icon,
  TrashIcon,
} from '@/components/shared/icons';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { ExpandableIconSearch } from '@/components/shared/ExpandableIconSearch';
import { showAppToast } from '@/components/shared/AppToasts';
import { SubscribeManageListSkeleton } from '@/components/media/subscribe/SubscribeSkeletons';
import { SubscribeSourcesSortDropdown } from '@/components/media/subscribe/SubscribeSourcesSortDropdown';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { cn } from '@/lib/utils';
import {
  mainShellPageRoot,
  mainShellPageScroll,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import { listSubSources, setSubSourceEnabled } from '@/lib/database/subscribe';
import type { SubSourceRow } from '@/lib/database/subscribe';
import {
  applySubscribeSourceLayout,
  importSubscribeOpml,
  listSubscribeCategories,
  removeSubscribeSource,
  updateSubscribeSource,
} from '@/lib/subscribe/service';
import { subscribeCategoryRevision } from '@/lib/subscribe/subscribe-category-registry';
import { subscribeFeedDataRevision } from '@/lib/subscribe/feed-data-revision';
import { downloadSubscribeOpmlFile } from '@/lib/subscribe/download-subscribe-opml';
import { formatSubscribeTime } from '@/lib/subscribe/presentation';
import {
  filterSourcesByManageSearch,
  getSubscribeManageSearchPrefs,
} from '@/lib/subscribe/subscribe-manage-search-prefs';
import { groupSubscribeSourcesByCategory } from '@/lib/subscribe/subscribe-source-groups';
import {
  SUBSCRIBE_MANAGE_FILTER_ALL,
  SUBSCRIBE_MANAGE_FILTER_UNCATEGORIZED,
  SUBSCRIBE_MANAGE_SORT_OPTIONS,
  filterSubscribeSourcesByManageCategory,
  sortSubscribeSourcesCopy,
  subscribeManageFilterLabel,
  type SubscribeSourceSortMode,
} from '@/lib/subscribe/subscribe-source-sort';
import { SUBSCRIBE_HOME_NAV_SELECT_TRIGGER_CLASS } from '@/components/media/subscribe/subscribe-home-nav';
import { SubscribeSourceLogo } from '@/components/media/subscribe/SubscribeSourceLogo';
import { SubscribeSourceAddDialog } from '@/components/media/subscribe/SubscribeSourceAddDialog';
import { SubscribeSourceContextMenu } from '@/components/media/subscribe/SubscribeSourceContextMenu';
import {
  SubscribeCategoryDroppable,
  SubscribeDragHandle,
  SubscribeDragOverlay,
  SubscribeSourceSortableRow,
  useSubscribeMultiListDnd,
} from '@/components/media/subscribe/SubscribeSourceDnd';
import {
  SubscribeSourceFormDialog,
  draftFromSubSource,
  type SubscribeSourceFormDraft,
} from '@/components/media/subscribe/SubscribeSourceFormDialog';
import { SubscribeCategoryManageDialog } from '@/components/media/subscribe/SubscribeCategoryManageDialog';
import {
  SubscribeCategoryPickDialog,
  type SubscribeCategoryPickMode,
} from '@/components/media/subscribe/SubscribeCategoryPickDialog';
import { SubscribeManageSearchConfigDialog } from '@/components/media/subscribe/SubscribeManageSearchConfigDialog';
import { SUBSCRIBE_FEED_VIEW_LABELS, subscribeFeedViewNumberToKind } from '@/lib/subscribe/feed-view';
import { pickFiles } from '@/lib/platform/fs/pick-file';
import type { PickResult } from '@/lib/platform/fs/pick-types';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { readTextFile } from '@/lib/platform/filesystem';

const BATCH_MENU_TRIGGER_CLASS = 'gap-1.5 group/trigger';
const BATCH_MENU_CHEVRON_CLASS =
  'h-3.5 w-3.5 opacity-60 transition-transform group-data-[expanded]/trigger:rotate-180';

async function textFromPickResult(p: PickResult): Promise<string> {
  if (p.legacyFile) return p.legacyFile.text();
  if (p.bytes) return new TextDecoder().decode(p.bytes);
  if (p.ref.kind === 'path') return readTextFile(p.ref.value);
  throw new Error('无法读取所选文件');
}

function ManageCategorySection(props: {
  category: string;
  sourceIds: string[];
  sourceById: Map<string, SubSourceRow>;
  categories: string[];
  busy: boolean;
  isSelected: (id: string) => boolean;
  setSelection: (id: string, checked: boolean) => void;
  toggleSelection: (id: string) => void;
  openEditDialog: (source: SubSourceRow) => void;
  refreshAll: () => void;
  doExportOpml: (category?: string) => void | Promise<void>;
  categoryLabel: (value: string) => string;
  sortable: boolean;
  /** false：平铺列表，不显示分类头 */
  showCategoryHeader?: boolean;
}) {
  const showCategoryHeader = () => props.showCategoryHeader !== false;
  const renderRow = (
    source: SubSourceRow,
    dragActivators?: Record<string, unknown>,
  ) => (
    <SubscribeSourceContextMenu
      source={source}
      categories={props.categories}
      onChanged={props.refreshAll}
      onEdit={props.openEditDialog}
    >
      <div
        class={cn(
          'flex items-center gap-2 px-4 py-3 sm:gap-3',
          props.isSelected(source.id) && 'bg-primary/5',
        )}
        onClick={(e) => {
          const t = e.target as HTMLElement | null;
          if (t?.closest('button, a, input, [role="switch"], [role="checkbox"]')) {
            return;
          }
          props.toggleSelection(source.id);
        }}
      >
        {dragActivators ? (
          <SubscribeDragHandle activators={dragActivators} class="h-9" />
        ) : null}
        <Checkbox
          checked={props.isSelected(source.id)}
          onChange={(checked: boolean) => props.setSelection(source.id, checked)}
          aria-label={`选择 ${source.title || source.url}`}
          onClick={(e: MouseEvent) => e.stopPropagation()}
        />
        <SubscribeSourceLogo
          source={source}
          class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
          iconClass="h-4 w-4 text-muted-foreground"
        />
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium">{source.title || source.url}</div>
          <div class="truncate text-xs text-muted-foreground">{source.url}</div>
          <div class="mt-0.5 truncate text-[11px] text-muted-foreground">
            {SUBSCRIBE_FEED_VIEW_LABELS[subscribeFeedViewNumberToKind(source.view)]}
            {' · '}
            上次刷新：
            {formatSubscribeTime(source.lastFetchAt) || '从未'}
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <AppSwitch
            checked={source.enabled}
            onChange={(checked) =>
              void setSubSourceEnabled(source.id, checked).then(() => props.refreshAll())
            }
            aria-label={source.enabled ? '停用订阅源' : '启用订阅源'}
          >
            <AppSwitchControl>
              <AppSwitchThumb />
            </AppSwitchControl>
          </AppSwitch>
          <AppTooltip>
            <AppTooltipTrigger
              as={Button}
              type="button"
              variant="ghost"
              size="icon"
              class="h-9 w-9 shrink-0"
              aria-label="编辑"
              disabled={props.busy}
              onClick={() => props.openEditDialog(source)}
            >
              <PencilIcon class="h-4 w-4" />
            </AppTooltipTrigger>
            <AppTooltipContent>编辑</AppTooltipContent>
          </AppTooltip>
          <AppTooltip>
            <AppTooltipTrigger
              as={Button}
              type="button"
              variant="ghost"
              size="icon"
              class="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
              aria-label="删除"
              disabled={props.busy}
              onClick={() =>
                void removeSubscribeSource(source.id).then(() => {
                  showAppToast({ title: '已删除订阅源' });
                  props.refreshAll();
                })
              }
            >
              <TrashIcon class="h-4 w-4" />
            </AppTooltipTrigger>
            <AppTooltipContent>删除</AppTooltipContent>
          </AppTooltip>
        </div>
      </div>
    </SubscribeSourceContextMenu>
  );

  const header = (
    <Show when={showCategoryHeader()}>
      <div class="flex items-center gap-2 border-b px-4 py-2">
        <div class="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
          {props.categoryLabel(props.category)} · {props.sourceIds.length}
        </div>
        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            type="button"
            variant="ghost"
            size="icon"
            class="h-7 w-7 shrink-0"
            aria-label={`导出分类 ${props.categoryLabel(props.category)}`}
            disabled={props.busy}
            onClick={() => void props.doExportOpml(props.category)}
          >
            <ExportIcon class="h-3.5 w-3.5" />
          </AppTooltipTrigger>
          <AppTooltipContent>导出本分类 OPML（分享精选）</AppTooltipContent>
        </AppTooltip>
      </div>
    </Show>
  );

  const body = (
    <Show
      when={props.sourceIds.length > 0}
      fallback={
        <div class="px-4 py-6 text-center text-xs text-muted-foreground">
          {props.sortable ? '暂无订阅源，拖入此处可移入' : '暂无订阅源'}
        </div>
      }
    >
      <Show
        when={props.sortable}
        fallback={
          <div class="divide-y">
            <For each={props.sourceIds}>
              {(id) => {
                const source = props.sourceById.get(id);
                return source ? renderRow(source) : null;
              }}
            </For>
          </div>
        }
      >
        <SortableProvider ids={props.sourceIds}>
          <div class="divide-y">
            <For each={props.sourceIds}>
              {(id) => {
                const source = () => props.sourceById.get(id);
                return (
                  <Show when={source()}>
                    {(s) => (
                      <SubscribeSourceSortableRow id={s().id} class="w-full min-w-0">
                        {(api) => renderRow(s(), api.dragActivators)}
                      </SubscribeSourceSortableRow>
                    )}
                  </Show>
                );
              }}
            </For>
          </div>
        </SortableProvider>
      </Show>
    </Show>
  );

  return (
    <Show
      when={props.sortable}
      fallback={
        <section class="rounded-2xl border border-border/50 bg-card">
          {header}
          {body}
        </section>
      }
    >
      <SubscribeCategoryDroppable
        category={props.category}
        class="rounded-2xl border border-border/50 bg-card"
      >
        {header}
        {body}
      </SubscribeCategoryDroppable>
    </Show>
  );
}

export function SubscribeSourcesManagePage() {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const [sources, { refetch }] = createResource(
    () => subscribeFeedDataRevision(),
    () => listSubSources(),
  );
  const [categories, { refetch: refetchCategories }] = createResource(
    () => [subscribeFeedDataRevision(), subscribeCategoryRevision()] as const,
    () => listSubscribeCategories(),
  );
  const showSkeleton = useSkeletonLoading(() => sources.loading && sources() == null);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [searchPrefsTick, setSearchPrefsTick] = createSignal(0);
  const [categoryFilter, setCategoryFilter] = createSignal(SUBSCRIBE_MANAGE_FILTER_ALL);
  const [sortMode, setSortMode] = createSignal<SubscribeSourceSortMode>('manual');
  const [sortReverse, setSortReverse] = createSignal(false);
  const [showByCategory, setShowByCategory] = createSignal(true);
  const [busy, setBusy] = createSignal('');
  const [addOpen, setAddOpen] = createSignal(false);
  const [editOpen, setEditOpen] = createSignal(false);
  const [editDraft, setEditDraft] = createSignal<SubscribeSourceFormDraft | null>(null);
  const [categoryManageOpen, setCategoryManageOpen] = createSignal(false);
  const [searchConfigOpen, setSearchConfigOpen] = createSignal(false);
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [batchDeleteCount, setBatchDeleteCount] = createSignal(0);
  const [categoryPickOpen, setCategoryPickOpen] = createSignal(false);
  const [categoryPickMode, setCategoryPickMode] =
    createSignal<SubscribeCategoryPickMode>('move');
  const [removeCategoryConfirm, setRemoveCategoryConfirm] = createSignal(false);

  const categoryFilterOptions = createMemo(() => {
    const opts = [SUBSCRIBE_MANAGE_FILTER_ALL];
    let hasUncategorized = false;
    for (const name of categories() ?? []) {
      if (!name.trim()) {
        hasUncategorized = true;
        continue;
      }
      opts.push(name);
    }
    for (const source of sources() ?? []) {
      if (!source.category.trim()) hasUncategorized = true;
    }
    if (hasUncategorized) opts.push(SUBSCRIBE_MANAGE_FILTER_UNCATEGORIZED);
    return [...new Set(opts)];
  });

  const filteredSources = createMemo(() => {
    searchPrefsTick();
    const searched = filterSourcesByManageSearch(
      sources() ?? [],
      searchQuery(),
      getSubscribeManageSearchPrefs(),
    );
    const byCategory = filterSubscribeSourcesByManageCategory(
      searched,
      categoryFilter(),
    );
    return sortSubscribeSourcesCopy(byCategory, sortMode(), sortReverse());
  });

  const groupedSources = createMemo((): Array<[string, SubSourceRow[]]> => {
    const list = filteredSources();
    if (!showByCategory()) {
      return [['', list]];
    }
    const known =
      searchQuery().trim() || categoryFilter() !== SUBSCRIBE_MANAGE_FILTER_ALL
        ? []
        : (categories() ?? []);
    const groups = groupSubscribeSourcesByCategory(list, known);
    // 组内再按当前排序（list 已排过；分组会打散跨组顺序，组内相对序仍保留）
    return groups
      .map(
        ([category, items]) =>
          [
            category,
            sortSubscribeSourcesCopy(items, sortMode(), sortReverse()),
          ] as [string, SubSourceRow[]],
      )
      .filter(([, items]) => {
        if (searchQuery().trim() || categoryFilter() !== SUBSCRIBE_MANAGE_FILTER_ALL) {
          return items.length > 0;
        }
        return true;
      });
  });

  const dndEnabled = () =>
    showByCategory() &&
    sortMode() === 'manual' &&
    !sortReverse() &&
    categoryFilter() === SUBSCRIBE_MANAGE_FILTER_ALL &&
    !searchQuery().trim() &&
    !busy();

  const multiDnd = useSubscribeMultiListDnd({
    groups: groupedSources,
    sources: () => filteredSources(),
    onPersist: async (layout) => {
      try {
        await applySubscribeSourceLayout(layout);
        refreshAll();
      } catch (error) {
        showAppToast({
          title: '排序失败',
          description: error instanceof Error ? error.message : String(error),
          variant: 'error',
        });
        throw error;
      }
    },
  });

  const selectedCount = () => selectedIds().size;
  const filteredSelectedCount = () =>
    filteredSources().filter((s) => selectedIds().has(s.id)).length;
  const allFilteredSelected = () => {
    const list = filteredSources();
    return list.length > 0 && list.every((s) => selectedIds().has(s.id));
  };

  function categoryLabel(value: string) {
    return value.trim() ? value : '未分类';
  }

  function refreshAll() {
    void refetch();
    void refetchCategories();
  }

  function openAddDialog() {
    setAddOpen(true);
  }

  function openEditDialog(source: SubSourceRow) {
    setEditDraft(draftFromSubSource(source));
    setEditOpen(true);
  }

  function isSelected(id: string) {
    return selectedIds().has(id);
  }

  function toggleSelection(id: string) {
    const next = new Set(selectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function setSelection(id: string, checked: boolean) {
    const next = new Set(selectedIds());
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  }

  function toggleSelectAll() {
    const list = filteredSources();
    if (allFilteredSelected()) {
      const next = new Set(selectedIds());
      for (const s of list) next.delete(s.id);
      setSelectedIds(next);
      return;
    }
    const next = new Set(selectedIds());
    for (const s of list) next.add(s.id);
    setSelectedIds(next);
  }

  function clearSelection() {
    setSelectedIds(new Set<string>());
  }

  function invertSelection() {
    const list = filteredSources();
    const next = new Set(selectedIds());
    for (const s of list) {
      if (next.has(s.id)) next.delete(s.id);
      else next.add(s.id);
    }
    setSelectedIds(next);
  }

  function selectedSources(): SubSourceRow[] {
    const ids = selectedIds();
    return (sources() ?? []).filter((s) => ids.has(s.id));
  }

  async function doImportOpml() {
    setBusy('正在导入 OPML...');
    try {
      const picked = await pickFiles({
        filters: [{ name: 'OPML', extensions: ['opml', 'xml'] }],
        multiple: false,
      });
      const file = picked[0];
      if (!file) {
        setBusy('');
        return;
      }
      const xml = await textFromPickResult(file);
      const result = await importSubscribeOpml(xml);
      showAppToast({
        title: 'OPML 导入完成',
        description: `新增 ${result.imported}，跳过 ${result.skipped}（保留 OPML 分类）`,
      });
      refreshAll();
    } catch (error) {
      if (!isUserCancelled(error)) {
        showAppToast({
          title: '导入失败',
          description: error instanceof Error ? error.message : String(error),
          variant: 'error',
        });
      }
    } finally {
      setBusy('');
    }
  }

  async function doExportOpml(category?: string) {
    const label =
      category === undefined ? '全部' : category.trim() ? category.trim() : '未分类';
    setBusy(`正在导出「${label}」…`);
    try {
      await downloadSubscribeOpmlFile(
        category === undefined ? undefined : { category },
      );
      showAppToast({
        title: '已导出 OPML',
        description:
          category === undefined
            ? '全部分类'
            : `精选合集「${label}」可分享给他人导入`,
      });
    } catch (error) {
      showAppToast({
        title: '导出失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy('');
    }
  }

  async function batchEnable(enabled: boolean) {
    const list = selectedSources();
    if (!list.length) return;
    setBusy(enabled ? '正在启用…' : '正在停用…');
    try {
      for (const source of list) {
        await setSubSourceEnabled(source.id, enabled);
      }
      showAppToast({
        title: enabled ? '已启用所选' : '已停用所选',
        description: `${list.length} 个源`,
      });
      refreshAll();
    } catch (error) {
      showAppToast({
        title: '操作失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy('');
    }
  }

  async function batchExportSelected() {
    const ids = [...selectedIds()];
    if (!ids.length) return;
    setBusy('正在导出所选…');
    try {
      await downloadSubscribeOpmlFile({ sourceIds: ids });
      showAppToast({ title: '已导出所选', description: `${ids.length} 个源` });
    } catch (error) {
      showAppToast({
        title: '导出失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy('');
    }
  }

  function openCategoryPick(mode: SubscribeCategoryPickMode) {
    if (selectedCount() === 0) return;
    setCategoryPickMode(mode);
    setCategoryPickOpen(true);
  }

  async function applyCategoryPick(category: string) {
    const list = selectedSources();
    if (!list.length) return;
    const mode = categoryPickMode();
    setBusy(mode === 'join' ? '正在加入分类…' : '正在移动分类…');
    try {
      for (const source of list) {
        await updateSubscribeSource(source.id, { category: category.trim() });
      }
      showAppToast({
        title: mode === 'join' ? '已加入分类' : '已移动分类',
        description: `${list.length} 个源 → ${category.trim() || '未分类'}`,
      });
      clearSelection();
      refreshAll();
    } catch (error) {
      showAppToast({
        title: '操作失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy('');
    }
  }

  async function batchClearCategory() {
    const list = selectedSources();
    if (!list.length) return;
    setBusy('正在移除分类…');
    try {
      for (const source of list) {
        await updateSubscribeSource(source.id, { category: '' });
      }
      showAppToast({ title: '已移除分类', description: `${list.length} 个源` });
      setRemoveCategoryConfirm(false);
      clearSelection();
      refreshAll();
    } catch (error) {
      showAppToast({
        title: '操作失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy('');
    }
  }

  async function batchDelete() {
    const list = selectedSources();
    if (!list.length) return;
    setBusy('正在删除…');
    try {
      for (const source of list) {
        await removeSubscribeSource(source.id);
      }
      showAppToast({ title: '已删除所选', description: `${list.length} 个源` });
      setBatchDeleteCount(0);
      clearSelection();
      refreshAll();
    } catch (error) {
      showAppToast({
        title: '删除失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy('');
    }
  }

  const batchActionItems = () => (
    <>
      <AppDropdownMenuItem
        disabled={selectedCount() === 0 || !!busy()}
        onSelect={() => void batchEnable(true)}
      >
        启用所选
      </AppDropdownMenuItem>
      <AppDropdownMenuItem
        disabled={selectedCount() === 0 || !!busy()}
        onSelect={() => void batchEnable(false)}
      >
        停用所选
      </AppDropdownMenuItem>
      <AppDropdownMenuItem
        disabled={selectedCount() === 0 || !!busy()}
        onSelect={() => void batchExportSelected()}
      >
        导出所选
      </AppDropdownMenuItem>
      <AppDropdownMenuItem
        disabled={selectedCount() === 0 || !!busy()}
        onSelect={() => openCategoryPick('move')}
      >
        移动至分类
      </AppDropdownMenuItem>
      <AppDropdownMenuItem
        disabled={selectedCount() === 0 || !!busy()}
        onSelect={() => openCategoryPick('join')}
      >
        加入到分类
      </AppDropdownMenuItem>
      <AppDropdownMenuItem
        disabled={selectedCount() === 0 || !!busy()}
        onSelect={() => setRemoveCategoryConfirm(true)}
      >
        移除分类
      </AppDropdownMenuItem>
      <AppDropdownMenuItem
        disabled={selectedCount() === 0 || !!busy()}
        class="text-destructive focus:text-destructive"
        onSelect={() => setBatchDeleteCount(selectedCount())}
      >
        删除所选
      </AppDropdownMenuItem>
    </>
  );

  return (
    <section class={cn(tabEnterClass(), mainShellPageRoot)}>
      <PageToolbar
        class={pageToolbarBottomBorder}
        title="管理"
        description={`共 ${sources()?.length ?? 0} 个源`}
        titleSlot={
          <PageToolbarTitleDropdown
            title="管理"
            description={`共 ${sources()?.length ?? 0} 个源`}
            dropdownEnabled={false}
          />
        }
      >
        <AppSelect
          options={categoryFilterOptions()}
          value={categoryFilter()}
          onChange={(next) => {
            if (next) setCategoryFilter(next);
          }}
          itemComponent={(itemProps) => (
            <AppSelectItem item={itemProps.item}>
              {subscribeManageFilterLabel(String(itemProps.item.rawValue))}
            </AppSelectItem>
          )}
        >
          <AppSelectTrigger
            layout="compact"
            class={SUBSCRIBE_HOME_NAV_SELECT_TRIGGER_CLASS}
            aria-label="筛选分类"
          >
            <AppSelectValue>
              {(state) =>
                subscribeManageFilterLabel(
                  String(state.selectedOption() ?? SUBSCRIBE_MANAGE_FILTER_ALL),
                )
              }
            </AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectListbox />
          </AppSelectContent>
        </AppSelect>
        <ExpandableIconSearch
          value={searchQuery()}
          onValueChange={setSearchQuery}
          placeholder="搜索订阅源"
          tooltip="搜索"
          aria-label="搜索订阅源"
        />
        <SubscribeSourcesSortDropdown
          sortMode={sortMode()}
          sortReverse={sortReverse()}
          options={SUBSCRIBE_MANAGE_SORT_OPTIONS}
          onSortModeChange={(mode) => {
            setSortMode(mode);
            if (mode === 'manual') setSortReverse(false);
          }}
          onSortReverseChange={setSortReverse}
          showByCategory={showByCategory()}
          onShowByCategoryChange={setShowByCategory}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-9 w-9"
          aria-label="添加订阅源"
          disabled={!!busy()}
          onClick={openAddDialog}
        >
          <PlusIcon class="h-4 w-4" />
        </Button>
        <AppDropdownMenu>
          <AppDropdownMenuTrigger
            as={(triggerProps: Record<string, unknown>) => (
              <AppDropdownMenuIconTrigger triggerProps={triggerProps} aria-label="更多">
                <MoreIcon class="h-4 w-4" />
              </AppDropdownMenuIconTrigger>
            )}
          />
          <AppDropdownMenuContent>
            <AppDropdownMenuItem onSelect={openAddDialog} disabled={!!busy()}>
              <PlusIcon class="h-4 w-4" />
              <span>添加订阅源</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={() => void doImportOpml()} disabled={!!busy()}>
              <ImportIcon class="h-4 w-4" />
              <span>导入精选合集 (OPML)</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={() => void doExportOpml()} disabled={!!busy()}>
              <ExportIcon class="h-4 w-4" />
              <span>导出全部 (OPML)</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem
              onSelect={() => setCategoryManageOpen(true)}
              disabled={!!busy()}
            >
              <FolderTreeIcon class="h-4 w-4" />
              <span>分类管理</span>
            </AppDropdownMenuItem>
            <AppDropdownMenuItem onSelect={() => setSearchConfigOpen(true)}>
              <Settings2Icon class="h-4 w-4" />
              <span>搜索偏好</span>
            </AppDropdownMenuItem>
          </AppDropdownMenuContent>
        </AppDropdownMenu>
      </PageToolbar>

      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col gap-3 pb-4')}>
        <Show when={busy()}>
          <div class="px-1 text-xs text-muted-foreground">{busy()}</div>
        </Show>

        <Show when={showSkeleton()}>
          <SubscribeManageListSkeleton />
        </Show>

        <Show when={!showSkeleton() && filteredSources().length === 0}>
          <div class="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center">
            <div class="text-sm text-muted-foreground">
              {searchQuery().trim() ||
              categoryFilter() !== SUBSCRIBE_MANAGE_FILTER_ALL
                ? '没有匹配的订阅源'
                : '还没有订阅源'}
            </div>
            <Show
              when={
                !searchQuery().trim() &&
                categoryFilter() === SUBSCRIBE_MANAGE_FILTER_ALL
              }
            >
              <Button size="sm" onClick={openAddDialog}>
                <PlusIcon class="mr-1 h-3.5 w-3.5" />
                添加订阅源
              </Button>
            </Show>
          </div>
        </Show>

        <Show when={!showSkeleton() && filteredSources().length > 0}>
          <div class="space-y-4">
            <Show
              when={dndEnabled()}
              fallback={
                <For each={groupedSources()}>
                  {([category, groupSources]) => (
                    <ManageCategorySection
                      category={category}
                      sourceIds={groupSources.map((s) => s.id)}
                      sourceById={new Map(groupSources.map((s) => [s.id, s]))}
                      categories={categories() ?? []}
                      busy={!!busy()}
                      isSelected={isSelected}
                      setSelection={setSelection}
                      toggleSelection={toggleSelection}
                      openEditDialog={openEditDialog}
                      refreshAll={refreshAll}
                      doExportOpml={doExportOpml}
                      categoryLabel={categoryLabel}
                      sortable={false}
                      showCategoryHeader={showByCategory()}
                    />
                  )}
                </For>
              }
            >
              <DragDropProvider
                collisionDetector={multiDnd.collisionDetector}
                onDragStart={multiDnd.onDragStart}
                onDragOver={multiDnd.onDragOver}
                onDragEnd={multiDnd.onDragEnd}
              >
                <DragDropSensors />
                <For each={groupedSources()}>
                  {([category]) => (
                    <ManageCategorySection
                      category={category}
                      sourceIds={multiDnd.itemsOf(category)}
                      sourceById={multiDnd.sourceById()}
                      categories={categories() ?? []}
                      busy={!!busy()}
                      isSelected={isSelected}
                      setSelection={setSelection}
                      toggleSelection={toggleSelection}
                      openEditDialog={openEditDialog}
                      refreshAll={refreshAll}
                      doExportOpml={doExportOpml}
                      categoryLabel={categoryLabel}
                      sortable
                      showCategoryHeader={showByCategory()}
                    />
                  )}
                </For>
                <SubscribeDragOverlay>
                  {(draggable) => {
                    const source = () =>
                      draggable
                        ? multiDnd.sourceById().get(String(draggable.id))
                        : undefined;
                    return (
                      <Show when={source()}>
                        {(s) => (
                          <div class="flex w-[min(24rem,90vw)] items-center gap-2 rounded-md border bg-background px-3 py-2 shadow-lg">
                            <span class="text-muted-foreground">≡</span>
                            <SubscribeSourceLogo
                              source={s()}
                              class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
                              iconClass="h-4 w-4 text-muted-foreground"
                            />
                            <div class="min-w-0 flex-1 truncate text-sm font-medium">
                              {s().title || s().url}
                            </div>
                          </div>
                        )}
                      </Show>
                    );
                  }}
                </SubscribeDragOverlay>
              </DragDropProvider>
            </Show>
          </div>
        </Show>
      </div>

      {/* 底部固定：批量操作栏（与书源/书架管理页一致） */}
      <div class="shrink-0 border-t border-border px-3 py-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAll}
              disabled={filteredSources().length === 0}
            >
              {allFilteredSelected() ? '取消全选' : '全选'}(
              {filteredSelectedCount()}/{filteredSources().length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearSelection}
              disabled={selectedCount() === 0}
            >
              取消选中
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={invertSelection}
              disabled={filteredSources().length === 0}
            >
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
              <AppDropdownMenuContent layout="compact">{batchActionItems()}</AppDropdownMenuContent>
            </AppDropdownMenu>
          </div>

          <div class="hidden min-[448px]:flex xl:hidden! items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedCount() === 0 || !!busy()}
              onClick={() => setBatchDeleteCount(selectedCount())}
            >
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
                <AppDropdownMenuItem
                  disabled={selectedCount() === 0 || !!busy()}
                  onSelect={() => void batchEnable(true)}
                >
                  启用所选
                </AppDropdownMenuItem>
                <AppDropdownMenuItem
                  disabled={selectedCount() === 0 || !!busy()}
                  onSelect={() => void batchEnable(false)}
                >
                  停用所选
                </AppDropdownMenuItem>
                <AppDropdownMenuItem
                  disabled={selectedCount() === 0 || !!busy()}
                  onSelect={() => void batchExportSelected()}
                >
                  导出所选
                </AppDropdownMenuItem>
                <AppDropdownMenuItem
                  disabled={selectedCount() === 0 || !!busy()}
                  onSelect={() => openCategoryPick('move')}
                >
                  移动至分类
                </AppDropdownMenuItem>
                <AppDropdownMenuItem
                  disabled={selectedCount() === 0 || !!busy()}
                  onSelect={() => openCategoryPick('join')}
                >
                  加入到分类
                </AppDropdownMenuItem>
                <AppDropdownMenuItem
                  disabled={selectedCount() === 0 || !!busy()}
                  onSelect={() => setRemoveCategoryConfirm(true)}
                >
                  移除分类
                </AppDropdownMenuItem>
              </AppDropdownMenuContent>
            </AppDropdownMenu>
          </div>

          <div class="hidden xl:flex! flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={selectedCount() === 0 || !!busy()}
              onClick={() => void batchEnable(true)}
            >
              启用所选
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedCount() === 0 || !!busy()}
              onClick={() => void batchEnable(false)}
            >
              停用所选
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedCount() === 0 || !!busy()}
              onClick={() => void batchExportSelected()}
            >
              导出所选
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedCount() === 0 || !!busy()}
              onClick={() => openCategoryPick('move')}
            >
              移动至分类
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedCount() === 0 || !!busy()}
              onClick={() => openCategoryPick('join')}
            >
              加入到分类
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedCount() === 0 || !!busy()}
              onClick={() => setRemoveCategoryConfirm(true)}
            >
              移除分类
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedCount() === 0 || !!busy()}
              onClick={() => setBatchDeleteCount(selectedCount())}
            >
              删除所选
            </Button>
          </div>
        </div>
      </div>

      <SubscribeSourceAddDialog
        open={addOpen()}
        onOpenChange={setAddOpen}
        onCreated={refreshAll}
      />

      <SubscribeSourceFormDialog
        open={editOpen()}
        draft={editDraft()}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditDraft(null);
        }}
        onUpdated={refreshAll}
      />

      <SubscribeCategoryManageDialog
        open={categoryManageOpen()}
        onOpenChange={setCategoryManageOpen}
        onCategoriesChange={refreshAll}
      />

      <SubscribeManageSearchConfigDialog
        open={searchConfigOpen()}
        onOpenChange={setSearchConfigOpen}
        onSaved={() => setSearchPrefsTick((n) => n + 1)}
      />

      <SubscribeCategoryPickDialog
        open={categoryPickOpen()}
        onOpenChange={setCategoryPickOpen}
        mode={categoryPickMode()}
        categories={categories() ?? []}
        selectedCount={selectedCount()}
        onConfirm={applyCategoryPick}
      />

      <AppDialog
        open={batchDeleteCount() > 0}
        onOpenChange={(open) => !open && setBatchDeleteCount(0)}
      >
        <AppDialogContent class="sm:max-w-sm">
          <AppDialogHeader>
            <AppDialogTitle>删除所选</AppDialogTitle>
            <AppDialogDescription>
              确定删除所选 {batchDeleteCount()} 个订阅源？本地条目也会被删除。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteCount(0)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void batchDelete()}>
              删除
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <AppDialog
        open={removeCategoryConfirm()}
        onOpenChange={setRemoveCategoryConfirm}
      >
        <AppDialogContent class="sm:max-w-sm">
          <AppDialogHeader>
            <AppDialogTitle>移除分类</AppDialogTitle>
            <AppDialogDescription>
              将所选 {selectedCount()} 个源的分类清空（变为未分类）。不会删除订阅源。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setRemoveCategoryConfirm(false)}>
              取消
            </Button>
            <Button onClick={() => void batchClearCategory()}>确定</Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </section>
  );
}
