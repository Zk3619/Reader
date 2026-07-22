/**
 * 音乐设置页数值输入：AppTextField type="number"。
 * 键入过程不 clamp；仅在 change（失焦提交）时做有限性与 min/max 校验再回调。
 */

import { createEffect, createSignal, type Component } from 'solid-js';
import { AppTextFieldInput } from '@/components/shared/AppTextField';
import { cn } from '@/lib/utils';

function formatByStep(value: number, step?: number): string {
  if (!Number.isFinite(value)) return '';
  const s = step ?? 1;
  if (s >= 1) return String(Math.round(value));
  if (s >= 0.1) return value.toFixed(1);
  if (s >= 0.01) return value.toFixed(2);
  return value.toFixed(3);
}

function clampNumber(value: number, min?: number, max?: number): number {
  let next = value;
  if (typeof min === 'number' && Number.isFinite(min)) next = Math.max(min, next);
  if (typeof max === 'number' && Number.isFinite(max)) next = Math.min(max, next);
  return next;
}

export interface MusicSettingsNumberInputProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  class?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  /** 校验通过后、写出前的规范化（如 Math.round） */
  normalize?: (value: number) => number;
  /** 展示用格式化；默认按 step 推断小数位 */
  formatDisplay?: (value: number) => string;
  onCommit: (value: number) => void;
}

export const MusicSettingsNumberInput: Component<MusicSettingsNumberInputProps> = (props) => {
  const displayOf = (value: number) =>
    props.formatDisplay?.(value) ?? formatByStep(value, props.step);
  const [text, setText] = createSignal(displayOf(props.value));
  const [focused, setFocused] = createSignal(false);

  createEffect(() => {
    const next = displayOf(props.value);
    if (!focused()) setText(next);
  });

  const commitFromText = () => {
    const raw = text().trim();
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
      setText(displayOf(props.value));
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setText(displayOf(props.value));
      return;
    }
    let next = clampNumber(parsed, props.min, props.max);
    if (props.normalize) next = props.normalize(next);
    next = clampNumber(next, props.min, props.max);
    props.onCommit(next);
    setText(displayOf(next));
  };

  return (
    <AppTextFieldInput
      layout="compact"
      type="number"
      id={props.id}
      class={cn('w-20 tabular-nums', props.class)}
      min={props.min}
      max={props.max}
      step={props.step}
      disabled={props.disabled}
      aria-label={props['aria-label']}
      value={text()}
      onInput={(event) => {
        setText(event.currentTarget.value);
      }}
      onChange={() => {
        commitFromText();
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commitFromText();
      }}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          (event.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
};
