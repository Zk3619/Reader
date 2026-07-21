/**
 * 曲库面板
 */

import { createResource, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { loadLibraryPlaylists, loadPlaylistTracks } from '@/lib/media/audio/library/playlist-store';
import { playByListId } from '@/stores/viewer/media/audio';
import { BUILTIN_PLAYLIST_IDS } from '@/lib/media/audio/track-types';
import {
  ViewerAppDrawer,
  ViewerAppDrawerBody,
  ViewerAppDrawerContent,
  ViewerAppDrawerHeader,
} from '@/components/media/viewer/viewer-app-overlay';

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

  const playAll = () => {
    void playByListId(BUILTIN_PLAYLIST_IDS.LOCAL, 0, {
      listName: '本地音乐',
      listKind: 'builtin',
    });
  };

  const scanAction = () => (
    <Show when={props.onScanLocal}>
      <Button size="sm" variant="outline" onClick={props.onScanLocal}>
        扫描
      </Button>
    </Show>
  );

  const body = (
    <div class="p-4">
      <Show when={playlists.loading || tracks.loading}>
        <p class="text-sm text-muted-foreground">加载中…</p>
      </Show>
      <p class="mb-2 text-xs font-medium text-muted-foreground">本地音乐</p>
      <ul class="space-y-1">
        <For each={tracks() ?? []}>
          {(track, index) => (
            <li>
              <Button
                type="button"
                variant="ghost"
                class="h-auto w-full flex-col items-start rounded-lg px-3 py-2 font-normal hover:bg-muted/60"
                onClick={() =>
                  void playByListId(BUILTIN_PLAYLIST_IDS.LOCAL, index(), {
                    listName: '本地音乐',
                    listKind: 'builtin',
                  })
                }
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
        <Button class="mt-3 w-full" size="sm" onClick={() => playAll()}>
          播放全部
        </Button>
      </Show>
      <Show when={(tracks()?.length ?? 0) === 0 && !tracks.loading}>
        <p class="text-sm text-muted-foreground">暂无本地音乐，请扫描文件夹</p>
      </Show>
    </div>
  );

  return (
    <>
      <Show when={props.inline}>
        <div class="flex min-h-0 flex-1 flex-col">
          <div class="flex shrink-0 items-center justify-between border-b px-4 py-3">
            <h2 class="font-semibold">曲库</h2>
            <div class="flex items-center gap-2">{scanAction()}</div>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto">{body}</div>
        </div>
      </Show>
      <Show when={!props.inline}>
        <ViewerAppDrawer
          open={props.open}
          onOpenChange={(open) => {
            if (!open) props.onClose?.();
          }}
          side="right"
          snapPoints={[0, 1]}
          defaultSnapPoint={1}
        >
          <ViewerAppDrawerContent
            class="flex h-full w-[min(85dvw,24rem)] max-w-none flex-col"
            showNativeDragHandle={false}
          >
            <ViewerAppDrawerHeader title="曲库" actions={scanAction()} />
            <ViewerAppDrawerBody disableDragClose class="min-h-0 flex-1">
              {body}
            </ViewerAppDrawerBody>
          </ViewerAppDrawerContent>
        </ViewerAppDrawer>
      </Show>
    </>
  );
};
