/**
 * 应用内数值输入：自定义增减钮 + 长按持续步进并加速。
 * 不依赖原生 number spin（暗色底色无法透明），样式对齐 TextField。
 */

import {
  createEffect,
  createSignal,
  onCleanup,
  type Component,
  type JSX,
} from 'solid-js';
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/shared/icons';
import { createSpinHold } from '@/lib/ui/spin-hold';
import {
  clampNumber,
  formatNumberByStep,
  snapNumber,
} from '@/lib/ui/number-input-math';
import { cn } from '@/lib/utils';

export { clampNumber, formatNumberByStep, snapNumber } from '@/lib/ui/number-input-math';

const groupVariants = cva(
  'group relative flex w-full min-w-0 items-stretch rounded-md border border-input bg-transparent shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background',
  {
    variants: {
      size: {
        default: 'h-10',
        sm: 'h-9',
        compact: 'h-8',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

const inputVariants = cva(
  'min-w-0 flex-1 bg-transparent px-3 text-sm tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        default: 'py-2 pr-7',
        sm: 'py-1.5 pr-7 text-sm',
        compact: 'py-1 pr-6 text-xs',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

const spinColumnVariants = cva(
  [
    'absolute inset-y-0 right-0 flex flex-col',
    'opacity-0 pointer-events-none transition-opacity',
    'group-hover:opacity-100 group-hover:pointer-events-auto',
    'group-focus-within:opacity-100 group-focus-within:pointer-events-auto',
  ].join(' '),
  {
    variants: {
      size: {
        default: 'w-6',
        sm: 'w-6',
        compact: 'w-5',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

const spinButtonClass =
  'flex flex-1 items-center justify-center bg-transparent text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40';

export type AppNumberFieldSize = NonNullable<VariantProps<typeof groupVariants>['size']>;

export interface AppNumberFieldProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  id?: string;
  name?: string;
  placeholder?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  class?: string;
  groupClass?: string;
  inputClass?: string;
  size?: AppNumberFieldSize;
  /** 校验通过后、写出前的规范化（如 Math.round） */
  normalize?: (value: number) => number;
  /** 展示用格式化；默认按 step 推断小数位 */
  formatDisplay?: (value: number) => string;
}

export const AppNumberField: Component<AppNumberFieldProps> = (props) => {
  const size = () => props.size ?? 'default';
  const step = () => (typeof props.step === 'number' && props.step > 0 ? props.step : 1);
  const displayOf = (value: number) =>
    props.formatDisplay?.(value) ?? formatNumberByStep(value, step());

  const [text, setText] = createSignal(displayOf(props.value));
  const [focused, setFocused] = createSignal(false);
  /** 长按期间受控 props.value 可能尚未回写，用 pending 串步进 */
  let pending: number | undefined;

  createEffect(() => {
    const committed = props.value;
    if (pending !== undefined && committed === pending) pending = undefined;
    const next = displayOf(committed);
    if (!focused()) setText(next);
  });

  const currentValue = () => pending ?? props.value;

  const emit = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    let next = clampNumber(raw, props.min, props.max);
    if (props.normalize) next = props.normalize(next);
    next = clampNumber(snapNumber(next, step(), props.min ?? 0), props.min, props.max);
    pending = next;
    setText(displayOf(next));
    if (next === props.value) return;
    props.onValueChange(next);
  };

  const commitFromText = () => {
    const raw = text().trim();
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
      pending = undefined;
      setText(displayOf(props.value));
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      pending = undefined;
      setText(displayOf(props.value));
      return;
    }
    emit(parsed);
  };

  const canStepFrom = (value: number, direction: 1 | -1) => {
    if (props.disabled) return false;
    const delta = direction * step();
    const next = value + delta;
    if (typeof props.min === 'number' && next < props.min && direction < 0) return false;
    if (typeof props.max === 'number' && next > props.max && direction > 0) return false;
    return true;
  };

  const stepBy = (direction: 1 | -1): boolean => {
    const value = currentValue();
    if (!canStepFrom(value, direction)) return false;
    emit(value + direction * step());
    return canStepFrom(currentValue(), direction);
  };

  const bindHold = (direction: 1 | -1) => {
    const hold = createSpinHold({
      onStep: () => stepBy(direction),
    });

    const onPointerUp = () => {
      hold.stop();
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', onPointerUp);
    };

    const onPointerDown: JSX.EventHandlerUnion<HTMLButtonElement, PointerEvent> = (event) => {
      if (props.disabled || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      hold.start();
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      window.addEventListener('blur', onPointerUp);
    };

    onCleanup(() => {
      hold.stop();
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', onPointerUp);
    });

    return { onPointerDown };
  };

  const incHold = bindHold(1);
  const decHold = bindHold(-1);

  const atMin = () =>
    typeof props.min === 'number' && Number.isFinite(props.min) && currentValue() <= props.min;
  const atMax = () =>
    typeof props.max === 'number' && Number.isFinite(props.max) && currentValue() >= props.max;

  return (
    <div class={cn(groupVariants({ size: size() }), props.groupClass, props.class)}>
      <input
        id={props.id}
        name={props.name}
        type="text"
        inputMode="decimal"
        autocomplete="off"
        spellcheck={false}
        disabled={props.disabled}
        aria-label={props['aria-label']}
        aria-labelledby={props['aria-labelledby']}
        aria-valuemin={props.min}
        aria-valuemax={props.max}
        aria-valuenow={Number.isFinite(props.value) ? props.value : undefined}
        role="spinbutton"
        placeholder={props.placeholder}
        class={cn(inputVariants({ size: size() }), props.inputClass)}
        value={text()}
        onInput={(event) => setText(event.currentTarget.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commitFromText();
        }}
        onChange={() => commitFromText()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitFromText();
            const form = (event.currentTarget as HTMLInputElement).form;
            if (form) {
              form.requestSubmit();
            } else {
              (event.currentTarget as HTMLInputElement).blur();
            }
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            stepBy(1);
            return;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            stepBy(-1);
          }
        }}
        onWheel={(event) => {
          if (props.disabled || document.activeElement !== event.currentTarget) return;
          if (event.deltaY === 0) return;
          event.preventDefault();
          stepBy(event.deltaY < 0 ? 1 : -1);
        }}
      />
      <div class={cn(spinColumnVariants({ size: size() }))} aria-hidden={props.disabled || undefined}>
        <button
          type="button"
          tabindex={-1}
          disabled={props.disabled || atMax()}
          aria-label="增加"
          class={spinButtonClass}
          onPointerDown={incHold.onPointerDown}
        >
          <ChevronUpIcon class={size() === 'compact' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </button>
        <button
          type="button"
          tabindex={-1}
          disabled={props.disabled || atMin()}
          aria-label="减少"
          class={spinButtonClass}
          onPointerDown={decHold.onPointerDown}
        >
          <ChevronDownIcon class={size() === 'compact' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </button>
      </div>
    </div>
  );
};
