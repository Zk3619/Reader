/**
 * 探索列表书籍：按 bookUrl 细粒度 store，避免 patch 单书封面时整表 Map/数组引用重建。
 */

import { createMemo, createSignal } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { stabilizeListByRef } from '@/components/shared/virtual-list/stabilize-list-ref';
import type { SearchBook } from '@/types';

export function createExploreBooksStore() {
  const [booksByUrl, setBooksByUrl] = createStore<Record<string, SearchBook>>({});
  const [bookOrder, setBookOrder] = createSignal<string[]>([]);

  const replaceAll = (list: SearchBook[]) => {
    setBooksByUrl(reconcile(Object.fromEntries(list.map((b) => [b.bookUrl, b]))));
    setBookOrder(list.map((b) => b.bookUrl));
  };

  const appendAll = (list: SearchBook[]) => {
    if (list.length === 0) return;
    setBookOrder((prev) => [...prev, ...list.map((b) => b.bookUrl)]);
    for (const book of list) {
      setBooksByUrl(book.bookUrl, book);
    }
  };

  const patchCoverUrl = (bookUrl: string, url: string) => {
    const prev = booksByUrl[bookUrl];
    if (!prev || prev.coverUrl === url) return;
    setBooksByUrl(bookUrl, 'coverUrl', url);
  };

  let orderedCache: readonly SearchBook[] = [];
  const orderedBooks = createMemo(() => {
    const next = bookOrder()
      .map((url) => booksByUrl[url])
      .filter((b): b is SearchBook => b != null);
    const stabilized = stabilizeListByRef(orderedCache, next);
    orderedCache = stabilized;
    return stabilized;
  });

  return {
    booksByUrl,
    replaceAll,
    appendAll,
    patchCoverUrl,
    orderedBooks,
    clear: () => {
      setBooksByUrl(reconcile({}));
      setBookOrder([]);
    },
  };
}

export type ExploreBooksStore = ReturnType<typeof createExploreBooksStore>;
