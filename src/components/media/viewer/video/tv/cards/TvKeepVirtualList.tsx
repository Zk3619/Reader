/**
 * 影视收藏虚拟列表：标准列表（1/2/3 列）或网格
 */

import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  type Accessor,
  type Component,
  type JSX,
} from 'solid-js';
import {
  VirtualGridRowsList,
} from '@/components/shared/virtual-list';
import { TvVodCard } from '@/components/media/viewer/video/tv/cards/TvVodCard';
import { TvKeepListCard } from '@/components/media/viewer/video/tv/cards/TvKeepListCard';
import {
  BOOKSHELF_LAYOUT_GAP_CLASS,
  bookshelfLayoutGapToRem,
  bookshelfLayoutSpacingToPx,
} from '@/lib/bookshelf/bookshelf-layout-gap';
import {
  getBookshelfListColumnLayout,
  getViewModeGridColumnCount,
  isGridViewMode,
  isListViewMode,
  type ViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import {
  estimateTvVodGridRowHeightPx,
  TV_VOD_LIST_HORIZONTAL_PADDING_PX,
  TV_VOD_ROW_HOVER_PAD_PX,
} from '@/lib/media/tv/tv-vod-list-layout';
import { tvHubContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import { buildTvKeepDisplayMeta } from '@/lib/media/tv/tv-keep-meta';
import type { TvKeepRow } from '@/lib/media/tv/types';
import { getTvKeepUi } from '@/stores/tv-hub/tv-keep-ui';
import { cn } from '@/lib/utils';

export interface TvKeepListItem {
  row: TvKeepRow;
  onOpen: () => void;
  wrapCard?: (card: JSX.Element) => JSX.Element;
  trailing?: JSX.Element;
}

export type TvKeepLayoutUi = {
  viewMode: ViewMode;
  spacing: number;
};

export interface TvKeepVirtualListProps {
  items: Accessor<readonly TvKeepListItem[]> | readonly TvKeepListItem[];
  class?: string;
  listInnerClass?: string;
  layoutUi?: Accessor<TvKeepLayoutUi> | TvKeepLayoutUi;
  onScroll?: (el: HTMLDivElement) => void;
  onScrollContainer?: (el: HTMLDivElement) => void;
  scrollFooter?: JSX.Element;
}

const ROW_GAP_CSS_VAR = 'bookshelf-layout-gap';

/** 横向列表卡行高（封面约 76px + 内边距） */
function estimateKeepListRowHeightPx(): number {
  return TV_VOD_ROW_HOVER_PAD_PX + 76 + 16;
}

export const TvKeepVirtualList: Component<TvKeepVirtualListProps> = (props) => {
  const layout = (): TvKeepLayoutUi => {
    if (props.layoutUi == null) {
      const ui = getTvKeepUi();
      return { viewMode: ui.viewMode, spacing: ui.spacing };
    }
    return typeof props.layoutUi === 'function' ? props.layoutUi() : props.layoutUi;
  };

  const items: Accessor<readonly TvKeepListItem[]> = () =>
    typeof props.items === 'function' ? props.items() : props.items;

  const [scrollRoot, setScrollRoot] = createSignal<HTMLDivElement | undefined>();

  const isGrid = () => isGridViewMode(layout().viewMode);

  const colCount = () => {
    const mode = layout().viewMode;
    if (isGridViewMode(mode)) return getViewModeGridColumnCount(mode);
    if (isListViewMode(mode)) return getBookshelfListColumnLayout(mode);
    return 1;
  };

  const gapPx = () => bookshelfLayoutSpacingToPx(layout().spacing);

  createEffect(() => {
    const el = scrollRoot();
    if (!el) return;
    const gap = bookshelfLayoutGapToRem(layout().spacing);
    el.style.setProperty(`--${ROW_GAP_CSS_VAR}`, gap);
    onCleanup(() => el.style.removeProperty(`--${ROW_GAP_CSS_VAR}`));
  });

  const fixedListRowHeight = createMemo(() => estimateKeepListRowHeightPx());

  const remeasureLayout = () =>
    `${layout().viewMode}|${layout().spacing}|${colCount()}|${isGrid()}`;

  const listInnerClass = () =>
    props.listInnerClass ?? cn(tvHubContentInsetClass, 'px-2 pb-4 pt-1');

  return (
    <VirtualGridRowsList<TvKeepListItem>
      class={cn('min-h-0 flex-1', props.class)}
      items={items}
      colCount={colCount}
      rowHeightMode={isGrid() ? 'responsive' : 'fixed'}
      estimateRowSize={isGrid() ? 280 : fixedListRowHeight}
      responsiveRowHeight={
        isGrid()
          ? {
              getGapPx: () => gapPx(),
              horizontalPaddingPx: TV_VOD_LIST_HORIZONTAL_PADDING_PX,
              estimateRowHeight: (metrics) => estimateTvVodGridRowHeightPx(metrics),
            }
          : undefined
      }
      rowGapCssVar={ROW_GAP_CSS_VAR}
      getInterRowGapPx={gapPx}
      remeasureDeps={remeasureLayout}
      gridClass={cn('grid', BOOKSHELF_LAYOUT_GAP_CLASS)}
      listInnerClass={listInnerClass()}
      overscan={2}
      getItemKey={(item, index) => item.row.key || `keep|${index}`}
      onScrollContainer={(el) => {
        setScrollRoot(el);
        props.onScrollContainer?.(el);
      }}
      onScroll={props.onScroll}
      scrollFooter={props.scrollFooter}
    >
      {(item) => {
        const meta = buildTvKeepDisplayMeta(item.row);
        const card = isGrid() ? (
          <div
            class="flex h-full w-full min-w-0 flex-col justify-end overflow-visible"
            style={{ 'padding-top': `${TV_VOD_ROW_HOVER_PAD_PX}px` }}
          >
            <TvVodCard
              title={item.row.vodName}
              coverUrl={item.row.vodPic?.trim() || undefined}
              badge={meta.badge || undefined}
              onOpen={item.onOpen}
              trailing={item.trailing}
              class="min-h-0 min-w-0 w-full max-w-full flex-1"
            />
          </div>
        ) : (
          <div
            class="flex h-full w-full min-w-0 flex-col justify-end overflow-visible"
            style={{ 'padding-top': `${TV_VOD_ROW_HOVER_PAD_PX}px` }}
          >
            <TvKeepListCard
              item={item.row}
              onOpen={item.onOpen}
              trailing={item.trailing}
              class="min-h-0 min-w-0 w-full max-w-full flex-1"
            />
          </div>
        );
        return item.wrapCard ? item.wrapCard(card) : card;
      }}
    </VirtualGridRowsList>
  );
};
