/**
 * 组件底色 surface 透明度 / 模糊（基于颜色 Tab 的 CSS 变量底色）
 */

import type { ComponentStyleOverride, ThemeComponentId } from '@/lib/theme/schema/theme-pack-v1';
import {
  mergeTextViewerSurfaceAppearanceStyle,
  TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT,
  type TextViewerSurfaceAppearance,
} from '@/lib/theme/text-viewer-surface-appearance';
import {
  normalizeViewerChromeOverlayBlurPx,
  normalizeViewerChromeOverlayOpacity,
} from '@/lib/viewer/media-viewer-chrome-overlay-appearance';

/** 各组件主底色 CSS 变量（与 COMPONENT_CSS_VAR_PRESETS 背景项对齐） */
export const COMPONENT_SURFACE_BG_VAR: Partial<Record<ThemeComponentId, string>> = {
  appShell: '--background',
  pageContent: '--background',
  sidebar: '--sidebar',
  sidebarHeader: '--sidebar',
  sidebarNav: '--sidebar',
  sidebarRecent: '--sidebar',
  sidebarFooter: '--sidebar',
  pageToolbar: '--background',
  bookshelfCard: '--card',
  bookshelfGroupCard: '--card',
  settingsCard: '--card',
  settingsTabPanel: '--background',
  settingsRow: '--background',
  recordCard: '--card',
  surfaceCard: '--card',
  button: '--primary',
  dialog: '--popover',
  drawer: '--background',
  dropdown: '--popover',
  select: '--popover',
  combobox: '--popover',
  contextMenu: '--popover',
  toast: '--background',
  readerChrome: '--background',
  toolbarHeader: '--background',
  footerChrome: '--background',
  pageTip: '--background',
  brightnessCapsule: '--background',
  imageStage: '--muted',
  videoControls: '--background',
};

export function resolveComponentSurfaceAppearance(
  override: ComponentStyleOverride | undefined,
): TextViewerSurfaceAppearance {
  const partial = override?.surfaceAppearance;
  return {
    opacity: normalizeViewerChromeOverlayOpacity(
      partial?.opacity ?? TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT.opacity,
    ),
    blurPx: normalizeViewerChromeOverlayBlurPx(
      partial?.blurPx ?? TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT.blurPx,
    ),
  };
}

export function componentSurfaceAppearanceToStyle(
  componentId: ThemeComponentId,
  override: ComponentStyleOverride | undefined,
): Record<string, string> {
  if (!override?.surfaceAppearance) return {};
  const appearance = resolveComponentSurfaceAppearance(override);
  if (appearance.opacity >= 100 && appearance.blurPx <= 0) return {};
  const bgVar = COMPONENT_SURFACE_BG_VAR[componentId];
  if (!bgVar) return {};
  const baseColor = bgVar.startsWith('--text-viewer')
    ? `var(${bgVar})`
    : `hsl(var(${bgVar}))`;
  return mergeTextViewerSurfaceAppearanceStyle(
    { 'background-color': baseColor },
    appearance,
  ) as Record<string, string>;
}
