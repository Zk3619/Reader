/**
 * 影视收藏页：系统/自定义分组导航 + 页内搜索 + 管理入口
 */

import { For, Show, createMemo, createResource, createSignal, onMount } from 'solid-js';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { AppDropdownMenuItem } from '@/components/shared/AppDropdownMenu';
import { AppTabs } from '@/components/shared/AppTabs';
import { ViewerAppSelectContent } from '@/components/media/viewer/viewer-app-overlay';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { TvVodGridSkeleton } from '@/components/media/viewer/video/tv/hub/TvHubSkeletons';
import {
  TvKeepVirtualList,
  type TvKeepListItem,
} from '@/components/media/viewer/video/tv/cards/TvKeepVirtualList';
import { TvLibraryItemContextMenu } from '@/components/media/viewer/video/tv/cards/TvLibraryItemContextMenu';
import { TvKeepPaneToolbar } from '@/components/media/viewer/video/tv/panes/TvKeepPaneToolbar';
import { TvKeepGroupManagePane } from '@/components/media/viewer/video/tv/panes/TvKeepGroupManagePane';
import { TvKeepManagePane } from '@/components/media/viewer/video/tv/panes/TvKeepManagePane';
import { TvKeepGroupFormDialog } from '@/components/media/viewer/video/tv/hub/TvKeepGroupFormDialog';
import {
  TvKeepGroupPickDialog,
  type TvKeepGroupPickMode,
} from '@/components/media/viewer/video/tv/hub/TvKeepGroupPickDialog';
import { StarIcon } from '@/components/shared/icons';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { tvHubPageContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import { pageToolbarBelowScrollTrack } from '@/lib/ui/viewport-classes';
import { shouldShowBlockingLoading } from '@/lib/media/audio/music-loading-ui';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { cn } from '@/lib/utils';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import {
  BANGUMI_SITE_KEY,
  type TvKeepRow,
  type TvVideoGroupRow,
} from '@/lib/media/tv/types';
import {
  applyTvPlaySessionUrl,
  beginTvPlaySession,
  enterTvPlayLoadingShell,
  failTvPlaySession,
  getTvDetailState,
  loadTvDetail,
  playCurrentEpisode,
  selectEpisode,
  selectFlag,
  setTvPlaySessionLoading,
} from '@/stores/tv-hub/detail';
import {
  bootstrapTvLive,
  getTvLiveState,
  playLiveChannel,
} from '@/stores/tv-hub/live';
import {
  filterTvKeepByQuery,
  getTvKeepUi,
  setTvKeepActiveGroupId,
} from '@/stores/tv-hub/tv-keep-ui';
import {
  decodeBangumiFlag,
  upsertBangumiPlayHistory,
} from '@/lib/media/video/bangumi/dao-bridge';
import { MediaGroupId, isVideoSystemGroupId } from '@/types/book-group';
import { showAppToast } from '@/components/shared/AppToasts';
import { isListViewMode } from '@/lib/bookshelf/bookshelf-layout-settings';

type KeepSubView = 'browse' | 'groups' | 'manage';

function isBangumiKeepItem(item: TvKeepRow): boolean {
  return (
    item.kind === 'bangumi' ||
    item.siteKey === BANGUMI_SITE_KEY ||
    item.key.startsWith('bangumi$') ||
    /^bangumi:\d+$/i.test(item.vodId)
  );
}

function bangumiIdFromKeep(item: TvKeepRow): number {
  const fromVod = Number(String(item.vodId).replace(/^bangumi:/i, '')) || 0;
  return Number(item.vodId) || fromVod || item.cid || 0;
}

async function openKeepItem(item: TvKeepRow) {
  if (isBangumiKeepItem(item)) {
    const id = bangumiIdFromKeep(item);
    if (!id) {
      void showAppToast({ title: '无效番剧条目', variant: 'warning' });
      return;
    }
    const { openBangumiById } = await import('@/stores/tv-hub/bangumi-ui');
    const { setTvSection } = await import('@/stores/tv-hub/section');
    setTvSection('bangumi');
    await openBangumiById(id);
    return;
  }
  if (item.kind === 'live') {
    await bootstrapTvLive(item.siteKey);
    const ch = getTvLiveState().channels.find(
      (c) => c.name === item.vodName || c.name === item.vodId,
    );
    if (ch) {
      playLiveChannel({ channel: ch });
      return;
    }
    void showAppToast({
      title: '无法播放',
      description: '当前直播源中未找到该频道',
      variant: 'warning',
    });
    return;
  }
  if (item.kind === 'local') {
    const { playLocalKeepMedia } = await import('@/lib/media/tv/play-local-keep');
    await playLocalKeepMedia({
      pathOrUrl: item.vodId,
      title: item.vodName,
      startSec: (item.position ?? 0) > 0 ? item.position : undefined,
    });
    return;
  }
  await loadTvDetail(item.siteKey, item.vodId);
}

/** 立即播放：有进度则续播，否则播当前线路首集 */
async function playKeepItem(item: TvKeepRow) {
  if (isBangumiKeepItem(item)) {
    await playKeepBangumiItem(item);
    return;
  }
  if (item.kind === 'live' || item.kind === 'local') {
    await openKeepItem(item);
    return;
  }
  enterTvPlayLoadingShell({
    siteKey: item.siteKey,
    vod: {
      vod_id: item.vodId,
      vod_name: item.vodName || '播放',
      vod_pic: item.vodPic || '',
      siteKey: item.siteKey,
    },
  });
  await loadTvDetail(item.siteKey, item.vodId, {
    navigate: false,
    retainPlayShell: true,
  });
  const detail = getTvDetailState();
  const flags = detail.flags;
  if (!flags.some((f) => f.episodes.length > 0)) {
    const { openTvDetail } = await import('@/stores/tv-hub/section');
    openTvDetail(item.siteKey, item.vodId);
    void showAppToast({
      title: '无法立即播放',
      description: '未找到可播放集数，已打开详情页',
      variant: 'warning',
    });
    return;
  }
  let fi = detail.flagIndex;
  if (fi < 0 || fi >= flags.length || !flags[fi]?.episodes.length) {
    fi = flags.findIndex((f) => f.episodes.length > 0);
    selectFlag(fi);
  }
  if (getTvDetailState().episodeIndex < 0) {
    selectEpisode(0);
  }
  await playCurrentEpisode();
}

async function playKeepBangumiItem(item: TvKeepRow) {
  const id = bangumiIdFromKeep(item);
  const meta = decodeBangumiFlag(item.flag);
  const episodeUrl = (meta?.episodeUrl || '').trim();
  const ruleId = (meta?.ruleId || '').trim();
  if (!id || !episodeUrl || !ruleId) {
    await openKeepItem(item);
    void showAppToast({
      title: '无法立即播放',
      description: '缺少番剧集信息，已打开详情',
      variant: 'warning',
    });
    return;
  }

  const { loadBangumiRules } = await import('@/lib/media/video/bangumi/rules');
  const { resolvePlayUrl } = await import('@/lib/media/video/bangumi/engine');
  const { ensureBangumiDaoMigrated } = await import(
    '@/lib/media/video/bangumi/dao-bridge'
  );
  await ensureBangumiDaoMigrated();

  const rule = loadBangumiRules().find((r) => r.id === ruleId);
  if (!rule) {
    await openKeepItem(item);
    void showAppToast({
      title: '无法立即播放',
      description: '规则不存在或未启用，已打开详情',
      variant: 'warning',
    });
    return;
  }

  const title = item.vodName || '番剧';
  const cover = item.vodPic || '';
  const episodeName = item.episode || '播放';
  const ruleName = rule.name || '番剧源';
  const startSec = (item.position ?? 0) > 0 ? (item.position ?? 0) : 0;

  beginTvPlaySession({
    vod: {
      vod_id: `bangumi:${id}`,
      vod_name: title,
      vod_pic: cover,
      siteKey: BANGUMI_SITE_KEY,
    },
    flags: [{ flag: ruleName, episodes: [{ name: episodeName, url: episodeUrl }] }],
    flagIndex: 0,
    episodeIndex: 0,
    resolver: async () => {
      setTvPlaySessionLoading();
      try {
        const resolved = await resolvePlayUrl(rule, episodeUrl);
        applyTvPlaySessionUrl({
          url: resolved.url,
          headers: resolved.headers,
          startSec,
        });
        await upsertBangumiPlayHistory({
          bgmId: id,
          title,
          cover,
          episodeName,
          ruleId,
          detailUrl: meta?.detailUrl,
          episodeUrl,
          positionSec: startSec,
          durationSec: item.duration || 0,
        });
      } catch (e) {
        failTvPlaySession(e instanceof Error ? e.message : String(e));
      }
    },
  });
  await playCurrentEpisode();
}

function groupLabel(id: number, groups: TvVideoGroupRow[]): string {
  return groups.find((g) => g.groupId === id)?.groupName ?? `分组 ${id}`;
}

function KeepGroupSelect(props: {
  value: number;
  onChange: (v: number) => void;
  groups: TvVideoGroupRow[];
  counts: Record<number, number>;
}) {
  const options = () => props.groups.map((g) => g.groupId);
  const labelOf = (id: number) => {
    const base = groupLabel(id, props.groups);
    const n = props.counts[id];
    return n != null ? `${base} · ${n}` : base;
  };

  return (
    <AppSelect
      value={props.value}
      onChange={(value) => {
        if (value == null || value === props.value) return;
        props.onChange(value as number);
      }}
      options={options()}
      itemComponent={(itemProps) => (
        <AppSelectItem item={itemProps.item}>
          {labelOf(Number(itemProps.item.rawValue))}
        </AppSelectItem>
      )}
    >
      <AppSelectTrigger layout="compact" class="h-9 w-36 sm:w-44" aria-label="收藏分组">
        <AppSelectValue>
          {(sel) => {
            const raw = sel.selectedOption();
            if (raw == null) return '分组';
            return labelOf(Number(raw));
          }}
        </AppSelectValue>
        <AppSelectIcon />
      </AppSelectTrigger>
      <ViewerAppSelectContent>
        <AppSelectListbox />
      </ViewerAppSelectContent>
    </AppSelect>
  );
}

/** 分组 Tab 轨：仅 __track，留白交给 PageToolbar */
function KeepGroupTabs(props: {
  value: number;
  onChange: (v: number) => void;
  groups: TvVideoGroupRow[];
}) {
  const options = () => props.groups.map((g) => String(g.groupId));
  const labels = () =>
    Object.fromEntries(props.groups.map((g) => [String(g.groupId), g.groupName])) as Record<
      string,
      string
    >;

  return (
    <div class={cn(pageToolbarBelowScrollTrack, 'flex min-w-max items-center gap-3')}>
      <AppTabs
        value={String(props.value)}
        onChange={(value) => props.onChange(Number(value))}
        options={options()}
        labels={labels()}
        ariaLabel="收藏分组"
        variant="drawer-inline"
        layout="inline"
      />
    </div>
  );
}

function KeepGroupTitleDropdown(props: {
  title: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  groups: TvVideoGroupRow[];
  counts: Record<number, number>;
  enabled: boolean;
}) {
  return (
    <PageToolbarTitleDropdown
      title={props.title}
      description={props.description}
      dropdownEnabled={props.enabled}
      selectionKey={props.value}
      contentLayout="titleWide"
    >
      <For each={props.groups}>
        {(g) => (
          <AppDropdownMenuItem
            class={cn(
              'min-h-10 cursor-pointer gap-2 rounded-md px-2.5 py-2',
              props.value === g.groupId && 'bg-accent/50',
            )}
            onSelect={() => props.onChange(g.groupId)}
          >
            <div class="min-w-0 flex-1 text-left">
              <span class="block truncate text-sm font-medium">{g.groupName}</span>
              <span class="block truncate text-xs text-muted-foreground">
                {props.counts[g.groupId] ?? 0} 部
              </span>
            </div>
          </AppDropdownMenuItem>
        )}
      </For>
    </PageToolbarTitleDropdown>
  );
}

export function TvKeepPane() {
  const ui = getTvKeepUi;
  const [tick, setTick] = createSignal(0);
  const [subView, setSubView] = createSignal<KeepSubView>('browse');
  const [searchQuery, setSearchQuery] = createSignal('');
  const [groupPickOpen, setGroupPickOpen] = createSignal(false);
  const [groupPickMode, setGroupPickMode] = createSignal<TvKeepGroupPickMode>('move');
  const [groupPickKey, setGroupPickKey] = createSignal<string | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = createSignal(false);

  onMount(() => {
    void import('@/lib/media/tv/migrate-local-library-to-keep').then(
      ({ migrateLocalLibraryScanToKeep }) =>
        migrateLocalLibraryScanToKeep().then((r) => {
          if (r.migrated && r.added > 0) {
            setTick((n) => n + 1);
            void showAppToast({
              title: '已迁入片库扫描',
              description: `${r.added} 部 → 收藏`,
              variant: 'success',
            });
          }
        }),
    );
  });

  const [groups] = createResource(
    () => tick(),
    () => TvDao.listVideoGroups(),
  );

  const [userGroups] = createResource(
    () => tick(),
    () => TvDao.listVideoGroups({ userOnly: true }),
  );

  const [list] = createResource(
    () => ({ tick: tick(), groupId: ui().activeGroupId }),
    ({ groupId }) => TvDao.listKeepByGroup(groupId),
  );

  const [allKeep] = createResource(
    () => tick(),
    () => TvDao.listKeep(),
  );

  const refresh = () => setTick((n) => n + 1);

  const [groupCountsRes] = createResource(
    () => ({ tick: tick(), groups: groups() ?? [], allLen: allKeep()?.length ?? 0 }),
    async ({ groups: gs }) => {
      const ids = gs.map((g) => g.groupId);
      return TvDao.countKeepByGroups(ids);
    },
  );

  const groupCounts = createMemo(
    (): Record<number, number> => groupCountsRes() ?? {},
  );

  const filtered = createMemo(() =>
    filterTvKeepByQuery(list() ?? [], searchQuery(), ui().matchMode),
  );

  function openGroupPick(item: TvKeepRow) {
    setGroupPickKey(item.key);
    setGroupPickMode('move');
    setGroupPickOpen(true);
  }

  async function applyGroupPick(groupIds: number[]) {
    const key = groupPickKey();
    if (!key || !groupIds.length) return;
    try {
      if (groupPickMode() === 'move') {
        await TvDao.replaceKeepItemGroups([key], groupIds);
      } else {
        await TvDao.addKeepItemsToGroups([key], groupIds);
      }
      refresh();
      void showAppToast({
        title: groupPickMode() === 'move' ? '已移入分组' : '已加入分组',
        variant: 'success',
      });
    } catch (e) {
      void showAppToast({
        title: '操作失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  }

  const listItems = createMemo((): TvKeepListItem[] =>
    filtered().map((item) => {
      const open = () => void openKeepItem(item);
      const play = () => void playKeepItem(item);
      const remove = () => {
        void TvDao.removeKeep(item.key).then(() => {
          refresh();
          void showAppToast({
            title: '已取消收藏',
            description: item.vodName,
            variant: 'success',
          });
        });
      };
      return {
        row: item,
        onOpen: open,
        onPlay: play,
        onDetail: open,
        onGroup: () => openGroupPick(item),
        onRemove: remove,
        wrapCard: (card) => (
          <TvLibraryItemContextMenu
            onDetail={open}
            onPlay={play}
            onGroup={() => openGroupPick(item)}
            onRemove={remove}
          >
            {card}
          </TvLibraryItemContextMenu>
        ),
      };
    }),
  );

  const showList = () => !list.loading && filtered().length > 0;
  const showEmpty = () => !list.loading && !list.error && filtered().length === 0;
  const showListSkeleton = useSkeletonLoading(() =>
    shouldShowBlockingLoading(list.loading, list()?.length ?? 0),
  );
  const showFilterTabs = () => ui().groupStyle === 'tabs';
  const showTitleDropdown = () => ui().groupStyle === 'dropdown';
  const pageTitle = () => '收藏';
  const description = () => {
    if (list.loading) return '加载收藏…';
    const n = filtered().length;
    const groupName = groupLabel(ui().activeGroupId, groups() ?? []);
    const q = searchQuery().trim();
    if (q) return `${groupName} · 匹配 ${n} 部`;
    return `${groupName} ${n} 部`;
  };

  const clearAll = () => {
    if (!(allKeep()?.length ?? 0)) return;
    void TvDao.clearKeep().then(() => {
      refresh();
      void showAppToast({
        title: '已清空收藏',
        variant: 'success',
      });
    });
  };

  return (
    <Show
      when={subView() === 'browse'}
      fallback={
        <Show
          when={subView() === 'groups'}
          fallback={
            <TvKeepManagePane
              onClose={() => setSubView('browse')}
              onChanged={refresh}
            />
          }
        >
          <TvKeepGroupManagePane
            onClose={() => setSubView('browse')}
            onChanged={refresh}
          />
        </Show>
      }
    >
      <TvHubPageShell
        section="keep"
        title={pageTitle()}
        description={description()}
        titleSlot={
          <KeepGroupTitleDropdown
            title={pageTitle()}
            description={description()}
            value={ui().activeGroupId}
            onChange={setTvKeepActiveGroupId}
            groups={groups() ?? []}
            counts={groupCounts()}
            enabled={showTitleDropdown()}
          />
        }
        scrollClass={showList() || showListSkeleton() ? 'overflow-hidden' : undefined}
        toolbar={
          <>
            <Show when={ui().groupStyle === 'select'}>
              <KeepGroupSelect
                value={ui().activeGroupId}
                onChange={setTvKeepActiveGroupId}
                groups={groups() ?? []}
                counts={groupCounts()}
              />
            </Show>
            <TvKeepPaneToolbar
              loading={list.loading}
              searchQuery={searchQuery()}
              onSearchQueryChange={setSearchQuery}
              onRefresh={refresh}
              onClear={clearAll}
              canClear={(allKeep()?.length ?? 0) > 0}
              exportRows={() => allKeep() ?? []}
              onOpenGroupManage={() => setSubView('groups')}
              onOpenKeepManage={() => setSubView('manage')}
              onGroupCreated={refresh}
              onLibraryChanged={refresh}
            />
          </>
        }
        below={
          showFilterTabs() ? (
            <KeepGroupTabs
              value={ui().activeGroupId}
              onChange={setTvKeepActiveGroupId}
              groups={groups() ?? []}
            />
          ) : undefined
        }
        belowHorizontalWheel={showFilterTabs()}
      >
        <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <Show when={showListSkeleton()}>
            <Show
              when={!isListViewMode(ui().viewMode)}
              fallback={
                <div
                  class={cn(
                    'grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-2 pb-4 pt-1',
                    tvHubPageContentInsetClass,
                  )}
                  style={{
                    'grid-template-columns': `repeat(${
                      ui().viewMode === 'list-3' ? 3 : ui().viewMode === 'list-2' ? 2 : 1
                    }, minmax(0, 1fr))`,
                  }}
                  aria-busy="true"
                >
                  <For each={[0, 1, 2, 3, 4, 5]}>
                    {() => (
                      <div class="flex h-20 items-center gap-3 rounded-xl border border-border/40 bg-muted/20 p-2">
                        <div class="aspect-2/3 h-full animate-pulse rounded-lg bg-muted/50" />
                        <div class="min-w-0 flex-1 space-y-2">
                          <div class="h-3 w-3/4 animate-pulse rounded bg-muted/50" />
                          <div class="h-2.5 w-1/2 animate-pulse rounded bg-muted/40" />
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              }
            >
              <TvVodGridSkeleton class="min-h-0 flex-1 overflow-y-auto" layoutUi={ui} />
            </Show>
          </Show>

          <Show when={showList()}>
            <TvKeepVirtualList class="min-h-0 flex-1" items={listItems} layoutUi={ui} />
          </Show>

          <Show when={showEmpty()}>
            <div
              class={cn(
                'flex min-h-0 flex-1 flex-col items-center justify-center py-8',
                tvHubPageContentInsetClass,
              )}
            >
              <div class="flex w-full max-w-md flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-12">
                <StarIcon class="mb-4 h-12 w-12 text-muted-foreground opacity-50" />
                <h3 class="mb-2 text-lg font-semibold text-foreground">
                  {searchQuery().trim() ? '无匹配结果' : '暂无收藏'}
                </h3>
                <p class="text-sm text-muted-foreground">
                  {searchQuery().trim()
                    ? '试试切换精确/模糊搜索，或更换关键词'
                    : isVideoSystemGroupId(ui().activeGroupId)
                      ? ui().activeGroupId === MediaGroupId.VideoAll
                        ? '在详情页或直播列表收藏后会出现在这里'
                        : `当前「${groupLabel(ui().activeGroupId, groups() ?? [])}」下没有片单`
                      : '该分组还没有片单，可在「收藏管理」中移入'}
                </p>
              </div>
            </div>
          </Show>
        </div>

        <TvKeepGroupPickDialog
          open={groupPickOpen()}
          onOpenChange={setGroupPickOpen}
          mode={groupPickMode()}
          title={groupPickMode() === 'move' ? '移入分组' : '加入分组'}
          description={
            groupPickMode() === 'move'
              ? '将该条目移入下列分组（替换原有自定义分组）'
              : '将该条目加入下列分组（保留原有分组）'
          }
          groups={userGroups() ?? []}
          onConfirm={(ids) => void applyGroupPick(ids)}
          onAddGroup={() => {
            setGroupPickOpen(false);
            setCreateGroupOpen(true);
          }}
        />

        <TvKeepGroupFormDialog
          open={createGroupOpen()}
          onOpenChange={setCreateGroupOpen}
          onSubmit={async ({ groupName }) => {
            await TvDao.insertVideoGroup({ groupName });
            refresh();
            void showAppToast({
              title: '已创建分组',
              description: groupName,
              variant: 'success',
            });
            setGroupPickOpen(true);
          }}
        />
      </TvHubPageShell>
    </Show>
  );
}
