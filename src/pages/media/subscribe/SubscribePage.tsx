/**
 * 订阅模块主页 —— 三栏：条目列表 / 阅读；导航在页头（tabs / 下拉）
 */

import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import {
  CheckIcon,
  CircleCheckIcon,
  GlobeIcon,
  RefreshIcon,
  RssIcon,
  SearchIcon,
  StarIcon,
  TrashIcon,
} from '@/components/shared/icons';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
} from '@/components/shared/AppTooltip';
import { VirtualList } from '@/components/shared/virtual-list/VirtualList';
import { VirtualGridRowsList } from '@/components/shared/virtual-list/VirtualGridRowsList';
import { cn } from '@/lib/utils';
import {
  mainShellPageRoot,
  mainShellPageHost,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import {
  getSubscribeHubState,
  setSubscribeActiveEntry,
  setSubscribeActiveSource,
  setSubscribeEntryQuery,
  setSubscribeFeedView,
  setSubscribeTimeline,
} from '@/stores/subscribe-hub/section';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  on,
  Show,
} from 'solid-js';
import {
  listSubscribeDashboard,
  markSubscribeTimelineRead,
  pullSubscribeHistoryFromCloud,
  refreshAllSubscribeSources,
  refreshSubscribeSource,
  removeSubscribeSource,
  updateSubscribeEntryRead,
  updateSubscribeEntryStarred,
  updateSubscribeSourceEnabled,
  type SubscribeTimelineKind,
} from '@/lib/subscribe/service';
import {
  SUBSCRIBE_FEED_VIEW_LABELS,
  isSubscribeFeedViewGrid,
  isSubscribeFeedViewWide,
  resolveSubscribeListLayoutKind,
  subscribeFeedViewKindToNumber,
  type SubscribeFeedViewKind,
} from '@/lib/subscribe/feed-view';
import type {
  SubEntryCursor,
  SubEntryRow,
} from '@/lib/database/subscribe';
import { getSubscribeConfig, subscribeConfigRevision } from '@/lib/persistence/domains/subscribe-config';
import {
  getSubscribeFoloAuth,
  subscribeFoloAuthRevision,
} from '@/lib/persistence/domains/subscribe-folo-auth';
import { subscribeFeedDataRevision } from '@/lib/subscribe/feed-data-revision';
import { subscribeRefreshIntervalMs } from '@/lib/subscribe/refresh-interval';
import './SubscribePage.css';
import {
  formatSubscribeTime,
  sanitizeSubscribeHtml,
  hydrateSubscribeArticleImages,
  entryListSummary,
  entryListCoverUrl,
  parseSubscribeSourceMeta,
} from '@/lib/subscribe/presentation';
import { SubscribeSourceLogo } from '@/components/media/subscribe/SubscribeSourceLogo';
import {
  SUBSCRIBE_FEED_VIEW_TABS,
  SUBSCRIBE_HOME_NAV_SELECT_TRIGGER_CLASS,
  SUBSCRIBE_TIMELINE_LABELS,
  SUBSCRIBE_TIMELINE_TABS,
} from '@/components/media/subscribe/subscribe-home-nav';

export interface SubscribePageProps {
  onOpenSubscribeSettings?: () => void;
  onOpenSubscribeManage?: () => void;
}

