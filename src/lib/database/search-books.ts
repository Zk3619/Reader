/**
 * 搜索结果数据访问对象
 * 对应 legado 项目的 SearchBookDao.kt
 */

import { getDatabase } from '@/lib/database/database-core';
import type { SearchBook } from '@/types';
import { UNGROUPED_SOURCE_LABEL } from '@/lib/sources/source-list-filter';

/**
 * 插入搜索结果（如果存在则替换）
 */
export async function insertSearchBook(book: SearchBook): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO searchBooks (
      bookUrl, origin, originName, type, name, author, kind,
      coverUrl, intro, wordCount, latestChapterTitle, tocUrl,
      time, variable, originOrder, chapterWordCountText,
      chapterWordCount, respondTime
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      book.bookUrl,
      book.origin,
      book.originName,
      book.type,
      book.name,
      book.author,
      book.kind ?? null,
      book.coverUrl ?? null,
      book.intro ?? null,
      book.wordCount ?? null,
      book.latestChapterTitle ?? null,
      book.tocUrl,
      book.time,
      book.variable ?? null,
      book.originOrder,
      book.chapterWordCountText ?? null,
      book.chapterWordCount,
      book.respondTime,
    ]
  );
}

/**
 * 批量插入搜索结果
 */
export async function insertSearchBooks(books: SearchBook[]): Promise<void> {
  for (const book of books) {
    await insertSearchBook(book);
  }
}

/**
 * 根据bookUrl获取搜索结果
 */
export async function getSearchBook(
  bookUrl: string
): Promise<SearchBook | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM searchBooks WHERE bookUrl = ?',
    [bookUrl]
  );
  return rows.length > 0 ? mapRowToSearchBook(rows[0]) : null;
}

/**
 * 根据书源获取搜索结果
 */
export async function getSearchBooksByOrigin(
  origin: string
): Promise<SearchBook[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM searchBooks WHERE origin = ? ORDER BY originOrder DESC',
    [origin]
  );
  return rows.map(row => mapRowToSearchBook(row));
}

/**
 * 删除搜索结果
 */
export async function deleteSearchBook(bookUrl: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM searchBooks WHERE bookUrl = ?', [bookUrl]);
}

/**
 * 清空所有搜索结果
 */
export async function clearSearchBooks(): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM searchBooks');
}

function sourceMatchesAnyGroup(sourceGroup: string | undefined, groupNames: string[]): boolean {
  if (groupNames.length === 0) return true;
  const parts = sourceGroup?.split(/[,，;；]\s*/).map((s) => s.trim()).filter(Boolean) ?? [];
  if (parts.length === 0) {
    return groupNames.includes(UNGROUPED_SOURCE_LABEL);
  }
  return groupNames.some(
    (g) => g !== UNGROUPED_SOURCE_LABEL && parts.includes(g),
  );
}

/**
 * 换源：读取缓存的搜索结果（对齐 Legado SearchBookDao.changeSourceByGroup）
 */
export async function queryChangeSourceBooks(params: {
  name: string;
  author: string;
  checkAuthor: boolean;
  groupNames: string[];
  screenKey?: string;
}): Promise<SearchBook[]> {
  const db = await getDatabase();
  const name = params.name.trim();
  const author = params.checkAuthor ? params.author.trim() : '';
  const screen = params.screenKey?.trim() ?? '';

  let sql = 'SELECT * FROM searchBooks WHERE name = ?';
  const args: unknown[] = [name];
  if (author) {
    sql += ' AND author LIKE ?';
    args.push(`%${author}%`);
  }
  if (screen) {
    sql += ' AND (name LIKE ? OR originName LIKE ? OR latestChapterTitle LIKE ?)';
    const like = `%${screen}%`;
    args.push(like, like, like);
  }
  sql += ' ORDER BY originOrder ASC, respondTime ASC';

  const rows = await db.select<Record<string, unknown>>(sql, args);
  let books = rows.map((row) => mapRowToSearchBook(row));
  if (params.groupNames.length > 0) {
    const { getAllSources } = await import('@/lib/database/sources');
    const allowed = new Set(
      (await getAllSources())
        .filter(
          (s) => s.enabled && sourceMatchesAnyGroup(s.sourceGroup, params.groupNames),
        )
        .map((s) => s.sourceUrl),
    );
    books = books.filter((b) => allowed.has(b.origin));
  }
  return books;
}

/**
 * 删除指定书源下的换源缓存结果
 */
export async function deleteChangeSourceBooksByOrigin(origin: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM searchBooks WHERE origin = ?', [origin]);
}

/**
 * 将数据库行映射为SearchBook对象
 */
function mapRowToSearchBook(row: Record<string, unknown>): SearchBook {
  return {
    bookUrl: String(row.bookUrl ?? ''),
    origin: String(row.origin ?? ''),
    originName: String(row.originName ?? ''),
    type: Number(row.type ?? 0),
    name: String(row.name ?? ''),
    author: String(row.author ?? ''),
    kind: row.kind ? String(row.kind) : undefined,
    coverUrl: row.coverUrl ? String(row.coverUrl) : undefined,
    intro: row.intro ? String(row.intro) : undefined,
    wordCount: row.wordCount ? String(row.wordCount) : undefined,
    latestChapterTitle: row.latestChapterTitle
      ? String(row.latestChapterTitle)
      : undefined,
    tocUrl: String(row.tocUrl ?? ''),
    time: Number(row.time ?? 0),
    variable: row.variable ? String(row.variable) : undefined,
    originOrder: Number(row.originOrder ?? 0),
    chapterWordCountText: row.chapterWordCountText
      ? String(row.chapterWordCountText)
      : undefined,
    chapterWordCount: Number(row.chapterWordCount ?? -1),
    respondTime: Number(row.respondTime ?? -1),
  };
}
