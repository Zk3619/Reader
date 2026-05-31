/**
 * 搜索网格单元：稳定 bookUrl + store 查书，避免整表 Map 订阅。
 */

import { Show, type Accessor } from 'solid-js';
import { SearchBookResultRow } from '@/components/bookshelf/SearchBookResultRow';
import type { MergedSearchBook } from '@/lib/book-source/multi-source-search';
import type { BookSource } from '@/types';

export interface SearchBookResultCellProps {
  bookUrl: string;
  booksByUrl: Record<string, MergedSearchBook>;
  onShelf: (book: MergedSearchBook) => boolean;
  sourceForBook: (book: MergedSearchBook) => BookSource | null | undefined;
  onOpen: (book: MergedSearchBook) => void | Promise<void>;
}

function SearchBookResultCellBody(props: {
  book: Accessor<MergedSearchBook>;
  onShelf: (book: MergedSearchBook) => boolean;
  sourceForBook: (book: MergedSearchBook) => BookSource | null | undefined;
  onOpen: (book: MergedSearchBook) => void | Promise<void>;
}) {
  const b = props.book;
  return (
    <SearchBookResultRow
      book={b()}
      onShelf={props.onShelf(b())}
      source={props.sourceForBook(b()) ?? null}
      onOpen={() => void props.onOpen(b())}
    />
  );
}

export function SearchBookResultCell(props: SearchBookResultCellProps) {
  const book = () => props.booksByUrl[props.bookUrl];

  return (
    <Show when={book()}>
      <SearchBookResultCellBody
        book={book as Accessor<MergedSearchBook>}
        onShelf={props.onShelf}
        sourceForBook={props.sourceForBook}
        onOpen={props.onOpen}
      />
    </Show>
  );
}
