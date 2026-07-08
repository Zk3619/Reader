import type { AppComponentId, ThemeComponentId } from '@/lib/theme/schema/theme-pack-v1';

/** 组件模式下始终保留的壳层结构（与 App.tsx 主壳一致） */
const APP_SHELL_CHROME: ReadonlySet<AppComponentId> = new Set([
  'appShell',
  'sidebar',
  'sidebarHeader',
  'sidebarNav',
  'sidebarRecent',
  'sidebarFooter',
  'pageContent',
  'pageToolbar',
]);

const SIDEBAR_IDS: ReadonlySet<AppComponentId> = new Set([
  'sidebar',
  'sidebarHeader',
  'sidebarNav',
  'sidebarRecent',
  'sidebarFooter',
]);

const OVERLAY_COMPONENTS: ReadonlySet<AppComponentId> = new Set([
  'button',
  'dialog',
  'dropdown',
  'drawer',
  'combobox',
  'contextMenu',
  'select',
  'toast',
  'settingsRow',
]);

export function isAppOverlayComponent(id: AppComponentId): boolean {
  return OVERLAY_COMPONENTS.has(id);
}

export function shouldShowAppPreviewComponent(
  id: AppComponentId,
  previewMode: 'full' | 'component',
  selected?: ThemeComponentId,
): boolean {
  if (previewMode !== 'component' || !selected) return true;
  if (APP_SHELL_CHROME.has(id)) return true;
  if (selected === id) return true;
  if (SIDEBAR_IDS.has(selected as AppComponentId) && SIDEBAR_IDS.has(id)) return true;
  if (isAppOverlayComponent(id)) {
    return isAppOverlayComponent(selected as AppComponentId);
  }
  return false;
}

const VIEWER_SHELL_CHROME: ReadonlySet<string> = new Set([
  'readerChrome',
  'toolbarHeader',
  'footerChrome',
  'contentSlot',
  'pageTip',
]);

export function shouldShowViewerPreviewComponent(
  id: string,
  previewMode: 'full' | 'component',
  selected?: ThemeComponentId,
): boolean {
  if (previewMode !== 'component' || !selected) return true;
  if (VIEWER_SHELL_CHROME.has(id)) return true;
  if (selected === id) return true;
  return false;
}
