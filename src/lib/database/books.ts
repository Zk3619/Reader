/**
 * 书籍数据访问对象
 * 对应 legado 项目的 BookDao.kt
 */

import { getDatabase } from './database-core';
import type { Book, NewBook } from '@/types';
import { BookGroupId } from '@/types/book-group';

/**
 * 获取所有书籍
 */
export async function getAllBooks(): Promise<Book[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM books ORDER BY durChapterTime DESC'
  );
  return rows.map(row => mapRowToBook(row));
}

/**
 * 根据分组获取书籍
 */
export async function getBooksByGroup(groupId: number): Promise<Book[]> {
  const db = await getDatabase();

  let query = '';
  const params: unknown[] = [];

  // 根据分组ID构建不同的查询
  switch (groupId) {
    case BookGroupId.All:
      query = 'SELECT * FROM books ORDER BY durChapterTime DESC';
      break;
    case BookGroupId.Local:
      query = 'SELECT * FROM books WHERE type & 4 > 0 ORDER BY "order"';
      break;
    case BookGroupId.Audio:
      query = 'SELECT * FROM books WHERE type & 2 > 0 ORDER BY "order"';
      break;
    case BookGroupId.NetNone:
      query = `SELECT * FROM books 
        WHERE type & 2 = 0 AND type & 4 = 0 
        AND ((SELECT sum(groupId) FROM book_groups WHERE groupId > 0) & "group") = 0
        ORDER BY "order"`;
      break;
    case BookGroupId.LocalNone:
      query = `SELECT * FROM books 
        WHERE type & 4 > 0 
        AND ((SELECT sum(groupId) FROM book_groups WHERE groupId > 0) & "group") = 0
        ORDER BY "order"`;
      break;
    case BookGroupId.Error:
      query = 'SELECT * FROM books WHERE type & 8 > 0 ORDER BY durChapterTime DESC';
      break;
    default:
      // 用户自定义分组（使用位运算）
      query = 'SELECT * FROM books WHERE ("group" & ?) > 0 ORDER BY "order"';
      params.push(groupId);
      break;
  }

  const rows = await db.select<Record<string, unknown>>(query, params);
  return rows.map(row => mapRowToBook(row));
}

/**
 * 根据分组获取书籍数量
 */
export async function getBookCountByGroup(groupId: number): Promise<number> {
  const db = await getDatabase();
  let query = '';
  const params: unknown[] = [];
  switch (groupId) {
    case BookGroupId.All:
      query = 'SELECT COUNT(*) as count FROM books';
      break;
    case BookGroupId.Local:
      query = 'SELECT COUNT(*) as count FROM books WHERE type & 4 > 0';
      break;
    case BookGroupId.Audio:
      query = 'SELECT COUNT(*) as count FROM books WHERE type & 2 > 0';
      break;
    case BookGroupId.NetNone:
      query = `SELECT COUNT(*) as count FROM books 
        WHERE type & 2 = 0 AND type & 4 = 0 
        AND ((SELECT sum(groupId) FROM book_groups WHERE groupId > 0) & "group") = 0`;
      break;
    case BookGroupId.LocalNone:
      query = `SELECT COUNT(*) as count FROM books 
        WHERE type & 4 > 0 
        AND ((SELECT sum(groupId) FROM book_groups WHERE groupId > 0) & "group") = 0`;
      break;
    case BookGroupId.Error:
      query = 'SELECT COUNT(*) as count FROM books WHERE type & 8 > 0';
      break;
    default:
      query = 'SELECT COUNT(*) as count FROM books WHERE ("group" & ?) > 0';
      params.push(groupId);
      break;
  }
  const rows = await db.select<{ count: number }>(query, params);
  return Number(rows[0]?.count ?? 0);
}

/**
 * 根据bookUrl获取书籍
 */
export async function getBook(bookUrl: string): Promise<Book | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM books WHERE bookUrl = ?',
    [bookUrl]
  );
  return rows.length > 0 ? mapRowToBook(rows[0]) : null;
}

