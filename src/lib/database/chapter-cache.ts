/**
 * 章节缓存数据访问对象
 * 对应 legado 项目的章节缓存功能
 */

import { getDatabase } from './database-core';
import type { ChapterCache } from '@/types';

/**
 * 获取章节缓存
 */
export async function getChapterCache(
  bookUrl: string,
  chapterIndex: number
): Promise<ChapterCache | null> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
    'SELECT * FROM chapter_cache WHERE book_url = ? AND chapter_index = ?',
    [bookUrl, chapterIndex]
  );
  return rows.length > 0 ? mapRowToCache(rows[0]) : null;
}

/**
 * 插入或更新章节缓存
 */
export async function upsertChapterCache(cache: ChapterCache): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO chapter_cache (
      book_url, chapter_index, content, created_at
    ) VALUES (?, ?, ?, ?)`,
    [cache.bookUrl, cache.chapterIndex, cache.content, cache.createdAt]
  );
}

/**
 * 删除章节缓存
 */
export async function deleteChapterCache(
  bookUrl: string,
  chapterIndex: number
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'DELETE FROM chapter_cache WHERE book_url = ? AND chapter_index = ?',
    [bookUrl, chapterIndex]
  );
}

/**
 * 删除书籍的所有章节缓存
 */
export async function deleteChapterCacheByBook(bookUrl: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM chapter_cache WHERE book_url = ?', [bookUrl]);
}

/**
 * 清空所有章节缓存
 */
export async function clearAllChapterCache(): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM chapter_cache');
}

/**
 * 将数据库行映射为ChapterCache对象
 */
function mapRowToCache(row: Record<string, unknown>): ChapterCache {
  return {
    bookUrl: String(row.book_url ?? ''),
    chapterIndex: Number(row.chapter_index ?? 0),
    content: String(row.content ?? ''),
    createdAt: Number(row.created_at ?? 0),
  };
}
