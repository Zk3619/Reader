/**
 * 全部书签列表（对齐 legado AllBookmarkActivity + BookmarkAdapter）
 */

import type { Bookmark } from '@/types';
import { bookmarkNoteForDisplay } from '@/lib/media/text/reader-bookmark';

export function formatBookmarkBookTitle(bookName: string, bookAuthor: string): string {
  const author = bookAuthor.trim();
  return author ? `${bookName} · ${author}` : bookName;
}

export function bookmarkBookKey(bookName: string, bookAuthor: string): string {
  return `${bookName}\0${bookAuthor ?? ''}`;
}

export interface BookmarkBookGroup {
  key: string;
  bookName: string;
  bookAuthor: string;
  bookmarks: Bookmark[];
}

/** 将已排序书签按书籍分组 */
export function buildBookmarkBookGroups(bookmarks: readonly Bookmark[]): BookmarkBookGroup[] {
  const groups: BookmarkBookGroup[] = [];
  let current: BookmarkBookGroup | null = null;

  for (const bookmark of bookmarks) {
    const key = bookmarkBookKey(bookmark.bookName, bookmark.bookAuthor);
    if (!current || current.key !== key) {
      current = {
        key,
        bookName: bookmark.bookName,
        bookAuthor: bookmark.bookAuthor,
        bookmarks: [],
      };
      groups.push(current);
    }
    current.bookmarks.push(bookmark);
  }

  return groups;
}

export type BookmarkVirtualRow =
  | {
      kind: 'header';
      key: string;
      bookName: string;
      bookAuthor: string;
    }
  | {
      kind: 'bookmark';
      key: string;
      bookmark: Bookmark;
    };

/** 将已按书名/作者/章节排序的书签展开为带分组标题的虚拟行 */
export function buildBookmarkVirtualRows(bookmarks: readonly Bookmark[]): BookmarkVirtualRow[] {
  const rows: BookmarkVirtualRow[] = [];
  let lastBookKey = '';

  for (const bookmark of bookmarks) {
    const bookKey = bookmarkBookKey(bookmark.bookName, bookmark.bookAuthor);
    if (bookKey !== lastBookKey) {
      rows.push({
        kind: 'header',
        key: `header:${bookKey}`,
        bookName: bookmark.bookName,
        bookAuthor: bookmark.bookAuthor,
      });
      lastBookKey = bookKey;
    }
    rows.push({
      kind: 'bookmark',
      key: `bookmark:${bookmark.time}`,
      bookmark,
    });
  }

  return rows;
}

export { bookmarkNoteForDisplay };
