import { createMemo, type Accessor } from 'solid-js';
import type { JSX } from 'solid-js';
import type { ViewerChromeLayout } from '@/components/viewer/viewer-chrome';
import { settingsState } from '@/stores/settings';
import {
  mergeTextViewerSurfaceAppearanceStyle,
  resolveTextViewerSurfaceAppearance,
  type TextViewerSurfaceKind,
} from '@/lib/theme/text-viewer-surface-appearance';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import type { TextViewerThemeId } from '@/lib/theme/types';
import {
  applyVisualEffectsToChromeAppearance,
  isVisualBlurEnabled,
  isVisualTransparencyEnabled,
  resolveVisualBoxShadow,
} from '@/lib/ui/visual-effects-settings';

function clampTextViewerThemeId(themeId: number): TextViewerThemeId {
  const n = Math.floor(Number(themeId));
  if (Number.isFinite(n) && n >= 0 && n <= 8) return n as TextViewerThemeId;
  return 0;
}

export const DEFAULT_VIEWER_CHROME_OVERLAY_OPACITY = 100;
export const DEFAULT_VIEWER_CHROME_OVERLAY_BLUR_PX = 0;

export const VIEWER_CHROME_OVERLAY_OPACITY_MIN = 0;
export const VIEWER_CHROME_OVERLAY_OPACITY_MAX = 100;
export const VIEWER_CHROME_OVERLAY_BLUR_MIN = 0;
export const VIEWER_CHROME_OVERLAY_BLUR_MAX = 24;

export type ViewerChromeCssStyle = JSX.CSSProperties;

const DEFAULT_SURFACE_BG = 'hsl(var(--background))';

export function normalizeViewerChromeOverlayOpacity(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VIEWER_CHROME_OVERLAY_OPACITY;
  return Math.min(
    VIEWER_CHROME_OVERLAY_OPACITY_MAX,
    Math.max(VIEWER_CHROME_OVERLAY_OPACITY_MIN, Math.round(n)),
  );
}

export function normalizeViewerChromeOverlayBlurPx(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VIEWER_CHROME_OVERLAY_BLUR_PX;
  return Math.min(
    VIEWER_CHROME_OVERLAY_BLUR_MAX,
    Math.max(VIEWER_CHROME_OVERLAY_BLUR_MIN, Math.round(n)),
  );
}

export function viewerChromeOverlayAppearanceApplies(layout: ViewerChromeLayout): boolean {
  return layout === 'stacked' || layout === 'floating';
}

export function readViewerChromeOverlayAppearance() {
  const raw = {
    opacity: normalizeViewerChromeOverlayOpacity(settingsState.app.viewerChromeOverlayOpacity),
    blurPx: normalizeViewerChromeOverlayBlurPx(settingsState.app.viewerChromeOverlayBlurPx),
  };
  return applyVisualEffectsToChromeAppearance(raw);
}

function readBackgroundColor(base: ViewerChromeCssStyle | undefined): string | undefined {
  const raw = base?.['background-color'];
  return typeof raw === 'string' && raw ? raw : undefined;
}

/** 悬浮顶/底栏外层轨道：只传播文字/边框色，不绘制背景，正文才可透出 */
export function viewerChromeFloatingScopeStyle(
  surface: ViewerChromeCssStyle | undefined,
): ViewerChromeCssStyle | undefined {
  if (!surface) return undefined;
  const out: ViewerChromeCssStyle = {};
  if (surface.color != null) out.color = surface.color;
  const border = surface['border-color'];
  if (border != null) out['border-color'] = border;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function mergeViewerChromeSurfaceStyles(
  ...styles: Array<ViewerChromeCssStyle | undefined | null | false>
): ViewerChromeCssStyle {
  const out: ViewerChromeCssStyle = {};
  for (const style of styles) {
    if (!style) continue;
    Object.assign(out, style);
  }
  return out;
}

/** 悬浮胶囊：叠加 surface 透明度/模糊 + 边框光晕 */
export function mergeViewerChromeFloatingCapsuleStyle(
  base: ViewerChromeCssStyle | undefined,
  options?: {
    themeId?: number;
    followPage?: boolean;
    surfaceKind?: TextViewerSurfaceKind;
    config?: Pick<TextViewerUiConfig, 'themeSurfaceAppearance'>;
    boxShadow?: string;
  },
): ViewerChromeCssStyle {
  let style = base;
  if (options?.followPage && base) {
    const id = clampTextViewerThemeId(options.themeId ?? 0);
    const kind = options.surfaceKind ?? 'chrome';
    const appearance = resolveTextViewerSurfaceAppearance(id, kind, { config: options.config });
    style = mergeTextViewerSurfaceAppearanceStyle(base, appearance);
  }
  if (options?.boxShadow != null) {
    style = mergeViewerChromeSurfaceStyles(style, {
      'box-shadow': resolveVisualBoxShadow(options.boxShadow) ?? 'none',
    });
  }
  return style ?? {};
}

/** 层叠/悬浮 surface 背景（默认不透明实色；仅当设置非默认时半透明/模糊） */
export function resolveViewerChromeOverlayAppearanceStyle(
  baseBackgroundColor?: string,
  opacityPercent = readViewerChromeOverlayAppearance().opacity,
  blurPx = readViewerChromeOverlayAppearance().blurPx,
): ViewerChromeCssStyle {
  const base = baseBackgroundColor ?? DEFAULT_SURFACE_BG;
  const style: ViewerChromeCssStyle = {};

  const effectiveOpacity = isVisualTransparencyEnabled() ? opacityPercent : 100;
  const effectiveBlur = isVisualBlurEnabled() ? blurPx : 0;

  if (effectiveOpacity >= 100) {
    style['background-color'] = base;
  } else {
    style['background-color'] = `color-mix(in srgb, ${base} ${effectiveOpacity}%, transparent)`;
  }

  if (effectiveBlur > 0) {
    style['backdrop-filter'] = `blur(${effectiveBlur}px)`;
    style['-webkit-backdrop-filter'] = `blur(${effectiveBlur}px)`;
  }

  return style;
}

/** 主题跟随顶底栏：在 inline style 上叠加透明度/模糊（仅层叠/悬浮） */
export function mergeViewerChromeThemedSurfaceStyle(
  base: ViewerChromeCssStyle | undefined,
  layout: ViewerChromeLayout,
  opacityPercent = readViewerChromeOverlayAppearance().opacity,
  blurPx = readViewerChromeOverlayAppearance().blurPx,
): ViewerChromeCssStyle | undefined {
  if (!viewerChromeOverlayAppearanceApplies(layout)) {
    return base;
  }
  const bg = readBackgroundColor(base);
  const overlay = resolveViewerChromeOverlayAppearanceStyle(bg, opacityPercent, blurPx);
  return mergeViewerChromeSurfaceStyles(base, overlay);
}

export function useViewerChromeOverlaySurfaceStyle(
  layout: Accessor<ViewerChromeLayout>,
  baseBackgroundColor?: Accessor<string | undefined>,
): Accessor<ViewerChromeCssStyle> {
  return createMemo(() => {
    if (!viewerChromeOverlayAppearanceApplies(layout())) {
      return {};
    }
    return resolveViewerChromeOverlayAppearanceStyle(baseBackgroundColor?.());
  });
}
