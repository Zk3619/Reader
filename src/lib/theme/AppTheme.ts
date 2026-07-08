/**
 * 主程序壳层主题：语义色板、布局 token、运行时应用
 */

import type { AppThemeDefinition, LayoutTokens, SemanticColorTokens } from '@/lib/theme/types';
import { APP_CSS_VARS } from '@/lib/theme/tokens';
import { applyCssVarMap } from '@/lib/theme/apply-css-vars';
import { appThemeToCssVarMap, createCustomAppTheme } from '@/lib/theme/merge-theme';
import type { BrightnessChromeTokens } from '@/lib/theme/types';

const LIGHT_SEMANTIC: SemanticColorTokens = {
  background: '0 0% 100%',
  foreground: '240 10% 3.9%',
  muted: '240 4.8% 95.9%',
  mutedForeground: '240 3.8% 46.1%',
  popover: '0 0% 100%',
  popoverForeground: '240 10% 3.9%',
  border: '240 5.9% 90%',
  input: '240 5.9% 90%',
  card: '0 0% 100%',
  cardForeground: '240 10% 3.9%',
  primary: '240 5.9% 10%',
  primaryForeground: '0 0% 98%',
  secondary: '240 4.8% 95.9%',
  secondaryForeground: '240 5.9% 10%',
  accent: '240 4.8% 95.9%',
  accentForeground: '240 5.9% 10%',
  destructive: '0 84.2% 60.2%',
  destructiveForeground: '0 0% 98%',
  info: '204 94% 94%',
  infoForeground: '199 89% 48%',
  success: '149 80% 90%',
  successForeground: '160 84% 39%',
  warning: '48 96% 89%',
  warningForeground: '25 95% 53%',
  error: '0 93% 94%',
  errorForeground: '0 84% 60%',
  ring: '240 5.9% 10%',
  sidebar: '0 0% 98%',
  sidebarForeground: '240 5.3% 26.1%',
  sidebarAccent: '240 4.8% 95.9%',
  sidebarAccentForeground: '240 5.9% 10%',
  sidebarBorder: '240 5.9% 90%',
  sidebarRing: '240 5.9% 10%',
};

const DARK_SEMANTIC: SemanticColorTokens = {
  background: '240 10% 3.9%',
  foreground: '0 0% 98%',
  muted: '240 3.7% 15.9%',
  mutedForeground: '240 5% 64.9%',
  popover: '240 10% 3.9%',
  popoverForeground: '0 0% 98%',
  border: '240 3.7% 15.9%',
  input: '240 3.7% 15.9%',
  card: '240 10% 3.9%',
  cardForeground: '0 0% 98%',
  primary: '0 0% 98%',
  primaryForeground: '240 5.9% 10%',
  secondary: '240 3.7% 15.9%',
  secondaryForeground: '0 0% 98%',
  accent: '240 3.7% 15.9%',
  accentForeground: '0 0% 98%',
  destructive: '0 62.8% 30.6%',
  destructiveForeground: '0 0% 98%',
  info: '204 94% 94%',
  infoForeground: '199 89% 48%',
  success: '149 80% 90%',
  successForeground: '160 84% 39%',
  warning: '48 96% 89%',
  warningForeground: '25 95% 53%',
  error: '0 93% 94%',
  errorForeground: '0 84% 60%',
  ring: '240 4.9% 83.9%',
  sidebar: '240 5.9% 10%',
  sidebarForeground: '240 4.8% 95.9%',
  sidebarAccent: '240 3.7% 15.9%',
  sidebarAccentForeground: '240 4.8% 95.9%',
  sidebarBorder: '240 3.7% 15.9%',
  sidebarRing: '240 4.9% 83.9%',
};

const DEFAULT_LAYOUT: LayoutTokens = {
  radius: '0.5rem',
  appBarHeight: '3.5rem',
  readerTopBarHeight: '3.5rem',
  readerBottomBarHeight: '4rem',
  readerFooterMaxHeight: '20rem',
  readerScrollbarSize: '16px',
  readerBarDuration: '0.4s',
  readerBarEasingEnter: 'cubic-bezier(0.22, 1, 0.36, 1)',
  readerBarEasingExit: 'cubic-bezier(0.64, 0, 0.78, 0)',
  readerBrightnessChromeGap: '10px',
  mobileSafeTop: '12px',
  mobileSafeBottomGesture: '12px',
  mobileSafeBottomButtons: '48px',
  searchLoopDuration: '2600ms',
  searchLoopMinWidth: '10%',
};

/** 内置默认应用主题 */
export const DEFAULT_APP_THEME: AppThemeDefinition = {
  id: 'default',
  name: '默认',
  light: LIGHT_SEMANTIC,
  dark: DARK_SEMANTIC,
  layout: DEFAULT_LAYOUT,
};

export { LIGHT_SEMANTIC as APP_THEME_LIGHT_TOKENS, DARK_SEMANTIC as APP_THEME_DARK_TOKENS };
export { DEFAULT_LAYOUT as APP_THEME_LAYOUT_TOKENS };

/** 将应用主题 CSS 变量写入元素（通常 :root 或预览容器） */
export function applyAppThemeDefinition(
  el: HTMLElement,
  definition: AppThemeDefinition,
  mode: 'light' | 'dark',
): void {
  applyCssVarMap(el, appThemeToCssVarMap(definition, mode));
}

/** 亮度胶囊使用应用语义色（顶底栏未跟随页面时） */
export function appShellThemeBrightnessChrome(): BrightnessChromeTokens {
  return {
    capsuleBg: `hsl(var(${APP_CSS_VARS.background}))`,
    foreground: `hsl(var(${APP_CSS_VARS.foreground}))`,
    buttonHoverBg: `hsl(var(${APP_CSS_VARS.foreground}) / 0.08)`,
    sliderTrack: `hsl(var(${APP_CSS_VARS.foreground}) / 0.22)`,
    sliderFill: `hsl(var(${APP_CSS_VARS.primary}))`,
    sliderThumb: `hsl(var(${APP_CSS_VARS.foreground}))`,
    capsuleGlow: `0 0 0 1px hsl(var(${APP_CSS_VARS.border}) / 0.42), 0 0 16px hsl(var(${APP_CSS_VARS.primary}) / 0.38), 0 0 6px hsl(var(${APP_CSS_VARS.foreground}) / 0.12)`,
  };
}

export { createCustomAppTheme };
