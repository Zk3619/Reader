/**
 * 音乐搜索结果列表：歌曲 / 歌单（桌面与移动分别对齐 lx-music）
 * 在线结果使用 VirtualList，对齐阅读模块虚拟滚动。
 */

import {
  For,
  Show,
  createEffect,
  createSignal,
  type Accessor,
  type Component,
  type JSX,
} from 'solid-js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationItems,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { VirtualList } from '@/components/shared/virtual-list';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { MusicPlaylistVirtualList } from '@/components/media/viewer/audio/music/hub/MusicPlaylistVirtualList';
import { MusicHubQuickScroll } from '@/components/media/viewer/audio/music/hub/MusicHubQuickScroll';
import { AGGREGATE_SEARCH_SOURCE } from '@/lib/media/audio/online/source-router';
import type { SearchSource } from '@/lib/media/audio/online/source-router';
import type { OnlinePlaylistSummary } from '@/lib/media/audio/music-sdk/types';
import {
  trackAlbumName,
  trackBadgeToneClass,
  trackQualityBadge,
  trackSourceBadgeLabel,
} from '@/lib/media/audio/music-search-result-ui';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import {
  getSearchState,
  goToSearchPage,
  loadMoreSearch,
  searchPageCount,
} from '@/stores/music-hub/search';
import { getMusicSearchUi } from '@/stores/music-hub/music-search-ui';
import { scrollToTop } from '@/lib/ui/scroll-to-top';
import { settingsStore } from '@/stores/settings';
import { musicHubListInsetClass } from '@/lib/media/audio/music-hub-section-meta';
import { MusicTrackContextMenu } from '@/components/media/viewer/audio/music/hub/MusicTrackContextMenu';
import { shouldAcceptListPlayGesture } from '@/components/media/viewer/audio/music/hub/list-track-play-gesture';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { cn } from '@/lib/utils';
import {
  MUSIC_DESKTOP_TRACK_CELL_CLASS,
  MUSIC_DESKTOP_TRACK_GRID_CLASS,
  MUSIC_DESKTOP_TRACK_LIST_MIN_WIDTH_CLASS,
  musicOnlineDesktopTrackGridTemplate,
} from '@/lib/media/audio/music-desktop-track-cols';

const DESKTOP_TRACK_ROW_HEIGHT_PX = 44;
/** 与「我的列表」移动行 min-h-14 一致 */
const MOBILE_TRACK_ROW_HEIGHT_PX = 56;
/** 本地分组内歌曲超过该阈值时启用组内虚拟列表 */
const LOCAL_GROUP_VIRTUALIZE_THRESHOLD = 30;
const LOCAL_GROUP_LIST_MAX_HEIGHT_PX = 360;

function trackRowHeightPx(mobile: boolean) {
  return mobile ? MOBILE_TRACK_ROW_HEIGHT_PX : DESKTOP_TRACK_ROW_HEIGHT_PX;
}

function useOnlineTrackPlayGesture(isMobileLayout: () => boolean) {
  return (doubleClick: boolean, onPlay: () => void) => {
    if (
      !shouldAcceptListPlayGesture(doubleClick, {
        isMobileLayout: isMobileLayout(),
        listDoubleClickToPlay: getMusicSettings().listDoubleClickToPlay,
      })
    ) {
      return;
    }
    onPlay();
  };
}

