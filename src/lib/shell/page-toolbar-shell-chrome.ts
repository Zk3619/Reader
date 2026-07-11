import type { ShellLayoutResolved } from '@/lib/shell/layout';
import { shouldEnableTauriWindowChrome } from '@/lib/platform/tauri-window-chrome';

/** 页头最左侧：无顶栏时由 PageToolbar 承担侧栏 Sheet 触发器 */
export function shouldShowPageToolbarSidebarTrigger(
  layout: Pick<
    ShellLayoutResolved,
    | 'showTopNavigation'
    | 'sidebarUseSheet'
    | 'showModuleSidebarNav'
    | 'showSidebar'
  >,
): boolean {
  if (layout.showTopNavigation) return false;
  return (
    layout.sidebarUseSheet ||
    (layout.showModuleSidebarNav && !layout.showSidebar)
  );
}

/** 页头最右侧：桌面强制移动壳层且无顶栏时显示分隔线、主题与窗口控件 */
export function shouldShowPageToolbarShellChrome(
  layout: Pick<ShellLayoutResolved, 'useMobileShell' | 'showTopNavigation'>,
): boolean {
  return (
    shouldEnableTauriWindowChrome(layout.useMobileShell) &&
    !layout.showTopNavigation
  );
}
