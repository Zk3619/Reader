/**
 * 书源页
 * 参照 Legado：可展开项 + 可多选列表 + 批量操作（启用/禁用/删除）+ 页内新建/导入入口
 */

import { createSignal, createEffect, createResource, createMemo, onMount, onCleanup, For, Show } from 'solid-js';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import * as sourcesDb from '@/lib/database/sources';
import type { BookSource } from '@/types';
import {
  getExploreSections,
  getExploreSectionsAsync,
  isExploreUrlScript,
  updateExploreSourceArgument,
  type ExploreSection,
} from '@/lib/book-source/explore-sections';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteSourceDialog } from '@/components/sources/DeleteSourceDialog';
import { showAppToast } from '@/components/shared/AppToasts';
import { ChevronDownIcon } from '@/components/shared/icons';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectListbox,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch, SwitchControl, SwitchThumb } from '@/components/ui/switch';
import {
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
  SOURCE_FILTER_ENABLED,
  SOURCE_FILTER_DISABLED,
  SOURCE_FILTER_NEED_LOGIN,
  SOURCE_FILTER_UNGROUPED,
  SOURCE_FILTER_DISCOVER_ENABLED,
  SOURCE_FILTER_DISCOVER_DISABLED,
  isSourceFilterOrAll,
  type SourceSearchMode,
  fuzzyMatchQuery,
} from '@/lib/sources/filters';

/** 批量栏「操作 / 更多」下拉：展开时 ChevronDown 由向下旋转为向上 */
const BATCH_MENU_TRIGGER_CLASS = 'gap-1.5 group/trigger';
const BATCH_MENU_CHEVRON_CLASS =
  'h-4 w-4 shrink-0 opacity-50 transition-transform duration-200 group-data-expanded/trigger:rotate-180';

export interface SourcesPageProps {
  /** 当前选中的分组（null = 全部）或筛选（已启用、已禁用等） */
  currentSourceGroup: string | null;
  /** 搜索关键词，在当前分组内过滤书源 */
  sourceSearchQuery?: string;
  /** 搜索模式：name=仅名称，fuzzy=名称模糊匹配，extended=legado 扩展规则（名称+URL+分组+注释等） */
  sourceSearchMode?: SourceSearchMode;
  /** 为 true 且当前为全部/筛选时，按分组名分块显示 */
  sourcesGroupByGroupName?: boolean;
  /** 分组列表加载完成回调，供导航栏下拉使用 */
  onGroupsLoaded?: (groups: string[]) => void;
  /** 书源数量变化回调，供标题下方描述「共 x 个书源」使用 */
  onSourceCountChange?: (count: number) => void;
  /** 切换分组（由导航栏下拉触发时传入） */
  onSourceGroupChange?: (group: string | null) => void;
  /** 编辑书源 */
  onSourceEdit?: (source: BookSource) => void;
  /** 书源登录：打开该书源的登录页（仅当书源支持登录时显示） */
  onSourceLogin?: (source: BookSource) => void;
  /** 书源搜索：使用该书源进行搜索（仅当书源支持搜索时显示） */
  onSourceSearch?: (source: BookSource) => void;
  /** 点击发现子项（分类/排行榜等），由 App 打开发现页或书籍列表 */
  onExploreSectionClick?: (source: BookSource, section: ExploreSection) => void;
  /** 当前展开的书源 URL（由 App 持有，避免切页后收起） */
  expandedSourceUrl?: string | null;
  /** 展开状态变化 */
  onExpandedSourceUrlChange?: (sourceUrl: string | null) => void;
  /** 页内工具栏：新建/导入等（由 SourcesPageToolbar 提供，页内不展示按钮） */
  onSourcesNew?: () => void;
  onSourcesImportLocal?: () => void;
  onSourcesImportNetwork?: () => void;
  onSourcesImportQR?: () => void;
}

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

