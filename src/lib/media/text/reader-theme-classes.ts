/**
 * 阅读器主题 0–8：语义化名称 + Legado readConfig 与 Reader 原配色融合
 * @see legados-main/app/src/main/assets/defaultData/readConfig.json
 */

export const READER_THEME_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
export type ReaderThemeId = (typeof READER_THEME_IDS)[number];

/** 与 Legado 夜间模式对齐的主题 ID */
export const READER_NIGHT_THEME_ID = 6 as const satisfies ReaderThemeId;

export interface ReaderThemePalette {
  /** UI 显示名（护眼绿、淡蓝等） */
  name: string;
  bg: string;
  text: string;
  /** 强调色（朗读高亮等） */
  accent: string;
  /** 底栏顶边框（与背景对比明显） */
  border: string;
  /** 亮度胶囊与滑条配色 */
  brightnessChrome: ReaderBrightnessChrome;
}

/** 阅读器亮度胶囊 / 竖向滑条配色（随阅读主题） */
export interface ReaderBrightnessChrome {
  capsuleBg: string;
  foreground: string;
  buttonHoverBg: string;
  sliderTrack: string;
  sliderFill: string;
  sliderThumb: string;
  /** 胶囊边缘荧光阴影（box-shadow） */
  capsuleGlow: string;
}

