import { For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import type {
  MfAlbumSearchHit,
  MfArtistSearchHit,
} from '@/lib/media/audio/online/mf-plugin/mf-search-hub';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import type { OnlinePlaylistSummary } from '@/lib/media/audio/music-sdk/types';
import { openAlbumBrowse, openSingerBrowse } from '@/stores/music-hub/browse';
import { openSongListDetail, setSongListSource } from '@/stores/music-hub/songList';
import { setMusicSection } from '@/stores/viewer/media/audio';
import { playPlaylist } from '@/stores/viewer/media/audio';
import { linkLyricToTrack } from '@/lib/media/audio/link-lyric';
import { cn } from '@/lib/utils';

export const MusicMfAlbumSearchList: Component<{
  items: MfAlbumSearchHit[];
  class?: string;
}> = (props) => (
  <ul class={cn('space-y-1', props.class)}>
    <For each={props.items}>
      {(item) => (
        <li>
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/50"
            onClick={() =>
              void openAlbumBrowse(item.source as never, item.id, {
                mfAlbumItem: item.mfAlbumItem as never,
              })
            }
          >
            <span class="min-w-0 flex-1 truncate text-sm">{item.name}</span>
            <span class="truncate text-xs text-muted-foreground">{item.artist}</span>
          </button>
        </li>
      )}
    </For>
  </ul>
);

export const MusicMfArtistSearchList: Component<{
  items: MfArtistSearchHit[];
  class?: string;
}> = (props) => (
  <ul class={cn('space-y-1', props.class)}>
    <For each={props.items}>
      {(item) => (
        <li>
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/50"
            onClick={() =>
              void openSingerBrowse(item.source as never, item.id, item.name, {
                mfArtistItem: item.mfArtistItem as never,
              })
            }
          >
            <span class="min-w-0 flex-1 truncate text-sm">{item.name}</span>
          </button>
        </li>
      )}
    </For>
  </ul>
);

export const MusicMfLyricSearchList: Component<{
  tracks: AudioTrack[];
  fromTrack?: AudioTrack | null;
  class?: string;
  onLinked?: () => void;
}> = (props) => (
  <ul class={cn('space-y-1', props.class)}>
    <For each={props.tracks}>
      {(track) => (
        <li class="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm">{track.name}</p>
            <p class="truncate text-xs text-muted-foreground">{track.artist}</p>
          </div>
          <Show when={props.fromTrack}>
            {(from) => (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  linkLyricToTrack(from(), track);
                  props.onLinked?.();
                }}
              >
                关联
              </Button>
            )}
          </Show>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void playPlaylist([track], 0, {
                origin: 'search',
                listName: '歌词搜索',
                listKind: 'search',
              })
            }
          >
            播放
          </Button>
        </li>
      )}
    </For>
  </ul>
);

export const MusicMfSheetSearchList: Component<{
  playlists: OnlinePlaylistSummary[];
  class?: string;
}> = (props) => (
  <ul class={cn('space-y-1', props.class)}>
    <For each={props.playlists}>
      {(pl) => (
        <li>
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/50"
            onClick={() => {
              setSongListSource(pl.source as never);
              void openSongListDetail(pl.id, 1, pl);
              setMusicSection('songlist');
            }}
          >
            <span class="min-w-0 flex-1 truncate text-sm">{pl.name}</span>
            <span class="truncate text-xs text-muted-foreground">{pl.author}</span>
          </button>
        </li>
      )}
    </For>
  </ul>
);
