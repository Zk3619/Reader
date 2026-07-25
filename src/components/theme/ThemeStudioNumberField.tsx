/**
 * 主题工作室 — 数字输入（AppNumberField：长按加速增减）
 */

import { Show } from 'solid-js';
import { cn } from '@/lib/utils';
import { AppNumberField } from '@/components/shared/AppNumberField';
import { AppTextField, AppTextFieldLabel } from '@/components/shared/AppTextField';

export interface ThemeStudioNumberFieldProps {
  label?: string;
  labelClass?: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  description?: string;
  groupClass?: string;
  inputClass?: string;
  class?: string;
}

export function ThemeStudioNumberField(props: ThemeStudioNumberFieldProps) {
  const input = (
    <AppNumberField
      class={cn('min-w-0 flex-1', props.class)}
      groupClass={props.groupClass}
      inputClass={props.inputClass}
      value={props.value}
      onValueChange={props.onValueChange}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      size="sm"
    />
  );

  if (!props.label) {
    return (
      <div class="flex items-center gap-2">
        {input}
        <Show when={props.suffix}>
          <span class="shrink-0 text-xs text-muted-foreground">{props.suffix}</span>
        </Show>
      </div>
    );
  }

  return (
    <AppTextField>
      <AppTextFieldLabel class={props.labelClass ?? 'text-xs'}>{props.label}</AppTextFieldLabel>
      <div class="flex items-center gap-2">
        {input}
        <Show when={props.suffix}>
          <span class="shrink-0 text-xs text-muted-foreground">{props.suffix}</span>
        </Show>
      </div>
      <Show when={props.description}>
        <p class="text-[11px] text-muted-foreground">{props.description}</p>
      </Show>
    </AppTextField>
  );
}
