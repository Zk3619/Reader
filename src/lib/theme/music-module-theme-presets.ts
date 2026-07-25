/**
 * @deprecated 音乐模块内置 LX 主题预设已弃用：不再种子写入 / 设置入口；能力保留供主题工作室迁移参考。
 * 名称与主色取自 LX Music Desktop 的 src/common/theme/index.json。
 * Reader 只借鉴配色，不复制 LX 的全局 CSS 或页面结构。
 */
import { DEFAULT_APP_THEME } from '@/lib/theme/AppTheme';
import {
  THEME_PACK_SCHEMA_VERSION_V3,
  type ReaderThemePackV1,
  type ThemePresetRecord,
} from '@/lib/theme/schema/theme-pack-v1';
import type { HslComponents, SemanticColorTokens } from '@/lib/theme/types';

export const MUSIC_MODULE_BUILTIN_PRESET_ID_PREFIX = 'builtin-music-lx-';

export interface MusicModuleThemeSeed {
  id: string;
  name: string;
  primary: readonly [number, number, number];
}

export const LX_MUSIC_MODULE_THEME_SEEDS: readonly MusicModuleThemeSeed[] = [
  { id: 'green', name: '绿意盎然', primary: [77, 175, 124] },
  { id: 'blue', name: '蓝田生玉', primary: [52, 152, 219] },
  { id: 'blue-plus', name: '蛋雅深蓝', primary: [77, 131, 175] },
  { id: 'orange', name: '橙黄橘绿', primary: [245, 171, 53] },
  { id: 'red', name: '热情似火', primary: [214, 69, 65] },
  { id: 'pink', name: '粉装玉琢', primary: [241, 130, 141] },
  { id: 'purple', name: '重斤球紫', primary: [155, 89, 182] },
  { id: 'grey', name: '灰常美丽', primary: [108, 122, 137] },
  { id: 'ming', name: '青出于黑', primary: [51, 110, 123] },
  { id: 'blue2', name: '清热板蓝', primary: [79, 98, 208] },
] as const;

function rgbToHsl([red, green, blue]: readonly [number, number, number]): {
  h: number;
  s: number;
  l: number;
} {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return {
    h: Math.round(hue),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
}

function hsl(h: number, s: number, l: number): HslComponents {
  return `${h} ${s}% ${l}%`;
}

function relativeLuminance([red, green, blue]: readonly [number, number, number]): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function createSemanticTokens(
  base: SemanticColorTokens,
  primary: readonly [number, number, number],
  mode: 'light' | 'dark',
): SemanticColorTokens {
  const { h, s, l } = rgbToHsl(primary);
  const primaryColor = hsl(h, s, l);
  const primaryForeground =
    relativeLuminance(primary) > 0.42 ? hsl(h, Math.min(s, 25), 12) : '0 0% 98%';
  const surfaceSaturation = Math.min(Math.max(s, 8), 20);
  const foregroundSaturation = Math.min(Math.max(s, 10), 28);
  const foreground =
    mode === 'light'
      ? hsl(h, foregroundSaturation, 12)
      : hsl(h, Math.min(foregroundSaturation, 20), 94);
  const background =
    mode === 'light'
      ? hsl(h, surfaceSaturation, 98)
      : hsl(h, Math.min(surfaceSaturation, 16), 7);
  const card =
    mode === 'light'
      ? hsl(h, Math.min(surfaceSaturation, 12), 100)
      : hsl(h, Math.min(surfaceSaturation, 16), 10);
  const muted =
    mode === 'light'
      ? hsl(h, surfaceSaturation, 94)
      : hsl(h, Math.min(surfaceSaturation, 18), 16);
  const mutedForeground =
    mode === 'light'
      ? hsl(h, Math.min(foregroundSaturation, 22), 40)
      : hsl(h, Math.min(foregroundSaturation, 18), 68);
  const border =
    mode === 'light'
      ? hsl(h, Math.min(surfaceSaturation, 18), 86)
      : hsl(h, Math.min(surfaceSaturation, 18), 22);
  const subtle = mode === 'light'
    ? hsl(h, Math.min(Math.max(s, 18), 65), 92)
    : hsl(h, Math.min(Math.max(s, 18), 55), 20);
  const subtleForeground =
    mode === 'light'
      ? hsl(h, Math.min(s, 65), 28)
      : hsl(h, Math.min(s, 55), 88);

  return {
    ...base,
    background,
    foreground,
    card,
    cardForeground: foreground,
    popover: card,
    popoverForeground: foreground,
    muted,
    mutedForeground,
    border,
    input: border,
    primary: primaryColor,
    primaryForeground,
    secondary: muted,
    secondaryForeground: foreground,
    ring: primaryColor,
    sidebar: mode === 'light' ? muted : card,
    sidebarForeground: foreground,
    accent: subtle,
    accentForeground: subtleForeground,
    sidebarAccent: subtle,
    sidebarAccentForeground: subtleForeground,
    sidebarRing: primaryColor,
  };
}

export function createMusicModuleThemePreset(seed: MusicModuleThemeSeed): ReaderThemePackV1 {
  const id = `${MUSIC_MODULE_BUILTIN_PRESET_ID_PREFIX}${seed.id}`;
  const timestamp = '2026-01-01T00:00:00.000Z';
  return {
    schemaVersion: THEME_PACK_SCHEMA_VERSION_V3,
    id,
    name: seed.name,
    author: 'Reader（LX Music 配色灵感）',
    description: `音乐模块内置主题，主色沿用 LX Music「${seed.name}」。`,
    createdAt: timestamp,
    updatedAt: timestamp,
    tags: ['music', 'builtin', 'lx-inspired'],
    scopes: { app: false, viewer: false },
    targets: {
      'module.music': {
        tokens: {
          id,
          name: seed.name,
          light: createSemanticTokens(DEFAULT_APP_THEME.light, seed.primary, 'light'),
          dark: createSemanticTokens(DEFAULT_APP_THEME.dark, seed.primary, 'dark'),
          layout: DEFAULT_APP_THEME.layout ? { ...DEFAULT_APP_THEME.layout } : undefined,
        },
      },
    },
  };
}

export const MUSIC_MODULE_BUILTIN_THEME_PRESETS: readonly ReaderThemePackV1[] =
  LX_MUSIC_MODULE_THEME_SEEDS.map(createMusicModuleThemePreset);

const musicBuiltinIds = new Set(MUSIC_MODULE_BUILTIN_THEME_PRESETS.map((preset) => preset.id));

export function isMusicModuleBuiltinPresetId(id: string): boolean {
  return musicBuiltinIds.has(id);
}

export function isThemePresetApplicableToMusicModule(
  preset: Pick<ThemePresetRecord, 'manifest'>,
): boolean {
  return preset.manifest.schemaVersion === THEME_PACK_SCHEMA_VERSION_V3 &&
    preset.manifest.targets?.['module.music'] != null;
}

/** 纯逻辑拆分，便于在不启动数据库的测试中验证注册行为。 */
export function getMissingMusicModuleBuiltinPresets(
  existingIds: Iterable<string>,
): readonly ReaderThemePackV1[] {
  const existing = new Set(existingIds);
  return MUSIC_MODULE_BUILTIN_THEME_PRESETS.filter((preset) => !existing.has(preset.id));
}