function SearchScrollFooter() {
  const ui = getMusicSearchUi;
  const state = getSearchState;
  return (
    <Show when={ui().paginationPreference === 'scroll'}>
      <Show when={state().tracks.length > 0 || state().playlists.length > 0}>
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

function SearchListFooter() {
  return (
    <>
      <SearchScrollFooter />
      {/* 对齐 lx：分页条放在虚拟列表 footer 内，避免与 h-full 列表并排裁切末行卡片 */}
      <MusicSearchPaginationBar />
    </>
  );
}

function useSearchScrollLoad() {
  const ui = getMusicSearchUi;
  const state = getSearchState;
  let lastScrollTop = 0;

  const handleScroll = (el: HTMLDivElement) => {
    const top = el.scrollTop;
    const moved = top !== lastScrollTop;
    lastScrollTop = top;
    if (ui().paginationPreference !== 'scroll') return;
    if (!moved || state().loadingMore || !state().hasMore) return;
    const distanceToBottom = el.scrollHeight - top - el.clientHeight;
    if (distanceToBottom < 120) {
      void loadMoreSearch();
    }
  };

  return { handleScroll };
}

/** 分页切页时滚动结果列表回顶（平滑动画，对齐「回到顶部」） */
function useScrollToTopOnPageChange(
  scrollEl: () => HTMLElement | undefined,
) {
  const state = getSearchState;
  const ui = getMusicSearchUi;
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

export function MusicSearchPaginationBar(props: { class?: string }) {
  const state = getSearchState;
  const ui = getMusicSearchUi;
  const pageCount = () => searchPageCount();

  return (
    <Show
      when={
        ui().paginationPreference === 'pagination' &&
        pageCount() > 1 &&
        (state().tab === 'song' ? state().tracks.length > 0 : state().playlists.length > 0)
      }
    >
      <div class={cn('flex shrink-0 justify-center py-3', props.class)}>
        <Pagination
          count={pageCount()}
          page={state().page}
          onPageChange={(page) => void goToSearchPage(page)}
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


function trackItemKey(track: AudioTrack, index: number) {
  return `${track.source}|${track.id}|${index}`;
}

function TrackBadges(props: {
  track: AudioTrack;
  showSource: boolean;
  mobile?: boolean;
}) {
  const quality = () => trackQualityBadge(props.track);
  return (
    <>
      <Show when={quality()}>
        {(badge) => (
          <Badge
            variant="outline"
            class={cn(trackBadgeToneClass(badge().tone), 'shrink-0 whitespace-nowrap')}
          >
            {badge().label}
          </Badge>
        )}
      </Show>
      <Show when={props.showSource}>
        <Badge
          variant="outline"
          class={cn(trackBadgeToneClass('source'), 'shrink-0 whitespace-nowrap')}
        >
          {trackSourceBadgeLabel(props.track)}
        </Badge>
      </Show>
    </>
  );
}

/** 桌面扁平歌曲列：表头与行共用，保证对齐 */
const DESKTOP_TRACK_GRID_STYLE = {
  'grid-template-columns': musicOnlineDesktopTrackGridTemplate(),
} as const;

function DesktopTrackHeaderRow() {
  return (
    <div
      class={cn(
        MUSIC_DESKTOP_TRACK_GRID_CLASS,
        'h-10 shrink-0 text-xs font-medium text-muted-foreground',
      )}
      style={DESKTOP_TRACK_GRID_STYLE}
    >
      <span class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'tabular-nums')}>#</span>
      <span class={MUSIC_DESKTOP_TRACK_CELL_CLASS}>歌曲名</span>
      <span class={MUSIC_DESKTOP_TRACK_CELL_CLASS}>艺术家</span>
      <span class={MUSIC_DESKTOP_TRACK_CELL_CLASS}>专辑名</span>
      <span class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'tabular-nums')}>时长</span>
    </div>
  );
}

function DesktopTrackHeader() {
  return (
    <div class="sticky top-0 z-10 shrink-0 border-b border-border/50 bg-background">
      <DesktopTrackHeaderRow />
    </div>
  );
}

function DesktopTrackRow(props: {
  track: AudioTrack;
  index: number;
  tracks: AudioTrack[];
  showSource: boolean;
  origin?: 'search' | 'list';
  onPlay: () => void;
}) {
  const shell = useShellLayout();
  const acceptPlay = useOnlineTrackPlayGesture(() => shell().useMobileShell);
  return (
    <MusicTrackContextMenu
      track={props.track}
      tracks={props.tracks}
      index={props.index}
      variant="online"
      origin={props.origin ?? 'search'}
    >
      {/* 勿用 button 做 grid：Chromium/WebView 常忽略 button 的 display:grid，表头/列会对不齐 */}
      <div
        role="button"
        tabindex={0}
        class={cn(
          MUSIC_DESKTOP_TRACK_GRID_CLASS,
          'h-full cursor-pointer border-b border-border/40 text-xs hover:bg-muted/50 sm:text-sm',
        )}
        style={DESKTOP_TRACK_GRID_STYLE}
        onClick={() => acceptPlay(false, props.onPlay)}
        onDblClick={() => acceptPlay(true, props.onPlay)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            acceptPlay(false, props.onPlay);
          }
        }}
      >
        <span class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'tabular-nums text-muted-foreground')}>
          {props.index + 1}
        </span>
        <span class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'flex items-center gap-1.5')}>
          <span class="min-w-0 truncate">{props.track.name}</span>
          <TrackBadges track={props.track} showSource={props.showSource} />
        </span>
        <span class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'truncate text-muted-foreground')}>
          {props.track.artist}
        </span>
        <span class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'truncate text-muted-foreground')}>
          {trackAlbumName(props.track)}
        </span>
        <span
          class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'truncate tabular-nums text-muted-foreground')}
        >
          {props.track.duration || '--:--'}
        </span>
      </div>
    </MusicTrackContextMenu>
  );
}

