/**
 * 书签数据访问对象
 * 对应 legado 项目的 BookmarkDao.kt
 */

import { getDatabase } from '@/lib/database/database-core';
import { ReaderTables } from '@/lib/database/table-names';
import type { Bookmark } from '@/types';

/**
 * 获取所有书签
 */
export async function getAllBookmarks(): Promise<Bookmark[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${ReaderTables.bookmarks} 
     ORDER BY bookName, bookAuthor, chapterIndex, chapterPos`
  );
  return rows.map(row => mapRowToBookmark(row));
}

/**
 * 根据书籍获取书签
 */
export async function getBookmarksByBook(
  bookName: string,
  bookAuthor: string
): Promise<Bookmark[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${ReaderTables.bookmarks} WHERE bookName = ? AND bookAuthor = ? ORDER BY chapterIndex`,
    [bookName, bookAuthor]
  );
  return rows.map(row => mapRowToBookmark(row));
}

/**
 * 搜索书签
 */
export async function searchBookmarks(
  bookName: string,
  bookAuthor: string,
  keyword: string
): Promise<Bookmark[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${ReaderTables.bookmarks} 
     WHERE bookName = ? AND bookAuthor = ?
     AND (chapterName LIKE '%' || ? || '%' OR content LIKE '%' || ? || '%')
     ORDER BY chapterIndex`,
    [bookName, bookAuthor, keyword, keyword]
  );
  return rows.map(row => mapRowToBookmark(row));
}

/**
 * 插入书签（如果存在则替换）
 */
export async function insertBookmark(bookmark: Bookmark): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO ${ReaderTables.bookmarks} (
      time, bookName, bookAuthor, chapterIndex, chapterPos,
      chapterName, bookText, content
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      bookmark.time,
      bookmark.bookName,
      bookmark.bookAuthor,
      bookmark.chapterIndex,
      bookmark.chapterPos,
      bookmark.chapterName,
      bookmark.bookText,
      bookmark.content,
    ]
  );
}

/**
 * 更新书签
 */
export async function updateBookmark(bookmark: Bookmark): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE ${ReaderTables.bookmarks} SET
      bookName = ?, bookAuthor = ?, chapterIndex = ?,
      chapterPos = ?, chapterName = ?, bookText = ?, content = ?
    WHERE time = ?`,
    [
      bookmark.bookName,
      bookmark.bookAuthor,
      bookmark.chapterIndex,
      bookmark.chapterPos,
      bookmark.chapterName,
      bookmark.bookText,
      bookmark.content,
      bookmark.time,
    ]
  );
}

/**
 * 删除书签
 */
export async function deleteBookmark(time: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${ReaderTables.bookmarks} WHERE time = ?`, [time]);
}

/**
 * 删除书籍的所有书签
 */
export async function deleteBookmarksByBook(
  bookName: string,
  bookAuthor: string
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `DELETE FROM ${ReaderTables.bookmarks} WHERE bookName = ? AND bookAuthor = ?`,
    [bookName, bookAuthor]
  );
}

/**
 * 将数据库行映射为Bookmark对象
 */
function mapRowToBookmark(row: Record<string, unknown>): Bookmark {
  return {
    time: Number(row.time ?? 0),
    bookName: String(row.bookName ?? ''),
    bookAuthor: String(row.bookAuthor ?? ''),
    chapterIndex: Number(row.chapterIndex ?? 0),
    chapterPos: Number(row.chapterPos ?? 0),
    chapterName: String(row.chapterName ?? ''),
    bookText: String(row.bookText ?? ''),
    content: String(row.content ?? ''),
  };
}
