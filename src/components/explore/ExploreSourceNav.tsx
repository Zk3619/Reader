/**
 * 发现页书源切换：对齐书架分组下拉 / 标签样式
 */

import { For, Show, createSignal, type JSX } from 'solid-js';
import { AppDropdownMenuItem } from '@/components/shared/AppDropdownMenu';
import {
  ExploreScrollTabsBar,
  ExploreTabsTrigger,
  exploreTabsTriggerClass,
} from '@/components/explore/ExploreScrollTabsBar';
import { ExploreSourcePickerDialog } from '@/components/explore/ExploreSourcePickerDialog';
import { cn } from '@/lib/utils';
import { pageToolbarBelowScrollTrack } from '@/lib/ui/viewport-classes';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { PageToolbarTitleText } from '@/components/shell/PageToolbar';
import { Button } from '@/components/ui/button';
import { ChevronDownIcon } from '@/components/shared/icons';
import type { GroupStyle } from '@/stores/bookshelf-layout';
import type { BookSource } from '@/types';
import {
  EXPLORE_SOURCE_TAB_PREFIX,
  exploreSourceTabValue,
  parseExploreIndexedTabValue,
} from '@/lib/explore/explore-tab-values';

const sourceMenuItemClass = 'min-h-12 cursor-pointer gap-3 rounded-md px-0 py-2';
const TITLE_BLOCK_PADDING = 'rounded-md px-2.5 py-2';
const TITLE_PICKER_TRIGGER_CLASS = cn(
  'group/trigger grid min-w-0 max-w-full w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2',
  'h-auto bg-transparent text-left font-normal',
  TITLE_BLOCK_PADDING,
  'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

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

export interface ExploreSourceTitlePickerProps {
  title: string;
  description?: string | JSX.Element;
  sources: BookSource[];
  currentSourceUrl?: string | null;
  onSourceChange?: (source: BookSource) => void;
  /** 为 false 时仅展示标题+描述 */
  pickerEnabled?: boolean;
}

/** 标题区触发书源弹窗（布局偏好为「书源弹窗」时使用） */
export function ExploreSourceTitlePicker(props: ExploreSourceTitlePickerProps) {
  const [open, setOpen] = createSignal(false);
  const pickerEnabled = () => props.pickerEnabled ?? props.sources.length > 0;

  return (
    <Show
      when={pickerEnabled()}
      fallback={
        <div class={cn('min-w-0 max-w-full overflow-hidden', TITLE_BLOCK_PADDING)}>
          <PageToolbarTitleText title={props.title} description={props.description} />
        </div>
      }
    >
      <>
        <Button
          variant="ghost"
          class={TITLE_PICKER_TRIGGER_CLASS}
          aria-haspopup="dialog"
          aria-expanded={open() ? 'true' : 'false'}
          aria-label={`选择书源：${props.title}`}
          title={props.title}
          onClick={() => setOpen(true)}
        >
          <PageToolbarTitleText title={props.title} description={props.description} />
          <span class="flex shrink-0 items-center justify-center self-center" aria-hidden="true">
            <ChevronDownIcon class="size-3 shrink-0" size={12} />
          </span>
        </Button>
        <ExploreSourcePickerDialog
          open={open()}
          onOpenChange={setOpen}
          sources={props.sources}
          currentSourceUrl={props.currentSourceUrl}
          onSourceChange={props.onSourceChange}
        />
      </>
    </Show>
  );
}

export interface ExploreSourceNavProps {
  groupStyle?: GroupStyle;
  sources?: BookSource[];
  currentSourceUrl?: string | null;
  onSourceChange?: (source: BookSource) => void;
}

/** 标签内容轨；横滚视口在父级 PageToolbar `.page-toolbar-below-scroll` */
export function ExploreSourceNav(props: ExploreSourceNavProps) {
  const sources = () => props.sources ?? [];

  const currentIndex = () => {
    const url = props.currentSourceUrl;
    if (!url) return 0;
    const idx = sources().findIndex((s) => s.sourceUrl === url);
    return idx >= 0 ? idx : 0;
  };

  return (
    <Show when={props.groupStyle === 'tabs' && sources().length > 0}>
      <div class={pageToolbarBelowScrollTrack}>
        <ExploreScrollTabsBar
          embedded
          value={exploreSourceTabValue(currentIndex())}
          onChange={(value) => {
            const idx = parseExploreIndexedTabValue(value, EXPLORE_SOURCE_TAB_PREFIX);
            if (idx == null) return;
            const next = sources()[idx];
            if (next) props.onSourceChange?.(next);
          }}
        >
          <For each={sources()}>
            {(s, index) => (
              <ExploreTabsTrigger
                value={exploreSourceTabValue(index())}
                class={exploreTabsTriggerClass}
                title={s.sourceName}
              >
                {s.sourceName}
              </ExploreTabsTrigger>
            )}
          </For>
        </ExploreScrollTabsBar>
      </div>
    </Show>
  );
}
