/**
 * 跳过片头片尾（对齐 Legado AudioSkipCredits）
 */

import { createSignal, createEffect } from 'solid-js';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import { Button } from '@/components/ui/button';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import type { Book } from '@/types';

export interface AudioSkipCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book;
  openCredits: number;
  closeCredits: number;
  onSave: (openCredits: number, closeCredits: number) => void;
}

export function AudioSkipCreditsDialog(props: AudioSkipCreditsDialogProps) {
  const [openSec, setOpenSec] = createSignal(0);
  const [closeSec, setCloseSec] = createSignal(0);

  createEffect(() => {
    if (!props.open) return;
    setOpenSec(props.openCredits);
    setCloseSec(props.closeCredits);
  });

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent layout="app" class="max-w-sm">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>跳过片头片尾</ViewerAppDialogTitle>
        </ViewerAppDialogHeader>
        <div class="flex flex-col gap-6 px-4 py-2">
          <div class="space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span>片头（秒）</span>
              <span class="tabular-nums text-muted-foreground">{openSec()}s</span>
            </div>
            <Slider
              minValue={0}
              maxValue={300}
              step={1}
              value={[openSec()]}
              onChange={(v) => setOpenSec(v[0] ?? 0)}
            >
              <SliderTrack>
                <SliderFill />
              </SliderTrack>
              <SliderThumb />
            </Slider>
          </div>
          <div class="space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span>片尾（秒）</span>
              <span class="tabular-nums text-muted-foreground">{closeSec()}s</span>
            </div>
            <Slider
              minValue={0}
              maxValue={300}
              step={1}
              value={[closeSec()]}
              onChange={(v) => setCloseSec(v[0] ?? 0)}
            >
              <SliderTrack>
                <SliderFill />
              </SliderTrack>
              <SliderThumb />
            </Slider>
          </div>
        </div>
        <ViewerAppDialogFooter class="px-4 pb-4">
          <Button
            class="w-full"
            onClick={() => {
              props.onSave(openSec(), closeSec());
              props.onOpenChange(false);
            }}
          >
            保存
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
}
