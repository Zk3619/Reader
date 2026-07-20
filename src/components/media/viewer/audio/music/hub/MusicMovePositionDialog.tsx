import { createEffect, createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';
import { moveTracksToPosition } from '@/lib/media/audio/music-context-actions';
import type { AudioTrack } from '@/lib/media/audio/track-types';

export const MusicMovePositionDialog: Component<{
  open: boolean;
  playlistId: string;
  tracks: AudioTrack[];
  maxPosition: number;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}> = (props) => {
  const [value, setValue] = createSignal('1');
  const [busy, setBusy] = createSignal(false);

  createEffect(() => {
    if (props.open) setValue('1');
  });

  const submit = async () => {
    const position = Number(value());
    if (!Number.isFinite(position) || position < 1 || busy()) return;
    setBusy(true);
    try {
      await moveTracksToPosition(
        props.playlistId,
        props.tracks.map((track) => track.id),
        position - 1,
      );
      props.onChanged?.();
      props.onOpenChange(false);
    } catch (error) {
      showAppToast({
        title: '调整位置失败',
        description: toUserFacingMusicError(error),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent layout="plain" class="w-80 max-w-[calc(100dvw-2rem)]">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>调整位置</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            将所选 {props.tracks.length} 首歌曲移动到指定序号
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>
        <AppTextField>
          <AppTextFieldInput
            autofocus
            type="number"
            min="1"
            max={String(Math.max(1, props.maxPosition))}
            value={value()}
            onInput={(event) => setValue(event.currentTarget.value)}
            onKeyDown={(event: KeyboardEvent) => {
              if (event.key === 'Enter') void submit();
            }}
          />
        </AppTextField>
        <div class="flex justify-end gap-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>取消</Button>
          <Button disabled={busy()} onClick={() => void submit()}>确定</Button>
        </div>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
