/**
 * 设置页：Tauri 桌面内嵌网页承载方式
 */

import { createEffect, createSignal, For, Show } from 'solid-js';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import { isMobile, isTauri } from '@/lib/platform/detect';
import type { InnerWebRenderModePreference } from '@/lib/platform/inner-web-mode';
import { settingsStore } from '@/stores/settings';

const OPTIONS: {
  value: InnerWebRenderModePreference;
  label: string;
  description: string;
}[] = [
  {
    value: 'auto',
    label: '自动',
    description:
      '优先使用原生内嵌 WebView；若创建失败，本会话内自动改用 iframe，并记住不可用状态直至重启应用。',
  },
  {
    value: 'tauri-panel',
    label: '原生 WebView',
    description: '与工具栏同窗口分层，Cookie 与脚本兼容性最好；菜单/对话框打开时会暂时隐藏网页层。',
  },
  {
    value: 'iframe',
    label: 'iframe',
    description:
      '在页面内 iframe 加载，通过 postMessage 同步 Cookie；适合调试或原生面板异常时强制使用。',
  },
];

export function InnerWebRenderModeSetting() {
  const [value, setValue] = createSignal<InnerWebRenderModePreference>(
    settingsStore.state.app.innerWebRenderMode ?? 'auto',
  );

  createEffect(() => {
    setValue(settingsStore.state.app.innerWebRenderMode ?? 'auto');
  });

  return (
    <Show when={isTauri() && !isMobile()}>
      <div class="rounded-2xl border border-border/50 bg-card p-6">
        <h3 class="mb-2 font-semibold text-foreground">内嵌网页承载方式</h3>
        <p class="mb-4 text-sm text-muted-foreground">
          书源登录、书源设置等全屏内嵌页在桌面端的加载方式。移动端与浏览器版始终使用 iframe。
        </p>

        <RadioGroup
          value={value()}
          onChange={(next) => {
            const mode = next as InnerWebRenderModePreference;
            setValue(mode);
            void settingsStore.setInnerWebRenderMode(mode);
          }}
          class="flex flex-col gap-2"
        >
          <For each={OPTIONS}>
            {(option) => (
              <RadioGroupItem
                value={option.value}
                class="items-start gap-3 rounded-lg border border-border/40 px-3 py-2.5"
              >
                <RadioGroupItemLabel class="flex flex-col gap-0.5 font-normal">
                  <span class="text-sm font-medium text-foreground">{option.label}</span>
                  <span class="text-xs text-muted-foreground">{option.description}</span>
                </RadioGroupItemLabel>
              </RadioGroupItem>
            )}
          </For>
        </RadioGroup>
      </div>
    </Show>
  );
}
