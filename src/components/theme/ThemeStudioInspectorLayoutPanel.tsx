/**
 * Theme Studio Inspector — 布局 Tab
 */

import { For, Show } from 'solid-js';
import type { ComponentLayoutOverride } from '@/lib/theme/schema/theme-pack-v1';
import type { LayoutTokens } from '@/lib/theme/types';
import type { InspectorEditableSections } from '@/lib/theme/preview/theme-inspector-editable';
import { ThemeStudioLayoutTokenField } from '@/components/theme/ThemeStudioLayoutTokenField';
import { ThemeStudioSizeField } from '@/components/theme/ThemeStudioSizeField';
import { ThemeStudioBorderField } from '@/components/theme/ThemeStudioBorderField';
import { ThemeStudioShadowField } from '@/components/theme/ThemeStudioShadowField';

const COMPONENT_SIZE_LAYOUT_KEYS = ['padding', 'margin', 'gap', 'radius'] as const;

const COMPONENT_SIZE_LAYOUT_LABELS: Record<(typeof COMPONENT_SIZE_LAYOUT_KEYS)[number], string> = {
  padding: '内边距',
  margin: '外边距',
  gap: '间距',
  radius: '圆角',
};

export interface ThemeStudioInspectorLayoutPanelProps {
  sections: InspectorEditableSections;
  layoutValue: (key: keyof LayoutTokens) => string;
  patchLayout: (key: keyof LayoutTokens, value: string) => void;
  componentLayoutValue: (key: keyof ComponentLayoutOverride) => string;
  patchComponentLayout: (key: keyof ComponentLayoutOverride, value: string) => void;
}

export function ThemeStudioInspectorLayoutPanel(props: ThemeStudioInspectorLayoutPanelProps) {
  const hasContent = () =>
    props.sections.layoutGroups.length > 0 ||
    (props.sections.showComponentOverride &&
      (COMPONENT_SIZE_LAYOUT_KEYS.length > 0));

  return (
    <div class="space-y-3">
      <Show
        when={hasContent()}
        fallback={
          <p class="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
            当前组件无可编辑布局项。请选择应用壳层、页头工具栏等组件，或切换到「全部」作用域。
          </p>
        }
      >
        <For each={props.sections.layoutGroups}>
          {(group) => (
            <div class="space-y-2 rounded-lg border border-border/50 p-2">
              <p class="text-xs font-medium text-foreground">{group.label}</p>
              <p class="text-[11px] text-muted-foreground">
                尺寸默认以 rem 存储，可切换 px；下方显示换算结果。
              </p>
              <For each={group.keys}>
                {(key) => (
                  <ThemeStudioLayoutTokenField
                    tokenKey={key}
                    value={props.layoutValue(key)}
                    onChange={(value) => props.patchLayout(key, value)}
                  />
                )}
              </For>
            </div>
          )}
        </For>

        <Show when={props.sections.showComponentOverride}>
          <div class="space-y-2 rounded-lg border border-border/50 p-2">
            <p class="text-xs font-medium text-foreground">组件间距与圆角</p>
            <For each={COMPONENT_SIZE_LAYOUT_KEYS}>
              {(key) => (
                <ThemeStudioSizeField
                  label={COMPONENT_SIZE_LAYOUT_LABELS[key]}
                  value={props.componentLayoutValue(key)}
                  optional
                  onChange={(value) => props.patchComponentLayout(key, value)}
                />
              )}
            </For>
          </div>
          <div class="space-y-2 rounded-lg border border-border/50 p-2">
            <p class="text-xs font-medium text-foreground">组件边框与阴影</p>
            <ThemeStudioBorderField
              label="边框"
              value={props.componentLayoutValue('border')}
              onChange={(value) => props.patchComponentLayout('border', value)}
            />
            <ThemeStudioShadowField
              label="阴影"
              value={props.componentLayoutValue('shadow')}
              onChange={(value) => props.patchComponentLayout('shadow', value)}
            />
          </div>
        </Show>
      </Show>
    </div>
  );
}
