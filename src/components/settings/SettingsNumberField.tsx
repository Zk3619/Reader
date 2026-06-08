import { cn } from '@/lib/utils';
import {
  NumberField,
  NumberFieldDecrementTrigger,
  NumberFieldGroup,
  NumberFieldIncrementTrigger,
  NumberFieldInput,
} from '@/components/ui/number-field';

export interface SettingsNumberFieldProps {
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  groupClass?: string;
  inputClass?: string;
}

/** 设置页 / 阅读器抽屉共用的数字输入（Kobalte NumberField） */
export function SettingsNumberField(props: SettingsNumberFieldProps) {
  const emitIfChanged = (value: number) => {
    if (!Number.isFinite(value)) return;
    if (value === props.value) return;
    props.onValueChange(value);
  };

  return (
    <NumberField
      rawValue={props.value}
      onRawValueChange={emitIfChanged}
      minValue={props.min}
      maxValue={props.max}
      step={1}
    >
      <NumberFieldGroup class={cn('w-24 shrink-0', props.groupClass)}>
        <NumberFieldInput class={cn('h-9 pr-7', props.inputClass)} />
        <NumberFieldIncrementTrigger />
        <NumberFieldDecrementTrigger />
      </NumberFieldGroup>
    </NumberField>
  );
}
