/**
 * 文件（PDF 等）阅读器主题
 */

import type { ThemeCssVarMap, ViewerStageTheme } from '@/lib/theme/types';
import { FILE_VIEWER_CSS_VARS } from '@/lib/theme/tokens';
import { cssVarMapToStyle } from '@/lib/theme/apply-css-vars';

export interface FileViewerThemeOptions {
  stageBg?: string;
  embedBorder?: string;
}

export const DEFAULT_FILE_VIEWER_THEME: Required<FileViewerThemeOptions> = {
  stageBg: 'hsl(var(--muted) / 0.3)',
  embedBorder: 'hsl(var(--border))',
};

export const FILE_VIEWER_STAGE: ViewerStageTheme = {
  stageClass: 'flex flex-col bg-muted/30',
  cssVars: {
    [FILE_VIEWER_CSS_VARS.stageBg]: DEFAULT_FILE_VIEWER_THEME.stageBg,
    [FILE_VIEWER_CSS_VARS.embedBorder]: DEFAULT_FILE_VIEWER_THEME.embedBorder,
  },
};

export function fileViewerCssVars(options?: FileViewerThemeOptions): ThemeCssVarMap {
  return {
    [FILE_VIEWER_CSS_VARS.stageBg]:
      options?.stageBg ?? DEFAULT_FILE_VIEWER_THEME.stageBg,
    [FILE_VIEWER_CSS_VARS.embedBorder]:
      options?.embedBorder ?? DEFAULT_FILE_VIEWER_THEME.embedBorder,
  };
}

export function fileViewerStageStyle(
  options?: FileViewerThemeOptions,
): Record<string, string> {
  return cssVarMapToStyle(fileViewerCssVars(options));
}

export const FILE_VIEWER_CSS_CLASSES = {
  stage: 'file-viewer-stage',
  embed: 'file-viewer-embed',
} as const;
