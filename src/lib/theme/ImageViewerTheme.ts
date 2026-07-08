/**
 * 图片 / 漫画阅读器主题
 */

import type { ThemeCssVarMap, ViewerStageTheme } from '@/lib/theme/types';
import { IMAGE_VIEWER_CSS_VARS } from '@/lib/theme/tokens';
import { cssVarMapToStyle } from '@/lib/theme/apply-css-vars';

export interface ImageViewerThemeOptions {
  /** 舞台背景（letterbox） */
  stageBg?: string;
  letterbox?: string;
}

export const DEFAULT_IMAGE_VIEWER_THEME: Required<ImageViewerThemeOptions> = {
  stageBg: 'rgba(0, 0, 0, 0.9)',
  letterbox: '#000000',
};

export const IMAGE_VIEWER_STAGE: ViewerStageTheme = {
  stageClass: 'bg-black/90',
  cssVars: {
    [IMAGE_VIEWER_CSS_VARS.stageBg]: DEFAULT_IMAGE_VIEWER_THEME.stageBg,
    [IMAGE_VIEWER_CSS_VARS.letterbox]: DEFAULT_IMAGE_VIEWER_THEME.letterbox,
  },
};

export function imageViewerCssVars(
  options?: ImageViewerThemeOptions,
): ThemeCssVarMap {
  return {
    [IMAGE_VIEWER_CSS_VARS.stageBg]:
      options?.stageBg ?? DEFAULT_IMAGE_VIEWER_THEME.stageBg,
    [IMAGE_VIEWER_CSS_VARS.letterbox]:
      options?.letterbox ?? DEFAULT_IMAGE_VIEWER_THEME.letterbox,
  };
}

export function imageViewerStageStyle(
  options?: ImageViewerThemeOptions,
): Record<string, string> {
  return cssVarMapToStyle(imageViewerCssVars(options));
}

/** 图片 viewer 专用 class */
export const IMAGE_VIEWER_CSS_CLASSES = {
  stage: 'image-viewer-stage',
} as const;
