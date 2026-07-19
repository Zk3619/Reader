/**
 * 查询某书已缓存的章节索引集合（供目录 UI 使用）
 */

import { getDatabase } from '@/lib/database/database-core';
import { ReaderTables } from '@/lib/database/table-names';

export async function getCachedChapterIndices(bookUrl: string): Promise<Set<number>> {
  if (!bookUrl) return new Set();
  const db = await getDatabase();
  const rows = await db.select<{ chapter_index: number }>(
    `SELECT chapter_index FROM ${ReaderTables.chapterCache} WHERE book_url = ?`,
    [bookUrl],
  );
  return new Set(rows.map((r) => Number(r.chapter_index)));
}
