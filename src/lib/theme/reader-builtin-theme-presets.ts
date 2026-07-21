/**
 * 阅读向内置主题包（壳 + 阅读表面；仅本地，无云同步）
 */

import { DEFAULT_APP_THEME } from '@/lib/theme/AppTheme';
import {
  createDefaultThemePack,
  touchThemePack,
  type ReaderThemePackV1,
} from '@/lib/theme/schema/theme-pack-v1';
import type { HslComponents, SemanticColorTokens, TextViewerThemeId } from '@/lib/theme/types';
import { applyPaletteToThemePack } from '@/lib/theme/generation/theme-palette-generator';

export const READER_BUILTIN_PRESET_ID_PREFIX = 'builtin-reader-';

interface ReaderBuiltinSeed {
  id: string;
  name: string;
  description: string;
  /** 主色种子（hex） */
  primarySeed: string;
  backgroundSeed: string;
  accentSeed?: string;
  stylePresetId: 'paper' | 'minimal' | 'default' | 'highContrast';
  /** 阅读页内置色板 */
  paletteId: TextViewerThemeId;
  pair: 'day' | 'night';
}

/**
 * 日/夜成对：青瓷、沙丘、松烟、素纸（共 8 个完整包）
 */
export const READER_BUILTIN_THEME_SEEDS: readonly ReaderBuiltinSeed[] = [
  {
    id: 'celadon-day',
    name: '青瓷·日',
    description: '浅青壳层 + 护眼阅读表面',
    primarySeed: '#3d7a6e',
    backgroundSeed: '#f4f8f6',
    accentSeed: '#5a9a8a',
    stylePresetId: 'paper',
    paletteId: 2,
    pair: 'day',
  },
  {
    id: 'celadon-night',
    name: '青瓷·夜',
    description: '深青壳层 + 夜间阅读表面',
    primarySeed: '#7eb8a8',
    backgroundSeed: '#0f1715',
    accentSeed: '#4a8a78',
    stylePresetId: 'minimal',
    paletteId: 6,
    pair: 'night',
  },
  {
    id: 'dune-day',
    name: '沙丘·日',
    description: '暖沙背景，适合长时间阅读',
    primarySeed: '#9a6b3f',
    backgroundSeed: '#f7f1e6',
    accentSeed: '#c48a4a',
    stylePresetId: 'paper',
    paletteId: 1,
    pair: 'day',
  },
  {
    id: 'dune-night',
    name: '沙丘·夜',
    description: '暖褐夜间壳，降低蓝光感',
    primarySeed: '#d4a574',
    backgroundSeed: '#1a1410',
    accentSeed: '#a67c52',
    stylePresetId: 'minimal',
    paletteId: 5,
    pair: 'night',
  },
  {
    id: 'pine-day',
    name: '松烟·日',
    description: '冷灰绿，偏工具感壳层',
    primarySeed: '#4a6670',
    backgroundSeed: '#f2f5f6',
    accentSeed: '#6a8a94',
    stylePresetId: 'default',
    paletteId: 0,
    pair: 'day',
  },
  {
    id: 'pine-night',
    name: '松烟·夜',
    description: '墨青夜间，高对比正文',
    primarySeed: '#8aabb8',
    backgroundSeed: '#0c1012',
    accentSeed: '#5a7a86',
    stylePresetId: 'highContrast',
    paletteId: 7,
    pair: 'night',
  },
  {
    id: 'plain-day',
    name: '素纸·日',
    description: '低饱和纸白，极简壳',
    primarySeed: '#5c5c5c',
    backgroundSeed: '#fafafa',
    accentSeed: '#8a8a8a',
    stylePresetId: 'minimal',
    paletteId: 0,
    pair: 'day',
  },
  {
    id: 'plain-night',
    name: '素纸·夜',
    description: '纯黑灰夜间，减少色彩干扰',
    primarySeed: '#c8c8c8',
    backgroundSeed: '#0a0a0a',
    accentSeed: '#8e8e8e',
    stylePresetId: 'highContrast',
    paletteId: 8,
    pair: 'night',
  },
] as const;

function hslComponents(h: number, s: number, l: number): HslComponents {
  return `${h} ${s}% ${l}%`;
}

function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

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

function tintSemantic(
  base: SemanticColorTokens,
  primaryHex: string,
  mode: 'light' | 'dark',
): SemanticColorTokens {
  const { h, s, l } = rgbToHsl(hexToRgb(primaryHex));
  const primary = hslComponents(h, s, l);
  const surfaceSat = Math.min(Math.max(s, 6), 18);
  const fgSat = Math.min(Math.max(s, 8), 24);
  return {
    ...base,
    primary,
    primaryForeground: mode === 'light' ? hslComponents(h, Math.min(s, 20), 98) : hslComponents(h, Math.min(s, 20), 12),
    ring: primary,
    background:
      mode === 'light'
        ? hslComponents(h, surfaceSat, 98)
        : hslComponents(h, Math.min(surfaceSat, 14), 7),
    foreground:
      mode === 'light'
        ? hslComponents(h, fgSat, 12)
        : hslComponents(h, Math.min(fgSat, 18), 94),
    card:
      mode === 'light'
        ? hslComponents(h, Math.min(surfaceSat, 10), 100)
        : hslComponents(h, Math.min(surfaceSat, 14), 10),
    muted:
      mode === 'light'
        ? hslComponents(h, surfaceSat, 94)
        : hslComponents(h, Math.min(surfaceSat, 16), 16),
    border:
      mode === 'light'
        ? hslComponents(h, Math.min(surfaceSat, 16), 88)
        : hslComponents(h, Math.min(surfaceSat, 16), 22),
  };
}

export function createReaderBuiltinThemePreset(seed: ReaderBuiltinSeed): ReaderThemePackV1 {
  const id = `${READER_BUILTIN_PRESET_ID_PREFIX}${seed.id}`;
  const timestamp = '2026-07-22T00:00:00.000Z';
  let pack = createDefaultThemePack({
    name: seed.name,
    scopes: { app: true, viewer: true },
  });
  pack = applyPaletteToThemePack(pack, {
    primarySeed: seed.primarySeed,
    backgroundSeed: seed.backgroundSeed,
    accentSeed: seed.accentSeed,
    stylePresetId: seed.stylePresetId,
    mode: seed.pair === 'night' ? 'dark' : 'light',
  });
  pack.id = id;
  pack.name = seed.name;
  pack.author = 'Reader';
  pack.description = `${seed.description}（本地内置，可导出；无云同步）`;
  pack.createdAt = timestamp;
  pack.updatedAt = timestamp;
  pack.tags = ['reader', 'builtin', seed.pair, 'local-only'];
  pack.scopes = { app: true, viewer: true };
  if (pack.app?.tokens) {
    pack.app.tokens = {
      ...pack.app.tokens,
      id,
      name: seed.name,
      light: tintSemantic(DEFAULT_APP_THEME.light, seed.primarySeed, 'light'),
      dark: tintSemantic(DEFAULT_APP_THEME.dark, seed.primarySeed, 'dark'),
    };
    pack.app.mode = seed.pair === 'night' ? 'dark' : 'light';
  }
  pack.viewer = {
    text: {
      paletteId: seed.paletteId,
    },
  };
  return touchThemePack(pack);
}

export const READER_BUILTIN_THEME_PRESETS: readonly ReaderThemePackV1[] =
  READER_BUILTIN_THEME_SEEDS.map(createReaderBuiltinThemePreset);
