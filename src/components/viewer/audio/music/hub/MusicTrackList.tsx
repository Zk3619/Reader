/**
 * 列表右栏：曲目列表（多选 + 拖拽排序）
 */

import {
  closestCenter,
  createSortable,
  DragDropProvider,
  DragDropSensors,
  SortableProvider,
  useDragDropContext,
  useSortableContext,
  type DragEventHandler,
  type Id,
} from '@thisbeyond/solid-dnd';
import { createMemo, createResource, createSignal, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  getTracksForGroupId,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
} from '@/lib/database/audio-library';
import { getGroupById } from '@/lib/database/media-groups';
import { playPlaylist } from '@/stores/viewer/media/audio';
import { viewerStore } from '@/stores/viewer';
import { MediaGroupId } from '@/types/book-group';
import { cn } from '@/lib/utils';
import { invalidateLocalMusicSearchCache } from '@/lib/media/audio/music-local-search';
import { shouldShowBlockingLoading } from '@/lib/media/audio/music-loading-ui';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { MusicHubQuickScroll } from '@/components/viewer/audio/music/hub/MusicHubQuickScroll';
import { MusicTrackContextMenu } from '@/components/viewer/audio/music/hub/MusicTrackContextMenu';

export interface MusicTrackListProps {
  active?: boolean;
  class?: string;
  /** 外部导入/去重后递增以刷新 */
  tracksRevision?: number;
}

function ReorderBridge(props: { onReorder: (ids: Id[]) => void | Promise<void> }) {
  const sortable = useSortableContext();
  const dnd = useDragDropContext();
  if (!sortable || !dnd) return null;

  const [state] = sortable;
  const [, { onDragEnd }] = dnd;

  const handleEnd: DragEventHandler = () => {
    const sorted = [...state.sortedIds];
    const initial = state.initialIds;
    const changed =
      sorted.length !== initial.length || sorted.some((id, i) => id !== initial[i]);
    if (changed) void props.onReorder(sorted);
  };

  onDragEnd(handleEnd);
  return null;
}

function SortableTrackRow(props: {
  track: AudioTrack;
  index: number;
  list: AudioTrack[];
  playlistId: string | null;
  selected: boolean;
  onToggleSelect: () => void;
  onPlay: () => void;
  onChanged: () => void;
}) {
  const sortable = createSortable(props.track.id);
  const ctx = useDragDropContext();
  const isDragging = () => !!ctx?.[0].active.draggable;

  return (
    <li>
      <MusicTrackContextMenu
        track={props.track}
        tracks={props.list}
        index={props.index}
        variant="library"
        playlistId={props.playlistId}
        origin="list"
        onChanged={props.onChanged}
      >
        <div
          ref={sortable}
          class={cn(
            'flex items-center gap-2 py-2.5 hover:bg-muted/40',
            sortable.isActiveDraggable && 'z-10 bg-background shadow-sm',
            isDragging() && 'transition-transform duration-200 ease-out',
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-8 w-8 shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
            aria-label="拖拽排序"
            {...sortable.dragActivators}
          >
            ≡
          </Button>
          <Checkbox
            checked={props.selected}
            onChange={() => props.onToggleSelect()}
            aria-label={`选择 ${props.track.name}`}
          />
          <Button
            type="button"
            variant="ghost"
            class="h-auto min-w-0 flex-1 justify-start text-left font-normal"
            onClick={props.onPlay}
          >
            <p class="truncate text-sm font-medium">{props.track.name}</p>
            <p class="truncate text-xs text-muted-foreground">
              {props.track.artist}
              <Show when={props.track.duration}>
                <span class="ml-2 tabular-nums">{props.track.duration}</span>
              </Show>
            </p>
          </Button>
        </div>
      </MusicTrackContextMenu>
    </li>
  );
}

export const MusicTrackList: Component<MusicTrackListProps> = (props) => {
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const groupId = () => viewerStore.state.activeMusicGroupId ?? MediaGroupId.MusicLocal;

  const [tracks, { refetch }] = createResource(
    () => ({
      id: groupId(),
      active: props.active !== false,
      rev: props.tracksRevision ?? 0,
    }),
    (key) => (key.active ? getTracksForGroupId(key.id) : Promise.resolve([])),
  );

  const [group] = createResource(groupId, getGroupById);
  const playlistId = () => group()?.listId ?? null;

  const reloadTracks = () => {
    invalidateLocalMusicSearchCache();
    void refetch();
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

  const handleReorder = async (ids: Id[]) => {
    const listId = playlistId();
    if (!listId) return;
    await reorderPlaylistTracks(listId, ids.map(String));
    void reloadTracks();
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const list = () => tracks() ?? [];
  const sortableIds = createMemo(() => list().map((t) => t.id));
  const [scrollEl, setScrollEl] = createSignal<HTMLElement | undefined>();

  return (
    <div class={cn('relative flex min-h-0 min-w-0 flex-1 flex-col', props.class)}>
      <Show when={selected().size > 0}>
        <div class="flex shrink-0 flex-wrap items-center gap-2 border-b py-2">
          <Button size="sm" variant="outline" onClick={() => void removeSelected()}>
            删除选中 ({selected().size})
          </Button>
        </div>
      </Show>
      <div ref={(el) => setScrollEl(el)} class="min-h-0 flex-1 overflow-y-auto">
        <Show when={shouldShowBlockingLoading(tracks.loading, list().length)}>
          <p class="p-4 text-sm text-muted-foreground">加载中…</p>
        </Show>
        <Show when={list().length === 0 && !tracks.loading}>
          <p class="p-4 text-sm text-muted-foreground">暂无曲目</p>
        </Show>
        <Show when={list().length > 0}>
          <DragDropProvider collisionDetector={closestCenter}>
            <DragDropSensors />
            <SortableProvider ids={sortableIds()}>
              <ReorderBridge onReorder={handleReorder} />
              <ul class="divide-y">
                <For each={list()}>
                  {(track, index) => (
                    <SortableTrackRow
                      track={track}
                      index={index()}
                      list={list()}
                      playlistId={playlistId()}
                      selected={selected().has(track.id)}
                      onToggleSelect={() => toggleSelect(track.id)}
                      onPlay={() => void playPlaylist(list(), index(), { origin: 'list' })}
                      onChanged={reloadTracks}
                    />
                  )}
                </For>
              </ul>
            </SortableProvider>
          </DragDropProvider>
        </Show>
      </div>
      <MusicHubQuickScroll
        container={scrollEl}
        contentRevision={() => `${groupId()}:${list().length}:${props.tracksRevision ?? 0}`}
      />
    </div>
  );
};
