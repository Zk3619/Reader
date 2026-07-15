/**
 * 列表左栏：歌单分组（media_groups）+ 用户列表拖拽排序
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
import {
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Component,
} from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  deletePlaylist,
  MUSIC_PLAYLISTS_CHANGED_EVENT,
  renamePlaylist,
} from '@/lib/database/audio-library';
import { getGroupById, getMusicGroups, updateGroupsOrder } from '@/lib/database/media-groups';
import { viewerStore } from '@/stores/viewer';
import { setActiveMusicGroupId } from '@/stores/viewer/media/audio';
import { MediaGroupId } from '@/types/book-group';
import type { BookGroup } from '@/types';
import { cn } from '@/lib/utils';
import { shouldShowBlockingLoading } from '@/lib/media/audio/music-loading-ui';
import {
  AppTextField,
  AppTextFieldInput,
  AppTextFieldLabel,
} from '@/components/shared/AppTextField';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import { showAppToast } from '@/components/shared/AppToasts';
import { ChevronRight } from 'lucide-solid';
import { settingsStore } from '@/stores/settings';

export interface MusicPlaylistSidebarProps {
  active?: boolean;
  class?: string;
  /** 外部变更时递增以刷新 */
  listsRevision?: number;
  onListsChanged?: () => void;
}

type SidebarGroup = BookGroup & { sortable: boolean };

function playlistIdForGroup(group: BookGroup): string | null {
  return group.groupId === MediaGroupId.Favorite ? 'love' : group.listId ?? null;
}

async function loadSidebarGroups(): Promise<SidebarGroup[]> {
  const [favorite, music] = await Promise.all([
    getGroupById(MediaGroupId.Favorite),
    getMusicGroups(),
  ]);
  const users = music
    .filter((g) => g.listId?.startsWith('pl_'))
    .sort((a, b) => a.order - b.order || a.groupId - b.groupId);
  const builtins = new Map(
    music
      .filter((g) => g.listId && !g.listId.startsWith('pl_'))
      .map((g) => [g.listId!, g]),
  );
  const pinned: SidebarGroup[] = [
    builtins.get('default')
      ? { ...builtins.get('default')!, groupName: '试听列表', sortable: false }
      : null,
    builtins.get('recent')
      ? { ...builtins.get('recent')!, groupName: '最近播放', sortable: false }
      : null,
    builtins.get('local')
      ? { ...builtins.get('local')!, groupName: '本地音乐', sortable: false }
      : null,
    favorite ? { ...favorite, groupName: '我的收藏', sortable: false } : null,
  ].filter((group): group is SidebarGroup => group != null);
  return [...pinned, ...users.map((g) => ({ ...g, sortable: true }))];
}

function PlaylistActiveIndicator(props: { active: boolean }) {
  const reduceMotion = () => settingsStore.state.app.reduceMotion;
  return (
    <span
      class={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden',
        reduceMotion() ? '' : 'transition-[width,opacity] duration-130 ease-out',
        props.active ? 'mr-0.5 w-[0.9em] opacity-100' : 'w-0 opacity-0',
      )}
      aria-hidden={!props.active}
    >
      <ChevronRight class="h-[0.9em] w-[0.9em] shrink-0" />
    </span>
  );
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

