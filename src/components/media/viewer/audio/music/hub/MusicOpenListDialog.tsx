/**
 * OpenList：通过 URL 打开在线歌单
 */

import { createEffect, createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  AppTextField,
  AppTextFieldInput,
  AppTextFieldLabel,
} from '@/components/shared/AppTextField';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';
import { openListFromUrlInput } from '@/stores/music-hub/songList';

export interface MusicOpenListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MusicOpenListDialog: Component<MusicOpenListDialogProps> = (props) => {
  const [url, setUrl] = createSignal('');
  const [loading, setLoading] = createSignal(false);

  createEffect(() => {
    if (!props.open) {
      setUrl('');
      setLoading(false);
    }
  });

  const submit = async () => {
    const value = url().trim();
    if (!value) return;
    setLoading(true);
    const ok = await openListFromUrlInput(value);
    setLoading(false);
    if (ok) {
      props.onOpenChange(false);
      setUrl('');
    } else {
      showAppToast({
        title: '无法识别歌单链接',
        variant: 'destructive',
      });
    }
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent layout="app" class="w-[calc(100dvw-2rem)] max-w-md">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>打开歌单链接</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            粘贴网易云等平台的歌单 URL 或 ID
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>

        <div class="px-6 pb-6">
          <AppTextField>
            <AppTextFieldLabel>歌单链接</AppTextFieldLabel>
            <AppTextFieldInput
              placeholder="粘贴歌单 URL 或 ID"
              value={url()}
              onInput={(e) => setUrl(e.currentTarget.value)}
              onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && void submit()}
            />
          </AppTextField>
        </div>

        <ViewerAppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={loading() || !url().trim()}>
            {loading() ? '解析中…' : '打开'}
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
