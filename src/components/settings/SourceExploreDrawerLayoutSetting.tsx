/**
 * 设置页：书源页发现抽屉布局方案
 */

import { createEffect, createSignal, For } from 'solid-js';
import {
  AppManualRadioGroup,
  AppManualRadioOption,
} from '@/components/shared/AppManualRadio';
import { settingsStore } from '@/stores/settings';
import type { ExploreDrawerLayoutScheme } from '@/lib/book-source/legado-flex-child-style';
import { cn } from '@/lib/utils';

const OPTIONS: {
  value: ExploreDrawerLayoutScheme;
  label: string;
  description: string;
}[] = [
  {
    value: 'default',
    label: '默认样式方案',
    description:
      '按书源脚本返回的 layout_flexBasisPercent 等样式 flex 换行排列，仅做行内未占满时的均摊等轻量优化。',
  },
  {
    value: 'legado',
    label: 'Legado 兼容方案',
    description: '强制每行最多三列，并按 Legado 书源展开区的分行与撑满规则渲染（适合晴天聚合等复杂脚本）。',
  },
];

export function SourceExploreDrawerLayoutSetting() {
  const [value, setValue] = createSignal<ExploreDrawerLayoutScheme>(
    settingsStore.state.app.sourceExploreDrawerLayout ?? 'default',
  );

  createEffect(() => {
    setValue(settingsStore.state.app.sourceExploreDrawerLayout ?? 'default');
  });

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <h3 class="mb-2 font-semibold text-foreground">书源发现抽屉布局</h3>
      <p class="mb-4 text-sm text-muted-foreground">
        书源管理页展开右侧抽屉时，发现分类/筛选区的排列方式。
      </p>

      <AppManualRadioGroup class="flex flex-col gap-2">
        <For each={OPTIONS}>
          {(option) => (
            <AppManualRadioOption
              selected={value() === option.value}
              onSelect={() => {
                setValue(option.value);
                void settingsStore.setSourceExploreDrawerLayout(option.value);
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
