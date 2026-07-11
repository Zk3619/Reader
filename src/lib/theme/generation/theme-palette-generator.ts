/**
 * 种子色 → 语义色板生成器（WCAG 对比度校正）
 */

import { hexToHslComponents } from '@/lib/theme/theme-semantic-colors';
import type { SemanticColorTokens, HslComponents } from '@/lib/theme/types';
import {
  adjustForegroundForContrast,
  colorToHex,
  type ContrastLevel,
} from '@/lib/theme/quality/contrast-checker';
import {
  getThemeGenerationPreset,
  type ThemeStylePresetId,
} from '@/lib/theme/generation/theme-generation-presets';
import type {
  AppThemeSection,
  ReaderThemePackV1,
  ThemePackGeneration,
} from '@/lib/theme/schema/theme-pack-v1';
import { cloneThemePack, touchThemePack } from '@/lib/theme/schema/theme-pack-v1';

export type PaletteGeneratorMode = 'light' | 'dark' | 'dual';

export interface PaletteGeneratorInput {
  primarySeed: string;
  backgroundSeed?: string;
  accentSeed?: string;
  mode: PaletteGeneratorMode;
  stylePresetId: ThemeStylePresetId;
  contrastLevel?: ContrastLevel;
}

export interface PaletteGeneratorResult {
  light: SemanticColorTokens;
  dark: SemanticColorTokens;
}

interface HslParts {
  h: number;
  s: number;
  l: number;
}

function parseHsl(hsl: string): HslParts {
  const parts = hsl.trim().split(/\s+/);
  return {
    h: parseFloat(parts[0] ?? '0'),
    s: parseFloat((parts[1] ?? '0').replace('%', '')),
    l: parseFloat((parts[2] ?? '0').replace('%', '')),
  };
}

function formatHsl({ h, s, l }: HslParts): HslComponents {
  const hue = ((h % 360) + 360) % 360;
  return `${Math.round(hue)} ${Math.round(Math.min(100, Math.max(0, s)))}% ${Math.round(Math.min(100, Math.max(0, l)))}%` as HslComponents;
}

function hexToParts(hex: string): HslParts {
  return parseHsl(hexToHslComponents(colorToHex(hex)));
}

function partsToHex(parts: HslParts): string {
  return colorToHex(formatHsl(parts));
}

function shiftParts(parts: HslParts, delta: { h?: number; s?: number; l?: number }): HslParts {
  return {
    h: parts.h + (delta.h ?? 0),
    s: parts.s + (delta.s ?? 0),
    l: parts.l + (delta.l ?? 0),
  };
}

function pairForeground(
  bgHex: string,
  preferredHex: string,
  level: ContrastLevel,
): HslComponents {
  const adjusted = adjustForegroundForContrast(preferredHex, bgHex, level);
  return hexToHslComponents(adjusted) as HslComponents;
}

function buildSemanticTokens(
  primaryHex: string,
  backgroundHex: string,
  accentHex: string,
  isDark: boolean,
  presetId: ThemeStylePresetId,
  level: ContrastLevel,
): SemanticColorTokens {
  const preset = getThemeGenerationPreset(presetId);
  const hints = preset.paletteHints;

  let primary = hexToParts(primaryHex);
  let background = hexToParts(backgroundHex);
  let accent = hexToParts(accentHex);

  if (hints.hueShift) {
    primary = shiftParts(primary, { h: hints.hueShift });
    accent = shiftParts(accent, { h: hints.hueShift });
  }
  if (hints.saturationBoost) {
    primary = shiftParts(primary, { s: hints.saturationBoost });
    accent = shiftParts(accent, { s: hints.saturationBoost });
    background = shiftParts(background, { s: hints.saturationBoost * 0.5 });
  }
  if (hints.lightnessShift) {
    background = shiftParts(background, { l: hints.lightnessShift });
  }

  if (presetId === 'highContrast') {
    background = { h: background.h, s: Math.min(background.s, 8), l: isDark ? 6 : 98 };
    primary = { h: primary.h, s: Math.min(primary.s, 12), l: isDark ? 96 : 8 };
    accent = { h: accent.h, s: Math.min(accent.s, 20), l: isDark ? 90 : 12 };
  }

  if (presetId === 'cyber') {
    accent = shiftParts(accent, { s: 25, l: isDark ? 8 : -8 });
    primary = shiftParts(primary, { s: 15 });
  }

  const bgHex = partsToHex(background);
  const primaryBaseHex = partsToHex(primary);
  const accentBaseHex = partsToHex(accent);

  const card = shiftParts(background, { l: isDark ? 4 : -2 });
  const muted = shiftParts(background, { l: isDark ? 6 : -4, s: -6 });
  const secondary = shiftParts(background, { l: isDark ? 8 : -6, s: -4 });
  const border = shiftParts(background, { l: isDark ? 10 : -8, s: -8 });
  const popover = shiftParts(background, { l: isDark ? 2 : -1 });
  const sidebar = shiftParts(background, { l: isDark ? 3 : -3, s: -2 });
  const sidebarAccent = shiftParts(sidebar, { l: isDark ? 6 : -4 });

  const destructiveHex = isDark ? '#ef4444' : '#dc2626';
  const infoHex = isDark ? '#38bdf8' : '#0284c7';
  const successHex = isDark ? '#4ade80' : '#16a34a';
  const warningHex = isDark ? '#fbbf24' : '#d97706';
  const errorHex = isDark ? '#f87171' : '#ef4444';

  const foregroundHex = isDark ? '#fafafa' : '#0a0a0a';
  const mutedFgHex = isDark ? '#a3a3a3' : '#737373';

  return {
    background: formatHsl(background),
    foreground: pairForeground(bgHex, foregroundHex, level),
    muted: formatHsl(muted),
    mutedForeground: pairForeground(partsToHex(muted), mutedFgHex, level),
    popover: formatHsl(popover),
    popoverForeground: pairForeground(partsToHex(popover), foregroundHex, level),
    border: formatHsl(border),
    input: formatHsl(border),
    card: formatHsl(card),
    cardForeground: pairForeground(partsToHex(card), foregroundHex, level),
    primary: formatHsl(primary),
    primaryForeground: pairForeground(primaryBaseHex, isDark ? '#0a0a0a' : '#fafafa', level),
    secondary: formatHsl(secondary),
    secondaryForeground: pairForeground(partsToHex(secondary), foregroundHex, level),
    accent: formatHsl(accent),
    accentForeground: pairForeground(accentBaseHex, isDark ? '#0a0a0a' : '#fafafa', level),
    destructive: hexToHslComponents(destructiveHex) as HslComponents,
    destructiveForeground: pairForeground(destructiveHex, isDark ? '#fafafa' : '#ffffff', level),
    info: hexToHslComponents(isDark ? '#0c4a6e' : '#e0f2fe') as HslComponents,
    infoForeground: pairForeground(
      isDark ? '#0c4a6e' : '#e0f2fe',
      infoHex,
      level,
    ),
    success: hexToHslComponents(isDark ? '#14532d' : '#dcfce7') as HslComponents,
    successForeground: pairForeground(
      isDark ? '#14532d' : '#dcfce7',
      successHex,
      level,
    ),
    warning: hexToHslComponents(isDark ? '#78350f' : '#fef3c7') as HslComponents,
    warningForeground: pairForeground(
      isDark ? '#78350f' : '#fef3c7',
      warningHex,
      level,
    ),
    error: hexToHslComponents(isDark ? '#7f1d1d' : '#fee2e2') as HslComponents,
    errorForeground: pairForeground(
      isDark ? '#7f1d1d' : '#fee2e2',
      errorHex,
      level,
    ),
    ring: formatHsl(shiftParts(primary, { l: isDark ? 20 : -20 })),
    sidebar: formatHsl(sidebar),
    sidebarForeground: pairForeground(partsToHex(sidebar), foregroundHex, level),
    sidebarAccent: formatHsl(sidebarAccent),
    sidebarAccentForeground: pairForeground(partsToHex(sidebarAccent), foregroundHex, level),
    sidebarBorder: formatHsl(border),
    sidebarRing: formatHsl(shiftParts(primary, { l: isDark ? 20 : -20 })),
  };
}

