/**
 * 在线歌单详情
 */

import { For, Show, type Component } from 'solid-js';
import { Play } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { SettingsToolbarLeading } from '@/components/shell/SettingsPageToolbar';
import { getSongListState } from '@/stores/music-hub/songList';
import { playPlaylist } from '@/stores/viewer/media/audio';
import { addTracksToPlaylist } from '@/lib/database/audio-library';
import { BUILTIN_PLAYLIST_IDS } from '@/lib/media/audio/track-types';
import { MusicHubPageShell } from '@/components/viewer/audio/music/hub/MusicHubPageShell';

export interface MusicSongListDetailProps {
  onBack: () => void;
}

export const MusicSongListDetail: Component<MusicSongListDetailProps> = (props) => {
  const state = getSongListState;
  const detail = () => state().detail;

  return (
    <Show when={detail()}>
      {(d) => (
        <MusicHubPageShell
          section="songlist"
          title={d().info.name}
          description={d().info.author || '在线歌单'}
          leading={<SettingsToolbarLeading onBack={props.onBack} />}
          toolbar={
            <>
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
            </>
          }
        >
          <ul class="flex min-h-0 w-full flex-1 flex-col gap-1 pb-4">
            <For each={d().tracks}>
              {(track, i) => (
                <li>
                  <Button
                    type="button"
                    variant="ghost"
                    class="h-auto w-full justify-start gap-3 rounded-lg px-2 py-2 font-normal"
                    onClick={() => void playPlaylist(d().tracks, i())}
                  >
                    <span class="min-w-0 flex-1 truncate">{track.name}</span>
                    <span class="truncate text-sm text-muted-foreground">{track.artist}</span>
                  </Button>
                </li>
              )}
            </For>
          </ul>
        </MusicHubPageShell>
      )}
    </Show>
  );
};