function MobileTrackRow(props: {
  track: AudioTrack;
  index: number;
  tracks: AudioTrack[];
  showSource: boolean;
  origin?: 'search' | 'list';
  onPlay: () => void;
}) {
  const shell = useShellLayout();
  const acceptPlay = useOnlineTrackPlayGesture(() => shell().useMobileShell);
  const album = () => trackAlbumName(props.track);
  const subtitle = () => {
    const artist = props.track.artist?.trim();
    const albumName = album().trim();
    if (artist && albumName) return `${artist} · ${albumName}`;
    return artist || albumName || '';
  };

  return (
    <MusicTrackContextMenu
      track={props.track}
      tracks={props.tracks}
      index={props.index}
      variant="online"
      origin={props.origin ?? 'search'}
    >
      <div class="h-full border-b border-border/40">
        <Button
          type="button"
          variant="ghost"
          class="h-full min-h-14 w-full justify-start gap-2 rounded-none px-3 py-0 font-normal hover:bg-muted/50"
          onClick={() => acceptPlay(false, props.onPlay)}
          onDblClick={() => acceptPlay(true, props.onPlay)}
        >
          <span class="w-9 shrink-0 text-left text-xs tabular-nums text-muted-foreground">
            {props.index + 1}
          </span>
          <span class="min-w-0 flex-1 overflow-hidden text-left">
            <span class="flex min-w-0 items-center gap-1">
              <span class="min-w-0 truncate text-sm">{props.track.name}</span>
              <TrackBadges track={props.track} showSource={props.showSource} mobile />
            </span>
            <Show when={subtitle()}>
              <p class="truncate text-xs text-muted-foreground">{subtitle()}</p>
            </Show>
          </span>
          <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
            {props.track.duration || '--:--'}
          </span>
        </Button>
      </div>
    </MusicTrackContextMenu>
  );
}

function TrackListRows(props: {
  tracks: AudioTrack[];
  showSource: boolean;
  mobile: boolean;
  onPlay: (tracks: AudioTrack[], index: number) => void;
}) {
  return (
    <For each={props.tracks}>
      {(track, index) => (
        <Show
          when={props.mobile}
          fallback={
            <DesktopTrackRow
              track={track}
              index={index()}
              tracks={props.tracks}
              showSource={props.showSource}
              onPlay={() => props.onPlay(props.tracks, index())}
            />
          }
        >
          <MobileTrackRow
            track={track}
            index={index()}
            tracks={props.tracks}
            showSource={props.showSource}
            onPlay={() => props.onPlay(props.tracks, index())}
          />
        </Show>
      )}
    </For>
  );
}

export interface MusicOnlineTrackListProps {
  tracks: Accessor<readonly AudioTrack[]> | readonly AudioTrack[];
  onPlay: (tracks: AudioTrack[], index: number) => void;
  showSource?: boolean;
  /** 右键菜单播放来源标记 */
  origin?: 'search' | 'list';
  class?: string;
  /** 覆盖默认列表水平留白（外层已有页级 inset 时用 px-0） */
  listInnerClass?: string;
  scrollFooter?: JSX.Element;
  contentRevision?: Accessor<unknown>;
  enableQuickScroll?: boolean;
  onScroll?: (el: HTMLDivElement) => void;
  onScrollContainer?: (el: HTMLDivElement | undefined) => void;
}

