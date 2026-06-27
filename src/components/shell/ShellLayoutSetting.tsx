/**
 * 设置页：宽屏下在桌面/移动壳层布局间切换
 */

import { createMemo, Show } from 'solid-js';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import {
  resolveShellLayoutPreference,
  type ShellLayoutPreference,
} from '@/lib/shell/layout';
import { isMobile } from '@/lib/platform/detect';
import { AppTabs } from '@/components/shared/AppTabs';
import { settingsState, settingsStore } from '@/stores/settings';

const SHELL_LAYOUT_OPTIONS: { value: ShellLayoutPreference; label: string }[] = [
  { value: 'auto', label: '自动' },
  { value: 'desktop', label: '桌面' },
  { value: 'mobile', label: '移动' },
];

export function ShellLayoutSetting() {
  const shell = useShellLayout();
  const layout = () => settingsState.app.shellLayout ?? 'auto';

  const autoEffectiveHint = createMemo(() => {
    if (layout() !== 'auto') return null;
    const effective = resolveShellLayoutPreference('auto', isMobile());
    return effective === 'mobile'
      ? '当前环境为移动端，将使用底栏布局。'
      : '当前环境为桌面端，将使用顶栏布局。';
  });

  const handleLayoutChange = (value: string) => {
    const next = value as ShellLayoutPreference;
    if (next === layout()) return;
    void settingsStore.setShellLayout(next);
  };

  return (
    <Show
      when={shell().isWide}
      fallback={
        <div class="rounded-2xl border border-border/50 bg-card p-6">
          <div class="space-y-1">
            <h3 class="font-semibold text-foreground">导航布局</h3>
            <p class="text-sm text-muted-foreground">
              {shell().useMobileShell
                ? '当前为移动导航布局，已使用底部导航栏。'
                : '当前为桌面导航布局，窗口宽度不足 480px 时仍使用顶部导航栏。'}
            </p>
          </div>
        </div>
      }
    >
      <div class="rounded-2xl border border-border/50 bg-card p-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="space-y-1">
            <h3 class="font-semibold text-foreground">导航布局</h3>
            <p class="text-sm text-muted-foreground">
              桌面布局使用顶部导航栏；窗口宽度 ≥768px 时另显示侧边栏。移动布局使用底部导航栏（任意窗口宽度，含不足 480px）。自动根据当前运行环境选择布局；移动端设备且宽度不足 480px 时也会使用底栏。
            </p>
            <Show when={autoEffectiveHint()}>
              <p class="text-sm text-primary">{autoEffectiveHint()}</p>
            </Show>
          </div>
          <AppTabs
            layout="inline"
            variant="settings"
            tabsClass="w-full shrink-0 sm:w-auto"
            value={layout()}
            options={SHELL_LAYOUT_OPTIONS.map((opt) => opt.value)}
            labels={
              Object.fromEntries(
                SHELL_LAYOUT_OPTIONS.map((opt) => [opt.value, opt.label]),
              ) as Record<ShellLayoutPreference, string>
            }
            ariaLabel="导航布局"
            onChange={handleLayoutChange}
          />
        </div>
      </div>
    </Show>
  );
}
