/**
 * 书源管理页 PageToolbar 操作区：搜索、排序、筛选、更多
 */

import { createSignal, createEffect, onMount, Show } from 'solid-js';
import { blurActiveElement, openAppDialogAfterMenuDismiss } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
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
  QrCodeIcon,
  FolderTreeIcon,
  ChevronLeftIcon,
  XIcon,
} from '@/components/shared/icons';
import {
  SourcesSortDropdown,
  type SourcesSortOption,
} from '@/components/sources/SourcesSortDropdown';
import type { SourceSortMode, SourceManageGroupMode } from '@/lib/sources/source-sort';
import type { SourceSearchMode } from '@/lib/sources/source-list-filter';

export interface SourcesManagePageToolbarProps {
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  sortMode: SourceSortMode;
  sortReverse: boolean;
  sortOptions: SourcesSortOption[];
  onSortModeChange: (mode: SourceSortMode) => void;
  onSortReverseChange: (reverse: boolean) => void;
  filterTooltip?: string;
  onOpenFilterDialog?: () => void;
  groupMode: SourceManageGroupMode;
  onGroupModeChange: (mode: SourceManageGroupMode) => void;
  sourceSearchMode?: SourceSearchMode;
  onSourceSearchModeChange?: (mode: SourceSearchMode) => void;
  onSourcesNew?: () => void;
  onSourcesImportLocal?: () => void;
  onSourcesImportNetwork?: () => void;
  onSourcesImportQR?: () => void;
  showSourcesImportQR?: boolean;
  onOpenSourceGroupManage?: () => void;
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

export function SourcesManageToolbarLeading(props: { onBack: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        as={Button}
        variant="ghost"
        size="icon"
        class="h-9 w-9 shrink-0"
        onClick={props.onBack}
        aria-label="返回书源"
        type="button"
      >
        <ChevronLeftIcon class="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent>返回书源</TooltipContent>
    </Tooltip>
  );
}

export function SourcesManagePageToolbar(props: SourcesManagePageToolbarProps) {
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
            placeholder="搜索书源"
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
            aria-label="搜索书源"
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
        options={props.sortOptions}
        onSortModeChange={props.onSortModeChange}
        onSortReverseChange={props.onSortReverseChange}
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
          <AppDropdownMenuItem onSelect={() => props.onSourcesNew?.()}>
            <FileTextIcon class="h-4 w-4" />
            <span>新建书源</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => openAppDialogAfterMenuDismiss(() => props.onSourcesImportLocal?.())}
          >
            <FolderPlusIcon class="h-4 w-4" />
            <span>本地导入</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => openAppDialogAfterMenuDismiss(() => props.onSourcesImportNetwork?.())}
          >
            <LinkIcon class="h-4 w-4" />
            <span>网络导入</span>
          </AppDropdownMenuItem>
          <Show when={props.showSourcesImportQR}>
            <AppDropdownMenuItem
              onSelect={() => openAppDialogAfterMenuDismiss(() => props.onSourcesImportQR?.())}
            >
              <QrCodeIcon class="h-4 w-4" />
              <span>二维码导入</span>
            </AppDropdownMenuItem>
          </Show>
          <AppDropdownMenuItem onSelect={() => props.onOpenSourceGroupManage?.()}>
            <FolderTreeIcon class="h-4 w-4" />
            <span>分组管理</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => props.onGroupModeChange('by-group')}
            class="flex items-center gap-2"
          >
            <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
              <Checkbox
                checked={props.groupMode === 'by-group'}
                aria-label="按书源分组显示"
              />
            </span>
            <span>按书源分组显示</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => props.onGroupModeChange('by-domain')}
            class="flex items-center gap-2"
          >
            <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
              <Checkbox
                checked={props.groupMode === 'by-domain'}
                aria-label="按域名分组显示"
              />
            </span>
            <span>按域名分组显示</span>
          </AppDropdownMenuItem>
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
