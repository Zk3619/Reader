/**
 * 视频阅读器主题（ArtPlayer + 影院暗色）
 */

import type { ThemeCssVarMap, ViewerStageTheme } from '@/lib/theme/types';
import { VIDEO_VIEWER_CSS_VARS } from '@/lib/theme/tokens';
import { cssVarMapToStyle } from '@/lib/theme/apply-css-vars';

export interface VideoViewerThemeOptions {
  artTheme?: string;
  artHoverColor?: string;
  artLoadedColor?: string;
  artProgressColor?: string;
  artHoverBgColor?: string;
  controlHeight?: string;
  bottomHeight?: string;
  letterbox?: string;
}

export const DEFAULT_VIDEO_VIEWER_THEME: Required<VideoViewerThemeOptions> = {
  artTheme: '#a78bfa',
  artHoverColor: '#c4b5fd',
  artLoadedColor: 'rgba(167, 139, 250, 0.28)',
  artProgressColor: '#a78bfa',
  artHoverBgColor: 'rgba(15, 23, 42, 0.72)',
  controlHeight: '46px',
  bottomHeight: '52px',
  letterbox: '#000000',
};

export const VIDEO_VIEWER_STAGE: ViewerStageTheme = {
  stageClass: 'reader-artplayer-stage bg-black',
  cssVars: {
    [VIDEO_VIEWER_CSS_VARS.artTheme]: DEFAULT_VIDEO_VIEWER_THEME.artTheme,
    [VIDEO_VIEWER_CSS_VARS.artHoverColor]: DEFAULT_VIDEO_VIEWER_THEME.artHoverColor,
    [VIDEO_VIEWER_CSS_VARS.artProgressColor]: DEFAULT_VIDEO_VIEWER_THEME.artProgressColor,
    [VIDEO_VIEWER_CSS_VARS.stageLetterbox]: DEFAULT_VIDEO_VIEWER_THEME.letterbox,
  },
};

export function videoViewerCssVars(options?: VideoViewerThemeOptions): ThemeCssVarMap {
  const t = { ...DEFAULT_VIDEO_VIEWER_THEME, ...options };
  return {
    [VIDEO_VIEWER_CSS_VARS.artTheme]: t.artTheme,
    [VIDEO_VIEWER_CSS_VARS.artHoverColor]: t.artHoverColor,
    '--art-loaded-color': t.artLoadedColor,
    [VIDEO_VIEWER_CSS_VARS.artProgressColor]: t.artProgressColor,
    '--art-hover-bg-color': t.artHoverBgColor,
    '--art-control-height': t.controlHeight,
    '--art-bottom-height': t.bottomHeight,
    [VIDEO_VIEWER_CSS_VARS.stageLetterbox]: t.letterbox,
  };
}

export function videoViewerStageStyle(
  options?: VideoViewerThemeOptions,
): Record<string, string> {
  return cssVarMapToStyle(videoViewerCssVars(options));
}

export const VIDEO_VIEWER_CSS_CLASSES = {
  stage: 'reader-artplayer-stage',
} as const;
