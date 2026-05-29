/**
 * 书架书籍列表 / 紧凑列表 / 多列列表：虚拟滚动 + 手动排序（solid-dnd）
 */

import { createMemo, createSignal, Show, type Accessor, type JSX } from 'solid-js';
import type { Store } from 'solid-js/store';
import type { Id } from '@thisbeyond/solid-dnd';
import {
  VirtualGridRowsList,
  VirtualList,
  type VirtualListSortableConfig,
} from '@/components/shared/virtual-list';
import {
  BOOKSHELF_LAYOUT_GAP_CLASS,
  bindBookshelfLayoutGap,
  bookshelfLayoutSpacingToPx,
} from '@/lib/bookshelf/bookshelf-layout-gap';
import {
  estimateBookshelfListVirtualRowSize,
  getBookshelfListRowHeightPx,
} from '@/lib/bookshelf/bookshelf-list-layout';
import {
  getBookshelfListColumnLayout,
  getViewModeCardLayout,
  getViewModeContainerGridClass,
  type ViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import { bookshelfLayoutStore } from '@/stores/bookshelf-layout';
import type { Book } from '@/types';
import { cn } from '@/lib/utils';
import { BookshelfBookGridDragOverlay } from '@/components/bookshelf/BookshelfGridDragOverlay';

export interface VirtualBookshelfBookListProps {
  books: readonly Book[] | Store<Book[]>;
  viewMode: ViewMode;
  showLastUpdateTime: boolean;
  sortable?: VirtualListSortableConfig<Book>;
  class?: string;
  externalScrollElement?: Accessor<HTMLDivElement | null | undefined>;
  onScrollContainer?: (el: HTMLDivElement) => void;
  onScroll?: (el: HTMLDivElement) => void;
  children: (book: Book, index: number) => JSX.Element;
}

export function VirtualBookshelfBookList(props: VirtualBookshelfBookListProps) {
  const items: () => readonly Book[] = () => props.books as readonly Book[];
  const colCount = () => getBookshelfListColumnLayout(props.viewMode);
  const cardLayout = () => getViewModeCardLayout(props.viewMode) as 'list' | 'compact';
  const cardHeightPx = () => getBookshelfListRowHeightPx(cardLayout());

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

  const listRowEstimate = (index: number) =>
    estimateBookshelfListVirtualRowSize(
      index,
      items().length,
      cardHeightPx(),
      bookshelfLayoutStore.settings.spacing,
    );

  const remeasureSpacing = () => bookshelfLayoutStore.settings.spacing;

  const listBody = () => (
    <Show
      when={colCount() > 1}
      fallback={
        <VirtualList<Book>
          class={cn('min-h-0 flex-1', props.class)}
          listInnerClass="p-1"
          items={items}
          estimateSize={listRowEstimate}
          remeasureWhen={remeasureSpacing}
          overscan={4}
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
          {(book, index) => props.children(book, index)}
        </VirtualList>
      }
    >
      <VirtualGridRowsList<Book>
        items={items}
        colCount={colCount}
        rowHeightMode="fixed"
        estimateRowSize={() => cardHeightPx()}
        rowGapCssVar="bookshelf-layout-gap"
        remeasureDeps={remeasureSpacing}
        getInterRowGapPx={() =>
          bookshelfLayoutSpacingToPx(bookshelfLayoutStore.settings.spacing)
        }
        class={cn('min-h-0 flex-1', props.class)}
        listInnerClass="p-1"
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
        {(book, index) => (
          <div class="min-w-0 w-full">{props.children(book, index)}</div>
        )}
      </VirtualGridRowsList>
    </Show>
  );

  return listBody();
}
