/**
 * 探索/搜索书籍网格：响应式列数 + 按行虚拟滚动（与 EXPLORE_BOOK_GRID_CLASS 断点对齐）
 */

import type { JSX } from 'solid-js';
import type { Store } from 'solid-js/store';
import { VirtualGridRowsList } from '@/components/shared/virtual-list/VirtualGridRowsList';
import {
  EXPLORE_BOOK_GRID_CLASS,
  EXPLORE_BOOK_GRID_ROW_HEIGHT_PX,
  useExploreGridColumnCount,
} from '@/components/explore/ExploreBookCardSkeleton';
import { cn } from '@/lib/utils';

export interface VirtualExploreBookGridProps<T> {
  items: readonly T[] | Store<T[]>;
  class?: string;
  /** 单行高度（px），默认探索卡片行高 */
  rowHeight?: number;
  overscan?: number;
  onScroll?: (el: HTMLDivElement) => void;
  children: (item: T, index: number) => JSX.Element;
}

export function VirtualExploreBookGrid<T>(props: VirtualExploreBookGridProps<T>) {
  const colCount = useExploreGridColumnCount();
  const items: () => readonly T[] = () => props.items as readonly T[];

  return (
    <VirtualGridRowsList<T>
      items={items}
      colCount={colCount}
      rowHeightMode="fixed"
      estimateRowSize={() => props.rowHeight ?? EXPLORE_BOOK_GRID_ROW_HEIGHT_PX}
      class={cn(props.class)}
      gridClass={cn(EXPLORE_BOOK_GRID_CLASS, 'p-1')}
      overscan={props.overscan ?? 2}
      onScroll={props.onScroll}
    >
      {props.children}
    </VirtualGridRowsList>
  );
}
