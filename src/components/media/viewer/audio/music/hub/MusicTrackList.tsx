/**
 * 列表右栏：曲目列表（多选 + 拖拽排序）
 */

import type { Id } from '@thisbeyond/solid-dnd';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
  Show,
  type Component,
} from 'solid-js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { PlayIcon } from '@/components/shared/icons';
import {
  getGroupTracksCacheRevision,
  getTracksForGroupId,
  peekGroupTracksCache,
  removeTrackFromPlaylist,
  reorderGroupTracks,
  setGroupTracksCache,
} from '@/lib/database/audio-library';
import { getGroupById } from '@/lib/database/media-groups';
import { playByListId, playPlaylist } from '@/stores/viewer/media/audio';
import { viewerStore } from '@/stores/viewer';
import { MediaGroupId } from '@/types/book-group';
import { cn } from '@/lib/utils';
import { invalidateLocalMusicSearchCache } from '@/lib/media/audio/music-local-search';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import {
  trackAlbumName,
  trackBadgeToneClass,
  trackSourceBadgeLabel,
} from '@/lib/media/audio/music-search-result-ui';
import { MusicHubQuickScroll } from '@/components/media/viewer/audio/music/hub/MusicHubQuickScroll';
import { MusicTrackContextMenu } from '@/components/media/viewer/audio/music/hub/MusicTrackContextMenu';
import { MusicTrackListSkeleton } from '@/components/media/viewer/audio/music/hub/MusicHubSkeletons';
import { shouldAcceptListPlayGesture } from '@/components/media/viewer/audio/music/hub/list-track-play-gesture';
import { VirtualList } from '@/components/shared/virtual-list/VirtualList';
import { useVirtualListSortableRow } from '@/components/shared/virtual-list/VirtualListSortableRow';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import {
  getMusicSettings,
  getMusicListScrollPosition,
  setMusicListScrollPosition,
  subscribeMusicSettings,
  type MusicSettings,
} from '@/lib/media/audio/music-settings';
import {
  MUSIC_DESKTOP_TRACK_CELL_CLASS,
  MUSIC_DESKTOP_TRACK_GRID_CLASS,
  MUSIC_DESKTOP_TRACK_ICON_CELL_CLASS,
  MUSIC_DESKTOP_TRACK_LIST_MIN_WIDTH_CLASS,
  musicLibraryDesktopTrackGridTemplate,
} from '@/lib/media/audio/music-desktop-track-cols';

export interface MusicTrackListProps {
  active?: boolean;
  class?: string;
  reorderEnabled?: boolean;
  /** 外部导入/去重后递增以刷新 */
  tracksRevision?: number;
  /** 曲目增删改序后刷新当前列表（不要触发侧栏整表重建） */
  onTracksChanged?: () => void;
  /** 仅歌单建删改名/侧栏排序时使用 */
  onListsChanged?: () => void;
}

function desktopLibraryTrackGridStyle(settings: MusicSettings): { 'grid-template-columns': string } {
  return {
    'grid-template-columns': musicLibraryDesktopTrackGridTemplate({
      showAlbum: settings.listShowAlbum,
      showDuration: settings.listShowDuration,
    }),
  };
}

function DesktopTrackHeader(props: {
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  settings: MusicSettings;
}) {
  const colOpts = () => ({
    showAlbum: props.settings.listShowAlbum,
    showDuration: props.settings.listShowDuration,
  });
  return (
    <div
      class={cn(
        MUSIC_DESKTOP_TRACK_GRID_CLASS,
        'sticky top-0 z-10 h-10 shrink-0 border-b border-border/50 bg-background text-xs font-medium text-muted-foreground',
      )}
      style={desktopLibraryTrackGridStyle(props.settings)}
    >
      <span
        data-track-chrome
        class={MUSIC_DESKTOP_TRACK_ICON_CELL_CLASS}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Checkbox
          id="music-track-select-all-input"
          checked={props.allSelected}
          indeterminate={props.someSelected && !props.allSelected}
          onChange={props.onToggleAll}
        />
        <Label class="sr-only" for="music-track-select-all-input">
          {props.allSelected ? '取消全选' : '全选歌曲'}
        </Label>
      </span>
      <span class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'tabular-nums')}>#</span>
      <span class={MUSIC_DESKTOP_TRACK_CELL_CLASS}>歌曲名</span>
      <span class={MUSIC_DESKTOP_TRACK_CELL_CLASS}>艺术家</span>
      <Show when={colOpts().showAlbum}>
        <span class={MUSIC_DESKTOP_TRACK_CELL_CLASS}>专辑名</span>
      </Show>
      <Show when={colOpts().showDuration}>
        <span class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'tabular-nums')}>时长</span>
      </Show>
    </div>
  );
}

