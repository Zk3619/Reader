/**
 * 专辑 / 歌手浏览详情（artist / album 分区内页面）
 */

import { Show, createEffect, createMemo, createSignal, type Component } from 'solid-js';
import { Music2 } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import {
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationItems,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { SettingsToolbarLeading } from '@/components/shell/SettingsPageToolbar';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { ExpandableIconSearch } from '@/components/shared/ExpandableIconSearch';
import { BookCoverPreviewDialog } from '@/components/media/reader/books/BookCoverPreviewDialog';
import { MoreIcon, PlayIcon, PlusIcon } from '@/components/shared/icons';
import { playAsTemp } from '@/stores/viewer/media/audio';
import { addTracksToPlaylist } from '@/lib/database/audio-library';
import { BUILTIN_PLAYLIST_IDS, type AudioTrack } from '@/lib/media/audio/track-types';
import {
  filterTracksByMusicQuery,
  getMusicQueryPrefs,
  setMusicQueryPrefs,
  type MusicQueryMode,
} from '@/lib/media/audio/music-query-prefs';
import { musicHubPageContentInsetClass } from '@/lib/media/audio/music-hub-section-meta';
import { MusicHubPageShell } from '@/components/media/viewer/audio/music/hub/MusicHubPageShell';
import { MusicOnlineTrackList } from '@/components/media/viewer/audio/music/hub/MusicSearchResultLists';
import { MusicTrackListSkeleton } from '@/components/media/viewer/audio/music/hub/MusicHubSkeletons';
import { cn } from '@/lib/utils';
import { MusicCoverImg } from '@/components/media/viewer/audio/music/MusicCoverImg';
import { scrollToTop } from '@/lib/ui/scroll-to-top';
import { settingsStore } from '@/stores/settings';
import {
  closeMusicBrowse,
  getMusicBrowseState,
  goToMusicBrowsePage,
  loadMoreMusicBrowse,
  musicBrowsePageCount,
  reloadMusicBrowseFirstPage,
} from '@/stores/music-hub/browse';
import {
  getMusicDiscoverPaginationPreference,
  setMusicDiscoverPaginationPreference,
  type MusicDiscoverKind,
} from '@/stores/music-hub/music-discover-ui';

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

function setMusicQueryMode(mode: MusicQueryMode) {
  const cur = getMusicQueryPrefs();
  if (cur.mode === mode) return;
  setMusicQueryPrefs({ scopes: [...cur.scopes], mode });
}

function BrowseMoreMenu(props: { kind: MusicDiscoverKind }) {
  const [open, setOpen] = createSignal(false);
  const preference = () => getMusicDiscoverPaginationPreference(props.kind);
  const queryMode = () => getMusicQueryPrefs().mode;

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
          搜索方式
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          onSelect={() => setMusicQueryMode('precise')}
          class="flex items-center gap-2"
        >
          <MenuRadioIndicator selected={queryMode() === 'precise'} />
          <span>精准搜索</span>
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          onSelect={() => setMusicQueryMode('fuzzy')}
          class="flex items-center gap-2"
        >
          <MenuRadioIndicator selected={queryMode() === 'fuzzy'} />
          <span>模糊搜索</span>
        </AppDropdownMenuItem>
        <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
          列表分页方式
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          onSelect={() => {
            setMusicDiscoverPaginationPreference(props.kind, 'scroll');
            void reloadMusicBrowseFirstPage();
          }}
          class="flex items-center gap-2"
        >
          <MenuRadioIndicator selected={preference() === 'scroll'} />
          <span>滚动加载</span>
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          onSelect={() => {
            setMusicDiscoverPaginationPreference(props.kind, 'pagination');
            void reloadMusicBrowseFirstPage();
          }}
          class="flex items-center gap-2"
        >
          <MenuRadioIndicator selected={preference() === 'pagination'} />
          <span>分页加载</span>
        </AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function BrowseScrollFooter(props: { kind: MusicDiscoverKind }) {
  const state = getMusicBrowseState();
  const preference = () => getMusicDiscoverPaginationPreference(props.kind);
  return (
    <Show when={preference() === 'scroll'}>
      <Show when={(state.detail?.tracks.length ?? 0) > 0}>
        <Show when={state.loadingMore}>
          <div class="py-4 text-center text-sm text-muted-foreground">加载中…</div>
        </Show>
        <Show when={!state.loadingMore && !state.detail?.hasMore}>
          <div class="py-4 text-center text-sm text-muted-foreground">没有更多了</div>
        </Show>
      </Show>
    </Show>
  );
}

function BrowsePaginationBar(props: { kind: MusicDiscoverKind }) {
  const state = getMusicBrowseState();
  const preference = () => getMusicDiscoverPaginationPreference(props.kind);
  const pageCount = () => musicBrowsePageCount();

  return (
    <Show
      when={
        preference() === 'pagination' &&
        pageCount() > 1 &&
        (state.detail?.tracks.length ?? 0) > 0
      }
    >
      <div class="flex shrink-0 justify-center py-3">
        <Pagination
          count={pageCount()}
          page={state.detail?.page ?? 1}
          onPageChange={(page) => void goToMusicBrowsePage(page)}
          disabled={state.loading || state.loadingMore}
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

function BrowseListFooter(props: { kind: MusicDiscoverKind }) {
  return (
    <>
      <BrowseScrollFooter kind={props.kind} />
      <BrowsePaginationBar kind={props.kind} />
    </>
  );
}

export const MusicBrowseDetail: Component = () => {
  const state = getMusicBrowseState();
  const detail = () => state.detail;
  const discoverKind = (): MusicDiscoverKind =>
    state.kind === 'album' ? 'album' : 'singer';
  const [coverPreviewOpen, setCoverPreviewOpen] = createSignal(false);
  const [filterKeyword, setFilterKeyword] = createSignal('');
  const [tracksScrollEl, setTracksScrollEl] = createSignal<HTMLDivElement | undefined>();
  let lastTracksScrollTop = 0;

  createEffect<string | undefined>((prevKey) => {
    const d = detail();
    const key = d ? `${d.kind}:${d.id}` : undefined;
    if (prevKey !== undefined && key !== prevKey) setFilterKeyword('');
    return key;
  });

  const filteredTracks = createMemo((): AudioTrack[] => {
    void getMusicQueryPrefs().mode;
    void getMusicQueryPrefs().scopes.join(',');
    const tracks = detail()?.tracks ?? [];
    const kw = filterKeyword().trim();
    if (!kw) return tracks as AudioTrack[];
    return filterTracksByMusicQuery(tracks as AudioTrack[], kw);
  });

  const title = () => {
    const d = detail();
    if (!d) return state.loading ? '加载中…' : '详情';
    return d.name.trim() || (d.kind === 'album' ? '专辑详情' : '歌手详情');
  };

  /** 对齐歌单详情：标题旁副文案为作者/曲目数，不塞「歌手 · N 首」当标题 */
  const metaLine = () => {
    const d = detail();
    if (!d) return '';
    const count = d.total && d.total > 0 ? d.total : d.tracks.length;
    const countLabel = count > 0 ? `${count} 首` : '';
    if (d.kind === 'album') {
      return [d.subtitle, countLabel].filter(Boolean).join(' · ');
    }
    return countLabel;
  };

  createEffect(() => {
    const d = detail();
    const page = d?.page ?? 1;
    const pref = getMusicDiscoverPaginationPreference(discoverKind());
    const el = tracksScrollEl();
    if (!d || !el) return;
    if (pref === 'scroll' && page > 1) return;
    void page;
    const reduceMotion = settingsStore.state.app.reduceMotion;
    requestAnimationFrame(() => {
      scrollToTop(el, { reduceMotion });
    });
  });

  const handleTracksScroll = (el: HTMLDivElement) => {
    const top = el.scrollTop;
    const moved = top !== lastTracksScrollTop;
    lastTracksScrollTop = top;
    if (getMusicDiscoverPaginationPreference(discoverKind()) !== 'scroll') return;
    if (!moved || state.loadingMore || !detail()?.hasMore) return;
    const distanceToBottom = el.scrollHeight - top - el.clientHeight;
    if (distanceToBottom < 120) {
      void loadMoreMusicBrowse();
    }
  };

  return (
    <>
      <MusicHubPageShell
        section={state.kind === 'album' ? 'album' : 'artist'}
        title={title()}
        description={metaLine() || (state.kind === 'album' ? '专辑详情' : '歌手详情')}
        leading={<SettingsToolbarLeading onBack={() => closeMusicBrowse()} />}
        scrollClass="overflow-hidden"
        toolbar={
          <Show when={detail()}>
            {(d) => (
              <>
                <ExpandableIconSearch
                  value={filterKeyword()}
                  onValueChange={setFilterKeyword}
                  placeholder="筛选当前列表…"
                  tooltip="搜索当前列表"
                  aria-label="当前列表搜索"
                />
                <AppTooltip>
                  <AppTooltipTrigger
                    as={Button}
                    variant="ghost"
                    size="icon"
                    class="h-9 w-9 shrink-0"
                    onClick={() =>
                      void playAsTemp(d().tracks, 0, {
                        listName: d().name,
                        listKind: 'temporary',
                      })
                    }
                    disabled={d().tracks.length === 0}
                  >
                    <PlayIcon class="h-4 w-4" />
                    <span class="sr-only">播放全部</span>
                  </AppTooltipTrigger>
                  <AppTooltipContent>播放全部</AppTooltipContent>
                </AppTooltip>
                <AppTooltip>
                  <AppTooltipTrigger
                    as={Button}
                    variant="ghost"
                    size="icon"
                    class="h-9 w-9 shrink-0"
                    disabled={d().tracks.length === 0}
                    onClick={() =>
                      void addTracksToPlaylist(BUILTIN_PLAYLIST_IDS.DEFAULT, d().tracks)
                    }
                  >
                    <PlusIcon class="h-4 w-4" />
                    <span class="sr-only">添加到列表</span>
                  </AppTooltipTrigger>
                  <AppTooltipContent>添加到列表</AppTooltipContent>
                </AppTooltip>
                <BrowseMoreMenu kind={discoverKind()} />
              </>
            )}
          </Show>
        }
      >
        <div
          class={cn(
            'flex min-h-0 flex-1 flex-col overflow-hidden',
            musicHubPageContentInsetClass,
          )}
        >
          <Show when={detail()}>
            {(d) => (
              <>
                <div class="flex shrink-0 gap-3 border-b py-3">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={!d().coverUrl?.trim()}
                    onClick={() => {
                      if (d().coverUrl?.trim()) setCoverPreviewOpen(true);
                    }}
                    class={cn(
                      'relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted p-0 shadow-sm',
                      d().coverUrl?.trim() &&
                        'cursor-zoom-in transition-transform hover:scale-[1.02]',
                    )}
                    aria-label={d().coverUrl?.trim() ? '查看封面大图' : undefined}
                  >
                    <Show
                      when={d().coverUrl?.trim()}
                      fallback={
                        <div class="flex h-full w-full items-center justify-center text-muted-foreground">
                          <Music2 class="h-8 w-8 opacity-40" />
                        </div>
                      }
                    >
                      <MusicCoverImg
                        src={d().coverUrl}
                        alt={d().name}
                        class="h-full w-full object-cover"
                        loading="lazy"
                        draggable={false}
                      />
                    </Show>
                  </Button>
                  <div class="min-w-0 flex-1">
                    <Show when={d().subtitle?.trim()}>
                      <p class="truncate text-sm text-muted-foreground">{d().subtitle}</p>
                    </Show>
                    <Show
                      when={d().intro?.trim()}
                      fallback={
                        <p class="mt-1 text-xs text-muted-foreground/70">暂无简介</p>
                      }
                    >
                      <AppTooltip>
                        <AppTooltipTrigger
                          as="p"
                          class="mt-1 line-clamp-3 cursor-default text-left text-xs leading-snug text-muted-foreground"
                        >
                          {d().intro}
                        </AppTooltipTrigger>
                        <AppTooltipContent class="max-w-sm whitespace-pre-wrap">
                          {d().intro}
                        </AppTooltipContent>
                      </AppTooltip>
                    </Show>
                  </div>
                </div>

                <Show when={state.loading && d().tracks.length === 0}>
                  <MusicTrackListSkeleton class="min-h-0 flex-1 overflow-hidden" />
                </Show>

                <Show
                  when={d().tracks.length > 0}
                  fallback={
                    <Show when={!state.loading && !state.loadingMore}>
                      <p class="py-12 text-center text-sm text-muted-foreground">暂无歌曲</p>
                    </Show>
                  }
                >
                  <Show
                    when={filteredTracks().length > 0}
                    fallback={
                      <p class="py-12 text-center text-sm text-muted-foreground">无匹配曲目</p>
                    }
                  >
                    <MusicOnlineTrackList
                      class="min-h-0 flex-1"
                      listInnerClass="px-0"
                      tracks={filteredTracks}
                      showAlbum={d().kind !== 'album'}
                      origin="list"
                      onPlay={(tracks, index) =>
                        void playAsTemp(tracks, index, {
                          listName: d().name,
                          listKind: 'temporary',
                        })
                      }
                      contentRevision={() =>
                        `${d().kind}:${d().id}:${d().page ?? 1}:${d().tracks.length}:${filteredTracks().length}:${filterKeyword()}:${getMusicQueryPrefs().mode}:${getMusicDiscoverPaginationPreference(discoverKind())}`
                      }
                      onScroll={handleTracksScroll}
                      onScrollContainer={setTracksScrollEl}
                      scrollFooter={<BrowseListFooter kind={discoverKind()} />}
                    />
                  </Show>
                </Show>
              </>
            )}
          </Show>

          <Show when={state.loading && !detail()}>
            <MusicTrackListSkeleton class="min-h-0 flex-1 overflow-hidden" />
          </Show>
        </div>
      </MusicHubPageShell>

      <Show when={detail()?.coverUrl}>
        <BookCoverPreviewDialog
          open={coverPreviewOpen()}
          onOpenChange={setCoverPreviewOpen}
          coverUrl={detail()!.coverUrl}
          bookUrl={detail()!.coverUrl ?? ''}
          name={detail()!.name}
        />
      </Show>
    </>
  );
};
