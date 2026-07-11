import { AppTextField, AppTextFieldLabel } from '@/components/shared/AppTextField';
import { Slider, SliderFill, SliderThumb, SliderTrack } from '@/components/ui/slider';

export interface ThemeStudioRangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
}

export function ThemeStudioRangeField(props: ThemeStudioRangeFieldProps) {
  const displayValue = () => props.formatValue?.(props.value) ?? String(props.value);

  return (
    <AppTextField>
      <AppTextFieldLabel class="text-xs">
        {props.label} ({displayValue()})
      </AppTextFieldLabel>
      <Slider
        class="theme-studio-range w-full overflow-visible py-1.5"
        value={[props.value]}
        minValue={props.min}
        maxValue={props.max}
        step={props.step ?? 1}
        onChange={(values) => props.onChange(values[0] ?? props.min)}
      >
        <SliderTrack class="h-2 w-full">
          <SliderFill />
          <SliderThumb />
        </SliderTrack>
      </Slider>
    </AppTextField>
  );
}

export interface ThemeStudioOpacityBlurFieldsProps {
  opacity: number;
  blurPx: number;
  onOpacityChange: (value: number) => void;
  onBlurChange: (value: number) => void;
  opacityLabel?: string;
}

export function ThemeStudioOpacityBlurFields(props: ThemeStudioOpacityBlurFieldsProps) {
  return (
    <>
      <ThemeStudioRangeField
        label={props.opacityLabel ?? '不透明度'}
        value={props.opacity}
        min={0}
        max={100}
        step={1}
        formatValue={(value) => `${value}%`}
        onChange={props.onOpacityChange}
      />
      <ThemeStudioRangeField
        label="模糊"
        value={props.blurPx}
        min={0}
        max={24}
        step={1}
        formatValue={(value) => `${value}px`}
        onChange={props.onBlurChange}
      />
    </>
  );
}

/** @deprecated use ThemeStudioOpacityBlurFields */
export const BackgroundOpacityBlurFields = ThemeStudioOpacityBlurFields;
