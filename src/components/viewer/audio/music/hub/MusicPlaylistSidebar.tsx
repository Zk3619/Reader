/**
 * 列表左栏：歌单分组（media_groups）
 */

import { createResource, createSignal, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  createPlaylist,
  deletePlaylist,
  renamePlaylist,
} from '@/lib/database/audio-library';
import { getGroupById, getMusicGroups } from '@/lib/database/media-groups';
import { viewerStore } from '@/stores/viewer';
import { setActiveMusicGroupId } from '@/stores/viewer/media/audio';
import { MediaGroupId } from '@/types/book-group';
import type { BookGroup } from '@/types';
import { cn } from '@/lib/utils';

export interface MusicPlaylistSidebarProps {
  active?: boolean;
  class?: string;
}

async function loadSidebarGroups(): Promise<BookGroup[]> {
  const [favorite, music] = await Promise.all([
    getGroupById(MediaGroupId.Favorite),
    getMusicGroups(),
  ]);
  const lists = music.filter((g) => g.listId !== 'love' && g.listId !== 'default');
  return favorite ? [favorite, ...lists] : lists;
}

export const MusicPlaylistSidebar: Component<MusicPlaylistSidebarProps> = (props) => {
  const [newName, setNewName] = createSignal('');
  const [groups, { refetch }] = createResource(() =>
    props.active !== false ? loadSidebarGroups() : [],
  );

  const activeGroupId = () =>
    viewerStore.state.activeMusicGroupId ?? MediaGroupId.MusicLocal;

  const activeGroup = () => groups()?.find((g) => g.groupId === activeGroupId());

  const createNew = async () => {
    const name = newName().trim();
    if (!name) return;
    const id = `pl_${Date.now()}`;
    await createPlaylist(id, name, 'local');
    setNewName('');
    void refetch();
    setActiveMusicGroupId(
      (await getMusicGroups()).find((g) => g.listId === id)?.groupId ?? MediaGroupId.MusicLocal,
    );
  };

  const renameActive = async () => {
    const group = activeGroup();
    const name = newName().trim();
    if (!group?.listId || !name) return;
    await renamePlaylist(group.listId, name);
    void refetch();
  };

  const removeActive = async () => {
    const group = activeGroup();
    if (!group?.listId) return;
    await deletePlaylist(group.listId);
    setActiveMusicGroupId(MediaGroupId.MusicLocal);
    void refetch();
  };

  const isUserPlaylist = () => {
    const g = activeGroup();
    return !!g?.listId?.startsWith('pl_');
  };

  return (
    <aside class={cn('flex min-h-0 w-44 shrink-0 flex-col border-r md:w-52', props.class)}>
      <div class="space-y-2 border-b p-3">
        <div class="flex gap-2">
          <input
            class="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm"
            placeholder="新建歌单"
            value={newName()}
            onInput={(e) => setNewName(e.currentTarget.value)}
          />
          <Button size="sm" onClick={() => void createNew()}>
            +
          </Button>
        </div>
        <Show when={isUserPlaylist()}>
          <div class="flex gap-1">
            <Button size="sm" variant="outline" class="flex-1 text-xs" onClick={() => void renameActive()}>
              重命名
            </Button>
            <Button size="sm" variant="outline" class="text-xs" onClick={() => void removeActive()}>
              删除
            </Button>
          </div>
        </Show>
      </div>
      <ul class="min-h-0 flex-1 overflow-y-auto p-2">
        <Show when={groups.loading}>
          <li class="px-3 py-2 text-sm text-muted-foreground">加载中…</li>
        </Show>
        <For each={groups() ?? []}>
          {(group) => (
            <li>
              <button
                type="button"
                class={cn(
                  'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60',
                  activeGroupId() === group.groupId && 'bg-muted font-medium',
                )}
                onClick={() => setActiveMusicGroupId(group.groupId)}
              >
                {group.groupName}
              </button>
            </li>
          )}
        </For>
      </ul>
    </aside>
  );
};