/**
 * 根据书名和作者获取书籍
 */
export async function getBookByNameAndAuthor(
  name: string,
  author: string
): Promise<Book | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM books WHERE name = ? AND author = ?',
    [name, author]
  );
  const firstRow = rows[0];
  return firstRow ? mapRowToBook(firstRow) : null;
}

/**
 * 搜索书籍
 */
export async function searchBooks(keyword: string): Promise<Book[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM books 
     WHERE name LIKE '%' || ? || '%' OR author LIKE '%' || ? || '%'`,
    [keyword, keyword]
  );
  return rows.map(row => mapRowToBook(row));
}

/**
 * 检查书籍是否存在
 */
export async function hasBook(bookUrl: string): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<{ count: number }>(
    'SELECT COUNT(*) as count FROM books WHERE bookUrl = ?',
    [bookUrl]
  );
  return (rows[0]?.count ?? 0) > 0;
}

/**
 * 添加书籍
 */
export async function insertBook(book: NewBook): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();

  await db.execute(
    `INSERT INTO books (
      bookUrl, tocUrl, origin, originName, name, author, kind, 
      intro, coverUrl, charset, type, "group", lastCheckTime, durChapterTime
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      book.bookUrl,
      book.tocUrl ?? book.bookUrl,
      book.origin,
      book.originName ?? '',
      book.name,
      book.author ?? '',
      book.kind ?? null,
      book.intro ?? null,
      book.coverUrl ?? null,
      book.charset ?? null,
      book.type ?? 0,
      0, // group
      now, // lastCheckTime
      now, // durChapterTime
    ]
  );
}

/**
 * 更新书籍
 */
export async function updateBook(book: Book): Promise<void> {
  const db = await getDatabase();

  await db.execute(
    `UPDATE books SET
      tocUrl = ?, origin = ?, originName = ?, name = ?, author = ?,
      kind = ?, customTag = ?, coverUrl = ?, customCoverUrl = ?,
      intro = ?, customIntro = ?, charset = ?, type = ?, "group" = ?,
      latestChapterTitle = ?, latestChapterTime = ?,
      lastCheckTime = ?, lastCheckCount = ?, totalChapterNum = ?,
      durChapterTitle = ?, durChapterIndex = ?, durChapterPos = ?,
      durChapterTime = ?, wordCount = ?, canUpdate = ?,
      "order" = ?, originOrder = ?, variable = ?, readConfig = ?,
      syncTime = ?
    WHERE bookUrl = ?`,
    [
      book.tocUrl,
      book.origin,
      book.originName,
      book.name,
      book.author,
      book.kind ?? null,
      book.customTag ?? null,
      book.coverUrl ?? null,
      book.customCoverUrl ?? null,
      book.intro ?? null,
      book.customIntro ?? null,
      book.charset ?? null,
      book.type,
      book.group,
      book.latestChapterTitle ?? null,
      book.latestChapterTime,
      book.lastCheckTime,
      book.lastCheckCount,
      book.totalChapterNum,
      book.durChapterTitle ?? null,
      book.durChapterIndex,
      book.durChapterPos,
      book.durChapterTime,
      book.wordCount ?? null,
      book.canUpdate ? 1 : 0,
      book.order,
      book.originOrder,
      book.variable ?? null,
      book.readConfig ? JSON.stringify(book.readConfig) : null,
      book.syncTime,
      book.bookUrl,
    ]
  );
}

/**
 * 更新阅读进度
 */
export async function updateReadProgress(
  bookUrl: string,
  chapterIndex: number,
  chapterPos: number,
  chapterTitle?: string
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();

  await db.execute(
    `UPDATE books SET
      durChapterIndex = ?,
      durChapterPos = ?,
      durChapterTime = ?,
      durChapterTitle = ?
    WHERE bookUrl = ?`,
    [chapterIndex, chapterPos, now, chapterTitle ?? null, bookUrl]
  );
}

/**
 * 删除书籍
 */
