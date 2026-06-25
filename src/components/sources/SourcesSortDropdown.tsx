/**
 * 书源排序下拉：列表显示 → 排序方式 → 反向排序 / 拖拽排序
 */

import { For, Show, createSignal, onMount } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
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
import type { SourceManageGroupMode, SourceSortMode } from '@/lib/sources/source-sort';
import { cn } from '@/lib/utils';

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
  /** 书源页：为 true 时展示「默认 / 按分组名」 */
  showGroupByGroupNameOption?: boolean;
  sourcesGroupByGroupName?: boolean;
  onSourcesGroupByGroupNameChange?: (value: boolean) => void;
  /** 书源管理页：分组显示方式 */
  groupMode?: SourceManageGroupMode;
  onGroupModeChange?: (mode: SourceManageGroupMode) => void;
  enableDragSort?: boolean;
  onEnableDragSortChange?: (value: boolean) => void;
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

  const showPageDisplay = () => !!props.showGroupByGroupNameOption;
  const showManageDisplay = () =>
    props.groupMode !== undefined && !!props.onGroupModeChange;
  const showDisplaySection = () => showPageDisplay() || showManageDisplay();
  const showDragSort = () => props.onEnableDragSortChange !== undefined;

  /** 与列表一致：手动排序 + 默认显示（平铺）时可拖拽 */
  const dragSortSelectable = () => {
    if (props.sortMode !== 'manual') return false;
    if (showManageDisplay()) return props.groupMode === 'flat';
    if (showPageDisplay()) return !props.sourcesGroupByGroupName;
    return true;
  };

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
        <Show when={showPageDisplay()}>
          <AppDropdownMenuItem
            onSelect={() => props.onSourcesGroupByGroupNameChange?.(false)}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={!props.sourcesGroupByGroupName} />
            <span>默认显示</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => props.onSourcesGroupByGroupNameChange?.(true)}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={!!props.sourcesGroupByGroupName} />
            <span>按分组名显示</span>
          </AppDropdownMenuItem>
        </Show>
        <Show when={showManageDisplay()}>
          <AppDropdownMenuItem
            onSelect={() => props.onGroupModeChange?.('flat')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={props.groupMode === 'flat'} />
            <span>默认显示</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => props.onGroupModeChange?.('by-group')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={props.groupMode === 'by-group'} />
            <span>按书源分组显示</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => props.onGroupModeChange?.('by-domain')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={props.groupMode === 'by-domain'} />
            <span>按域名分组显示</span>
          </AppDropdownMenuItem>
        </Show>
        <Show when={showDisplaySection()}>
          <AppDropdownMenuSeparator />
        </Show>
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
        <Show when={showDragSort()}>
          <AppDropdownMenuItem
            disabled={!dragSortSelectable()}
            onSelect={() => {
              if (dragSortSelectable()) {
                props.onEnableDragSortChange?.(!props.enableDragSort);
              }
            }}
            class={cn('flex items-center gap-2', !dragSortSelectable() && 'opacity-60')}
          >
            <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
              <Checkbox
                checked={!!props.enableDragSort}
                disabled={!dragSortSelectable()}
                aria-label="拖拽排序"
              />
            </span>
            <span>拖拽排序</span>
          </AppDropdownMenuItem>
        </Show>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
