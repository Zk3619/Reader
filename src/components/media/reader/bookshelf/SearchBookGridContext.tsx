/**
 * 搜索网格单元上下文 + 稳定 renderEntityByKey。
 */

import { createContext, useContext, type ParentProps } from 'solid-js';
import { SearchBookResultCell } from '@/components/media/reader/bookshelf/SearchBookResultCell';
import type { SearchBooksStore } from '@/components/media/reader/bookshelf/search-books-store';
import type { MergedSearchBook } from '@/lib/book-source/multi-source-search';
import type { BookSource } from '@/types';

export type SearchBookGridContextValue = {
  store: SearchBooksStore;
  onShelf: (book: MergedSearchBook) => boolean;
  sourceForBook: (book: MergedSearchBook) => BookSource | null | undefined;
  onOpen: (book: MergedSearchBook) => void | Promise<void>;
};

const SearchBookGridContext = createContext<SearchBookGridContextValue>();

export function SearchBookGridProvider(
  props: ParentProps<{ value: SearchBookGridContextValue }>,
) {
  return (
    <SearchBookGridContext.Provider value={props.value}>
      {props.children}
    </SearchBookGridContext.Provider>
  );
}

export function renderSearchBookGridCell(entityKey: string) {
  return <SearchBookGridCell bookUrl={entityKey} />;
}

export function SearchBookGridCell(props: { bookUrl: string }) {
  const ctx = useContext(SearchBookGridContext);
  if (!ctx) return null;
  return (
    <SearchBookResultCell
      bookUrl={props.bookUrl}
      booksByUrl={ctx.store.booksByUrl}
      onShelf={ctx.onShelf}
      sourceForBook={ctx.sourceForBook}
      onOpen={ctx.onOpen}
    />
  );
}
