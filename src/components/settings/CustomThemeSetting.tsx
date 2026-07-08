/**
 * 设置页 — 自定义主题入口
 */

import { Button } from '@/components/ui/button';
import { SettingsIcon } from '@/components/shared/icons';
import { themeStudioStore } from '@/stores/theme-studio';

export interface CustomThemeSettingProps {
  onOpenStudio?: () => void;
}

export function CustomThemeSetting(props: CustomThemeSettingProps) {
  const open = () => {
    themeStudioStore.openStudio({ entry: 'settings', scope: 'all' });
    props.onOpenStudio?.();
  };

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="space-y-1">
          <h3 class="font-semibold text-foreground">自定义主题</h3>
          <p class="text-sm text-muted-foreground">
            打开主题工作室，按组件精细调整主程序与阅读器样式，支持预设保存、导入导出与高级特效
          </p>
        </div>
        <Button class="cursor-pointer gap-2 shrink-0" onClick={open}>
          <SettingsIcon class="h-4 w-4" />
          打开主题工作室
        </Button>
      </div>
    </div>
  );
}
