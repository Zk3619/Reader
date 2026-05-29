/**
 * 固定行高扁平虚拟列表：封装 VirtualList，不启用拖拽（不传 sortable）。
 * 网格按行虚拟化请用 VirtualGridRowsList；可排序列表请直接用 VirtualList + sortable。
 */

import { createMemo, type JSX } from 'solid-js';
import { VirtualList } from '@/components/shared/virtual-list';
import { virtualListScrollToIndex } from '@/components/shared/virtual-list/scroll-into-view';
import { CATALOG_ROW_HEIGHT_PX } from '@/lib/catalog/chapter-list-layout';

const DEFAULT_OVERSCAN = 8;

export interface VirtualChapterListProps {
  count: number;
  class?: string;
  /** 单行高度（px），默认 40 */
  rowHeight?: number;
  overscan?: number;
  /** 滚动容器就绪 */
  onScrollContainer?: (el: HTMLDivElement) => void;
  onScroll?: (el: HTMLDivElement) => void;
  children: (index: number) => JSX.Element;
}

export function VirtualChapterList(props: VirtualChapterListProps) {
  const items = createMemo(() =>
    Array.from({ length: props.count }, (_, index) => index),
  );

  return (
    <VirtualList
      items={items}
      estimateSize={() => props.rowHeight ?? CATALOG_ROW_HEIGHT_PX}
      class={props.class}
      overscan={props.overscan ?? DEFAULT_OVERSCAN}
      onScrollContainer={props.onScrollContainer}
      onScroll={props.onScroll}
    >
      {(index) => props.children(index)}
    </VirtualList>
  );
}

/** 将章节索引滚入视口（固定行高近似） */
export function scrollCatalogIndexIntoView(
  container: HTMLDivElement,
  index: number,
  rowHeight = CATALOG_ROW_HEIGHT_PX,
  behavior: ScrollBehavior = 'auto',
): void {
  virtualListScrollToIndex(container, index, rowHeight, behavior);
}
