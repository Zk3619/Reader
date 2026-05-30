/**
 * 响应式网格 + 按行虚拟滚动（与发现页 EXPLORE_BOOK_GRID_CLASS 断点对齐）
 */

import type { JSX } from 'solid-js';
import type { Store } from 'solid-js/store';
import { VirtualGridRowsList } from '@/components/shared/virtual-list/VirtualGridRowsList';
import {
  EXPLORE_BOOK_GRID_CLASS,
  EXPLORE_BOOK_GRID_GAP_PX,
  useExploreGridColumnCount,
} from '@/components/explore/ExploreBookCardSkeleton';
import { CACHE_BOOK_CARD_HEIGHT_PX } from '@/components/bookshelf/BookshelfCacheBookCard';
import { cn } from '@/lib/utils';
import type { Book } from '@/types';

export interface VirtualBookshelfCacheGridProps<T extends { book: Pick<Book, 'bookUrl'> }> {
  items: readonly T[] | Store<T[]>;
  class?: string;
  children: (item: T, index: number) => JSX.Element;
}

export function VirtualBookshelfCacheGrid<T extends { book: Pick<Book, 'bookUrl'> }>(
  props: VirtualBookshelfCacheGridProps<T>,
) {
  const colCount = useExploreGridColumnCount();
  const items: () => readonly T[] = () => props.items as readonly T[];

  return (
    <VirtualGridRowsList<T>
      items={items}
      colCount={colCount}
      rowHeightMode="fixed"
      estimateRowSize={() => CACHE_BOOK_CARD_HEIGHT_PX + EXPLORE_BOOK_GRID_GAP_PX}
      class={cn('px-2', props.class)}
      gridClass={EXPLORE_BOOK_GRID_CLASS}
      rowUlClass="pb-2"
      overscan={2}
    >
      {props.children}
    </VirtualGridRowsList>
  );
}
