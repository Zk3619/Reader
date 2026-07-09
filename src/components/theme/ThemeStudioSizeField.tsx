/**
 * 主题工作室 — 尺寸数字输入（rem / px 切换，展示换算）
 */

import { Show, createEffect, createMemo, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldInput, TextFieldLabel } from '@/components/ui/text-field';
import { ThemeStudioNumberField } from '@/components/theme/ThemeStudioNumberField';
import {
  formatThemeLength,
  parseThemeLength,
  pxToRem,
  remToPx,
  themeLengthConversionHint,
  themeLengthToPreviewPx,
  type ThemeSizeUnit,
} from '@/lib/theme/preview/theme-size-units';

export interface ThemeStudioSizeFieldProps {
  label: string;
  value: string;
  onChange: (stored: string) => void;
  showRuler?: boolean;
  /** 为空时表示继承，不写入覆写 */
  optional?: boolean;
  class?: string;
}

export function ThemeStudioSizeField(props: ThemeStudioSizeFieldProps) {
  const parsed = createMemo(() => parseThemeLength(props.value));
  const [unit, setUnit] = createSignal<ThemeSizeUnit>(parsed()?.unit ?? 'rem');
  const [draft, setDraft] = createSignal(parsed()?.value ?? 0);

  createEffect(() => {
    const p = parseThemeLength(props.value);
    if (!p) {
      if (!props.optional) {
        setUnit('rem');
        setDraft(0);
      }
      return;
    }
    setUnit(p.unit);
    setDraft(p.value);
  });

  const commit = (nextValue: number, nextUnit: ThemeSizeUnit = unit()) => {
    if (!Number.isFinite(nextValue)) return;
    if (props.optional && nextValue <= 0) {
      props.onChange('');
      return;
    }
    props.onChange(formatThemeLength(nextValue, nextUnit));
  };

  const hint = () => (props.value ? themeLengthConversionHint(props.value) : undefined);
  const rulerPx = () =>
    props.value && props.showRuler ? themeLengthToPreviewPx(props.value) : undefined;

  const switchUnit = (nextUnit: ThemeSizeUnit) => {
    if (unit() === nextUnit) return;
    const current = draft();
    const converted =
      nextUnit === 'px'
        ? Math.round(remToPx(unit() === 'rem' ? current : pxToRem(current)) * 1000) / 1000
        : Math.round(pxToRem(unit() === 'px' ? current : remToPx(current)) * 1000) / 1000;
    setUnit(nextUnit);
    setDraft(converted);
    commit(converted, nextUnit);
  };

  return (
    <TextField class={props.class}>
      <TextFieldLabel class="text-xs">{props.label}</TextFieldLabel>
      <div class="flex items-center gap-2">
        <Show
          when={!props.optional || props.value}
          fallback={
            <TextFieldInput
              class="min-w-0 flex-1"
              placeholder="继承"
              onFocus={() => {
                setDraft(0.125);
                commit(0.125, unit());
              }}
            />
          }
        >
          <ThemeStudioNumberField
            value={draft()}
            min={0}
            step={0.125}
            onValueChange={(value) => {
              setDraft(value);
              commit(value);
            }}
          />
        </Show>
        <div class="flex shrink-0 overflow-hidden rounded-md border border-border">
          <Button
            type="button"
            size="sm"
            variant={unit() === 'rem' ? 'default' : 'ghost'}
            class="h-8 rounded-none px-2 text-xs"
            onClick={() => switchUnit('rem')}
          >
            rem
          </Button>
          <Button
            type="button"
            size="sm"
            variant={unit() === 'px' ? 'default' : 'ghost'}
            class="h-8 rounded-none px-2 text-xs"
            onClick={() => switchUnit('px')}
          >
            px
          </Button>
        </div>
      </div>
      <Show when={hint()}>
        <p class="text-[11px] text-muted-foreground">{hint()}</p>
      </Show>
      <Show when={rulerPx()}>
        {(px) => (
          <div class="mt-1 flex items-center gap-2">
            <div class="h-2 rounded-sm bg-primary/60" style={{ width: `${px()}px` }} />
            <span class="text-[10px] text-muted-foreground">{px()} px</span>
          </div>
        )}
      </Show>
    </TextField>
  );
}
