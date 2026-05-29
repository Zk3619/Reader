import { isLocalBook } from '@/lib/local-book';
import { sourcesStore } from '@/stores/sources';
import type { Book, BookGroup } from '@/types';

/** 书架管理/筛选中本地书统一显示的来源名 */
export const LOCAL_BOOK_SOURCE_DISPLAY_NAME = '本地';

/** 书籍在书架管理中的来源名（本地书统一为「本地」） */
export function getBookshelfBookSourceName(book: Book): string {
  if (isLocalBook(book)) return LOCAL_BOOK_SOURCE_DISPLAY_NAME;
  const live = sourcesStore.state.bookSources
    .find((s) => s.sourceUrl === book.origin)
    ?.sourceName?.trim();
  if (live) return live;
  return book.originName?.trim() ?? '';
}

/** 书籍已加入的自定义分组 id（按 userGroups 顺序） */
export function bookshelfBookCustomGroupIds(book: Book, userGroups: BookGroup[]): number[] {
  return userGroups
    .filter((g) => g.groupId > 0 && (book.group & g.groupId) !== 0)
    .map((g) => g.groupId);
}

/** 书籍所属自定义分组名，多个以中文分号分隔；无分组时为「无」 */
export function formatBookshelfBookGroupNames(book: Book, userGroups: BookGroup[]): string {
  const names = userGroups
    .filter((g) => g.groupId > 0 && (book.group & g.groupId) !== 0)
    .map((g) => g.groupName);
  return names.length > 0 ? names.join('；') : '无';
}
