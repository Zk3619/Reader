/**
 * 主题包运行时：将 ReaderThemePackV1 应用到 DOM 子树或 document
 */

import { applyAppThemeDefinition, DEFAULT_APP_THEME } from '@/lib/theme/AppTheme';
import { cssVarMapToStyle } from '@/lib/theme/apply-css-vars';
import { applyCssVarMap } from '@/lib/theme/apply-css-vars';
import { mediaViewerChromeCssVars } from '@/lib/theme/MediaViewerTheme';
import { getEffectiveDark } from '@/lib/theme/runtime';
import type {
  ComponentStyleOverride,
  CustomCssBlock,
  ReaderThemePackV1,
  ThemeApplyScope,
  ThemeComponentId,
  ThemeScopeId,
} from '@/lib/theme/schema/theme-pack-v1';
import { componentSurfaceAppearanceToStyle } from '@/lib/theme/component-surface-appearance';
import { TEXT_VIEWER_THEME_SURFACE_APPEARANCE_BY_ID } from '@/lib/theme/text-viewer-surface-appearance';
import { textViewerCssVars } from '@/lib/theme/TextViewerTheme';
import type { TextViewerThemeId } from '@/lib/theme/types';

const SCOPED_STYLE_ATTR = 'data-theme-pack-style';

let activeSurfacePresetThemeId: TextViewerThemeId | null = null;

export function clearThemePackSurfacePreset(): void {
  if (activeSurfacePresetThemeId != null) {
    delete TEXT_VIEWER_THEME_SURFACE_APPEARANCE_BY_ID[activeSurfacePresetThemeId];
    activeSurfacePresetThemeId = null;
  }
}

function applyTextViewerSection(pack: ReaderThemePackV1): void {
  const text = pack.viewer?.text;
  if (!text) return;

  if (text.surfaceAppearance && text.paletteId != null && text.paletteId !== 'custom') {
    const themeId = text.paletteId as TextViewerThemeId;
    TEXT_VIEWER_THEME_SURFACE_APPEARANCE_BY_ID[themeId] = {
      content: text.surfaceAppearance.content,
      chrome: text.surfaceAppearance.chrome,
      pageTip: text.surfaceAppearance.pageTip,
      brightness: text.surfaceAppearance.brightness,
    };
    activeSurfacePresetThemeId = themeId;
  }
}

function splitKeyframesFromCss(css: string): { keyframes: string; declarations: string } {
  const keyframesParts: string[] = [];
  const declarations = css
    .replace(/@keyframes[\s\S]*?\}/g, (match) => {
      keyframesParts.push(match.trim());
      return '';
    })
    .trim();
  return { keyframes: keyframesParts.join('\n'), declarations };
}

function wrapCustomCssBlock(packSel: string, block: CustomCssBlock, css: string): string {
  const { keyframes, declarations } = splitKeyframesFromCss(css);
  const wrapped =
    declarations.length === 0
      ? ''
      : block.componentId
        ? `${packSel} [data-theme-component="${block.componentId}"] { ${declarations} }`
        : `${packSel}[data-theme-scope="${block.scope}"] { ${declarations} }`;
  return [keyframes, wrapped].filter(Boolean).join('\n');
}

function buildScopedCss(pack: ReaderThemePackV1): string {
  const blocks = pack.advanced?.customCss ?? [];
  if (blocks.length === 0) return '';
  const packSel = `[data-theme-pack-id="${pack.id}"]`;
  return blocks
    .map((block) => {
      const css = block.css.trim();
      if (!css) return '';

      if (block.raw) {
        return css;
      }

      return wrapCustomCssBlock(packSel, block, css);
    })
    .filter(Boolean)
    .join('\n');
}

/** @internal exported for tests */
export function buildThemePackScopedCss(pack: ReaderThemePackV1): string {
  return buildScopedCss(pack);
}

function injectScopedStyle(el: HTMLElement, css: string, id: string): void {
  const attr = `${SCOPED_STYLE_ATTR}-${id}`;
  let styleEl = el.querySelector<HTMLStyleElement>(`style[${SCOPED_STYLE_ATTR}="${attr}"]`);
  if (!css) {
    styleEl?.remove();
    return;
  }
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.setAttribute(SCOPED_STYLE_ATTR, attr);
    el.appendChild(styleEl);
  }
  styleEl.textContent = css;
}

export function applyAppSectionToElement(
  el: HTMLElement,
  pack: ReaderThemePackV1,
  mode?: 'light' | 'dark',
): void {
  const app = pack.app;
  if (!app?.tokens) return;
  const resolvedMode = mode ?? (getEffectiveDark() ? 'dark' : 'light');
  applyAppThemeDefinition(el, app.tokens, resolvedMode);

  if (app.typography?.fontFamily) {
    el.style.setProperty('--font-sans', app.typography.fontFamily);
  }
  if (app.motion?.durationNormal) {
    el.style.setProperty('--theme-duration-normal', app.motion.durationNormal);
  }
}

