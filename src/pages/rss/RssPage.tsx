/**
 * 订阅主页：展示已启用的 RSS 源，点击进入文章列表
 */

import {
  createSignal,
  createEffect,
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
  type RssSourceListFilterCriteria,
} from '@/lib/rss/rss-source-list-filter';
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
import { VirtualRssSourceList } from '@/components/rss/VirtualRssSourceList';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { showAppToast } from '@/components/shared/AppToasts';
import { rssSourceHasLogin } from '@/lib/rss/open-rss-source-login';
import { clearSourceCookieAndCfRecord } from '@/lib/book-source/purge-source-session';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import {
  clearRssSourcesSessionCache,
  getRssSourcesSessionCache,
  setRssSourcesSessionCache,
  setRssSourcesSessionMeta,
} from '@/lib/rss/rss-sources-session-cache';
import {
  dispatchRssSourcesRefresh,
  readRssSourcesRefreshDetail,
  RSS_SOURCES_REFRESH_EVENT,
} from '@/lib/rss/rss-sources-refresh-event';
import {
  filterRssPageSourcesChunked,
  isChunkedFilterAbortError,
  type RssSourcesFilterMeta,
} from '@/lib/rss/rss-sources-chunked-filter';


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
  onSourceLogin?: (source: RssSource) => void;
}

