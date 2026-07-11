/**
 * 曲库面板
 */

import { createResource, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { loadLibraryPlaylists, loadPlaylistTracks } from '@/lib/media/audio/library/playlist-store';
import { playPlaylist } from '@/stores/viewer/media/audio';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { AudioPanelShell } from '@/components/viewer/audio/music/AudioPanelShell';

export interface AudioLibraryDrawerProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
  onScanLocal?: () => void;
}

export const AudioLibraryDrawer: Component<AudioLibraryDrawerProps> = (props) => {
  const active = () => props.inline || props.open;
  const [playlists] = createResource(() => (active() ? loadLibraryPlaylists() : []));
  const [tracks] = createResource(() => (active() ? loadPlaylistTracks('local') : []));

  const playAll = (list: AudioTrack[]) => {
    void playPlaylist(list, 0);
  };

  return (
    <AudioPanelShell
      open={props.open}
      inline={props.inline}
      title="曲库"
      onClose={props.onClose}
      headerExtra={
        <Show when={props.onScanLocal}>
          <Button size="sm" variant="outline" onClick={props.onScanLocal}>
            扫描
          </Button>
        </Show>
      }
    >
      <div class="p-4">
        <Show when={playlists.loading || tracks.loading}>
          <p class="text-sm text-muted-foreground">加载中…</p>
        </Show>
        <p class="mb-2 text-xs font-medium text-muted-foreground">本地音乐</p>
        <ul class="space-y-1">
          <For each={tracks() ?? []}>
            {(track) => (
              <li>
                <Button
                  type="button"
                  variant="ghost"
                  class="h-auto w-full flex-col items-start rounded-lg px-3 py-2 font-normal hover:bg-muted/60"
                  onClick={() => void playPlaylist([track], 0)}
                >
                  <span class="truncate text-sm font-medium">{track.name}</span>
                  <span class="truncate text-xs text-muted-foreground">
                    {track.artist} · {track.duration}
                  </span>
                </Button>
              </li>
            )}
          </For>
        </ul>
        <Show when={(tracks()?.length ?? 0) > 0}>
          <Button class="mt-3 w-full" size="sm" onClick={() => playAll(tracks() ?? [])}>
            播放全部
          </Button>
        </Show>
        <Show when={(tracks()?.length ?? 0) === 0 && !tracks.loading}>
          <p class="text-sm text-muted-foreground">暂无本地音乐，请扫描文件夹</p>
        </Show>
      </div>
    </AudioPanelShell>
  );
};
