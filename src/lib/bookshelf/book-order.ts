import type { Book } from '@/types';

/** 按当前列表顺序（手动排序下的展示顺序） */
export function findBookOrderIndex(books: Book[], bookUrl: string): number {
  return books.findIndex((b) => b.bookUrl === bookUrl);
}

/** 将书籍移动到指定下标，返回新顺序；无法移动时返回 null */
export function moveBookToIndex(
  books: Book[],
  bookUrl: string,
  targetIndex: number,
): Book[] | null {
  const list = [...books];
  const from = list.findIndex((b) => b.bookUrl === bookUrl);
  if (from < 0) return null;
  const to = Math.max(0, Math.min(targetIndex, list.length - 1));
  if (from === to) return list;
  const [removed] = list.splice(from, 1);
  list.splice(to, 0, removed);
  return list.map((b, i) => ({ ...b, order: i }));
}

export function pinBookToTop(books: Book[], bookUrl: string): Book[] | null {
  return moveBookToIndex(books, bookUrl, 0);
}

export function pinBookToBottom(books: Book[], bookUrl: string): Book[] | null {
  if (books.length === 0) return null;
  return moveBookToIndex(books, bookUrl, books.length - 1);
}