/** 在线歌曲虚拟列表（搜索 / 歌单详情等共用，对齐 lx 桌面列与移动双行） */
export const MusicOnlineTrackList: Component<MusicOnlineTrackListProps> = (props) => {
  const shell = useShellLayout();
  const isMobileLayout = () => shell().useMobileShell;
  const items = () =>
    (typeof props.tracks === 'function' ? props.tracks() : props.tracks) as AudioTrack[];
  const remeasureLayout = () => `${isMobileLayout()}|${shell().windowWidth}`;
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement | undefined>();

  const setScrollContainer = (el: HTMLDivElement | undefined) => {
    setScrollEl(el);
    props.onScrollContainer?.(el);
  };

  return (
    <div class={cn('relative flex min-h-0 flex-1 flex-col', props.class)}>
      <div
        class={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col',
          !isMobileLayout() && 'overflow-x-auto',
        )}
      >
        <div
          class={cn(
            'flex min-h-0 w-full flex-1 flex-col',
            !isMobileLayout() && MUSIC_DESKTOP_TRACK_LIST_MIN_WIDTH_CLASS,
          )}
        >
          <VirtualList<AudioTrack>
            class="min-h-0 flex-1"
            listInnerClass={props.listInnerClass ?? musicHubListInsetClass}
            scrollGutter={isMobileLayout() ? 'auto' : 'both'}
            items={items}
            estimateSize={() => trackRowHeightPx(isMobileLayout())}
            remeasureWhen={remeasureLayout}
            overscan={8}
            getItemKey={trackItemKey}
            onScrollContainer={setScrollContainer}
            onScroll={props.onScroll}
            scrollHeader={!isMobileLayout() ? <DesktopTrackHeader /> : undefined}
            scrollFooter={props.scrollFooter}
          >
            {(track, index) => (
              <Show
                when={isMobileLayout()}
                fallback={
                  <DesktopTrackRow
                    track={track}
                    index={index}
                    tracks={items()}
                    showSource={props.showSource === true}
                    origin={props.origin}
                    onPlay={() => props.onPlay(items(), index)}
                  />
                }
              >
                <MobileTrackRow
                  track={track}
                  index={index}
                  tracks={items()}
                  showSource={props.showSource === true}
                  origin={props.origin}
                  onPlay={() => props.onPlay(items(), index)}
                />
              </Show>
            )}
          </VirtualList>
        </div>
      </div>
      <Show when={props.enableQuickScroll !== false}>
        <MusicHubQuickScroll
          container={scrollEl}
          contentRevision={
            props.contentRevision ?? (() => items().length)
          }
        />
      </Show>
    </div>
  );
};

export interface MusicSearchTrackListProps {
  tracks: AudioTrack[];
  source: SearchSource;
  onPlay: (tracks: AudioTrack[], index: number) => void;
  class?: string;
}

export const MusicSearchTrackList: Component<MusicSearchTrackListProps> = (props) => {
  const { handleScroll } = useSearchScrollLoad();
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement | undefined>();
  useScrollToTopOnPageChange(scrollEl);

  return (
    <MusicOnlineTrackList
      class={props.class}
      tracks={() => props.tracks}
      showSource={props.source === AGGREGATE_SEARCH_SOURCE}
      onPlay={props.onPlay}
      onScroll={handleScroll}
      onScrollContainer={setScrollEl}
      scrollFooter={<SearchListFooter />}
      contentRevision={() =>
        `${props.tracks.length}:${getSearchState().page}:${getMusicSearchUi().paginationPreference}`
      }
    />
  );
};

/** @deprecated 使用 MusicSearchTrackList */
export const MusicSearchOnlineList = MusicSearchTrackList;

export interface MusicSearchPlaylistListProps {
  playlists: OnlinePlaylistSummary[];
  source: SearchSource;
  onOpen: (playlist: OnlinePlaylistSummary) => void;
  class?: string;
}

