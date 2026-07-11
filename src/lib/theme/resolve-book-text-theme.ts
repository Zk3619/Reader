/**
 * 书籍级阅读主题解析（Theme System v2 Workstream D）
 * 优先级：book.themeOverride(custom) > global reader_ui_config > viewer preset > 内置默认
 * @see resolveBookTextViewerPageAnim
 */

import type { Book, BookTextThemeOverride } from '@/types/book';
import type {
  TextViewerThemeAppearanceConfig,
  TextViewerUiConfig,
} from '@/lib/media/text/reader-ui-config';
import { normalizeTextViewerThemeId } from '@/lib/theme/TextViewerTheme';
import type { TextViewerThemeSection } from '@/lib/theme/schema/theme-pack-v1';
import type { TextViewerThemeId } from '@/lib/theme/types';

export type BookTextThemeMode = BookTextThemeOverride['mode'];

export type BookTextThemeSource = 'book' | 'global' | 'preset' | 'default';

export interface EffectiveTextThemeConfig {
  theme: TextViewerThemeId;
  customPalette?: BookTextThemeOverride['customPalette'];
  themeSurfaceAppearance?: TextViewerThemeAppearanceConfig;
  /** 传入 resolveTextViewerSurfaceAppearance 的 bookOverride 层 */
  bookSurfaceOverride?: TextViewerThemeAppearanceConfig;
  source: BookTextThemeSource;
}

export interface ResolveBookTextThemeOptions {
  viewerPresetText?: Pick<
    TextViewerThemeSection,
    'paletteId' | 'customPalette' | 'surfaceAppearance'
  > | null;
}

export function isBookTextThemeCustom(
  override: BookTextThemeOverride | null | undefined,
): boolean {
  return override?.mode === 'custom';
}

function resolvePaletteId(
  paletteId: BookTextThemeOverride['paletteId'] | undefined,
  fallback: number,
): TextViewerThemeId {
  if (paletteId === 'custom' || paletteId == null) {
    return normalizeTextViewerThemeId(fallback);
  }
  return normalizeTextViewerThemeId(paletteId);
}

/** 解析有效阅读主题（palette + surface 配置） */
export function resolveBookTextThemeConfig(
  book: Book | null | undefined,
  globalConfig: Pick<TextViewerUiConfig, 'theme' | 'themeSurfaceAppearance'>,
  options: ResolveBookTextThemeOptions = {},
): EffectiveTextThemeConfig {
  const override = book?.readConfig?.themeOverride;
  const preset = options.viewerPresetText;
  const globalTheme = normalizeTextViewerThemeId(globalConfig.theme);

  if (isBookTextThemeCustom(override)) {
    const custom = override!;
    const theme = resolvePaletteId(custom.paletteId, globalTheme);
    return {
      theme,
      customPalette: custom.paletteId === 'custom' ? custom.customPalette : undefined,
      themeSurfaceAppearance: custom.surfaceAppearance,
      bookSurfaceOverride: custom.surfaceAppearance,
      source: 'book',
    };
  }

  const hasGlobalSurface = globalConfig.themeSurfaceAppearance != null;
  const presetSurface = preset?.surfaceAppearance;

  const themeSurfaceAppearance = hasGlobalSurface
    ? globalConfig.themeSurfaceAppearance
    : presetSurface;

  let source: BookTextThemeSource = 'default';
  if (hasGlobalSurface) {
    source = 'global';
  } else if (presetSurface != null) {
    source = 'preset';
  } else if (globalConfig.theme != null) {
    source = 'global';
  }

  return {
    theme: globalTheme,
    themeSurfaceAppearance,
    source,
  };
}

export function normalizeBookTextThemeOverride(
  raw: unknown,
): BookTextThemeOverride | undefined {
  if (raw == null || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const mode = o.mode === 'custom' ? 'custom' : o.mode === 'default' ? 'default' : undefined;
  if (!mode) return undefined;

  const out: BookTextThemeOverride = { mode };
  if (o.paletteId === 'custom') {
    out.paletteId = 'custom';
  } else if (typeof o.paletteId === 'number') {
    out.paletteId = normalizeTextViewerThemeId(o.paletteId);
  }
  if (o.customPalette != null && typeof o.customPalette === 'object') {
    const p = o.customPalette as Record<string, unknown>;
    if (
      typeof p.bg === 'string' &&
      typeof p.text === 'string' &&
      typeof p.accent === 'string' &&
      typeof p.border === 'string'
    ) {
      out.customPalette = {
        bg: p.bg,
        text: p.text,
        accent: p.accent,
        border: p.border,
        link: typeof p.link === 'string' ? p.link : undefined,
        quoteBg: typeof p.quoteBg === 'string' ? p.quoteBg : undefined,
        codeBg: typeof p.codeBg === 'string' ? p.codeBg : undefined,
        selection: typeof p.selection === 'string' ? p.selection : undefined,
      };
    }
  }
  if (o.surfaceAppearance != null && typeof o.surfaceAppearance === 'object') {
    out.surfaceAppearance = o.surfaceAppearance as TextViewerThemeAppearanceConfig;
  }
  if (typeof o.presetId === 'string' && o.presetId.trim()) {
    out.presetId = o.presetId.trim();
  }
  return out;
}
