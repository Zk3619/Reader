import type { JSX } from 'solid-js';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useShellSidebarControls } from '@/components/shell/shell-sidebar-controls';

/** 宽视口下壳层 Sheet 侧栏（ui/sidebar 仅按视口断点切换，此处补足布局偏好） */
export function ShellSidebarSheet(props: {
  class?: string;
  offsetTopAppBar?: boolean;
  children: JSX.Element;
}) {
  const { openMobile, setOpenMobile } = useShellSidebarControls();

  return (
    <Sheet open={openMobile()} onOpenChange={setOpenMobile}>
      <SheetContent
        data-sidebar="sidebar"
        data-mobile="true"
        position="left"
        class={cn(
          'gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground shadow-lg',
          'w-(--sidebar-width) max-w-(--sidebar-width)! sm:max-w-(--sidebar-width)!',
          '[&>button]:hidden',
          props.class,
        )}
      >
        <div
          class={cn(
            'flex size-full min-h-0 flex-col bg-sidebar text-sidebar-foreground',
            !props.offsetTopAppBar && 'safe-area-inset-top',
          )}
        >
          {props.children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
