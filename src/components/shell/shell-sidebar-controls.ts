/**
 * 壳层侧栏控制：在 ui/sidebar 视口断点之外，按布局偏好决定 Sheet / 固定栏。
 */

import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { useSidebar } from '@/components/ui/sidebar';

export function useShellSidebarControls() {
  const shell = useShellLayout();
  const { isMobile, openMobile, setOpenMobile, toggleSidebar, state } = useSidebar();

  /** 宽视口但壳层要求 Sheet（如强制移动布局） */
  const usesShellSheet = () => shell().sidebarUseSheet && !isMobile();

  const toggleShellSidebar = () => {
    if (shell().sidebarUseSheet) {
      setOpenMobile(!openMobile());
      return;
    }
    toggleSidebar();
  };

  const closeShellSidebar = () => {
    if (shell().sidebarUseSheet) {
      setOpenMobile(false);
    }
  };

  return {
    shell,
    isMobile,
    openMobile,
    setOpenMobile,
    state,
    usesShellSheet,
    toggleShellSidebar,
    closeShellSidebar,
  };
}
