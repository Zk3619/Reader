import type { JSX } from 'solid-js';
import { Show, createMemo, createSignal, onMount } from 'solid-js';
import { AppSwitch, AppSwitchControl, AppSwitchLabel, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { AppTabs } from '@/components/shared/AppTabs';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { SettingsNumberField } from '@/components/settings/SettingsNumberField';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  APP_FONT_DEFAULT_OPTION_LABEL,
  DEFAULT_APP_FONT_FAMILY,
  DEFAULT_APP_FONT_PATH,
  DEFAULT_APP_FONT_SIZE,
  DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS,
  DEFAULT_NETWORK_RETRY_COUNT,
  DEFAULT_OUTBOUND_PROXY_MODE,
  DEFAULT_OUTBOUND_PROXY_URL,
  DEFAULT_STARTUP_PAGE,
  detectMainProgramRuntime,
  desktopIntegrationUnavailableReason,
  listStartupPageOptions,
  listSystemFontFamilies,
  outboundProxyModeLabel,
  startupPageLabel,
  type OutboundProxyMode,
  type StartupPage,
} from '@/lib/settings/main-program-settings';
import { OUTBOUND_PROXY_MODES } from '@/lib/settings/outbound-proxy';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import {
  ensureReaderFontFace,
  readerCustomFontFamilyName,
} from '@/lib/media/text/reader-font';
import { isTauri } from '@/lib/platform/detect';
import { settingsState, settingsStore } from '@/stores/settings';
import { CloseWindowActionPreference } from '@/components/settings/RememberedChoicesSetting';
import packageInfo from '../../../package.json';
import { openUrlInBrowser } from '@/lib/platform/open-url';

const cardClass = 'rounded-2xl border border-border/50 bg-card p-6';
const languageOptions = ['zh-CN', 'zh-TW', 'en-US'] as const;
const languageLabels: Record<(typeof languageOptions)[number], string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'en-US': 'English',
};

/** AppSelect 用哨兵值表示「默认字体」（空字符串对部分 Select 实现不友好） */
const APP_FONT_DEFAULT_SELECT_VALUE = '__app_font_default__';

