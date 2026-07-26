/**
 * Hub 在线歌单浏览
 */

import { createEffect, createSignal, onMount, Show, type Component } from 'solid-js';
import {
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationItems,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  closeSongListDetail,
  getSongListState,
  goToSongListPage,
  loadMoreSongList,
  loadSongListPage,
  loadSongListTags,
  openSongListDetail,
  songListPageCount,
} from '@/stores/music-hub/songList';
import { getMusicSongListUi } from '@/stores/music-hub/music-songlist-ui';
import { MusicSongListDetail } from '@/components/media/viewer/audio/music/hub/MusicSongListDetail';
import { MusicOpenListDialog } from '@/components/media/viewer/audio/music/hub/MusicOpenListDialog';
import { MusicHubPageShell } from '@/components/media/viewer/audio/music/hub/MusicHubPageShell';
import { MusicPlaylistVirtualList } from '@/components/media/viewer/audio/music/hub/MusicPlaylistVirtualList';
import { MusicHubQuickScroll } from '@/components/media/viewer/audio/music/hub/MusicHubQuickScroll';
import {
  MusicSongListPaneBelow,
  MusicSongListPaneToolbar,
} from '@/components/media/viewer/audio/music/hub/MusicSongListPaneToolbar';
import {
  MusicPlaylistGridSkeleton,
  MusicSongListDetailSkeleton,
} from '@/components/media/viewer/audio/music/hub/MusicHubSkeletons';
import { shouldShowBlockingLoading } from '@/lib/media/audio/music-loading-ui';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { musicHubListInsetClass } from '@/lib/media/audio/music-hub-section-meta';
import { scrollToTop } from '@/lib/ui/scroll-to-top';
import { settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

function SongListScrollFooter() {
  const ui = getMusicSongListUi;
  const state = getSongListState;
  return (
    <Show when={ui().paginationPreference === 'scroll'}>
      <Show when={state().playlists.length > 0}>
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

function SongListPaginationBar(props: { class?: string }) {
  const state = getSongListState;
  const ui = getMusicSongListUi;
  const pageCount = () => songListPageCount();

  return (
    <Show
      when={
        ui().paginationPreference === 'pagination' &&
        pageCount() > 1 &&
        state().playlists.length > 0
      }
    >
      <div class={cn('flex shrink-0 justify-center py-3', props.class)}>
        <Pagination
          count={pageCount()}
          page={state().page}
          onPageChange={(page) => void goToSongListPage(page)}
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

function SongListFooter() {
  return (
    <>
      <SongListScrollFooter />
      {/* 对齐搜索页 / lx：分页条放在虚拟列表 footer 内，避免与 h-full 列表并排裁切 */}
      <SongListPaginationBar />
    </>
  );
}

function useSongListScrollLoad() {
  const ui = getMusicSongListUi;
  const state = getSongListState;
  let lastScrollTop = 0;

  const handleScroll = (el: HTMLDivElement) => {
    const top = el.scrollTop;
    const moved = top !== lastScrollTop;
    lastScrollTop = top;
    if (ui().paginationPreference !== 'scroll') return;
    if (!moved || state().loadingMore || !state().hasMore) return;
    const distanceToBottom = el.scrollHeight - top - el.clientHeight;
    if (distanceToBottom < 120) {
      void loadMoreSongList();
    }
  };

  return { handleScroll };
}

function useScrollToTopOnPageChange(scrollEl: () => HTMLElement | undefined) {
  const state = getSongListState;
  const ui = getMusicSongListUi;
  createEffect(() => {
    const page = state().page;
    if (ui().paginationPreference !== 'pagination') return;
    const el = scrollEl();
    if (!el) return;
    void page;
    const reduceMotion = settingsStore.state.app.reduceMotion;
    requestAnimationFrame(() => {
      scrollToTop(el, { reduceMotion });
    });
  });
}

export const MusicSongListPane: Component = () => {
  const state = getSongListState;
  const ui = getMusicSongListUi;
  const [openListOpen, setOpenListOpen] = createSignal(false);
  const [listScrollEl, setListScrollEl] = createSignal<HTMLDivElement | undefined>();
  const { handleScroll } = useSongListScrollLoad();
  useScrollToTopOnPageChange(listScrollEl);
  const showListSkeleton = useSkeletonLoading(() =>
    shouldShowBlockingLoading(state().loading, state().playlists.length),
  );
  /** 打开详情：立即出骨架，避免仍停在列表页无反馈 */
  const showDetailSkeleton = useSkeletonLoading(
    () => state().detailLoading && !state().detail,
    { delay: 0, minDisplayTime: 200 },
  );

  // 不可用 createEffect 调 loadSongList*：MF 路径同步读 tagId，tags 回填会写 tagId
  // → effect 重跑 → loading 闪烁（刷新钮一直转）、列表反复重建（悬停样式抖动）。
  // 对齐排行榜 / setSongListSource：挂载时先标签再列表。
  onMount(() => {
    void (async () => {
      await loadSongListTags();
      await loadSongListPage(1);
    })();
  });

  const showBelow = () =>
    ui().sourceControl === 'tabs' ||
    ui().sortControl === 'tabs' ||
    ui().tagControl === 'stacked';

  return (
    <Show
      when={!state().detail}
      fallback={<MusicSongListDetail onBack={() => closeSongListDetail()} />}
    >
      <Show
        when={showDetailSkeleton()}
        fallback={
          <>
            <MusicHubPageShell
              section="songlist"
              scrollClass="overflow-hidden"
              toolbar={<MusicSongListPaneToolbar onOpenLink={() => setOpenListOpen(true)} />}
              below={showBelow() ? <MusicSongListPaneBelow /> : undefined}
              belowHorizontalWheel={ui().sourceControl === 'tabs' || ui().sortControl === 'tabs'}
            >
              <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <Show when={showListSkeleton()}>
                  <MusicPlaylistGridSkeleton class="min-h-0 flex-1 overflow-y-auto" />
                </Show>
                <Show when={!showListSkeleton() && state().playlists.length > 0}>
                  <MusicPlaylistVirtualList
                    class="min-h-0 flex-1 my-2"
                    listInnerClass={cn(musicHubListInsetClass, 'px-2 pb-4 pt-1')}
                    playlists={() => state().playlists}
                    onOpen={(pl) => void openSongListDetail(pl.id, 1, pl)}
                    onScrollContainer={setListScrollEl}
                    onScroll={handleScroll}
                    scrollFooter={<SongListFooter />}
                  />
                </Show>
                <Show when={!showListSkeleton() && state().playlists.length === 0}>
                  <p
                    class={cn(
                      'px-4 py-16 text-center text-sm',
                      state().error ? 'text-muted-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {state().error || '暂无歌单'}
                  </p>
                </Show>
                <MusicHubQuickScroll
                  container={listScrollEl}
                  contentRevision={() =>
                    `${state().playlists.length}:${state().page}:${ui().paginationPreference}:${state().source}:${state().tagId ?? ''}:${state().sortId}`
                  }
                />
              </div>
            </MusicHubPageShell>

            <MusicOpenListDialog open={openListOpen()} onOpenChange={setOpenListOpen} />
          </>
        }
      >
        <MusicSongListDetailSkeleton onBack={() => closeSongListDetail()} />
      </Show>
    </Show>
  );
};
