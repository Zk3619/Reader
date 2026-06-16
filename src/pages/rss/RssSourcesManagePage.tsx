/**
 * RSS 订阅源管理：列表、启用、删除、导入、拖拽排序
 */

import {
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
  For,
  Show,
} from 'solid-js';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { useChunkedFilter } from '@/lib/hooks/useChunkedFilter';
import * as rssSourcesDb from '@/lib/database/rss-sources';
import { deleteRssArticlesByOrigin } from '@/lib/database/rss-articles';
import type { BookSource, NewRssSource, RssSource } from '@/types';
import { cn } from '@/lib/utils';
import { mainShellPageRoot } from '@/lib/ui/viewport-classes';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import {
  RssSourcesManagePageToolbar,
  RssSourcesManageToolbarLeading,
} from '@/components/rss/RssSourcesManagePageToolbar';
import { RssSourcesManageFilterDialog } from '@/components/rss/RssSourcesManageFilterDialog';
import { Button } from '@/components/ui/button';
import { Switch, SwitchControl, SwitchThumb } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { TruncatedTooltip } from '@/components/shared/TruncatedTooltip';
import { showAppToast } from '@/components/shared/AppToasts';
import { type SourceSortMode } from '@/lib/sources/source-sort';
import {
  EMPTY_RSS_SOURCE_LIST_FILTER,
  buildRssManageFilterGroupOptions,
  buildRssManageFilterDomainOptions,
  formatRssSourceListFilterSummary,
  formatRssSourceListToolbarDescription,
  hasEffectiveRssSourceListFilter,
} from '@/lib/rss/rss-source-list-filter';
import { ImportSourceNetworkDialog } from '@/components/sources/ImportSourceNetworkDialog';
import { ImportSourceQrDialog } from '@/components/sources/ImportSourceQrDialog';
import { ImportCodeDialog } from '@/components/shared/ImportCodeDialog';
import { ImportRssSourceSelectDialog } from '@/components/rss/ImportRssSourceSelectDialog';
import { pickLocalBookSourceFiles } from '@/lib/book-source/pick-local-booksource-file';
import { parseRssSourceJson } from '@/lib/book-source/import-rss-source';
import { parseReaderImportDeepLink } from '@/lib/platform/legado-import-uri';
import {
  buildRssImportComparisons,
  defaultRssImportSelection,
  importSelectedRssSources,
  resolveRssSourcesFromNetworkUrl,
  resolveRssSourcesFromText,
  type ImportRssSourceComparison,
} from '@/lib/book-source/import-rss-resolver';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import {
  buildSourceManageListRows,
  SourceManageListDragOverlay,
  VirtualSourceManageList,
  type SourceManageListRow,
} from '@/components/sources/VirtualSourceManageList';
import type { VirtualListSortableConfig } from '@/components/shared/virtual-list';
import type { Id } from '@thisbeyond/solid-dnd';
import { settingsStore } from '@/stores/settings';
import {
  AppDropdownMenu,
  AppDropdownMenuButtonTrigger,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { SourceShareQrDialog } from '@/components/sources/SourceShareQrDialog';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import {
  addRssGroupsToSource,
  collectRssSourceGroupNames,
  removeRssGroupsFromSource,
} from '@/lib/rss/rss-source-groups';
import { ChevronDownIcon, MoreIcon } from '@/components/shared/icons';
import { clearSourceCookieAndCfRecord } from '@/lib/book-source/purge-source-session';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import {
  dispatchRssSourcesRefresh,
  RSS_SOURCES_REFRESH_EVENT,
} from '@/lib/rss/rss-sources-refresh-event';
import {
  rssManagePageFilterIsPassThrough,
  rssManagePageItemMatches,
  sortRssSourcesCopy,
} from '@/lib/rss/rss-manage-page-filter';

const BATCH_MENU_TRIGGER_CLASS = 'gap-1.5 group/trigger';
const BATCH_MENU_CHEVRON_CLASS =
  'h-4 w-4 shrink-0 opacity-50 transition-transform duration-200 group-data-expanded/trigger:rotate-180';

export interface RssSourcesManagePageProps {
  onClose?: () => void;
  onSourceEdit?: (source: RssSource) => void;
  onSourcesNew?: () => void;
}

export function RssSourcesManagePage(props: RssSourcesManagePageProps) {
  const [sources, setSources] = createSignal<RssSource[]>([]);
  const [sourceGroups, setSourceGroups] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [sortMode, setSortMode] = createSignal<SourceSortMode>('manual');
  const [sortReverse, setSortReverse] = createSignal(false);
  const [enableDragSort, setEnableDragSort] = createSignal(true);
  const [filterDialogOpen, setFilterDialogOpen] = createSignal(false);
  const [appliedFilter, setAppliedFilter] = createSignal(EMPTY_RSS_SOURCE_LIST_FILTER);
  const [selectedUrls, setSelectedUrls] = createSignal<Set<string>>(new Set());
  const [showNetworkImport, setShowNetworkImport] = createSignal(false);
  const [showQrImport, setShowQrImport] = createSignal(false);
  const [showCodeImport, setShowCodeImport] = createSignal(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false);
  const [deleteTarget, setDeleteTarget] = createSignal<RssSource | null>(null);
  const [batchDeleteCount, setBatchDeleteCount] = createSignal(0);
  const [groupDialogOpen, setGroupDialogOpen] = createSignal(false);
  const [groupDialogInput, setGroupDialogInput] = createSignal('');
  const [removeGroupDialogOpen, setRemoveGroupDialogOpen] = createSignal(false);
  const [shareDialogOpen, setShareDialogOpen] = createSignal(false);
  const [shareJsonText, setShareJsonText] = createSignal('');

  const [showImportSelect, setShowImportSelect] = createSignal(false);
  const [importLoading, setImportLoading] = createSignal(false);
  const [importCandidates, setImportCandidates] = createSignal<NewRssSource[]>([]);
  const [importComparisons, setImportComparisons] = createSignal<ImportRssSourceComparison[]>([]);
  const [importSelectedUrls, setImportSelectedUrls] = createSignal<Set<string>>(new Set());
  const [importKeepName, setImportKeepName] = createSignal(false);
  const [importKeepGroup, setImportKeepGroup] = createSignal(false);
  const [importKeepEnable, setImportKeepEnable] = createSignal(false);
  const [importGroupName, setImportGroupName] = createSignal('');
  const [importGroupOptions, setImportGroupOptions] = createSignal<string[]>([]);
  const [importAdjustGroup, setImportAdjustGroup] = createSignal(false);

  const showSkeleton = useSkeletonLoading(loading, { delay: 100, minDisplayTime: 300 });

  async function loadSources() {
    setLoading(true);
    try {
      const list = await rssSourcesDb.getAllRssSources();
      setSources(list);
    } catch (e) {
      console.error('加载 RSS 源失败:', e);
      setSources([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadGroups() {
    try {
      setSourceGroups(await rssSourcesDb.getAllRssSourceGroups());
    } catch {
      setSourceGroups([]);
    }
  }

  onMount(() => {
    void loadSources();
    void loadGroups();
    const handler = () => {
      void loadSources();
      void loadGroups();
    };
    window.addEventListener(RSS_SOURCES_REFRESH_EVENT, handler);
    onCleanup(() => window.removeEventListener(RSS_SOURCES_REFRESH_EVENT, handler));
  });

  createEffect(() => {
    if (sortMode() === 'manual' && sortReverse()) {
      setSortReverse(false);
    }
  });

  const filterGroupOptions = createMemo(() => buildRssManageFilterGroupOptions(sourceGroups()));
  const filterDomainOptions = createMemo(() => buildRssManageFilterDomainOptions(sources()));

  const filterDeps = createMemo(() => ({
    criteria: appliedFilter(),
    query: searchQuery(),
    sortMode: sortMode(),
    sortReverse: sortReverse(),
    groups: filterGroupOptions(),
    domains: filterDomainOptions(),
  }));

  const { filtered: filteredSources, filtering, progressText: filterProgressText } = useChunkedFilter({
    items: sources,
    deps: () => filterDeps(),
    isPassThrough: () =>
      rssManagePageFilterIsPassThrough(
        sources(),
        filterDeps().criteria,
        filterDeps().groups,
        filterDeps().domains,
        filterDeps().query,
      ),
    match: (source) =>
      rssManagePageItemMatches(
        source,
        filterDeps().criteria,
        filterDeps().groups,
        filterDeps().domains,
        filterDeps().query,
      ),
    postProcess: (matched) =>
      sortRssSourcesCopy(matched, filterDeps().sortMode, filterDeps().sortReverse),
    progressLabel: '正在筛选订阅源',
  });

  const pageDescription = () => {
    const count = filteredSources().length;
    const allGroups = filterGroupOptions();
    const allDomains = filterDomainOptions();
    if (hasEffectiveRssSourceListFilter(appliedFilter(), allGroups, allDomains)) {
      return formatRssSourceListToolbarDescription({
        criteria: appliedFilter(),
        allGroupNames: allGroups,
        allDomainNames: allDomains,
        count,
      });
    }
    return `共 ${count} 个订阅源`;
  };

  const filterTooltip = () =>
    formatRssSourceListFilterSummary(
      appliedFilter(),
      filterGroupOptions(),
      filterDomainOptions(),
    );

  const listRows = createMemo(() =>
    buildSourceManageListRows(
      [{ name: '', sources: filteredSources() as unknown as BookSource[] }],
      'flat',
    ),
  );

  const isFilterEmpty = () =>
    !hasEffectiveRssSourceListFilter(
      appliedFilter(),
      filterGroupOptions(),
      filterDomainOptions(),
    );

  const listSortableEnabled = createMemo(
    () =>
      enableDragSort() &&
      sortMode() === 'manual' &&
      !searchQuery().trim() &&
      isFilterEmpty() &&
      filteredSources().length === sources().length,
  );

  const sourceListSortable = createMemo(():
    | VirtualListSortableConfig<SourceManageListRow>
    | undefined => {
    if (!enableDragSort()) return undefined;
    if (sortMode() !== 'manual') return undefined;
    return {
      enabled: listSortableEnabled,
      ids: () => filteredSources().map((s) => s.sourceUrl),
      onReorder: handleSourcesReorder,
      persistOnly: true,
    };
  });

  async function handlePinSource(source: RssSource) {
    const list = sources();
    const minOrder = list.length > 0 ? Math.min(...list.map((s) => s.customOrder)) : 0;
    try {
      await rssSourcesDb.updateRssSourceOrder(source.sourceUrl, minOrder - 1);
      dispatchRssSourcesRefresh({ reason: 'source-reordered' });
      showAppToast({
        title: '已置顶',
        description: `「${source.sourceName}」已移至列表顶部`,
      });
      await loadSources();
    } catch (e) {
      showAppToast({
        title: '置顶失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  async function handlePinToBottom(source: RssSource) {
    const list = sources();
    const maxOrder = list.length > 0 ? Math.max(...list.map((s) => s.customOrder)) : 0;
    try {
      await rssSourcesDb.updateRssSourceOrder(source.sourceUrl, maxOrder + 1);
      dispatchRssSourcesRefresh({ reason: 'source-reordered' });
      showAppToast({
        title: '已置底',
        description: `「${source.sourceName}」已移至列表底部`,
      });
      await loadSources();
    } catch (e) {
      showAppToast({
        title: '置底失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  async function handleClearCookieCf(source: RssSource) {
    try {
      await clearSourceCookieAndCfRecord(rssAsBookSource(source));
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

  async function handleSourcesReorder(orderedIds: Id[]) {
    try {
      await rssSourcesDb.updateRssSourceOrders(
        orderedIds.map((id, i) => ({ sourceUrl: String(id), customOrder: i })),
      );
      const byUrl = new Map(sources().map((s) => [s.sourceUrl, s]));
      for (let i = 0; i < orderedIds.length; i++) {
        const source = byUrl.get(String(orderedIds[i]));
        if (source) source.customOrder = i;
      }
      dispatchRssSourcesRefresh({ reason: 'source-reordered' });
    } catch (e) {
      showAppToast({
        title: '排序失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
      await loadSources();
    }
  }

  const selectedCount = () => selectedUrls().size;

  const allFilteredSelected = createMemo(() => {
    const list = filteredSources();
    if (list.length === 0) return false;
    const selected = selectedUrls();
    return list.every((s) => selected.has(s.sourceUrl));
  });

  const filteredSelectedCount = createMemo(() => {
    const selected = selectedUrls();
    return filteredSources().filter((s) => selected.has(s.sourceUrl)).length;
  });

  const selectedSources = () =>
    sources().filter((s) => selectedUrls().has(s.sourceUrl));

  const removeGroupCandidates = createMemo(() =>
    collectRssSourceGroupNames(selectedSources()),
  );

  const canSelectRangesByPairs = () => selectedCount() >= 2;

  function clearSelection() {
    setSelectedUrls(new Set<string>());
  }

  function selectAll() {
    setSelectedUrls(new Set(filteredSources().map((s) => s.sourceUrl)));
  }

  function invertSelection() {
    const current = selectedUrls();
    const next = new Set<string>();
    for (const source of filteredSources()) {
      if (!current.has(source.sourceUrl)) next.add(source.sourceUrl);
    }
    setSelectedUrls(next);
  }

  function toggleSelectAll() {
    if (allFilteredSelected()) clearSelection();
    else selectAll();
  }

  function selectRangesByPairs() {
    if (!canSelectRangesByPairs()) return;
    const list = filteredSources();
    const selectedIndices: number[] = [];
    list.forEach((source, index) => {
      if (selectedUrls().has(source.sourceUrl)) selectedIndices.push(index);
    });
    if (selectedIndices.length < 2) return;
    const next = new Set(selectedUrls());
    for (let p = 0; p + 1 < selectedIndices.length; p += 2) {
      const lo = Math.min(selectedIndices[p]!, selectedIndices[p + 1]!);
      const hi = Math.max(selectedIndices[p]!, selectedIndices[p + 1]!);
      for (let i = lo; i <= hi; i++) {
        next.add(list[i]!.sourceUrl);
      }
    }
    setSelectedUrls(next);
  }

  const toggleSelection = (url: string) => {
    const next = new Set(selectedUrls());
    if (next.has(url)) next.delete(url);
    else next.add(url);
    setSelectedUrls(next);
  };

  const handleEnable = async (source: RssSource, enabled: boolean) => {
    await rssSourcesDb.enableRssSource(source.sourceUrl, enabled);
    setSources((prev) =>
      prev.map((s) => (s.sourceUrl === source.sourceUrl ? { ...s, enabled } : s)),
    );
    dispatchRssSourcesRefresh({ reason: 'source-updated' });
  };

  const confirmDelete = async () => {
    const target = deleteTarget();
    if (!target) return;
    await rssSourcesDb.deleteRssSource(target.sourceUrl);
    await deleteRssArticlesByOrigin(target.sourceUrl);
    showAppToast({ title: '已删除', description: target.sourceName });
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
    await loadSources();
    dispatchRssSourcesRefresh({ reason: 'source-removed', invalidateCache: true });
  };

  function openBatchDeleteConfirm() {
    const n = selectedCount();
    if (n > 0) setBatchDeleteCount(n);
  }

  async function handleBatchDeleteConfirm() {
    const urls = [...selectedUrls()];
    setBatchDeleteCount(0);
    if (urls.length === 0) return;
    try {
      for (const url of urls) {
        await rssSourcesDb.deleteRssSource(url);
        await deleteRssArticlesByOrigin(url);
      }
      clearSelection();
      showAppToast({ title: '已删除', description: `已删除 ${urls.length} 个订阅源` });
      await loadSources();
      dispatchRssSourcesRefresh({ reason: 'source-removed', invalidateCache: true });
    } catch (e) {
      showAppToast({
        title: '批量删除失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  async function batchEnable(enabled: boolean) {
    const urls = [...selectedUrls()];
    if (urls.length === 0) return;
    try {
      for (const url of urls) {
        await rssSourcesDb.enableRssSource(url, enabled);
      }
      dispatchRssSourcesRefresh({ reason: 'source-batch-updated' });
      showAppToast({
        title: enabled ? '已启用' : '已禁用',
        description: `已${enabled ? '启用' : '禁用'} ${urls.length} 个订阅源`,
      });
      clearSelection();
      await loadSources();
    } catch (e) {
      showAppToast({
        title: enabled ? '批量启用失败' : '批量禁用失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  async function batchPinToTop() {
    const list = sources();
    const urls = [...selectedUrls()];
    if (urls.length === 0) return;
    const minOrder = list.length > 0 ? Math.min(...list.map((s) => s.customOrder)) : 0;
    try {
      for (let i = 0; i < urls.length; i++) {
        await rssSourcesDb.updateRssSourceOrder(urls[i]!, minOrder - 1 - i);
      }
      dispatchRssSourcesRefresh({ reason: 'source-reordered' });
      showAppToast({ title: '已置顶', description: `已将 ${urls.length} 个订阅源移至顶部` });
      clearSelection();
      await loadSources();
    } catch (e) {
      showAppToast({
        title: '批量置顶失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  async function batchPinToBottom() {
    const list = sources();
    const urls = [...selectedUrls()];
    if (urls.length === 0) return;
    const maxOrder = list.length > 0 ? Math.max(...list.map((s) => s.customOrder)) : 0;
    try {
      for (let i = 0; i < urls.length; i++) {
        await rssSourcesDb.updateRssSourceOrder(urls[i]!, maxOrder + 1 + i);
      }
      dispatchRssSourcesRefresh({ reason: 'source-reordered' });
      showAppToast({ title: '已置底', description: `已将 ${urls.length} 个订阅源移至底部` });
      clearSelection();
      await loadSources();
    } catch (e) {
      showAppToast({
        title: '批量置底失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  function batchExport() {
    const selected = selectedSources();
    if (selected.length === 0) return;
    try {
      const json = JSON.stringify(selected, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `订阅源_${selected.length}个_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showAppToast({ title: '已导出', description: `已导出 ${selected.length} 个订阅源` });
      clearSelection();
    } catch (e) {
      showAppToast({
        title: '导出失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  function batchShare() {
    const selected = selectedSources();
    if (selected.length === 0) return;
    setShareJsonText(JSON.stringify(selected, null, 2));
    setShareDialogOpen(true);
  }

  function openAddGroupDialog() {
    if (selectedCount() === 0) return;
    setGroupDialogInput('');
    setGroupDialogOpen(true);
  }

  function openRemoveGroupDialog() {
    if (selectedCount() === 0) return;
    const groups = collectRssSourceGroupNames(selectedSources());
    if (groups.length === 0) {
      showAppToast({ title: '所选订阅源暂无分组', variant: 'default' });
      return;
    }
    setGroupDialogInput(groups[0] ?? '');
    setRemoveGroupDialogOpen(true);
  }

  async function applyAddGroup(groupName: string) {
    const name = groupName.trim();
    if (!name) {
      showAppToast({ title: '请输入分组名称', variant: 'destructive' });
      return;
    }
    const urls = [...selectedUrls()];
    if (urls.length === 0) return;
    try {
      for (const url of urls) {
        const source = sources().find((s) => s.sourceUrl === url);
        if (!source) continue;
        const updated = addRssGroupsToSource(source, name);
        await rssSourcesDb.updateRssSourceGroupField(url, updated.sourceGroup);
      }
      setGroupDialogOpen(false);
      setGroupDialogInput('');
      dispatchRssSourcesRefresh({ reason: 'source-batch-updated' });
      showAppToast({ title: '已添加分组', description: `已为 ${urls.length} 个订阅源添加「${name}」` });
      clearSelection();
      await loadSources();
      await loadGroups();
    } catch (e) {
      showAppToast({
        title: '添加分组失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  async function applyRemoveGroup(groupName: string) {
    const name = groupName.trim();
    if (!name) return;
    const urls = [...selectedUrls()];
    if (urls.length === 0) return;
    try {
      for (const url of urls) {
        const source = sources().find((s) => s.sourceUrl === url);
        if (!source) continue;
        const updated = removeRssGroupsFromSource(source, name);
        await rssSourcesDb.updateRssSourceGroupField(url, updated.sourceGroup);
      }
      setRemoveGroupDialogOpen(false);
      setGroupDialogInput('');
      dispatchRssSourcesRefresh({ reason: 'source-batch-updated' });
      showAppToast({ title: '已移除分组', description: `已从 ${urls.length} 个订阅源移除「${name}」` });
      clearSelection();
      await loadSources();
      await loadGroups();
    } catch (e) {
      showAppToast({
        title: '移除分组失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  async function openImportSelectLoading() {
    const app = settingsStore.state.app;
    setImportKeepName(app.importKeepName ?? false);
    setImportKeepGroup(app.importKeepGroup ?? false);
    setImportKeepEnable(app.importKeepEnable ?? false);
    setImportGroupName('');
    setImportAdjustGroup(false);
    setImportLoading(true);
    setImportCandidates([]);
    setImportComparisons([]);
    setImportSelectedUrls(new Set<string>());
    try {
      const groups = await rssSourcesDb.getAllRssSourceGroups();
      setImportGroupOptions(groups);
    } catch {
      setImportGroupOptions([]);
    }
    setShowImportSelect(true);
  }

  async function applyRecognizedRssSources(sources: NewRssSource[], title = '导入订阅源') {
    if (sources.length === 0) {
      setShowImportSelect(false);
      showAppToast({ title, description: '未识别到有效订阅源', variant: 'default' });
      return;
    }
    const comparisons = await buildRssImportComparisons(sources);
    setImportCandidates(sources);
    setImportComparisons(comparisons);
    setImportSelectedUrls(defaultRssImportSelection(comparisons));
    setImportLoading(false);
  }

  const handleLocalImport = async () => {
    const files = await pickLocalBookSourceFiles();
    if (!files?.length) return;
    await openImportSelectLoading();
    try {
      const all: NewRssSource[] = [];
      for (const file of files) {
        all.push(...parseRssSourceJson(await file.text()));
      }
      await applyRecognizedRssSources(all, '本地导入');
    } catch (e) {
      setShowImportSelect(false);
      showAppToast({
        title: '本地导入失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setImportLoading(false);
    }
  };

  const handleNetworkIdentify = async (url: string) => {
    await openImportSelectLoading();
    try {
      const list = await resolveRssSourcesFromNetworkUrl(url);
      await applyRecognizedRssSources(list, '网络导入');
    } catch (e) {
      setShowImportSelect(false);
      showAppToast({
        title: '网络导入失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setImportLoading(false);
    }
  };

  const handleRawTextIdentify = async (raw: string, via: 'qr' | 'code' = 'qr') => {
    const label = via === 'qr' ? '二维码导入' : '代码导入';
    const parsed = parseReaderImportDeepLink(raw);
    if (parsed?.kind === 'unsupported') {
      showAppToast({ title: label, description: parsed.reason, variant: 'default' });
      return;
    }
    if (parsed?.kind === 'rssNetwork') {
      await handleNetworkIdentify(parsed.src);
      return;
    }
    await openImportSelectLoading();
    try {
      const list = await resolveRssSourcesFromText(raw);
      await applyRecognizedRssSources(list, label);
    } catch (e) {
      setShowImportSelect(false);
      showAppToast({
        title: `${label}失败`,
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setImportLoading(false);
    }
  };

  const handleQrIdentify = (raw: string) => handleRawTextIdentify(raw, 'qr');

  const confirmImportSelected = async () => {
    const selected = new Set(importSelectedUrls());
    const list = importCandidates().filter((s) => selected.has(s.sourceUrl));
    if (list.length === 0) {
      showAppToast({ title: '导入订阅源', description: '请先选择订阅源' });
      return;
    }
    try {
      setImportLoading(true);
      await settingsStore.setImportSourceKeepOptions({
        importKeepName: importKeepName(),
        importKeepGroup: importKeepGroup(),
        importKeepEnable: importKeepEnable(),
      });
      const n = await importSelectedRssSources(list, {
        keepName: importKeepName(),
        keepGroup: importKeepGroup(),
        keepEnable: importKeepEnable(),
        groupName: importGroupName(),
        adjustGroup: importAdjustGroup(),
      });
      showAppToast({ title: '导入完成', description: `已导入 ${n} 条` });
      setShowImportSelect(false);
      setImportCandidates([]);
      setImportComparisons([]);
      setImportSelectedUrls(new Set<string>());
      await loadSources();
      await loadGroups();
    } catch (e) {
      showAppToast({
        title: '导入失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setImportLoading(false);
    }
  };

  const renderRow = (row: SourceManageListRow) => {
    if (row.type !== 'source') return null;
    const source = row.source as unknown as RssSource;
    return (
      <div class="box-border h-full pb-2">
        <div class="flex h-12 items-center gap-3 rounded-lg border border-border/50 bg-card px-3">
          <Checkbox
            checked={selectedUrls().has(source.sourceUrl)}
            onChange={() => toggleSelection(source.sourceUrl)}
            aria-label={`选择 ${source.sourceName}`}
          />
          <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <TruncatedTooltip
              as="span"
              text={source.sourceName}
              class="min-w-0 shrink font-medium text-foreground"
            />
            <Show when={row.showGroupBadge && source.sourceGroup?.trim()}>
              <TruncatedTooltip
                as="span"
                text={source.sourceGroup!}
                class="min-w-0 shrink-2 rounded bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
              />
            </Show>
          </div>
          <div
            class="shrink-0"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <Switch
              checked={source.enabled}
              onChange={(checked) => void handleEnable(source, checked)}
              aria-label={source.enabled ? '禁用订阅源' : '启用订阅源'}
            >
              <SwitchControl>
                <SwitchThumb />
              </SwitchControl>
            </Switch>
          </div>
          <div
            class="shrink-0"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <AppDropdownMenu>
              <AppDropdownMenuTrigger
                as={(triggerProps: Record<string, unknown>) => (
                  <AppDropdownMenuIconTrigger
                    triggerProps={triggerProps}
                    class="h-8 w-8"
                    aria-label={`${source.sourceName} 更多操作`}
                  >
                    <MoreIcon class="h-4 w-4" />
                  </AppDropdownMenuIconTrigger>
                )}
              />
              <AppDropdownMenuContent align="end" layout="compact">
                <AppDropdownMenuItem onSelect={() => props.onSourceEdit?.(source)}>
                  编辑
                </AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => void handlePinSource(source)}>
                  置顶
                </AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => void handlePinToBottom(source)}>
                  置底
                </AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => void handleClearCookieCf(source)}>
                  清除 Cookie/CF 记录
                </AppDropdownMenuItem>
                <AppDropdownMenuItem
                  class="text-destructive focus:text-destructive"
                  onSelect={() => {
                    setDeleteTarget(source);
                    setDeleteDialogOpen(true);
                  }}
                >
                  删除
                </AppDropdownMenuItem>
              </AppDropdownMenuContent>
            </AppDropdownMenu>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div class={cn('@container flex min-h-0 flex-1 flex-col', mainShellPageRoot)}>
      <PageToolbar
        title="订阅源管理"
        description={pageDescription()}
        titleSlot={
          <PageToolbarTitleDropdown
            title="订阅源管理"
            description={pageDescription()}
            dropdownEnabled={false}
          />
        }
        leading={<RssSourcesManageToolbarLeading onBack={() => props.onClose?.()} />}
      >
        <RssSourcesManagePageToolbar
          searchQuery={searchQuery()}
          onSearchQueryChange={setSearchQuery}
          sortMode={sortMode()}
          sortReverse={sortReverse()}
          onSortModeChange={setSortMode}
          onSortReverseChange={setSortReverse}
          filterTooltip={filterTooltip()}
          filterActive={hasEffectiveRssSourceListFilter(appliedFilter(), filterGroupOptions())}
          onOpenFilterDialog={() => setFilterDialogOpen(true)}
          onSourcesNew={props.onSourcesNew}
          onSourcesImportLocal={() => void handleLocalImport()}
          onSourcesImportNetwork={() => setShowNetworkImport(true)}
          onSourcesImportQR={() => setShowQrImport(true)}
          onSourcesImportCode={() => setShowCodeImport(true)}
          enableDragSort={enableDragSort()}
          onEnableDragSortChange={setEnableDragSort}
        />
      </PageToolbar>

      <RssSourcesManageFilterDialog
        open={filterDialogOpen()}
        onOpenChange={setFilterDialogOpen}
        sourceGroups={sourceGroups()}
        sources={sources()}
        appliedFilter={appliedFilter()}
        onApply={setAppliedFilter}
      />

      <div class="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
        <Show when={filtering() && filterProgressText()}>
          <div class="shrink-0 px-3 pb-2 text-center text-xs text-muted-foreground">
            {filterProgressText()}
          </div>
        </Show>
        <Show when={showSkeleton()}>
          <ul class="shrink-0 space-y-2 px-1">
            <For each={Array.from({ length: 8 })}>
              {() => <li class="h-12 animate-pulse rounded-lg bg-muted/40" />}
            </For>
          </ul>
        </Show>

        <Show when={!showSkeleton() && sources().length === 0}>
          <div class="flex flex-1 items-center justify-center px-1">
            <div class="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
              <p>暂无订阅源</p>
              <p class="mt-1">可通过「更多」新建或导入订阅源</p>
            </div>
          </div>
        </Show>

        <Show when={!showSkeleton() && sources().length > 0 && filteredSources().length === 0 && !filtering()}>
          <div class="flex flex-1 items-center justify-center px-1">
            <div class="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
              <p>无匹配订阅源</p>
              <p class="mt-1">尝试修改搜索关键词或筛选条件</p>
            </div>
          </div>
        </Show>

        <Show when={!showSkeleton() && filteredSources().length > 0}>
          <VirtualSourceManageList
            rows={listRows()}
            class="px-1"
            sortable={sourceListSortable()}
            renderDragOverlay={(activeId) => {
              if (activeId == null) return null;
              const row = listRows().find(
                (r): r is Extract<SourceManageListRow, { type: 'source' }> =>
                  r.type === 'source' && r.source.sourceUrl === String(activeId),
              );
              if (!row) return null;
              return (
                <SourceManageListDragOverlay
                  source={row.source}
                  showGroupBadge={row.showGroupBadge}
                />
              );
            }}
          >
            {(row) => renderRow(row)}
          </VirtualSourceManageList>
        </Show>
      </div>

      <div class="shrink-0 border-t border-border px-3 py-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAll}
              disabled={filteredSources().length === 0}
            >
              {allFilteredSelected() ? '取消全选' : '全选'}({filteredSelectedCount()}/
              {filteredSources().length})
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection} disabled={selectedCount() === 0}>
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
              <AppDropdownMenuContent layout="compact">
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => void batchEnable(true)}>启用所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => void batchEnable(false)}>禁用所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={openAddGroupDialog}>添加分组</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={openRemoveGroupDialog}>移除分组</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => void batchPinToTop()}>置顶所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => void batchPinToBottom()}>置底所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={batchExport}>导出所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={batchShare}>分享所选</AppDropdownMenuItem>
                <AppDropdownMenuItem
                  disabled={!canSelectRangesByPairs()}
                  onSelect={selectRangesByPairs}
                >
                  选中区间
                </AppDropdownMenuItem>
                <AppDropdownMenuItem
                  disabled={selectedCount() === 0}
                  class="text-destructive focus:text-destructive"
                  onSelect={openBatchDeleteConfirm}
                >
                  删除所选
                </AppDropdownMenuItem>
              </AppDropdownMenuContent>
            </AppDropdownMenu>
          </div>

          <div class="hidden min-[448px]:flex xl:hidden! items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={openBatchDeleteConfirm}
              disabled={selectedCount() === 0}
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
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => void batchEnable(true)}>启用所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => void batchEnable(false)}>禁用所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={openAddGroupDialog}>添加分组</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={openRemoveGroupDialog}>移除分组</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => void batchPinToTop()}>置顶所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={() => void batchPinToBottom()}>置底所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={batchExport}>导出所选</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled={selectedCount() === 0} onSelect={batchShare}>分享所选</AppDropdownMenuItem>
                <AppDropdownMenuItem
                  disabled={!canSelectRangesByPairs()}
                  onSelect={selectRangesByPairs}
                >
                  选中区间
                </AppDropdownMenuItem>
              </AppDropdownMenuContent>
            </AppDropdownMenu>
          </div>

          <div class="hidden xl:flex! flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void batchEnable(true)} disabled={selectedCount() === 0}>
              启用所选
            </Button>
            <Button variant="outline" size="sm" onClick={() => void batchEnable(false)} disabled={selectedCount() === 0}>
              禁用所选
            </Button>
            <Button variant="outline" size="sm" onClick={openAddGroupDialog} disabled={selectedCount() === 0}>
              添加分组
            </Button>
            <Button variant="outline" size="sm" onClick={openRemoveGroupDialog} disabled={selectedCount() === 0}>
              移除分组
            </Button>
            <Button variant="outline" size="sm" onClick={() => void batchPinToTop()} disabled={selectedCount() === 0}>
              置顶所选
            </Button>
            <Button variant="outline" size="sm" onClick={() => void batchPinToBottom()} disabled={selectedCount() === 0}>
              置底所选
            </Button>
            <Button variant="outline" size="sm" onClick={batchExport} disabled={selectedCount() === 0}>
              导出所选
            </Button>
            <Button variant="outline" size="sm" onClick={batchShare} disabled={selectedCount() === 0}>
              分享所选
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={selectRangesByPairs}
              disabled={!canSelectRangesByPairs()}
            >
              选中区间
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={openBatchDeleteConfirm}
              disabled={selectedCount() === 0}
            >
              删除所选
            </Button>
          </div>
        </div>
      </div>

      <ImportSourceNetworkDialog
        open={showNetworkImport()}
        onOpenChange={setShowNetworkImport}
        title="网络导入订阅源"
        description="输入订阅源 JSON 链接（http/https），兼容 legado 格式。"
        placeholder="https://example.com/rssSources.json"
        onIdentify={(url) => void handleNetworkIdentify(url)}
      />

      <ImportSourceQrDialog
        open={showQrImport()}
        onOpenChange={setShowQrImport}
        onIdentify={(raw) => void handleQrIdentify(raw)}
      />

      <ImportCodeDialog
        open={showCodeImport()}
        onOpenChange={setShowCodeImport}
        title="代码导入订阅源"
        description="粘贴订阅源 JSON 数组或对象，也支持 legado:// / yuedu:// 深链接与 http(s) 地址。"
        onIdentify={(raw) => void handleRawTextIdentify(raw, 'code')}
      />

      <ImportRssSourceSelectDialog
        open={showImportSelect()}
        loading={importLoading()}
        sources={importCandidates()}
        comparisons={importComparisons()}
        selectedUrls={importSelectedUrls()}
        keepName={importKeepName()}
        keepGroup={importKeepGroup()}
        keepEnable={importKeepEnable()}
        groupName={importGroupName()}
        groupOptions={importGroupOptions()}
        adjustGroup={importAdjustGroup()}
        onOpenChange={setShowImportSelect}
        onToggle={(url, checked) => {
          setImportSelectedUrls((prev) => {
            const next = new Set(prev);
            if (checked) next.add(url);
            else next.delete(url);
            return next;
          });
        }}
        onSelectAllToggle={() => {
          const candidates = importCandidates();
          const all = importSelectedUrls().size === candidates.length;
          setImportSelectedUrls(
            all ? new Set<string>() : new Set(candidates.map((s) => s.sourceUrl)),
          );
        }}
        onInvertSelect={() => {
          const current = importSelectedUrls();
          const next = new Set<string>();
          for (const s of importCandidates()) {
            if (!current.has(s.sourceUrl)) next.add(s.sourceUrl);
          }
          setImportSelectedUrls(next);
        }}
        onSelectNewToggle={() => {
          const newUrls = importComparisons().filter((c) => c.isNew).map((c) => c.source.sourceUrl);
          const all = newUrls.every((u) => importSelectedUrls().has(u));
          const next = new Set(importSelectedUrls());
          for (const u of newUrls) {
            if (all) next.delete(u);
            else next.add(u);
          }
          setImportSelectedUrls(next);
        }}
        onSelectUpdateToggle={() => {
          const urls = importComparisons().filter((c) => c.isUpdate).map((c) => c.source.sourceUrl);
          const all = urls.every((u) => importSelectedUrls().has(u));
          const next = new Set(importSelectedUrls());
          for (const u of urls) {
            if (all) next.delete(u);
            else next.add(u);
          }
          setImportSelectedUrls(next);
        }}
        onKeepNameChange={setImportKeepName}
        onKeepGroupChange={setImportKeepGroup}
        onKeepEnableChange={setImportKeepEnable}
        onGroupNameChange={setImportGroupName}
        onAdjustGroupChange={setImportAdjustGroup}
        onConfirm={() => void confirmImportSelected()}
      />

      <AppDialog open={deleteDialogOpen()} onOpenChange={setDeleteDialogOpen} modal>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>确认删除</AppDialogTitle>
            <AppDialogDescription>
              将删除「{deleteTarget()?.sourceName}」及其文章缓存。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>
              删除
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <AppDialog open={batchDeleteCount() > 0} onOpenChange={(open) => !open && setBatchDeleteCount(0)}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>删除所选订阅源</AppDialogTitle>
            <AppDialogDescription>
              确定删除所选 {batchDeleteCount()} 个订阅源？将同时清除其文章缓存。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteCount(0)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void handleBatchDeleteConfirm()}>
              删除
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <AppDialog open={groupDialogOpen()} onOpenChange={setGroupDialogOpen}>
        <AppDialogContent class="max-w-sm">
          <AppDialogHeader>
            <AppDialogTitle>添加分组</AppDialogTitle>
            <AppDialogDescription>
              为所选 {selectedCount()} 个订阅源追加分组（逗号分隔字段，可多个）
            </AppDialogDescription>
          </AppDialogHeader>
          <div class="space-y-3 px-6 py-2">
            <TextField>
              <TextFieldInput
                placeholder="输入分组名称"
                value={groupDialogInput()}
                onInput={(e) => setGroupDialogInput(e.currentTarget.value)}
              />
            </TextField>
            <Show when={sourceGroups().length > 0}>
              <ul class="max-h-48 space-y-1 overflow-y-auto overscroll-contain">
                <For each={sourceGroups()}>
                  {(g) => (
                    <li>
                      <button
                        type="button"
                        class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => setGroupDialogInput(g)}
                      >
                        {g}
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void applyAddGroup(groupDialogInput())}>确定</Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <AppDialog open={removeGroupDialogOpen()} onOpenChange={setRemoveGroupDialogOpen}>
        <AppDialogContent class="max-w-sm">
          <AppDialogHeader>
            <AppDialogTitle>移除分组</AppDialogTitle>
            <AppDialogDescription>
              从所选 {selectedCount()} 个订阅源中移除指定分组
            </AppDialogDescription>
          </AppDialogHeader>
          <div class="px-6 py-2">
            <Show
              when={removeGroupCandidates().length > 0}
              fallback={<p class="text-sm text-muted-foreground">所选订阅源暂无分组</p>}
            >
              <ul class="max-h-48 space-y-1 overflow-y-auto overscroll-contain">
                <For each={removeGroupCandidates()}>
                  {(g) => (
                    <li>
                      <button
                        type="button"
                        class={cn(
                          'w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent',
                          groupDialogInput() === g && 'bg-accent',
                        )}
                        onClick={() => setGroupDialogInput(g)}
                      >
                        {g}
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setRemoveGroupDialogOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!groupDialogInput().trim()}
              onClick={() => void applyRemoveGroup(groupDialogInput())}
            >
              移除
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <SourceShareQrDialog
        open={shareDialogOpen()}
        onOpenChange={setShareDialogOpen}
        jsonText={shareJsonText()}
      />
    </div>
  );
}
