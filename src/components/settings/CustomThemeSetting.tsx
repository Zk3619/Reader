/**
 * 设置页 — 自定义主题入口
 */

import { Button } from '@/components/ui/button';
import { SettingsIcon, FolderTreeIcon } from '@/components/shared/icons';
import { themeStudioStore } from '@/stores/theme-studio';
import { settingsStore } from '@/stores/settings';
import {
  BUILTIN_DEFAULT_PRESET_ID,
  getThemePreset,
} from '@/lib/database/theme-presets';

export interface CustomThemeSettingProps {
  onOpenStudio?: () => void;
  onOpenThemesManage?: () => void;
}

export function CustomThemeSetting(props: CustomThemeSettingProps) {
  const open = async () => {
    const activeId = settingsStore.state.app.activeThemePresetId ?? BUILTIN_DEFAULT_PRESET_ID;
    const record = await getThemePreset(activeId);
    themeStudioStore.openStudio({
      entry: 'settings',
      scope: 'all',
      pack: record?.manifest,
      presetId: record?.id ?? null,
    });
    props.onOpenStudio?.();
  };

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="space-y-1">
          <h3 class="font-semibold text-foreground">自定义主题</h3>
          <p class="text-sm text-muted-foreground">
            在主题工作室中按组件精细调整主程序与阅读器样式；可在主题管理页批量导入、导出与切换预设。
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" class="cursor-pointer gap-2" onClick={() => props.onOpenThemesManage?.()}>
            <FolderTreeIcon class="h-4 w-4" />
            主题管理
          </Button>
          <Button class="cursor-pointer gap-2" onClick={() => void open()}>
            <SettingsIcon class="h-4 w-4" />
            打开主题工作室
          </Button>
        </div>
      </div>
    </div>
  );
}
