/**
 * 订阅主页：展示已启用的 RSS 源，点击进入文章列表
 */

import {
  createSignal,
  createMemo,
  onMount,
  onCleanup,
  For,
  Show,
} from 'solid-js';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import * as rssSourcesDb from '@/lib/database/rss-sources';
import { deleteRssArticlesByOrigin } from '@/lib/database/rss-articles';
import { sortBookSources } from '@/lib/sources/source-sort';
import {
  EMPTY_RSS_SOURCE_LIST_FILTER,
  buildRssManageFilterDomainOptions,
  buildRssManageFilterGroupOptions,
  filterRssSourcesByCriteria,
  type RssSourceListFilterCriteria,
} from '@/lib/rss/rss-source-list-filter';
import { filterRssSources } from '@/lib/search/search-filters';
import type { RssLayoutMode, SearchMode } from '@/lib/search/search-prefs';
import type { RssSource } from '@/types';
import { cn } from '@/lib/utils';
import { mainShellPageScroll } from '@/lib/ui/viewport-classes';
import { Button } from '@/components/ui/button';
import {
  RssPageSourceGridItem,
  RssPageSourceListItem,
  type RssPageSourceItemActions,
} from '@/components/rss/RssPageSourceItems';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { showAppToast } from '@/components/shared/AppToasts';

export interface RssPageProps {
  searchQuery?: string;
  searchMode?: SearchMode;
  layoutMode?: RssLayoutMode;
  appliedFilter?: RssSourceListFilterCriteria;
  onGroupsLoaded?: (groups: string[]) => void;
  onSourcesLoaded?: (sources: RssSource[]) => void;
  onSourceCountChange?: (count: number) => void;
  onOpenSourceArticles: (source: RssSource) => void;
  onOpenManage: () => void;
  onSourceEdit?: (source: RssSource) => void;
}