export function applyViewerSharedToElement(el: HTMLElement, pack: ReaderThemePackV1): void {
  const shared = pack.viewer?.shared;
  if (!shared) return;
  applyCssVarMap(el, mediaViewerChromeCssVars(shared));
}

export function applyTextViewerSectionToElement(el: HTMLElement, pack: ReaderThemePackV1): void {
  const text = pack.viewer?.text;
  if (!text) return;
  const paletteId =
    text.paletteId === 'custom' || text.paletteId == null ? 0 : (text.paletteId as TextViewerThemeId);
  applyCssVarMap(el, textViewerCssVars(paletteId));
  if (text.customPalette) {
    applyCssVarMap(el, {
      '--reader-bg': text.customPalette.bg,
      '--reader-text': text.customPalette.text,
      '--reader-accent': text.customPalette.accent,
      '--reader-border': text.customPalette.border,
    });
  }
}

export function componentOverrideToStyle(
  override: ComponentStyleOverride | undefined,
  options?: { componentId?: ThemeComponentId },
): Record<string, string> {
  if (!override) return {};
  const style: Record<string, string> = { ...cssVarMapToStyle(override.cssVars ?? {}) };
  if (override.layout?.padding) style.padding = override.layout.padding;
  if (override.layout?.margin) style.margin = override.layout.margin;
  if (override.layout?.gap) style.gap = override.layout.gap;
  if (override.layout?.radius) style['border-radius'] = override.layout.radius;
  if (override.layout?.border) style.border = override.layout.border;
  if (override.layout?.shadow) style['box-shadow'] = override.layout.shadow;
  if (override.typography?.fontSize) style['font-size'] = override.typography.fontSize;
  if (override.typography?.fontWeight != null) style['font-weight'] = String(override.typography.fontWeight);
  if (override.typography?.lineHeight != null) style['line-height'] = String(override.typography.lineHeight);
  if (override.typography?.letterSpacing) style['letter-spacing'] = override.typography.letterSpacing;
  if (override.typography?.fontFamily) style['font-family'] = override.typography.fontFamily;
  if (options?.componentId) {
    Object.assign(style, componentSurfaceAppearanceToStyle(options.componentId, override));
  }
  return style;
}

export interface ApplyThemePackOptions {
  scope?: ThemeApplyScope;
  preview?: boolean;
  colorMode?: 'light' | 'dark';
}

export function applyThemePackToElement(
  el: HTMLElement,
  pack: ReaderThemePackV1,
  options: ApplyThemePackOptions = {},
): void {
  const scope = options.scope ?? 'all';
  el.setAttribute('data-theme-pack-id', pack.id);

  if ((scope === 'all' || scope === 'app') && pack.scopes.app && pack.app) {
    applyAppSectionToElement(el, pack, options.colorMode);
    el.setAttribute('data-theme-scope', 'app');
  }

  if ((scope === 'all' || scope === 'viewer') && pack.scopes.viewer && pack.viewer) {
    applyViewerSharedToElement(el, pack);
    applyTextViewerSectionToElement(el, pack);
    el.setAttribute('data-theme-scope-viewer', 'viewer');
    if (!options.preview) {
      applyTextViewerSection(pack);
    }
  }

  injectScopedStyle(el, buildScopedCss(pack), pack.id);
}

/** 主题工作室预览：先写入内置基线再应用 draft，并标记 preview-mode 以隔离 html.dark */
export function applyPreviewThemePackToElement(
  el: HTMLElement,
  pack: ReaderThemePackV1,
  options: ApplyThemePackOptions = {},
): void {
  const mode = options.colorMode ?? 'light';
  el.setAttribute('data-theme-preview-mode', mode);
  if ((options.scope ?? 'all') !== 'viewer' && pack.scopes?.app !== false) {
    applyAppThemeDefinition(el, DEFAULT_APP_THEME, mode);
  }
  applyThemePackToElement(el, pack, { ...options, preview: true, colorMode: mode });
}

let activeDocumentPackId: string | null = null;

export function applyActiveThemePackToDocument(
  pack: ReaderThemePackV1 | null,
  options: ApplyThemePackOptions = {},
): void {
  if (typeof document === 'undefined') return;

  if (!pack) {
    clearThemePackSurfacePreset();
    activeDocumentPackId = null;
    document.documentElement.removeAttribute('data-theme-pack-id');
    return;
  }

  if (pack.scopes.app && pack.app) {
    applyAppSectionToElement(document.documentElement, pack, options.colorMode);
    document.documentElement.setAttribute('data-theme-pack-id', pack.id);
    activeDocumentPackId = pack.id;
  }

  if (pack.scopes.viewer && pack.viewer && !options.preview) {
    applyTextViewerSection(pack);
  }

  injectScopedStyle(document.documentElement, buildScopedCss(pack), `doc-${pack.id}`);
}

export function getActiveDocumentThemePackId(): string | null {
  return activeDocumentPackId;
}

export function themeScopeDataAttr(scope: ThemeScopeId): Record<string, string> {
  return { 'data-theme-scope': scope };
}
