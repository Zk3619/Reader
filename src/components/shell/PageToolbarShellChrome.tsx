import { Show } from 'solid-js';
import { Separator } from '@/components/ui/separator';
import { ThemeSwitch } from '@/components/shell/ThemeSwitch';
import { WindowControlButtons } from '@/components/shell/WindowControlButtons';
import { ShellSidebarTrigger } from '@/components/shell/ShellSidebarTrigger';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import {
  shouldShowPageToolbarShellChrome,
  shouldShowPageToolbarSidebarTrigger,
} from '@/lib/shell/page-toolbar-shell-chrome';

export function PageToolbarSidebarLeading() {
  const shell = useShellLayout();
  return (
    <Show when={shouldShowPageToolbarSidebarTrigger(shell())}>
      <ShellSidebarTrigger class="h-9 w-9 shrink-0" />
    </Show>
  );
}

export function PageToolbarShellTrailing(props: { showLeadingSeparator?: boolean }) {
  const shell = useShellLayout();
  const showChrome = () => shouldShowPageToolbarShellChrome(shell());
  const showSeparator = () =>
    props.showLeadingSeparator !== false && showChrome();

  return (
    <Show when={showChrome()}>
      <div class="flex shrink-0 items-center gap-2 no-drag">
        <Show when={showSeparator()}>
          <Separator orientation="vertical" class="mx-1 h-6 sm:mx-2" />
        </Show>
        <div class="flex h-9 items-center gap-0.5 sm:gap-1">
          <ThemeSwitch withTooltip />
          <WindowControlButtons />
        </div>
      </div>
    </Show>
  );
}