function SourceBadge(props: { track: AudioTrack }) {
  return (
    <Badge variant="outline" class={trackBadgeToneClass('source')}>
      {trackSourceBadgeLabel(props.track)}
    </Badge>
  );
}

function CacheTierBadge(props: { track: AudioTrack }) {
  const tier = () => {
    const value = props.track.meta.cacheTier;
    return value === 'manual' || value === 'auto' ? value : null;
  };
  return (
    <Show when={tier()}>
      {(t) => (
        <Badge variant="outline" class="shrink-0 text-[10px]">
          {t() === 'manual' ? '已下载' : '已缓存'}
        </Badge>
      )}
    </Show>
  );
}

function SortableTrackRow(props: {
  track: AudioTrack;
  index: number;
  list: AudioTrack[];
  playlistId: string | null;
  selected: boolean;
  selectedTracks: AudioTrack[];
  mobile: boolean;
  reorderEnabled: boolean;
  reorderBusy: boolean;
  settings: MusicSettings;
  onToggleSelect: () => void;
  onPlay: () => void;
  onChanged: () => void;
}) {
  const sortable = useVirtualListSortableRow();
  const isDragging = () => sortable?.isDragging() ?? false;
  let dragged = false;
  let suppressPlayUntil = 0;
  createEffect(() => {
    if (sortable?.isActiveDraggable()) {
      dragged = true;
      return;
    }
    if (dragged) {
      dragged = false;
      suppressPlayUntil = performance.now() + 350;
    }
  });
  const handlePlay = (doubleClick = false) => {
    if (
      !shouldAcceptListPlayGesture(doubleClick, {
        isMobileLayout: props.mobile,
        listDoubleClickToPlay: props.settings.listDoubleClickToPlay,
      })
    ) {
      return;
    }
    if (
      props.reorderBusy ||
      sortable?.isActiveDraggable() ||
      performance.now() < suppressPlayUntil
    ) {
      return;
    }
    props.onPlay();
  };
  const isCurrent = () => {
    const current = viewerStore.state.trackQueue[viewerStore.state.trackIndex];
    return current?.id === props.track.id && current.source === props.track.source;
  };
  const subtitle = () => {
    const artist = props.track.artist?.trim();
    const album = props.settings.listShowAlbum ? trackAlbumName(props.track).trim() : '';
    if (artist && album) return `${artist} · ${album}`;
    return artist || album;
  };
  const trackSelectInputId = () =>
    `music-track-select-${props.track.source}-${props.track.id}-input`;

  return (
    <li
      aria-current={isCurrent() ? 'true' : undefined}
      class={cn(
        'list-none border-b border-border/40',
        isCurrent() && 'bg-primary/5',
        props.selected && 'bg-primary/10',
      )}
    >
      <MusicTrackContextMenu
        track={props.track}
        tracks={props.list}
        selectedTracks={props.selectedTracks}
        index={props.index}
        variant="library"
        playlistId={props.playlistId}
        origin="list"
        onChanged={props.onChanged}
        showActionButton={props.mobile || props.settings.listActionButtonsVisible}
      >
        <Show
          when={props.mobile}
          fallback={
            <div
              class={cn(
                MUSIC_DESKTOP_TRACK_GRID_CLASS,
                'h-11 cursor-pointer text-xs hover:bg-muted/50 sm:text-sm',
                props.reorderEnabled && 'cursor-grab active:cursor-grabbing',
                sortable?.isActiveDraggable() && 'z-10 bg-background shadow-sm',
                isDragging() && 'transition-transform duration-200 ease-out',
              )}
              style={desktopLibraryTrackGridStyle(props.settings)}
              onClick={(event: MouseEvent) => {
                if ((event.target as Element | null)?.closest?.('[data-track-chrome]')) return;
                handlePlay(false);
              }}
              onDblClick={(event: MouseEvent) => {
                if ((event.target as Element | null)?.closest?.('[data-track-chrome]')) return;
                handlePlay(true);
              }}
            >
              <span
                data-track-chrome
                class={MUSIC_DESKTOP_TRACK_ICON_CELL_CLASS}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <Checkbox
                  id={trackSelectInputId()}
                  checked={props.selected}
                  onChange={() => props.onToggleSelect()}
                />
                <Label class="sr-only" for={trackSelectInputId()}>
                  选择 {props.track.name}
                </Label>
              </span>
              <span
                class={cn(
                  MUSIC_DESKTOP_TRACK_CELL_CLASS,
                  'flex items-center tabular-nums text-muted-foreground',
                  isCurrent() && 'text-primary',
                )}
              >
                <Show when={isCurrent()} fallback={props.index + 1}>
                  <PlayIcon class="h-3.5 w-3.5" />
                </Show>
              </span>
              <span class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'flex items-center gap-1.5')}>
                <span class={cn('min-w-0 truncate', isCurrent() && 'text-primary')}>
                  {props.track.name}
                </span>
                <Show when={props.settings.listShowSource}>
                  <SourceBadge track={props.track} />
                </Show>
                <CacheTierBadge track={props.track} />
              </span>
              <span class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'truncate text-muted-foreground')}>
                {props.track.artist}
              </span>
              <Show when={props.settings.listShowAlbum}>
                <span class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'truncate text-muted-foreground')}>
                  {trackAlbumName(props.track)}
                </span>
              </Show>
              <Show when={props.settings.listShowDuration}>
                <span
                  class={cn(
                    MUSIC_DESKTOP_TRACK_CELL_CLASS,
                    'truncate tabular-nums text-muted-foreground',
                  )}
                >
                  {props.track.duration || '--:--'}
                </span>
              </Show>
            </div>
          }
        >
          <div
            class={cn(
              'flex min-h-14 w-full items-center py-0 pl-1 pr-11 hover:bg-muted/50',
              props.reorderEnabled && 'cursor-grab active:cursor-grabbing',
              sortable?.isActiveDraggable() && 'z-10 bg-background shadow-sm',
              isDragging() && 'transition-transform duration-200 ease-out',
            )}
          >
            <span
              data-track-chrome
              class="flex w-7 shrink-0 justify-center"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Checkbox
                id={trackSelectInputId()}
                checked={props.selected}
                onChange={() => props.onToggleSelect()}
              />
              <Label class="sr-only" for={trackSelectInputId()}>
                选择 {props.track.name}
              </Label>
            </span>
            <Button
              type="button"
              variant="ghost"
              class="h-full min-w-0 flex-1 justify-start gap-2 rounded-none px-1 font-normal"
              onClick={() => handlePlay(false)}
              onDblClick={() => handlePlay(true)}
            >
              <span
                class={cn(
                  'w-8 shrink-0 text-left text-xs tabular-nums text-muted-foreground',
                  isCurrent() && 'text-primary',
                )}
              >
                <Show when={isCurrent()} fallback={props.index + 1}>
                  <PlayIcon class="h-3.5 w-3.5" />
                </Show>
              </span>
              <span class="min-w-0 flex-1 overflow-hidden text-left">
                <span class="flex min-w-0 items-center gap-1.5">
                  <span class={cn('min-w-0 truncate text-sm', isCurrent() && 'text-primary')}>
                    {props.track.name}
                  </span>
                  <Show when={props.settings.listShowSource}>
                    <SourceBadge track={props.track} />
                  </Show>
                  <CacheTierBadge track={props.track} />
                </span>
                <Show when={subtitle()}>
                  <span class="block truncate text-xs text-muted-foreground">
                    {subtitle()}
                  </span>
                </Show>
              </span>
              <Show when={props.settings.listShowDuration}>
                <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {props.track.duration || '--:--'}
                </span>
              </Show>
            </Button>
          </div>
        </Show>
      </MusicTrackContextMenu>
    </li>
  );
}

