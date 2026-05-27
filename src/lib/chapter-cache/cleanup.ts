/**
 * 清理不在书架上的章节缓存（对齐 Legado BookHelp.clearInvalidCache）
 */

import * as booksDb from '@/lib/database/books';
import * as chapterCacheDb from '@/lib/database/chapter-cache';
import { deleteBookCacheFiles, deleteChapterFile } from '@/lib/chapter-cache/file-storage';

export async function clearInvalidChapterCache(): Promise<number> {
  const books = await booksDb.getAllBooks();
  const validUrls = new Set(books.map((b) => b.bookUrl));

  const cachedUrls = await chapterCacheDb.listDistinctCachedBookUrls();
  let removedBooks = 0;

  for (const bookUrl of cachedUrls) {
    if (validUrls.has(bookUrl)) continue;
    const rows = await chapterCacheDb.listChapterCacheByBook(bookUrl);
    for (const row of rows) {
      if (row.filePath) {
        await deleteChapterFile(row.filePath);
      }
    }
    await chapterCacheDb.deleteChapterCacheByBook(bookUrl);
    await deleteBookCacheFiles(bookUrl);
    removedBooks += 1;
  }

  for (const book of books) {
    await deleteOrphanBookCacheDirs(book);
  }

  return removedBooks;
}

async function deleteOrphanBookCacheDirs(
  _book: { bookUrl: string; name: string },
): Promise<void> {
  /* 文件目录与 DB 行由 deleteCachedChaptersByBook 统一处理；此处保留扩展点 */
}
