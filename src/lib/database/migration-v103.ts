/**
 * v103：规范化 books.type 位标志，修正 Legado 枚举与 BookType 混写
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import {
  bookTypeFromSourceType,
  BookType,
  isBookSourceTypeEnum,
} from '@/lib/book-source/book-type';

export const BOOK_TYPE_NORMALIZE_SCHEMA_VERSION = 103;

/** 与 isBookAudio() 对齐的 SQL 条件 */
export const SQL_AUDIO_BOOK_CONDITION = `(type & ${BookType.audio} > 0 OR type = 1)`;

export async function migrateBookTypeNormalizeV103(db: DatabaseAdapter): Promise<void> {
  const books = await db.select<{ bookUrl: string; type: number; origin: string }>(
    'SELECT bookUrl, type, origin FROM books',
  );
  const sources = await db.select<{ bookSourceUrl: string; bookSourceType: number }>(
    'SELECT bookSourceUrl, bookSourceType FROM book_sources',
  );
  const sourceMap = new Map(sources.map((s) => [s.bookSourceUrl, s.bookSourceType]));

  for (const book of books) {
    let nextType = book.type;
    const sourceType = sourceMap.get(book.origin);

    if (isBookSourceTypeEnum(book.type)) {
      nextType = bookTypeFromSourceType(book.type);
    } else if (sourceType != null && isBookSourceTypeEnum(sourceType)) {
      const fromSource = bookTypeFromSourceType(sourceType);
      const preservedFlags = book.type & (BookType.updateError | BookType.local | BookType.notShelf);
      nextType = fromSource | preservedFlags;
    }

    if (nextType !== book.type) {
      await db.execute('UPDATE books SET type = ? WHERE bookUrl = ?', [nextType, book.bookUrl]);
    }
  }
}
