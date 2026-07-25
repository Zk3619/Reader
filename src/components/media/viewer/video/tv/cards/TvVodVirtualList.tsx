/**
 * 影视点播虚拟列表：网格卡片随列宽拉伸
 *
 * - viewMode：固定列数（书架 / 首页式）
 * - container-responsive：按滚动容器宽度映射 3/4/6/8（番剧搜索断点档位）
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
import {
  VirtualGridRowsList,
  useVirtualGridContainerWidth,
} from '@/components/shared/virtual-list';
import { TvVodCard } from '@/components/media/viewer/video/tv/cards/TvVodCard';
import {
  BOOKSHELF_LAYOUT_GAP_CLASS,
  bookshelfLayoutGapToRem,
  bookshelfLayoutSpacingToPx,
} from '@/lib/bookshelf/bookshelf-layout-gap';
import { getViewModeGridColumnCount } from '@/lib/bookshelf/bookshelf-layout-settings';
import {
  BANGUMI_RESPONSIVE_GAP_PX,
  estimateTvVodGridRowHeightPx,
  resolveBangumiResponsiveColumnCount,
  TV_VOD_LIST_HORIZONTAL_PADDING_PX,
  TV_VOD_ROW_HOVER_PAD_PX,
  tvVodItemKey,
  type TvVodColumnStrategy,
} from '@/lib/media/tv/tv-vod-list-layout';
import { tvHubContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import type { Vod } from '@/lib/media/tv/types';
import type { ViewMode } from '@/lib/bookshelf/bookshelf-layout-settings';
import { getTvHomeUi } from '@/stores/tv-hub/tv-home-ui';
import { cn } from '@/lib/utils';

export interface TvVodListItem {
  title: string;
  coverUrl?: string;
  /** 封面角标（如更新集数）；无数据不显示 */
  badge?: string;
  key?: string;
  onOpen: () => void;
  trailing?: JSX.Element;
  /** 包裹卡片（如右键菜单） */
  wrapCard?: (card: JSX.Element) => JSX.Element;
}

/** 列表布局：默认读首页 UI；收藏页传入独立偏好 */
export type TvVodLayoutUi = {
  viewMode: ViewMode;
  spacing: number;
};

export type { TvVodColumnStrategy };

export interface TvVodVirtualListProps {
  items: Accessor<readonly TvVodListItem[]> | readonly TvVodListItem[];
  class?: string;
  listInnerClass?: string;
  /** 外层页面滚动容器（番剧页整页滚动时使用） */
  externalScrollElement?: Accessor<HTMLDivElement | null | undefined>;
  onScroll?: (el: HTMLDivElement) => void;
  onScrollContainer?: (el: HTMLDivElement) => void;
  scrollFooter?: JSX.Element;
  /** 不传则使用影视首页布局 */
  layoutUi?: Accessor<TvVodLayoutUi> | TvVodLayoutUi;
  /**
   * 列数策略：viewMode=偏好固定列数；container-responsive=按容器宽 3/4/6/8。
   * 默认 viewMode。
   */
  columnStrategy?: TvVodColumnStrategy;
  /** 列表滚动条 gutter；番剧列表默认单侧 */
  scrollGutter?: import('@/lib/ui/viewport-classes').ScrollGutterMode;
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
  const layout = (): TvVodLayoutUi => {
    if (props.layoutUi == null) return getTvHomeUi();
    return typeof props.layoutUi === 'function' ? props.layoutUi() : props.layoutUi;
  };
  const items: Accessor<readonly TvVodListItem[]> = () =>
    typeof props.items === 'function' ? props.items() : props.items;
  const columnStrategy = () => props.columnStrategy ?? 'viewMode';
  const isContainerResponsive = () => columnStrategy() === 'container-responsive';

  const [scrollRoot, setScrollRoot] = createSignal<HTMLDivElement | undefined>();
  const containerWidth = useVirtualGridContainerWidth(scrollRoot);

  const colCount = () => {
    if (isContainerResponsive()) {
      return resolveBangumiResponsiveColumnCount(containerWidth());
    }
    return getViewModeGridColumnCount(layout().viewMode);
  };
  const gapPx = () =>
    isContainerResponsive()
      ? BANGUMI_RESPONSIVE_GAP_PX
      : bookshelfLayoutSpacingToPx(layout().spacing);

  createEffect(() => {
    const el = scrollRoot();
    if (!el) return;
    const gap = isContainerResponsive()
      ? `${BANGUMI_RESPONSIVE_GAP_PX / 16}rem`
      : bookshelfLayoutGapToRem(layout().spacing);
    el.style.setProperty(`--${VOD_ROW_GAP_CSS_VAR}`, gap);
    onCleanup(() => el.style.removeProperty(`--${VOD_ROW_GAP_CSS_VAR}`));
  });

  const remeasureLayout = () =>
    `${columnStrategy()}|${layout().viewMode}|${layout().spacing}|${colCount()}|${containerWidth()}`;

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
      externalScrollElement={props.externalScrollElement}
      onScrollContainer={(el) => {
        setScrollRoot(el);
        props.onScrollContainer?.(el);
      }}
      onScroll={props.onScroll}
      scrollFooter={props.scrollFooter}
      scrollGutter={props.scrollGutter}
    >
      {(item) => {
        const card = (
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
        );
        return item.wrapCard ? item.wrapCard(card) : card;
      }}
    </VirtualGridRowsList>
  );
};

/** @deprecated */
export function tvVodKeyFromVod(vod: Vod, index: number): string {
  return tvVodItemKey(vod, index);
}
