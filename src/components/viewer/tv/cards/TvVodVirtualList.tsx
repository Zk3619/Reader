/**
 * 影视点播虚拟列表：固定列数网格，卡片随列宽拉伸（书架式）
 *
 * 行列间距同源：列用 CSS gap，行用同值 padding-bottom；行高按真实卡片几何估算，
 * 并用 responsive 实测校正，避免槽位偏高把「多出来的空白」叠进行距。
 */

import {
  createEffect,
  createSignal,
  onCleanup,
  type Accessor,
  type Component,
  type JSX,
} from 'solid-js';
import { VirtualGridRowsList } from '@/components/shared/virtual-list';
import { TvVodCard } from '@/components/viewer/tv/cards/TvVodCard';
import {
  BOOKSHELF_LAYOUT_GAP_CLASS,
  bookshelfLayoutGapToRem,
  bookshelfLayoutSpacingToPx,
} from '@/lib/bookshelf/bookshelf-layout-gap';
import { getViewModeGridColumnCount } from '@/lib/bookshelf/bookshelf-layout-settings';
import {
  estimateTvVodGridRowHeightPx,
  TV_VOD_LIST_HORIZONTAL_PADDING_PX,
  TV_VOD_ROW_HOVER_PAD_PX,
  tvVodItemKey,
} from '@/lib/media/tv/tv-vod-list-layout';
import { tvHubContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import type { Vod } from '@/lib/media/tv/types';
import { getTvHomeUi } from '@/stores/tv-hub/tv-home-ui';
import { cn } from '@/lib/utils';

export interface TvVodListItem {
  title: string;
  coverUrl?: string;
  /** 仅接口有备注时传入 */
  badge?: string;
  key?: string;
  onOpen: () => void;
  trailing?: JSX.Element;
}

export interface TvVodVirtualListProps {
  items: Accessor<readonly TvVodListItem[]> | readonly TvVodListItem[];
  class?: string;
  listInnerClass?: string;
  onScroll?: (el: HTMLDivElement) => void;
  onScrollContainer?: (el: HTMLDivElement) => void;
  scrollFooter?: JSX.Element;
}

const VOD_ROW_GAP_CSS_VAR = 'bookshelf-layout-gap';

export function vodToListItem(
  vod: Vod,
  siteKeyFallback: string,
  onOpen: (vod: Vod) => void,
): TvVodListItem {
  const remarks = vod.vod_remarks?.trim();
  return {
    key: `${vod.siteKey || siteKeyFallback}|${vod.vod_id}`,
    title: vod.vod_name,
    coverUrl: vod.vod_pic?.trim() || undefined,
    badge: remarks || undefined,
    onOpen: () => onOpen(vod),
  };
}

export const TvVodVirtualList: Component<TvVodVirtualListProps> = (props) => {
  const ui = getTvHomeUi;
  const items: Accessor<readonly TvVodListItem[]> = () =>
    typeof props.items === 'function' ? props.items() : props.items;

  const [scrollRoot, setScrollRoot] = createSignal<HTMLDivElement | undefined>();

  const colCount = () => getViewModeGridColumnCount(ui().viewMode);
  const gapPx = () => bookshelfLayoutSpacingToPx(ui().spacing);

  createEffect(() => {
    const el = scrollRoot();
    if (!el) return;
    const gap = bookshelfLayoutGapToRem(ui().spacing);
    el.style.setProperty(`--${VOD_ROW_GAP_CSS_VAR}`, gap);
    onCleanup(() => el.style.removeProperty(`--${VOD_ROW_GAP_CSS_VAR}`));
  });

  const remeasureLayout = () => `${ui().viewMode}|${ui().spacing}|${colCount()}`;

  const listInnerClass = () =>
    props.listInnerClass ?? cn(tvHubContentInsetClass, 'px-2 pb-4 pt-1');

  return (
    <VirtualGridRowsList<TvVodListItem>
      class={cn('min-h-0 flex-1', props.class)}
      items={items}
      colCount={colCount}
      rowHeightMode="responsive"
      estimateRowSize={280}
      responsiveRowHeight={{
        getGapPx: () => gapPx(),
        horizontalPaddingPx: TV_VOD_LIST_HORIZONTAL_PADDING_PX,
        estimateRowHeight: (metrics) => estimateTvVodGridRowHeightPx(metrics),
      }}
      rowGapCssVar={VOD_ROW_GAP_CSS_VAR}
      getInterRowGapPx={gapPx}
      remeasureDeps={remeasureLayout}
      gridClass={cn('grid', BOOKSHELF_LAYOUT_GAP_CLASS)}
      listInnerClass={listInnerClass()}
      overscan={2}
      getItemKey={(item, index) => item.key ?? `vod|${index}`}
      onScrollContainer={(el) => {
        setScrollRoot(el);
        props.onScrollContainer?.(el);
      }}
      onScroll={props.onScroll}
      scrollFooter={props.scrollFooter}
    >
      {(item) => (
        <div
          class="flex h-full w-full min-w-0 flex-col justify-end overflow-visible"
          style={{ 'padding-top': `${TV_VOD_ROW_HOVER_PAD_PX}px` }}
        >
          <TvVodCard
            title={item.title}
            coverUrl={item.coverUrl}
            badge={item.badge}
            onOpen={item.onOpen}
            trailing={item.trailing}
            class="min-h-0 min-w-0 w-full max-w-full flex-1"
          />
        </div>
      )}
    </VirtualGridRowsList>
  );
};

/** @deprecated */
export function tvVodKeyFromVod(vod: Vod, index: number): string {
  return tvVodItemKey(vod, index);
}
