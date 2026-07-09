/**
 * Theme Studio Inspector — 排版 Tab
 */

import { For, Show, createMemo } from 'solid-js';
import type { ComponentTypographyOverride } from '@/lib/theme/schema/theme-pack-v1';
import type { InspectorEditableSections } from '@/lib/theme/preview/theme-inspector-editable';
import { TextField, TextFieldInput, TextFieldLabel } from '@/components/ui/text-field';
import { ThemeStudioSizeField } from '@/components/theme/ThemeStudioSizeField';
import { ThemeStudioNumberField } from '@/components/theme/ThemeStudioNumberField';
import { ThemeStudioSelectField } from '@/components/theme/ThemeStudioSelectField';
import { THEME_FONT_WEIGHT_OPTIONS } from '@/lib/theme/preview/theme-style-presets';

const COMPONENT_TYPOGRAPHY_SIZE_KEYS = ['fontSize', 'letterSpacing'] as const;
const COMPONENT_TYPOGRAPHY_LABELS: Record<keyof ComponentTypographyOverride, string> = {
  fontSize: '字号',
  fontWeight: '字重',
  lineHeight: '行高',
  letterSpacing: '字距',
  fontFamily: '字体',
};

export interface ThemeStudioInspectorTypographyPanelProps {
  sections: InspectorEditableSections;
  fontFamily: string;
  onFontFamilyChange: (value: string) => void;
  fontFamilyMono: string;
  onFontFamilyMonoChange: (value: string) => void;
  typeScale: string;
  onTypeScaleChange: (value: string) => void;
  typeLineHeight: string;
  onTypeLineHeightChange: (value: string) => void;
  componentTypographyValue: (key: keyof ComponentTypographyOverride) => string;
  patchComponentTypography: (key: keyof ComponentTypographyOverride, value: string) => void;
}

export function ThemeStudioInspectorTypographyPanel(props: ThemeStudioInspectorTypographyPanelProps) {
  const hasContent = () =>
    props.sections.showTypography || props.sections.showComponentOverride;

  const typeScaleNumber = createMemo(() => {
    const value = Number(props.typeScale);
    return Number.isFinite(value) ? value : 1;
  });

  const typeLineHeightNumber = createMemo(() => {
    const value = Number(props.typeLineHeight);
    return Number.isFinite(value) ? value : 1.5;
  });

  const componentLineHeight = createMemo(() => {
    const raw = props.componentTypographyValue('lineHeight');
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  });

  return (
    <div class="space-y-3">
      <Show
        when={hasContent()}
        fallback={
          <p class="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
            当前组件无可编辑排版项。请选择应用壳层或带文字覆写的组件。
          </p>
        }
      >
        <Show when={props.sections.showTypography}>
          <div class="space-y-2 rounded-lg border border-border/50 p-2">
            <p class="text-xs font-medium text-foreground">全局排版</p>
            <TextField>
              <TextFieldLabel class="text-xs">正文字体族</TextFieldLabel>
              <TextFieldInput
                value={props.fontFamily}
                placeholder="system-ui, sans-serif"
                onInput={(e) => props.onFontFamilyChange(e.currentTarget.value)}
              />
            </TextField>
            <TextField>
              <TextFieldLabel class="text-xs">等宽字体族</TextFieldLabel>
              <TextFieldInput
                value={props.fontFamilyMono}
                placeholder="ui-monospace, monospace"
                onInput={(e) => props.onFontFamilyMonoChange(e.currentTarget.value)}
              />
            </TextField>
            <ThemeStudioNumberField
              label="字号缩放系数"
              value={typeScaleNumber()}
              min={0.5}
              max={2}
              step={0.05}
              onValueChange={(value) => props.onTypeScaleChange(String(value))}
            />
            <ThemeStudioNumberField
              label="默认行高（倍数）"
              value={typeLineHeightNumber()}
              min={1}
              max={2.5}
              step={0.05}
              onValueChange={(value) => props.onTypeLineHeightChange(String(value))}
            />
          </div>
        </Show>

        <Show when={props.sections.showComponentOverride}>
          <div class="space-y-2 rounded-lg border border-border/50 p-2">
            <p class="text-xs font-medium text-foreground">组件排版覆写</p>
            <For each={COMPONENT_TYPOGRAPHY_SIZE_KEYS}>
              {(key) => (
                <ThemeStudioSizeField
                  label={COMPONENT_TYPOGRAPHY_LABELS[key]}
                  value={props.componentTypographyValue(key)}
                  optional
                  onChange={(value) => props.patchComponentTypography(key, value)}
                />
              )}
            </For>
            <Show
              when={componentLineHeight() != null}
              fallback={
                <TextField>
                  <TextFieldLabel class="text-xs">
                    {COMPONENT_TYPOGRAPHY_LABELS.lineHeight}
                  </TextFieldLabel>
                  <TextFieldInput
                    placeholder="继承"
                    onFocus={() => props.patchComponentTypography('lineHeight', '1.5')}
                  />
                  <p class="text-[11px] text-muted-foreground">无单位倍数，如 1.5</p>
                </TextField>
              }
            >
              <ThemeStudioNumberField
                label={COMPONENT_TYPOGRAPHY_LABELS.lineHeight}
                value={componentLineHeight()!}
                min={1}
                max={3}
                step={0.05}
                description="无单位倍数，如 1.5"
                onValueChange={(value) =>
                  props.patchComponentTypography('lineHeight', String(value))
                }
              />
            </Show>
            <ThemeStudioSelectField
              label={COMPONENT_TYPOGRAPHY_LABELS.fontWeight}
              value={props.componentTypographyValue('fontWeight') || ''}
              onChange={(value) => props.patchComponentTypography('fontWeight', value)}
              options={[
                { value: '', label: '继承' },
                ...THEME_FONT_WEIGHT_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                })),
              ]}
            />
            <TextField>
              <TextFieldLabel class="text-xs">{COMPONENT_TYPOGRAPHY_LABELS.fontFamily}</TextFieldLabel>
              <TextFieldInput
                value={props.componentTypographyValue('fontFamily')}
                placeholder="继承全局字体"
                onInput={(e) => props.patchComponentTypography('fontFamily', e.currentTarget.value)}
              />
            </TextField>
          </div>
        </Show>
      </Show>
    </div>
  );
}
