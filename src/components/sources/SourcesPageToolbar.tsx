/**
 * 书源页操作区：可展开搜索、排序、筛选、更多菜单（搜索模式 / 书源管理入口）
 */

import { createSignal, createEffect, onMount, Show } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  SearchIcon,
  MoreIcon,
  FilterIcon,
  Settings2Icon,
  XIcon,
} from '@/components/shared/icons';
import { SourcesSortDropdown } from '@/components/sources/SourcesSortDropdown';
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
  const [sourceSearchExpanded, setSourceSearchExpanded] = createSignal(false);
  const sourceSearchQueryRef: { current: string } = { current: '' };

  createEffect(() => {
    sourceSearchQueryRef.current = props.sourceSearchQuery ?? '';
    if ((props.sourceSearchQuery ?? '').trim()) setSourceSearchExpanded(true);
  });

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
      <Show
        when={sourceSearchExpanded()}
        fallback={
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-9 w-9 shrink-0"
              onClick={() => setSourceSearchExpanded(true)}
            >
              <SearchIcon class="h-4 w-4" />
              <span class="sr-only">搜索</span>
            </TooltipTrigger>
            <TooltipContent>搜索</TooltipContent>
          </Tooltip>
        }
      >
        <div class="relative flex h-9 w-40 sm:w-52 items-center rounded-md border border-input bg-transparent text-sm">
          <SearchIcon class="absolute left-2.5 h-4 w-4 shrink-0 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="搜索书源"
            value={props.sourceSearchQuery ?? ''}
            onInput={(e) => {
              const v = e.currentTarget.value;
              sourceSearchQueryRef.current = v;
              props.onSourceSearchQueryChange?.(v);
            }}
            onBlur={() => {
              if (!sourceSearchQueryRef.current.trim()) setSourceSearchExpanded(false);
            }}
            class="h-full w-full flex-1 bg-transparent pl-9 pr-8 py-2 placeholder:text-muted-foreground focus-visible:outline-none rounded-md"
            aria-label="搜索书源"
          />
          <Show when={(props.sourceSearchQuery ?? '').length > 0}>
            <button
              type="button"
              class="absolute right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="清除搜索内容"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                sourceSearchQueryRef.current = '';
                props.onSourceSearchQueryChange?.('');
              }}
            >
              <XIcon class="h-3.5 w-3.5" />
            </button>
          </Show>
        </div>
      </Show>

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

      <Tooltip>
        <TooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          type="button"
          onClick={() => props.onOpenFilterDialog?.()}
        >
          <FilterIcon class="h-4 w-4" />
          <span class="sr-only">筛选</span>
        </TooltipTrigger>
        <TooltipContent>{props.filterTooltip || '筛选'}</TooltipContent>
      </Tooltip>

      <AppDropdownMenu open={moreMenuOpen()} onOpenChange={setMoreMenuOpen}>
        <Tooltip>
          <TooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={(triggerProps: Record<string, unknown>) => (
                <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                  <MoreIcon class="h-4 w-4" />
                  <span class="sr-only">更多</span>
                </AppDropdownMenuIconTrigger>
              )}
            />
          </TooltipTrigger>
          <TooltipContent>更多</TooltipContent>
        </Tooltip>
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
