/**
 * 发现页书源切换：对齐书架分组下拉 / 标签样式
 */

import { For, Show, type JSX } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppDropdownMenuItem } from '@/components/shared/AppDropdownMenu';
import { cn } from '@/lib/utils';
import { pageToolbarBelowScrollTrack } from '@/lib/ui/viewport-classes';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import type { GroupStyle } from '@/stores/bookshelf-layout';
import type { BookSource } from '@/types';

const sourceMenuItemClass = 'min-h-12 cursor-pointer gap-3 rounded-md px-0 py-2';

function ExploreSourceMenuList(props: {
  sources: BookSource[];
  currentSourceUrl?: string | null;
  onSourceChange?: (source: BookSource) => void;
}) {
  return (
    <For each={props.sources}>
      {(s) => (
        <AppDropdownMenuItem
          class={cn(
            sourceMenuItemClass,
            props.currentSourceUrl === s.sourceUrl && 'bg-accent/50',
          )}
          onSelect={() => props.onSourceChange?.(s)}
        >
          <div class="min-w-0 flex-1 space-y-0.5 py-0.5 text-left">
            <span class="block truncate text-sm font-medium">{s.sourceName}</span>
            <Show when={s.sourceGroup?.trim()}>
              <span class="block truncate text-xs leading-snug text-muted-foreground">
                {s.sourceGroup}
              </span>
            </Show>
          </div>
        </AppDropdownMenuItem>
      )}
    </For>
  );
}

export interface ExploreSourceTitleDropdownProps {
  title: string;
  description?: string | JSX.Element;
  sources: BookSource[];
  currentSourceUrl?: string | null;
  onSourceChange?: (source: BookSource) => void;
  dropdownEnabled?: boolean;
}

export function ExploreSourceTitleDropdown(props: ExploreSourceTitleDropdownProps) {
  return (
    <PageToolbarTitleDropdown
      title={props.title}
      description={props.description}
      dropdownEnabled={props.dropdownEnabled ?? props.sources.length > 0}
      selectionKey={props.currentSourceUrl ?? 'none'}
      contentLayout="titleWide"
    >
      <ExploreSourceMenuList
        sources={props.sources}
        currentSourceUrl={props.currentSourceUrl}
        onSourceChange={props.onSourceChange}
      />
    </PageToolbarTitleDropdown>
  );
}

export interface ExploreSourceNavProps {
  groupStyle?: GroupStyle;
  sources?: BookSource[];
  currentSourceUrl?: string | null;
  onSourceChange?: (source: BookSource) => void;
}

export function ExploreSourceNav(props: ExploreSourceNavProps) {
  return (
    <Show when={props.groupStyle === 'tabs' && props.sources && props.sources.length > 0}>
      <div class={pageToolbarBelowScrollTrack}>
        <For each={props.sources}>
          {(s) => {
            const active = () => props.currentSourceUrl === s.sourceUrl;
            return (
              <Button
                variant={active() ? 'default' : 'ghost'}
                size="sm"
                class={cn(
                  'shrink-0 whitespace-nowrap px-3 py-1 text-sm',
                  !active() && 'text-muted-foreground',
                )}
                onClick={() => props.onSourceChange?.(s)}
              >
                {s.sourceName}
              </Button>
            );
          }}
        </For>
      </div>
    </Show>
  );
}
