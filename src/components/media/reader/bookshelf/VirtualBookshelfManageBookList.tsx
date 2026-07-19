/**
 * 书架管理页虚拟列表 + 可选拖拽排序
 */

import type { Accessor, JSX } from 'solid-js';
import {
  VirtualList,
  DEFAULT_VIRTUAL_LIST_DRAG_STYLE,
  type VirtualListSortableConfig,
} from '@/components/shared/virtual-list';
import { BOOKSHELF_MANAGE_LIST_ROW_HEIGHT_PX } from '@/components/media/reader/bookshelf/bookshelf-manage-list-layout';
import { BookCoverFallback } from '@/components/media/reader/books/BookCoverFallback';
import { BookCoverFromBook } from '@/components/media/reader/books/BookCoverFromBook';
import { bookshelfCompactCoverClass } from '@/lib/bookshelf/book-group-card-styles';
import type { Id } from '@thisbeyond/solid-dnd';
import type { Book } from '@/types';
import { cn } from '@/lib/utils';

export const BOOKSHELF_MANAGE_DRAG_OVERLAY_SCALE = 2 / 3;

export function BookshelfManageBookDragOverlay(props: { book: Book }) {
  return (
    <div class="origin-center" style={{ transform: `scale(${BOOKSHELF_MANAGE_DRAG_OVERLAY_SCALE})` }}>
      <div class="flex h-16 w-max max-w-[min(85vw,24rem)] items-center gap-3 rounded-lg border border-border/50 bg-card px-2 text-sm shadow-lg">
        <div class={bookshelfCompactCoverClass('shrink-0')}>
          <BookCoverFromBook
            book={props.book}
            alt=""
            class="h-full w-full object-cover"
            draggable={false}
            fallback={<BookCoverFallback class="h-6 w-6" />}
          />
        </div>
        <span class="min-w-0 truncate font-medium text-foreground">{props.book.name}</span>
      </div>
    </div>
  );
}

export interface VirtualBookshelfManageBookListProps {
  books: readonly Book[];
  class?: string;
  sortable?: VirtualListSortableConfig<Book>;
  renderDragOverlay?: (activeId: Id | null) => JSX.Element;
  children: (bookUrl: string) => JSX.Element;
}

export function VirtualBookshelfManageBookList(props: VirtualBookshelfManageBookListProps) {
  const items: Accessor<readonly Book[]> = () => props.books;

  const sortable = () => {
    const cfg = props.sortable;
    if (!cfg) return undefined;
    return {
      ...cfg,
      dragStyle: cfg.dragStyle ?? DEFAULT_VIRTUAL_LIST_DRAG_STYLE,
    };
  };

  return (
    <VirtualList
      class={cn('min-h-0 flex-1 px-1', props.class)}
      items={items}
      estimateSize={() => BOOKSHELF_MANAGE_LIST_ROW_HEIGHT_PX}
      overscan={6}
      getItemKey={(book) => book.bookUrl}
      sortable={sortable()}
      renderDragOverlay={props.renderDragOverlay}
      renderByKey={(bookUrl) => props.children(bookUrl)}
    />
  );
}