const startupPageOptions = listStartupPageOptions();
const startupPageValues = startupPageOptions.map((o) => o.value);

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
  const startupPage = () => {
    const raw = settingsState.app.startupPage ?? DEFAULT_STARTUP_PAGE;
    return startupPageValues.includes(raw) ? raw : DEFAULT_STARTUP_PAGE;
  };

  const [systemFonts, setSystemFonts] = createSignal<string[]>([]);

  onMount(() => {
    void listSystemFontFamilies().then(setSystemFonts);
  });

  const appFontFamily = () => settingsState.app.appFontFamily ?? DEFAULT_APP_FONT_FAMILY;
  const appFontPath = () => settingsState.app.appFontPath ?? DEFAULT_APP_FONT_PATH;

  const fontSelectValue = () => {
    const family = appFontFamily().trim();
    if (!family && !appFontPath().trim()) return APP_FONT_DEFAULT_SELECT_VALUE;
    return family || APP_FONT_DEFAULT_SELECT_VALUE;
  };

  const fontSelectOptions = createMemo(() => {
    const opts = new Set<string>([APP_FONT_DEFAULT_SELECT_VALUE, ...systemFonts()]);
    const current = appFontFamily().trim();
    if (current) opts.add(current);
    return [...opts];
  });

  const fontOptionLabel = (value: string) =>
    value === APP_FONT_DEFAULT_SELECT_VALUE ? APP_FONT_DEFAULT_OPTION_LABEL : value;

  const onFontSelectChange = (value: string | null) => {
    if (value == null) return;
    if (value === APP_FONT_DEFAULT_SELECT_VALUE) {
      void settingsStore.setAppFontFamily(DEFAULT_APP_FONT_FAMILY, DEFAULT_APP_FONT_PATH);
      return;
    }
    void settingsStore.setAppFontFamily(value, DEFAULT_APP_FONT_PATH);
  };

  const pickLocalFontFile = async () => {
    try {
      let selectedPath: string | null = null;
      let suggestedName = '';

      if (isTauri()) {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({
          multiple: false,
          filters: [{ name: '字体', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
        });
        if (!selected || Array.isArray(selected)) return;
        selectedPath = selected;
      } else {
        const { pickFile } = await import('@/lib/platform/fs/pick-file');
        const { isUserCancelled } = await import('@/lib/platform/fs/errors');
        try {
          const pick = await pickFile({
            multiple: false,
            filters: [{ name: '字体', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
          });
          suggestedName = pick.fileName.replace(/\.[^.]+$/, '');
          if (pick.bytes) {
            selectedPath = URL.createObjectURL(new Blob([pick.bytes]));
          } else if (pick.ref.kind === 'path' || pick.ref.kind === 'uri') {
            selectedPath = pick.ref.value;
          }
        } catch (e) {
          if (isUserCancelled(e)) return;
          throw e;
        }
      }

      if (!selectedPath) return;
      const family = readerCustomFontFamilyName({
        customFontName: suggestedName,
        customFontPath: selectedPath,
      });
      ensureReaderFontFace(selectedPath, family);
      await settingsStore.setAppFontFamily(family, selectedPath);
    } catch (e) {
      console.warn('[GeneralProgramSetting] pick font failed', e);
    }
  };

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
        <div class="space-y-2">
          <Label for="settings-startup-page">启动页面</Label>
          <AppSelect
            value={startupPage()}
            onChange={(value) => {
              if (value != null) void settingsStore.setStartupPage(value as StartupPage);
            }}
            options={startupPageValues}
            itemComponent={(itemProps) => (
              <AppSelectItem item={itemProps.item}>
                {startupPageLabel(String(itemProps.item.rawValue))}
              </AppSelectItem>
            )}
          >
            <AppSelectTrigger id="settings-startup-page" layout="form" aria-label="启动页面">
              <AppSelectValue<string>>
                {(state) => startupPageLabel(String(state.selectedOption() ?? startupPage()))}
              </AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectListbox />
            </AppSelectContent>
          </AppSelect>
          <p class="text-xs text-muted-foreground">
            默认「上次页面」；其余选项按模块侧栏顺序排列。不支持会话恢复时回退到阅读 · 书架。
          </p>
        </div>
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-foreground">界面字号</p>
            <p class="text-xs text-muted-foreground">
              调整文档根字号（html font-size），范围 12–24 px，全应用即时生效
            </p>
          </div>
          <SettingsNumberField
            value={settingsState.app.appFontSize ?? DEFAULT_APP_FONT_SIZE}
            min={12}
            max={24}
            onValueChange={(value) => void settingsStore.setAppFontSize(value)}
          />
        </div>
        <div class="space-y-2">
          <Label for="settings-app-font-family">界面字体</Label>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div class="min-w-0 flex-1">
              <AppSelect
                value={fontSelectValue()}
                onChange={onFontSelectChange}
                options={fontSelectOptions()}
                itemComponent={(itemProps) => (
                  <AppSelectItem item={itemProps.item}>
                    <span
                      style={{
                        'font-family':
                          itemProps.item.rawValue === APP_FONT_DEFAULT_SELECT_VALUE
                            ? undefined
                            : String(itemProps.item.rawValue),
                      }}
                    >
                      {fontOptionLabel(String(itemProps.item.rawValue))}
                    </span>
                  </AppSelectItem>
                )}
              >
                <AppSelectTrigger
                  id="settings-app-font-family"
                  layout="form"
                  aria-label="界面字体"
                >
                  <AppSelectValue<string>>
                    {(state) => (
                      <span
                        class="truncate"
                        style={{
                          'font-family':
                            fontSelectValue() === APP_FONT_DEFAULT_SELECT_VALUE
                              ? undefined
                              : fontSelectValue(),
                        }}
                      >
                        {fontOptionLabel(String(state.selectedOption() ?? fontSelectValue()))}
                      </span>
                    )}
                  </AppSelectValue>
                  <AppSelectIcon />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectListbox />
                </AppSelectContent>
              </AppSelect>
            </div>
            <Button
              type="button"
              variant="outline"
              class="shrink-0"
              onClick={() => void pickLocalFontFile()}
            >
              选择本地字体
            </Button>
          </div>
          <Show when={appFontPath().trim()}>
            <p class="truncate text-xs text-muted-foreground" title={appFontPath()}>
              本地文件：{appFontPath()}
            </p>
          </Show>
          <p class="text-xs text-muted-foreground">
            默认选中「默认字体」；可从系统字体列表选择，或指定本地字体文件。
          </p>
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
      <Show when={!disabled && isTauri()}>
        <div class="mt-4 space-y-3 border-t border-border/50 pt-4">
          <p class="text-xs text-muted-foreground">
            未开启「关闭到托盘」时，可记住关闭按钮的默认行为；也可随时在此清除。
          </p>
          <CloseWindowActionPreference />
        </div>
      </Show>
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
  const proxyMode = () =>
    (settingsState.app.outboundProxyMode ?? DEFAULT_OUTBOUND_PROXY_MODE) as OutboundProxyMode;
  const proxyUrl = () => settingsState.app.outboundProxyUrl ?? DEFAULT_OUTBOUND_PROXY_URL;
  const runtime = detectMainProgramRuntime();
  const showWindowsMode = () => runtime === 'tauri-desktop';

  return (
    <div class={cardClass}>
      <div class="mb-4 space-y-1">
        <h3 class="font-semibold text-foreground">网络默认值</h3>
        <p class="text-sm text-muted-foreground">
          为主程序出站 HTTP 提供统一的超时、重试与代理偏好；下载 / 影视等模块默认同步跟随。
        </p>
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
        <div class="space-y-2">
          <div>
            <p class="text-sm font-medium text-foreground">出站代理</p>
            <p class="text-xs text-muted-foreground">
              作用于 download_binary / 下载引擎 / yt-dlp / 书源等 Rust 出站请求（非 CORS 同源代理）
            </p>
          </div>
          <AppSelect
            value={proxyMode()}
            onChange={(value) => {
              if (!value) return;
              void settingsStore.setOutboundProxyMode(value as OutboundProxyMode);
            }}
            options={[...OUTBOUND_PROXY_MODES].filter(
              (m) => showWindowsMode() || m !== 'windows',
            )}
            itemComponent={(itemProps) => (
              <AppSelectItem item={itemProps.item}>
                {outboundProxyModeLabel(itemProps.item.rawValue as OutboundProxyMode)}
              </AppSelectItem>
            )}
          >
            <AppSelectTrigger layout="compact" class="w-56" aria-label="出站代理模式">
              <AppSelectValue>
                {(state) =>
                  outboundProxyModeLabel(
                    (String(state.selectedOption() ?? DEFAULT_OUTBOUND_PROXY_MODE) as OutboundProxyMode),
                  )
                }
              </AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectListbox />
            </AppSelectContent>
          </AppSelect>
        </div>
        <Show when={proxyMode() === 'custom'}>
          <div class="space-y-2">
            <p class="text-sm font-medium text-foreground">自定义代理 URL</p>
            <p class="text-xs text-muted-foreground">
              如 http://127.0.0.1:7890 或 socks5h://127.0.0.1:1080
            </p>
            <AppTextFieldBareInput
              fieldClass="w-full"
              class="h-9"
              placeholder="http://127.0.0.1:7890"
              value={proxyUrl()}
              onInput={(e) => void settingsStore.setOutboundProxyUrl(e.currentTarget.value)}
              aria-label="自定义出站代理 URL"
            />
          </div>
        </Show>
        <CapabilityNote>
          「跟随环境变量」读取 HTTP_PROXY / HTTPS_PROXY / ALL_PROXY；「Windows 系统代理」读取本机
          Internet 设置（Clash 系统代理模式）。模块仍可单独覆盖。
        </CapabilityNote>
      </div>
    </div>
  );
}

export function AboutProgramSetting() {
  const runtime = detectMainProgramRuntime();
  const updateUnsupported = runtime !== 'tauri-desktop';

  const openGplPage = () => {
    void openUrlInBrowser('https://www.gnu.org/licenses/gpl-3.0.html');
  };

  const openLicenseFiles = async () => {
    if (!isTauri()) {
      openGplPage();
      return;
    }
    try {
      const { join } = await import('@tauri-apps/api/path');
      const { openPath } = await import('@tauri-apps/plugin-opener');
      // 开发态：cwd 常为 src-tauri 或项目根；依次尝试
      const candidates = [
        await join('..', 'LICENSE'),
        await join('LICENSE'),
        await join('..', 'docs', 'VIDEO_LIBMPV_LICENSE.md'),
        await join('docs', 'VIDEO_LIBMPV_LICENSE.md'),
      ];
      for (const p of candidates) {
        try {
          await openPath(p);
          return;
        } catch {
          /* try next */
        }
      }
      openGplPage();
    } catch {
      openGplPage();
    }
  };

  return (
    <div class={cardClass}>
      <div class="space-y-1">
        <h3 class="font-semibold text-foreground">MediaBox / Reader</h3>
        <p class="text-sm text-muted-foreground">版本 {packageInfo.version}</p>
        <p class="text-xs text-muted-foreground">
          运行环境：
          {runtime === 'tauri-desktop' ? 'Tauri 桌面' : runtime === 'android' ? 'Android' : 'Web'}
        </p>
        <p class="text-xs text-muted-foreground">
          许可证：{packageInfo.license || 'GPL-3.0-or-later'}（含 libmpv 的增强构建须遵守 GPL
          发行义务；详见仓库 LICENSE、third_party/NOTICE 与 docs/VIDEO_LIBMPV_LICENSE.md）
        </p>
        <div class="flex flex-wrap gap-2 pt-1">
          <Button type="button" size="sm" variant="outline" class="h-8" onClick={() => void openLicenseFiles()}>
            打开本地许可文件
          </Button>
          <Button type="button" size="sm" variant="ghost" class="h-8" onClick={openGplPage}>
            GPL-3.0 全文（网页）
          </Button>
        </div>
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
