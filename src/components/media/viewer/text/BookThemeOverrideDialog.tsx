/**
 * 本书阅读主题（Theme System v2 Workstream D）
 */

import { createEffect, createSignal, For, Show } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import * as booksDb from '@/lib/database/books';
import type { BookTextThemeOverride } from '@/types/book';
import {
  READER_THEME_LABELS,
  TEXT_VIEWER_THEME_IDS,
  TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT,
} from '@/lib/theme/TextViewerTheme';
import { resolveBookTextThemeConfig } from '@/lib/theme/resolve-book-text-theme';
import {
  AppDialogScrollBody,
} from '@/components/shared/AppDialog';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import { ThemeStudioOpacityBlurFields } from '@/components/theme/ThemeStudioOpacityBlurFields';
import { showAppToast } from '@/components/shared/AppToasts';
import { dialogScrollFrameFlex } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import type { TextViewerThemeId } from '@/lib/theme/types';

const THEME_MODE_OPTIONS = ['default', 'custom'] as const;
type ThemeModePickerValue = (typeof THEME_MODE_OPTIONS)[number];

const THEME_MODE_LABELS: Record<ThemeModePickerValue, string> = {
  default: '跟随全局',
  custom: '本书自定义',
};

const optionRowClass =
  'flex cursor-pointer items-center rounded-md px-2 py-1.5 hover:bg-muted/50 has-[[data-checked]]:bg-accent has-[[data-checked]]:text-accent-foreground';

function triggerOptionRadio(el: HTMLElement) {
  el.querySelector<HTMLInputElement>('input[type="radio"]')?.click();
}

function modeFromOverride(override: BookTextThemeOverride | undefined): ThemeModePickerValue {
  return override?.mode === 'custom' ? 'custom' : 'default';
}

function paletteFromOverride(
  override: BookTextThemeOverride | undefined,
  fallback: TextViewerThemeId,
): TextViewerThemeId {
  if (override?.mode !== 'custom') return fallback;
  if (override.paletteId === 'custom' || override.paletteId == null) return fallback;
  return override.paletteId;
}

function contentSurfaceFromOverride(override: BookTextThemeOverride | undefined) {
  const content = override?.surfaceAppearance?.content;
  return {
    opacity: content?.opacity ?? TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT.opacity,
    blurPx: content?.blurPx ?? TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT.blurPx,
  };
}

export interface BookThemeOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookThemeOverrideDialog(props: BookThemeOverrideDialogProps) {
  const [mode, setMode] = createSignal<ThemeModePickerValue>('default');
  const [paletteId, setPaletteId] = createSignal<TextViewerThemeId>(0);
  const [contentOpacity, setContentOpacity] = createSignal(
    TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT.opacity,
  );
  const [contentBlurPx, setContentBlurPx] = createSignal(
    TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT.blurPx,
  );
  const [saving, setSaving] = createSignal(false);

  const globalThemeLabel = () => {
    const cfg = textViewerStore.state.config;
    const effective = resolveBookTextThemeConfig(textViewerStore.state.book, cfg);
    return READER_THEME_LABELS[effective.theme] ?? String(effective.theme);
  };

  createEffect(() => {
    if (!props.open) return;
    const book = textViewerStore.state.book;
    const override = book?.readConfig?.themeOverride;
    const globalTheme = resolveBookTextThemeConfig(book, textViewerStore.state.config).theme;
    setMode(modeFromOverride(override));
    setPaletteId(paletteFromOverride(override, globalTheme));
    const surface = contentSurfaceFromOverride(override);
    setContentOpacity(surface.opacity);
    setContentBlurPx(surface.blurPx);
  });

  const buildThemeOverride = (): BookTextThemeOverride => {
    if (mode() === 'default') {
      return { mode: 'default' };
    }
    const surfaceChanged =
      contentOpacity() !== TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT.opacity ||
      contentBlurPx() !== TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT.blurPx;
    return {
      mode: 'custom',
      paletteId: paletteId(),
      surfaceAppearance: surfaceChanged
        ? { content: { opacity: contentOpacity(), blurPx: contentBlurPx() } }
        : undefined,
    };
  };

  const handleSave = async () => {
    const book = textViewerStore.state.book;
    if (!book || textViewerStore.isGuestReading()) return;

    const themeOverride = buildThemeOverride();
    const readConfig = {
      ...book.readConfig,
      themeOverride,
    };

    setSaving(true);
    try {
      const updated = { ...book, readConfig };
      await booksDb.updateBook(updated);
      textViewerStore.patchBookReadConfig(readConfig);
      showAppToast({
        title: '本书阅读主题已更新',
        description:
          mode() === 'default'
            ? `当前跟随全局（${globalThemeLabel()}）`
            : `「${READER_THEME_LABELS[paletteId()]}」`,
      });
      props.onOpenChange(false);
    } catch (e) {
      showAppToast({
        title: '保存失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange} modal={false}>
      <ViewerAppDialogContent class="w-[calc(100dvw-2rem)] max-w-88">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>阅读主题（本书）</ViewerAppDialogTitle>
        </ViewerAppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class="px-6">
          <p class="mb-3 text-xs text-muted-foreground">
            界面设置当前为「{globalThemeLabel()}」。选择「跟随全局」时将使用阅读器抽屉中的主题配置。
          </p>
          <RadioGroup
            value={mode()}
            onChange={(v) => setMode(v as ThemeModePickerValue)}
            class="mb-4 flex flex-col gap-2"
          >
            <For each={[...THEME_MODE_OPTIONS]}>
              {(option) => (
                <div
                  class={optionRowClass}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => triggerOptionRadio(e.currentTarget)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      triggerOptionRadio(e.currentTarget);
                    }
                  }}
                >
                  <RadioGroupItem value={option} class="w-full">
                    <RadioGroupItemLabel>{THEME_MODE_LABELS[option]}</RadioGroupItemLabel>
                  </RadioGroupItem>
                </div>
              )}
            </For>
          </RadioGroup>

          <Show when={mode() === 'custom'}>
            <p class="mb-2 text-xs font-medium text-foreground">色板</p>
            <RadioGroup
              value={String(paletteId())}
              onChange={(v) => setPaletteId(Number(v) as TextViewerThemeId)}
              class="mb-4 flex flex-col gap-2"
            >
              <For each={[...TEXT_VIEWER_THEME_IDS]}>
                {(id) => (
                  <div
                    class={optionRowClass}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => triggerOptionRadio(e.currentTarget)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        triggerOptionRadio(e.currentTarget);
                      }
                    }}
                  >
                    <RadioGroupItem value={String(id)} class="w-full">
                      <RadioGroupItemLabel>{READER_THEME_LABELS[id]}</RadioGroupItemLabel>
                    </RadioGroupItem>
                  </div>
                )}
              </For>
            </RadioGroup>

            <p class="mb-2 text-xs font-medium text-foreground">正文区外观</p>
            <ThemeStudioOpacityBlurFields
              opacity={contentOpacity()}
              blurPx={contentBlurPx()}
              onOpacityChange={setContentOpacity}
              onBlurChange={setContentBlurPx}
            />
          </Show>
        </AppDialogScrollBody>
        <ViewerAppDialogFooter class={cn('gap-2')}>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={saving()} onClick={() => void handleSave()}>
            {saving() ? '保存中…' : '确定'}
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
}
