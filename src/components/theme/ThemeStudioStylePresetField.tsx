/**
 * 主题工作室 — 边框/阴影预设选择
 */

import { Show } from 'solid-js';
import { TextField, TextFieldInput, TextFieldLabel } from '@/components/ui/text-field';
import type { ThemeStylePreset } from '@/lib/theme/preview/theme-style-presets';
import { resolveStylePresetId } from '@/lib/theme/preview/theme-style-presets';
import { ThemeStudioSelectField } from '@/components/theme/ThemeStudioSelectField';

const INHERIT_OPTION = { value: '', label: '继承（不覆盖）' };

export interface ThemeStudioStylePresetFieldProps {
  label: string;
  value: string;
  presets: ThemeStylePreset[];
  onChange: (stored: string) => void;
  customPlaceholder?: string;
}

export function ThemeStudioStylePresetField(props: ThemeStudioStylePresetFieldProps) {
  const selected = () => resolveStylePresetId(props.presets, props.value);
  const isCustom = () => selected() === '__custom__';

  return (
    <div class="space-y-2">
      <ThemeStudioSelectField
        label={props.label}
        value={isCustom() ? props.value : selected()}
        onChange={(value) => {
          if (value === props.value && isCustom()) return;
          props.onChange(value);
        }}
        options={[
          INHERIT_OPTION,
          ...props.presets.map((preset) => ({
            value: preset.value,
            label: preset.label,
          })),
        ]}
        customOption={isCustom() ? { value: props.value, label: '自定义（当前值）' } : undefined}
      />
      <Show when={isCustom()}>
        <TextField>
          <TextFieldLabel class="text-[11px] text-muted-foreground">自定义值</TextFieldLabel>
          <TextFieldInput
            value={props.value}
            placeholder={props.customPlaceholder}
            onInput={(e) => props.onChange(e.currentTarget.value)}
          />
        </TextField>
      </Show>
    </div>
  );
}