export const MusicTrackList: Component<MusicTrackListProps> = (props) => {
  const shell = useShellLayout();
  const isMobileLayout = () => shell().useMobileShell;
  const [settings, setSettings] = createSignal(getMusicSettings());
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const groupId = () => viewerStore.state.activeMusicGroupId ?? MediaGroupId.MusicLocal;

  const [tracks, { mutate, refetch }] = createResource(
    () => ({
      id: groupId(),
      active: props.active !== false,
      rev: props.tracksRevision ?? 0,
    }),
    (key) => (key.active ? getTracksForGroupId(key.id) : Promise.resolve([])),
  );

  const [group] = createResource(groupId, getGroupById);
  /** 优先用 store 同步的 playlistId，避免 group resource 未刷新时打到上一列表 */
  const playlistId = () => {
    if (groupId() === MediaGroupId.Favorite) return 'love';
    return viewerStore.state.activePlaylistId ?? group()?.listId ?? null;
  };

  onMount(() => {
    const unsubscribe = subscribeMusicSettings(setSettings);
    onCleanup(unsubscribe);
  });

  createEffect(() => {
    void groupId();
    setSelected(new Set<string>());
  });

  const reloadTracks = () => {
    invalidateLocalMusicSearchCache();
    void refetch();
  };

  const handleListChanged = () => {
    reloadTracks();
    props.onTracksChanged?.();
  };

  const removeSelected = async () => {
    const listId = playlistId();
    if (!listId) return;
    for (const id of selected()) {
      await removeTrackFromPlaylist(listId, id);
    }
    setSelected(new Set<string>());
    void reloadTracks();
  };

  const [reorderBusy, setReorderBusy] = createSignal(false);
  let reorderQueue = Promise.resolve();
  const handleReorder = (ids: Id[]): Promise<void> => {
    const targetGroupId = groupId();
    const orderedIds = ids.map(String);
    const persist = async () => {
      setReorderBusy(true);
      try {
        await reorderGroupTracks(targetGroupId, orderedIds);
        const current =
          peekGroupTracksCache(targetGroupId) ?? tracks() ?? [];
        const byId = new Map(current.map((track) => [track.id, track]));
        const reordered = orderedIds
          .map((id) => byId.get(id))
          .filter((track): track is AudioTrack => track != null);
        if (reordered.length === current.length && groupId() === targetGroupId) {
          // 沿用现有实体引用，仅同步内存顺序；VirtualList 保留现有 DOM，不再查询并重建列表。
          mutate(reordered);
          setGroupTracksCache(targetGroupId, reordered);
        }
        invalidateLocalMusicSearchCache();
      } catch (error) {
        showAppToast({
          title: '排序失败',
          description: toUserFacingMusicError(error),
          variant: 'destructive',
        });
        throw error;
      } finally {
        setReorderBusy(false);
      }
    };
    const result = reorderQueue.then(persist, persist);
    reorderQueue = result.catch(() => undefined);
    return result;
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const listReady = () => {
    void getGroupTracksCacheRevision();
    const id = groupId();
    if (peekGroupTracksCache(id)) return true;
    if (!tracks.loading && tracks.state !== 'unresolved') return true;
    return false;
  };
  const list = (): AudioTrack[] => {
    void getGroupTracksCacheRevision();
    const id = groupId();
    const cached = peekGroupTracksCache(id);
    if (cached) return cached;
    if (!tracks.loading && tracks.state !== 'unresolved') {
      return tracks() ?? [];
    }
    // 加载中绝不回退到上一列表的 resource 值
    return [];
  };
  const sortableIds = createMemo(() =>
    list()
      .filter((t): t is AudioTrack => t != null && typeof t.id === 'string')
      .map((t) => t.id),
  );
  const selectedTracks = createMemo(() =>
    list().filter((track) => track != null && selected().has(track.id)),
  );
  const allSelected = () => list().length > 0 && selected().size === list().length;
  const toggleAll = () => {
    setSelected(allSelected() ? new Set<string>() : new Set(list().map((track) => track.id)));
  };
  const [scrollEl, setScrollEl] = createSignal<HTMLElement | undefined>();
  let restoringScroll = false;
  createEffect(() => {
    const id = String(groupId());
    const el = scrollEl();
    const savePosition = settings().listSaveScrollPosition;
    if (!el || !listReady()) return;
    restoringScroll = true;
    queueMicrotask(() => {
      if (String(groupId()) !== id) {
        restoringScroll = false;
        return;
      }
      el.scrollTop = savePosition ? getMusicListScrollPosition(id) : 0;
      queueMicrotask(() => {
        restoringScroll = false;
      });
    });
  });

  /** 仅「本列表尚无任何快照」时出骨架；空列表已缓存则直接「暂无曲目」 */
  const showBlockingLoading = () => {
    if (peekGroupTracksCache(groupId())) return false;
    if (list().length > 0) return false;
    return tracks.loading || !listReady();
  };
  const delayedSkeleton = useSkeletonLoading(showBlockingLoading, {
    delay: 80,
    minDisplayTime: 120,
  });
  const showTrackSkeleton = () => {
    if (peekGroupTracksCache(groupId())) return false;
    return delayedSkeleton();
  };

  return (
    <div class={cn('relative flex min-h-0 min-w-0 flex-1 flex-col', props.class)}>
      <Show when={selected().size > 0}>
        <div class="flex shrink-0 flex-wrap items-center gap-2 border-b py-2">
          <Button size="sm" variant="outline" onClick={() => void removeSelected()}>
            删除选中 ({selected().size})
          </Button>
        </div>
      </Show>
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
          <Show when={showTrackSkeleton()}>
            <MusicTrackListSkeleton class="min-h-0 flex-1 overflow-hidden" />
          </Show>
          <Show when={listReady() && list().length === 0 && !showTrackSkeleton()}>
            <p class="p-4 text-sm text-muted-foreground">暂无曲目</p>
          </Show>
          {/* keyed：换列表强制 remount；表头放进 scrollHeader，与行共享 scrollbar-gutter */}
          <Show when={listReady() && list().length > 0 && groupId() && !showTrackSkeleton()} keyed>
            {(gid) => (
              <VirtualList<AudioTrack>
                items={list}
                estimateSize={() => (isMobileLayout() ? 56 : 44)}
                overscan={10}
                class="min-h-0 flex-1"
                scrollGutter={isMobileLayout() ? 'auto' : 'both'}
                getItemKey={(track, index) => track?.id ?? `idx:${index}`}
                onScrollContainer={setScrollEl}
                onScroll={(el) => {
                  if (restoringScroll) return;
                  if (!settings().listSaveScrollPosition) return;
                  setMusicListScrollPosition(String(gid), el.scrollTop);
                }}
                remeasureWhen={isMobileLayout}
                scrollHeader={
                  !isMobileLayout() ? (
                    <DesktopTrackHeader
                      allSelected={allSelected()}
                      someSelected={selected().size > 0}
                      onToggleAll={toggleAll}
                      settings={settings()}
                    />
                  ) : undefined
                }
                sortable={{
                  enabled: () => props.reorderEnabled !== false,
                  ids: sortableIds,
                  onReorder: handleReorder,
                  persistOnly: true,
                  dragStyle: {
                    rowClass: 'touch-none',
                    activeClass: 'z-10 bg-background shadow-sm',
                  },
                }}
                renderDragOverlay={(activeId) => {
                  const track = list().find((item) => item.id === String(activeId));
                  return (
                    <div class="rounded-md border bg-background px-3 py-2 text-sm shadow-md">
                      {track?.name ?? '歌曲'}
                    </div>
                  );
                }}
              >
                {(track, index) => (
                  <SortableTrackRow
                    track={track}
                    index={index}
                    list={list()}
                    playlistId={playlistId()}
                    selected={selected().has(track.id)}
                    selectedTracks={selectedTracks()}
                    mobile={isMobileLayout()}
                    reorderEnabled={props.reorderEnabled !== false}
                    reorderBusy={reorderBusy()}
                    settings={settings()}
                    onToggleSelect={() => toggleSelect(track.id)}
                    onPlay={() => {
                      const listId = playlistId();
                      if (listId) {
                        void playByListId(listId, index, {
                          listName: group()?.groupName,
                          listKind: listId.startsWith('pl_') ? 'user' : 'builtin',
                        });
                        return;
                      }
                      void playPlaylist(list(), index, {
                        origin: 'list',
                        listName: group()?.groupName ?? '我的列表',
                        listKind: 'temporary',
                      });
                    }}
                    onChanged={handleListChanged}
                  />
                )}
              </VirtualList>
            )}
          </Show>
        </div>
      </div>
      <MusicHubQuickScroll
        container={scrollEl}
        contentRevision={() => `${groupId()}:${list().length}:${props.tracksRevision ?? 0}`}
      />
    </div>
  );
};
