/**
 * 订阅页操作区：可展开搜索、历史记录、收藏、分组筛选、更多
 */

import { createSignal, createEffect, onMount, Show } from 'solid-js';
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
import {
  SearchIcon,
  FilterIcon,
  MoreIcon,
  XIcon,
  RecordIcon,
  StarIcon,
  Settings2Icon,
  ListIcon,
  LayoutIcon,
  LinkIcon,
} from '@/components/shared/icons';
import type { RssLayoutMode, SearchMode } from '@/lib/search/search-prefs';
import { cn } from '@/lib/utils';

export interface RssPageToolbarProps {
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  onOpenHistory?: () => void;
  onOpenFavorites?: () => void;
  onOpenFilter?: () => void;
  onOpenManage?: () => void;
  onOpenRuleSub?: () => void;
  filterActive?: boolean;
  layoutMode?: RssLayoutMode;
  onLayoutModeChange?: (mode: RssLayoutMode) => void;
  searchMode?: SearchMode;
  onSearchModeChange?: (mode: SearchMode) => void;
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

export function RssPageToolbar(props: RssPageToolbarProps) {
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
          <AppTooltip>
            <AppTooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-9 w-9 shrink-0"
              onClick={() => setSearchExpanded(true)}
            >
              <SearchIcon class="h-4 w-4" />
              <span class="sr-only">搜索</span>
            </AppTooltipTrigger>
            <AppTooltipContent>搜索</AppTooltipContent>
          </AppTooltip>
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

      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          type="button"
          onClick={() => props.onOpenHistory?.()}
        >
          <RecordIcon class="h-4 w-4" />
          <span class="sr-only">历史记录</span>
        </AppTooltipTrigger>
        <AppTooltipContent>历史记录</AppTooltipContent>
      </AppTooltip>

      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          type="button"
          onClick={() => props.onOpenFavorites?.()}
        >
          <StarIcon class="h-4 w-4" />
          <span class="sr-only">收藏</span>
        </AppTooltipTrigger>
        <AppTooltipContent>收藏</AppTooltipContent>
      </AppTooltip>

      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          type="button"
          onClick={() => props.onOpenFilter?.()}
        >
          <FilterIcon class={cn('h-4 w-4', props.filterActive && 'text-primary')} />
          <span class="sr-only">筛选</span>
        </AppTooltipTrigger>
        <AppTooltipContent>筛选</AppTooltipContent>
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
          <AppDropdownMenuItem onSelect={() => props.onOpenManage?.()}>
            <Settings2Icon class="h-4 w-4" />
            <span>订阅源管理</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => props.onOpenRuleSub?.()}>
            <LinkIcon class="h-4 w-4" />
            <span>规则订阅</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
          <AppDropdownMenuItem
            onSelect={() => props.onLayoutModeChange?.('list')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={(props.layoutMode ?? 'list') === 'list'} />
            <ListIcon class="h-4 w-4" />
            <span>列表布局</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem
            onSelect={() => props.onLayoutModeChange?.('grid')}
            class="flex items-center gap-2"
          >
            <MenuRadioIndicator selected={props.layoutMode === 'grid'} />
            <LayoutIcon class="h-4 w-4" />
            <span>网格布局</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuSeparator />
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
            <span>扩展搜索</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );
}
