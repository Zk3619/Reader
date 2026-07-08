/**
 * 各 Media Viewer 共享 chrome 主题：overlay 外观、stage 布局 class、CSS 变量
 */

import type { MediaViewerChromeTokens, ThemeCssVarMap, ViewerStageTheme } from '@/lib/theme/types';
import { MEDIA_VIEWER_CSS_VARS } from '@/lib/theme/tokens';
import { cssVarMapToStyle } from '@/lib/theme/apply-css-vars';

export const DEFAULT_MEDIA_VIEWER_CHROME: MediaViewerChromeTokens = {
  overlayOpacityDefault: 100,
  overlayBlurDefaultPx: 0,
  floatingShift: '0.75rem',
  sliderLaneClass: 'viewer-chrome-slider-lane',
};

/** 四 viewer 主内容区铺满壳层 */
export const MEDIA_VIEWER_STAGE_CLASSES = {
  mainStage: 'media-viewer-main-stage absolute inset-0 min-h-0',
  mainScroll: 'media-viewer-main-scroll absolute inset-0 overflow-y-auto',
  contentScroll: 'media-viewer-content-scroll',
} as const;

export const DEFAULT_MEDIA_VIEWER_STAGE: ViewerStageTheme = {
  stageClass: MEDIA_VIEWER_STAGE_CLASSES.mainStage,
};

export function mediaViewerChromeCssVars(
  overrides?: Partial<MediaViewerChromeTokens>,
): ThemeCssVarMap {
  const chrome = { ...DEFAULT_MEDIA_VIEWER_CHROME, ...overrides };
  return {
    [MEDIA_VIEWER_CSS_VARS.chromeOverlayOpacity]: String(chrome.overlayOpacityDefault),
    [MEDIA_VIEWER_CSS_VARS.chromeOverlayBlur]: `${chrome.overlayBlurDefaultPx}px`,
    '--reader-chrome-floating-shift': chrome.floatingShift,
  };
}

export function mediaViewerChromeStyle(
  overrides?: Partial<MediaViewerChromeTokens>,
): Record<string, string> {
  return cssVarMapToStyle(mediaViewerChromeCssVars(overrides));
}

/** overlay 顶底栏 panel / floating track 共用 class（见 styles/media-viewer.css） */
export const MEDIA_VIEWER_CHROME_CSS_CLASSES = {
  overlayPanel: 'reader-chrome-overlay-panel',
  overlayPanelHidden: 'reader-chrome-overlay-panel--hidden',
  overlaySurface: 'reader-chrome-overlay-panel__surface',
  overlayPanelTop: 'reader-chrome-overlay-panel--top',
  overlayPanelBottom: 'reader-chrome-overlay-panel--bottom',
  floatingTop: 'reader-chrome-floating-top',
  floatingBottom: 'reader-chrome-floating-bottom',
  floatingTopHidden: 'reader-chrome-floating-top--hidden',
  floatingBottomHidden: 'reader-chrome-floating-bottom--hidden',
  floatingTopTrack: 'reader-chrome-floating-top__track',
  floatingBottomTrack: 'reader-chrome-floating-bottom__track',
  topBar: 'reader-top-bar',
  footer: 'reader-footer',
  bottomBar: 'reader-bottom-bar',
  controlBar: 'reader-control-bar',
  barHidden: 'reader-bar-hidden',
  brightnessShell: 'reader-brightness-capsule-shell',
  brightnessTrack: 'reader-brightness-capsule-track',
  brightnessSliderLane: 'reader-brightness-capsule-slider-lane',
} as const;
