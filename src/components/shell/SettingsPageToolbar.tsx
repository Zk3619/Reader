/**
 * 设置页操作区：搜索与帮助
 */

import { createSignal, createEffect, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SearchIcon, ChevronLeftIcon, XIcon, BookInfoIcon } from '@/components/shared/icons';

export interface SettingsPageToolbarProps {
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
}

export function SettingsToolbarLeading(props: { onBack: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        as={Button}
        variant="ghost"
        size="icon"
        class="h-9 w-9 shrink-0"
        onClick={props.onBack}
        aria-label="返回设置"
        type="button"
      >
        <ChevronLeftIcon class="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent>返回设置</TooltipContent>
    </Tooltip>
  );
}

export function SettingsPageToolbar(props: SettingsPageToolbarProps) {
  const [searchExpanded, setSearchExpanded] = createSignal(false);
  const searchQueryRef: { current: string } = { current: '' };

  createEffect(() => {
    searchQueryRef.current = props.searchQuery ?? '';
    if ((props.searchQuery ?? '').trim()) {
      setSearchExpanded(true);
    }
  });

  return (
    <div class="flex items-center gap-1">
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
              aria-label="搜索设置"
              type="button"
            >
              <SearchIcon class="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>搜索设置</TooltipContent>
          </Tooltip>
        }
      >
        <div class="relative flex h-9 w-40 items-center rounded-md border border-input bg-transparent text-sm sm:w-52">
          <SearchIcon class="pointer-events-none absolute left-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            role="search"
            inputMode="search"
            enterkeyhint="search"
            placeholder="搜索设置项…"
            value={props.searchQuery ?? ''}
            onInput={(e) => {
              const v = e.currentTarget.value;
              searchQueryRef.current = v;
              props.onSearchQueryChange?.(v);
            }}
            onBlur={() => {
              if (!searchQueryRef.current.trim()) {
                setSearchExpanded(false);
              }
            }}
            class="h-full w-full flex-1 rounded-md bg-transparent py-2 pl-9 pr-8 placeholder:text-muted-foreground focus-visible:outline-none"
            aria-label="搜索设置项"
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

      <Tooltip>
        <TooltipTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9">
          <BookInfoIcon class="h-4 w-4" />
          <span class="sr-only">帮助</span>
        </TooltipTrigger>
        <TooltipContent>帮助</TooltipContent>
      </Tooltip>
    </div>
  );
}
