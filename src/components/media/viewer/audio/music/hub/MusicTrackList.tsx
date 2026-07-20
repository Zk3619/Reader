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
import { GripVerticalIcon, PlayIcon } from '@/components/shared/icons';
import {
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

export interface MusicTrackListProps {
  active?: boolean;
  class?: string;
  reorderEnabled?: boolean;
  /** 外部导入/去重后递增以刷新 */
  tracksRevision?: number;
  onListsChanged?: () => void;
}

const DESKTOP_TRACK_COLS =
  'grid w-full min-w-0 grid-cols-[2rem_2rem_3.25rem_minmax(0,1fr)_minmax(6rem,22%)_minmax(6rem,24%)_4.5rem] items-center gap-0 px-2 text-left';

function DesktopTrackHeader(props: {
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  settings: MusicSettings;
}) {
  return (
    <div
      class={cn(
        DESKTOP_TRACK_COLS,
        'sticky top-0 z-10 h-10 shrink-0 border-b border-border/50 bg-background text-xs font-medium text-muted-foreground',
      )}
    >
      <span aria-hidden="true" />
      <span class="flex justify-center">
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
      <span class="truncate px-1 tabular-nums">#</span>
      <span class="min-w-0 truncate px-1">歌曲名</span>
      <span class="min-w-0 truncate px-1">艺术家</span>
      <span class="min-w-0 truncate px-1">{props.settings.listShowAlbum ? '专辑名' : ''}</span>
      <span class="min-w-0 truncate px-1">{props.settings.listShowDuration ? '时长' : ''}</span>
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

  const dragHandle = () => (
    <Show when={props.reorderEnabled && sortable}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="h-8 w-8 shrink-0 cursor-grab touch-none text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
        aria-label={`拖拽排序 ${props.track.name}`}
        {...sortable!.dragActivators}
        onClick={(event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <GripVerticalIcon class="h-4 w-4" />
      </Button>
    </Show>
  );

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
                DESKTOP_TRACK_COLS,
                'h-11 text-xs hover:bg-muted/50 sm:text-sm',
                sortable?.isActiveDraggable() && 'z-10 bg-background shadow-sm',
                isDragging() && 'transition-transform duration-200 ease-out',
              )}
            >
              <span class="flex justify-center">{dragHandle()}</span>
              <span class="flex justify-center">
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
                class="col-span-5 grid h-full min-w-0 grid-cols-subgrid items-center rounded-none px-0 font-normal"
                onClick={() => handlePlay(false)}
                onDblClick={() => handlePlay(true)}
              >
                <span
                  class={cn(
                    'truncate px-1 text-left tabular-nums text-muted-foreground',
                    isCurrent() && 'text-primary',
                  )}
                >
                  <Show
                    when={isCurrent()}
                    fallback={props.index + 1}
                  >
                    <PlayIcon class="h-3.5 w-3.5" />
                  </Show>
                </span>
                <span class="flex min-w-0 items-center gap-1.5 px-1 text-left">
                  <span class={cn('min-w-0 truncate', isCurrent() && 'text-primary')}>
                    {props.track.name}
                  </span>
                  <Show when={props.settings.listShowSource}>
                    <SourceBadge track={props.track} />
                  </Show>
                  <CacheTierBadge track={props.track} />
                </span>
                <span class="min-w-0 truncate px-1 text-left text-muted-foreground">
                  {props.track.artist}
                </span>
                <span class="min-w-0 truncate px-1 text-left text-muted-foreground">
                  {props.settings.listShowAlbum ? trackAlbumName(props.track) : ''}
                </span>
                <span class="min-w-0 truncate px-1 text-left tabular-nums text-muted-foreground">
                  {props.settings.listShowDuration ? props.track.duration || '--:--' : ''}
                </span>
              </Button>
            </div>
          }
        >
          <div
            class={cn(
              'flex min-h-[56px] w-full items-center py-0 pl-1 pr-11 hover:bg-muted/50',
              sortable?.isActiveDraggable() && 'z-10 bg-background shadow-sm',
              isDragging() && 'transition-transform duration-200 ease-out',
            )}
          >
            {dragHandle()}
            <span class="flex w-7 shrink-0 justify-center">
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
    props.onListsChanged?.();
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
        const current = tracks() ?? [];
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

  createEffect(() => {
    const id = groupId();
    void tracks.loading;
    void tracks.state;
    const data = tracks();
    if (!tracks.loading && tracks.state !== 'unresolved') {
      setGroupTracksCache(id, data ?? []);
    }
  });

  const listReady = () => {
    const id = groupId();
    if (peekGroupTracksCache(id)) return true;
    if (!tracks.loading && tracks.state !== 'unresolved') return true;
    return false;
  };
  const list = (): AudioTrack[] => {
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
      <Show when={!isMobileLayout() && list().length > 0 && !showTrackSkeleton()}>
        <DesktopTrackHeader
          allSelected={allSelected()}
          someSelected={selected().size > 0}
          onToggleAll={toggleAll}
          settings={settings()}
        />
      </Show>
      <Show when={showTrackSkeleton()}>
        <MusicTrackListSkeleton class="min-h-0 flex-1 overflow-hidden" />
      </Show>
      <Show when={listReady() && list().length === 0 && !showTrackSkeleton()}>
        <p class="p-4 text-sm text-muted-foreground">暂无曲目</p>
      </Show>
      {/* keyed：换列表强制 remount，清掉 persistOnly displayIds / 滚动 / 行实例污染 */}
      <Show when={listReady() && list().length > 0 && groupId() && !showTrackSkeleton()} keyed>
        {(gid) => (
          <VirtualList<AudioTrack>
            items={list}
            estimateSize={() => (isMobileLayout() ? 56 : 44)}
            overscan={10}
            class="min-h-0 flex-1"
            getItemKey={(track, index) => track?.id ?? `idx:${index}`}
            onScrollContainer={setScrollEl}
            onScroll={(el) => {
              if (restoringScroll) return;
              if (!settings().listSaveScrollPosition) return;
              // 使用 keyed 的 gid，避免切列表瞬间把滚动写到错误 key
              setMusicListScrollPosition(String(gid), el.scrollTop);
            }}
            remeasureWhen={isMobileLayout}
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
      <MusicHubQuickScroll
        container={scrollEl}
        contentRevision={() => `${groupId()}:${list().length}:${props.tracksRevision ?? 0}`}
      />
    </div>
  );
};
