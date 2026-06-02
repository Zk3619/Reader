/**
 * 探索/搜索书籍列表：按布局偏好虚拟滚动（默认 / 文本列表 / 卡片列表 / 卡片网格）
 */

import { createMemo, createEffect, createSignal, onCleanup, type Accessor, type JSX } from 'solid-js';
import type { Store } from 'solid-js/store';
import { VirtualGridRowsList } from '@/components/shared/virtual-list/VirtualGridRowsList';
import { bookshelfLayoutSpacingToPx } from '@/lib/bookshelf/bookshelf-layout-gap';
import { estimateBookshelfGridCardHeight } from '@/lib/bookshelf/bookshelf-grid-row-height';
import {
  getExploreListColumnCount,
  getExploreListGridClass,
  getExploreListRowHeightPx,
  shouldUseResponsiveRowHeight,
  useExploreResponsiveColumnCount,
  usesBookshelfLayoutGap,
} from '@/lib/explore/explore-list-layout';
import { explorePageLayoutStore } from '@/stores/explore-page-layout';
import { cn } from '@/lib/utils';

export interface VirtualExploreBookGridProps<T> {
  items: Accessor<readonly T[]> | readonly T[] | Store<T[]>;
  class?: string;
  /** 单行高度（px），未指定时按布局偏好推算 */
  rowHeight?: number;
  overscan?: number;
  onScroll?: (el: HTMLDivElement) => void;
  getItemKey?: (item: T, index: number) => string | number;
  renderByKey?: (itemKey: string, flatIndex: Accessor<number>) => JSX.Element;
  renderEntityByKey?: (entityKey: string) => JSX.Element;
  scrollFooter?: JSX.Element;
  children?: (item: T, index: number) => JSX.Element | null;
}

export function VirtualExploreBookGrid<T>(props: VirtualExploreBookGridProps<T>) {
  const items: Accessor<readonly T[]> =
    typeof props.items === 'function'
      ? props.items
      : () => props.items as readonly T[];

  const settings = () => explorePageLayoutStore.settings;
  const responsiveCols = useExploreResponsiveColumnCount();
  const colCount = createMemo(() => {
    if (settings().dataLayoutMode === 'default') return responsiveCols();
    return getExploreListColumnCount(settings());
  });
  const gridClass = createMemo(() => getExploreListGridClass(settings()));
  const useResponsive = () => shouldUseResponsiveRowHeight(settings());

  const [scrollRoot, setScrollRoot] = createSignal<HTMLDivElement | undefined>();

  createEffect(() => {
    const el = scrollRoot();
    if (!el) return;
    if (!usesBookshelfLayoutGap(settings())) {
      el.style.removeProperty('--bookshelf-layout-gap');
      return;
    }
    const gapRem = `${settings().spacing * 0.25}rem`;
    el.style.setProperty('--bookshelf-layout-gap', gapRem);
    onCleanup(() => el.style.removeProperty('--bookshelf-layout-gap'));
  });

  const rowHeightPx = createMemo(() => {
    if (props.rowHeight != null && !useResponsive()) return props.rowHeight;
    return getExploreListRowHeightPx(settings());
  });

  const interRowGapPx = () => {
    if (!usesBookshelfLayoutGap(settings())) return 0;
    return bookshelfLayoutSpacingToPx(settings().spacing);
  };

  const useRowGap = () => usesBookshelfLayoutGap(settings());

  return (
    <VirtualGridRowsList<T>
      items={items}
      colCount={colCount}
      rowHeightMode={useResponsive() ? 'responsive' : 'fixed'}
      estimateRowSize={rowHeightPx}
      rowGapCssVar={useRowGap() ? 'bookshelf-layout-gap' : undefined}
      getInterRowGapPx={interRowGapPx}
      remeasureDeps={() => [
        settings().dataLayoutMode,
        settings().spacing,
        settings().cardListViewMode,
        settings().cardGridViewMode,
        settings().dataDisplayMode,
        responsiveCols(),
      ]}
      responsiveRowHeight={
        useResponsive()
          ? {
              getGapPx: () => bookshelfLayoutSpacingToPx(settings().spacing),
              estimateRowHeight: (metrics) =>
                estimateBookshelfGridCardHeight(metrics, { showSubtitle: true }),
            }
          : undefined
      }
      class={cn(props.class)}
      gridClass={cn(gridClass(), 'p-1')}
      overscan={props.overscan ?? 3}
      getItemKey={props.getItemKey}
      renderByKey={props.renderByKey}
      renderEntityByKey={props.renderEntityByKey}
      onScroll={props.onScroll}
      onScrollContainer={setScrollRoot}
      scrollFooter={props.scrollFooter}
    >
      {props.children ?? (() => null)}
    </VirtualGridRowsList>
  );
}

export function getExploreDefaultRowHeightPx(): number {
  return getExploreListRowHeightPx(explorePageLayoutStore.settings);
}
