/**
 * TextViewerTheme — 阅读器正文主题（商业级分层）
 *
 * 1. **主题层 (0–8)**：`TEXT_VIEWER_THEME_PALETTES` + 按 ID 的 Tailwind 字面量类 + `[data-text-viewer-theme]` CSS 变量
 * 2. **Surface 外观层**：`themeSurfaceAppearance` 用户覆盖 + `TEXT_VIEWER_THEME_SURFACE_APPEARANCE_BY_ID` 主题预设 + 应用全局 chrome overlay
 * 3. **自定义背景**：已移除，待商业级主题设置统一接入
 *
 * 渲染约定：scope 节点挂 `data-text-viewer-theme` + `textViewerThemeStyle()`；子节点用 `readerThemeClasses(id).bg/.text`
 */

import { applyCssVarMap, cssVarMapToStyle } from '@/lib/theme/apply-css-vars';
import { TEXT_VIEWER_CSS_VARS } from '@/lib/theme/tokens';
import type { TextViewerThemeId } from '@/lib/theme/types';
import type { TextViewerPageTipsConfig, TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import {
  applyTextViewerSurfaceAppearanceToBackgroundColor,
  mergeTextViewerSurfaceAppearanceStyle,
  resolveTextViewerSurfaceAppearance,
  type TextViewerSurfaceKind,
} from '@/lib/theme/text-viewer-surface-appearance';
import { resolveVisualBoxShadow } from '@/lib/ui/visual-effects-settings';

export type { TextViewerSurfaceKind, TextViewerSurfaceAppearance } from '@/lib/theme/text-viewer-surface-appearance';
export {
  TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT,
  TEXT_VIEWER_THEME_SURFACE_APPEARANCE_BY_ID,
  resolveTextViewerSurfaceAppearance,
  mergeTextViewerSurfaceAppearanceStyle,
  applyTextViewerSurfaceAppearanceToBackgroundColor,
} from '@/lib/theme/text-viewer-surface-appearance';

export type { TextViewerThemeId } from '@/lib/theme/types';

/** 阅读主题色板（正文区） */
export interface TextViewerThemePalette {
  bg: string;
  text: string;
  border: string;
  accent: string;
  link: string;
  quoteBorder: string;
  quoteBg: string;
  codeBg: string;
  selectionBg: string;
}

/** @deprecated 使用 TextViewerThemeId */
export type ReaderThemeId = TextViewerThemeId;

/** 阅读主题 ID 0–8 */
export const TEXT_VIEWER_THEME_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

/** 夜间阅读主题 ID（Legado 夜间背景槽位 bgTypeNight/bgStrNight） */
export const READER_NIGHT_THEME_ID = 6 as const satisfies TextViewerThemeId;

export function isReaderNightTheme(themeId: number): boolean {
  return normalizeTextViewerThemeId(themeId) === READER_NIGHT_THEME_ID;
}

export function normalizeTextViewerThemeId(themeId: number): TextViewerThemeId {
  const n = Math.floor(Number(themeId));
  if (Number.isFinite(n) && n >= 0 && n <= 8) return n as TextViewerThemeId;
  return 0;
}

/** @deprecated 使用 normalizeTextViewerThemeId */
export function normalizeReaderThemeId(themeId: number): TextViewerThemeId {
  return normalizeTextViewerThemeId(themeId);
}

/** 9 套阅读主题色板（Legado 融合） */
export const TEXT_VIEWER_THEME_PALETTES: Record<TextViewerThemeId, TextViewerThemePalette> = {
  0: {
    bg: '#f5f0e6',
    text: '#5b4636',
    border: '#9c8b7a',
    accent: '#8b6914',
    link: '#6b5344',
    quoteBorder: '#9c8b7a',
    quoteBg: 'rgba(155, 139, 122, 0.12)',
    codeBg: 'rgba(91, 70, 54, 0.08)',
    selectionBg: 'rgba(139, 105, 20, 0.25)',
  },
  1: {
    bg: '#d5e9d1',
    text: '#596C44',
    border: '#43a047',
    accent: '#2e7d32',
    link: '#388e3c',
    quoteBorder: '#43a047',
    quoteBg: 'rgba(67, 160, 71, 0.12)',
    codeBg: 'rgba(89, 108, 68, 0.08)',
    selectionBg: 'rgba(46, 125, 50, 0.25)',
  },
  2: {
    bg: '#DDC090',
    text: '#3E3422',
    border: '#a08060',
    accent: '#8b6914',
    link: '#6b5344',
    quoteBorder: '#a08060',
    quoteBg: 'rgba(160, 128, 96, 0.15)',
    codeBg: 'rgba(62, 52, 34, 0.08)',
    selectionBg: 'rgba(139, 105, 20, 0.25)',
  },
  3: {
    bg: '#c4dff1',
    text: '#3D4C54',
    border: '#6d9eb8',
    accent: '#1976d2',
    link: '#1565c0',
    quoteBorder: '#6d9eb8',
    quoteBg: 'rgba(109, 158, 184, 0.15)',
    codeBg: 'rgba(61, 76, 84, 0.08)',
    selectionBg: 'rgba(25, 118, 210, 0.25)',
  },
  4: {
    bg: '#e7cef0',
    text: '#68516C',
    border: '#a888b0',
    accent: '#7b1fa2',
    link: '#6a1b9a',
    quoteBorder: '#a888b0',
    quoteBg: 'rgba(168, 136, 176, 0.15)',
    codeBg: 'rgba(104, 81, 108, 0.08)',
    selectionBg: 'rgba(123, 31, 162, 0.25)',
  },
  5: {
    bg: '#263238',
    text: '#b0bec5',
    border: '#546e7a',
    accent: '#4fc3f7',
    link: '#29b6f6',
    quoteBorder: '#546e7a',
    quoteBg: 'rgba(84, 110, 122, 0.35)',
    codeBg: 'rgba(176, 190, 197, 0.08)',
    selectionBg: 'rgba(79, 195, 247, 0.35)',
  },
  6: {
    bg: '#000000',
    text: '#ADADAD',
    border: '#444444',
    accent: '#90caf9',
    link: '#64b5f6',
    quoteBorder: '#444444',
    quoteBg: 'rgba(68, 68, 68, 0.5)',
    codeBg: 'rgba(173, 173, 173, 0.08)',
    selectionBg: 'rgba(144, 202, 249, 0.35)',
  },
  7: {
    bg: '#FFFFFF',
    text: '#000000',
    border: '#d0d0d0',
    accent: '#1976d2',
    link: '#1565c0',
    quoteBorder: '#d0d0d0',
    quoteBg: 'rgba(0, 0, 0, 0.04)',
    codeBg: 'rgba(0, 0, 0, 0.06)',
    selectionBg: 'rgba(25, 118, 210, 0.25)',
  },
  8: {
    bg: '#c0edc6',
    text: '#0b0b0b',
    border: '#7ab889',
    accent: '#2e7d32',
    link: '#388e3c',
    quoteBorder: '#7ab889',
    quoteBg: 'rgba(122, 184, 137, 0.2)',
    codeBg: 'rgba(11, 11, 11, 0.06)',
    selectionBg: 'rgba(46, 125, 50, 0.25)',
  },
};

/**
 * 按主题 ID 的 Tailwind 字面量类（构建时扫描 + CSS @source inline 双保险）
 * 与改动前 reader-theme-classes 行为一致，避免通用 CSS 变量链断裂导致 fallback 粉色
 */
export const TEXT_VIEWER_TW_THEME_CLASSES: Record<
  TextViewerThemeId,
  { bg: string; text: string; borderTop: string }
> = {
  0: { bg: 'bg-[#f5f0e6]', text: 'text-[#5b4636]', borderTop: 'border-t-[#9c8b7a]' },
  1: { bg: 'bg-[#d5e9d1]', text: 'text-[#596C44]', borderTop: 'border-t-[#43a047]' },
  2: { bg: 'bg-[#DDC090]', text: 'text-[#3E3422]', borderTop: 'border-t-[#a08060]' },
  3: { bg: 'bg-[#c4dff1]', text: 'text-[#3D4C54]', borderTop: 'border-t-[#6d9eb8]' },
  4: { bg: 'bg-[#e7cef0]', text: 'text-[#68516C]', borderTop: 'border-t-[#a888b0]' },
  5: { bg: 'bg-[#263238]', text: 'text-[#b0bec5]', borderTop: 'border-t-[#546e7a]' },
  6: { bg: 'bg-[#000000]', text: 'text-[#ADADAD]', borderTop: 'border-t-[#444444]' },
  7: { bg: 'bg-[#FFFFFF]', text: 'text-[#000000]', borderTop: 'border-t-[#d0d0d0]' },
  8: { bg: 'bg-[#c0edc6]', text: 'text-[#0b0b0b]', borderTop: 'border-t-[#7ab889]' },
};

/** @deprecated 使用 TEXT_VIEWER_THEME_IDS */
export const READER_THEME_IDS = TEXT_VIEWER_THEME_IDS;

/** 阅读器亮度胶囊 / 竖向滑条配色（随阅读主题） */
export interface ReaderBrightnessChrome {
  capsuleBg: string;
  foreground: string;
  buttonHoverBg: string;
  sliderTrack: string;
  sliderFill: string;
  sliderThumb: string;
  capsuleGlow: string;
}

/** 完整阅读主题色板（含 UI 名称与亮度 chrome） */
export interface ReaderThemePalette extends TextViewerThemePalette {
  name: string;
  brightnessChrome: ReaderBrightnessChrome;
}

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

const READER_THEME_NAMES: Record<TextViewerThemeId, string> = {
  0: '默认',
  1: '护眼绿',
  2: '羊皮纸',
  3: '淡蓝',
  4: '淡紫',
  5: '深色',
  6: '夜间',
  7: '日间',
  8: '微信读书',
};

function withReaderThemeMeta(id: TextViewerThemeId): ReaderThemePalette {
  const core = TEXT_VIEWER_THEME_PALETTES[id];
  return {
    ...core,
    name: READER_THEME_NAMES[id],
    brightnessChrome: deriveReaderBrightnessChrome(core.bg, core.text, core.border),
  };
}

/** 含名称与亮度 chrome 的完整色板（设置面板、亮度控件） */
export const READER_THEME_PALETTES: Record<TextViewerThemeId, ReaderThemePalette> = {
  0: withReaderThemeMeta(0),
  1: withReaderThemeMeta(1),
  2: withReaderThemeMeta(2),
  3: withReaderThemeMeta(3),
  4: withReaderThemeMeta(4),
  5: withReaderThemeMeta(5),
  6: withReaderThemeMeta(6),
  7: withReaderThemeMeta(7),
  8: withReaderThemeMeta(8),
};

export const READER_THEME_LABELS: Record<TextViewerThemeId, string> = {
  0: READER_THEME_NAMES[0],
  1: READER_THEME_NAMES[1],
  2: READER_THEME_NAMES[2],
  3: READER_THEME_NAMES[3],
  4: READER_THEME_NAMES[4],
  5: READER_THEME_NAMES[5],
  6: READER_THEME_NAMES[6],
  7: READER_THEME_NAMES[7],
  8: READER_THEME_NAMES[8],
};

export const READER_THEME_DEFAULT_BG = READER_THEME_PALETTES[0].bg;

/** @deprecated 使用 TEXT_VIEWER_TW_THEME_CLASSES */
export const READER_THEME_CLASSES = TEXT_VIEWER_TW_THEME_CLASSES;

export function readerThemePalette(themeId: number): ReaderThemePalette {
  return READER_THEME_PALETTES[normalizeTextViewerThemeId(themeId)];
}

export function readerThemeBackground(themeId: number): string {
  return readerThemePalette(themeId).bg;
}

export function readerThemeBrightnessChrome(themeId: number): ReaderBrightnessChrome {
  return readerThemePalette(themeId).brightnessChrome;
}

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

export function readerThemeClasses(themeId: number) {
  return TEXT_VIEWER_TW_THEME_CLASSES[normalizeTextViewerThemeId(themeId)];
}

export function readerThemeBarClasses(themeId: number) {
  const c = readerThemeClasses(themeId);
  return `${c.bg} ${c.text} ${c.borderTop}`;
}

export const TEXT_VIEWER_THEME_SCOPE_ATTR = 'data-text-viewer-theme';

export function textViewerThemeScopeAttrs(themeId: number): Record<string, string> {
  return { [TEXT_VIEWER_THEME_SCOPE_ATTR]: String(normalizeTextViewerThemeId(themeId)) };
}

function paletteToCssVars(palette: TextViewerThemePalette): Record<string, string> {
  const p = palette;
  return {
    [TEXT_VIEWER_CSS_VARS.contentBg]: p.bg,
    [TEXT_VIEWER_CSS_VARS.contentText]: p.text,
    [TEXT_VIEWER_CSS_VARS.contentBorder]: p.border,
    [TEXT_VIEWER_CSS_VARS.contentAccent]: p.accent,
    [TEXT_VIEWER_CSS_VARS.contentLink]: p.link,
    [TEXT_VIEWER_CSS_VARS.contentQuoteBorder]: p.quoteBorder,
    [TEXT_VIEWER_CSS_VARS.contentQuoteBg]: p.quoteBg,
    [TEXT_VIEWER_CSS_VARS.contentCodeBg]: p.codeBg,
    [TEXT_VIEWER_CSS_VARS.contentSelectionBg]: p.selectionBg,
    [TEXT_VIEWER_CSS_VARS.selection]: p.selectionBg,
  };
}

export function textViewerCssVars(themeId: number): Record<string, string> {
  return paletteToCssVars(readerThemePalette(themeId));
}

type TextViewerAppearanceConfig = Pick<TextViewerUiConfig, 'themeSurfaceAppearance'>;

/** 主题 scope 内联样式：palette 背景/前景 + CSS 变量（供子元素 quote/link 等） */
export function textViewerThemeStyle(
  themeId: number,
  config?: TextViewerAppearanceConfig,
): Record<string, string> {
  const id = normalizeTextViewerThemeId(themeId);
  const palette = readerThemePalette(id);
  const vars = paletteToCssVars(palette);
  const base = {
    ...cssVarMapToStyle(vars),
    'background-color': palette.bg,
    color: palette.text,
  };
  const appearance = resolveTextViewerSurfaceAppearance(id, 'content', { config });
  return mergeTextViewerSurfaceAppearanceStyle(base, appearance);
}

/** slot/chrome 表面绘制：始终用主题 palette，不读 Legado bgStr */
export function textViewerSurfacePaintStyle(
  themeId: number,
  config?: TextViewerAppearanceConfig,
): Record<string, string> {
  return textViewerThemeStyle(themeId, config);
}

/** 跟随阅读页的 palette 色（不含透明度/模糊） */
export function textViewerChromeFollowPagePaletteStyle(themeId: number): Record<string, string> {
  const palette = readerThemePalette(normalizeTextViewerThemeId(themeId));
  return {
    'background-color': palette.bg,
    color: palette.text,
    'border-color': palette.border,
  };
}

/** 顶/底栏、亮度胶囊等跟随阅读页时的 surface 样式（含透明度/模糊） */
export function textViewerChromeFollowPageSurfaceStyle(
  themeId: number,
  config?: TextViewerAppearanceConfig,
  kind: TextViewerSurfaceKind = 'chrome',
): Record<string, string> {
  const id = normalizeTextViewerThemeId(themeId);
  const base = textViewerChromeFollowPagePaletteStyle(id);
  const appearance = resolveTextViewerSurfaceAppearance(id, kind, { config });
  return mergeTextViewerSurfaceAppearanceStyle(base, appearance);
}

/** 悬浮胶囊外发光（与亮度胶囊 capsuleGlow 一致） */
export function textViewerFloatingCapsuleBoxShadow(
  themeId: number,
  followPage: boolean,
): string | undefined {
  const glow = (followPage ? readerThemeBrightnessChrome(themeId) : appThemeBrightnessChrome())
    .capsuleGlow;
  return resolveVisualBoxShadow(glow);
}

export interface TextViewerPageTipPresentation {
  textColor: string;
  backgroundColor: string | undefined;
  /** 含透明度/模糊的背景 inline style（跟随主题背景时） */
  surfaceBackgroundStyle?: Record<string, string>;
  dividerColor: string | undefined;
  dividerClass: 'border-b' | 'border-t' | undefined;
}

export function pageTipTextFollowsPage(tips: TextViewerPageTipsConfig): boolean {
  return tips.pageTipTextFollowPage ?? tips.tipFollowContentColor ?? true;
}

export function pageTipDividerFollowsPage(tips: TextViewerPageTipsConfig): boolean {
  return tips.pageTipDividerFollowPage ?? true;
}

export function pageTipBackgroundFollowsPage(tips: TextViewerPageTipsConfig): boolean {
  return tips.pageTipBackgroundFollowPage ?? true;
}

/** 页眉/页脚呈现（商业级主题：文本/分割线/背景可独立跟随或自定义） */
export function resolveTextViewerPageTipPresentation(
  tips: TextViewerPageTipsConfig,
  themeId: number,
  position: 'header' | 'footer',
  config?: TextViewerAppearanceConfig,
): TextViewerPageTipPresentation {
  const id = normalizeTextViewerThemeId(themeId);
  const palette = readerThemePalette(id);
  const showLine = position === 'header' ? tips.showHeaderLine : tips.showFooterLine;
  const textFollow = pageTipTextFollowsPage(tips);
  const dividerFollow = pageTipDividerFollowsPage(tips);
  const bgFollow = pageTipBackgroundFollowsPage(tips);
  const customBg = tips.customTipBackgroundColor?.trim();
  const rawBg = bgFollow ? palette.bg : customBg || undefined;
  const pageTipAppearance = resolveTextViewerSurfaceAppearance(id, 'pageTip', { config });
  const surfaceBackgroundStyle =
    rawBg != null
      ? mergeTextViewerSurfaceAppearanceStyle({ 'background-color': rawBg }, pageTipAppearance)
      : undefined;

  return {
    textColor: textFollow ? palette.text : tips.customTipColor?.trim() || palette.text,
    backgroundColor: rawBg
      ? applyTextViewerSurfaceAppearanceToBackgroundColor(rawBg, pageTipAppearance)
      : undefined,
    surfaceBackgroundStyle,
    dividerColor: showLine
      ? dividerFollow
        ? palette.border
        : tips.customTipDividerColor?.trim() || palette.border
      : undefined,
    dividerClass: showLine ? (position === 'header' ? 'border-b' : 'border-t') : undefined,
  };
}

/**
 * 正文排版色：由 slot 统一绘制背景时只设前景与排版变量，避免双层背景
 */
export function textViewerContentTypographyStyle(themeId: number): Record<string, string> {
  const palette = readerThemePalette(themeId);
  const vars = paletteToCssVars(palette);
  return {
    ...cssVarMapToStyle(vars),
    color: palette.text,
  };
}

export function applyTextViewerThemeScope(el: HTMLElement | null, themeId: number): void {
  if (!el) return;
  const id = normalizeTextViewerThemeId(themeId);
  el.setAttribute(TEXT_VIEWER_THEME_SCOPE_ATTR, String(id));
  applyCssVarMap(el, paletteToCssVars(readerThemePalette(id)));
}

/** 滚动模式顶/底栏条：跟随主题 palette */
export function readerChromeSurfaceStyle(themeId: number): Record<string, string> {
  return textViewerThemeStyle(themeId);
}

export function readerChromeFollowPageClass(followPage: boolean): string {
  return followPage ? 'reader-chrome-follow-page' : '';
}

/** 兼容旧名 */
export const TEXT_VIEWER_THEME_CLASS_NAMES = {
  bg: 'text-viewer-theme-bg',
  text: 'text-viewer-theme-text',
  border: 'text-viewer-theme-border',
} as const;

export function textViewerThemeClassNames() {
  return TEXT_VIEWER_THEME_CLASS_NAMES;
}
