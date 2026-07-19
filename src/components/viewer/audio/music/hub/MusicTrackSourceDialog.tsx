import { For, Show, createResource, createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import { replaceTrackInPlaylist } from '@/lib/database/audio-library';
import { findMusic } from '@/lib/media/audio/music-sdk/find-music';
import {
  trackAlbumName,
  trackSourceBadgeLabel,
} from '@/lib/media/audio/music-search-result-ui';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { replaceTrackInQueue } from '@/stores/viewer/media/audio';

export const MusicTrackSourceDialog: Component<{
  open: boolean;
  playlistId: string;
  track: AudioTrack;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}> = (props) => {
  const [busyId, setBusyId] = createSignal<string | null>(null);
  const [candidates] = createResource(
    () => (props.open ? `${props.track.source}:${props.track.id}` : null),
    () => findMusic(props.track),
  );

  const replaceWith = async (replacement: AudioTrack) => {
    if (busyId()) return;
    setBusyId(replacement.id);
    try {
      await replaceTrackInPlaylist(props.playlistId, props.track.id, replacement);
      replaceTrackInQueue(props.track, replacement);
      showAppToast({ title: `已切换到 ${trackSourceBadgeLabel(replacement)} 来源`, variant: 'success' });
      props.onChanged?.();
      props.onOpenChange(false);
    } catch (error) {
      showAppToast({
        title: '歌曲换源失败',
        description: toUserFacingMusicError(error),
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent
        layout="plain"
        class="w-[min(36rem,calc(100dvw-2rem))] max-w-none"
      >
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>歌曲换源</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            为“{props.track.name}”选择其他来源
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>
        <div class="min-h-48 max-h-[55vh] overflow-y-auto">
          <Show
            when={!candidates.loading}
            fallback={<p class="py-8 text-center text-sm text-muted-foreground">正在搜索其他来源…</p>}
          >
            <Show
              when={(candidates() ?? []).length > 0}
              fallback={<p class="py-8 text-center text-sm text-muted-foreground">未找到可用来源</p>}
            >
              <div class="space-y-2">
                <For each={candidates() ?? []}>
                  {(candidate) => (
                    <Button
                      variant="outline"
                      class="h-auto w-full justify-start px-3 py-2 text-left"
                      disabled={busyId() != null}
                      onClick={() => void replaceWith(candidate)}
                    >
                      <span class="w-10 shrink-0 text-xs text-primary">
                        {trackSourceBadgeLabel(candidate)}
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate">{candidate.name}</span>
                        <span class="block truncate text-xs text-muted-foreground">
                          {candidate.artist} · {trackAlbumName(candidate)}
                        </span>
                      </span>
                    </Button>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
