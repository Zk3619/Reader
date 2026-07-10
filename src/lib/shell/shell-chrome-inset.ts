import { resolveModuleRailWidth } from '@/lib/shell/layout';

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