export function RssPage(props: RssPageProps) {
  const [sources, setSources] = createSignal<RssSource[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false);
  const [deleteTarget, setDeleteTarget] = createSignal<RssSource | null>(null);

  const showSkeleton = useSkeletonLoading(loading, { delay: 100, minDisplayTime: 300 });

  async function loadSources() {
    setLoading(true);
    try {
      const list = await rssSourcesDb.getEnabledRssSources();
      const sorted = sortBookSources(
        list as unknown as import('@/types').BookSource[],
        'manual',
        false,
      ) as unknown as RssSource[];
      setSources(sorted);

      const groupSet = new Set<string>();
      for (const s of sorted) {
        const g = s.sourceGroup?.trim();
        if (g) groupSet.add(g);
      }
      props.onGroupsLoaded?.([...groupSet].sort((a, b) => a.localeCompare(b, 'zh-CN')));
      props.onSourcesLoaded?.(sorted);
      props.onSourceCountChange?.(sorted.length);
    } catch (e) {
      console.error('加载订阅源失败:', e);
      setSources([]);
      props.onSourceCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }

  function notifyRefresh() {
    window.dispatchEvent(new CustomEvent('rss-sources-refresh'));
  }

  onMount(() => {
    void loadSources();
    const handler = () => void loadSources();
    window.addEventListener('rss-sources-refresh', handler);
    onCleanup(() => window.removeEventListener('rss-sources-refresh', handler));
  });

  const filteredSources = createMemo(() => {
    const all = sources();
    const allGroups = buildRssManageFilterGroupOptions(
      [...new Set(all.map((s) => s.sourceGroup?.trim()).filter(Boolean) as string[])],
    );
    const allDomains = buildRssManageFilterDomainOptions(all);
    let list = filterRssSourcesByCriteria(
      all,
      props.appliedFilter ?? EMPTY_RSS_SOURCE_LIST_FILTER,
      allGroups,
      allDomains,
    );
    const q = (props.searchQuery ?? '').trim();
    if (q) {
      list = filterRssSources(list, q, props.searchMode ?? 'name');
    }
    return list;
  });

  async function handlePinSource(source: RssSource) {
    const all = await rssSourcesDb.getAllRssSources();
    const minOrder = all.length > 0 ? Math.min(...all.map((s) => s.customOrder)) : 0;
    try {
      await rssSourcesDb.updateRssSourceOrder(source.sourceUrl, minOrder - 1);
      notifyRefresh();
      showAppToast({ title: '已置顶', description: `「${source.sourceName}」已移至列表顶部` });
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
    const all = await rssSourcesDb.getAllRssSources();
    const maxOrder = all.length > 0 ? Math.max(...all.map((s) => s.customOrder)) : 0;
    try {
      await rssSourcesDb.updateRssSourceOrder(source.sourceUrl, maxOrder + 1);
      notifyRefresh();
      showAppToast({ title: '已置底', description: `「${source.sourceName}」已移至列表底部` });
      await loadSources();
    } catch (e) {
      showAppToast({
        title: '置底失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  async function handleToggleEnable(source: RssSource) {
    try {
      await rssSourcesDb.enableRssSource(source.sourceUrl, !source.enabled);
      notifyRefresh();
      showAppToast({
        title: source.enabled ? '已禁用' : '已启用',
        description: source.sourceName,
      });
      await loadSources();
    } catch (e) {
      showAppToast({
        title: '操作失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  async function confirmDelete() {
    const target = deleteTarget();
    if (!target) return;
    try {
      await rssSourcesDb.deleteRssSource(target.sourceUrl);
      await deleteRssArticlesByOrigin(target.sourceUrl);
      showAppToast({ title: '已删除', description: target.sourceName });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      notifyRefresh();
      await loadSources();
    } catch (e) {
      showAppToast({
        title: '删除失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  const itemActions = (): RssPageSourceItemActions => ({
    onOpen: (source) => props.onOpenSourceArticles(source),
    onEdit: props.onSourceEdit,
    onPinTop: (source) => void handlePinSource(source),
    onPinBottom: (source) => void handlePinToBottom(source),
    onToggleEnable: (source) => void handleToggleEnable(source),
    onDelete: (source) => {
      setDeleteTarget(source);
      setDeleteDialogOpen(true);
    },
  });

  const isGrid = () => (props.layoutMode ?? 'list') === 'grid';

  return (
    <div class={cn('flex min-h-0 flex-1 flex-col', mainShellPageScroll)}>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        <Show when={showSkeleton()}>
          <Show
            when={isGrid()}
            fallback={
              <div class="space-y-2 py-2">
                <For each={Array.from({ length: 6 })}>
                  {() => <div class="h-14 animate-pulse rounded-xl bg-muted/40" />}
                </For>
              </div>
            }
          >
            <div class="flex flex-wrap gap-3 py-2">
              <For each={Array.from({ length: 9 })}>
                {() => <div class="h-[7rem] w-[5.5rem] animate-pulse rounded-xl bg-muted/40" />}
              </For>
            </div>
          </Show>
        </Show>

        <Show when={!showSkeleton() && filteredSources().length === 0}>
          <div class="rounded-2xl border border-border/50 bg-card p-8 text-center text-muted-foreground">
            <p class="mb-4">
              {sources().length === 0 ? '暂无已启用的订阅源' : '没有匹配的订阅源'}
            </p>
            <Show when={sources().length === 0}>
              <Button onClick={() => props.onOpenManage()}>去添加订阅源</Button>
            </Show>
          </div>
        </Show>

        <Show when={!showSkeleton() && filteredSources().length > 0 && !isGrid()}>
          <div class="space-y-2 py-2">
            <For each={filteredSources()}>
              {(source) => (
                <RssPageSourceListItem source={source} actions={itemActions()} />
              )}
            </For>
          </div>
        </Show>

        <Show when={!showSkeleton() && filteredSources().length > 0 && isGrid()}>
          <div class="flex flex-wrap gap-3 py-2">
            <For each={filteredSources()}>
              {(source) => (
                <RssPageSourceGridItem source={source} actions={itemActions()} />
              )}
            </For>
          </div>
        </Show>
      </div>

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
    </div>
  );
}
