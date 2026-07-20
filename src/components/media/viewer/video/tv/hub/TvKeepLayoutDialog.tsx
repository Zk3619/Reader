/**
 * 影视收藏布局对话框：分组导航 + 标准列表 / 网格 + 间距
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
  bookshelfStandardListViewModeOptions,
  gridViewModeOptions,
  type ViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import {
  getTvKeepUi,
  updateTvKeepLayout,
  type TvKeepGroupStyle,
} from '@/stores/tv-hub/tv-keep-ui';
import {
  appDialogSettingsScrollTrack,
  appDialogSettingsShell,
  dialogScrollFrameFlex,
} from '@/lib/ui/viewport-classes';

const sectionPanelClass =
  'rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3';

const sectionTitleClass = 'text-sm font-medium leading-none text-foreground';

const GROUP_STYLE_OPTIONS: Array<{ value: TvKeepGroupStyle; label: string; hint: string }> = [
  { value: 'tabs', label: '分组 Tab', hint: '页头第二行横向 Tab' },
  { value: 'select', label: '工具栏下拉', hint: '操作区旁紧凑选择框' },
  { value: 'dropdown', label: '分组下拉', hint: '点击页头标题切换分组' },
];

export interface TvKeepLayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TvKeepLayoutDialog(props: TvKeepLayoutDialogProps) {
  const ui = getTvKeepUi;
  const [localViewMode, setLocalViewMode] = createSignal<ViewMode>(ui().viewMode);
  const [spacingValue, setSpacingValue] = createSignal(ui().spacing);
  const [localGroupStyle, setLocalGroupStyle] = createSignal<TvKeepGroupStyle>(ui().groupStyle);

  createEffect(() => {
    if (props.open) {
      setLocalViewMode(ui().viewMode);
      setSpacingValue(ui().spacing);
      setLocalGroupStyle(ui().groupStyle);
    }
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setLocalViewMode(ui().viewMode);
      setSpacingValue(ui().spacing);
      setLocalGroupStyle(ui().groupStyle);
    }
    props.onOpenChange(open);
  };

  function handleConfirm() {
    updateTvKeepLayout({
      viewMode: localViewMode(),
      spacing: spacingValue(),
      groupStyle: localGroupStyle(),
    });
    props.onOpenChange(false);
  }

  function handleCancel() {
    setLocalViewMode(ui().viewMode);
    setSpacingValue(ui().spacing);
    setLocalGroupStyle(ui().groupStyle);
    props.onOpenChange(false);
  }

  return (
    <AppDialog open={props.open} onOpenChange={handleOpenChange}>
      <AppDialogContent class={appDialogSettingsShell}>
        <AppDialogHeader>
          <AppDialogTitle>收藏布局</AppDialogTitle>
          <AppDialogDescription>
            分组导航、列表形式与间距（对齐书架布局）
          </AppDialogDescription>
        </AppDialogHeader>

        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogSettingsScrollTrack}>
          <section class={sectionPanelClass}>
            <Label class={sectionTitleClass}>分组导航</Label>
            <p class="text-xs text-muted-foreground">收藏页分组切换方式</p>
            <AppManualRadioGroup class="flex flex-col gap-0.5">
              <For each={GROUP_STYLE_OPTIONS}>
                {(opt) => (
                  <AppManualRadioOption
                    selected={localGroupStyle() === opt.value}
                    onSelect={() => setLocalGroupStyle(opt.value)}
                  >
                    <span class="flex min-w-0 flex-col">
                      <span>{opt.label}</span>
                      <span class="text-xs font-normal text-muted-foreground">{opt.hint}</span>
                    </span>
                  </AppManualRadioOption>
                )}
              </For>
            </AppManualRadioGroup>
          </section>

          <section class={sectionPanelClass}>
            <Label class={sectionTitleClass}>列表形式</Label>
            <p class="text-xs text-muted-foreground">
              标准列表为横向卡；网格为竖向封面卡。列数固定，卡片随视口拉伸。
            </p>
            <AppManualRadioGroup class="w-full">
              <div class="grid grid-cols-2 items-start gap-3">
                <div class="space-y-2">
                  <p class="text-xs font-medium text-muted-foreground">标准列表</p>
                  <div class="flex flex-col gap-0.5">
                    <For each={bookshelfStandardListViewModeOptions}>
                      {(option) => (
                        <AppManualRadioOption
                          selected={localViewMode() === option.value}
                          onSelect={() => setLocalViewMode(option.value as ViewMode)}
                        >
                          <span>{option.label}</span>
                        </AppManualRadioOption>
                      )}
                    </For>
                  </div>
                </div>
                <div class="space-y-2">
                  <p class="text-xs font-medium text-muted-foreground">网格</p>
                  <div class="flex flex-col gap-0.5">
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
                  </div>
                </div>
              </div>
            </AppManualRadioGroup>
          </section>

          <section class={sectionPanelClass}>
            <div class="flex items-baseline justify-between gap-2">
              <Label class={sectionTitleClass}>列表 / 网格间距</Label>
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
