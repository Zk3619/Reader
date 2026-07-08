import { AppTabs } from '@/components/shared/AppTabs';
import {
  AppSwitch,
  AppSwitchControl,
  AppSwitchLabel,
  AppSwitchThumb,
} from '@/components/shared/AppSwitch';
import { SettingsNumberField } from '@/components/settings/SettingsNumberField';
import {
  APP_TOAST_POSITION_LABELS,
  appToastPositionOptions,
  isCompactMobileViewport,
  MAX_APP_TOAST_VISIBLE_LIMIT,
  MIN_APP_TOAST_VISIBLE_LIMIT,
  normalizeAppToastExpand,
  normalizeAppToastPosition,
  normalizeAppToastVisibleLimit,
  type AppToastPosition,
} from '@/lib/ui/app-toast-config';
import { settingsState, settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';

/** 设置页：通知 Toast 位置、数量与堆叠样式 */
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

  const position = () =>
    normalizeAppToastPosition(settingsState.app.toastPosition, compactMobile());
  const positionOptions = () => appToastPositionOptions(compactMobile());
  const visibleLimit = () => normalizeAppToastVisibleLimit(settingsState.app.toastVisibleLimit);
  const expand = () => normalizeAppToastExpand(settingsState.app.toastExpand);

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="space-y-4">
        <div class="space-y-1">
          <h3 class="font-semibold text-foreground">通知 Toast</h3>
          <p class="text-sm text-muted-foreground">
            应用内操作反馈、脚本输出与进度提示的展示位置与数量。
          </p>
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

        <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2.5">
          <div class="min-w-0 flex-1 space-y-0.5">
            <p class="text-sm font-medium text-foreground">最大显示数量</p>
            <p class="text-xs text-muted-foreground">
              同屏最多保留的通知条数，超出时最早的通知将被收起。
            </p>
          </div>
          <SettingsNumberField
            value={visibleLimit()}
            min={MIN_APP_TOAST_VISIBLE_LIMIT}
            max={MAX_APP_TOAST_VISIBLE_LIMIT}
            onValueChange={(value) => void settingsStore.setToastVisibleLimit(value)}
          />
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2.5">
          <div class="min-w-0 flex-1 space-y-0.5">
            <p class="text-sm font-medium text-foreground">堆叠缩放</p>
            <p class="text-xs text-muted-foreground">
              开启后多条通知以 Sonner 原生缩放样式叠放；悬停可展开查看详情。
            </p>
          </div>
          <AppSwitch
            checked={expand()}
            onChange={(value) => void settingsStore.setToastExpand(value)}
          >
            <AppSwitchControl>
              <AppSwitchThumb />
            </AppSwitchControl>
            <AppSwitchLabel class="sr-only">堆叠缩放</AppSwitchLabel>
          </AppSwitch>
        </div>
      </div>
    </div>
  );
}
