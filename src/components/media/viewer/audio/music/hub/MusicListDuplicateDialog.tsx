/**
 * 重复歌曲对话框（对齐 lx DuplicateMusicModal）
 */

import { createEffect, createResource, createSignal, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';
import { findDuplicatePlaylistTracks } from '@/lib/media/audio/list/playlist-share';
import { removeTrackFromPlaylist } from '@/lib/database/audio-library';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import { playPlaylist } from '@/stores/viewer/media/audio';

export interface MusicListDuplicateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  listName: string;
  onChanged?: () => void;
}

export const MusicListDuplicateDialog: Component<MusicListDuplicateDialogProps> = (props) => {
  const [rev, setRev] = createSignal(0);
  const [items] = createResource(
    () => (props.open ? { id: props.listId, rev: rev() } : null),
    async (key) => (key ? findDuplicatePlaylistTracks(key.id) : []),
  );

  createEffect(() => {
    if (props.open) setRev((v) => v + 1);
  });

  const removeOne = async (track: AudioTrack) => {
    try {
      await removeTrackFromPlaylist(props.listId, track.id);
      setRev((v) => v + 1);
      props.onChanged?.();
      showAppToast({ title: '已移除重复曲目', variant: 'success' });
    } catch (e) {
      showAppToast({
        title: '移除失败',
        description: toUserFacingMusicError(e),
        variant: 'destructive',
      });
    }
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent layout="app" class="w-[calc(100dvw-2rem)] max-w-lg">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>重复歌曲</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>{props.listName}</ViewerAppDialogDescription>
        </ViewerAppDialogHeader>
        <div class="max-h-72 overflow-y-auto px-6 pb-2">
          <Show when={items.loading}>
            <p class="py-6 text-center text-sm text-muted-foreground">检测中…</p>
          </Show>
          <Show when={!items.loading && (items() ?? []).length === 0}>
            <p class="py-6 text-center text-sm text-muted-foreground">没有重复歌曲</p>
          </Show>
          <ul class="space-y-1">
            <For each={items() ?? []}>
              {(item) => (
                <li class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm">
                      {item.track.name}
                      <span class="text-muted-foreground"> - {item.track.artist}</span>
                    </p>
                    <p class="truncate text-xs text-muted-foreground">
                      {item.track.source}
                      {item.track.duration ? ` · ${item.track.duration}` : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    class="h-7 shrink-0 text-xs"
                    onClick={() =>
                      void playPlaylist([item.track], 0, {
                        origin: 'list',
                        listName: props.listName,
                        listKind: 'temporary',
                      })
                    }
                  >
                    试听
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    class="h-7 shrink-0 text-xs"
                    onClick={() => void removeOne(item.track)}
                  >
                    移除
                  </Button>
                </li>
              )}
            </For>
          </ul>
        </div>
        <ViewerAppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            关闭
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
