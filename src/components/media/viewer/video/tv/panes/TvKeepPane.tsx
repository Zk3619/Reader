/**
 * 影视收藏页：系统/自定义分组导航 + 页内搜索 + 管理入口
 */

import { For, Show, createMemo, createResource, createSignal } from 'solid-js';
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
import { TvKeepContextMenu } from '@/components/media/viewer/video/tv/cards/TvKeepContextMenu';
import { TvKeepPaneToolbar } from '@/components/media/viewer/video/tv/panes/TvKeepPaneToolbar';
import { TvKeepGroupManagePane } from '@/components/media/viewer/video/tv/panes/TvKeepGroupManagePane';
import { TvKeepManagePane } from '@/components/media/viewer/video/tv/panes/TvKeepManagePane';
import { StarIcon } from '@/components/shared/icons';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { tvHubPageContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import { pageToolbarBelowScrollTrack } from '@/lib/ui/viewport-classes';
import { shouldShowBlockingLoading } from '@/lib/media/audio/music-loading-ui';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { cn } from '@/lib/utils';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import type { TvKeepRow, TvVideoGroupRow } from '@/lib/media/tv/types';
import { loadTvDetail } from '@/stores/tv-hub/detail';
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
import { MediaGroupId, isVideoSystemGroupId } from '@/types/book-group';
import { showAppToast } from '@/components/shared/AppToasts';
import { isListViewMode } from '@/lib/bookshelf/bookshelf-layout-settings';

type KeepSubView = 'browse' | 'groups' | 'manage';

async function openKeepItem(item: TvKeepRow) {
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
    void showAppToast({
      title: item.vodName,
      description: item.vodId,
      variant: 'info',
    });
    return;
  }
  await loadTvDetail(item.siteKey, item.vodId);
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

  const [groups] = createResource(
    () => tick(),
    () => TvDao.listVideoGroups(),
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

  const listItems = createMemo((): TvKeepListItem[] =>
    filtered().map((item) => {
      const open = () => void openKeepItem(item);
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
        wrapCard: (card) => (
          <TvKeepContextMenu
            item={item}
            onOpen={open}
            onRemove={remove}
            onMovedToGroup={() => {
              refresh();
              void showAppToast({
                title: '已移入分组',
                description: item.vodName,
                variant: 'success',
              });
            }}
          >
            {card}
          </TvKeepContextMenu>
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
      </TvHubPageShell>
    </Show>
  );
}
