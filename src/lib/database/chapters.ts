/**
 * 章节数据访问对象
 * 对应 legado 项目的 BookChapterDao.kt
 */

import { getDatabase } from './database-core';
import type { BookChapter, NewBookChapter } from '@/types';

/**
 * 获取书籍的所有章节
 */
export async function getChapterList(bookUrl: string): Promise<BookChapter[]> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
    'SELECT * FROM chapters WHERE bookUrl = ? ORDER BY "index"',
    [bookUrl]
  );
  return rows.map(row => mapRowToChapter(row));
}

/**
 * 获取指定范围的章节列表
 */
export async function getChapterListByRange(
  bookUrl: string,
  start: number,
  end: number
): Promise<BookChapter[]> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
    'SELECT * FROM chapters WHERE bookUrl = ? AND "index" >= ? AND "index" <= ? ORDER BY "index"',
    [bookUrl, start, end]
  );
  return rows.map(row => mapRowToChapter(row));
}

/**
 * 根据索引获取章节
 */
export async function getChapter(
  bookUrl: string,
  chapterIndex: number
): Promise<BookChapter | null> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
    'SELECT * FROM chapters WHERE bookUrl = ? AND "index" = ?',
    [bookUrl, chapterIndex]
  );
  return rows.length > 0 ? mapRowToChapter(rows[0]) : null;
}

/**
 * 根据标题获取章节
 */
export async function getChapterByTitle(
  bookUrl: string,
  title: string
): Promise<BookChapter | null> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
    'SELECT * FROM chapters WHERE bookUrl = ? AND title = ?',
    [bookUrl, title]
  );
  return rows.length > 0 ? mapRowToChapter(rows[0]) : null;
}

/**
 * 搜索章节
 */
export async function searchChapters(
  bookUrl: string,
  keyword: string
): Promise<BookChapter[]> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
    'SELECT * FROM chapters WHERE bookUrl = ? AND title LIKE ? || ? || ? ORDER BY "index"',
    [bookUrl, '%', keyword, '%']
  );
  return rows.map(row => mapRowToChapter(row));
}

/**
 * 在指定范围内搜索章节
 */
export async function searchChaptersInRange(
  bookUrl: string,
  keyword: string,
  start: number,
  end: number
): Promise<BookChapter[]> {
  const db = await getDatabase();
  const rows = await db.select<Array<Record<string, unknown>>>(
    `SELECT * FROM chapters 
     WHERE bookUrl = ? AND "index" >= ? AND "index" <= ? 
     AND title LIKE ? || ? || ?
     ORDER BY "index"`,
    [bookUrl, start, end, '%', keyword, '%']
  );
  return rows.map(row => mapRowToChapter(row));
}

/**
 * 获取章节数量
 */
export async function getChapterCount(bookUrl: string): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ count: number }>>(
    'SELECT COUNT(url) as count FROM chapters WHERE bookUrl = ?',
    [bookUrl]
  );
  return rows[0]?.count ?? 0;
}

/**
 * 插入章节（如果存在则替换）
 */
export async function insertChapter(chapter: NewBookChapter): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO chapters (
      url, title, isVolume, baseUrl, bookUrl, "index",
      isVip, isPay, resourceUrl, tag, wordCount, variable
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      chapter.url,
      chapter.title,
      chapter.isVolume ? 1 : 0,
      chapter.baseUrl ?? '',
      chapter.bookUrl,
      chapter.index,
      chapter.isVip ? 1 : 0,
      chapter.isPay ? 1 : 0,
      chapter.resourceUrl ?? null,
      chapter.tag ?? null,
      chapter.wordCount ?? null,
      chapter.variable ?? null,
    ]
  );
}

/**
 * 批量插入章节
 */
export async function insertChapters(
  chapters: NewBookChapter[]
): Promise<void> {
  const db = await getDatabase();
  
  // 使用事务批量插入
  for (const chapter of chapters) {
    await insertChapter(chapter);
  }
}

/**
 * 更新章节
 */
export async function updateChapter(chapter: BookChapter): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE chapters SET
      title = ?, isVolume = ?, baseUrl = ?,
      isVip = ?, isPay = ?, resourceUrl = ?,
      tag = ?, wordCount = ?, start = ?,
      "end" = ?, startFragmentId = ?, endFragmentId = ?,
      variable = ?
    WHERE url = ? AND bookUrl = ?`,
    [
      chapter.title,
      chapter.isVolume ? 1 : 0,
      chapter.baseUrl,
      chapter.isVip ? 1 : 0,
      chapter.isPay ? 1 : 0,
      chapter.resourceUrl ?? null,
      chapter.tag ?? null,
      chapter.wordCount ?? null,
      chapter.start ?? null,
      chapter.end ?? null,
      chapter.startFragmentId ?? null,
      chapter.endFragmentId ?? null,
      chapter.variable ?? null,
      chapter.url,
      chapter.bookUrl,
    ]
  );
}

/**
 * 更新章节字数
 */
export async function updateChapterWordCount(
  bookUrl: string,
  url: string,
  wordCount: string
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'UPDATE chapters SET wordCount = ? WHERE bookUrl = ? AND url = ?',
    [wordCount, bookUrl, url]
  );
}

/**
 * 删除书籍的所有章节
 */
export async function deleteChaptersByBook(bookUrl: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM chapters WHERE bookUrl = ?', [bookUrl]);
}

/**
 * 将数据库行映射为BookChapter对象
 */
function mapRowToChapter(row: Record<string, unknown>): BookChapter {
  return {
    url: String(row.url ?? ''),
    title: String(row.title ?? ''),
    isVolume: Boolean(row.isVolume ?? 0),
    baseUrl: String(row.baseUrl ?? ''),
    bookUrl: String(row.bookUrl ?? ''),
    index: Number(row.index ?? 0),
    isVip: Boolean(row.isVip ?? 0),
    isPay: Boolean(row.isPay ?? 0),
    resourceUrl: row.resourceUrl ? String(row.resourceUrl) : undefined,
    tag: row.tag ? String(row.tag) : undefined,
    wordCount: row.wordCount ? String(row.wordCount) : undefined,
    start: row.start != null && row.start !== '' ? Number(row.start) : undefined,
    end: row.end != null && row.end !== '' ? Number(row.end) : undefined,
    startFragmentId: row.startFragmentId
      ? String(row.startFragmentId)
      : undefined,
    endFragmentId: row.endFragmentId ? String(row.endFragmentId) : undefined,
    variable: row.variable ? String(row.variable) : undefined,
  };
}
