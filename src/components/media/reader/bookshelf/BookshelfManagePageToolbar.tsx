/**
 * 书架管理页 PageToolbar 操作区：搜索、筛选、更多
 */

import { createSignal, onMount, Show } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { ExpandableIconSearch } from '@/components/shared/ExpandableIconSearch';
import {
  MoreIcon,
  FilterIcon,
  DownloadIcon,
  ChevronLeftIcon,
} from '@/components/shared/icons';
import type { SearchMode } from '@/lib/search/search-prefs';

export interface BookshelfManagePageToolbarProps {
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  searchMode?: SearchMode;
  onSearchModeChange?: (mode: SearchMode) => void;
  showFilterButton?: boolean;
  filterTooltip?: string;
  onOpenFilterDialog?: () => void;
  filterByBookGroup?: boolean;
  onFilterByBookGroupChange?: (value: boolean) => void;
  filterBySource?: boolean;
  onFilterBySourceChange?: (value: boolean) => void;
  openBookInfoByClickTitle?: boolean;
  onOpenBookInfoByClickTitleChange?: (value: boolean) => void;
  coverClickPreview?: boolean;
  onCoverClickPreviewChange?: (value: boolean) => void;
  enableDragSort?: boolean;
  onEnableDragSortChange?: (value: boolean) => void;
  onExportAllUseBookSource?: () => void;
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

export function BookshelfManageToolbarLeading(props: { onBack: () => void }) {
  return (
    <AppTooltip>
      <AppTooltipTrigger
        as={Button}
        variant="ghost"
        size="icon"
        class="h-9 w-9 shrink-0"
        onClick={props.onBack}
        aria-label="返回书架"
        type="button"
      >
        <ChevronLeftIcon class="h-4 w-4" />
      </AppTooltipTrigger>
      <AppTooltipContent>返回书架</AppTooltipContent>
    </AppTooltip>
  );
}

export function BookshelfManagePageToolbar(props: BookshelfManagePageToolbarProps) {
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
        value={props.searchQuery ?? ''}
        onValueChange={(v) => props.onSearchQueryChange?.(v)}
        placeholder="搜索书籍"
        tooltip="搜索"
        aria-label="搜索书籍"
      />

      <Show when={props.showFilterButton}>
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
      </Show>

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
          <AppDropdownMenuItem
            onSelect={() => {
              setMoreMenuOpen(false);
              blurActiveElement();
              props.onExportAllUseBookSource?.();
            }}
          >
            <DownloadIcon class="h-4 w-4" />
            <span>导出所有书的书源</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => props.onFilterByBookGroupChange?.(!props.filterByBookGroup)}
            class="flex items-center gap-2"
          >
            <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
              <Checkbox checked={!!props.filterByBookGroup} aria-label="按分组筛选" />
            </span>
            <span>按分组筛选</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => props.onFilterBySourceChange?.(!props.filterBySource)}
            class="flex items-center gap-2"
          >
            <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
              <Checkbox checked={!!props.filterBySource} aria-label="按来源筛选" />
            </span>
            <span>按来源筛选</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() =>
              props.onOpenBookInfoByClickTitleChange?.(!props.openBookInfoByClickTitle)
            }
            class="flex items-center gap-2"
          >
            <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
              <Checkbox
                checked={!!props.openBookInfoByClickTitle}
                aria-label="点击书名打开详情"
              />
            </span>
            <span>点击书名打开详情</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => props.onCoverClickPreviewChange?.(!props.coverClickPreview)}
            class="flex items-center gap-2"
          >
            <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
              <Checkbox checked={!!props.coverClickPreview} aria-label="封面点击预览" />
            </span>
            <span>封面点击预览</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => props.onEnableDragSortChange?.(!props.enableDragSort)}
            class="flex items-center gap-2"
          >
            <span class="flex h-4 w-4 shrink-0 items-center justify-center pointer-events-none">
              <Checkbox checked={!!props.enableDragSort} aria-label="拖拽排序" />
            </span>
            <span>拖拽排序</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => props.onSearchModeChange?.('name')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={(props.searchMode ?? 'name') === 'name'} />
            <span>常规搜索</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => props.onSearchModeChange?.('fuzzy')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={props.searchMode === 'fuzzy'} />
            <span>模糊搜索</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => props.onSearchModeChange?.('extended')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={props.searchMode === 'extended'} />
            <span>扩展搜索规则</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );
}
