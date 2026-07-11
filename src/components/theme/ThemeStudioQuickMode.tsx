/**
 * 主题工作室 — 快速模式：种子色 + 风格预设生成语义色板
 */

import { For, Show, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import { ThemeStudioColorField } from '@/components/theme/ThemeStudioColorField';
import { AppTextField, AppTextFieldLabel } from '@/components/shared/AppTextField';
import { themeStudioStore } from '@/stores/theme-studio';
import {
  applyPaletteToThemePack,
  type PaletteGeneratorMode,
} from '@/lib/theme/generation/theme-palette-generator';
import {
  THEME_GENERATION_PRESETS,
  type ThemeStylePresetId,
} from '@/lib/theme/generation/theme-generation-presets';
import { showAppToast } from '@/components/shared/AppToasts';

const MODE_OPTIONS: { value: PaletteGeneratorMode; label: string }[] = [
  { value: 'dual', label: '双模式' },
  { value: 'light', label: '仅浅色' },
  { value: 'dark', label: '仅深色' },
];

export function ThemeStudioQuickMode() {
  const generation = () => themeStudioStore.state.draftPack.generation;
  const [primarySeed, setPrimarySeed] = createSignal(generation()?.primarySeed ?? '#0891b2');
  const [backgroundSeed, setBackgroundSeed] = createSignal(generation()?.backgroundSeed ?? '');
  const [accentSeed, setAccentSeed] = createSignal(generation()?.accentSeed ?? '');
  const [mode, setMode] = createSignal<PaletteGeneratorMode>('dual');
  const [stylePresetId, setStylePresetId] = createSignal<ThemeStylePresetId>(
    (generation()?.stylePresetId as ThemeStylePresetId | undefined) ?? 'default',
  );

  const applyGenerated = () => {
    const next = applyPaletteToThemePack(themeStudioStore.state.draftPack, {
      primarySeed: primarySeed(),
      backgroundSeed: backgroundSeed() || undefined,
      accentSeed: accentSeed() || undefined,
      mode: mode(),
      stylePresetId: stylePresetId(),
    });
    themeStudioStore.setDraftPack(next);
    showAppToast({ title: '已生成色板', description: '可在专业模式中微调各组件' });
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="shrink-0 border-b border-border px-4 py-3">
        <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">快速模式</p>
        <p class="text-sm font-semibold text-foreground">从种子色生成主题</p>
      </div>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto scroll-gutter-stable-both p-4">
        <p class="text-xs text-muted-foreground">
          选择主色与风格预设，一键生成浅色/深色语义色板并写入当前草稿（含 WCAG 对比度校正）。
        </p>

        <ThemeStudioColorField
          label="主色种子"
          value={primarySeed()}
          onChange={setPrimarySeed}
        />
        <ThemeStudioColorField
          label="背景种子（可选）"
          value={backgroundSeed() || '#fafafa'}
          onChange={setBackgroundSeed}
        />
        <ThemeStudioColorField
          label="强调色种子（可选）"
          value={accentSeed() || primarySeed()}
          onChange={setAccentSeed}
        />

        <AppTextField>
          <AppTextFieldLabel>生成范围</AppTextFieldLabel>
          <div class="flex flex-wrap gap-1">
            <For each={MODE_OPTIONS}>
              {(opt) => (
                <Button
                  size="sm"
                  variant={mode() === opt.value ? 'default' : 'outline'}
                  class="cursor-pointer"
                  onClick={() => setMode(opt.value)}
                >
                  {opt.label}
                </Button>
              )}
            </For>
          </div>
        </AppTextField>

        <AppTextField>
          <AppTextFieldLabel>风格预设</AppTextFieldLabel>
          <div class="grid gap-2">
            <For each={THEME_GENERATION_PRESETS}>
              {(preset) => (
                <button
                  type="button"
                  class="cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent/30"
                  classList={{
                    'border-primary bg-primary/5': stylePresetId() === preset.id,
                    'border-border/60': stylePresetId() !== preset.id,
                  }}
                  onClick={() => setStylePresetId(preset.id)}
                >
                  <p class="text-sm font-medium text-foreground">{preset.label}</p>
                  <p class="text-xs text-muted-foreground">{preset.description}</p>
                </button>
              )}
            </For>
          </div>
        </AppTextField>

        <Show when={generation()?.generatedAt}>
          {(generatedAt) => (
            <p class="text-[11px] text-muted-foreground">
              上次生成：{new Date(generatedAt()).toLocaleString('zh-CN')}
            </p>
          )}
        </Show>

        <Button class="w-full cursor-pointer" onClick={applyGenerated}>
          生成并应用色板
        </Button>
      </div>
    </div>
  );
}
