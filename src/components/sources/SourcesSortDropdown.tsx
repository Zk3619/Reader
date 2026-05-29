/**
 * 书源排序下拉：单选排序方式 + 复选反向排序
 */

import { For, Show, createSignal, onMount } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { ChevronsUpDownIcon } from '@/components/shared/icons';
import type { SourceSortMode } from '@/lib/sources/source-sort';

export interface SourcesSortOption {
  value: SourceSortMode;
  label: string;
}

export interface SourcesSortDropdownProps {
  sortMode: SourceSortMode;
  sortReverse: boolean;
  options: SourcesSortOption[];
  onSortModeChange: (mode: SourceSortMode) => void;
  onSortReverseChange: (reverse: boolean) => void;
}

function MenuRadioIndicator(props: { selected: boolean }) {
  return (
    <span
      class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none"
      aria-label={props.selected ? '已选' : '未选'}
    >
      <span class="relative flex size-4 items-center justify-center" aria-hidden>
        <span class="size-4 rounded-full border border-primary" />
        <Show when={props.selected}>
          <span class="absolute size-2 rounded-full bg-primary" />
        </Show>
      </span>
    </span>
  );
}

export function SourcesSortDropdown(props: SourcesSortDropdownProps) {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const reverseDisabled = () => props.sortMode === 'manual';

  onMount(() => {
    const handleDialogOpened = () => {
      setMenuOpen(false);
      blurActiveElement();
    };
    window.addEventListener('dialog-opened', handleDialogOpened);
    return () => window.removeEventListener('dialog-opened', handleDialogOpened);
  });

  return (
    <AppDropdownMenu open={menuOpen()} onOpenChange={setMenuOpen}>
      <Tooltip>
        <TooltipTrigger as="div">
          <AppDropdownMenuTrigger
            as={(triggerProps: Record<string, unknown>) => (
              <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                <ChevronsUpDownIcon class="h-4 w-4" />
                <span class="sr-only">排序</span>
              </AppDropdownMenuIconTrigger>
            )}
          />
        </TooltipTrigger>
        <TooltipContent>排序</TooltipContent>
      </Tooltip>
      <AppDropdownMenuContent layout="compact">
        <For each={props.options}>
          {(opt) => (
            <AppDropdownMenuItem
              onSelect={() => props.onSortModeChange(opt.value)}
              class="flex items-center gap-2"
            >
              <MenuRadioIndicator selected={props.sortMode === opt.value} />
              <span>{opt.label}</span>
            </AppDropdownMenuItem>
          )}
        </For>
        <AppDropdownMenuSeparator />
        <AppDropdownMenuItem
          disabled={reverseDisabled()}
          onSelect={() => {
            if (!reverseDisabled()) props.onSortReverseChange(!props.sortReverse);
          }}
          class="flex items-center gap-2"
        >
          <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
            <Checkbox
              checked={props.sortReverse}
              disabled={reverseDisabled()}
              aria-label="反向排序"
            />
          </span>
          <span>反向排序</span>
        </AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
