/**
 * 主题工作室 — 百分比数字输入
 */

import { createEffect, createMemo, createSignal } from 'solid-js';
import { ThemeStudioNumberField } from '@/components/theme/ThemeStudioNumberField';
import { formatThemePercent, parseThemePercent } from '@/lib/theme/preview/theme-size-units';

export interface ThemeStudioPercentFieldProps {
  label: string;
  value: string;
  onChange: (stored: string) => void;
}

export function ThemeStudioPercentField(props: ThemeStudioPercentFieldProps) {
  const parsed = createMemo(() => parseThemePercent(props.value) ?? 0);
  const [draft, setDraft] = createSignal(parsed());

  createEffect(() => {
    setDraft(parsed());
  });

  return (
    <ThemeStudioNumberField
      label={props.label}
      value={draft()}
      min={0}
      max={100}
      step={1}
      suffix="%"
      onValueChange={(value) => {
        setDraft(value);
        props.onChange(formatThemePercent(value));
      }}
    />
  );
}
