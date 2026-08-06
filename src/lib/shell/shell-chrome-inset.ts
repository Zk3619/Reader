import { resolveModuleRailWidth } from '@/lib/shell/layout';

/**
 * 与 App `appSidebarStyle` / 主内容区一致。
 * GlobalMediaPlayer 经 Portal 挂到 body，必须自带这些变量，否则 `left: var(--sidebar-*)` 无效。
 */
export const SHELL_SIDEBAR_CSS_VARS = {
  '--sidebar-width': '12rem',
  '--sidebar-width-icon': '3rem',
} as const;

export interface ShellChromeLeftInput {
  showSidebar: boolean;
  sidebarExpanded: boolean;
  showModuleRail: boolean;
  moduleRailExpanded: boolean;
}

/** 主内容区 / 浮动播放器统一的 left 偏移（避免 ui/sidebar peer 与手动 inset 叠加） */
export function resolveShellContentLeft(input: ShellChromeLeftInput): string {
  const sidebarLeft = input.showSidebar
    ? input.sidebarExpanded
      ? 'var(--sidebar-width)'
      : 'var(--sidebar-width-icon)'
    : '0px';

  if (input.showModuleRail) {
    return `calc(${sidebarLeft} + ${resolveModuleRailWidth(input.moduleRailExpanded)})`;
  }

  if (input.showSidebar) {
    return sidebarLeft;
  }

  return '0px';
}

export function shellContentLeftClass(input: ShellChromeLeftInput): string {
  const left = resolveShellContentLeft(input);
  return left === '0px' ? 'left-0' : `left-[${left}]`;
}

/**
 * 固定/层叠全局播放条的定位 style（含侧栏 CSS 变量，供 Portal→body 使用）。
 */
export function shellMediaPlayerBarInsetStyle(shellMainLeft?: string): Record<string, string> {
  return {
    ...SHELL_SIDEBAR_CSS_VARS,
    left: shellMainLeft?.trim() || '0px',
    right: '0px',
    width: 'auto',
  };
}

/**
 * 与主内容区 `#main-content-container`（transition-all duration-200）及
 * 侧栏 host（duration-200 ease-linear）对齐，避免收展侧栏时播放条 left 瞬跳。
 */
export const shellMediaPlayerBarTransitionClass = 'transition-[left] duration-200 ease-linear';
