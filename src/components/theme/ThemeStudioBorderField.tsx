/**
 * 主题工作室 — 组件边框参数化编辑
 */

import { Show, createMemo } from 'solid-js';
import { ThemeStudioSelectField } from '@/components/theme/ThemeStudioSelectField';
import { ThemeStudioNumberField } from '@/components/theme/ThemeStudioNumberField';
import {
  THEME_BORDER_COLOR_OPTIONS,
  THEME_BORDER_MODE_OPTIONS,
  THEME_BORDER_STYLE_OPTIONS,
  formatThemeBorder,
  parseThemeBorder,
  type ParsedThemeBorder,
} from '@/lib/theme/preview/theme-border-shadow-params';

export interface ThemeStudioBorderFieldProps {
  label: string;
  value: string;
  onChange: (stored: string) => void;
}

export function ThemeStudioBorderField(props: ThemeStudioBorderFieldProps) {
  const parsed = createMemo(() => parseThemeBorder(props.value));

  const patch = (next: Partial<ParsedThemeBorder>) => {
    props.onChange(formatThemeBorder({ ...parsed(), ...next }));
  };

  return (
    <div class="space-y-2 rounded-md border border-border/40 p-2">
      <ThemeStudioSelectField
        label={props.label}
        value={parsed().mode}
        onChange={(mode) => patch({ mode: mode as ParsedThemeBorder['mode'] })}
        options={THEME_BORDER_MODE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
      />
      <Show when={parsed().mode === 'custom'}>
        <div class="grid grid-cols-2 gap-2">
          <ThemeStudioNumberField
            label="宽度"
            value={parsed().width}
            min={0}
            max={8}
            step={1}
            suffix="px"
            onValueChange={(width) => patch({ width })}
          />
          <ThemeStudioSelectField
            label="线型"
            value={parsed().style}
            onChange={(style) => patch({ style: style as ParsedThemeBorder['style'] })}
            options={THEME_BORDER_STYLE_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
        </div>
        <ThemeStudioSelectField
          label="颜色"
          value={parsed().colorToken}
          onChange={(colorToken) =>
            patch({ colorToken: colorToken as ParsedThemeBorder['colorToken'] })
          }
          options={THEME_BORDER_COLOR_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
      </Show>
    </div>
  );
}
