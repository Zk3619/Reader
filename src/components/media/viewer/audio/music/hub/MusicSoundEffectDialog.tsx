/**
 * 播放详情：环境音 / 环绕调节弹窗
 */

import { createEffect, createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';
import {
  MusicSoundEffectFields,
  readMusicSoundEffectDraft,
  type MusicSoundEffectDraft,
} from '@/components/media/viewer/audio/music/hub/MusicSoundEffectFields';
import { setMusicSettings } from '@/lib/media/audio/music-settings';

export interface MusicSoundEffectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MusicSoundEffectDialog: Component<MusicSoundEffectDialogProps> = (props) => {
  const [draft, setDraft] = createSignal<MusicSoundEffectDraft>(readMusicSoundEffectDraft());

  createEffect(() => {
    if (!props.open) return;
    setDraft(readMusicSoundEffectDraft());
  });

  const cancel = () => props.onOpenChange(false);

  const confirm = () => {
    setMusicSettings(draft());
    props.onOpenChange(false);
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent class="sm:max-w-md" layout="app">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>环境音 / 环绕</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            调整卷积混响与环绕声像；确认后写入音乐设置并立即生效。
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>
        <div class="px-6 py-2">
          <MusicSoundEffectFields
            idPrefix="music-sound-effect-dialog"
            value={draft()}
            onChange={setDraft}
          />
        </div>
        <ViewerAppDialogFooter>
          <Button type="button" variant="outline" onClick={cancel}>
            取消
          </Button>
          <Button type="button" onClick={confirm}>
            确认
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
