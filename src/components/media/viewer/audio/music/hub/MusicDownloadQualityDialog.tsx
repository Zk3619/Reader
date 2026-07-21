import { For, Show, createMemo, createSignal, type Component } from 'solid-js';
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
import {
  listBatchDownloadQualityOptions,
  listTrackDownloadQualityOptions,
} from '@/lib/media/audio/music-quality';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import { downloadTracks } from '@/lib/media/audio/music-context-actions';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import {
  appDialogScrollBodySpaceY3,
  dialogScrollFrameFlex,
} from '@/lib/ui/viewport-classes';

const qualityOptionClass =
  'h-10 w-full rounded-lg border border-border/50 bg-muted/20 transition-colors hover:bg-muted/40';

export interface MusicDownloadQualityDialogProps {
  open: boolean;
  tracks: AudioTrack[];
  playlistId?: string | null;
  onOpenChange: (open: boolean) => void;
}

export const MusicDownloadQualityDialog: Component<MusicDownloadQualityDialogProps> = (props) => {
  const [busy, setBusy] = createSignal(false);

  const downloadable = createMemo(() =>
    props.tracks.filter((track) => track.source !== 'local'),
  );

  const options = createMemo(() => {
    const list = downloadable();
    if (list.length === 1) return listTrackDownloadQualityOptions(list[0]);
    return listBatchDownloadQualityOptions(list);
  });

  const showDowngradeHint = createMemo(() => {
    const list = downloadable();
    return list.length > 1 && options().some((item) => item.quality === 'flac24bit');
  });

  const titleText = createMemo(() => {
    const list = downloadable();
    if (list.length === 1) {
      const track = list[0]!;
      return `${track.name} · ${track.artist || '未知'}`;
    }
    return `已选择 ${list.length} 首歌曲，请选择要下载的音质`;
  });

  const confirm = async (quality: MusicQuality) => {
    if (busy()) return;
    const list = downloadable();
    if (list.length === 0) {
      showAppToast({ title: '没有可下载的歌曲', variant: 'warning' });
      props.onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      await downloadTracks(list, props.playlistId, quality);
      props.onOpenChange(false);
    } catch (error) {
      showAppToast({
        title: '加入下载失败',
        description: toUserFacingMusicError(error),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent layout="app" class="w-[calc(100dvw-2rem)] max-w-sm">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>选择下载音质</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>{titleText()}</ViewerAppDialogDescription>
        </ViewerAppDialogHeader>

        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogScrollBodySpaceY3}>
          <Show when={showDowngradeHint()}>
            <p class="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              部分曲目可能不支持所选音质，将自动降档下载。
            </p>
          </Show>
          <Show
            when={options().length > 0}
            fallback={<p class="py-4 text-center text-sm text-muted-foreground">暂无可用音质</p>}
          >
            <div class="flex flex-col gap-2">
              <For each={options()}>
                {(item) => (
                  <Button
                    variant="ghost"
                    class={qualityOptionClass}
                    disabled={busy()}
                    onClick={() => void confirm(item.quality)}
                  >
                    {item.label}
                  </Button>
                )}
              </For>
            </div>
          </Show>
        </AppDialogScrollBody>

        <ViewerAppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
