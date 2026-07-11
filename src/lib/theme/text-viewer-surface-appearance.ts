/**
 * 阅读主题 surface 透明度 / 模糊（商业级主题配置入口）
 *
 * 解析顺序：用户配置 override → 主题预设 → chrome 类 surface 沿用应用全局 → 默认 100% / 0px
 */

import type { TextViewerThemeId } from '@/lib/theme/types';
import type { TextViewerThemeAppearanceConfig } from '@/lib/media/text/reader-ui-config';
import {
  mergeViewerChromeSurfaceStyles,
  normalizeViewerChromeOverlayBlurPx,
  normalizeViewerChromeOverlayOpacity,
  readViewerChromeOverlayAppearance,
  resolveViewerChromeOverlayAppearanceStyle,
  type ViewerChromeCssStyle,
} from '@/lib/viewer/media-viewer-chrome-overlay-appearance';
import { applyVisualEffectsToChromeAppearance } from '@/lib/ui/visual-effects-settings';

export type TextViewerSurfaceKind = 'content' | 'chrome' | 'pageTip' | 'brightness';

export interface TextViewerSurfaceAppearance {
  opacity: number;
  blurPx: number;
}

export const TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT: TextViewerSurfaceAppearance = {
  opacity: 100,
  blurPx: 0,
};

/** 按主题 ID 的 surface 预设（商业级主题包可写入） */
export const TEXT_VIEWER_THEME_SURFACE_APPEARANCE_BY_ID: Partial<
  Record<TextViewerThemeId, Partial<Record<TextViewerSurfaceKind, Partial<TextViewerSurfaceAppearance>>>>
> = {};

export interface ResolveTextViewerSurfaceAppearanceOptions {
  config?: Pick<{ themeSurfaceAppearance?: TextViewerThemeAppearanceConfig }, 'themeSurfaceAppearance'>;
  /** 书籍级 surface 覆盖（最高优先级） */
  bookOverride?: TextViewerThemeAppearanceConfig;
}

function readPartialAppearance(
  partial: Partial<TextViewerSurfaceAppearance> | undefined,
): Partial<TextViewerSurfaceAppearance> {
  if (!partial) return {};
  const out: Partial<TextViewerSurfaceAppearance> = {};
  if (partial.opacity != null) out.opacity = partial.opacity;
  if (partial.blurPx != null) out.blurPx = partial.blurPx;
  return out;
}

function mergeAppearanceLayers(
  ...layers: Array<Partial<TextViewerSurfaceAppearance> | undefined>
): TextViewerSurfaceAppearance {
  let opacity: number | undefined;
  let blurPx: number | undefined;
  for (const layer of layers) {
    if (!layer) continue;
    if (layer.opacity != null) opacity = layer.opacity;
    if (layer.blurPx != null) blurPx = layer.blurPx;
  }
  return {
    opacity: normalizeViewerChromeOverlayOpacity(opacity ?? TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT.opacity),
    blurPx: normalizeViewerChromeOverlayBlurPx(blurPx ?? TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT.blurPx),
  };
}

/** 解析指定 surface 的透明度与模糊 */
export function resolveTextViewerSurfaceAppearance(
  themeId: TextViewerThemeId,
  kind: TextViewerSurfaceKind,
  options: ResolveTextViewerSurfaceAppearanceOptions = {},
): TextViewerSurfaceAppearance {
  const bookLayer = readPartialAppearance(options.bookOverride?.[kind]);
  const configLayer = readPartialAppearance(options.config?.themeSurfaceAppearance?.[kind]);
  const presetLayer = readPartialAppearance(
    TEXT_VIEWER_THEME_SURFACE_APPEARANCE_BY_ID[themeId]?.[kind],
  );

  if (kind === 'pageTip' || kind === 'brightness') {
    const chromeBook = readPartialAppearance(options.bookOverride?.chrome);
    const chromeConfig = readPartialAppearance(options.config?.themeSurfaceAppearance?.chrome);
    const chromePreset = readPartialAppearance(
      TEXT_VIEWER_THEME_SURFACE_APPEARANCE_BY_ID[themeId]?.chrome,
    );
    const appChrome = readViewerChromeOverlayAppearance();
    return applyVisualEffectsToChromeAppearance(
      mergeAppearanceLayers(
        { opacity: appChrome.opacity, blurPx: appChrome.blurPx },
        chromePreset,
        chromeConfig,
        chromeBook,
        presetLayer,
        configLayer,
        bookLayer,
      ),
    );
  }

  if (kind === 'chrome') {
    const chromeBook = readPartialAppearance(options.bookOverride?.chrome);
    const appChrome = readViewerChromeOverlayAppearance();
    return applyVisualEffectsToChromeAppearance(
      mergeAppearanceLayers(
        { opacity: appChrome.opacity, blurPx: appChrome.blurPx },
        presetLayer,
        configLayer,
        chromeBook,
        bookLayer,
      ),
    );
  }

  return applyVisualEffectsToChromeAppearance(
    mergeAppearanceLayers(
      TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT,
      presetLayer,
      configLayer,
      bookLayer,
    ),
  );
}

/** 将透明度/模糊叠加到含 background-color 的 inline style */
export function mergeTextViewerSurfaceAppearanceStyle(
  base: ViewerChromeCssStyle | Record<string, string> | undefined,
  appearance: TextViewerSurfaceAppearance,
): Record<string, string> {
  if (!base) return {};
  const bg =
    base['background-color'] ??
    (base as ViewerChromeCssStyle)["background-color"];
  const overlay = resolveViewerChromeOverlayAppearanceStyle(
    typeof bg === 'string' ? bg : undefined,
    appearance.opacity,
    appearance.blurPx,
  );
  return mergeViewerChromeSurfaceStyles(base, overlay) as Record<string, string>;
}

/** 仅处理背景色字符串（页眉/页脚等只需 background-color 的场景） */
export function applyTextViewerSurfaceAppearanceToBackgroundColor(
  backgroundColor: string,
  appearance: TextViewerSurfaceAppearance,
): string {
  const style = mergeTextViewerSurfaceAppearanceStyle(
    { 'background-color': backgroundColor },
    appearance,
  );
  return style['background-color'] ?? backgroundColor;
}
