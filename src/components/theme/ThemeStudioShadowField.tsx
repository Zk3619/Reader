/**
 * 主题工作室 — 组件阴影参数化编辑
 */

import { Show, createMemo } from 'solid-js';
import { ThemeStudioSelectField } from '@/components/theme/ThemeStudioSelectField';
import { ThemeStudioNumberField } from '@/components/theme/ThemeStudioNumberField';
import {
  THEME_SHADOW_MODE_OPTIONS,
  formatThemeShadow,
  parseThemeShadow,
  type ParsedThemeShadow,
} from '@/lib/theme/preview/theme-border-shadow-params';

export interface ThemeStudioShadowFieldProps {
  label: string;
  value: string;
  onChange: (stored: string) => void;
}

export function ThemeStudioShadowField(props: ThemeStudioShadowFieldProps) {
  const parsed = createMemo(() => parseThemeShadow(props.value));

  const patch = (next: Partial<ParsedThemeShadow>) => {
    props.onChange(formatThemeShadow({ ...parsed(), ...next }));
  };

  return (
    <div class="space-y-2 rounded-md border border-border/40 p-2">
      <ThemeStudioSelectField
        label={props.label}
        value={parsed().mode}
        onChange={(mode) => patch({ mode: mode as ParsedThemeShadow['mode'] })}
        options={THEME_SHADOW_MODE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
      />
      <Show when={parsed().mode === 'custom'}>
        <div class="grid grid-cols-2 gap-2">
          <ThemeStudioNumberField
            label="X 偏移"
            value={parsed().offsetX}
            min={-48}
            max={48}
            step={1}
            suffix="px"
            onValueChange={(offsetX) => patch({ offsetX })}
          />
          <ThemeStudioNumberField
            label="Y 偏移"
            value={parsed().offsetY}
            min={-48}
            max={48}
            step={1}
            suffix="px"
            onValueChange={(offsetY) => patch({ offsetY })}
          />
          <ThemeStudioNumberField
            label="模糊"
            value={parsed().blur}
            min={0}
            max={64}
            step={1}
            suffix="px"
            onValueChange={(blur) => patch({ blur })}
          />
          <ThemeStudioNumberField
            label="扩展"
            value={parsed().spread}
            min={-16}
            max={32}
            step={1}
            suffix="px"
            onValueChange={(spread) => patch({ spread })}
          />
        </div>
        <ThemeStudioNumberField
          label="不透明度"
          value={parsed().opacity}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onValueChange={(opacity) => patch({ opacity })}
        />
      </Show>
    </div>
  );
}
