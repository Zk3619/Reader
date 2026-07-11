import { For, Show } from 'solid-js';
import { ThemeSwitch } from '@/components/shell/ThemeSwitch';
import { ThemeScheduleSetting } from '@/components/settings/ThemeScheduleSetting';
import { AppSwitch, AppSwitchControl, AppSwitchLabel, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { ShellLayoutSetting } from '@/components/shell/ShellLayoutSetting';
import { MediaPlayerChromeSetting } from '@/components/settings/MediaPlayerChromeSetting';
import { ToastSetting } from '@/components/settings/ToastSetting';
import { VisualEffectsSetting } from '@/components/settings/VisualEffectsSetting';
import { ThemePresetListSetting } from '@/components/settings/ThemePresetListSetting';
import { CustomThemeSetting } from '@/components/settings/CustomThemeSetting';
import { StorageAndWebViewSetting } from '@/components/settings/StorageAndWebViewSetting';
import { DataBackupSetting } from '@/components/settings/DataBackupSetting';
import { settingsStore } from '@/stores/settings';
import type { SettingsCategoryId } from '@/lib/settings/settings-catalog';
import { SettingItemAnchor } from '@/pages/settings/SettingItemAnchor';

export interface SettingsCategoryContentProps {
  categoryId: SettingsCategoryId;
  highlightedItemId?: string | null;
  onOpenThemeStudio?: () => void;
  onOpenThemesManage?: () => void;
}

export function SettingsCategoryContent(props: SettingsCategoryContentProps) {
  const highlight = (id: string) => props.highlightedItemId === id;

  return (
    <div class="w-full space-y-4">
      <Show when={props.categoryId === 'appearance'}>
        <SettingItemAnchor id="theme" highlighted={highlight('theme')}>
          <div class="rounded-2xl border border-border/50 bg-card p-6">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-semibold text-foreground">主题</h3>
                <p class="text-sm text-muted-foreground">
                  浅色、深色、跟随系统或按时切换；左键循环切换，右键或长按选择
                </p>
              </div>
              <ThemeSwitch withTooltip={false} />
            </div>
          </div>
        </SettingItemAnchor>

        <SettingItemAnchor id="theme-schedule" highlighted={highlight('theme-schedule')}>
          <ThemeScheduleSetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="reduce-motion" highlighted={highlight('reduce-motion')}>
          <div class="rounded-2xl border border-border/50 bg-card p-6">
            <div class="flex items-center justify-between gap-4">
              <div class="space-y-0.5">
                <h3 class="font-semibold text-foreground">减少动效</h3>
                <p class="text-sm text-muted-foreground">
                  关闭或缩短动画与过渡，适合对动效敏感或追求性能的用户
                </p>
              </div>
              <AppSwitch
                checked={settingsStore.state.app.reduceMotion}
                onChange={(v: boolean) => settingsStore.setReduceMotion(!!v)}
              >
                <AppSwitchControl class="data-disabled:cursor-not-allowed">
                  <AppSwitchThumb />
                </AppSwitchControl>
                <AppSwitchLabel class="sr-only">减少动效</AppSwitchLabel>
              </AppSwitch>
            </div>
          </div>
        </SettingItemAnchor>

        <SettingItemAnchor id="visual-effects" highlighted={highlight('visual-effects')}>
          <VisualEffectsSetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="theme-presets" highlighted={highlight('theme-presets')}>
          <ThemePresetListSetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="custom-theme" highlighted={highlight('custom-theme')}>
          <CustomThemeSetting
            onOpenStudio={props.onOpenThemeStudio}
            onOpenThemesManage={props.onOpenThemesManage}
          />
        </SettingItemAnchor>

        <SettingItemAnchor id="show-tooltips" highlighted={highlight('show-tooltips')}>
          <div class="rounded-2xl border border-border/50 bg-card p-6">
            <div class="flex items-center justify-between gap-4">
              <div class="space-y-0.5">
                <h3 class="font-semibold text-foreground">显示工具提示</h3>
                <p class="text-sm text-muted-foreground">
                  关闭后，全应用按钮与控件的悬停说明将不再显示
                </p>
              </div>
              <AppSwitch
                checked={settingsStore.state.app.showTooltips !== false}
                onChange={(v: boolean) => void settingsStore.setShowTooltips(!!v)}
              >
                <AppSwitchControl class="data-disabled:cursor-not-allowed">
                  <AppSwitchThumb />
                </AppSwitchControl>
                <AppSwitchLabel class="sr-only">显示工具提示</AppSwitchLabel>
              </AppSwitch>
            </div>
          </div>
        </SettingItemAnchor>

        <SettingItemAnchor id="toast" highlighted={highlight('toast')}>
          <ToastSetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="shell-layout" highlighted={highlight('shell-layout')}>
          <ShellLayoutSetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="media-player-chrome" highlighted={highlight('media-player-chrome')}>
          <MediaPlayerChromeSetting />
        </SettingItemAnchor>
      </Show>

      <Show when={props.categoryId === 'storage'}>
        <SettingItemAnchor id="storage-webview" highlighted={highlight('storage-webview')}>
          <StorageAndWebViewSetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="database-backup" highlighted={highlight('database-backup')}>
          <div class="rounded-2xl border border-border/50 bg-card p-6">
            <div class="mb-4">
              <h3 class="mb-2 font-semibold text-foreground">数据备份与恢复</h3>
              <p class="text-sm text-muted-foreground">
                导出 ZIP 本地备份，或从 ZIP / 数据库文件恢复（参考 Legado 备份格式）
              </p>
            </div>
            <DataBackupSetting />
          </div>
        </SettingItemAnchor>
      </Show>

      <Show when={props.categoryId === 'other'}>
        <SettingItemAnchor id="tech-stack" highlighted={highlight('tech-stack')}>
          <div class="rounded-2xl border border-dashed border-border bg-muted/30 p-6">
            <h3 class="mb-3 font-semibold text-foreground">技术栈</h3>
            <div class="flex flex-wrap gap-2">
              <For each={['Tauri 2.0', 'SolidJS', 'TailwindCSS v4', 'solid-ui', 'Kobalte']}>
                {(tech) => (
                  <span class="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
                    {tech}
                  </span>
                )}
              </For>
            </div>
          </div>
        </SettingItemAnchor>
      </Show>
    </div>
  );
}
