/**
 * lx 式底栏 PlayBar
 */

import { Show, createMemo, type Component } from 'solid-js';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { audioI18n } from '@/lib/media/audio/audio-i18n';
import { getMusicOfflineMode } from '@/lib/media/audio/online/user-api-settings';
import { playNextTrack, playPrevTrack, setMusicSection } from '@/stores/viewer/media/audio';
import type { useMusicHubPlayer } from '@/components/viewer/audio/music/hub/useMusicHubPlayer';

export interface MusicHubPlayBarProps {
  player: ReturnType<typeof useMusicHubPlayer>;
}

export const MusicHubPlayBar: Component<MusicHubPlayBarProps> = (props) => {
  const track = () => props.player.currentTrack();
  const offline = createMemo(() => getMusicOfflineMode());

  return (
    <div
      class="flex shrink-0 cursor-pointer items-center gap-3 border-t bg-background/95 px-4 py-2 backdrop-blur"
      onClick={() => setMusicSection('nowPlaying')}
    >
      <Show
        when={track()?.meta?.coverUrl}
        fallback={<div class="h-10 w-10 rounded bg-muted" />}
      >
        <img
          src={String(track()?.meta.coverUrl)}
          alt=""
          class="h-10 w-10 rounded object-cover"
        />
      </Show>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">{track()?.name ?? '未播放'}</p>
        <p class="truncate text-xs text-muted-foreground">
          {track()?.artist ?? audioI18n.hubTitle()}
          <Show when={offline()}>
            <span class="ml-1 text-warning-foreground">· 离线</span>
          </Show>
        </p>
      </div>
      <div class="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" onClick={() => void playPrevTrack()}>
          <SkipBack class="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          class="h-9 w-9"
          onClick={() => props.player.player.togglePlay()}
        >
          <Show when={props.player.player.playing()} fallback={<Play class="h-4 w-4" />}>
            <Pause class="h-4 w-4" />
          </Show>
        </Button>
        <Button variant="ghost" size="icon" onClick={() => void playNextTrack()}>
          <SkipForward class="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
