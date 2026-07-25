import { AppNumberField } from '@/components/shared/AppNumberField';

export interface SettingsNumberFieldProps {
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  groupClass?: string;
  inputClass?: string;
}

/** 设置页 / 阅读器抽屉共用的数字输入（AppNumberField：长按加速增减） */
export function SettingsNumberField(props: SettingsNumberFieldProps) {
  return (
    <AppNumberField
      value={props.value}
      onValueChange={props.onValueChange}
      min={props.min}
      max={props.max}
      step={1}
      size="sm"
      class="w-24 shrink-0"
      groupClass={props.groupClass}
      inputClass={props.inputClass}
    />
  );
}
