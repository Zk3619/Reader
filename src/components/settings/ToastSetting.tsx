import { Button } from '@/components/ui/button';
import { AppTabs } from '@/components/shared/AppTabs';
import {
  AppManualRadioGroup,
  AppManualRadioOption,
} from '@/components/shared/AppManualRadio';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  APP_TOAST_POSITION_LABELS,
  APP_TOAST_STYLE_DESCRIPTIONS,
  APP_TOAST_STYLE_LABELS,
  appToastPositionOptions,
  isCompactMobileViewport,
  normalizeAppToastPosition,
  normalizeAppToastStyle,
  type AppToastPosition,
  type AppToastStyle,
} from '@/lib/ui/app-toast-config';
import { settingsState, settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';
import { createEffect, createSignal, For, onCleanup, onMount } from 'solid-js';

const STYLE_OPTIONS: AppToastStyle[] = ['default', 'sonner', 'toast'];

/** 设置页：通知 Toast 风格与位置 */
export function ToastSetting() {
  const [compactMobile, setCompactMobile] = createSignal(isCompactMobileViewport());

  onMount(() => {
    const sync = () => setCompactMobile(isCompactMobileViewport());
    sync();
    window.addEventListener('resize', sync);
    onCleanup(() => window.removeEventListener('resize', sync));
  });

  createEffect(() => {
    const normalized = normalizeAppToastPosition(
      settingsState.app.toastPosition,
      compactMobile(),
    );
    if (normalized !== settingsState.app.toastPosition) {
      void settingsStore.setToastPosition(normalized);
    }
  });

  const style = () => normalizeAppToastStyle(settingsState.app.toastStyle);
  const position = () =>
    normalizeAppToastPosition(settingsState.app.toastPosition, compactMobile());
  const positionOptions = () => appToastPositionOptions(compactMobile());

  const previewToast = () => {
    showAppToast({
      title: '通知预览',
      description: `当前为「${APP_TOAST_STYLE_LABELS[style()]}」风格，位置：${APP_TOAST_POSITION_LABELS[position()]}`,
      variant: 'info',
    });
  };

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="space-y-4">
        <div class="space-y-1">
          <h3 class="font-semibold text-foreground">通知 Toast</h3>
          <p class="text-sm text-muted-foreground">
            应用内操作反馈、脚本输出与进度提示的展示风格与位置。
          </p>
        </div>

        <div class="space-y-2">
          <p class="text-sm font-medium text-foreground">风格</p>
          <AppManualRadioGroup class="flex flex-col gap-2">
            <For each={STYLE_OPTIONS}>
              {(value) => (
                <AppManualRadioOption
                  selected={style() === value}
                  onSelect={() => void settingsStore.setToastStyle(value)}
                  class={cn(
                    'h-max items-start gap-3 rounded-lg border border-border/40 px-3 py-2.5',
                    style() === value ? 'bg-muted/30' : 'bg-transparent',
                  )}
                >
                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="text-sm font-medium text-foreground">
                      {APP_TOAST_STYLE_LABELS[value]}
                    </span>
                    <span class="text-xs text-muted-foreground">
                      {APP_TOAST_STYLE_DESCRIPTIONS[value]}
                    </span>
                  </div>
                </AppManualRadioOption>
              )}
            </For>
          </AppManualRadioGroup>
        </div>

        <div class="space-y-2">
          <AppTabs
            layout="stacked"
            variant="settings-equal"
            label="位置"
            value={position()}
            options={positionOptions()}
            labels={APP_TOAST_POSITION_LABELS}
            listClass={cn(
              positionOptions().length === 2 ? 'grid grid-cols-2' : 'grid grid-cols-2 sm:grid-cols-3',
            )}
            ariaLabel="通知位置"
            hint={
              compactMobile()
                ? '窄屏移动端仅支持顶部中心与底部中心。'
                : '桌面与宽屏可选择四角与上下居中位置。'
            }
            onChange={(value) => {
              void settingsStore.setToastPosition(value as AppToastPosition);
            }}
          />
        </div>

        <Button type="button" variant="outline" size="sm" onClick={previewToast}>
          预览通知
        </Button>
      </div>
    </div>
  );
}
