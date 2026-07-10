/** 紧凑宽度：与移动端叠加时切换底栏 */
export const SHELL_COMPACT_MAX_WIDTH = 480;

/** 与 ui/sidebar 的 md 断点一致：低于此宽度不挂载侧栏、主内容不留左侧占位 */
export const SHELL_SIDEBAR_MIN_WIDTH = 768;

/** 桌面独立模块侧栏展开宽度：与主侧栏一致，便于展示子页标签与最近读过 */
export const MODULE_SIDEBAR_WIDTH = 'var(--sidebar-width)';

/** 模块侧栏收起宽度：与主侧栏 icon 模式一致 */
export function resolveModuleRailWidth(sidebarExpanded: boolean): string {
  return sidebarExpanded ? MODULE_SIDEBAR_WIDTH : 'var(--sidebar-width-icon)';
}

export type ShellLayoutPreference = 'desktop' | 'mobile' | 'auto';

/** 移动壳层：顶栏 vs 模块侧栏（Sheet）承担子页切换 */
export type MobileShellNavStyle = 'topBar' | 'moduleSidebar';

/** 桌面壳层：融合侧栏 vs 独立模块侧栏 */
export type DesktopSidebarMode = 'fused' | 'independent';

export interface ShellLayoutInput {
  windowWidth: number;
  preference?: ShellLayoutPreference;
  isMobileDevice: boolean;
  mobileShellNavStyle?: MobileShellNavStyle;
  desktopSidebarMode?: DesktopSidebarMode;
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
  /** 模块子导航由独立侧栏 / Sheet 承担（非顶栏下拉） */
  showModuleSidebarNav: boolean;
  /** 桌面独立模式：第二固定栏 */
  showModuleSidebarRail: boolean;
  /** 融合模式：模块子导航叠在主侧栏下方 */
  showFusedModuleNav: boolean;
  /** 主侧栏以 Sheet 呈现（窄屏桌面或移动壳层，非固定栏） */
  sidebarUseSheet: boolean;
  mobileShellNavStyle: MobileShellNavStyle;
  desktopSidebarMode: DesktopSidebarMode;
}

export function resolveShellLayout(input: ShellLayoutInput): ShellLayoutResolved {
  const isCompact = input.windowWidth < SHELL_COMPACT_MAX_WIDTH;
  const isWide = !isCompact;
  const isCompactMobile = isCompact && input.isMobileDevice;
  const effectivePreference = resolveShellLayoutPreference(
    input.preference,
    input.isMobileDevice,
  );

  const useDesktopShell = isWide && effectivePreference === 'desktop';

  /** 移动底栏：显式移动布局（任意宽度）或移动端设备紧凑宽度 */
  const useMobileShell =
    effectivePreference === 'mobile' || isCompactMobile;

  const mobileShellNavStyle: MobileShellNavStyle =
    input.mobileShellNavStyle ?? 'topBar';
  const desktopSidebarMode: DesktopSidebarMode =
    input.desktopSidebarMode ?? 'fused';

  const showSidebar =
    useDesktopShell && input.windowWidth >= SHELL_SIDEBAR_MIN_WIDTH;

  const showTopNavigation = useMobileShell
    ? mobileShellNavStyle === 'topBar'
    : useDesktopShell || (isCompact && !input.isMobileDevice);

  const showModuleSidebarNav =
    (useMobileShell && mobileShellNavStyle === 'moduleSidebar') ||
    (showSidebar && desktopSidebarMode === 'independent');

  const showModuleSidebarRail = showSidebar && desktopSidebarMode === 'independent';

  /** 桌面布局偏好下融合导航不依赖 ≥768 固定侧栏，窄屏桌面可在 Sheet 中展示 */
  const showFusedModuleNav =
    !useMobileShell &&
    effectivePreference === 'desktop' &&
    desktopSidebarMode === 'fused';

  const sidebarUseSheet =
    !showSidebar && (showTopNavigation || showModuleSidebarNav);

  return {
    isCompact,
    isWide,
    isCompactMobile,
    useMobileShell,
    useDesktopShell,
    showSidebar,
    showTopNavigation,
    showBottomBar: useMobileShell,
    insetTopSafeArea: useMobileShell && !showTopNavigation,
    showModuleSidebarNav,
    showModuleSidebarRail,
    showFusedModuleNav,
    sidebarUseSheet,
    mobileShellNavStyle,
    desktopSidebarMode,
  };
}
