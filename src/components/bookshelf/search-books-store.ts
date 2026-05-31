/**
 * 搜索结果：按 bookUrl 细粒度 store，避免整表 Map 重建导致网格单元集体更新。
 */

import { createMemo, createSignal } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { stabilizeListByRef } from '@/components/shared/virtual-list/stabilize-list-ref';
import type { MergedSearchBook } from '@/lib/book-source/multi-source-search';

export function createSearchBooksStore() {
  const [booksByUrl, setBooksByUrl] = createStore<Record<string, MergedSearchBook>>({});
  const [bookOrder, setBookOrder] = createSignal<string[]>([]);

  const replaceAll = (list: MergedSearchBook[]) => {
    setBooksByUrl(reconcile(Object.fromEntries(list.map((b) => [b.bookUrl, b]))));
    setBookOrder(list.map((b) => b.bookUrl));
  };

  let orderedCache: readonly MergedSearchBook[] = [];
  const orderedBooks = createMemo(() => {
    const next = bookOrder()
      .map((url) => booksByUrl[url])
      .filter((b): b is MergedSearchBook => b != null);
    const stabilized = stabilizeListByRef(orderedCache, next);
    orderedCache = stabilized;
    return stabilized;
  });

  return {
    booksByUrl,
    replaceAll,
    orderedBooks,
    clear: () => {
      setBooksByUrl(reconcile({}));
      setBookOrder([]);
    },
  };
}

export type SearchBooksStore = ReturnType<typeof createSearchBooksStore>;
