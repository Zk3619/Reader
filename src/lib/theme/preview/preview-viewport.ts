export type ThemePreviewViewport = 'mobile' | 'tablet' | 'desktop';

export const PREVIEW_VIEWPORT_WIDTH: Record<ThemePreviewViewport, number> = {
  mobile: 375,
  tablet: 768,
  desktop: 1200,
};

/** 预览壳层最小高度（内容可继续撑高，由预览区滚动查看） */
export const PREVIEW_APP_SHELL_MIN_HEIGHT_PX = 520;
export const PREVIEW_VIEWER_SHELL_MIN_HEIGHT_PX = 360;
