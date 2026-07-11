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
import { saveNeteasePlaylistAsLocal } from '@/lib/media/audio/platform/playlist-sync';
import { syncSourceList } from '@/lib/media/audio/list/sync-source-list';
import { showAppToast } from '@/components/shared/AppToasts';
import { MediaGroupId } from '@/types/book-group';
import { cn } from '@/lib/utils';
import { invalidateLocalMusicSearchCache } from '@/lib/media/audio/music-local-search';
import { shouldShowBlockingLoading } from '@/lib/media/audio/music-loading-ui';
import type { AudioTrack } from '@/lib/media/audio/track-types';

export interface MusicTrackListProps {
  active?: boolean;
  class?: string;
  onScanLocal?: () => void;
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
  selected: boolean;
  onToggleSelect: () => void;
  onPlay: () => void;
  onRemove: () => void;
}) {
  const sortable = createSortable(props.track.id);
  const ctx = useDragDropContext();
  const isDragging = () => !!ctx?.[0].active.draggable;

  return (
    <li>
      <div
        ref={sortable}
        class={cn(
          'flex items-center gap-2 px-4 py-2.5 hover:bg-muted/40',
          sortable.isActiveDraggable && 'z-10 bg-background shadow-sm',
          isDragging() && 'transition-transform duration-200 ease-out',
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-auto w-auto shrink-0 cursor-grab touch-none px-1 text-muted-foreground active:cursor-grabbing"
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
        <Button
          size="sm"
          variant="ghost"
          class="shrink-0 text-xs text-muted-foreground"
          onClick={props.onRemove}
        >
          移除
        </Button>
      </div>
    </li>
  );
}

export const MusicTrackList: Component<MusicTrackListProps> = (props) => {
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const groupId = () => viewerStore.state.activeMusicGroupId ?? MediaGroupId.MusicLocal;

  const [tracks, { refetch }] = createResource(groupId, (id) =>
    props.active !== false ? getTracksForGroupId(id) : Promise.resolve([]),
  );

  const reloadTracks = () => {
    invalidateLocalMusicSearchCache();
    void refetch();
  };

  const playAll = () => {
    const list = tracks() ?? [];
    if (list.length > 0) void playPlaylist(list, 0);
  };

  const saveAsLocal = async () => {
    const group = await getGroupById(groupId());
    const listId = group?.listId;
    if (!listId) return;
    try {
      await saveNeteasePlaylistAsLocal(listId);
      showAppToast({ title: '已保存为本地歌单' });
      void reloadTracks();
    } catch (e) {
      showAppToast({ title: '保存失败', description: String(e), variant: 'destructive' });
    }
  };

  const removeTrack = async (trackId: string) => {
    const group = await getGroupById(groupId());
    if (!group?.listId) return;
    await removeTrackFromPlaylist(group.listId, trackId);
    void reloadTracks();
  };

  const removeSelected = async () => {
    const group = await getGroupById(groupId());
    if (!group?.listId) return;
    for (const id of selected()) {
      await removeTrackFromPlaylist(group.listId, id);
    }
    setSelected(new Set<string>());
    void reloadTracks();
  };

  const handleReorder = async (ids: Id[]) => {
    const group = await getGroupById(groupId());
    if (!group?.listId) return;
    await reorderPlaylistTracks(group.listId, ids.map(String));
    void reloadTracks();
  };

  const syncList = async () => {
    const group = await getGroupById(groupId());
    if (!group?.listId) return;
    try {
      await syncSourceList(group.listId);
      showAppToast({ title: '列表已更新' });
      void reloadTracks();
    } catch (e) {
      showAppToast({ title: '更新失败', description: String(e), variant: 'destructive' });
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const list = () => tracks() ?? [];
  const sortableIds = createMemo(() => list().map((t) => t.id));

  return (
    <div class={cn('flex min-h-0 min-w-0 flex-1 flex-col', props.class)}>
      <div class="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
        <Button size="sm" onClick={playAll} disabled={list().length === 0}>
          播放全部
        </Button>
        <Show when={selected().size > 0}>
          <Button size="sm" variant="outline" onClick={() => void removeSelected()}>
            删除选中 ({selected().size})
          </Button>
        </Show>
        <Button size="sm" variant="outline" onClick={() => void syncList()}>
          更新源列表
        </Button>
        <Show when={props.onScanLocal}>
          <Button size="sm" variant="outline" onClick={props.onScanLocal}>
            扫描本地
          </Button>
        </Show>
        <Show when={groupId() !== MediaGroupId.Favorite}>
          <Button size="sm" variant="outline" onClick={() => void saveAsLocal()}>
            网易入库
          </Button>
        </Show>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto">
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
                      selected={selected().has(track.id)}
                      onToggleSelect={() => toggleSelect(track.id)}
                      onPlay={() => void playPlaylist(list(), index())}
                      onRemove={() => void removeTrack(track.id)}
                    />
                  )}
                </For>
              </ul>
            </SortableProvider>
          </DragDropProvider>
        </Show>
      </div>
    </div>
  );
};
