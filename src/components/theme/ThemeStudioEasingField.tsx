/**
 * 主题工作室 — 缓动曲线预设选择
 */

import { Show } from 'solid-js';
import { TextField, TextFieldInput, TextFieldLabel } from '@/components/ui/text-field';
import { ThemeStudioSelectField } from '@/components/theme/ThemeStudioSelectField';
import {
  resolveEasingPresetId,
  THEME_EASING_PRESETS,
} from '@/lib/theme/preview/theme-motion-presets';

export interface ThemeStudioEasingFieldProps {
  label: string;
  value: string;
  onChange: (stored: string) => void;
}

export function ThemeStudioEasingField(props: ThemeStudioEasingFieldProps) {
  const presetId = () => resolveEasingPresetId(props.value);
  const isCustom = () => presetId() === 'custom';

  return (
    <div class="space-y-2">
      <ThemeStudioSelectField
        label={props.label}
        value={isCustom() ? 'custom' : presetId()}
        onChange={(id) => {
          if (id === 'custom') return;
          const preset = THEME_EASING_PRESETS.find((item) => item.id === id);
          if (preset) props.onChange(preset.value);
        }}
        options={THEME_EASING_PRESETS.map((preset) => ({
          value: preset.id,
          label: preset.label,
        }))}
        customOption={isCustom() ? { value: 'custom', label: '自定义（当前值）' } : undefined}
      />
      <Show when={isCustom()}>
        <TextField>
          <TextFieldLabel class="text-[11px] text-muted-foreground">自定义曲线</TextFieldLabel>
          <TextFieldInput
            value={props.value}
            placeholder="cubic-bezier(0.22, 1, 0.36, 1)"
            onInput={(e) => props.onChange(e.currentTarget.value)}
          />
        </TextField>
      </Show>
    </div>
  );
}
