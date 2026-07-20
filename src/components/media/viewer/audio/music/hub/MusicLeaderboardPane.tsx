/**
 * Hub 排行榜浏览（分栏间距 / 侧栏 / 曲目表对齐「我的列表」）
 */

import { createEffect, createSignal, For, onMount, Show, type Component } from 'solid-js';
import { ChevronRight } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import {
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationItems,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  FolderRefreshIcon,
  MoreIcon,
  PlayIcon,
  RefreshIcon,
} from '@/components/shared/icons';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import {
  getLeaderboardState,
  goToLeaderboardPage,
  leaderboardPageCount,
  loadLeaderboardBoards,
  loadMoreLeaderboard,
  MUSIC_SDK_SOURCES,
  MUSIC_SDK_SOURCE_LABELS,
  refreshLeaderboard,
  selectLeaderboardBoard,
  setLeaderboardSource,
} from '@/stores/music-hub/leaderboard';
import {
  getMusicLeaderboardUi,
  setMusicLeaderboardPaginationPreference,
} from '@/stores/music-hub/music-leaderboard-ui';
import { playAsTemp } from '@/stores/viewer/media/audio';
import { addTracksToPlaylist } from '@/lib/database/audio-library';
import { bindPlaylistToSource } from '@/lib/media/audio/list/sync-source-list';
import { BUILTIN_PLAYLIST_IDS } from '@/lib/media/audio/track-types';
import { cn } from '@/lib/utils';
import { shouldShowBlockingLoading } from '@/lib/media/audio/music-loading-ui';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { musicHubSplitPaneInsetClass } from '@/lib/media/audio/music-hub-section-meta';
import { MusicAppSelect } from '@/components/media/viewer/audio/music/MusicAppSelect';
import { MusicHubPageShell } from '@/components/media/viewer/audio/music/hub/MusicHubPageShell';
import {
  MusicSidebarListSkeleton,
  MusicTrackListSkeleton,
} from '@/components/media/viewer/audio/music/hub/MusicHubSkeletons';
import { MusicOnlineTrackList } from '@/components/media/viewer/audio/music/hub/MusicSearchResultLists';
import { scrollToTop } from '@/lib/ui/scroll-to-top';
import { settingsStore } from '@/stores/settings';

/** 与「我的列表」MusicPlaylistSidebar 同宽 */
const LEADERBOARD_SIDE_WIDTH = 'w-44 md:w-52';

