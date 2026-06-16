/**
 * 订阅主页订阅源列表：列表 / 网格虚拟滚动
 */

import { createEffect, createMemo, createSignal, onCleanup, Show, type Accessor, type JSX } from 'solid-js';
import {
  VirtualGridRowsList,
  VirtualList,
  useVirtualGridContainerWidth,
} from '@/components/shared/virtual-list';
import type { RssLayoutMode } from '@/lib/search/search-prefs';
import type { RssSource } from '@/types';
import { cn } from '@/lib/utils';

const RSS_LIST_ROW_HEIGHT_PX = 64;
const RSS_GRID_CARD_WIDTH_PX = 88;
const RSS_GRID_GAP_PX = 12;
const RSS_GRID_ROW_HEIGHT_PX = 120;

function rssGridColCount(containerWidth: number): number {
  if (containerWidth <= 0) return 1;
  return Math.max(
    1,
    Math.floor((containerWidth + RSS_GRID_GAP_PX) / (RSS_GRID_CARD_WIDTH_PX + RSS_GRID_GAP_PX)),
  );
}

export interface VirtualRssSourceListProps {
  sources: Accessor<readonly RssSource[]>;
  layoutMode: Accessor<RssLayoutMode>;
  class?: string;
  externalScrollElement?: Accessor<HTMLDivElement | null | undefined>;
  renderListItem: (source: RssSource) => JSX.Element;
  renderGridItem: (source: RssSource) => JSX.Element;
}

export function VirtualRssSourceList(props: VirtualRssSourceListProps) {
  const items = () => props.sources();
  const isGrid = () => props.layoutMode() === 'grid';

  const [scrollRoot, setScrollRoot] = createSignal<HTMLDivElement | undefined>();
  const scrollContainer = () => props.externalScrollElement?.() ?? scrollRoot();
  const containerWidth = useVirtualGridContainerWidth(scrollContainer);
  const colCount = createMemo(() => (isGrid() ? rssGridColCount(containerWidth()) : 1));

  createEffect(() => {
    const el = scrollContainer();
    if (!el) return;
    el.style.setProperty('--rss-grid-row-gap', `${RSS_GRID_GAP_PX}px`);
    onCleanup(() => el.style.removeProperty('--rss-grid-row-gap'));
  });

  return (
    <Show
      when={isGrid()}
      fallback={
        <VirtualList<RssSource>
          class={cn('min-h-0 flex-1', props.class)}
          listInnerClass="space-y-2 py-2"
          items={items}
          estimateSize={RSS_LIST_ROW_HEIGHT_PX}
          overscan={8}
          externalScrollElement={props.externalScrollElement}
          getItemKey={(source) => source.sourceUrl}
          onScrollContainer={setScrollRoot}
        >
          {(source) => props.renderListItem(source)}
        </VirtualList>
      }
    >
      <VirtualGridRowsList<RssSource>
        items={items}
        colCount={colCount}
        rowHeightMode="responsive"
        estimateRowSize={RSS_GRID_ROW_HEIGHT_PX}
        responsiveRowHeight={{
          estimateRowHeight: () => RSS_GRID_ROW_HEIGHT_PX,
        }}
        rowGapCssVar="rss-grid-row-gap"
        getInterRowGapPx={() => RSS_GRID_GAP_PX}
        class={cn('min-h-0 flex-1', props.class)}
        listInnerClass="py-2"
        gridClass="grid gap-3"
        overscan={3}
        externalScrollElement={props.externalScrollElement}
        getItemKey={(source) => source.sourceUrl}
        onScrollContainer={setScrollRoot}
      >
        {(source) => (
          <div class="flex min-w-0 justify-center">
            {props.renderGridItem(source)}
          </div>
        )}
      </VirtualGridRowsList>
    </Show>
  );
}