export function RssPage(props: RssPageProps) {
  const [sources, setSources] = createSignal<RssSource[]>([]);
  const [filteredSources, setFilteredSources] = createSignal<RssSource[]>([]);
  const [filterMeta, setFilterMeta] = createSignal<RssSourcesFilterMeta>({
    groupNames: [],
    domainNames: [],
  });
  const [sourcesRevision, setSourcesRevision] = createSignal(0);
  const [filterMetaRevision, setFilterMetaRevision] = createSignal(-1);
  const [filtering, setFiltering] = createSignal(false);
  const [filterProgressText, setFilterProgressText] = createSignal('');
  const [loading, setLoading] = createSignal(true);
  const [scrollElement, setScrollElement] = createSignal<HTMLDivElement | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false);
  const [deleteTarget, setDeleteTarget] = createSignal<RssSource | null>(null);
  let loadSequence = 0;
  let filterJobId = 0;

  const showSkeleton = useSkeletonLoading(loading, { delay: 100, minDisplayTime: 300 });

  function syncLoadResult(sorted: RssSource[], meta?: RssSourcesFilterMeta) {
    const nextRevision = sourcesRevision() + 1;
    setSourcesRevision(nextRevision);
    setSources(sorted);
    setRssSourcesSessionCache(sorted, meta);
    props.onSourcesLoaded?.(sorted);
    props.onSourceCountChange?.(sorted.length);
    if (meta) {
      setFilterMeta(meta);
      setFilterMetaRevision(nextRevision);
      props.onGroupsLoaded?.(meta.groupNames);
    }
  }

  async function yieldToBrowser() {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }

  async function loadSources(options?: { keepCurrent?: boolean; force?: boolean }) {
    const currentLoadId = ++loadSequence;
    if (!options?.keepCurrent) setLoading(true);
    try {
      if (!options?.force) {
        const cached = getRssSourcesSessionCache();
        if (cached) {
          syncLoadResult(cached.sources, cached.meta);
          setFilteredSources(cached.sources);
          setLoading(false);
          return;
        }
      }
      const list = await rssSourcesDb.getEnabledRssSources();
      await yieldToBrowser();
      const sorted = sortBookSources(
        list as unknown as import('@/types').BookSource[],
        'manual',
        false,
      ) as unknown as RssSource[];
      if (currentLoadId !== loadSequence) return;
      syncLoadResult(sorted);
    } catch (e) {
      console.error('加载订阅源失败:', e);
      if (currentLoadId !== loadSequence) return;
      setSources([]);
      setFilteredSources([]);
      props.onSourceCountChange?.(0);
    } finally {
      if (currentLoadId === loadSequence) {
        setLoading(false);
      }
    }
  }

  onMount(() => {
    const cached = getRssSourcesSessionCache();
    if (cached) {
      syncLoadResult(cached.sources, cached.meta);
      setFilteredSources(cached.sources);
      setLoading(false);
      void loadSources({ keepCurrent: true, force: true });
    } else {
      void loadSources();
    }
    const handler = (event: Event) => {
      const detail = readRssSourcesRefreshDetail(event);
      if (detail.invalidateCache || detail.reason === 'source-added' || detail.reason === 'source-removed') {
        clearRssSourcesSessionCache();
      }
      void loadSources({ keepCurrent: true, force: true });
    };
    window.addEventListener(RSS_SOURCES_REFRESH_EVENT, handler);
    onCleanup(() => window.removeEventListener(RSS_SOURCES_REFRESH_EVENT, handler));
  });

  createEffect(() => {
    const all = sources();
    const revision = sourcesRevision();
    const criteria = props.appliedFilter ?? EMPTY_RSS_SOURCE_LIST_FILTER;
    const searchQuery = (props.searchQuery ?? '').trim();
    const searchMode = props.searchMode ?? 'name';
    const canReuseMeta = filterMetaRevision() === revision;
    const reuseMeta = canReuseMeta ? filterMeta() : undefined;

    const jobId = ++filterJobId;

    if (all.length === 0) {
      setFilteredSources([]);
      setFiltering(false);
      setFilterProgressText('');
      return;
    }

    setFiltering(true);

    void (async () => {
      try {
        const result = await filterRssPageSourcesChunked({
          sources: all,
          criteria,
          searchQuery,
          searchMode,
          meta: reuseMeta,
          shouldAbort: () => jobId !== filterJobId,
          onProgress: (progress) => {
            if (jobId !== filterJobId) return;
            if (progress.phase === 'meta') {
              setFilterProgressText(`正在分析订阅源 ${progress.processed}/${progress.total}`);
              return;
            }
            if (progress.phase === 'filter') {
              setFilterProgressText(
                `正在筛选 ${progress.processed}/${progress.total}（已匹配 ${progress.matched}）`,
              );
              return;
            }
            setFilterProgressText('');
          },
          onPartialResult: (matched) => {
            if (jobId !== filterJobId) return;
            setFilteredSources([...matched]);
          },
        });
        if (jobId !== filterJobId) return;

        setFilterMeta(result.meta);
        setFilterMetaRevision(revision);
        setRssSourcesSessionMeta(result.meta);
        setFilteredSources(result.filtered);
        props.onGroupsLoaded?.(result.meta.groupNames);
        setFilterProgressText('');
        setFiltering(false);
      } catch (error) {
        if (isChunkedFilterAbortError(error)) return;
        console.error('筛选订阅源失败:', error);
        if (jobId !== filterJobId) return;
        setFilteredSources([]);
        setFilterProgressText('');
        setFiltering(false);
      }
    })();
  });

  const layoutMode = () => props.layoutMode ?? 'list';

  async function handlePinSource(source: RssSource) {
    const all = await rssSourcesDb.getAllRssSources();
    const minOrder = all.length > 0 ? Math.min(...all.map((s) => s.customOrder)) : 0;
    try {
      await rssSourcesDb.updateRssSourceOrder(source.sourceUrl, minOrder - 1);
      dispatchRssSourcesRefresh({ reason: 'source-reordered' });
      showAppToast({ title: '已置顶', description: `「${source.sourceName}」已移至列表顶部` });
      await loadSources({ keepCurrent: true, force: true });
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
      dispatchRssSourcesRefresh({ reason: 'source-reordered' });
      showAppToast({ title: '已置底', description: `「${source.sourceName}」已移至列表底部` });
      await loadSources({ keepCurrent: true, force: true });
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
      dispatchRssSourcesRefresh({ reason: 'source-updated' });
      showAppToast({
        title: source.enabled ? '已禁用' : '已启用',
        description: source.sourceName,
      });
      await loadSources({ keepCurrent: true, force: true });
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
      clearRssSourcesSessionCache();
      dispatchRssSourcesRefresh({ reason: 'source-removed', invalidateCache: true });
      await loadSources({ keepCurrent: true, force: true });
    } catch (e) {
      showAppToast({
        title: '删除失败',
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

  const itemActions = (): RssPageSourceItemActions => ({
    onOpen: (source) => props.onOpenSourceArticles(source),
    onEdit: props.onSourceEdit,
    onLogin: props.onSourceLogin,
    hasLogin: rssSourceHasLogin,
    onPinTop: (source) => void handlePinSource(source),
    onPinBottom: (source) => void handlePinToBottom(source),
    onToggleEnable: (source) => void handleToggleEnable(source),
    onClearCookieCf: (source) => void handleClearCookieCf(source),
    onDelete: (source) => {
      setDeleteTarget(source);
      setDeleteDialogOpen(true);
    },
  });

  const isGrid = () => (props.layoutMode ?? 'list') === 'grid';
  const showFilterProgress = () =>
    !showSkeleton() && filtering() && filterProgressText().length > 0;
  const showEmptyState = () =>
    !showSkeleton() && !filtering() && filteredSources().length === 0;

  return (
    <div class={cn('flex min-h-0 flex-1 flex-col', mainShellPageScroll)}>
      <div
        ref={setScrollElement}
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4"
      >
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
                {() => <div class="h-28 w-22 animate-pulse rounded-xl bg-muted/40" />}
              </For>
            </div>
          </Show>
        </Show>

        <Show when={showFilterProgress()}>
          <div class="py-2 text-center text-xs text-muted-foreground">{filterProgressText()}</div>
        </Show>

        <Show when={showEmptyState()}>
          <div class="rounded-2xl border border-border/50 bg-card p-8 text-center text-muted-foreground">
            <p class="mb-4">
              {sources().length === 0 ? '暂无已启用的订阅源' : '没有匹配的订阅源'}
            </p>
            <Show when={sources().length === 0}>
              <Button onClick={() => props.onOpenManage()}>去添加订阅源</Button>
            </Show>
          </div>
        </Show>

        <Show when={!showSkeleton() && filteredSources().length > 0}>
          <VirtualRssSourceList
            sources={filteredSources}
            layoutMode={layoutMode}
            externalScrollElement={scrollElement}
            renderListItem={(source) => (
              <RssPageSourceListItem source={source} actions={itemActions()} />
            )}
            renderGridItem={(source) => (
              <RssPageSourceGridItem source={source} actions={itemActions()} />
            )}
          />
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