function SortableListRow(props: {
  group: SidebarGroup;
  active: boolean;
  onSelect: () => void;
}) {
  const sortable = createSortable(props.group.groupId);
  const ctx = useDragDropContext();
  const isDragging = () => !!ctx?.[0].active.draggable;

  return (
    <li>
      <div
        ref={sortable}
        class={cn(
          'flex min-h-9 items-center gap-0.5 rounded-md',
          'transition-[color,background-color] duration-300 ease-out',
          sortable.isActiveDraggable && 'z-10 bg-background shadow-sm',
          isDragging() && 'transition-transform duration-200 ease-out',
          props.active
            ? 'bg-primary/10 text-primary'
            : 'text-foreground hover:bg-primary/10',
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-8 w-6 shrink-0 cursor-grab touch-none px-0 text-muted-foreground active:cursor-grabbing"
          aria-label="拖拽排序"
          {...sortable.dragActivators}
        >
          ≡
        </Button>
        <Button
          type="button"
          variant="ghost"
          class={cn(
            'h-9 min-w-0 flex-1 justify-start rounded-md px-1.5 text-left text-[13px] font-normal text-inherit hover:bg-transparent',
            props.active && 'font-medium',
          )}
          onClick={() => {
            if (!props.active) props.onSelect();
          }}
        >
          <PlaylistActiveIndicator active={props.active} />
          <span class="truncate">{props.group.groupName}</span>
        </Button>
      </div>
    </li>
  );
}

export const MusicPlaylistSidebar: Component<MusicPlaylistSidebarProps> = (props) => {
  const [groups, { refetch }] = createResource(
    () => ({ active: props.active !== false, rev: props.listsRevision ?? 0 }),
    (key) => (key.active ? loadSidebarGroups() : Promise.resolve([])),
  );

  onMount(() => {
    const handlePlaylistsChanged = () => void refetch();
    window.addEventListener(MUSIC_PLAYLISTS_CHANGED_EVENT, handlePlaylistsChanged);
    onCleanup(() =>
      window.removeEventListener(MUSIC_PLAYLISTS_CHANGED_EVENT, handlePlaylistsChanged),
    );
  });

  const [renameOpen, setRenameOpen] = createSignal(false);
  const [renameValue, setRenameValue] = createSignal('');

  const activeGroupId = () =>
    viewerStore.state.activeMusicGroupId ?? MediaGroupId.MusicLocal;

  const activeGroup = () => groups()?.find((g) => g.groupId === activeGroupId());

  const pinned = createMemo(() => (groups() ?? []).filter((g) => !g.sortable));
  const sortableGroups = createMemo(() => (groups() ?? []).filter((g) => g.sortable));
  const sortableIds = createMemo(() => sortableGroups().map((g) => g.groupId));

  const isUserPlaylist = () => !!activeGroup()?.listId?.startsWith('pl_');

  const openRename = () => {
    const g = activeGroup();
    if (!g?.listId?.startsWith('pl_')) return;
    setRenameValue(g.groupName);
    setRenameOpen(true);
  };

  const confirmRename = async () => {
    const group = activeGroup();
    const name = renameValue().trim();
    if (!group?.listId || !name) return;
    await renamePlaylist(group.listId, name);
    setRenameOpen(false);
    void refetch();
    props.onListsChanged?.();
  };

  const removeActive = async () => {
    const group = activeGroup();
    if (!group?.listId?.startsWith('pl_')) return;
    await deletePlaylist(group.listId);
    setActiveMusicGroupId(MediaGroupId.MusicLocal, 'local');
    void refetch();
    props.onListsChanged?.();
    showAppToast({ title: '列表已删除', variant: 'success' });
  };

  const handleReorder = async (ids: Id[]) => {
    await updateGroupsOrder(ids.map((id, order) => ({ groupId: Number(id), order })));
    void refetch();
    props.onListsChanged?.();
  };

  return (
    <aside class={cn('flex min-h-0 w-44 shrink-0 flex-col border-r md:w-52', props.class)}>
      <Show when={isUserPlaylist()}>
        <div class="flex shrink-0 gap-1 border-b p-2">
          <Button size="sm" variant="outline" class="flex-1 text-xs" onClick={openRename}>
            重命名
          </Button>
          <Button size="sm" variant="outline" class="text-xs" onClick={() => void removeActive()}>
            删除
          </Button>
        </div>
      </Show>
      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <Show when={shouldShowBlockingLoading(groups.loading, (groups() ?? []).length)}>
          <p class="px-3 py-2 text-sm text-muted-foreground">加载中…</p>
        </Show>
        <ul class="space-y-0.5">
          <For each={pinned()}>
            {(group) => (
              <li>
                <Button
                  type="button"
                  variant="ghost"
                  class={cn(
                    'h-9 w-full min-w-0 justify-start rounded-md px-2.5 text-left text-[13px] font-normal',
                    'transition-[color,background-color] duration-300 ease-out',
                    activeGroupId() === group.groupId
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-foreground hover:bg-primary/10',
                  )}
                  onClick={() => {
                    if (activeGroupId() === group.groupId) return;
                    setActiveMusicGroupId(group.groupId, playlistIdForGroup(group));
                  }}
                >
                  <PlaylistActiveIndicator active={activeGroupId() === group.groupId} />
                  <span class="min-w-0 flex-1 truncate">{group.groupName}</span>
                </Button>
              </li>
            )}
          </For>
        </ul>
        <Show when={sortableGroups().length > 0}>
          <DragDropProvider collisionDetector={closestCenter}>
            <DragDropSensors />
            <SortableProvider ids={sortableIds()}>
              <ReorderBridge onReorder={handleReorder} />
              <ul class="mt-1 space-y-0.5 border-t pt-1">
                <For each={sortableGroups()}>
                  {(group) => (
                    <SortableListRow
                      group={group}
                      active={activeGroupId() === group.groupId}
                      onSelect={() =>
                        setActiveMusicGroupId(group.groupId, playlistIdForGroup(group))
                      }
                    />
                  )}
                </For>
              </ul>
            </SortableProvider>
          </DragDropProvider>
        </Show>
      </div>

      <ViewerAppDialog open={renameOpen()} onOpenChange={setRenameOpen}>
        <ViewerAppDialogContent layout="plain" class="max-w-sm">
          <ViewerAppDialogHeader>
            <ViewerAppDialogTitle>重命名列表</ViewerAppDialogTitle>
          </ViewerAppDialogHeader>
          <AppTextField>
            <AppTextFieldLabel>列表名</AppTextFieldLabel>
            <AppTextFieldInput
              value={renameValue()}
              onInput={(e) => setRenameValue(e.currentTarget.value)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter') void confirmRename();
              }}
            />
          </AppTextField>
          <ViewerAppDialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void confirmRename()}>确定</Button>
          </ViewerAppDialogFooter>
        </ViewerAppDialogContent>
      </ViewerAppDialog>
    </aside>
  );
};
