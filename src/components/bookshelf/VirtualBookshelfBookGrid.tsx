/**
 * 书架书籍网格：行级虚拟 + 响应式行高 + 手动排序（solid-dnd）
 */

import { createMemo, createSignal, type Accessor, type JSX } from 'solid-js';
import type { Store } from 'solid-js/store';
import type { Id } from '@thisbeyond/solid-dnd';
import { VirtualGridRowsList, type VirtualListSortableConfig } from '@/components/shared/virtual-list';
import {
  BOOKSHELF_LAYOUT_GAP_CLASS,
  bindBookshelfLayoutGap,
  bookshelfLayoutSpacingToPx,
} from '@/lib/bookshelf/bookshelf-layout-gap';
import { estimateBookshelfGridCardHeight } from '@/lib/bookshelf/bookshelf-grid-row-height';
import {
  getViewModeContainerGridClass,
  getViewModeGridColumnCount,
  type ViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import {
  bookshelfLayoutStore,
  type BookTitleDisplay,
} from '@/stores/bookshelf-layout';
import type { Book } from '@/types';
import { cn } from '@/lib/utils';
import { BookshelfBookGridDragOverlay } from '@/components/bookshelf/BookshelfGridDragOverlay';

export interface VirtualBookshelfBookGridProps {
  books: readonly Book[] | Store<Book[]>;
  viewMode: ViewMode;
  bookTitleDisplay: BookTitleDisplay;
  showLastUpdateTime: boolean;
  sortable?: VirtualListSortableConfig<Book>;
  class?: string;
  externalScrollElement?: Accessor<HTMLDivElement | null | undefined>;
  onScrollContainer?: (el: HTMLDivElement) => void;
  onScroll?: (el: HTMLDivElement) => void;
  children: (book: Book, index: number) => JSX.Element;
}

export function VirtualBookshelfBookGrid(props: VirtualBookshelfBookGridProps) {
  const items: () => readonly Book[] = () => props.books as readonly Book[];
  const colCount = () => getViewModeGridColumnCount(props.viewMode);
  const titleOverlay = () => props.bookTitleDisplay === 'overlay';

  const [scrollRoot, setScrollRoot] = createSignal<HTMLDivElement | undefined>();
  const gapContainer = () => props.externalScrollElement?.() ?? scrollRoot();
  bindBookshelfLayoutGap(gapContainer);

  const gridClass = () =>
    cn('grid', BOOKSHELF_LAYOUT_GAP_CLASS, getViewModeContainerGridClass(props.viewMode));

  const bookByUrl = createMemo(() => new Map(items().map((b) => [b.bookUrl, b])));

  const renderDragOverlay = (activeId: Id | null) => {
    if (activeId == null) return null;
    const book = bookByUrl().get(String(activeId));
    if (!book) return null;
    return (
      <BookshelfBookGridDragOverlay book={book} showSubtitle={props.showLastUpdateTime} />
    );
  };

  return (
    <VirtualGridRowsList<Book>
      items={items}
      colCount={colCount}
      rowHeightMode="responsive"
      estimateRowSize={280}
      responsiveRowHeight={{
        getGapPx: () => bookshelfLayoutSpacingToPx(bookshelfLayoutStore.settings.spacing),
        estimateRowHeight: (metrics) =>
          estimateBookshelfGridCardHeight(metrics, {
            titleOverlay: titleOverlay(),
            showSubtitle: !titleOverlay(),
          }),
      }}
      class={cn('min-h-0 flex-1', props.class)}
      listInnerClass="p-1"
      rowGapCssVar="bookshelf-layout-gap"
      remeasureDeps={() => bookshelfLayoutStore.settings.spacing}
      gridClass={gridClass()}
      overscan={2}
      externalScrollElement={props.externalScrollElement}
      getItemKey={(book) => book.bookUrl}
      sortable={props.sortable}
      renderDragOverlay={props.sortable ? renderDragOverlay : undefined}
      onScrollContainer={(el) => {
        setScrollRoot(el);
        props.onScrollContainer?.(el);
      }}
      onScroll={props.onScroll}
    >
      {props.children}
    </VirtualGridRowsList>
  );
}
