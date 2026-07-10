/**
 * 设置页：宽屏下在桌面/移动壳层布局间切换
 */

import { createMemo, Show } from 'solid-js';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import {
  resolveShellLayoutPreference,
  type ShellLayoutPreference,
  type MobileShellNavStyle,
  type DesktopSidebarMode,
} from '@/lib/shell/layout';
import { isMobile } from '@/lib/platform/detect';
import { AppTabs } from '@/components/shared/AppTabs';
import { settingsState, settingsStore } from '@/stores/settings';

const SHELL_LAYOUT_OPTIONS: { value: ShellLayoutPreference; label: string }[] = [
  { value: 'auto', label: '自动' },
  { value: 'desktop', label: '桌面' },
  { value: 'mobile', label: '移动' },
];

const MOBILE_NAV_OPTIONS: { value: MobileShellNavStyle; label: string }[] = [
  { value: 'topBar', label: '顶栏' },
  { value: 'moduleSidebar', label: '侧栏' },
];

const DESKTOP_SIDEBAR_OPTIONS: { value: DesktopSidebarMode; label: string }[] = [
  { value: 'fused', label: '融合' },
  { value: 'independent', label: '独立' },
];

export function ShellLayoutSetting() {
  const shell = useShellLayout();
  const layout = () => settingsState.app.shellLayout ?? 'auto';
  const mobileNav = () => settingsState.app.mobileShellNavStyle ?? 'topBar';
  const desktopSidebar = () => settingsState.app.desktopSidebarMode ?? 'fused';

  const autoEffectiveHint = createMemo(() => {
    if (layout() !== 'auto') return null;
    const effective = resolveShellLayoutPreference('auto', isMobile());
    return effective === 'mobile'
      ? '当前环境为移动端，将使用底栏布局。'
      : '当前环境为桌面端，将使用顶栏布局。';
  });

  return (
    <Show
      when={shell().isWide}
      fallback={
        <div class="rounded-2xl border border-border/50 bg-card p-6 space-y-4">
          <div class="space-y-1">
            <h3 class="font-semibold text-foreground">导航布局</h3>
            <p class="text-sm text-muted-foreground">
              {shell().useMobileShell
                ? '当前为移动导航布局，已使用底部导航栏。'
                : '当前为桌面导航布局。'}
            </p>
          </div>
          <AppTabs
            layout="inline"
            variant="settings"
            value={mobileNav()}
            options={MOBILE_NAV_OPTIONS.map((o) => o.value)}
            labels={Object.fromEntries(MOBILE_NAV_OPTIONS.map((o) => [o.value, o.label])) as Record<MobileShellNavStyle, string>}
            ariaLabel="移动壳层子页导航"
            onChange={(v) => void settingsStore.setMobileShellNavStyle(v as MobileShellNavStyle)}
          />
        </div>
      }
    >
      <div class="rounded-2xl border border-border/50 bg-card p-6 space-y-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="space-y-1">
            <h3 class="font-semibold text-foreground">壳层布局</h3>
            <p class="text-sm text-muted-foreground">
              桌面布局使用顶部导航栏与侧栏；移动布局使用底部导航栏。自动根据运行环境选择。
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
            onChange={(v) => void settingsStore.setShellLayout(v as ShellLayoutPreference)}
          />
        </div>

        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-border/40 pt-4">
          <div class="space-y-1">
            <h3 class="font-semibold text-foreground">移动壳层子页导航</h3>
            <p class="text-sm text-muted-foreground">
              顶栏：显示 LOGO 与模块子页下拉。侧栏：隐藏顶栏，在侧栏 Sheet 内切换模块子页。
            </p>
          </div>
          <AppTabs
            layout="inline"
            variant="settings"
            tabsClass="w-full shrink-0 sm:w-auto"
            value={mobileNav()}
            options={MOBILE_NAV_OPTIONS.map((o) => o.value)}
            labels={Object.fromEntries(MOBILE_NAV_OPTIONS.map((o) => [o.value, o.label])) as Record<MobileShellNavStyle, string>}
            ariaLabel="移动壳层子页导航"
            onChange={(v) => void settingsStore.setMobileShellNavStyle(v as MobileShellNavStyle)}
          />
        </div>

        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-border/40 pt-4">
          <div class="space-y-1">
            <h3 class="font-semibold text-foreground">桌面侧栏模式</h3>
            <p class="text-sm text-muted-foreground">
              融合：模块子页叠在主侧栏下方。独立：模块子页使用第二固定侧栏。
            </p>
          </div>
          <AppTabs
            layout="inline"
            variant="settings"
            tabsClass="w-full shrink-0 sm:w-auto"
            value={desktopSidebar()}
            options={DESKTOP_SIDEBAR_OPTIONS.map((o) => o.value)}
            labels={Object.fromEntries(DESKTOP_SIDEBAR_OPTIONS.map((o) => [o.value, o.label])) as Record<DesktopSidebarMode, string>}
            ariaLabel="桌面侧栏模式"
            onChange={(v) => void settingsStore.setDesktopSidebarMode(v as DesktopSidebarMode)}
          />
        </div>
      </div>
    </Show>
  );
}