type ReaderThemePaletteCore = Omit<ReaderThemePalette, 'brightnessChrome'>;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbaHex(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const linear = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

/** 由阅读主题 bg / text / border 派生亮度胶囊配色，与正文背景/前景一致 */
export function deriveReaderBrightnessChrome(
  bg: string,
  text: string,
  border: string,
): ReaderBrightnessChrome {
  const darkBg = relativeLuminance(bg) < 0.45;
  const trackAlpha = darkBg ? 0.32 : 0.26;
  const fillAlpha = darkBg ? 0.9 : 0.8;
  const glowStrength = darkBg ? 0.58 : 0.48;

  return {
    capsuleBg: bg,
    foreground: text,
    buttonHoverBg: rgbaHex(text, darkBg ? 0.14 : 0.1),
    sliderTrack: rgbaHex(text, trackAlpha),
    sliderFill: rgbaHex(text, fillAlpha),
    sliderThumb: text,
    capsuleGlow: `0 0 0 1px ${rgbaHex(border, 0.42)}, 0 0 16px ${rgbaHex(border, glowStrength)}, 0 0 6px ${rgbaHex(text, 0.18)}`,
  };
}

function defineReaderThemePalette(core: ReaderThemePaletteCore): ReaderThemePalette {
  return {
    ...core,
    brightnessChrome: deriveReaderBrightnessChrome(core.bg, core.text, core.border),
  };
}

/**
 * 0–5：融合配色；6 夜间 / 7 日间 / 8 微信读书与 Legado readConfig 日间或夜间值对齐。
 */
export const READER_THEME_PALETTES: Record<ReaderThemeId, ReaderThemePalette> = {
  0: defineReaderThemePalette({
    name: '默认',
    bg: '#f5f0e6',
    text: '#5b4636',
    accent: '#E53935',
    border: '#9c8b7a',
  }),
  1: defineReaderThemePalette({
    name: '护眼绿',
    bg: '#d5e9d1',
    text: '#596C44',
    accent: '#E53935',
    border: '#43a047',
  }),
  2: defineReaderThemePalette({
    name: '羊皮纸',
    bg: '#DDC090',
    text: '#3E3422',
    accent: '#834E00',
    border: '#a08060',
  }),
  3: defineReaderThemePalette({
    name: '淡蓝',
    bg: '#c4dff1',
    text: '#3D4C54',
    accent: '#E53935',
    border: '#6d9eb8',
  }),
  4: defineReaderThemePalette({
    name: '淡紫',
    bg: '#e7cef0',
    text: '#68516C',
    accent: '#801314',
    border: '#a888b0',
  }),
  5: defineReaderThemePalette({
    name: '深色',
    bg: '#263238',
    text: '#b0bec5',
    accent: '#FE4D55',
    border: '#546e7a',
  }),
  6: defineReaderThemePalette({
    name: '夜间',
    bg: '#000000',
    text: '#ADADAD',
    accent: '#FE4D55',
    border: '#444444',
  }),
  7: defineReaderThemePalette({
    name: '日间',
    bg: '#FFFFFF',
    text: '#000000',
    accent: '#E53935',
    border: '#d0d0d0',
  }),
  8: defineReaderThemePalette({
    name: '微信读书',
    bg: '#c0edc6',
    text: '#0b0b0b',
    accent: '#E53935',
    border: '#7ab889',
  }),
};

export const READER_THEME_LABELS: Record<ReaderThemeId, string> = {
  0: READER_THEME_PALETTES[0].name,
  1: READER_THEME_PALETTES[1].name,
  2: READER_THEME_PALETTES[2].name,
  3: READER_THEME_PALETTES[3].name,
  4: READER_THEME_PALETTES[4].name,
  5: READER_THEME_PALETTES[5].name,
  6: READER_THEME_PALETTES[6].name,
  7: READER_THEME_PALETTES[7].name,
  8: READER_THEME_PALETTES[8].name,
};

export const READER_THEME_DEFAULT_BG = READER_THEME_PALETTES[0].bg;

const READER_THEME_MAX_ID = READER_THEME_IDS[READER_THEME_IDS.length - 1];

function twBg(hex: string): string {
  return `bg-[${hex}]`;
}

function twText(hex: string): string {
  return `text-[${hex}]`;
}

function twBorderTop(hex: string): string {
  return `border-t-[${hex}]`;
}

export const READER_THEME_CLASSES: Record<ReaderThemeId, { bg: string; text: string }> =
  Object.fromEntries(
    READER_THEME_IDS.map((id) => {
      const palette = READER_THEME_PALETTES[id];
      return [id, { bg: twBg(palette.bg), text: twText(palette.text) }];
    }),
  ) as Record<ReaderThemeId, { bg: string; text: string }>;

export function normalizeReaderThemeId(themeId: unknown): ReaderThemeId {
  const n = typeof themeId === 'number' ? themeId : Number(themeId);
  if (Number.isInteger(n) && n >= 0 && n <= READER_THEME_MAX_ID) return n as ReaderThemeId;
  return 0;
}

export function isReaderNightTheme(themeId: number): boolean {
  return normalizeReaderThemeId(themeId) === READER_NIGHT_THEME_ID;
}

export function readerThemePalette(themeId: number): ReaderThemePalette {
  return READER_THEME_PALETTES[normalizeReaderThemeId(themeId)];
}

export function readerThemeBackground(themeId: number): string {
  return readerThemePalette(themeId).bg;
}

export function readerThemeClasses(themeId: number) {
  return READER_THEME_CLASSES[normalizeReaderThemeId(themeId)];
}

export function readerThemeBarClasses(themeId: number) {
  const palette = readerThemePalette(themeId);
  return {
    bg: twBg(palette.bg),
    text: twText(palette.text),
    border: twBorderTop(palette.border),
  };
}

export function readerThemeBrightnessChrome(themeId: number): ReaderBrightnessChrome {
  return readerThemePalette(themeId).brightnessChrome;
}

/** 亮度胶囊使用应用主题（顶底栏未跟随页面时的配色语义） */
export function appThemeBrightnessChrome(): ReaderBrightnessChrome {
  return {
    capsuleBg: 'hsl(var(--background))',
    foreground: 'hsl(var(--foreground))',
    buttonHoverBg: 'hsl(var(--foreground) / 0.08)',
    sliderTrack: 'hsl(var(--foreground) / 0.22)',
    sliderFill: 'hsl(var(--primary))',
    sliderThumb: 'hsl(var(--foreground))',
    capsuleGlow:
      '0 0 0 1px hsl(var(--border) / 0.42), 0 0 16px hsl(var(--primary) / 0.38), 0 0 6px hsl(var(--foreground) / 0.12)',
  };
}

export function resolveBrightnessChrome(
  themeId: number,
  followPage: boolean,
): ReaderBrightnessChrome {
  return followPage ? readerThemeBrightnessChrome(themeId) : appThemeBrightnessChrome();
}
