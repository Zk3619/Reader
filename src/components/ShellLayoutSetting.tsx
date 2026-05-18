/**
 * 设置页：宽屏下在桌面/移动壳层布局间切换
 */

import { createMemo, For, Show } from 'solid-js';
import { useShellLayout } from '@/components/ShellLayoutProvider';
import {
  resolveShellLayoutPreference,
  type ShellLayoutPreference,
} from '@/lib/shell-layout';
import { isMobile } from '@/lib/platform/detect';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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

  return (
    <Show
      when={shell().isWide}
      fallback={
        <div class="rounded-2xl border border-border/50 bg-card p-6">
          <div class="space-y-1">
            <h3 class="font-semibold text-foreground">导航布局</h3>
            <p class="text-sm text-muted-foreground">
              {shell().isCompactMobile
                ? '当前为移动端且窗口宽度不足 480px，已使用底部导航栏。'
                : '当前窗口宽度不足 480px，仍使用顶部导航栏。'}
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
              桌面布局使用顶部导航栏；窗口宽度 ≥768px 时另显示侧边栏。移动布局使用底部导航栏。自动根据当前运行环境（桌面端 / 移动端）选择布局。仅移动端且宽度不足 480px 时会强制使用底栏。
            </p>
            <Show when={autoEffectiveHint()}>
              <p class="text-sm text-primary">{autoEffectiveHint()}</p>
            </Show>
          </div>
          <div
            class="flex w-full shrink-0 gap-2 rounded-lg border border-input bg-muted p-1.5 sm:w-auto"
            role="radiogroup"
            aria-label="导航布局"
          >
            <For each={SHELL_LAYOUT_OPTIONS}>
              {(opt) => {
                const selected = () => layout() === opt.value;
                return (
                  <Button
                    type="button"
                    role="radio"
                    aria-checked={selected()}
                    variant={selected() ? 'default' : 'ghost'}
                    size="sm"
                    class={cn(
                      'min-w-18 h-8 flex-1 shadow-none transition-colors sm:flex-none',
                      selected()
                        ? 'ring-1 ring-primary/30 hover:bg-primary/90'
                        : 'text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm',
                    )}
                    onClick={() => void settingsStore.setShellLayout(opt.value)}
                  >
                    {opt.label}
                  </Button>
                );
              }}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
}
