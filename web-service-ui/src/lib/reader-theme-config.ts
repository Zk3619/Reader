/**
 * 阅读主题与字体配置（对齐 Legado themeConfig）
 */

export interface ReaderThemePreset {
  name: string;
  bodyBg: string;
  contentBg: string;
  fg: string;
  /** CSS background 简写，可含纹理 */
  bodyTexture?: string;
  contentTexture?: string;
}

export const READER_THEME_PRESETS: ReaderThemePreset[] = [
  {
    name: '宣纸',
    bodyBg: '#ede7da',
    contentBg: '#ede7da',
    fg: '#3d3d3d',
    bodyTexture: 'linear-gradient(135deg, #ede7da 0%, #e8e0d0 50%, #ede7da 100%)',
    contentTexture: 'linear-gradient(180deg, #f0e9dc 0%, #ede7da 100%)',
  },
  {
    name: '羊皮',
    bodyBg: '#e8dcc8',
    contentBg: '#efe4d2',
    fg: '#4a3f35',
    bodyTexture: 'linear-gradient(160deg, #e8dcc8 0%, #dcc9ad 100%)',
    contentTexture: 'linear-gradient(180deg, #efe4d2 0%, #e8dcc8 100%)',
  },
  {
    name: '浅绿',
    bodyBg: '#d8e8d4',
    contentBg: '#e4f0e0',
    fg: '#2d4a2e',
    bodyTexture: 'linear-gradient(180deg, #d8e8d4 0%, #cce0c8 100%)',
    contentTexture: 'linear-gradient(180deg, #e4f0e0 0%, #d8e8d4 100%)',
  },
  {
    name: '浅蓝',
    bodyBg: '#d4e4f0',
    contentBg: '#e0eef8',
    fg: '#2a3d4f',
    bodyTexture: 'linear-gradient(180deg, #d4e4f0 0%, #c8d8e8 100%)',
    contentTexture: 'linear-gradient(180deg, #e0eef8 0%, #d4e4f0 100%)',
  },
  {
    name: '淡粉',
    bodyBg: '#ebcece',
    contentBg: '#f5e4e4',
    fg: '#5c3d3d',
    bodyTexture: '#ebcece',
    contentTexture: '#f5e4e4',
  },
  {
    name: '米黄',
    bodyBg: '#f4ecd8',
    contentBg: '#faf6ec',
    fg: '#5b4636',
    bodyTexture: 'linear-gradient(180deg, #f4ecd8 0%, #ebe0c8 100%)',
    contentTexture: 'linear-gradient(180deg, #faf6ec 0%, #f4ecd8 100%)',
  },
  {
    name: '夜间',
    bodyBg: '#1a1a1a',
    contentBg: '#222222',
    fg: '#e8e8e8',
    bodyTexture: '#1a1a1a',
    contentTexture: '#222222',
  },
];

export const READER_FONT_PRESETS = [
  {
    id: 0,
    label: '系统默认',
    family: 'Microsoft YaHei, PingFangSC-Regular, HelveticaNeue-Light, Helvetica Neue Light, sans-serif',
  },
  {
    id: 1,
    label: '苹方 / 宋体',
    family: 'PingFangSC-Regular, -apple-system, Simsun, serif',
  },
  {
    id: 2,
    label: '楷体',
    family: 'Kaiti, STKaiti, KaiTi, serif',
  },
] as const;

export interface ReaderSpacing {
  paragraph: number;
  line: number;
  letter: number;
}

export const DEFAULT_READER_SPACING: ReaderSpacing = {
  paragraph: 1,
  line: 0.8,
  letter: 0,
};

export function resolveThemeIndex(config: { theme?: number; themeName?: string }): number {
  if (typeof config.theme === 'number' && config.theme >= 0 && config.theme < READER_THEME_PRESETS.length) {
    return config.theme;
  }
  const legacy: Record<string, number> = {
    default: 0,
    sepia: 5,
    green: 2,
    dark: 6,
  };
  const name = config.themeName ?? 'default';
  return legacy[name] ?? 0;
}

export function themePresetAt(index: number): ReaderThemePreset {
  return READER_THEME_PRESETS[index] ?? READER_THEME_PRESETS[0];
}

export function fontFamilyAt(fontId?: number, customFontName?: string): string {
  if (customFontName?.trim()) return customFontName.trim();
  const preset = READER_FONT_PRESETS.find((f) => f.id === fontId);
  return preset?.family ?? READER_FONT_PRESETS[0].family;
}

export function lineHeightFromSpacing(spacing?: Partial<ReaderSpacing>, fallback = 1.8): number {
  const line = spacing?.line;
  if (line == null) return fallback;
  return 1.2 + line * 0.75;
}

export function paragraphSpacingEm(spacing?: Partial<ReaderSpacing>): string {
  const p = spacing?.paragraph ?? DEFAULT_READER_SPACING.paragraph;
  return `${p * 0.8}em`;
}

export function letterSpacingEm(spacing?: Partial<ReaderSpacing>): string {
  const l = spacing?.letter ?? DEFAULT_READER_SPACING.letter;
  return `${l * 0.05}em`;
}
