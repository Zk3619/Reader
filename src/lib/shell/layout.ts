/** 紧凑宽度：与移动端叠加时切换底栏 */
export const SHELL_COMPACT_MAX_WIDTH = 480;

/** 与 ui/sidebar 的 md 断点一致：低于此宽度不挂载侧栏、主内容不留左侧占位 */
export const SHELL_SIDEBAR_MIN_WIDTH = 768;

export type ShellLayoutPreference = 'desktop' | 'mobile' | 'auto';

export interface ShellLayoutInput {
  windowWidth: number;
  preference?: ShellLayoutPreference;
  isMobileDevice: boolean;
}

/** 将「自动」解析为桌面或移动（依据是否移动端运行环境） */
export function resolveShellLayoutPreference(
  preference: ShellLayoutPreference | undefined,
  isMobileDevice: boolean,
): 'desktop' | 'mobile' {
  const value = preference ?? 'auto';
  if (value === 'auto') {
    return isMobileDevice ? 'mobile' : 'desktop';
  }
  return value;
}

export interface ShellLayoutResolved {
  isCompact: boolean;
  isWide: boolean;
  /** 移动端且宽度 < 480px */
  isCompactMobile: boolean;
  useMobileShell: boolean;
  useDesktopShell: boolean;
  /** 桌面壳层且宽度 ≥768px 时显示固定侧栏 */
  showSidebar: boolean;
  showTopNavigation: boolean;
  showBottomBar: boolean;
  insetTopSafeArea: boolean;
}

export function resolveShellLayout(input: ShellLayoutInput): ShellLayoutResolved {
  const isCompact = input.windowWidth < SHELL_COMPACT_MAX_WIDTH;
  const isWide = !isCompact;
  const isCompactMobile = isCompact && input.isMobileDevice;
  const effectivePreference = resolveShellLayoutPreference(
    input.preference,
    input.isMobileDevice,
  );

  const useMobileShellFromPreference = isWide && effectivePreference === 'mobile';
  const useDesktopShellFromPreference = isWide && effectivePreference === 'desktop';

  const useMobileShell = isCompactMobile || useMobileShellFromPreference;
  const useDesktopShell = useDesktopShellFromPreference;
  const showSidebar =
    useDesktopShell && input.windowWidth >= SHELL_SIDEBAR_MIN_WIDTH;

  return {
    isCompact,
    isWide,
    isCompactMobile,
    useMobileShell,
    useDesktopShell,
    showSidebar,
    showTopNavigation:
      useDesktopShell || (isCompact && !input.isMobileDevice),
    showBottomBar: useMobileShell,
    insetTopSafeArea: useMobileShell,
  };
}
