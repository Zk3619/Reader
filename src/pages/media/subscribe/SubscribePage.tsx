/**
 * 订阅模块主页 —— Folo 风格三栏：订阅源 / 时间线 / 阅读
 */

import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareInput, AppTextFieldInput } from '@/components/shared/AppTextField';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckIcon,
  LayoutIcon,
  PlusIcon,
  RefreshIcon,
  RssIcon,
  SearchIcon,
  Settings2Icon,
  StarIcon,
  TrashIcon,
} from '@/components/shared/icons';
import { showAppToast } from '@/components/shared/AppToasts';
import { VirtualList } from '@/components/shared/virtual-list/VirtualList';
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
  setSubscribeSection,
} from '@/stores/subscribe-hub/section';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  Show,
} from 'solid-js';
import {
  AUTO_REFRESH_COOLDOWN_MS,
  createSubscribeSource,
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
import type {
  SubEntryCursor,
  SubEntryRow,
} from '@/lib/database/subscribe';
import { getSubscribeConfig, subscribeConfigRevision } from '@/lib/persistence/domains/subscribe-config';
import {
  formatSubscribeTime,
  sanitizeSubscribeHtml,
  entryListSummary,
} from '@/lib/subscribe/presentation';
import { SUBSCRIBE_TIMELINE_TABS } from '@/components/media/subscribe/SubscribeModuleSidebarSection';

export interface SubscribePageProps {
  onOpenSubscribeSettings?: () => void;
}

export function SubscribePage(props: SubscribePageProps) {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const hubState = getSubscribeHubState();
  const [config] = createResource(subscribeConfigRevision, () => getSubscribeConfig());
  const discoverEnabled = () => config()?.foloDiscoverEnabled !== false;
  const [addOpen, setAddOpen] = createSignal(false);
  const [newSourceTitle, setNewSourceTitle] = createSignal('');
  const [newSourceUrl, setNewSourceUrl] = createSignal('');
  const [newSourceCategory, setNewSourceCategory] = createSignal('');
  const [busyText, setBusyText] = createSignal('');
  const [entries, setEntries] = createSignal<SubEntryRow[]>([]);
  const [nextCursor, setNextCursor] = createSignal<SubEntryCursor | null>(null);
  const [hasMore, setHasMore] = createSignal(false);
  const [loadingMore, setLoadingMore] = createSignal(false);

  const [dashboard, { refetch }] = createResource(
    () => ({
      sourceId: hubState.activeSourceId || undefined,
      timeline: hubState.timeline as SubscribeTimelineKind,
      query: hubState.entryQuery,
      pageSize: hubState.activeSourceId ? 20 : 40,
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
  const activeEntry = createMemo(
    () => entries().find((entry) => entry.id === hubState.activeEntryId) ?? null,
  );
  const activeSource = createMemo(
    () => sources().find((source) => source.id === hubState.activeSourceId) ?? null,
  );
  const headerTitle = createMemo(() => {
    if (activeSource()) return activeSource()!.title || activeSource()!.url;
    const tab = SUBSCRIBE_TIMELINE_TABS.find((item) => item.id === hubState.timeline);
    return tab?.label ?? '全部';
  });

  createEffect(() => {
    const data = dashboard();
    if (!data) return;
    setEntries(data.entries);
    setNextCursor(data.nextCursor);
    setHasMore(data.hasMore);
  });

  async function loadMoreEntries() {
    const cursor = nextCursor();
    if (loadingMore()) return;
    if (!cursor || !hasMore()) {
      // 本地页尽后，尝试从 Folo 云补更早历史
      const sourceId = hubState.activeSourceId;
      if (!sourceId) return;
      setLoadingMore(true);
      try {
        const history = await pullSubscribeHistoryFromCloud(sourceId, {
          pages: 3,
          pageSize: 40,
          continueFromCursor: true,
        });
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
      if (!page.hasMore && sourceId) {
        // 本地末页后再拉一页云历史
        const history = await pullSubscribeHistoryFromCloud(sourceId, {
          pages: 2,
          pageSize: 40,
          continueFromCursor: true,
        });
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

  async function doCreateSource() {
    if (!newSourceUrl().trim()) return;
    setBusyText('正在添加订阅源...');
    try {
      const id = await createSubscribeSource({
        title: newSourceTitle().trim() || newSourceUrl().trim(),
        url: newSourceUrl().trim(),
        category: newSourceCategory().trim(),
      });
      setSubscribeActiveSource(id);
      setNewSourceTitle('');
      setNewSourceUrl('');
      setNewSourceCategory('');
      setAddOpen(false);
      await refetch();
      showAppToast({ title: '已添加订阅源', variant: 'success' });
      void doRefreshSource(id);
    } catch (error) {
      showAppToast({
        title: '添加失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusyText('');
    }
  }

  async function doRefreshSource(sourceId: string) {
    if (!sourceId || busyText()) return;
    setBusyText('正在刷新订阅...');
    try {
      const count = await refreshSubscribeSource(sourceId);
      showAppToast({ title: '刷新完成', description: `写入 ${count} 条` });
      await refetch();
    } catch (error) {
      showAppToast({
        title: '刷新失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusyText('');
    }
  }

  async function autoRefreshSource(sourceId: string) {
    if (!sourceId || busyText()) return;
    const source = sources().find((item) => item.id === sourceId);
    if (
      source?.lastFetchAt &&
      Date.now() - source.lastFetchAt < AUTO_REFRESH_COOLDOWN_MS
    ) {
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
    if (busyText()) return;
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
        title="订阅"
        description="Folo 信息流"
        titleSlot={
          <PageToolbarTitleDropdown
            title="订阅"
            description="Folo 信息流"
            dropdownEnabled={false}
          />
        }
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-9 w-9"
          aria-label="刷新全部"
          disabled={!!busyText()}
          onClick={() => void doRefreshAll()}
        >
          <RefreshIcon class={cn('h-4 w-4', busyText() && 'animate-spin')} />
        </Button>
        <Show when={discoverEnabled()}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-9 w-9"
            aria-label="发现广场"
            onClick={() => setSubscribeSection('discover')}
          >
            <LayoutIcon class="h-4 w-4" />
          </Button>
        </Show>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-9 w-9"
          aria-label="添加订阅"
          onClick={() => setAddOpen(true)}
        >
          <PlusIcon class="h-4 w-4" />
        </Button>
        {props.onOpenSubscribeSettings ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-9 w-9"
            aria-label="订阅设置"
            onClick={() => {
              setSubscribeSection('settings');
              props.onOpenSubscribeSettings?.();
            }}
          >
            <Settings2Icon class="h-4 w-4" />
          </Button>
        ) : undefined}
      </PageToolbar>

      <div class={cn(mainShellPageHost, 'overflow-hidden')}>
        <div class="subscribe-page-grid grid h-0 min-h-0 flex-1 overflow-hidden gap-0">
          {/* 左栏：条目列表 */}
          <section class="flex min-h-0 min-w-0 flex-col overflow-hidden border-r bg-background">
            <div class="flex items-center gap-2 border-b px-3 py-2">
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
                disabled={!hubState.activeSourceId || !!busyText()}
                onClick={() => void doRefreshSource(hubState.activeSourceId)}
              >
                <RefreshIcon class="h-3.5 w-3.5" />
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
                <VirtualList<SubEntryRow>
                  class="h-full min-h-0 flex-1 overscroll-contain"
                  scrollGutter="auto"
                  items={entries}
                  estimateSize={112}
                  overscan={8}
                  getItemKey={(entry) => entry.id}
                  onScroll={maybeLoadMore}
                  scrollFooter={
                    <Show when={hasMore() || loadingMore()}>
                      <div class="flex items-center justify-center px-3 py-4 text-xs text-muted-foreground">
                        {loadingMore() ? '加载更多…' : '继续滚动加载'}
                      </div>
                    </Show>
                  }
                >
                  {(entry) => {
                    if (!entry) return null;
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
                          <span class="truncate">
                            {feedTitleMap().get(entry.feedId) || '订阅'}
                          </span>
                          <span>·</span>
                          <span>{formatSubscribeTime(entry.publishedAt)}</span>
                          <Show when={entry.starred}>
                            <StarIcon class="ml-auto h-3 w-3 fill-current text-amber-500" />
                          </Show>
                        </div>
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
                      </Button>
                    );
                  }}
                </VirtualList>
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
                  <div class="flex flex-wrap items-start gap-2 border-b px-4 py-3">
                    <div class="min-w-0 basis-full">
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
                    <div class="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
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
                        {entry().read ? '标未读' : '标已读'}
                      </Button>
                      <Button
                        size="sm"
                        variant={entry().starred ? 'default' : 'outline'}
                        onClick={() =>
                          void updateSubscribeEntryStarred(entry().id, !entry().starred).then(() => {
                            const nextStarred = !entry().starred;
                            setEntries((current) =>
                              current.map((item) =>
                                item.id === entry().id ? { ...item, starred: nextStarred } : item,
                              ),
                            );
                          })
                        }
                      >
                        <StarIcon class="mr-1 h-3.5 w-3.5" />
                        {entry().starred ? '已收藏' : '收藏'}
                      </Button>
                      <Show when={entry().url}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(entry().url!, '_blank', 'noreferrer')}
                        >
                          原文
                        </Button>
                      </Show>
                    </div>
                  </div>
                  <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
                    <article
                      class="subscribe-article prose prose-sm dark:prose-invert max-w-3xl text-sm leading-7"
                      // eslint-disable-next-line solid/no-innerhtml
                      innerHTML={
                        sanitizeSubscribeHtml(entry().content) ||
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

      <Dialog open={addOpen()} onOpenChange={setAddOpen}>
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加订阅源</DialogTitle>
            <DialogDescription>支持 RSS / Atom。数据写入独立 `sub_*` 表，不影响 legado RSS。</DialogDescription>
          </DialogHeader>
          <div class="space-y-3 py-2">
            <AppTextFieldInput
              layout="bare"
              placeholder="标题（可选）"
              value={newSourceTitle()}
              onInput={(e) => setNewSourceTitle(e.currentTarget.value)}
            />
            <AppTextFieldInput
              layout="bare"
              placeholder="https://example.com/feed.xml"
              value={newSourceUrl()}
              onInput={(e) => setNewSourceUrl(e.currentTarget.value)}
            />
            <AppTextFieldInput
              layout="bare"
              placeholder="分类/文件夹（可选）"
              value={newSourceCategory()}
              onInput={(e) => setNewSourceCategory(e.currentTarget.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void doCreateSource()} disabled={!newSourceUrl().trim()}>
              添加并刷新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
