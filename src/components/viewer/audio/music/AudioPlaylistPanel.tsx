/**
 * 歌单面板（music 模式）
 */

import { createResource, createSignal, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import { loadLibraryPlaylists, loadPlaylistTracks } from '@/lib/media/audio/library/playlist-store';
import {
  createPlaylist,
  deletePlaylist,
  renamePlaylist,
  removeTrackFromPlaylist,
} from '@/lib/database/audio-library';
import { playPlaylist } from '@/stores/viewer/media/audio';
import { saveNeteasePlaylistAsLocal } from '@/lib/media/audio/platform/playlist-sync';
import { showAppToast } from '@/components/shared/AppToasts';
import { AudioPanelShell } from '@/components/viewer/audio/music/AudioPanelShell';
import { cn } from '@/lib/utils';

export interface AudioPlaylistPanelProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
}

export const AudioPlaylistPanel: Component<AudioPlaylistPanelProps> = (props) => {
  const active = () => props.inline || props.open;
  const [playlists, { refetch }] = createResource(() => (active() ? loadLibraryPlaylists() : []));
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [newName, setNewName] = createSignal('');
  const [renameValue, setRenameValue] = createSignal('');
  const [tracks, { refetch: refetchTracks }] = createResource(selectedId, (id) =>
    id ? loadPlaylistTracks(id) : Promise.resolve([]),
  );

  const createNew = async () => {
    const name = newName().trim();
    if (!name) return;
    const id = `pl_${Date.now()}`;
    await createPlaylist(id, name, 'local');
    setNewName('');
    void refetch();
    setSelectedId(id);
  };

  const rename = async () => {
    const id = selectedId();
    const name = renameValue().trim();
    if (!id || !name) return;
    await renamePlaylist(id, name);
    void refetch();
  };

  const remove = async () => {
    const id = selectedId();
    if (!id) return;
    await deletePlaylist(id);
    setSelectedId(null);
    void refetch();
  };

  const saveCurrentAsLocal = async () => {
    const id = selectedId();
    if (!id) return;
    try {
      await saveNeteasePlaylistAsLocal(id);
      showAppToast({ title: '已保存为本地歌单' });
      void refetch();
    } catch (e) {
      showAppToast({ title: '保存失败', description: String(e), variant: 'destructive' });
    }
  };

  return (
    <AudioPanelShell open={props.open} inline={props.inline} title="歌单" onClose={props.onClose}>
      <div class="space-y-2 border-b p-4">
        <div class="flex gap-2">
          <AppTextFieldBareInput
            class="min-w-0 flex-1"
            placeholder="新建歌单名称"
            value={newName()}
            onInput={(e) => setNewName(e.currentTarget.value)}
          />
          <Button size="sm" onClick={() => void createNew()}>
            新建
          </Button>
        </div>
      </div>
      <div class="flex min-h-[240px]">
        <ul class="w-2/5 overflow-y-auto border-r p-2">
          <For each={playlists() ?? []}>
            {(pl) => (
              <li>
                <Button
                  type="button"
                  variant="ghost"
                  class={cn(
                    'h-auto w-full justify-start rounded-lg px-3 py-2 text-left text-sm font-normal hover:bg-muted/60',
                    selectedId() === pl.id && 'bg-muted',
                  )}
                  onClick={() => {
                    setSelectedId(pl.id);
                    setRenameValue(pl.name);
                  }}
                >
                  {pl.name}
                </Button>
              </li>
            )}
          </For>
        </ul>
        <div class="min-w-0 flex-1 overflow-y-auto p-2">
          <Show when={selectedId()}>
            <div class="mb-2 flex flex-wrap gap-2">
              <AppTextFieldBareInput
                class="min-w-0 flex-1"
                value={renameValue()}
                onInput={(e) => setRenameValue(e.currentTarget.value)}
              />
              <Button size="sm" variant="outline" onClick={() => void rename()}>
                重命名
              </Button>
              <Button size="sm" variant="outline" onClick={() => void remove()}>
                删除
              </Button>
              <Button
                size="sm"
                onClick={() => void loadPlaylistTracks(selectedId()!).then((t) => playPlaylist(t, 0, { origin: 'list' }))}
              >
                播放
              </Button>
              <Button size="sm" variant="outline" onClick={() => void saveCurrentAsLocal()}>
                网易入库
              </Button>
            </div>
            <ul class="space-y-1">
              <For each={tracks() ?? []}>
                {(track) => (
                  <li class="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted/40">
                    <span class="truncate">{track.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void removeTrackFromPlaylist(selectedId()!, track.id).then(() =>
                          refetchTracks(),
                        )
                      }
                    >
                      移除
                    </Button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </div>
    </AudioPanelShell>
  );
};
