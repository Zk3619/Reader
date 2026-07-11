/**
 * 主题生成风格预设 — 7 种壳层 / surface 默认
 */

import type {
  AppComponentId,
  ComponentSurfaceAppearance,
  MotionTokens,
} from '@/lib/theme/schema/theme-pack-v1';
import type { LayoutTokens } from '@/lib/theme/types';

export type ThemeStylePresetId =
  | 'default'
  | 'minimal'
  | 'md3'
  | 'glass'
  | 'paper'
  | 'highContrast'
  | 'cyber';

export interface ThemePaletteHints {
  /** 饱和度偏移（-100 ~ 100） */
  saturationBoost?: number;
  /** 亮度偏移（-100 ~ 100） */
  lightnessShift?: number;
  /** 对比度增强系数（0 ~ 1） */
  contrastBoost?: number;
  /** 种子色色相偏移（度） */
  hueShift?: number;
}

export interface ThemeGenerationPreset {
  id: ThemeStylePresetId;
  label: string;
  description: string;
  paletteHints: ThemePaletteHints;
  layout?: Partial<LayoutTokens>;
  motion?: Partial<MotionTokens>;
  componentSurfaceDefaults?: Partial<Record<AppComponentId, ComponentSurfaceAppearance>>;
}

const FULL_OPACITY: ComponentSurfaceAppearance = { opacity: 100, blurPx: 0 };

export const THEME_GENERATION_PRESETS: ThemeGenerationPreset[] = [
  {
    id: 'default',
    label: '默认',
    description: '标准壳层，全不透明，无模糊',
    paletteHints: {},
    componentSurfaceDefaults: {
      appShell: FULL_OPACITY,
      sidebar: FULL_OPACITY,
      bookshelfCard: FULL_OPACITY,
      settingsCard: FULL_OPACITY,
    },
  },
  {
    id: 'minimal',
    label: '极简',
    description: '低饱和、扁平表面，全不透明',
    paletteHints: { saturationBoost: -15, lightnessShift: 2 },
    componentSurfaceDefaults: {
      appShell: FULL_OPACITY,
      topNav: FULL_OPACITY,
      sidebar: FULL_OPACITY,
      bookshelfCard: FULL_OPACITY,
    },
  },
  {
    id: 'md3',
    label: 'MD3',
    description: 'Material 3 风格，卡片微透明，圆角加大',
    paletteHints: { saturationBoost: 5 },
    layout: { radius: '0.75rem' },
    componentSurfaceDefaults: {
      appShell: FULL_OPACITY,
      bookshelfCard: { opacity: 96, blurPx: 0 },
      settingsCard: { opacity: 96, blurPx: 0 },
      surfaceCard: { opacity: 96, blurPx: 0 },
    },
  },
  {
    id: 'glass',
    label: '玻璃拟态',
    description: '壳层与卡片半透明，8–16px 模糊',
    paletteHints: { saturationBoost: 8, lightnessShift: 4 },
    componentSurfaceDefaults: {
      appShell: { opacity: 82, blurPx: 12 },
      topNav: { opacity: 78, blurPx: 10 },
      sidebar: { opacity: 80, blurPx: 12 },
      bookshelfCard: { opacity: 75, blurPx: 8 },
      settingsCard: { opacity: 75, blurPx: 8 },
      dialog: { opacity: 88, blurPx: 16 },
    },
  },
  {
    id: 'paper',
    label: '纸质感',
    description: '内容区全不透明，chrome 微透明带模糊',
    paletteHints: { saturationBoost: -8, lightnessShift: 6 },
    componentSurfaceDefaults: {
      appShell: FULL_OPACITY,
      pageContent: FULL_OPACITY,
      sidebar: { opacity: 90, blurPx: 12 },
      topNav: { opacity: 90, blurPx: 12 },
      bookshelfCard: FULL_OPACITY,
    },
  },
  {
    id: 'highContrast',
    label: '高对比',
    description: '黑白极端对比，无模糊',
    paletteHints: { contrastBoost: 1, saturationBoost: -20 },
    componentSurfaceDefaults: {
      appShell: FULL_OPACITY,
      sidebar: FULL_OPACITY,
      bookshelfCard: FULL_OPACITY,
    },
  },
  {
    id: 'cyber',
    label: '赛博',
    description: '高饱和霓虹强调色',
    paletteHints: { saturationBoost: 35, hueShift: 15, contrastBoost: 0.3 },
    componentSurfaceDefaults: {
      appShell: { opacity: 92, blurPx: 4 },
      sidebar: { opacity: 88, blurPx: 6 },
      bookshelfCard: { opacity: 85, blurPx: 4 },
    },
  },
];

export const THEME_STYLE_PRESET_IDS = THEME_GENERATION_PRESETS.map((p) => p.id);

export function getThemeGenerationPreset(id: ThemeStylePresetId): ThemeGenerationPreset {
  return THEME_GENERATION_PRESETS.find((p) => p.id === id) ?? THEME_GENERATION_PRESETS[0]!;
}

export function isThemeStylePresetId(value: string): value is ThemeStylePresetId {
  return THEME_STYLE_PRESET_IDS.includes(value as ThemeStylePresetId);
}
