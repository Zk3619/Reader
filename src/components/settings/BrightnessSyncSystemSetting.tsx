/**
 * 设置页：阅读亮度是否同步 Android 系统亮度
 */

import { Show } from 'solid-js';
import { AppSwitch, AppSwitchControl, AppSwitchLabel, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { showAppToast } from '@/components/shared/AppToasts';
import { isAndroid, isTauri } from '@/lib/platform/detect';
import { openDisplayWriteSettings } from '@/lib/platform/display-reader';
import { useReadingDisplaySettings } from '@/lib/settings/use-reading-display-settings';
import { Button } from '@/components/ui/button';

export function BrightnessSyncSystemSetting() {
  const { syncSystemBrightness, loading, persistSyncSystemBrightness } =
    useReadingDisplaySettings();

  const onToggle = (checked: boolean) => {
    persistSyncSystemBrightness(checked);
    showAppToast({
      title: '阅读亮度设置已保存',
      description: checked
        ? '手动调节亮度时将尝试同步系统亮度滑条（需授权「修改系统设置」）'
        : '手动调节亮度仅作用于应用内显示',
      variant: 'info',
    });
  };

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <h3 class="mb-2 font-semibold text-foreground">亮度同步系统</h3>
      <p class="mb-4 text-sm text-muted-foreground">
        阅读器手动亮度默认仅调节应用内显示（窗口亮度 + 遮罩降级，无需系统权限）。
        开启后，手动亮度还会写入 Android 系统亮度，与下拉快捷设置滑条一致。
      </p>

      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0 flex-1 space-y-0.5">
          <span class="text-sm">同步控制系统亮度</span>
          <p class="text-xs text-muted-foreground">
            默认关闭。开启后需在系统设置中为 Reader 授予「修改系统设置」权限。
          </p>
        </div>
        <AppSwitch
          checked={syncSystemBrightness()}
          disabled={loading()}
          onChange={onToggle}
        >
          <AppSwitchControl>
            <AppSwitchThumb />
          </AppSwitchControl>
          <AppSwitchLabel class="sr-only">同步控制系统亮度</AppSwitchLabel>
        </AppSwitch>
      </div>

      <Show when={isTauri() && isAndroid() && syncSystemBrightness()}>
        <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-border/40 pt-4">
          <p class="text-xs text-muted-foreground">
            若调节后系统亮度未变化，请授予「修改系统设置」权限：
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void openDisplayWriteSettings()}
          >
            打开权限设置
          </Button>
        </div>
      </Show>
    </div>
  );
}