export async function deleteBook(bookUrl: string): Promise<void> {
  const db = await getDatabase();
  // 由于外键约束，删除书籍时会自动删除相关章节
  await db.execute('DELETE FROM books WHERE bookUrl = ?', [bookUrl]);
}

/**
 * 批量更新书籍排序（手动排序时拖拽结束后调用）
 */
export async function updateBooksOrder(
  updates: Array<{ bookUrl: string; order: number }>
): Promise<void> {
  if (updates.length === 0) return;
  const db = await getDatabase();
  for (const { bookUrl, order } of updates) {
    await db.execute('UPDATE books SET "order" = ? WHERE bookUrl = ?', [order, bookUrl]);
  }
}

/**
 * 更新书籍分组
 */
export async function updateBookGroup(
  oldGroupId: number,
  newGroupId: number
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'UPDATE books SET "group" = ? WHERE "group" = ?',
    [newGroupId, oldGroupId]
  );
}

/**
 * 移除书籍分组
 */
export async function removeBookGroup(groupId: number): Promise<void> {
  const db = await getDatabase();
  // 使用位运算移除分组
  await db.execute(
    'UPDATE books SET "group" = "group" & ~? WHERE ("group" & ?) > 0',
    [groupId, groupId]
  );
}

/**
 * 获取书籍总数
 */
export async function getBookCount(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ count: number }>(
    'SELECT COUNT(*) as count FROM books'
  );
  const firstRow = rows[0];
  return firstRow?.count ?? 0;
}

/**
 * 获取最后阅读的书籍
 */
export async function getLastReadBook(): Promise<Book | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM books 
     WHERE type & 1 > 0 
     ORDER BY durChapterTime DESC 
     LIMIT 1`
  );
  return rows.length > 0 ? mapRowToBook(rows[0]) : null;
}

/**
 * 将数据库行映射为Book对象
 */
function mapRowToBook(row: Record<string, unknown>): Book {
  return {
    bookUrl: String(row.bookUrl ?? ''),
    tocUrl: String(row.tocUrl ?? ''),
    origin: String(row.origin ?? 'loc_book'),
    originName: String(row.originName ?? ''),
    name: String(row.name ?? ''),
    author: String(row.author ?? ''),
    kind: row.kind ? String(row.kind) : undefined,
    customTag: row.customTag ? String(row.customTag) : undefined,
    coverUrl: row.coverUrl ? String(row.coverUrl) : undefined,
    customCoverUrl: row.customCoverUrl ? String(row.customCoverUrl) : undefined,
    intro: row.intro ? String(row.intro) : undefined,
    customIntro: row.customIntro ? String(row.customIntro) : undefined,
    charset: row.charset ? String(row.charset) : undefined,
    type: Number(row.type ?? 0),
    group: Number(row.group ?? 0),
    latestChapterTitle: row.latestChapterTitle
      ? String(row.latestChapterTitle)
      : undefined,
    latestChapterTime: Number(row.latestChapterTime ?? 0),
    lastCheckTime: Number(row.lastCheckTime ?? 0),
    lastCheckCount: Number(row.lastCheckCount ?? 0),
    totalChapterNum: Number(row.totalChapterNum ?? 0),
    durChapterTitle: row.durChapterTitle ? String(row.durChapterTitle) : undefined,
    durChapterIndex: Number(row.durChapterIndex ?? 0),
    durChapterPos: Number(row.durChapterPos ?? 0),
    durChapterTime: Number(row.durChapterTime ?? 0),
    wordCount: row.wordCount ? String(row.wordCount) : undefined,
    canUpdate: Boolean(row.canUpdate ?? 1),
    order: Number(row.order ?? 0),
    originOrder: Number(row.originOrder ?? 0),
    variable: row.variable ? String(row.variable) : undefined,
    readConfig: row.readConfig
      ? (JSON.parse(String(row.readConfig)) as Book['readConfig'])
      : undefined,
    syncTime: Number(row.syncTime ?? 0),
  };
}