export function SubscribePage(_props: SubscribePageProps) {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const hubState = getSubscribeHubState();
  const [config] = createResource(subscribeConfigRevision, () => getSubscribeConfig());
  const [foloAuth] = createResource(subscribeFoloAuthRevision, () => getSubscribeFoloAuth());
  const foloCloudEnabled = () => config()?.foloCloudAccountEnabled === true;
  const foloLoggedIn = () => Boolean(foloAuth()?.sessionToken);
  const [busyText, setBusyText] = createSignal('');
  const [sourceRefreshing, setSourceRefreshing] = createSignal(false);
  const [allRefreshing, setAllRefreshing] = createSignal(false);
  const [entries, setEntries] = createSignal<SubEntryRow[]>([]);
  const [nextCursor, setNextCursor] = createSignal<SubEntryCursor | null>(null);
  const [hasMore, setHasMore] = createSignal(false);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [cloudHistoryExhausted, setCloudHistoryExhausted] = createSignal(false);

  const [dashboard, { refetch }] = createResource(
    () => ({
      sourceId: hubState.activeSourceId || undefined,
      feedView: hubState.feedView,
      timeline: hubState.timeline as SubscribeTimelineKind,
      query: hubState.entryQuery,
      pageSize: hubState.activeSourceId ? 20 : 40,
      feedRev: subscribeFeedDataRevision(),
    }),
    (opts) => listSubscribeDashboard(opts),
  );

  const sources = createMemo(() => dashboard()?.sources ?? []);
  const feeds = createMemo(() => dashboard()?.feeds ?? []);
  const feedTitleMap = createMemo(() => {
    const map = new Map<string, string>();
    for (const feed of feeds()) map.set(feed.id, feed.title || feed.feedUrl);
    return map;
  });
  const feedLogoMap = createMemo(() => {
    const sourceById = new Map(sources().map((s) => [s.id, s] as const));
    const map = new Map<
      string,
      { title?: string | null; url?: string | null; metaJson?: string | null; siteUrl?: string | null; iconUrl?: string | null }
    >();
    for (const feed of feeds()) {
      const source = feed.sourceId ? sourceById.get(feed.sourceId) : undefined;
      const feedMeta = parseSubscribeSourceMeta(feed.metaJson);
      const sourceMeta = parseSubscribeSourceMeta(source?.metaJson);
      map.set(feed.id, {
        title: feed.title || source?.title,
        url: feed.feedUrl || source?.url,
        siteUrl: feed.siteUrl || sourceMeta.siteUrl || null,
        iconUrl: feedMeta.iconUrl || sourceMeta.iconUrl || null,
        metaJson: source?.metaJson ?? feed.metaJson,
      });
    }
    return map;
  });
  const [articleEl, setArticleEl] = createSignal<HTMLElement | null>(null);
  const activeEntry = createMemo(
    () => entries().find((entry) => entry.id === hubState.activeEntryId) ?? null,
  );
  const activeSource = createMemo(
    () => sources().find((source) => source.id === hubState.activeSourceId) ?? null,
  );
  const headerTitle = createMemo(() => {
    if (activeSource()) return activeSource()!.title || activeSource()!.url;
    const feedLabel = SUBSCRIBE_FEED_VIEW_LABELS[hubState.feedView];
    const tab = SUBSCRIBE_TIMELINE_TABS.find((item) => item.id === hubState.timeline);
    if (hubState.feedView !== 'all' && hubState.timeline === 'all') return feedLabel;
    if (hubState.feedView !== 'all') return `${feedLabel} · ${tab?.label ?? '全部'}`;
    return tab?.label ?? '全部';
  });
  const headerLogoSource = createMemo(() => {
    const source = activeSource();
    if (source) return source;
    return { title: headerTitle(), url: '', metaJson: '{}' };
  });
  const listLayoutKind = createMemo(() =>
    resolveSubscribeListLayoutKind({
      feedView: hubState.feedView,
      hasActiveSource: Boolean(hubState.activeSourceId),
      sourceView: activeSource()?.view,
    }),
  );
  const listIsWide = createMemo(() => isSubscribeFeedViewWide(listLayoutKind()));
  const listIsGrid = createMemo(() => isSubscribeFeedViewGrid(listLayoutKind()));
  const listEstimateSize = createMemo(() =>
    listLayoutKind() === 'social-media' ? 168 : 112,
  );
  const gridColCount = createMemo(() => (listLayoutKind() === 'videos' ? 2 : 2));

  const visibleFeedViews = createMemo(() => {
    const counts = new Map<number, number>();
    for (const source of sources()) {
      counts.set(source.view, (counts.get(source.view) ?? 0) + 1);
    }
    return SUBSCRIBE_FEED_VIEW_TABS.filter((kind) => {
      if (kind === 'all') return true;
      const n = subscribeFeedViewKindToNumber(kind);
      return n != null && (counts.get(n) ?? 0) > 0;
    });
  });

  const pageTitle = () => '订阅';
  const pageDescription = createMemo(() => {
    const feed = SUBSCRIBE_FEED_VIEW_LABELS[hubState.feedView];
    const tl = SUBSCRIBE_TIMELINE_LABELS[hubState.timeline];
    const n = entries().length;
    if (activeSource()) {
      return `${activeSource()!.title || activeSource()!.url} · ${n} 条`;
    }
    return `${feed} · ${tl} · ${n} 条`;
  });
  const timelineOptions = () => SUBSCRIBE_TIMELINE_TABS.map((t) => t.id);

  createEffect(() => {
    const data = dashboard();
    if (!data) return;
    setEntries(data.entries);
    setNextCursor(data.nextCursor);
    setHasMore(data.hasMore);
  });

  createEffect(() => {
    const source = activeSource();
    if (!source) {
      setCloudHistoryExhausted(false);
      return;
    }
    try {
      const meta = JSON.parse(source.metaJson || '{}') as { historyExhausted?: boolean };
      setCloudHistoryExhausted(meta.historyExhausted === true);
    } catch {
      setCloudHistoryExhausted(false);
    }
  });

  createEffect(
    on(
      () => [hubState.activeEntryId, articleEl(), activeEntry()?.content] as const,
      () => {
        const el = articleEl();
        if (!el) return;
        queueMicrotask(() => hydrateSubscribeArticleImages(el));
      },
    ),
  );

  const listEndHint = createMemo(() => {
    if (loadingMore()) return '加载更多…';
    if (hasMore()) return '继续滚动加载';
    if (!hubState.activeSourceId) return '已显示本地全部条目';
    if (cloudHistoryExhausted()) return '没有更多了';
    if (!foloCloudEnabled()) return '已显示本地全部条目';
    if (!foloLoggedIn()) return '开启实验登录可补云端更早历史';
    return '已显示本地全部条目';
  });

  async function loadMoreEntries() {
    const cursor = nextCursor();
    if (loadingMore()) return;
    if (!cursor || !hasMore()) {
      // 本地页尽后，实验可用时再从 Folo 云补更早历史
      const sourceId = hubState.activeSourceId;
      if (!sourceId || !foloCloudEnabled() || !foloLoggedIn() || cloudHistoryExhausted()) {
        return;
      }
      setLoadingMore(true);
      try {
        const history = await pullSubscribeHistoryFromCloud(sourceId, {
          pages: 3,
          pageSize: 40,
          continueFromCursor: true,
        });
        setCloudHistoryExhausted(history.exhausted);
        if (history.imported > 0) {
          await refetch();
        }
      } finally {
        setLoadingMore(false);
      }
      return;
    }
    const sourceId = hubState.activeSourceId || undefined;
    const timeline = hubState.timeline as SubscribeTimelineKind;
    const query = hubState.entryQuery;
    setLoadingMore(true);
    try {
      const page = await listSubscribeDashboard({
        sourceId,
        timeline,
        query,
        cursor,
        pageSize: sourceId ? 20 : 40,
      });
      // 过滤条件已变时丢弃过期分页结果
      if (
        (hubState.activeSourceId || undefined) !== sourceId ||
        hubState.timeline !== timeline ||
        hubState.entryQuery !== query
      ) {
        return;
      }
      const known = new Set(entries().map((entry) => entry.id));
      setEntries((current) => [
        ...current,
        ...page.entries.filter((entry) => !known.has(entry.id)),
      ]);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      if (!page.hasMore && sourceId && foloCloudEnabled() && foloLoggedIn() && !cloudHistoryExhausted()) {
        const history = await pullSubscribeHistoryFromCloud(sourceId, {
          pages: 2,
          pageSize: 40,
          continueFromCursor: true,
        });
        setCloudHistoryExhausted(history.exhausted);
        if (history.imported > 0) {
          await refetch();
        }
      }
    } finally {
      setLoadingMore(false);
    }
  }

  function maybeLoadMore(el: HTMLDivElement) {
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 240) {
      void loadMoreEntries();
    }
  }

  createEffect(() => {
    const list = entries();
    if (!list.length) {
      if (hubState.activeEntryId) setSubscribeActiveEntry('');
      return;
    }
    if (!hubState.activeEntryId || !list.some((entry) => entry.id === hubState.activeEntryId)) {
      setSubscribeActiveEntry(list[0]!.id);
    }
  });

  createEffect(() => {
    const sourceId = hubState.activeSourceId;
    if (!sourceId) return;
    void getSubscribeConfig().then((cfg) => {
      if (cfg.autoRefreshOnOpen) void autoRefreshSource(sourceId);
    });
  });

  async function doRefreshSource(sourceId: string) {
    if (!sourceId || busyText() || sourceRefreshing()) return;
    setSourceRefreshing(true);
    setBusyText('正在刷新订阅...');
    try {
      const result = await refreshSubscribeSource(sourceId);
      if (result.warning) {
        showAppToast({
          title: '刷新未完全成功',
          description: result.warning,
          variant: 'error',
        });
      } else {
        showAppToast({ title: '刷新完成', description: `写入 ${result.count} 条` });
      }
      await refetch();
    } catch (error) {
      showAppToast({
        title: '刷新失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusyText('');
      setSourceRefreshing(false);
    }
  }

  async function autoRefreshSource(sourceId: string) {
    if (!sourceId || busyText()) return;
    const source = sources().find((item) => item.id === sourceId);
    const cooldownMs = subscribeRefreshIntervalMs(config()?.autoRefreshIntervalMinutes);
    if (source?.lastFetchAt && Date.now() - source.lastFetchAt < cooldownMs) {
      return;
    }
    setBusyText('正在检查更新...');
    try {
      await refreshSubscribeSource(sourceId, { interactiveCf: false });
      await refetch();
    } catch {
      // 自动刷新不弹 CF 验证、不打断用户；手动刷新会显示具体错误并允许验证。
    } finally {
      setBusyText('');
    }
  }

  async function doRefreshAll() {
    if (busyText() || allRefreshing()) return;
    setAllRefreshing(true);
    setBusyText('正在刷新全部订阅...');
    try {
      const result = await refreshAllSubscribeSources();
      const failureDetail = result.failures
        .slice(0, 3)
        .map((item) => item.message)
        .join('；');
      showAppToast({
        title: '全部刷新完成',
        description: `成功 ${result.refreshed} 源 / ${result.entries} 条${
          result.failures.length
            ? `，失败 ${result.failures.length}${failureDetail ? `：${failureDetail}` : ''}`
            : ''
        }`,
        variant: result.failures.length ? 'error' : 'success',
      });
      await refetch();
    } finally {
      setBusyText('');
      setAllRefreshing(false);
    }
  }

  async function openEntry(entryId: string) {
    setSubscribeActiveEntry(entryId);
    const entry = entries().find((item) => item.id === entryId);
    if (entry && !entry.read) {
      await updateSubscribeEntryRead(entryId, true);
      setEntries((current) =>
        current.map((item) => (item.id === entryId ? { ...item, read: true } : item)),
      );
    }
  }

  return (
    <section class={cn(tabEnterClass(), mainShellPageRoot, 'subscribe-page-container')}>
      <PageToolbar
        class={pageToolbarBottomBorder}
        title={pageTitle()}
        description={pageDescription()}
        titleSlot={
          <PageToolbarTitleDropdown
            title={pageTitle()}
            description={pageDescription()}
            dropdownEnabled={false}
          />
        }
      >
        <AppSelect
          options={visibleFeedViews()}
          value={hubState.feedView}
          onChange={(next) => {
            if (next) setSubscribeFeedView(next as SubscribeFeedViewKind);
          }}
          itemComponent={(itemProps) => (
            <AppSelectItem item={itemProps.item}>
              {SUBSCRIBE_FEED_VIEW_LABELS[itemProps.item.rawValue as SubscribeFeedViewKind]}
            </AppSelectItem>
          )}
        >
          <AppSelectTrigger
            layout="compact"
            class={SUBSCRIBE_HOME_NAV_SELECT_TRIGGER_CLASS}
            aria-label="内容频道"
          >
            <AppSelectValue>
              {(state) =>
                SUBSCRIBE_FEED_VIEW_LABELS[
                  (state.selectedOption() as SubscribeFeedViewKind) ?? 'all'
                ]
              }
            </AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectListbox />
          </AppSelectContent>
        </AppSelect>
        <AppSelect
          options={timelineOptions()}
          value={hubState.timeline}
          onChange={(next) => {
            if (next) setSubscribeTimeline(next as SubscribeTimelineKind);
          }}
          itemComponent={(itemProps) => (
            <AppSelectItem item={itemProps.item}>
              {SUBSCRIBE_TIMELINE_LABELS[itemProps.item.rawValue as SubscribeTimelineKind]}
            </AppSelectItem>
          )}
        >
          <AppSelectTrigger
            layout="compact"
            class={SUBSCRIBE_HOME_NAV_SELECT_TRIGGER_CLASS}
            aria-label="时间线"
          >
            <AppSelectValue>
              {(state) =>
                SUBSCRIBE_TIMELINE_LABELS[
                  (state.selectedOption() as SubscribeTimelineKind) ?? 'all'
                ]
              }
            </AppSelectValue>
            <AppSelectIcon />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectListbox />
          </AppSelectContent>
        </AppSelect>

        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            type="button"
            variant="ghost"
            size="icon"
            class="h-9 w-9 shrink-0"
            aria-label="刷新全部"
            disabled={!!busyText()}
            onClick={() => void doRefreshAll()}
          >
            <RefreshIcon class={cn('h-4 w-4', allRefreshing() && 'animate-spin')} />
          </AppTooltipTrigger>
          <AppTooltipContent>刷新全部</AppTooltipContent>
        </AppTooltip>
      </PageToolbar>

      <div class={cn(mainShellPageHost, 'overflow-hidden')}>
        <div
          class={cn(
            'subscribe-page-grid grid h-0 min-h-0 flex-1 overflow-hidden gap-0',
            listIsWide() && 'is-wide-list',
          )}
        >
          {/* 左栏：条目列表 */}
          <section class="flex min-h-0 min-w-0 flex-col overflow-hidden border-r bg-background">
            <div class="flex items-center gap-2 border-b px-3 py-2">
              <SubscribeSourceLogo
                source={headerLogoSource()}
                class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
                iconClass="h-4 w-4 text-muted-foreground"
              />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold">{headerTitle()}</div>
                <div class="text-[11px] text-muted-foreground">
                  {entries().length} 条 · {busyText() || '本地订阅'}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                class="h-8 px-2"
                onClick={() =>
                  void markSubscribeTimelineRead(hubState.activeSourceId || undefined).then(async () => {
                    await refetch();
                    showAppToast({ title: '已全部标为已读' });
                  })
                }
              >
                <CheckIcon class="mr-1 h-3.5 w-3.5" />
                已读
              </Button>
              <Button
                size="sm"
                variant="ghost"
                class="h-8 w-8 px-0"
                disabled={!hubState.activeSourceId || !!busyText() || sourceRefreshing()}
                onClick={() => void doRefreshSource(hubState.activeSourceId)}
              >
                <RefreshIcon class={cn('h-3.5 w-3.5', sourceRefreshing() && 'animate-spin')} />
              </Button>
            </div>
            <div class="border-b px-3 py-2">
              <div class="relative">
                <SearchIcon class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <AppTextFieldBareInput
                  class="h-9 pl-8"
                  fieldClass="w-full"
                  placeholder="搜索标题或内容"
                  value={hubState.entryQuery}
                  onInput={(e) => setSubscribeEntryQuery(e.currentTarget.value)}
                />
              </div>
            </div>
            <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
              <Show
                when={entries().length > 0}
                fallback={
                  <div class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
                    <RssIcon class="h-10 w-10 opacity-30" />
                    <div>暂无条目</div>
                    <div class="text-xs">添加订阅源并刷新后，文章会出现在这里。</div>
                  </div>
                }
              >
                <Show
                  when={listIsGrid()}
                  fallback={
                    <VirtualList<SubEntryRow>
                      class="h-full min-h-0 flex-1 overscroll-contain"
                      scrollGutter="auto"
                      items={entries}
                      estimateSize={() => listEstimateSize()}
                      overscan={8}
                      getItemKey={(entry) => entry.id}
                      onScroll={maybeLoadMore}
                      scrollFooter={
                        <Show when={entries().length > 0}>
                          <div class="flex items-center justify-center px-3 py-4 text-xs text-muted-foreground">
                            {listEndHint()}
                          </div>
                        </Show>
                      }
                    >
                      {(entry) => {
                        if (!entry) return null;
                        const social = listLayoutKind() === 'social-media';
                        return (
                          <Button
                            type="button"
                            variant="ghost"
                            class={cn(
                              'block h-full w-full rounded-none border-b px-3 py-3 text-left font-normal whitespace-normal hover:bg-muted/40',
                              hubState.activeEntryId === entry.id && 'bg-muted/60',
                              !entry.read && 'bg-primary/3',
                            )}
                            onClick={() => void openEntry(entry.id)}
                          >
                            <div class="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                              <SubscribeSourceLogo
                                source={feedLogoMap().get(entry.feedId) ?? { title: '订阅' }}
                                class="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded bg-muted"
                                iconClass="h-3 w-3 text-muted-foreground"
                              />
                              <span class="truncate">
                                {feedTitleMap().get(entry.feedId) || '订阅'}
                              </span>
                              <span>·</span>
                              <span>{formatSubscribeTime(entry.publishedAt)}</span>
                              <Show when={entry.starred}>
                                <StarIcon class="ml-auto h-3 w-3 fill-current text-amber-500" />
                              </Show>
                            </div>
                            <Show when={!social}>
                              <div
                                class={cn(
                                  'line-clamp-2 text-sm leading-snug',
                                  entry.read ? 'font-normal text-foreground/80' : 'font-semibold',
                                )}
                              >
                                {entry.title || '无标题'}
                              </div>
                              <Show when={entryListSummary(entry)}>
                                <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                  {entryListSummary(entry)}
                                </p>
                              </Show>
                            </Show>
                            <Show when={social}>
                              <div
                                class={cn(
                                  'text-sm leading-relaxed',
                                  entry.read ? 'font-normal text-foreground/80' : 'font-medium',
                                )}
                              >
                                <div class="line-clamp-6 whitespace-pre-wrap">
                                  {entryListSummary(entry, 420) || entry.title || '无标题'}
                                </div>
                              </div>
                            </Show>
                          </Button>
                        );
                      }}
                    </VirtualList>
                  }
                >
                  <VirtualGridRowsList<SubEntryRow>
                    class="h-full min-h-0 flex-1 overscroll-contain px-2 pt-2"
                    items={entries}
                    colCount={gridColCount}
                    estimateRowSize={188}
                    gridClass="gap-2"
                    overscan={4}
                    getItemKey={(entry) => entry.id}
                    onScroll={maybeLoadMore}
                    scrollFooter={
                      <Show when={entries().length > 0}>
                        <div class="flex items-center justify-center px-3 py-4 text-xs text-muted-foreground">
                          {listEndHint()}
                        </div>
                      </Show>
                    }
                  >
                    {(entry) => {
                      if (!entry) return null;
                      const cover = entryListCoverUrl(entry);
                      return (
                        <Button
                          type="button"
                          variant="ghost"
                          class={cn(
                            'flex h-full w-full flex-col overflow-hidden rounded-lg border p-0 text-left font-normal whitespace-normal hover:bg-muted/40',
                            hubState.activeEntryId === entry.id && 'ring-2 ring-primary/40',
                            !entry.read && 'border-primary/25',
                          )}
                          onClick={() => void openEntry(entry.id)}
                        >
                          <div class="relative aspect-video w-full overflow-hidden bg-muted">
                            <Show
                              when={cover}
                              fallback={
                                <div class="flex h-full items-center justify-center text-muted-foreground">
                                  <RssIcon class="h-6 w-6 opacity-40" />
                                </div>
                              }
                            >
                              {(src) => (
                                <img
                                  src={src()}
                                  alt=""
                                  class="h-full w-full object-cover"
                                  loading="lazy"
                                  referrerpolicy="no-referrer"
                                />
                              )}
                            </Show>
                            <Show when={entry.starred}>
                              <StarIcon class="absolute right-1.5 top-1.5 h-3.5 w-3.5 fill-current text-amber-500 drop-shadow" />
                            </Show>
                          </div>
                          <div class="w-full px-2 py-1.5">
                            <div
                              class={cn(
                                'line-clamp-2 text-xs leading-snug',
                                entry.read ? 'font-normal text-foreground/80' : 'font-semibold',
                              )}
                            >
                              {entry.title || '无标题'}
                            </div>
                            <div class="mt-0.5 truncate text-[10px] text-muted-foreground">
                              {feedTitleMap().get(entry.feedId) || '订阅'}
                              {' · '}
                              {formatSubscribeTime(entry.publishedAt)}
                            </div>
                          </div>
                        </Button>
                      );
                    }}
                  </VirtualGridRowsList>
                </Show>
              </Show>
            </div>
          </section>

          {/* 右栏：阅读器 */}
          <main class="flex min-h-0 min-w-0 flex-col overflow-hidden bg-background">
            <Show
              when={activeEntry()}
              fallback={
                <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
                  <RssIcon class="h-14 w-14 opacity-20" />
                  <div class="text-sm">选择一篇文章开始阅读</div>
                </div>
              }
            >
              {(entry) => (
                <>
                  <div class="flex flex-wrap items-center gap-3 border-b px-4 py-3">
                    <div class="min-w-0 flex-1 basis-[min(100%,16rem)]">
                      <h1 class="text-xl font-semibold leading-snug tracking-tight">
                        {entry().title || '无标题'}
                      </h1>
                      <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{entry().author || '未知作者'}</span>
                        <span>·</span>
                        <span>{formatSubscribeTime(entry().publishedAt)}</span>
                        <Show when={feedTitleMap().get(entry().feedId)}>
                          <span>·</span>
                          <span>{feedTitleMap().get(entry().feedId)}</span>
                        </Show>
                      </div>
                    </div>
                    <div class="ml-auto flex shrink-0 items-center gap-0.5">
                      <AppTooltip>
                        <AppTooltipTrigger
                          as={Button}
                          type="button"
                          variant="ghost"
                          size="icon"
                          class="h-9 w-9 shrink-0"
                          aria-label={entry().read ? '标为未读' : '标为已读'}
                          aria-pressed={entry().read}
                          onClick={() =>
                            void updateSubscribeEntryRead(entry().id, !entry().read).then(() => {
                              const nextRead = !entry().read;
                              setEntries((current) =>
                                current.map((item) =>
                                  item.id === entry().id ? { ...item, read: nextRead } : item,
                                ),
                              );
                            })
                          }
                        >
                          <CircleCheckIcon
                            class={cn(
                              'h-4 w-4',
                              entry().read
                                ? 'text-green-500'
                                : 'text-foreground',
                            )}
                          />
                          <span class="sr-only">{entry().read ? '标为未读' : '标为已读'}</span>
                        </AppTooltipTrigger>
                        <AppTooltipContent>
                          {entry().read ? '标为未读' : '标为已读'}
                        </AppTooltipContent>
                      </AppTooltip>
                      <AppTooltip>
                        <AppTooltipTrigger
                          as={Button}
                          type="button"
                          variant="ghost"
                          size="icon"
                          class="h-9 w-9 shrink-0"
                          aria-label={entry().starred ? '取消收藏' : '收藏'}
                          aria-pressed={entry().starred}
                          onClick={() =>
                            void updateSubscribeEntryStarred(entry().id, !entry().starred).then(
                              () => {
                                const nextStarred = !entry().starred;
                                setEntries((current) =>
                                  current.map((item) =>
                                    item.id === entry().id
                                      ? { ...item, starred: nextStarred }
                                      : item,
                                  ),
                                );
                              },
                            )
                          }
                        >
                          <StarIcon
                            class={cn(
                              'h-4 w-4',
                              entry().starred
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-foreground',
                            )}
                          />
                          <span class="sr-only">{entry().starred ? '取消收藏' : '收藏'}</span>
                        </AppTooltipTrigger>
                        <AppTooltipContent>
                          {entry().starred ? '取消收藏' : '收藏'}
                        </AppTooltipContent>
                      </AppTooltip>
                      <Show when={entry().url}>
                        <AppTooltip>
                          <AppTooltipTrigger
                            as={Button}
                            type="button"
                            variant="ghost"
                            size="icon"
                            class="h-9 w-9 shrink-0"
                            aria-label="打开原文"
                            onClick={() => window.open(entry().url!, '_blank', 'noreferrer')}
                          >
                            <GlobeIcon class="h-4 w-4" />
                            <span class="sr-only">打开原文</span>
                          </AppTooltipTrigger>
                          <AppTooltipContent>打开原文</AppTooltipContent>
                        </AppTooltip>
                      </Show>
                    </div>
                  </div>
                  <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
                    <article
                      ref={setArticleEl}
                      class="subscribe-article prose prose-sm dark:prose-invert max-w-3xl text-sm leading-7 [&_img]:max-h-[min(70vh,720px)] [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-md"
                      // eslint-disable-next-line solid/no-innerhtml
                      innerHTML={
                        sanitizeSubscribeHtml(entry().content, {
                          baseUrl:
                            entry().url ||
                            feedLogoMap().get(entry().feedId)?.siteUrl ||
                            feedLogoMap().get(entry().feedId)?.url ||
                            null,
                        }) ||
                        '<p class="text-muted-foreground">此条目没有正文内容。</p>'
                      }
                    />
                  </div>
                  <Show when={activeSource()}>
                    <div class="flex items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
                      <span class="truncate">源：{activeSource()!.title || activeSource()!.url}</span>
                      <div class="ml-auto flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          class="h-7 px-2"
                          onClick={() =>
                            void updateSubscribeSourceEnabled(
                              activeSource()!.id,
                              !activeSource()!.enabled,
                            ).then(refetch)
                          }
                        >
                          {activeSource()!.enabled ? '停用' : '启用'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          class="h-7 px-2 text-destructive"
                          onClick={() =>
                            void removeSubscribeSource(activeSource()!.id).then(async () => {
                              setSubscribeActiveSource('');
                              await refetch();
                              showAppToast({ title: '已删除订阅源' });
                            })
                          }
                        >
                          <TrashIcon class="mr-1 h-3.5 w-3.5" />
                          删除源
                        </Button>
                      </div>
                    </div>
                  </Show>
                </>
              )}
            </Show>
          </main>
        </div>
      </div>
    </section>
  );
}
