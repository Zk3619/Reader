import { For, Show, createResource, createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppDialogScrollBody } from '@/components/shared/AppDialog';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';
import { replaceTrackInPlaylist } from '@/lib/database/audio-library';
import { findMusic } from '@/lib/media/audio/music-sdk/find-music';
import {
  trackAlbumName,
  trackSourceBadgeLabel,
} from '@/lib/media/audio/music-search-result-ui';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { replaceTrackInQueue } from '@/stores/viewer/media/audio';
import {
  appDialogScrollBodySpaceY3,
  dialogScrollFrameFlex,
} from '@/lib/ui/viewport-classes';

const sourceOptionClass =
  'h-auto w-full justify-start rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-left transition-colors hover:bg-muted/40';

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
      <ViewerAppDialogContent layout="app" class="w-[calc(100dvw-2rem)] max-w-lg">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>歌曲换源</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            为「{props.track.name}」选择其他来源
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>

        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogScrollBodySpaceY3}>
          <Show
            when={!candidates.loading}
            fallback={
              <div class="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-4">
                <div class="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
                <p class="text-sm text-muted-foreground">正在搜索其他来源…</p>
              </div>
            }
          >
            <Show
              when={(candidates() ?? []).length > 0}
              fallback={
                <p class="py-8 text-center text-sm text-muted-foreground">未找到可用来源</p>
              }
            >
              <div class="space-y-2">
                <For each={candidates() ?? []}>
                  {(candidate) => (
                    <Button
                      variant="ghost"
                      class={sourceOptionClass}
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
        </AppDialogScrollBody>

        <ViewerAppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            关闭
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
