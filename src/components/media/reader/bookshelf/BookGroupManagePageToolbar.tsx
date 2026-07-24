/**
 * 分组管理页 PageToolbar 操作区：搜索、添加分组、更多
 */

import { createSignal, onMount } from 'solid-js';
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
  FolderPlusIcon,
  ChevronLeftIcon,
} from '@/components/shared/icons';
import type { SearchMode } from '@/lib/search/search-prefs';

function MenuRadioIndicator(props: { selected: boolean }) {
  return (
    <span
      class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary pointer-events-none"
      aria-hidden
    >
      <span class={props.selected ? 'h-2 w-2 rounded-full bg-primary' : 'hidden'} />
    </span>
  );
}

export interface BookGroupManagePageToolbarProps {
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  searchMode?: SearchMode;
  onSearchModeChange?: (mode: SearchMode) => void;
  coverClickPreview?: boolean;
  onCoverClickPreviewChange?: (value: boolean) => void;
  enableDragSort?: boolean;
  onEnableDragSortChange?: (value: boolean) => void;
  onAdd: () => void;
}

export function BookGroupManageToolbarLeading(props: { onBack: () => void }) {
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

export function BookGroupManagePageToolbar(props: BookGroupManagePageToolbarProps) {
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
        placeholder="搜索分组"
        tooltip="搜索"
        aria-label="搜索分组"
      />

      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          type="button"
          onClick={props.onAdd}
        >
          <FolderPlusIcon class="h-4 w-4" />
          <span class="sr-only">添加分组</span>
        </AppTooltipTrigger>
        <AppTooltipContent>添加分组</AppTooltipContent>
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
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );
}
