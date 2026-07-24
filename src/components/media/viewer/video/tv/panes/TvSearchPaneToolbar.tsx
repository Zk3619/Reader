/**
 * 影视搜索页操作区：可展开搜索 + 刷新 + 更多（结果过滤）
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
import { ExpandableIconSearch } from '@/components/shared/ExpandableIconSearch';
import { MoreIcon, RefreshIcon } from '@/components/shared/icons';
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
  let previousSection: string | null = null;

  createEffect(() => {
    const section = getTvHubState().section;
    if (section === 'search' && previousSection !== 'search') {
      if (state.keyword.trim()) setSearchExpanded(true);
    }
    previousSection = section;
  });

  return (
    <>
      <ExpandableIconSearch
        value={state.keyword}
        onValueChange={setTvSearchKeyword}
        onSearch={(v) => void submitTvSearch(v)}
        placeholder="输入片名"
        tooltip="搜索"
        aria-label="搜索影视"
        expanded={searchExpanded()}
        onExpandedChange={setSearchExpanded}
      />

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
