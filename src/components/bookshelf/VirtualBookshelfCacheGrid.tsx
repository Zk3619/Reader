/**
 * 响应式网格 + 按行虚拟滚动（与发现页 EXPLORE_BOOK_GRID_CLASS 断点对齐）
 */

import { For, createMemo, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import type { Store } from 'solid-js/store';
import { VirtualChapterList } from '@/components/books/VirtualChapterList';
import { EXPLORE_BOOK_GRID_CLASS } from '@/pages/explore/ExploreBookCardSkeleton';
import {
  CACHE_BOOK_CARD_HEIGHT_PX,
} from '@/components/bookshelf/BookshelfCacheBookCard';
import { cn } from '@/lib/utils';
import type { Book } from '@/types';

const GRID_GAP_PX = 8;

function resolveColumnCount(): number {
  if (typeof window === 'undefined') return 1;
  if (window.matchMedia('(min-width: 1536px)').matches) return 4;
  if (window.matchMedia('(min-width: 1024px)').matches) return 3;
  if (window.matchMedia('(min-width: 768px)').matches) return 2;
  return 1;
}

function useResponsiveColumnCount() {
  const [cols, setCols] = createSignal(resolveColumnCount());
  onMount(() => {
    const sync = () => setCols(resolveColumnCount());
    const queries = ['(min-width: 768px)', '(min-width: 1024px)', '(min-width: 1536px)'].map(
      (q) => window.matchMedia(q),
    );
    for (const mq of queries) mq.addEventListener('change', sync);
    onCleanup(() => {
      for (const mq of queries) mq.removeEventListener('change', sync);
    });
  });
  return cols;
}

export interface VirtualBookshelfCacheGridProps<T extends { book: Pick<Book, 'bookUrl'> }> {
  items: readonly T[] | Store<T[]>;
  class?: string;
  children: (item: T, index: number) => JSX.Element;
}

export function VirtualBookshelfCacheGrid<T extends { book: Pick<Book, 'bookUrl'> }>(
  props: VirtualBookshelfCacheGridProps<T>,
) {
  const colCount = useResponsiveColumnCount();
  const rowHeight = () => CACHE_BOOK_CARD_HEIGHT_PX + GRID_GAP_PX;
  const rowCount = createMemo(() =>
    Math.max(0, Math.ceil(props.items.length / Math.max(1, colCount()))),
  );

  const rowItems = (rowIndex: number) => {
    const cols = colCount();
    const start = rowIndex * cols;
    return props.items.slice(start, start + cols);
  };

  return (
    <VirtualChapterList
      class={cn('h-full min-h-0 px-2', props.class)}
      count={rowCount()}
      rowHeight={rowHeight()}
      overscan={2}
    >
      {(rowIndex) => (
        <ul class={cn(EXPLORE_BOOK_GRID_CLASS, 'pb-2')}>
          <For each={rowItems(rowIndex)}>
            {(item, i) => {
              const index = rowIndex * colCount() + i();
              return props.children(item, index);
            }}
          </For>
        </ul>
      )}
    </VirtualChapterList>
  );
}
