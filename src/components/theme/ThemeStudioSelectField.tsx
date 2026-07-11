/**
 * 主题工作室 — 下拉选择（AppSelect）
 */

import { AppTextField, AppTextFieldLabel } from '@/components/shared/AppTextField';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';

export interface ThemeStudioSelectOption {
  value: string;
  label: string;
}

export interface ThemeStudioSelectFieldProps {
  label: string;
  labelClass?: string;
  value: string;
  onChange: (value: string) => void;
  options: ThemeStudioSelectOption[];
  /** 当前值不在 options 中时的占位项（如「自定义（当前值）」） */
  customOption?: ThemeStudioSelectOption;
}

export function ThemeStudioSelectField(props: ThemeStudioSelectFieldProps) {
  const allOptions = () => {
    const seen = new Set<string>();
    const list: ThemeStudioSelectOption[] = [];
    for (const option of props.options) {
      if (seen.has(option.value)) continue;
      seen.add(option.value);
      list.push(option);
    }
    if (
      props.customOption &&
      !seen.has(props.customOption.value)
    ) {
      list.push(props.customOption);
    }
    return list;
  };

  const labelFor = (value: string | null) =>
    allOptions().find((option) => option.value === value)?.label ?? value ?? '';

  return (
    <AppTextField>
      <AppTextFieldLabel class={props.labelClass ?? 'text-xs'}>{props.label}</AppTextFieldLabel>
      <AppSelect
        value={props.value}
        onChange={(value) => {
          if (value != null) props.onChange(value);
        }}
        options={allOptions().map((option) => option.value)}
        itemComponent={(itemProps) => (
          <AppSelectItem item={itemProps.item}>
            {labelFor(itemProps.item.rawValue)}
          </AppSelectItem>
        )}
      >
        <AppSelectTrigger class="h-9" aria-label={props.label}>
          <AppSelectValue<string>>
            {(state) => labelFor(state.selectedOption())}
          </AppSelectValue>
          <AppSelectIcon />
        </AppSelectTrigger>
        <AppSelectContent portalToBody>
          <AppSelectListbox />
        </AppSelectContent>
      </AppSelect>
    </AppTextField>
  );
}