function LeaderboardMoreMenu(props: { onReloadFirstPage: () => void }) {
  const ui = getMusicLeaderboardUi;
  const [open, setOpen] = createSignal(false);
  return (
    <AppDropdownMenu open={open()} onOpenChange={setOpen}>
      <AppTooltip>
        <AppTooltipTrigger as="div">
          <AppDropdownMenuTrigger
            as={(triggerProps: Record<string, unknown>) => (
              <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                <MoreIcon class="h-4 w-4" />
                <span class="sr-only">更多</span>
              </AppDropdownMenuIconTrigger>
            )}
          />
        </AppTooltipTrigger>
        <AppTooltipContent>更多</AppTooltipContent>
      </AppTooltip>
      <AppDropdownMenuContent layout="compact">
        <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
          列表分页方式
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          onSelect={() => {
            setMusicLeaderboardPaginationPreference('scroll');
            props.onReloadFirstPage();
          }}
          class="flex items-center gap-2"
        >
          <MenuRadioIndicator selected={ui().paginationPreference === 'scroll'} />
          <span>滚动加载</span>
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          onSelect={() => {
            setMusicLeaderboardPaginationPreference('pagination');
            props.onReloadFirstPage();
          }}
          class="flex items-center gap-2"
        >
          <MenuRadioIndicator selected={ui().paginationPreference === 'pagination'} />
          <span>分页加载</span>
        </AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function MenuRadioIndicator(props: { selected: boolean }) {
  return (
    <span
      class={cn(
        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
        props.selected ? 'border-primary' : 'border-muted-foreground/40',
      )}
      aria-hidden
    >
      <Show when={props.selected}>
        <span class="h-1.5 w-1.5 rounded-full bg-primary" />
      </Show>
    </span>
  );
}

function LeaderboardScrollFooter() {
  const ui = getMusicLeaderboardUi;
  const state = getLeaderboardState;
  return (
    <Show when={ui().paginationPreference === 'scroll'}>
      <Show when={(state().detail?.tracks.length ?? 0) > 0}>
        <Show when={state().loadingMore}>
          <div class="py-4 text-center text-sm text-muted-foreground">加载中…</div>
        </Show>
        <Show when={!state().loadingMore && !state().hasMore}>
          <div class="py-4 text-center text-sm text-muted-foreground">没有更多了</div>
        </Show>
      </Show>
    </Show>
  );
}

function LeaderboardPaginationBar() {
  const state = getLeaderboardState;
  const ui = getMusicLeaderboardUi;
  const pageCount = () => leaderboardPageCount();

  return (
    <Show
      when={
        ui().paginationPreference === 'pagination' &&
        pageCount() > 1 &&
        (state().detail?.tracks.length ?? 0) > 0
      }
    >
      <div class="flex shrink-0 justify-center py-3">
        <Pagination
          count={pageCount()}
          page={state().page}
          onPageChange={(page) => void goToLeaderboardPage(page)}
          disabled={state().loading || state().loadingMore}
          itemComponent={(itemProps) => (
            <PaginationItem page={itemProps.page}>{itemProps.page}</PaginationItem>
          )}
          ellipsisComponent={() => <PaginationEllipsis />}
        >
          <PaginationPrevious>上一页</PaginationPrevious>
          <PaginationItems />
          <PaginationNext>下一页</PaginationNext>
        </Pagination>
      </div>
    </Show>
  );
}

function LeaderboardListFooter() {
  return (
    <>
      <LeaderboardScrollFooter />
      <LeaderboardPaginationBar />
    </>
  );
}

export const MusicLeaderboardPane: Component = () => {
  const state = getLeaderboardState;
  const ui = getMusicLeaderboardUi;
  const shell = useShellLayout();
  const isMobileLayout = () => shell().useMobileShell;
  const [tracksScrollEl, setTracksScrollEl] = createSignal<HTMLDivElement | undefined>();
  const [boardsScrollEl, setBoardsScrollEl] = createSignal<HTMLElement | undefined>();
  const reduceMotion = () => settingsStore.state.app.reduceMotion;
  const showBoardsSkeleton = useSkeletonLoading(() =>
    shouldShowBlockingLoading(state().loading, state().boards.length),
  );
  const showTracksSkeleton = useSkeletonLoading(() =>
    shouldShowBlockingLoading(state().loading, state().detail ? 1 : 0),
  );

  let lastTracksScrollTop = 0;

  // 不可用 createEffect 调 loadLeaderboardBoards：其同步路径会读/写 store，
  // 写回后 effect 重跑 → 反复 selectLeaderboardBoard → loadDetailSeq 竞态，loading 卡死、骨架不结束。
  onMount(() => {
    void loadLeaderboardBoards();
  });

  const detail = () => state().detail;

  createEffect(() => {
    const boardId = detail()?.board.id;
    const page = state().page;
    const pref = ui().paginationPreference;
    const el = tracksScrollEl();
    if (!boardId || !el) return;
    // 分页模式下切页/换榜回顶；滚动追加模式不打断阅读位置（换榜仍回顶）
    if (pref === 'scroll' && page > 1) return;
    void page;
    requestAnimationFrame(() => {
      scrollToTop(el, { reduceMotion: reduceMotion() });
    });
  });

  createEffect(() => {
    const source = state().source;
    const el = boardsScrollEl();
    if (!source || !el) return;
    requestAnimationFrame(() => {
      scrollToTop(el, { reduceMotion: reduceMotion() });
    });
  });

  const handleTracksScroll = (el: HTMLDivElement) => {
    const top = el.scrollTop;
    const moved = top !== lastTracksScrollTop;
    lastTracksScrollTop = top;
    if (ui().paginationPreference !== 'scroll') return;
    if (!moved || state().loadingMore || !state().hasMore) return;
    const distanceToBottom = el.scrollHeight - top - el.clientHeight;
    if (distanceToBottom < 120) {
      void loadMoreLeaderboard();
    }
  };

  const syncToMyList = async () => {
    const d = detail();
    if (!d) return;
    await addTracksToPlaylist(BUILTIN_PLAYLIST_IDS.DEFAULT, d.tracks);
    bindPlaylistToSource({
      playlistId: BUILTIN_PLAYLIST_IDS.DEFAULT,
      source: state().source,
      type: 'leaderboard',
      sourceId: d.board.bangId,
    });
  };

  const reloadFirstPage = () => {
    const board = state().selectedBoard;
    if (board) void selectLeaderboardBoard(board, 1, { force: true });
  };

  return (
    <MusicHubPageShell
      section="leaderboard"
      title={detail()?.board.name}
      description={detail() ? '排行榜曲目' : undefined}
      toolbar={
        <>
          <Show when={detail()}>
            {(d) => (
              <>
                <AppTooltip>
                  <AppTooltipTrigger
                    as={Button}
                    size="icon"
                    variant="ghost"
                    class="h-9 w-9 shrink-0"
                    disabled={d().tracks.length === 0}
                    onClick={() =>
                      void playAsTemp(d().tracks, 0, {
                        listName: d().board.name,
                        listKind: 'leaderboard',
                      })
                    }
                    aria-label="播放全部"
                  >
                    <PlayIcon class="h-4 w-4" />
                    <span class="sr-only">播放全部</span>
                  </AppTooltipTrigger>
                  <AppTooltipContent>播放全部</AppTooltipContent>
                </AppTooltip>

                <AppTooltip>
                  <AppTooltipTrigger
                    as={Button}
                    size="icon"
                    variant="ghost"
                    class="h-9 w-9 shrink-0"
                    disabled={d().tracks.length === 0}
                    onClick={() => void syncToMyList()}
                    aria-label="同步到我的列表"
                  >
                    <FolderRefreshIcon class="h-4 w-4" />
                    <span class="sr-only">同步到我的列表</span>
                  </AppTooltipTrigger>
                  <AppTooltipContent>同步到我的列表</AppTooltipContent>
                </AppTooltip>
              </>
            )}
          </Show>

          <AppTooltip>
            <AppTooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-9 w-9 shrink-0"
              disabled={state().loading || state().loadingMore}
              onClick={() => void refreshLeaderboard()}
              aria-label="刷新"
            >
              <RefreshIcon
                class={cn(
                  'h-4 w-4',
                  (state().loading || state().loadingMore) && 'animate-spin',
                )}
              />
              <span class="sr-only">刷新</span>
            </AppTooltipTrigger>
            <AppTooltipContent>刷新</AppTooltipContent>
          </AppTooltip>

          <LeaderboardMoreMenu onReloadFirstPage={reloadFirstPage} />
        </>
      }
      scrollClass="overflow-hidden"
    >
      <div
        class={cn(
          'flex min-h-0 flex-1 overflow-hidden',
          // 与「我的列表」一致：桌面仅 pl，右侧交给曲目 VirtualList both-edges
          isMobileLayout() ? 'px-4' : musicHubSplitPaneInsetClass,
        )}
      >
        <aside
          class={cn(
            'flex min-h-0 shrink-0 flex-col border-r',
            LEADERBOARD_SIDE_WIDTH,
          )}
        >
          {/* 与曲目表头 h-10 对齐 */}
          <div class="flex h-10 shrink-0 items-center border-b border-border/50 px-2">
            <div class="h-full w-full min-w-0 *:h-full *:w-full *:min-w-0">
              <MusicAppSelect
                value={state().source}
                onChange={(v) =>
                  setLeaderboardSource(
                    v as ReturnType<typeof getLeaderboardState>['source'],
                  )
                }
                options={MUSIC_SDK_SOURCES}
                optionLabel={(v) =>
                  MUSIC_SDK_SOURCE_LABELS[v as keyof typeof MUSIC_SDK_SOURCE_LABELS]
                }
                layout="inline"
                triggerClass="h-full w-full min-w-0 justify-between px-0 text-sm"
                aria-label="音乐源"
              />
            </div>
          </div>
          <div
            ref={(el) => setBoardsScrollEl(el)}
            class="min-h-0 flex-1 overflow-y-auto p-2"
          >
            <Show when={showBoardsSkeleton()}>
              <MusicSidebarListSkeleton class="px-0" />
            </Show>
            <Show when={!showBoardsSkeleton()}>
              <ul class="space-y-0.5">
                <For each={state().boards}>
                  {(board) => {
                    const active = () => state().selectedBoard?.id === board.id;
                    return (
                      <li>
                        <button
                          type="button"
                          class={cn(
                            'flex h-9 w-full min-w-0 items-center rounded-md px-2.5 text-left text-[13px] font-normal',
                            'transition-[color,background-color] duration-300 ease-out',
                            active()
                              ? 'bg-primary/10 font-medium text-primary'
                              : 'text-foreground hover:bg-primary/10',
                          )}
                          onClick={() => {
                            if (active()) return;
                            void selectLeaderboardBoard(board, 1);
                          }}
                        >
                          <span
                            class={cn(
                              'inline-flex shrink-0 items-center justify-center overflow-hidden',
                              reduceMotion()
                                ? ''
                                : 'transition-[width,opacity] duration-130 ease-out',
                              active() ? 'mr-0.5 w-[0.9em] opacity-100' : 'w-0 opacity-0',
                            )}
                            aria-hidden={!active()}
                          >
                            <ChevronRight class="h-[0.9em] w-[0.9em] shrink-0" />
                          </span>
                          <span class="min-w-0 flex-1 truncate">{board.name}</span>
                        </button>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </Show>
          </div>
        </aside>

        <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <Show when={showTracksSkeleton()}>
            <MusicTrackListSkeleton class="min-h-0 flex-1 overflow-hidden" />
          </Show>

          <Show when={detail()}>
            {(d) => (
              <div
                class={cn(
                  'flex min-h-0 min-w-0 flex-1 flex-col',
                  showTracksSkeleton() && 'hidden',
                  (state().loading || state().loadingMore) && 'opacity-60',
                )}
              >
                <MusicOnlineTrackList
                  tracks={() => d().tracks}
                  origin="list"
                  onPlay={(tracks, index) =>
                    void playAsTemp(tracks, index, {
                      listName: d().board.name,
                      listKind: 'leaderboard',
                    })
                  }
                  onScroll={handleTracksScroll}
                  onScrollContainer={setTracksScrollEl}
                  scrollFooter={<LeaderboardListFooter />}
                  contentRevision={() =>
                    `${d().board.id}:${d().tracks.length}:${state().page}:${ui().paginationPreference}`
                  }
                />
              </div>
            )}
          </Show>

          <Show when={!detail() && !state().loading && !showTracksSkeleton()}>
            <p class="p-4 text-sm text-muted-foreground">选择排行榜查看曲目</p>
          </Show>
        </div>
      </div>
    </MusicHubPageShell>
  );
};
