/**
 * 音频阅读器主题
 */

import type { ThemeCssVarMap, ViewerStageTheme } from '@/lib/theme/types';
import { AUDIO_VIEWER_CSS_VARS } from '@/lib/theme/tokens';
import { cssVarMapToStyle } from '@/lib/theme/apply-css-vars';

export interface AudioViewerThemeOptions {
  gradientFrom?: string;
  gradientVia?: string;
  gradientTo?: string;
  lyricHighlight?: string;
}

export const DEFAULT_AUDIO_VIEWER_THEME: Required<AudioViewerThemeOptions> = {
  gradientFrom: 'hsl(var(--background))',
  gradientVia: 'hsl(var(--background))',
  gradientTo: 'hsl(var(--muted) / 0.4)',
  lyricHighlight: 'hsl(var(--primary) / 0.18)',
};

export const AUDIO_VIEWER_STAGE: ViewerStageTheme = {
  stageClass:
    'flex flex-col items-center justify-center gap-4 bg-linear-to-b from-background via-background to-muted/40 px-6',
  cssVars: {
    [AUDIO_VIEWER_CSS_VARS.stageGradientFrom]: DEFAULT_AUDIO_VIEWER_THEME.gradientFrom,
    [AUDIO_VIEWER_CSS_VARS.stageGradientVia]: DEFAULT_AUDIO_VIEWER_THEME.gradientVia,
    [AUDIO_VIEWER_CSS_VARS.stageGradientTo]: DEFAULT_AUDIO_VIEWER_THEME.gradientTo,
    [AUDIO_VIEWER_CSS_VARS.lyricHighlight]: DEFAULT_AUDIO_VIEWER_THEME.lyricHighlight,
  },
};

export function audioViewerCssVars(options?: AudioViewerThemeOptions): ThemeCssVarMap {
  return {
    [AUDIO_VIEWER_CSS_VARS.stageGradientFrom]:
      options?.gradientFrom ?? DEFAULT_AUDIO_VIEWER_THEME.gradientFrom,
    [AUDIO_VIEWER_CSS_VARS.stageGradientVia]:
      options?.gradientVia ?? DEFAULT_AUDIO_VIEWER_THEME.gradientVia,
    [AUDIO_VIEWER_CSS_VARS.stageGradientTo]:
      options?.gradientTo ?? DEFAULT_AUDIO_VIEWER_THEME.gradientTo,
    [AUDIO_VIEWER_CSS_VARS.lyricHighlight]:
      options?.lyricHighlight ?? DEFAULT_AUDIO_VIEWER_THEME.lyricHighlight,
  };
}

export function audioViewerStageStyle(
  options?: AudioViewerThemeOptions,
): Record<string, string> {
  return cssVarMapToStyle(audioViewerCssVars(options));
}

export const AUDIO_VIEWER_CSS_CLASSES = {
  stage: 'audio-viewer-stage',
  controls: 'audio-viewer-controls',
} as const;
