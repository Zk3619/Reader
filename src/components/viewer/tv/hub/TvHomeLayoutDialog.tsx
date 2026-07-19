/**
 * 影视首页布局对话框：网格列数 + 间距（对齐书架布局）
 */

import { createEffect, createSignal, For } from 'solid-js';
import {
  AppDialogScrollBody,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import {
  AppManualRadioGroup,
  AppManualRadioOption,
} from '@/components/shared/AppManualRadio';
import { Label } from '@/components/ui/label';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import {
  gridViewModeOptions,
  type ViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import { getTvHomeUi, updateTvHomeLayout } from '@/stores/tv-hub/tv-home-ui';
import {
  appDialogSettingsScrollTrack,
  appDialogSettingsShell,
  dialogScrollFrameFlex,
} from '@/lib/ui/viewport-classes';

const sectionPanelClass =
  'rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3';

const sectionTitleClass = 'text-sm font-medium leading-none text-foreground';

export interface TvHomeLayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TvHomeLayoutDialog(props: TvHomeLayoutDialogProps) {
  const ui = getTvHomeUi;
  const [localViewMode, setLocalViewMode] = createSignal<ViewMode>(ui().viewMode);
  const [spacingValue, setSpacingValue] = createSignal(ui().spacing);

  createEffect(() => {
    if (props.open) {
      setLocalViewMode(ui().viewMode);
      setSpacingValue(ui().spacing);
    }
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setLocalViewMode(ui().viewMode);
      setSpacingValue(ui().spacing);
    }
    props.onOpenChange(open);
  };

  function handleConfirm() {
    updateTvHomeLayout({ viewMode: localViewMode(), spacing: spacingValue() });
    props.onOpenChange(false);
  }

  function handleCancel() {
    setLocalViewMode(ui().viewMode);
    setSpacingValue(ui().spacing);
    props.onOpenChange(false);
  }

  return (
    <AppDialog open={props.open} onOpenChange={handleOpenChange}>
      <AppDialogContent class={appDialogSettingsShell}>
        <AppDialogHeader>
          <AppDialogTitle>影视布局</AppDialogTitle>
          <AppDialogDescription>自定义首页点播列表的列数与间距</AppDialogDescription>
        </AppDialogHeader>

        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogSettingsScrollTrack}>
          <section class={sectionPanelClass}>
            <Label class={sectionTitleClass}>网格列数</Label>
            <p class="text-xs text-muted-foreground">
              列数固定，卡片随视口宽度拉伸（与书架网格一致）。
            </p>
            <AppManualRadioGroup class="flex flex-col gap-0.5">
              <For each={gridViewModeOptions}>
                {(option) => (
                  <AppManualRadioOption
                    selected={localViewMode() === option.value}
                    onSelect={() => setLocalViewMode(option.value as ViewMode)}
                  >
                    <span>{option.label}</span>
                  </AppManualRadioOption>
                )}
              </For>
            </AppManualRadioGroup>
          </section>

          <section class={sectionPanelClass}>
            <div class="flex items-baseline justify-between gap-2">
              <Label class={sectionTitleClass}>列表间距</Label>
              <span class="tabular-nums text-sm text-muted-foreground">{spacingValue()}</span>
            </div>
            <div class="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                class="size-8 shrink-0"
                onClick={() => setSpacingValue(Math.max(0, spacingValue() - 1))}
                disabled={spacingValue() <= 0}
                aria-label="减小列表间距"
              >
                <span class="text-sm">-</span>
              </Button>
              <Slider
                value={[spacingValue()]}
                onChange={(values: number[]) => {
                  if (Array.isArray(values) && values.length > 0) {
                    setSpacingValue(values[0]);
                  }
                }}
                minValue={0}
                maxValue={24}
                step={1}
                class="min-w-0 flex-1"
              >
                <SliderTrack>
                  <SliderFill />
                </SliderTrack>
                <SliderThumb />
              </Slider>
              <Button
                type="button"
                variant="outline"
                size="icon"
                class="size-8 shrink-0"
                onClick={() => setSpacingValue(Math.min(24, spacingValue() + 1))}
                disabled={spacingValue() >= 24}
                aria-label="增大列表间距"
              >
                <span class="text-sm">+</span>
              </Button>
            </div>
          </section>
        </AppDialogScrollBody>

        <AppDialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button type="button" onClick={handleConfirm}>
            确定
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
