/**
 * 书源页操作区：可展开搜索、排序、筛选、更多菜单（搜索模式 / 书源管理入口）
 */

import { createSignal, onMount, Show } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { ExpandableIconSearch } from '@/components/shared/ExpandableIconSearch';
import {
  MoreIcon,
  FilterIcon,
  Settings2Icon,
} from '@/components/shared/icons';
import { SourcesSortDropdown } from '@/components/media/reader/sources/SourcesSortDropdown';
import { SOURCE_PAGE_SORT_OPTIONS, type SourceSortMode } from '@/lib/sources/source-sort';
import type { SourceSearchMode } from '@/lib/sources/source-list-filter';

export interface SourcesPageToolbarProps {
  sourceSearchQuery?: string;
  onSourceSearchQueryChange?: (query: string) => void;
  sourceSearchMode?: SourceSearchMode;
  onSourceSearchModeChange?: (mode: SourceSearchMode) => void;
  sortMode?: SourceSortMode;
  sortReverse?: boolean;
  onSortModeChange?: (mode: SourceSortMode) => void;
  onSortReverseChange?: (reverse: boolean) => void;
  filterTooltip?: string;
  onOpenFilterDialog?: () => void;
  onOpenSourcesManage?: () => void;
  showGroupByGroupNameOption?: boolean;
  sourcesGroupByGroupName?: boolean;
  onSourcesGroupByGroupNameChange?: (value: boolean) => void;
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

export function SourcesPageToolbar(props: SourcesPageToolbarProps) {
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false);

  onMount(() => {
    const handleDialogOpened = () => {
      setMoreMenuOpen(false);
      blurActiveElement();
    };
    window.addEventListener('dialog-opened', handleDialogOpened);
    return () => window.removeEventListener('dialog-opened', handleDialogOpened);
  });

  return (
    <>
      <ExpandableIconSearch
        value={props.sourceSearchQuery ?? ''}
        onValueChange={(v) => props.onSourceSearchQueryChange?.(v)}
        placeholder="搜索书源"
        tooltip="搜索"
        aria-label="搜索书源"
      />

      <SourcesSortDropdown
        sortMode={props.sortMode ?? 'manual'}
        sortReverse={props.sortReverse ?? false}
        options={SOURCE_PAGE_SORT_OPTIONS}
        onSortModeChange={(mode) => props.onSortModeChange?.(mode)}
        onSortReverseChange={(reverse) => props.onSortReverseChange?.(reverse)}
        showGroupByGroupNameOption={props.showGroupByGroupNameOption}
        sourcesGroupByGroupName={props.sourcesGroupByGroupName}
        onSourcesGroupByGroupNameChange={props.onSourcesGroupByGroupNameChange}
        enableDragSort={props.enableDragSort}
        onEnableDragSortChange={props.onEnableDragSortChange}
      />

      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          type="button"
          onClick={() => props.onOpenFilterDialog?.()}
        >
          <FilterIcon class="h-4 w-4" />
          <span class="sr-only">筛选</span>
        </AppTooltipTrigger>
        <AppTooltipContent>{props.filterTooltip || '筛选'}</AppTooltipContent>
      </AppTooltip>

      <AppDropdownMenu open={moreMenuOpen()} onOpenChange={setMoreMenuOpen}>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={(triggerProps: Record<string, unknown>) => (
                <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                  <MoreIcon class="h-4 w-4" />
                  <span class="sr-only">更多</span>
                </AppDropdownMenuIconTrigger>
              )}
            />
          </AppTooltipTrigger>
          <AppTooltipContent>更多</AppTooltipContent>
        </AppTooltip>
        <AppDropdownMenuContent layout="compact">
          <AppDropdownMenuItem onSelect={() => props.onOpenSourcesManage?.()}>
            <Settings2Icon class="h-4 w-4" />
            <span>书源管理</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem
            onSelect={() => props.onSourceSearchModeChange?.('name')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={(props.sourceSearchMode ?? 'name') === 'name'} />
            <span>常规搜索</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => props.onSourceSearchModeChange?.('fuzzy')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={props.sourceSearchMode === 'fuzzy'} />
            <span>模糊搜索</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => props.onSourceSearchModeChange?.('extended')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={props.sourceSearchMode === 'extended'} />
            <span>扩展搜索规则</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );
}
