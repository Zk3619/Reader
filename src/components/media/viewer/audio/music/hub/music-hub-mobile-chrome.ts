import { createContext, useContext, type Accessor } from 'solid-js';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';

export interface MusicHubMobileChromeValue {
  onOpenDrawer?: () => void;
}

export const MusicHubMobileChromeContext = createContext<
  Accessor<MusicHubMobileChromeValue>
>(() => ({}));

export function useMusicHubMobileChrome() {
  return useContext(MusicHubMobileChromeContext);
}

/** 子页导航由主壳承担时，隐藏 Hub 内置导航（与阅读模块一致） */
export function useMusicExternalModuleNav(): () => boolean {
  const shell = useShellLayout();
  return () => {
    const layout = shell();
    if (layout.useMobileShell) {
      return layout.showTopNavigation || layout.showModuleSidebarNav;
    }
    return layout.showModuleSidebarRail || layout.showFusedModuleNav;
  };
}

export function useMusicHubShellNav() {
  const shell = useShellLayout();
  const hideInternalNav = useMusicExternalModuleNav();
  const useMobileLayout = () => shell().useMobileShell;
  return {
    shell,
    hideInternalNav,
    useMobileLayout,
  };
}
