/**
 * 在线歌单布局对话框：列表形式（横向/网格列数）+ 间距
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
import { AppSlider } from '@/components/shared/AppSlider';
import {
  bookshelfStandardListViewModeOptions,
  gridViewModeOptions,
  type ViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import {
  getMusicSongListUi,
  updateMusicSongListLayout,
} from '@/stores/music-hub/music-songlist-ui';
import {
  appDialogSettingsScrollTrack,
  appDialogSettingsShell,
  dialogScrollFrameFlex,
} from '@/lib/ui/viewport-classes';

const sectionPanelClass =
  'rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3';

const sectionTitleClass = 'text-sm font-medium leading-none text-foreground';

export interface MusicSongListLayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MusicSongListLayoutDialog(props: MusicSongListLayoutDialogProps) {
  const ui = getMusicSongListUi;
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
    updateMusicSongListLayout({ viewMode: localViewMode(), spacing: spacingValue() });
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
          <AppDialogTitle>歌单布局</AppDialogTitle>
          <AppDialogDescription>自定义在线歌单列表的形式、列数与间距</AppDialogDescription>
        </AppDialogHeader>

        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogSettingsScrollTrack}>
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
                aria-label="减小列表与网格间距"
              >
                <span class="text-sm">-</span>
              </Button>
              <AppSlider
                value={spacingValue()}
                onChange={(value) => setSpacingValue(value)}
                min={0}
                max={24}
                step={1}
                class="min-w-0 flex-1"
                aria-label="列表与网格间距"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                class="size-8 shrink-0"
                onClick={() => setSpacingValue(Math.min(24, spacingValue() + 1))}
                disabled={spacingValue() >= 24}
                aria-label="增大列表与网格间距"
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
