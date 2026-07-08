import type {
  AppThemeDefinition,
  LayoutTokens,
  SemanticColorTokens,
  ThemeTokenOverrides,
} from '@/lib/theme/types';
import { SEMANTIC_TO_CSS_VAR } from '@/lib/theme/tokens';

/** 深度合并语义色板 */
export function mergeSemanticTokens(
  base: SemanticColorTokens,
  overrides?: ThemeTokenOverrides,
): SemanticColorTokens {
  if (!overrides) return base;
  const next = { ...base };
  for (const key of Object.keys(SEMANTIC_TO_CSS_VAR) as (keyof SemanticColorTokens)[]) {
    const v = overrides[key];
    if (v != null) next[key] = v as SemanticColorTokens[typeof key];
  }
  return next;
}

const LAYOUT_KEYS: (keyof LayoutTokens)[] = [
  'radius',
  'appBarHeight',
  'readerTopBarHeight',
  'readerBottomBarHeight',
  'readerFooterMaxHeight',
  'readerScrollbarSize',
  'readerBarDuration',
  'readerBarEasingEnter',
  'readerBarEasingExit',
  'readerBrightnessChromeGap',
  'mobileSafeTop',
  'mobileSafeBottomGesture',
  'mobileSafeBottomButtons',
  'searchLoopDuration',
  'searchLoopMinWidth',
];

/** 创建自定义应用主题（基于预设 + 覆盖） */
export function createCustomAppTheme(
  base: AppThemeDefinition,
  overrides: {
    id?: string;
    name?: string;
    light?: ThemeTokenOverrides;
    dark?: ThemeTokenOverrides;
    layout?: Partial<LayoutTokens>;
  },
): AppThemeDefinition {
  return {
    id: overrides.id ?? `${base.id}-custom`,
    name: overrides.name ?? `${base.name}（自定义）`,
    light: mergeSemanticTokens(base.light, overrides.light),
    dark: mergeSemanticTokens(base.dark, overrides.dark),
    layout: { ...base.layout, ...overrides.layout },
  };
}

/** 将 AppThemeDefinition 转为 :root 可用的 CSS 变量映射（仅 HSL 语义色 + layout） */
export function appThemeToCssVarMap(
  definition: AppThemeDefinition,
  mode: 'light' | 'dark',
): Record<string, string> {
  const semantic = mode === 'dark' ? definition.dark : definition.light;
  const out: Record<string, string> = {};
  for (const [key, cssVar] of Object.entries(SEMANTIC_TO_CSS_VAR)) {
    out[cssVar] = semantic[key as keyof SemanticColorTokens];
  }
  if (definition.layout) {
    const layoutVarMap: Partial<Record<keyof LayoutTokens, string>> = {
      radius: '--radius',
      appBarHeight: '--app-bar-height',
      readerTopBarHeight: '--reader-top-bar-height',
      readerBottomBarHeight: '--reader-bottom-bar-height',
      readerFooterMaxHeight: '--reader-footer-max-height',
      readerScrollbarSize: '--reader-scrollbar-size',
      readerBarDuration: '--reader-bar-duration',
      readerBarEasingEnter: '--reader-bar-easing-enter',
      readerBarEasingExit: '--reader-bar-easing-exit',
      readerBrightnessChromeGap: '--reader-brightness-chrome-gap',
      mobileSafeTop: '--mobile-safe-top',
      mobileSafeBottomGesture: '--mobile-safe-bottom-gesture',
      mobileSafeBottomButtons: '--mobile-safe-bottom-buttons',
      searchLoopDuration: '--search-loop-duration',
      searchLoopMinWidth: '--search-loop-min-width',
    };
    for (const key of LAYOUT_KEYS) {
      const v = definition.layout[key];
      const cssVar = layoutVarMap[key];
      if (v != null && cssVar) out[cssVar] = v;
    }
  }
  return out;
}
