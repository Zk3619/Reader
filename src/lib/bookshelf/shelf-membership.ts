import type { Book } from '@/types';
import type { SearchBook } from '@/types';

/** 构建「是否在书架」快速查找集（对齐 Legado SearchViewModel.bookshelf） */
export function buildShelfMembershipKeys(books: Book[]): Set<string> {
  const keys = new Set<string>();
  for (const b of books) {
    const name = b.name?.trim() ?? '';
    const author = b.author?.trim() ?? '';
    if (name && author) keys.add(`${name}-${author}`);
    if (name) keys.add(name);
    if (b.bookUrl) keys.add(b.bookUrl);
  }
  return keys;
}

export function isSearchBookOnShelf(book: SearchBook, keys: Set<string>): boolean {
  const name = book.name?.trim() ?? '';
  const author = book.author?.trim() ?? '';
  const composite = author ? `${name}-${author}` : name;
  return keys.has(composite) || keys.has(name) || keys.has(book.bookUrl);
}
