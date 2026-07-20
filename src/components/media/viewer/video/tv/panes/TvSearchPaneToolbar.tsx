/**
 * 影视搜索页操作区：可展开搜索 + 刷新 + 更多（结果过滤）
 * 布局对齐音乐模块 MusicSearchPaneToolbar
 */

import { For, Show, createEffect, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { MoreIcon, RefreshIcon, SearchIcon, XIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import { getTvHubState } from '@/stores/tv-hub/section';
import {
  getTvSearchState,
  setTvSearchKeyword,
  setTvSearchMatchMode,
  submitTvSearch,
  type TvSearchMatchMode,
} from '@/stores/tv-hub/detail';

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

const MATCH_MODE_OPTIONS: Array<{ value: TvSearchMatchMode; label: string; hint: string }> = [
  { value: 'normal', label: '常规搜索', hint: '保留接口全部结果' },
  { value: 'exact', label: '精确搜索', hint: '片名须包含完整关键词' },
  { value: 'fuzzy', label: '模糊搜索', hint: '关键词字符按序出现在片名中' },
];

export function TvSearchPaneToolbar() {
  const state = getTvSearchState();
  const [moreOpen, setMoreOpen] = createSignal(false);
  const [searchExpanded, setSearchExpanded] = createSignal(false);
  const [searchInputEl, setSearchInputEl] = createSignal<HTMLInputElement | undefined>();
  const searchQueryRef: { current: string } = { current: '' };
  let blurCloseTimer: ReturnType<typeof setTimeout> | null = null;
  let previousSection: string | null = null;

  const expandSearch = () => {
    setSearchExpanded(true);
    queueMicrotask(() => searchInputEl()?.focus());
  };

  createEffect(() => {
    const section = getTvHubState().section;
    if (section === 'search' && previousSection !== 'search') {
      if (state.keyword.trim()) setSearchExpanded(true);
    }
    previousSection = section;
  });

  createEffect(() => {
    searchQueryRef.current = state.keyword;
    if (state.keyword.trim()) setSearchExpanded(true);
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
              onClick={expandSearch}
            >
              <SearchIcon class="h-4 w-4" />
              <span class="sr-only">搜索</span>
            </AppTooltipTrigger>
            <AppTooltipContent>搜索</AppTooltipContent>
          </AppTooltip>
        }
      >
        <div class="relative z-30 w-40 sm:w-56 overflow-visible">
          <div class="relative flex h-9 w-full items-center rounded-md border border-input bg-background text-sm">
            <SearchIcon class="pointer-events-none absolute left-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={(el) => {
                setSearchInputEl(el);
                if (el && searchExpanded()) {
                  requestAnimationFrame(() => {
                    el.focus();
                    const len = el.value.length;
                    el.setSelectionRange(len, len);
                  });
                }
              }}
              type="text"
              placeholder="输入片名"
              value={state.keyword}
              onInput={(e) => {
                const value = e.currentTarget.value;
                searchQueryRef.current = value;
                setTvSearchKeyword(value);
              }}
              onFocus={() => {
                if (blurCloseTimer) {
                  clearTimeout(blurCloseTimer);
                  blurCloseTimer = null;
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  if (!searchQueryRef.current.trim()) {
                    setSearchExpanded(false);
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                  return;
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitTvSearch(searchQueryRef.current);
                }
              }}
              onBlur={() => {
                blurCloseTimer = setTimeout(() => {
                  if (!searchQueryRef.current.trim()) setSearchExpanded(false);
                  blurCloseTimer = null;
                }, 180);
              }}
              class="h-full w-full flex-1 rounded-md bg-transparent py-2 pl-9 pr-8 placeholder:text-muted-foreground focus-visible:outline-none"
              aria-label="搜索影视"
            />
            <Show when={state.keyword.length > 0}>
              <button
                type="button"
                class="absolute right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="清除搜索内容"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  searchQueryRef.current = '';
                  setTvSearchKeyword('');
                  setSearchExpanded(false);
                }}
              >
                <XIcon class="h-3.5 w-3.5" />
              </button>
            </Show>
          </div>
        </div>
      </Show>

      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class="h-9 w-9 shrink-0"
          disabled={state.loading || !state.keyword.trim()}
          onClick={() => void submitTvSearch()}
        >
          <RefreshIcon class={cn('h-4 w-4', state.loading && 'animate-spin')} />
          <span class="sr-only">刷新</span>
        </AppTooltipTrigger>
        <AppTooltipContent>刷新</AppTooltipContent>
      </AppTooltip>

      <AppDropdownMenu open={moreOpen()} onOpenChange={setMoreOpen}>
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
          <AppTooltipContent>搜索过滤</AppTooltipContent>
        </AppTooltip>
        <AppDropdownMenuContent layout="compact" class="min-w-48">
          <AppDropdownMenuItem class="pointer-events-none text-xs text-muted-foreground">
            结果过滤
          </AppDropdownMenuItem>
          <For each={MATCH_MODE_OPTIONS}>
            {(opt) => (
              <AppDropdownMenuItem
                onSelect={() => setTvSearchMatchMode(opt.value)}
                class="flex flex-col items-start gap-0.5"
              >
                <span class="flex w-full items-center gap-2">
                  <MenuRadioIndicator selected={state.matchMode === opt.value} />
                  <span>{opt.label}</span>
                </span>
                <span class="pl-6 text-[11px] text-muted-foreground">{opt.hint}</span>
              </AppDropdownMenuItem>
            )}
          </For>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );
}
