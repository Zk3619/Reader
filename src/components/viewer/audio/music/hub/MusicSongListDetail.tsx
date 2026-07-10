/**
 * 在线歌单详情
 */

import { For, Show, type Component } from 'solid-js';
import { ArrowLeft, Play } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { getSongListState } from '@/stores/music-hub/songList';
import { playPlaylist } from '@/stores/viewer/media/audio';
import { addTracksToPlaylist } from '@/lib/database/audio-library';
import { BUILTIN_PLAYLIST_IDS } from '@/lib/media/audio/track-types';

export interface MusicSongListDetailProps {
  onBack: () => void;
}

export const MusicSongListDetail: Component<MusicSongListDetailProps> = (props) => {
  const state = getSongListState;
  const detail = () => state().detail;

  return (
    <Show when={detail()}>
      {(d) => (
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div class="flex shrink-0 items-center gap-2 border-b px-4 py-3">
            <Button variant="ghost" size="icon" onClick={props.onBack}>
              <ArrowLeft class="h-4 w-4" />
            </Button>
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{d().info.name}</p>
              <p class="truncate text-xs text-muted-foreground">{d().info.author}</p>
            </div>
            <Button
              size="sm"
              onClick={() => void playPlaylist(d().tracks, 0)}
              disabled={d().tracks.length === 0}
            >
              <Play class="mr-1 h-4 w-4" />
              播放全部
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void addTracksToPlaylist(BUILTIN_PLAYLIST_IDS.DEFAULT, d().tracks)
              }
            >
              添加到列表
            </Button>
          </div>
          <Show when={state().detailLoading}>
            <p class="p-4 text-sm text-muted-foreground">加载中…</p>
          </Show>
          <ul class="min-h-0 flex-1 overflow-y-auto">
            <For each={d().tracks}>
              {(track, i) => (
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted"
                    onClick={() => void playPlaylist(d().tracks, i())}
                  >
                    <span class="w-6 text-xs text-muted-foreground">{i() + 1}</span>
                    <span class="min-w-0 flex-1 truncate">{track.name}</span>
                    <span class="truncate text-sm text-muted-foreground">{track.artist}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      )}
    </Show>
  );
};
