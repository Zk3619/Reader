/**
 * 探索页书源弹窗：搜索 + 虚拟列表（书源名、分组）
 */

import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { VirtualChapterList } from '@/components/media/reader/books/VirtualChapterList';
import { SearchIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import { dialogVirtualListPanelWidth } from '@/lib/ui/viewport-classes';
import type { BookSource } from '@/types';

const ROW_HEIGHT = 52;
const LIST_ITEM_CLASS =
  'flex min-h-[3.25rem] w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40';

export interface ExploreSourcePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: BookSource[];
  currentSourceUrl?: string | null;
  onSourceChange?: (source: BookSource) => void;
}

function filterSources(sources: BookSource[], query: string): BookSource[] {
  const q = query.trim().toLowerCase();
  if (!q) return sources;
  return sources.filter((s) => {
    const hay = `${s.sourceName}\n${s.sourceGroup ?? ''}\n${s.sourceUrl}`.toLowerCase();
    return hay.includes(q);
  });
}

export function ExploreSourcePickerDialog(props: ExploreSourcePickerDialogProps) {
  const [searchQuery, setSearchQuery] = createSignal('');

  createEffect(() => {
    if (!props.open) setSearchQuery('');
  });

  const filteredSources = createMemo(() => filterSources(props.sources, searchQuery()));

  function handlePick(source: BookSource) {
    props.onSourceChange?.(source);
    props.onOpenChange(false);
  }

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent
        layout="app"
        class={cn(
          dialogVirtualListPanelWidth,
          'flex h-[min(85dvh,560px)] flex-col gap-0 overflow-hidden p-0',
        )}
      >
        <AppDialogHeader class="shrink-0 px-6 pt-6">
          <AppDialogTitle>选择书源</AppDialogTitle>
          <AppDialogDescription class="text-sm text-muted-foreground">
            共 {props.sources.length} 个可探索书源
          </AppDialogDescription>
        </AppDialogHeader>

        <div class="shrink-0 border-b border-border/50 px-4 py-3">
          <div class="relative flex min-w-0 items-center">
            <SearchIcon class="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="搜索书源名或分组"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              class="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div class="flex min-h-0 flex-1 flex-col overflow-hidden pb-4">
          <Show when={filteredSources().length === 0}>
            <p class="px-4 py-8 text-center text-sm text-muted-foreground">
              {searchQuery().trim() ? '无匹配书源' : '暂无可用书源'}
            </p>
          </Show>
          <Show when={filteredSources().length > 0}>
            <VirtualChapterList
              class="min-h-0 flex-1 px-2 py-1"
              count={filteredSources().length}
              rowHeight={ROW_HEIGHT}
            >
              {(index) => {
                const source = () => filteredSources()[index];
                const selected = () => props.currentSourceUrl === source()?.sourceUrl;
                return (
                  <button
                    type="button"
                    class={cn(LIST_ITEM_CLASS, selected() && 'bg-accent/50')}
                    onClick={() => {
                      const s = source();
                      if (s) handlePick(s);
                    }}
                  >
                    <div class="min-w-0 flex-1 space-y-0.5">
                      <span class="block truncate font-medium">{source()?.sourceName}</span>
                      <Show when={source()?.sourceGroup?.trim()}>
                        <span class="block truncate text-xs leading-snug text-muted-foreground">
                          {source()?.sourceGroup}
                        </span>
                      </Show>
                    </div>
                  </button>
                );
              }}
            </VirtualChapterList>
          </Show>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}