/** 由种子色生成 light / dark 语义色板 */
export function generateSemanticPalette(input: PaletteGeneratorInput): PaletteGeneratorResult {
  const preset = getThemeGenerationPreset(input.stylePresetId);
  const level = input.contrastLevel ?? 'AA';
  const primarySeed = colorToHex(input.primarySeed);
  const backgroundSeed = colorToHex(input.backgroundSeed ?? (input.mode === 'dark' ? '#0f0f12' : '#fafafa'));
  const accentSeed = colorToHex(input.accentSeed ?? input.primarySeed);

  const lightBg = input.mode === 'dark' ? '#18181b' : backgroundSeed;
  const darkBg = input.mode === 'light' ? '#09090b' : backgroundSeed;

  return {
    light: buildSemanticTokens(primarySeed, lightBg, accentSeed, false, preset.id, level),
    dark: buildSemanticTokens(primarySeed, darkBg, accentSeed, true, preset.id, level),
  };
}

function applyPresetSurfaces(app: AppThemeSection, presetId: ThemeStylePresetId): AppThemeSection {
  const preset = getThemeGenerationPreset(presetId);
  const components = { ...app.components };

  for (const [componentId, surface] of Object.entries(preset.componentSurfaceDefaults ?? {})) {
    const id = componentId as keyof typeof components;
    components[id] = {
      ...components[id],
      surfaceAppearance: {
        ...components[id]?.surfaceAppearance,
        ...surface,
      },
    };
  }

  return {
    ...app,
    components,
    motion: { ...app.motion, ...preset.motion },
    tokens: {
      ...app.tokens,
      layout: { ...app.tokens.layout, ...preset.layout },
    },
  };
}

/** 将生成结果写入主题包草稿 */
export function applyPaletteToThemePack(
  pack: ReaderThemePackV1,
  input: PaletteGeneratorInput,
): ReaderThemePackV1 {
  const palette = generateSemanticPalette(input);
  const next = cloneThemePack(pack);
  const app = next.app ?? { mode: 'dual' as const, tokens: pack.app!.tokens };

  const mode = input.mode;
  const tokens = {
    ...app.tokens,
    light: mode === 'dark' ? app.tokens.light : palette.light,
    dark: mode === 'light' ? app.tokens.dark : palette.dark,
  };

  const generation: ThemePackGeneration = {
    primarySeed: colorToHex(input.primarySeed),
    backgroundSeed: input.backgroundSeed ? colorToHex(input.backgroundSeed) : undefined,
    accentSeed: input.accentSeed ? colorToHex(input.accentSeed) : undefined,
    stylePresetId: input.stylePresetId,
    generatedAt: new Date().toISOString(),
    lockedPaths: pack.generation?.lockedPaths,
  };

  next.app = applyPresetSurfaces({ ...app, tokens, mode: mode === 'dual' ? 'dual' : mode }, input.stylePresetId);
  next.generation = generation;

  return touchThemePack(next);
}
