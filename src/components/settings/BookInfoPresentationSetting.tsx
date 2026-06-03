/**
 * 设置页：书籍详情展示方式（独立页面 / 右侧抽屉）
 */

import { createEffect, createSignal, For } from 'solid-js';
import {
  AppManualRadioGroup,
  AppManualRadioOption,
} from '@/components/shared/AppManualRadio';
import { settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

type BookInfoPresentation = 'page' | 'drawer';

const OPTIONS: { value: BookInfoPresentation; label: string; description: string }[] = [
  {
    value: 'page',
    label: '独立页面',
    description: '全屏打开书籍详情，与阅读器同级导航。',
  },
  {
    value: 'drawer',
    label: '右侧抽屉',
    description: '在当前页面之上以抽屉形式打开，关闭后回到原位置。',
  },
];

export function BookInfoPresentationSetting() {
  const [value, setValue] = createSignal<BookInfoPresentation>(
    settingsStore.state.app.bookInfoPresentation ?? 'page',
  );

  createEffect(() => {
    setValue(settingsStore.state.app.bookInfoPresentation ?? 'page');
  });

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <h3 class="mb-2 font-semibold text-foreground">书籍详情展示</h3>
      <p class="mb-4 text-sm text-muted-foreground">
        从书架、探索、搜索或阅读器打开书籍详情时的展示方式。
      </p>

      <AppManualRadioGroup class="flex flex-col gap-2">
        <For each={OPTIONS}>
          {(option) => (
            <AppManualRadioOption
              selected={value() === option.value}
              onSelect={() => {
                setValue(option.value);
                void settingsStore.setBookInfoPresentation(option.value);
              }}
              class={cn(
                'h-max items-start gap-3 rounded-lg border border-border/40 px-3 py-2.5',
                value() === option.value ? 'bg-muted/30' : 'bg-transparent',
              )}
            >
              <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="text-sm font-medium text-foreground">{option.label}</span>
                <span class="text-xs text-muted-foreground">{option.description}</span>
              </div>
            </AppManualRadioOption>
          )}
        </For>
      </AppManualRadioGroup>
    </div>
  );
}