export const MusicSearchPlaylistList: Component<MusicSearchPlaylistListProps> = (props) => {
  const showSource = () => props.source === AGGREGATE_SEARCH_SOURCE;
  const { handleScroll } = useSearchScrollLoad();
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement | undefined>();
  useScrollToTopOnPageChange(scrollEl);

  return (
    <div class={cn('relative flex min-h-0 flex-1 flex-col', props.class)}>
      <MusicPlaylistVirtualList
        class="min-h-0 flex-1 my-2"
        listInnerClass={cn(musicHubListInsetClass, 'pb-4 pt-1')}
        playlists={() => props.playlists}
        showSource={showSource()}
        onOpen={props.onOpen}
        onScrollContainer={setScrollEl}
        onScroll={handleScroll}
        scrollFooter={<SearchListFooter />}
      />
      <MusicHubQuickScroll
        container={scrollEl}
        contentRevision={() =>
          `${props.playlists.length}:${getSearchState().page}:${getMusicSearchUi().paginationPreference}`
        }
      />
    </div>
  );
};

export interface MusicSearchLocalGroupListProps {
  groups: import('@/lib/media/audio/music-local-search').LocalMusicSearchGroup[];
  source?: SearchSource;
  onPlay: (tracks: AudioTrack[], index: number) => void;
  class?: string;
}

export const MusicSearchLocalGroupList: Component<MusicSearchLocalGroupListProps> = (props) => {
  const shell = useShellLayout();
  const isMobileLayout = () => shell().useMobileShell;
  const showSource = () => props.source === AGGREGATE_SEARCH_SOURCE;
  const rowHeight = () => trackRowHeightPx(isMobileLayout());
  const remeasureLayout = () => `${isMobileLayout()}|${shell().windowWidth}`;

  const groupListHeightPx = (trackCount: number) =>
    Math.min(trackCount * rowHeight(), LOCAL_GROUP_LIST_MAX_HEIGHT_PX);

  return (
    <div class={cn('space-y-4', props.class)}>
      <For each={props.groups}>
        {(group) => (
          <section>
            <h3 class="mb-2 text-xs font-medium text-muted-foreground">{group.groupName}</h3>
            <div class={cn('overflow-hidden', !isMobileLayout() && 'rounded-lg border')}>
              <Show
                when={group.tracks.length > LOCAL_GROUP_VIRTUALIZE_THRESHOLD}
                fallback={
                  <div>
                    <Show when={!isMobileLayout()}>
                      <div class="border-b bg-muted/30">
                        <DesktopTrackHeaderRow />
                      </div>
                    </Show>
                    <div class="divide-y">
                      <TrackListRows
                        tracks={group.tracks}
                        showSource={showSource()}
                        mobile={isMobileLayout()}
                        onPlay={props.onPlay}
                      />
                    </div>
                  </div>
                }
              >
                <div
                  class="min-h-0"
                  style={{ height: `${groupListHeightPx(group.tracks.length)}px` }}
                >
                  <VirtualList<AudioTrack>
                    class="h-full min-h-0"
                    items={() => group.tracks}
                    estimateSize={() => rowHeight()}
                    remeasureWhen={remeasureLayout}
                    overscan={6}
                    getItemKey={trackItemKey}
                    scrollHeader={
                      !isMobileLayout() ? (
                        <div class="sticky top-0 z-10 border-b bg-background">
                          <div class="bg-muted/30">
                            <DesktopTrackHeaderRow />
                          </div>
                        </div>
                      ) : undefined
                    }
                  >
                    {(track, index) => (
                      <Show
                        when={isMobileLayout()}
                        fallback={
                          <DesktopTrackRow
                            track={track}
                            index={index}
                            tracks={group.tracks}
                            showSource={showSource()}
                            onPlay={() => props.onPlay(group.tracks, index)}
                          />
                        }
                      >
                        <MobileTrackRow
                          track={track}
                          index={index}
                          tracks={group.tracks}
                          showSource={showSource()}
                          onPlay={() => props.onPlay(group.tracks, index)}
                        />
                      </Show>
                    )}
                  </VirtualList>
                </div>
              </Show>
            </div>
          </section>
        )}
      </For>
    </div>
  );
};
