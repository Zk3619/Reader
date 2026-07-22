import { cn } from '@/lib/utils';

/** 主壳侧栏 / 模块子侧栏导航按钮统一样式 */
export function sidebarNavButtonClass(
  active: boolean,
  opts?: { collapsed?: boolean; extra?: string },
): string {
  const collapsed = opts?.collapsed ?? false;
  return cn(
    'relative overflow-hidden rounded-xl transition-colors duration-200',
    'text-sidebar-foreground/70 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-current',
    collapsed
      ? '!size-8 !p-2 justify-center'
      : 'border-l-2',
    active
      ? cn(
          'bg-primary/10! text-primary! font-semibold shadow-sm',
          collapsed ? 'border-l-transparent' : 'border-l-primary border-l-2',
        )
      : collapsed
        ? 'border-l-transparent'
        : 'border-l-2 border-l-transparent',
    !active && 'hover:bg-primary/10 hover:text-primary hover:shadow-sm',
    opts?.extra,
  );
}

export function sidebarNavMenuClass(collapsed?: boolean): string {
  return cn(collapsed && 'items-center');
}

export function sidebarNavMenuItemClass(collapsed?: boolean): string {
  return cn(collapsed && 'flex justify-center');
}
