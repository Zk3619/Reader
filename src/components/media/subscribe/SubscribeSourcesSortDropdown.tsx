/**
 * 订阅源管理排序下拉：排序方式 → 反向排序 → 按分类显示
 */

import { For, Show, createSignal, onMount } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
} from '@/components/shared/AppTooltip';
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
import type { SubscribeSourceSortMode } from '@/lib/subscribe/subscribe-source-sort';
import { cn } from '@/lib/utils';

export interface SubscribeSourcesSortDropdownProps {
  sortMode: SubscribeSourceSortMode;
  sortReverse: boolean;
  options: Array<{ value: SubscribeSourceSortMode; label: string }>;
  onSortModeChange: (mode: SubscribeSourceSortMode) => void;
  onSortReverseChange: (reverse: boolean) => void;
  /** 按分类分区显示（默认勾选） */
  showByCategory: boolean;
  onShowByCategoryChange: (value: boolean) => void;
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

export function SubscribeSourcesSortDropdown(props: SubscribeSourcesSortDropdownProps) {
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
      <AppTooltip>
        <AppTooltipTrigger as="div">
          <AppDropdownMenuTrigger
            as={(triggerProps: Record<string, unknown>) => (
              <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                <ChevronsUpDownIcon class="h-4 w-4" />
                <span class="sr-only">排序</span>
              </AppDropdownMenuIconTrigger>
            )}
          />
        </AppTooltipTrigger>
        <AppTooltipContent>排序</AppTooltipContent>
      </AppTooltip>
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
          class={cn('flex items-center gap-2', reverseDisabled() && 'opacity-60')}
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
        <AppDropdownMenuItem
          onSelect={() => props.onShowByCategoryChange(!props.showByCategory)}
          class="flex items-center gap-2"
        >
          <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
            <Checkbox checked={props.showByCategory} aria-label="按分类显示" />
          </span>
          <span>按分类显示</span>
        </AppDropdownMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
