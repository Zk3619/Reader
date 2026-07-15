import type { JSX } from 'solid-js';
import { AppSwitch, AppSwitchControl, AppSwitchLabel, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { AppTabs } from '@/components/shared/AppTabs';
import { SettingsNumberField } from '@/components/settings/SettingsNumberField';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import {
  DEFAULT_APP_FONT_FAMILY,
  DEFAULT_APP_FONT_SIZE,
  DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS,
  DEFAULT_NETWORK_RETRY_COUNT,
  DEFAULT_STARTUP_PAGE,
  detectMainProgramRuntime,
  desktopIntegrationUnavailableReason,
  type StartupPage,
} from '@/lib/settings/main-program-settings';
import { settingsState, settingsStore } from '@/stores/settings';
import packageInfo from '../../../package.json';

const cardClass = 'rounded-2xl border border-border/50 bg-card p-6';
const languageOptions = ['zh-CN', 'zh-TW', 'en-US'] as const;
const languageLabels: Record<(typeof languageOptions)[number], string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'en-US': 'English',
};
const startupPageOptions: StartupPage[] = ['bookshelf', 'last-used'];
const startupPageLabels: Record<StartupPage, string> = {
  bookshelf: '书架',
  'last-used': '上次页面',
};

interface SwitchRowProps {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

function SwitchRow(props: SwitchRowProps) {
  return (
    <div class="flex items-center justify-between gap-4 py-2">
      <div class="min-w-0 space-y-0.5">
        <p class="text-sm font-medium text-foreground">{props.title}</p>
        <p class="text-xs text-muted-foreground">{props.description}</p>
      </div>
      <AppSwitch
        checked={props.checked}
        disabled={props.disabled}
        onChange={(value) => props.onChange(!!value)}
      >
        <AppSwitchControl class="shrink-0 data-disabled:cursor-not-allowed">
          <AppSwitchThumb />
        </AppSwitchControl>
        <AppSwitchLabel class="sr-only">{props.title}</AppSwitchLabel>
      </AppSwitch>
    </div>
  );
}

function CapabilityNote(props: { children: JSX.Element }) {
  return (
    <p class="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      {props.children}
    </p>
  );
}

export function GeneralProgramSetting() {
  const language = () =>
    languageOptions.includes(settingsState.app.language as (typeof languageOptions)[number])
      ? (settingsState.app.language as (typeof languageOptions)[number])
      : 'zh-CN';
  const startupPage = () => settingsState.app.startupPage ?? DEFAULT_STARTUP_PAGE;

  return (
    <div class={cardClass}>
      <div class="mb-4 space-y-1">
        <h3 class="font-semibold text-foreground">常规偏好</h3>
        <p class="text-sm text-muted-foreground">主程序启动与界面语言偏好。</p>
      </div>
      <div class="space-y-5">
        <AppTabs
          value={language()}
          options={languageOptions}
          labels={languageLabels}
          variant="settings-equal"
          label="界面语言"
          ariaLabel="界面语言"
          hint="语言偏好会持久化；尚未翻译的界面将继续显示简体中文。"
          onChange={(value) => void settingsStore.setLanguage(value)}
        />
        <AppTabs
          value={startupPage()}
          options={startupPageOptions}
          labels={startupPageLabels}
          variant="settings-equal"
          label="启动页面"
          ariaLabel="启动页面"
          hint="“上次页面”需要运行环境支持会话恢复；不支持时回退到书架。"
          onChange={(value) => void settingsStore.setStartupPage(value)}
        />
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-foreground">界面字号</p>
            <p class="text-xs text-muted-foreground">12–24 px，全应用即时生效</p>
          </div>
          <SettingsNumberField
            value={settingsState.app.appFontSize ?? DEFAULT_APP_FONT_SIZE}
            min={12}
            max={24}
            onValueChange={(value) => void settingsStore.setAppFontSize(value)}
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-foreground" for="settings-app-font-family">
            界面字体
          </label>
          <AppTextFieldBareInput
            id="settings-app-font-family"
            value={settingsState.app.appFontFamily ?? DEFAULT_APP_FONT_FAMILY}
            placeholder="系统默认，例如 Microsoft YaHei"
            onChange={(event: Event & { currentTarget: HTMLInputElement }) =>
              void settingsStore.setAppFontFamily(event.currentTarget.value)
            }
          />
          <p class="text-xs text-muted-foreground">可填写 CSS 字体族，留空恢复系统默认。</p>
        </div>
      </div>
    </div>
  );
}

export function WindowSystemSetting() {
  const runtime = detectMainProgramRuntime();
  const unavailableReason = desktopIntegrationUnavailableReason(runtime);
  const disabled = unavailableReason != null;

  return (
    <div class={cardClass}>
      <div class="mb-3 space-y-1">
        <h3 class="font-semibold text-foreground">桌面集成</h3>
        <p class="text-sm text-muted-foreground">控制桌面壳的启动、托盘与窗口恢复行为。</p>
      </div>
      <div class="divide-y divide-border/50">
        <SwitchRow
          title="开机自动启动"
          description="登录系统后自动启动 Reader"
          checked={settingsState.app.autoStart}
          disabled={disabled}
          onChange={(value) => void settingsStore.setAutoStart(value)}
        />
        <SwitchRow
          title="最小化到托盘"
          description="最小化主窗口时保留在系统托盘"
          checked={settingsState.app.minimizeToTray}
          disabled={disabled}
          onChange={(value) => void settingsStore.setMinimizeToTray(value)}
        />
        <SwitchRow
          title="关闭到托盘"
          description="关闭主窗口时隐藏到托盘而不是退出"
          checked={settingsState.app.closeToTray}
          disabled={disabled}
          onChange={(value) => void settingsStore.setCloseToTray(value)}
        />
        <SwitchRow
          title="恢复窗口状态"
          description="启动时恢复上次窗口的位置、大小与最大化状态"
          checked={settingsState.app.restoreWindowState}
          disabled={disabled}
          onChange={(value) => void settingsStore.setRestoreWindowState(value)}
        />
      </div>
      {unavailableReason ? (
        <div class="mt-3">
          <CapabilityNote>{unavailableReason}</CapabilityNote>
        </div>
      ) : (
        <div class="mt-3">
          <CapabilityNote>这些选项仅影响 Tauri 桌面壳；部分更改将在下次启动时生效。</CapabilityNote>
        </div>
      )}
    </div>
  );
}

export function NetworkProgramSetting() {
  const timeout = () =>
    settingsState.app.networkRequestTimeoutSeconds ?? DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS;
  const retryCount = () => settingsState.app.networkRetryCount ?? DEFAULT_NETWORK_RETRY_COUNT;

  return (
    <div class={cardClass}>
      <div class="mb-4 space-y-1">
        <h3 class="font-semibold text-foreground">网络默认值</h3>
        <p class="text-sm text-muted-foreground">为主程序网络功能提供统一的超时与重试偏好。</p>
      </div>
      <div class="space-y-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-foreground">请求超时</p>
            <p class="text-xs text-muted-foreground">5–300 秒</p>
          </div>
          <div class="flex items-center gap-2">
            <SettingsNumberField
              value={timeout()}
              min={5}
              max={300}
              onValueChange={(value) =>
                void settingsStore.setNetworkRequestTimeoutSeconds(value)
              }
            />
            <span class="text-xs text-muted-foreground">秒</span>
          </div>
        </div>
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-foreground">失败重试</p>
            <p class="text-xs text-muted-foreground">0 表示不自动重试，最多 5 次</p>
          </div>
          <SettingsNumberField
            value={retryCount()}
            min={0}
            max={5}
            onValueChange={(value) => void settingsStore.setNetworkRetryCount(value)}
          />
        </div>
        <CapabilityNote>
          浏览器、Android 与 Tauri 均可保存这些默认值；模块自带的超时或重试设置优先。
        </CapabilityNote>
      </div>
    </div>
  );
}

export function AboutProgramSetting() {
  const runtime = detectMainProgramRuntime();
  const updateUnsupported = runtime !== 'tauri-desktop';

  return (
    <div class={cardClass}>
      <div class="space-y-1">
        <h3 class="font-semibold text-foreground">Reader</h3>
        <p class="text-sm text-muted-foreground">版本 {packageInfo.version}</p>
        <p class="text-xs text-muted-foreground">
          运行环境：
          {runtime === 'tauri-desktop' ? 'Tauri 桌面' : runtime === 'android' ? 'Android' : 'Web'}
        </p>
      </div>
      <div class="mt-4 border-t border-border/50 pt-2">
        <SwitchRow
          title="自动检查更新"
          description="启动后检查主程序的新版本"
          checked={settingsState.app.autoCheckUpdates ?? true}
          disabled={updateUnsupported}
          onChange={(value) => void settingsStore.setAutoCheckUpdates(value)}
        />
      </div>
      <CapabilityNote>
        {updateUnsupported
          ? runtime === 'android'
            ? 'Android 更新由安装渠道管理，应用内更新检查不可用。'
            : 'Web 版本由站点部署更新，不提供应用内更新检查。'
          : '更新检查需要桌面构建启用更新能力；未启用时该偏好只会被保存。'}
      </CapabilityNote>
    </div>
  );
}
