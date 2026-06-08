/**
 * 章节缓存数据访问对象
 * 对应 legado 项目的章节缓存功能
 */

import { getDatabase } from '@/lib/database/database-core';
import { normalizeChapterCacheTier } from '@/lib/chapter-cache/cache-tier';
import type { ChapterCache, ChapterCacheTier } from '@/types';

/**
 * 获取章节缓存
 */
export async function getChapterCache(
  bookUrl: string,
  chapterIndex: number,
): Promise<ChapterCache | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM chapter_cache WHERE book_url = ? AND chapter_index = ?',
    [bookUrl, chapterIndex],
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
      book_url, chapter_index, content, file_path, created_at, cache_tier
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      cache.bookUrl,
      cache.chapterIndex,
      cache.content,
      cache.filePath ?? null,
      cache.createdAt,
      cache.cacheTier ?? 'auto',
    ],
  );
}

/**
 * 删除章节缓存
 */
export async function deleteChapterCache(
  bookUrl: string,
  chapterIndex: number,
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'DELETE FROM chapter_cache WHERE book_url = ? AND chapter_index = ?',
    [bookUrl, chapterIndex],
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

export async function countChapterCacheByBook(bookUrl: string): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM chapter_cache WHERE book_url = ?',
    [bookUrl],
  );
  return rows[0]?.cnt ?? 0;
}

export async function listChapterCacheByBook(bookUrl: string): Promise<ChapterCache[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM chapter_cache WHERE book_url = ? ORDER BY chapter_index',
    [bookUrl],
  );
  return rows.map(mapRowToCache);
}

export async function listDistinctCachedBookUrls(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.select<{ book_url: string }>(
    'SELECT DISTINCT book_url FROM chapter_cache',
  );
  return rows.map((r) => String(r.book_url ?? ''));
}

export async function setChapterCacheTier(
  bookUrl: string,
  chapterIndex: number,
  cacheTier: ChapterCacheTier,
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE chapter_cache SET cache_tier = ? WHERE book_url = ? AND chapter_index = ?`,
    [cacheTier, bookUrl, chapterIndex],
  );
}

export async function isManualCachedChapter(
  bookUrl: string,
  chapterIndex: number,
): Promise<boolean> {
  const row = await getChapterCache(bookUrl, chapterIndex);
  return row?.cacheTier === 'manual';
}

function mapRowToCache(row: Record<string, unknown>): ChapterCache {
  return {
    bookUrl: String(row.book_url ?? ''),
    chapterIndex: Number(row.chapter_index ?? 0),
    content: String(row.content ?? ''),
    filePath: row.file_path != null ? String(row.file_path) : null,
    createdAt: Number(row.created_at ?? 0),
    cacheTier: normalizeChapterCacheTier(row.cache_tier),
  };
}
