/**
 * 主题工作室 — 数字输入（Kobalte NumberField）
 */

import { Show } from 'solid-js';
import { cn } from '@/lib/utils';
import { AppTextField, AppTextFieldLabel } from '@/components/shared/AppTextField';
import {
  NumberField,
  NumberFieldDecrementTrigger,
  NumberFieldGroup,
  NumberFieldIncrementTrigger,
  NumberFieldInput,
} from '@/components/ui/number-field';

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
  const emitIfChanged = (value: number) => {
    if (!Number.isFinite(value)) return;
    if (value === props.value) return;
    props.onValueChange(value);
  };

  const input = (
    <NumberField
      class={cn('min-w-0 flex-1', props.class)}
      rawValue={props.value}
      onRawValueChange={emitIfChanged}
      minValue={props.min}
      maxValue={props.max}
      step={props.step ?? 1}
    >
      <NumberFieldGroup class={cn('w-full', props.groupClass)}>
        <NumberFieldInput class={cn('h-9 pr-7', props.inputClass)} />
        <NumberFieldIncrementTrigger />
        <NumberFieldDecrementTrigger />
      </NumberFieldGroup>
    </NumberField>
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
