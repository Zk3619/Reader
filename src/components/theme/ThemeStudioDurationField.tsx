/**
 * 主题工作室 — 时长输入（毫秒，存储为 ms/s 字符串）
 */

import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import { ThemeStudioNumberField } from '@/components/theme/ThemeStudioNumberField';
import {
  formatThemeDurationMs,
  parseThemeDurationMs,
  THEME_DURATION_PRESETS_MS,
} from '@/lib/theme/preview/theme-motion-presets';

export interface ThemeStudioDurationFieldProps {
  label: string;
  value: string;
  onChange: (stored: string) => void;
  presets?: readonly { label: string; value: number }[];
}

export function ThemeStudioDurationField(props: ThemeStudioDurationFieldProps) {
  const presets = () => props.presets ?? THEME_DURATION_PRESETS_MS;
  const msValue = createMemo(() => parseThemeDurationMs(props.value) ?? 0);
  const [draft, setDraft] = createSignal(msValue());

  createEffect(() => {
    setDraft(msValue());
  });

  const commit = (ms: number) => {
    if (!Number.isFinite(ms) || ms < 0) return;
    props.onChange(formatThemeDurationMs(ms));
  };

  return (
    <div class="space-y-2">
      <ThemeStudioNumberField
        label={props.label}
        value={draft()}
        min={0}
        step={10}
        suffix="ms"
        description={`存储为 ${props.value || formatThemeDurationMs(draft())}`}
        onValueChange={(value) => {
          setDraft(value);
          commit(value);
        }}
      />
      <Show when={presets().length > 0}>
        <div class="flex flex-wrap gap-1">
          <For each={presets()}>
            {(preset) => (
              <Button
                type="button"
                size="sm"
                variant={msValue() === preset.value ? 'default' : 'outline'}
                class="h-7 cursor-pointer px-2 text-[11px]"
                onClick={() => {
                  setDraft(preset.value);
                  commit(preset.value);
                }}
              >
                {preset.label}
              </Button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
