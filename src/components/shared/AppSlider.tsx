/**
 * 应用内单值滑块（对齐阅读器 ReaderSettings / ReaderRemSliderRow）：
 * 全受控 — `value` 直接绑定外部状态，`onChange` 即时写回状态。
 * 抖动应在「状态层」用内存即时更新 + 防抖持久化解决，而不是在滑块内做 draft/回写。
 */

import type { Component, JSX } from 'solid-js';
import {
  Slider,
  SliderFill,
  SliderThumb,
  SliderTrack,
} from '@/components/ui/slider';
import { cn } from '@/lib/utils';

export interface AppSliderProps {
  value: number;
  onChange?: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** 水平（默认）或垂直（均衡器等） */
  orientation?: 'horizontal' | 'vertical';
  class?: string;
  trackClass?: string;
  fillClass?: string;
  thumbClass?: string;
  'aria-label'?: string;
  children?: JSX.Element;
}

export const AppSlider: Component<AppSliderProps> = (props) => {
  return (
    <Slider
      class={cn('w-full', props.class)}
      minValue={props.min ?? 0}
      maxValue={props.max ?? 100}
      step={props.step ?? 1}
      disabled={props.disabled}
      orientation={props.orientation}
      value={[props.value]}
      aria-label={props['aria-label']}
      onChange={(values) => {
        props.onChange?.(values[0] ?? props.value);
      }}
      onChangeEnd={(values) => {
        props.onChangeEnd?.(values[0] ?? props.value);
      }}
    >
      <SliderTrack class={props.trackClass}>
        <SliderFill class={props.fillClass} />
        <SliderThumb class={props.thumbClass} />
      </SliderTrack>
      {props.children}
    </Slider>
  );
};
