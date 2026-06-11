/**
 * 订阅源管理页操作区：搜索、排序、筛选、更多
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
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  SearchIcon,
  MoreIcon,
  FilterIcon,
  FileTextIcon,
  FolderPlusIcon,
  LinkIcon,
  ScanQrCodeIcon,
  ChevronLeftIcon,
  XIcon,
} from '@/components/shared/icons';
import { SourcesSortDropdown } from '@/components/sources/SourcesSortDropdown';
import { RSS_MANAGE_SORT_OPTIONS, type SourceSortMode } from '@/lib/sources/source-sort';
import { cn } from '@/lib/utils';

export interface RssSourcesManagePageToolbarProps {
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  sortMode: SourceSortMode;
  sortReverse: boolean;
  onSortModeChange: (mode: SourceSortMode) => void;
  onSortReverseChange: (reverse: boolean) => void;
  filterTooltip?: string;
  filterActive?: boolean;
  onOpenFilterDialog?: () => void;
  onSourcesNew?: () => void;
  onSourcesImportLocal?: () => void;
  onSourcesImportNetwork?: () => void;
  onSourcesImportQR?: () => void;
  enableDragSort?: boolean;
  onEnableDragSortChange?: (value: boolean) => void;
}

export function RssSourcesManageToolbarLeading(props: { onBack: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        as={Button}
        variant="ghost"
        size="icon"
        class="h-9 w-9 shrink-0"
        onClick={props.onBack}
        aria-label="返回订阅"
        type="button"
      >
        <ChevronLeftIcon class="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent>返回订阅</TooltipContent>
    </Tooltip>
  );
}

export function RssSourcesManagePageToolbar(props: RssSourcesManagePageToolbarProps) {
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false);
  const [searchExpanded, setSearchExpanded] = createSignal(false);
  const searchQueryRef: { current: string } = { current: '' };

  createEffect(() => {
    searchQueryRef.current = props.searchQuery ?? '';
    if ((props.searchQuery ?? '').trim()) setSearchExpanded(true);
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
        when={searchExpanded()}
        fallback={
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-9 w-9 shrink-0"
              onClick={() => setSearchExpanded(true)}
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
            placeholder="搜索订阅源"
            value={props.searchQuery ?? ''}
            onInput={(e) => {
              const v = e.currentTarget.value;
              searchQueryRef.current = v;
              props.onSearchQueryChange?.(v);
            }}
            onBlur={() => {
              if (!searchQueryRef.current.trim()) setSearchExpanded(false);
            }}
            class="h-full w-full flex-1 bg-transparent pl-9 pr-8 py-2 placeholder:text-muted-foreground focus-visible:outline-none rounded-md"
            aria-label="搜索订阅源"
          />
          <Show when={(props.searchQuery ?? '').length > 0}>
            <button
              type="button"
              class="absolute right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="清除搜索内容"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                searchQueryRef.current = '';
                props.onSearchQueryChange?.('');
              }}
            >
              <XIcon class="h-3.5 w-3.5" />
            </button>
          </Show>
        </div>
      </Show>

      <SourcesSortDropdown
        sortMode={props.sortMode}
        sortReverse={props.sortReverse}
        options={RSS_MANAGE_SORT_OPTIONS}
        onSortModeChange={props.onSortModeChange}
        onSortReverseChange={props.onSortReverseChange}
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
          <FilterIcon class={cn('h-4 w-4', props.filterActive && 'text-primary')} />
          <span class="sr-only">分组筛选</span>
        </TooltipTrigger>
        <TooltipContent>{props.filterTooltip || '分组筛选'}</TooltipContent>
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
          <AppDropdownMenuItem onSelect={() => props.onSourcesNew?.()}>
            <FileTextIcon class="h-4 w-4" />
            <span>新建订阅源</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => props.onSourcesImportLocal?.()}>
            <FolderPlusIcon class="h-4 w-4" />
            <span>本地导入</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => props.onSourcesImportNetwork?.()}>
            <LinkIcon class="h-4 w-4" />
            <span>网络导入</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => props.onSourcesImportQR?.()}>
            <ScanQrCodeIcon class="h-4 w-4" />
            <span>二维码导入</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );
}
