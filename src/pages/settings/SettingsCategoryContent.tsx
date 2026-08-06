import { Show } from 'solid-js';
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
import { RememberedChoicesSetting } from '@/components/settings/RememberedChoicesSetting';
import {
  AboutProgramSetting,
  GeneralProgramSetting,
  NetworkProgramSetting,
  WindowSystemSetting,
} from '@/components/settings/MainProgramSettings';
import { MediaFocusSetting } from '@/components/settings/MediaFocusSetting';
import { WebServiceSettingBlock } from '@/components/settings/WebServiceSetting';
import { CookieHubSetting } from '@/components/settings/CookieHubSetting';
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
      <Show when={props.categoryId === 'general'}>
        <SettingItemAnchor
          id="general-preferences"
          highlighted={highlight('general-preferences')}
        >
          <GeneralProgramSetting />
        </SettingItemAnchor>
        <SettingItemAnchor id="media-focus" highlighted={highlight('media-focus')}>
          <MediaFocusSetting />
        </SettingItemAnchor>
      </Show>

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

      <Show when={props.categoryId === 'window-system'}>
        <SettingItemAnchor
          id="desktop-integration"
          highlighted={highlight('desktop-integration')}
        >
          <WindowSystemSetting />
        </SettingItemAnchor>
      </Show>

      <Show when={props.categoryId === 'network'}>
        <SettingItemAnchor id="network-defaults" highlighted={highlight('network-defaults')}>
          <NetworkProgramSetting />
        </SettingItemAnchor>

        <SettingItemAnchor id="web-service" highlighted={highlight('web-service')}>
          <WebServiceSettingBlock />
        </SettingItemAnchor>

        <SettingItemAnchor id="cookie-hub" highlighted={highlight('cookie-hub')}>
          <CookieHubSetting />
        </SettingItemAnchor>
      </Show>

      <Show when={props.categoryId === 'storage'}>
        <SettingItemAnchor id="storage-webview" highlighted={highlight('storage-webview')}>
          <StorageAndWebViewSetting />
        </SettingItemAnchor>

        <SettingItemAnchor
          id="remembered-choices"
          highlighted={highlight('remembered-choices')}
        >
          <RememberedChoicesSetting scope="main" />
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

      <Show when={props.categoryId === 'about'}>
        <SettingItemAnchor id="about-reader" highlighted={highlight('about-reader')}>
          <AboutProgramSetting />
        </SettingItemAnchor>
      </Show>
    </div>
  );
}
