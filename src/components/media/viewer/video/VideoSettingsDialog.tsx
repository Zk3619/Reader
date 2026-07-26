/**
 * 视频播放设置（对齐 Legado dialog_video_settings）
 */

import { createEffect, createSignal } from 'solid-js';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';
import { Button } from '@/components/ui/button';
import { ChapterBodyPrefetchControls } from '@/components/media/viewer/ChapterBodyPrefetchControls';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import {
  getVideoPlayConfig,
  longPressSpeedToRate,
  persistVideoAppConfig,
  type VideoAppConfig,
} from '@/lib/media/video/book-video-config';

export interface VideoSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VideoSettingsDialog(props: VideoSettingsDialogProps) {
  const [draft, setDraft] = createSignal<VideoAppConfig>(getVideoPlayConfig(null));

  createEffect(() => {
    if (props.open) {
      const { autoPlay, startFull, longPressSpeed } = getVideoPlayConfig(null);
      setDraft({ autoPlay, startFull, longPressSpeed });
    }
  });

  const save = () => {
    persistVideoAppConfig(draft());
    props.onOpenChange(false);
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent layout="app" class="max-w-sm">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>视频设置</ViewerAppDialogTitle>
        </ViewerAppDialogHeader>
        <div class="flex flex-col gap-4 px-4 py-2">
          <label class="flex cursor-pointer items-center justify-between gap-3 text-sm">
            <span>自动播放</span>
            <input
              type="checkbox"
              class="h-4 w-4"
              checked={draft().autoPlay}
              onChange={(e) => setDraft((d) => ({ ...d, autoPlay: e.currentTarget.checked }))}
            />
          </label>
          <p class="text-muted-foreground -mt-2 text-xs">
            与播放器设置「自动开播」共用，影视模块同步生效
          </p>
          <label
            class="flex cursor-pointer items-center justify-between gap-3 text-sm"
            classList={{ 'opacity-50': !draft().autoPlay }}
          >
            <span>打开时全屏</span>
            <input
              type="checkbox"
              class="h-4 w-4"
              disabled={!draft().autoPlay}
              checked={draft().startFull}
              onChange={(e) => setDraft((d) => ({ ...d, startFull: e.currentTarget.checked }))}
            />
          </label>
          <div class="space-y-2">
            <div class="flex justify-between text-sm">
              <span>长按倍速</span>
              <span class="tabular-nums">
                {longPressSpeedToRate(draft().longPressSpeed).toFixed(1)}x
              </span>
            </div>
            <Slider
              minValue={5}
              maxValue={60}
              step={1}
              value={[draft().longPressSpeed]}
              onChange={(v) => setDraft((d) => ({ ...d, longPressSpeed: v[0] ?? 30 }))}
            >
              <SliderTrack>
                <SliderFill />
              </SliderTrack>
              <SliderThumb />
            </Slider>
            <Button
              variant="outline"
              size="sm"
              class="w-full"
              onClick={() => setDraft((d) => ({ ...d, longPressSpeed: 30 }))}
            >
              恢复默认（3.0x）
            </Button>
          </div>
          <ChapterBodyPrefetchControls viewer="video" />
        </div>
        <div class="px-4 pb-4">
          <Button class="w-full" onClick={save}>
            确定
          </Button>
        </div>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
}
