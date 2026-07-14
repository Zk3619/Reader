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
  Show,
  type Component,
} from 'solid-js';
import { Button } from '@/components/ui/button';
import { deletePlaylist, renamePlaylist } from '@/lib/database/audio-library';
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

export interface MusicPlaylistSidebarProps {
  active?: boolean;
  class?: string;
  /** 外部变更时递增以刷新 */
  listsRevision?: number;
  onListsChanged?: () => void;
}

type SidebarGroup = BookGroup & { sortable: boolean };

async function loadSidebarGroups(): Promise<SidebarGroup[]> {
  const [favorite, music] = await Promise.all([
    getGroupById(MediaGroupId.Favorite),
    getMusicGroups(),
  ]);
  const builtins = music.filter(
    (g) => g.listId && !g.listId.startsWith('pl_') && g.listId !== 'love',
  );
  const users = music
    .filter((g) => g.listId?.startsWith('pl_'))
    .sort((a, b) => a.order - b.order || a.groupId - b.groupId);
  const pinned: SidebarGroup[] = [];
  if (favorite) pinned.push({ ...favorite, sortable: false });
  for (const g of builtins) {
    if (g.listId === 'default') continue;
    pinned.push({ ...g, sortable: false });
  }
  return [...pinned, ...users.map((g) => ({ ...g, sortable: true }))];
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
          'flex items-center gap-0.5 rounded-lg',
          sortable.isActiveDraggable && 'z-10 bg-background shadow-sm',
          isDragging() && 'transition-transform duration-200 ease-out',
          props.active && 'bg-muted',
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
            'h-auto min-w-0 flex-1 justify-start rounded-lg px-2 py-2 text-left text-sm font-normal',
            props.active && 'font-medium',
          )}
          onClick={props.onSelect}
        >
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
    setActiveMusicGroupId(MediaGroupId.MusicLocal);
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
                    'h-auto w-full justify-start rounded-lg px-3 py-2 text-left text-sm font-normal transition-colors hover:bg-muted/60',
                    activeGroupId() === group.groupId && 'bg-muted font-medium',
                  )}
                  onClick={() => setActiveMusicGroupId(group.groupId)}
                >
                  {group.groupName}
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
                      onSelect={() => setActiveMusicGroupId(group.groupId)}
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