export function SourcesPage(props: SourcesPageProps) {
  const [sources, setSources] = createSignal<BookSource[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
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
  /** 多选：选中的书源 sourceUrl 集合（Legado 式批量操作） */
  const [selectedSourceUrls, setSelectedSourceUrls] = createSignal<Set<string>>(new Set());
  /** 批量删除确认：选中数量，>0 时显示确认框 */
  const [batchDeleteCount, setBatchDeleteCount] = createSignal(0);
  /** 校验结果弹窗 */
  const [validateDialogOpen, setValidateDialogOpen] = createSignal(false);
  const [validateResults, setValidateResults] = createSignal<SourceValidationResult[]>([]);
  const [validateLoading, setValidateLoading] = createSignal(false);
  const [validateProgress, setValidateProgress] = createSignal<{ current: number; total: number; name: string } | null>(null);
  // 使用 skeleton 加载状态管理，避免快速加载时的闪烁
  const showSkeleton = useSkeletonLoading(loading, { delay: 100, minDisplayTime: 300 });

  const selectedCount = () => selectedSourceUrls().size;

  function selectAll() {
    setSelectedSourceUrls(() => new Set(filteredSources().map((s: BookSource) => s.sourceUrl)));
  }

  function clearSelection() {
    setSelectedSourceUrls(() => new Set<string>());
  }

  function invertSelection() {
    const current = selectedSourceUrls();
    const allUrls = new Set(filteredSources().map((s: BookSource) => s.sourceUrl));
    const next = new Set<string>();
    allUrls.forEach((url) => {
      if (!current.has(url)) next.add(url);
    });
    setSelectedSourceUrls(next);
  }

  function isSelected(sourceUrl: string) {
    return selectedSourceUrls().has(sourceUrl);
  }

  async function loadGroups() {
    try {
      const groups = await sourcesDb.getAllSourceGroups();
      props.onGroupsLoaded?.(groups);
    } catch (e) {
      console.error('加载书源分组失败:', e);
    }
  }

  async function loadSources() {
    const group = props.currentSourceGroup;
    setLoading(true);
    setError(null);
    try {
      let list: BookSource[];
      if (group == null || group === '') {
        list = await sourcesDb.getAllSources();
      } else if (
        group === SOURCE_FILTER_ENABLED ||
        group === SOURCE_FILTER_DISABLED ||
        group === SOURCE_FILTER_NEED_LOGIN ||
        group === SOURCE_FILTER_UNGROUPED ||
        group === SOURCE_FILTER_DISCOVER_ENABLED ||
        group === SOURCE_FILTER_DISCOVER_DISABLED
      ) {
        const all = await sourcesDb.getAllSources();
        list = all.filter((s) => {
          if (group === SOURCE_FILTER_ENABLED) return s.enabled;
          if (group === SOURCE_FILTER_DISABLED) return !s.enabled;
          if (group === SOURCE_FILTER_NEED_LOGIN) return !!(s.loginUrl || s.loginCheckJs);
          if (group === SOURCE_FILTER_UNGROUPED) return !s.sourceGroup || s.sourceGroup.trim() === '';
          if (group === SOURCE_FILTER_DISCOVER_ENABLED) return s.enableExplore;
          if (group === SOURCE_FILTER_DISCOVER_DISABLED) return !s.enableExplore;
          return false;
        });
      } else {
        list = await sourcesDb.getSourcesByGroup(group);
      }
      setSources(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载书源失败';
      setError(msg);
      setSources([]);
    } finally {
      setLoading(false);
    }
  }

  onMount(() => {
    loadGroups();
  });

  createEffect(() => {
    props.currentSourceGroup;
    loadSources();
  });

  const handler = () => {
    loadGroups();
    loadSources();
  };
  onMount(() => {
    window.addEventListener('sources-refresh', handler);
    onCleanup(() => window.removeEventListener('sources-refresh', handler));
  });

  function toggleExpand(sourceUrl: string) {
    const prev = expandedSourceUrl();
    setExpandedSourceUrl(prev === sourceUrl ? null : sourceUrl);
  }

  /** 在当前分组内按搜索关键词与模式过滤：name=仅名称，fuzzy=名称模糊匹配，extended=legado 扩展（名称+URL+分组+注释等） */
  const filteredSources = createMemo(() => {
    const list = sources();
    const q = (props.sourceSearchQuery ?? '').trim();
    if (!q) return list;
    const mode = props.sourceSearchMode ?? 'name';
    const qLower = q.toLowerCase();
    return list.filter((s) => {
      const name = s.sourceName || '';
      if (mode === 'name') {
        return name.toLowerCase().includes(qLower);
      }
      if (mode === 'fuzzy') {
        return fuzzyMatchQuery(q, name);
      }
      // extended: 对齐 legado 书源搜索，匹配名称、URL、分组、注释
      const url = (s.sourceUrl || '').toLowerCase();
      const group = (s.sourceGroup || '').toLowerCase();
      const comment = (s.sourceComment || '').toLowerCase();
      return (
        name.toLowerCase().includes(qLower) ||
        url.includes(qLower) ||
        group.includes(qLower) ||
        comment.includes(qLower)
      );
    });
  });

  createEffect(() => {
    props.onSourceCountChange?.(filteredSources().length);
  });

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

  function toggleSelectAll() {
    if (allFilteredSelected()) clearSelection();
    else selectAll();
  }

  /** 当「按分组名显示」且当前为全部/筛选时，按 sourceGroup 分块；否则单块（当前列表） */
  const displayGroups = createMemo(() => {
    const list = filteredSources();
    if (!props.sourcesGroupByGroupName || !isSourceFilterOrAll(props.currentSourceGroup))
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

  const expandedSource = () => {
    const url = expandedSourceUrl();
    return url ? sources().find((s) => s.sourceUrl === url) ?? null : null;
  };
  const [exploreArgsVersion, setExploreArgsVersion] = createSignal(0);
  const [dynamicSections, { refetch: refetchExploreSections }] = createResource(
    () => {
      const v = exploreArgsVersion();
      const s = expandedSource();
      return s && isExploreUrlScript(s.exploreUrl) ? { source: s, argsVersion: v } : null;
    },
    (ctx) => getExploreSectionsAsync(ctx.source, ctx.argsVersion)
  );

  async function handleExploreSelectChange(
    source: BookSource,
    section: ExploreSection,
    value: string
  ) {
    if (!section.paramKey) return;
    updateExploreSourceArgument(source, section.paramKey, value);
    setExploreArgsVersion((v) => v + 1);
    await refetchExploreSections();
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

  async function handleConfirmDelete() {
    const source = sourceToDelete();
    if (!source) return;
    try {
      await sourcesDb.deleteSource(source.sourceUrl);
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已删除书源', description: `「${source.sourceName}」已删除`, variant: 'default' });
      setSourceToDelete(null);
      setExpandedSourceUrl(null);
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
      console.error('批量启用失败:', e);
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
      console.error('批量禁用失败:', e);
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
      for (const url of urls) await sourcesDb.deleteSource(url);
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已删除', description: `已删除 ${urls.length} 个书源`, variant: 'default' });
      clearSelection();
      setExpandedSourceUrl(null);
      loadSources();
    } catch (e) {
      console.error('批量删除失败:', e);
      showAppToast({ title: '批量删除失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  /** 置顶所选：将选中项移到列表最前（customOrder 最小） */
  async function batchPinToTop() {
    const list = sources();
    const urls = [...selectedSourceUrls()];
    if (urls.length === 0) return;
    const minOrder = list.length > 0 ? Math.min(...list.map((s: BookSource) => s.customOrder)) : 0;
    try {
      for (let i = 0; i < urls.length; i++) {
        await sourcesDb.updateSourceOrder(urls[i], minOrder - 1 - i);
      }
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已置顶', description: `已将 ${urls.length} 个书源移至顶部`, variant: 'default' });
      clearSelection();
      loadSources();
    } catch (e) {
      console.error('批量置顶失败:', e);
      showAppToast({ title: '批量置顶失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  /** 置底所选：将选中项移到列表最后（customOrder 最大） */
  async function batchPinToBottom() {
    const list = sources();
    const urls = [...selectedSourceUrls()];
    if (urls.length === 0) return;
    const maxOrder = list.length > 0 ? Math.max(...list.map((s: BookSource) => s.customOrder)) : 0;
    try {
      for (let i = 0; i < urls.length; i++) {
        await sourcesDb.updateSourceOrder(urls[i], maxOrder + 1 + i);
      }
      window.dispatchEvent(new CustomEvent('sources-refresh'));
      showAppToast({ title: '已置底', description: `已将 ${urls.length} 个书源移至底部`, variant: 'default' });
      clearSelection();
      loadSources();
    } catch (e) {
      console.error('批量置底失败:', e);
      showAppToast({ title: '批量置底失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  /** 导出所选：下载为 JSON 文件（兼容 Legado 导入格式） */
  function batchExport() {
    const list = sources();
    const selected = list.filter((s: BookSource) => selectedSourceUrls().has(s.sourceUrl));
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
      console.error('导出失败:', e);
      showAppToast({ title: '导出失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  /** 校验所选：对选中书源执行搜索/发现/目录/正文校验 */
  async function batchValidate() {
    const urls = [...selectedSourceUrls()];
    if (urls.length === 0) return;
    const list = sources().filter((s) => urls.includes(s.sourceUrl));
    if (list.length === 0) {
      showAppToast({ title: '校验失败', description: '未找到所选书源', variant: 'destructive' });
      return;
    }
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
        [r.search, r.explore, r.toc, r.content].every((c) => c.kind === 'success' || c.kind === 'skip')
      ).length;
      showAppToast({
        title: '校验完成',
        description: `${ok}/${results.length} 个书源通过`,
        variant: ok === results.length ? 'default' : 'default',
      });
    } catch (e) {
      console.error('批量校验失败:', e);
      showAppToast({
        title: '校验失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
      setValidateResults([]);
    } finally {
      setValidateLoading(false);
      setValidateProgress(null);
    }
  }

  function checkLabel(kind: ValidateResultKind, message?: string): string {
    switch (kind) {
      case 'success':
        return '通过';
      case 'skip':
        return '跳过';
      case 'timeout':
        return '超时';
      case 'network_error':
        return '网络错误';
      case 'js_error':
        return 'JS错误';
      case 'search_empty':
        return '搜索为空';
      case 'explore_empty':
        return '发现为空';
      case 'toc_empty':
        return '目录为空';
      case 'content_empty':
        return '正文为空';
      default:
        return message || kind;
    }
  }

  function checkVariant(kind: ValidateResultKind): 'success' | 'secondary' | 'error' | 'warning' {
    if (kind === 'success') return 'success';
    if (kind === 'skip') return 'secondary';
    return 'error';
  }

  /** 启用发现所选 */
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
      console.error('批量启用发现失败:', e);
      showAppToast({ title: '批量启用发现失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  /** 禁用发现所选 */
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
      console.error('批量禁用发现失败:', e);
      showAppToast({ title: '批量禁用发现失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    }
  }

  return (
    <div class="@container flex flex-col min-h-0 flex-1 w-full overflow-hidden pt-2">
      {/* 主内容区：可滚动 */}
      <div class="flex-1 min-h-0 overflow-y-auto scroll-gutter-stable-both space-y-4 pb-4">
        <Show when={error()}>
          <p class="text-sm text-destructive">{error()}</p>
        </Show>
        <Show when={showSkeleton()}>
          <ul class="space-y-2">
            <For each={[1, 2, 3, 4, 5]}>
              {() => (
                <li class="flex h-12 items-center gap-3 rounded-lg border border-border/50 bg-card px-3 animate-pulse">
                  <span class="h-4 w-20 rounded bg-muted" />
                  <span class="h-4 flex-1 rounded bg-muted" />
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={!loading() && !showSkeleton() && sources().length === 0}>
          <div class="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
            <p>暂无书源</p>
            <p class="mt-1">可通过导航栏「更多」新建或导入书源</p>
          </div>
        </Show>
        <Show when={!loading() && !showSkeleton() && sources().length > 0 && filteredSources().length === 0}>
          <div class="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
            <p>无匹配书源</p>
            <p class="mt-1">尝试修改搜索关键词或切换分组</p>
          </div>
        </Show>
        <Show when={!loading() && !showSkeleton() && filteredSources().length > 0}>
          <For each={displayGroups()}>
            {(group) => (
              <>
                <Show when={group.name}>
                  <div class="pt-2 first:pt-0">
                    <h3 class="text-sm font-medium text-muted-foreground px-1 pb-1.5">{group.name}</h3>
                  </div>
                </Show>
                <ul class="space-y-2">
                  <For each={group.sources}>
                    {(source) => {
                      let triggerEl: HTMLDivElement | null = null;
                      const { onPointerDown, onPointerMove, onPointerUp, shouldPreventClick } = useLongPressContextMenu(() => triggerEl);
                      const isExpanded = () => expandedSourceUrl() === source.sourceUrl;
                      const sections = (): ExploreSection[] => {
                        if (!isExploreUrlScript(source.exploreUrl)) return getExploreSections(source);
                        if (expandedSourceUrl() !== source.sourceUrl) return [];
                        return dynamicSections() ?? [];
                      };
                      const sectionsLoading = () =>
                        isExpanded() && isExploreUrlScript(source.exploreUrl) && dynamicSections.state === 'pending';
                      const sectionsError = () =>
                        isExpanded() && isExploreUrlScript(source.exploreUrl) && dynamicSections.state === 'errored';
                      return (
                        <li class="rounded-lg border border-border/50 bg-card overflow-hidden">
                          <ContextMenu>
                            <ContextMenuTrigger
                              as="div"
                              ref={(el) => { triggerEl = el; }}
                              onMouseDown={(e: MouseEvent) => onPointerDown(e)}
                              onMouseMove={(e: MouseEvent) => onPointerMove(e)}
                              onMouseUp={(e: MouseEvent) => onPointerUp(e)}
                              onTouchStart={(e: TouchEvent) => onPointerDown(e)}
                              onTouchMove={(e: TouchEvent) => onPointerMove(e)}
                              onTouchEnd={(e: TouchEvent) => onPointerUp(e)}
                              class={cn(
                                'flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-all',
                                'hover:bg-accent/30'
                              )}
                              onClick={(e: MouseEvent) => {
                                if (shouldPreventClick()) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  return;
                                }
                                toggleExpand(source.sourceUrl);
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <div class="shrink-0 flex items-center" onClick={(e: MouseEvent) => e.stopPropagation()} role="presentation">
                                <Checkbox
                                  checked={isSelected(source.sourceUrl)}
                                  onChange={(checked: boolean) => {
                                    const next = new Set(selectedSourceUrls());
                                    if (checked) next.add(source.sourceUrl);
                                    else next.delete(source.sourceUrl);
                                    setSelectedSourceUrls(next);
                                  }}
                                  aria-label={`选择 ${source.sourceName}`}
                                />
                              </div>
                              <div class="min-w-0 flex-1 flex items-center gap-2 overflow-hidden">
                                <span class="min-w-0 shrink truncate font-medium text-foreground" title={source.sourceName}>
                                  {source.sourceName}
                                </span>
                                <Show when={source.sourceGroup && !props.sourcesGroupByGroupName}>
                                  <span class="min-w-0 shrink-2 truncate rounded bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground" title={source.sourceGroup}>
                                    {source.sourceGroup}
                                  </span>
                                </Show>
                              </div>
                              <div class="shrink-0 flex items-center" onClick={(e: MouseEvent) => e.stopPropagation()} role="presentation">
                                <Switch
                                  checked={source.enabled}
                                  onChange={async (checked: boolean) => {
                                    try {
                                      await sourcesDb.enableSource(source.sourceUrl, checked);
                                      window.dispatchEvent(new CustomEvent('sources-refresh'));
                                      loadSources();
                                    } catch (e) {
                                      console.error('切换书源启用状态失败:', e);
                                      showAppToast({ title: '操作失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
                                    }
                                  }}
                                  aria-label={source.enabled ? '禁用书源' : '启用书源'}
                                >
                                  <SwitchControl class="data-disabled:cursor-not-allowed">
                                    <SwitchThumb />
                                  </SwitchControl>
                                </Switch>
                              </div>
                              <ChevronDownIcon
                                class={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isExpanded() && 'rotate-180')}
                              />
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem onSelect={() => props.onSourceEdit?.(source)}>
                                编辑
                              </ContextMenuItem>
                              <ContextMenuItem onSelect={() => handlePinSource(source)}>
                                置顶
                              </ContextMenuItem>
                              <Show when={hasLogin(source)}>
                                <ContextMenuItem onSelect={() => props.onSourceLogin?.(source)}>
                                  登录
                                </ContextMenuItem>
                              </Show>
                              <Show when={hasSearch(source)}>
                                <ContextMenuItem onSelect={() => props.onSourceSearch?.(source)}>
                                  搜索
                                </ContextMenuItem>
                              </Show>
                              <ContextMenuItem onSelect={() => handleSourceRefresh(source)}>
                                刷新
                              </ContextMenuItem>
                              <ContextMenuItem
                                class="text-destructive focus:text-destructive"
                                onSelect={() => {
                                  setSourceToDelete(source);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                删除
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>

                          {/* 展开内容：书源内置的发现子项（分类、排行榜等，参照 legado） */}
                          <Show when={isExpanded()}>
                            <div
                              class="border-t border-border/50 bg-muted/20 px-3 py-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Show when={sectionsLoading()}>
                                <ul class="flex flex-wrap justify-center gap-2 py-2">
                                  {/* 模拟不同宽度的按钮：整行、两列、四列 */}
                                  <li class="min-w-0 flex-[1_1_100%]">
                                    <div class="h-9 w-full rounded-lg bg-muted/60 animate-pulse border border-border/30" />
                                  </li>
                                  <li class="min-w-0 flex-[1_1_45%]">
                                    <div class="h-9 w-full rounded-lg bg-muted/60 animate-pulse border border-border/30" />
                                  </li>
                                  <li class="min-w-0 flex-[1_1_45%]">
                                    <div class="h-9 w-full rounded-lg bg-muted/60 animate-pulse border border-border/30" />
                                  </li>
                                  <li class="min-w-0 flex-[1_1_25%]">
                                    <div class="h-9 w-full rounded-lg bg-muted/60 animate-pulse border border-border/30" />
                                  </li>
                                  <li class="min-w-0 flex-[1_1_25%]">
                                    <div class="h-9 w-full rounded-lg bg-muted/60 animate-pulse border border-border/30" />
                                  </li>
                                  <li class="min-w-0 flex-[1_1_25%]">
                                    <div class="h-9 w-full rounded-lg bg-muted/60 animate-pulse border border-border/30" />
                                  </li>
                                  <li class="min-w-0 flex-[1_1_25%]">
                                    <div class="h-9 w-full rounded-lg bg-muted/60 animate-pulse border border-border/30" />
                                  </li>
                                </ul>
                              </Show>
                              <Show when={sectionsError()}>
                                <div class="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 my-2">
                                  <p class="text-center text-sm text-destructive">
                                    <span class="font-medium">加载失败：</span>
                                    <span class="text-xs text-destructive/80">
                                      {dynamicSections.error instanceof Error
                                        ? dynamicSections.error.message
                                        : '网络请求失败，请检查网络连接'}
                                    </span>
                                  </p>
                                </div>
                              </Show>
                              <Show when={!sectionsLoading() && !sectionsError() && sections().length > 0}>
                                <ul class="flex flex-wrap justify-center gap-2">
                                  <For each={sections()}>
                                    {(section) => {
                                      const basisPct = section.style?.layout_flexBasisPercent ?? 1;
                                      // Legado: layout_flexBasisPercent 1=整行, 0.45≈两列, 0.25=四列
                                      const flexClass =
                                        basisPct <= 0.25
                                          ? 'min-w-0 flex-[1_1_25%]'
                                          : basisPct <= 0.45
                                            ? 'min-w-0 flex-[1_1_45%]'
                                            : 'min-w-0 flex-[1_1_100%]';
                                      const isSelect =
                                        section.type === 'select' &&
                                        section.chars &&
                                        section.chars.length > 0 &&
                                        section.paramKey;
                                      const isClickable = !!section.url;
                                      return (
                                        <li class={flexClass}>
                                          <Show
                                            when={isSelect}
                                            fallback={
                                              <Button
                                                variant="outline"
                                                class="flex h-auto min-h-9 w-full justify-center rounded-lg border-border/60 bg-background/80 px-3 py-2 text-center text-sm font-medium shadow-sm"
                                                disabled={!isClickable}
                                                onClick={() => props.onExploreSectionClick?.(source, section)}
                                              >
                                                <span class="min-w-0 truncate">{section.title}</span>
                                              </Button>
                                            }
                                          >
                                            <div
                                              class="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-2 py-1.5 shadow-sm"
                                              onClick={(e: MouseEvent) => e.stopPropagation()}
                                            >
                                              <Label class="shrink-0 text-xs text-muted-foreground">
                                                {section.title}
                                              </Label>
                                              <div class="min-w-0 flex-1">
                                                <Select
                                                  value={section.default ?? section.chars![0]}
                                                  onChange={(v) => {
                                                    if (v) {
                                                      void handleExploreSelectChange(source, section, v);
                                                    }
                                                  }}
                                                  options={[...section.chars!]}
                                                  itemComponent={(itemProps) => (
                                                    <SelectItem class="pl-2" item={itemProps.item}>
                                                      {itemProps.item.rawValue}
                                                    </SelectItem>
                                                  )}
                                                >
                                                  <SelectTrigger
                                                    class="h-8 w-full border-border/60 bg-background text-sm"
                                                    aria-label={section.title}
                                                  >
                                                    <SelectValue<string>>
                                                      {(state) => state.selectedOption() ?? section.default}
                                                    </SelectValue>
                                                    <SelectIcon />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    <SelectListbox />
                                                  </SelectContent>
                                                </Select>
                                              </div>
                                            </div>
                                          </Show>
                                        </li>
                                      );
                                    }}
                                  </For>
                                </ul>
                              </Show>
                              <Show when={!sectionsLoading() && sections().length === 0}>
                                <p class="py-3 text-center text-sm text-muted-foreground">该书源暂无发现内容（分类/排行榜）</p>
                              </Show>
                            </div>
                          </Show>
                        </li>
                      );
                    }}
                  </For>
                </ul>
              </>
            )}
          </For>
        </Show>
      </div>

      {/* 底部固定：批量操作栏（无选中时按钮禁用，分界线上方为可滚动内容） */}
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
          {/* 窄屏：仅「操作」下拉（父容器 < 448px，删除并入下拉） */}
          <div class="flex items-center gap-2 @min-[448px]:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger
                as={(props: any) => (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedCount() === 0}
                    class={BATCH_MENU_TRIGGER_CLASS}
                    {...props}
                  >
                    操作
                    <ChevronDownIcon class={BATCH_MENU_CHEVRON_CLASS} />
                  </Button>
                )}
              />
              <DropdownMenuContent class="w-auto min-w-0">
                <DropdownMenuItem onSelect={() => batchEnable()}>启用所选</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => batchDisable()}>禁用所选</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => batchEnableExplore()}>启用发现</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => batchDisableExplore()}>禁用发现</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => batchPinToTop()}>置顶所选</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => batchPinToBottom()}>置底所选</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => batchExport()}>导出所选</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => batchValidate()}>校验所选</DropdownMenuItem>
                <DropdownMenuItem
                  class="text-destructive focus:text-destructive"
                  onSelect={() => openBatchDeleteConfirm()}
                >
                  删除所选
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {/* 紧凑：删除 + 更多（448px <= 父容器 < 1026px） */}
          <div class="hidden @min-[448px]:flex @min-[1026px]:hidden items-center gap-2">
            <Button variant="destructive" size="sm" onClick={openBatchDeleteConfirm} disabled={selectedCount() === 0}>
              删除所选
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                as={(props: any) => (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedCount() === 0}
                    class={BATCH_MENU_TRIGGER_CLASS}
                    {...props}
                  >
                    更多
                    <ChevronDownIcon class={BATCH_MENU_CHEVRON_CLASS} />
                  </Button>
                )}
              />
              <DropdownMenuContent class="w-auto min-w-0">
                <DropdownMenuItem onSelect={() => batchEnable()}>启用所选</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => batchDisable()}>禁用所选</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => batchEnableExplore()}>启用发现</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => batchDisableExplore()}>禁用发现</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => batchPinToTop()}>置顶所选</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => batchPinToBottom()}>置底所选</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => batchExport()}>导出所选</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => batchValidate()}>校验所选</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {/* 全部按钮（父容器宽度 >= 1026px 时显示） */}
          <div class="hidden @min-[1026px]:flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={batchEnable} disabled={selectedCount() === 0}>
              启用所选
            </Button>
            <Button variant="outline" size="sm" onClick={batchDisable} disabled={selectedCount() === 0}>
              禁用所选
            </Button>
            <Button variant="outline" size="sm" onClick={batchEnableExplore} disabled={selectedCount() === 0}>
              启用发现
            </Button>
            <Button variant="outline" size="sm" onClick={batchDisableExplore} disabled={selectedCount() === 0}>
              禁用发现
            </Button>
            <Button variant="outline" size="sm" onClick={batchPinToTop} disabled={selectedCount() === 0}>
              置顶所选
            </Button>
            <Button variant="outline" size="sm" onClick={batchPinToBottom} disabled={selectedCount() === 0}>
              置底所选
            </Button>
            <Button variant="outline" size="sm" onClick={batchExport} disabled={selectedCount() === 0}>
              导出所选
            </Button>
            <Button variant="outline" size="sm" onClick={batchValidate} disabled={selectedCount() === 0}>
              校验所选
            </Button>
            <Button variant="destructive" size="sm" onClick={openBatchDeleteConfirm} disabled={selectedCount() === 0}>
              删除所选
            </Button>
          </div>
        </div>
      </div>

      <DeleteSourceDialog
        open={deleteDialogOpen()}
        onOpenChange={setDeleteDialogOpen}
        source={sourceToDelete()}
        onConfirm={handleConfirmDelete}
      />

      {/* 批量删除确认 */}
      <AppDialog open={batchDeleteCount() > 0} onOpenChange={(open) => !open && setBatchDeleteCount(0)}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>删除所选书源</AppDialogTitle>
            <AppDialogDescription>
              确定删除所选 {batchDeleteCount()} 个书源？删除后无法恢复。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteCount(0)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleBatchDeleteConfirm}>
              删除
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      {/* 校验结果 */}
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
          <div class="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
            <Show when={validateLoading() && validateResults().length === 0}>
              <p class="text-sm text-muted-foreground">正在校验中…</p>
            </Show>
            <For each={validateResults()}>
              {(r) => (
                <div class="rounded-lg border border-border/60 p-3 space-y-2">
                  <div class="font-medium text-sm truncate" title={r.sourceName}>
                    {r.sourceName}
                  </div>
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div class="flex flex-col gap-0.5">
                      <span class="text-muted-foreground">搜索</span>
                      <Badge variant={checkVariant(r.search.kind)} class="w-fit">
                        {checkLabel(r.search.kind, r.search.message)}
                      </Badge>
                    </div>
                    <div class="flex flex-col gap-0.5">
                      <span class="text-muted-foreground">发现</span>
                      <Badge variant={checkVariant(r.explore.kind)} class="w-fit">
                        {checkLabel(r.explore.kind, r.explore.message)}
                      </Badge>
                    </div>
                    <div class="flex flex-col gap-0.5">
                      <span class="text-muted-foreground">目录</span>
                      <Badge variant={checkVariant(r.toc.kind)} class="w-fit">
                        {checkLabel(r.toc.kind, r.toc.message)}
                      </Badge>
                    </div>
                    <div class="flex flex-col gap-0.5">
                      <span class="text-muted-foreground">正文</span>
                      <Badge variant={checkVariant(r.content.kind)} class="w-fit">
                        {checkLabel(r.content.kind, r.content.message)}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setValidateDialogOpen(false)}>
              关闭
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
}
