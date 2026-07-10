import type { ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useShellSidebarControls } from '@/components/shell/shell-sidebar-controls';

type ShellSidebarTriggerProps = ComponentProps<typeof Button> & {
  onClick?: (event: MouseEvent) => void;
};

export function ShellSidebarTrigger(props: ShellSidebarTriggerProps) {
  const [local, others] = splitProps(props, ['class', 'onClick']);
  const { toggleShellSidebar } = useShellSidebarControls();

  return (
    <Button
      data-sidebar="trigger"
      variant="ghost"
      size="icon"
      class={cn('size-7', local.class)}
      onClick={(event: MouseEvent) => {
        local.onClick?.(event);
        toggleShellSidebar();
      }}
      {...others}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="size-4"
      >
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M9 3v18" />
      </svg>
      <span class="sr-only">Toggle Sidebar</span>
    </Button>
  );
}
