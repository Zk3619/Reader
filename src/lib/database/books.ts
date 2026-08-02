/**
 * 书籍数据访问对象
 * 对应 legado 项目的 BookDao.kt
 */

import {
  SQL_AUDIO_BOOK_CONDITION,
  SQL_LOCAL_BOOK_CONDITION,
  SQL_NETWORK_BOOK_CONDITION,
  resolveMediaKind,
  type MediaKind,
} from '@/lib/book-source/book-type';
import { getDatabase } from '@/lib/database/database-core';
import {
  addGroupItem,
  getPreviewItemsByKind,
  rebuildGroupMaskFromItems,
  removeGroupItem,
} from '@/lib/database/media-groups';
import { ReaderTables, ShellTables } from '@/lib/database/table-names';
import { bookFromPreviewItem } from '@/lib/bookshelf/preview-book';
import type { Book, NewBook } from '@/types';
import { MediaGroupId } from '@/types/book-group';

export type ReadProgressUpdate = {
  chapterIndex: number;
  /** 0–1 章内滚动比例 */
  chapterPos: number;
  chapterTitle?: string;
};

/**
 * 获取所有书籍
 */
export async function getAllBooks(): Promise<Book[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${ReaderTables.books} ORDER BY durChapterTime DESC`
  );
  return rows.map(row => mapRowToBook(row));
}

/**
 * 按媒体种类过滤书籍（运行时 resolveMediaKind，兼容历史 type 脏数据）
 */
export async function getBooksByMediaKind(kind: MediaKind): Promise<Book[]> {
  const all = await getAllBooks();
  return all.filter((book) => resolveMediaKind(book) === kind);
}

/**
 * 按分组与媒体种类获取书籍（先 getBooksByGroup，再 resolveMediaKind 过滤）
 */
export async function getBooksByGroupAndKind(
  groupId: number,
  kind: MediaKind,
): Promise<Book[]> {
  if (groupId === MediaGroupId.Preview) {
    const previews = await getPreviewItemsByKind(kind);
    return previews
      .map((item) => bookFromPreviewItem(item))
      .filter((b): b is Book => b != null);
  }
  const books = await getBooksByGroup(groupId);
  return books.filter((book) => resolveMediaKind(book) === kind);
}

/**
 * 按分组与媒体种类统计书籍数量
 */
export async function getBookCountByGroupAndKind(
  groupId: number,
  kind: MediaKind,
): Promise<number> {
  if (groupId === MediaGroupId.Preview) {
    const previews = await getPreviewItemsByKind(kind);
    return previews.length;
  }
  const books = await getBooksByGroupAndKind(groupId, kind);
  return books.length;
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
    case MediaGroupId.All:
      query = `SELECT * FROM ${ReaderTables.books} ORDER BY durChapterTime DESC`;
      break;
    case MediaGroupId.Local:
      query = `SELECT * FROM ${ReaderTables.books} WHERE ${SQL_LOCAL_BOOK_CONDITION} ORDER BY "order"`;
      break;
    case MediaGroupId.Favorite:
      query = `SELECT b.* FROM ${ReaderTables.books} b
        INNER JOIN ${ShellTables.favorites} fav
          ON fav.item_id = b.bookUrl AND fav.item_kind = 'book'
        ORDER BY fav.sort_order ASC, b.durChapterTime DESC`;
      break;
    case MediaGroupId.NetNone:
      query = `SELECT b.* FROM ${ReaderTables.books} b
        WHERE ${SQL_NETWORK_BOOK_CONDITION} AND NOT (${SQL_AUDIO_BOOK_CONDITION})
        AND NOT EXISTS (
          SELECT 1 FROM ${ReaderTables.bookGroupItems} mgi
          WHERE mgi.item_id = b.bookUrl AND mgi.group_id > 0
        )
        ORDER BY b."order"`;
      break;
    case MediaGroupId.LocalNone:
      query = `SELECT b.* FROM ${ReaderTables.books} b
        WHERE ${SQL_LOCAL_BOOK_CONDITION}
        AND NOT EXISTS (
          SELECT 1 FROM ${ReaderTables.bookGroupItems} mgi
          WHERE mgi.item_id = b.bookUrl AND mgi.group_id > 0
        )
        ORDER BY b."order"`;
      break;
    case MediaGroupId.Error:
      query = `SELECT * FROM ${ReaderTables.books} WHERE type & 16 > 0 ORDER BY durChapterTime DESC`;
      break;
    case MediaGroupId.Preview: {
      const previews = await getPreviewItemsByKind();
      return previews
        .map((item) => bookFromPreviewItem(item))
        .filter((b): b is Book => b != null);
    }
    default:
      query = `SELECT b.* FROM ${ReaderTables.books} b
        INNER JOIN ${ReaderTables.bookGroupItems} mgi
          ON mgi.item_id = b.bookUrl AND mgi.group_id = ?
        ORDER BY mgi.sort_order ASC, b."order"`;
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
    case MediaGroupId.All:
      query = `SELECT COUNT(*) as count FROM ${ReaderTables.books}`;
      break;
    case MediaGroupId.Local:
      query = `SELECT COUNT(*) as count FROM ${ReaderTables.books} WHERE ${SQL_LOCAL_BOOK_CONDITION}`;
      break;
    case MediaGroupId.Favorite:
      query = `SELECT COUNT(*) as count FROM ${ReaderTables.books} b
        INNER JOIN ${ShellTables.favorites} fav
          ON fav.item_id = b.bookUrl AND fav.item_kind = 'book'`;
      break;
    case MediaGroupId.NetNone:
      query = `SELECT COUNT(*) as count FROM ${ReaderTables.books} b
        WHERE ${SQL_NETWORK_BOOK_CONDITION} AND NOT (${SQL_AUDIO_BOOK_CONDITION})
        AND NOT EXISTS (
          SELECT 1 FROM ${ReaderTables.bookGroupItems} mgi
          WHERE mgi.item_id = b.bookUrl AND mgi.group_id > 0
        )`;
      break;
    case MediaGroupId.LocalNone:
      query = `SELECT COUNT(*) as count FROM ${ReaderTables.books} b
        WHERE ${SQL_LOCAL_BOOK_CONDITION}
        AND NOT EXISTS (
          SELECT 1 FROM ${ReaderTables.bookGroupItems} mgi
          WHERE mgi.item_id = b.bookUrl AND mgi.group_id > 0
        )`;
      break;
    case MediaGroupId.Error:
      query = `SELECT COUNT(*) as count FROM ${ReaderTables.books} WHERE type & 16 > 0`;
      break;
    case MediaGroupId.Preview: {
      const previews = await getPreviewItemsByKind();
      return previews.length;
    }
    default:
      query = `SELECT COUNT(*) as count FROM ${ReaderTables.bookGroupItems}
        WHERE group_id = ?`;
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
    `SELECT * FROM ${ReaderTables.books} WHERE bookUrl = ?`,
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
    `SELECT * FROM ${ReaderTables.books} WHERE name = ? AND author = ?`,
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
    `SELECT * FROM ${ReaderTables.books} 
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
    `SELECT COUNT(*) as count FROM ${ReaderTables.books} WHERE bookUrl = ?`,
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
  const orderRows = await db.select<{ minOrder: number }>(
    `SELECT COALESCE(MIN("order"), 0) as minOrder FROM ${ReaderTables.books}`
  );
  const topOrder = Number(orderRows[0]?.minOrder ?? 0) - 1;

  await db.execute(
    `INSERT INTO ${ReaderTables.books} (
      bookUrl, tocUrl, origin, originName, name, author, kind,
      intro, coverUrl, charset, type, "group", latestChapterTime,
      lastCheckTime, durChapterTime, "order", variable
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      now, // latestChapterTime：对齐 legado，新入架视为最新
      now, // lastCheckTime
      now, // durChapterTime：对齐 legado，写入加入书架时间
      topOrder, // order：手动排序默认插到首位
      book.variable ?? null,
    ]
  );
}

/**
 * 更换书籍主键 bookUrl（目录更新后 bookUrl 可能变化）
 */
export async function replaceBookUrl(oldBookUrl: string, book: Book): Promise<void> {
  if (oldBookUrl === book.bookUrl) {
    await updateBook(book);
    return;
  }
  const db = await getDatabase();
  await db.execute(
    `UPDATE ${ReaderTables.books} SET
      bookUrl = ?, tocUrl = ?, origin = ?, originName = ?, name = ?, author = ?,
      kind = ?, customTag = ?, coverUrl = ?, customCoverUrl = ?,
      intro = ?, customIntro = ?, charset = ?, type = ?, "group" = ?,
      latestChapterTitle = ?, latestChapterTime = ?,
      lastCheckTime = ?, lastCheckCount = ?, totalChapterNum = ?,
      durChapterTitle = ?, durChapterIndex = ?, durChapterPos = ?,
      durVolumeIndex = ?, chapterInVolumeIndex = ?,
      durChapterTime = ?, wordCount = ?, canUpdate = ?,
      "order" = ?, originOrder = ?, variable = ?, readConfig = ?,
      syncTime = ?
    WHERE bookUrl = ?`,
    [
      book.bookUrl,
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
      book.durVolumeIndex ?? 0,
      book.chapterInVolumeIndex ?? 0,
      book.durChapterTime,
      book.wordCount ?? null,
      book.canUpdate ? 1 : 0,
      book.order,
      book.originOrder,
      book.variable ?? null,
      book.readConfig ? JSON.stringify(book.readConfig) : null,
      book.syncTime,
      oldBookUrl,
    ]
  );
  await db.execute(`UPDATE ${ReaderTables.chapters} SET bookUrl = ? WHERE bookUrl = ?`, [
    book.bookUrl,
    oldBookUrl,
  ]);
}

/**
 * 更新书籍
 */
export async function updateBook(book: Book): Promise<void> {
  const db = await getDatabase();

  await db.execute(
    `UPDATE ${ReaderTables.books} SET
      tocUrl = ?, origin = ?, originName = ?, name = ?, author = ?,
      kind = ?, customTag = ?, coverUrl = ?, customCoverUrl = ?,
      intro = ?, customIntro = ?, charset = ?, type = ?, "group" = ?,
      latestChapterTitle = ?, latestChapterTime = ?,
      lastCheckTime = ?, lastCheckCount = ?, totalChapterNum = ?,
      durChapterTitle = ?, durChapterIndex = ?, durChapterPos = ?,
      durVolumeIndex = ?, chapterInVolumeIndex = ?,
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
      book.durVolumeIndex ?? 0,
      book.chapterInVolumeIndex ?? 0,
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
  update: ReadProgressUpdate
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  const chapterPos = Math.min(1, Math.max(0, update.chapterPos));

  await db.execute(
    `UPDATE ${ReaderTables.books} SET
      durChapterIndex = ?,
      durChapterPos = ?,
      durChapterTime = ?,
      durChapterTitle = ?
    WHERE bookUrl = ?`,
    [
      update.chapterIndex,
      chapterPos,
      now,
      update.chapterTitle ?? null,
      bookUrl,
    ]
  );
}

/**
 * 删除书籍
 */
export async function deleteBook(bookUrl: string): Promise<void> {
  const existing = await getBook(bookUrl);
  if (existing) {
    const { deleteCachedChaptersByBook } = await import('@/lib/chapter-cache/storage');
    await deleteCachedChaptersByBook(existing);
  }
  const db = await getDatabase();
  // 由于外键约束，删除书籍时会自动删除相关章节
  await db.execute(`DELETE FROM ${ReaderTables.books} WHERE bookUrl = ?`, [bookUrl]);
}

/** 批量设置是否允许更新 */
export async function updateBooksCanUpdate(
  bookUrls: string[],
  canUpdate: boolean
): Promise<void> {
  if (bookUrls.length === 0) return;
  const db = await getDatabase();
  const value = canUpdate ? 1 : 0;
  for (const bookUrl of bookUrls) {
    await db.execute(`UPDATE ${ReaderTables.books} SET canUpdate = ? WHERE bookUrl = ?`, [value, bookUrl]);
  }
}

/** 批量设置分组掩码（写入 bookGroupItems / favorites 并同步 books."group" 供导出） */
export async function updateBooksGroupMask(
  bookUrls: string[],
  groupMask: number
): Promise<void> {
  if (bookUrls.length === 0) return;
  const db = await getDatabase();
  const shelfGroups = await db.select<{ groupId: number }>(
    `SELECT groupId FROM ${ReaderTables.bookGroups} WHERE groupId > 0`,
  );
  const shelfIds = shelfGroups.map((g) => Number(g.groupId));
  const managedIds = [...shelfIds, MediaGroupId.Favorite];

  for (const bookUrl of bookUrls) {
    for (const gid of managedIds) {
      if ((groupMask & gid) > 0) {
        await addGroupItem(gid, 'book', bookUrl);
      } else {
        await removeGroupItem(gid, 'book', bookUrl);
      }
    }
    const mask = await rebuildGroupMaskFromItems(bookUrl);
    await db.execute(`UPDATE ${ReaderTables.books} SET "group" = ? WHERE bookUrl = ?`, [mask, bookUrl]);
  }
}

/** 为所选书籍加入分组 */
export async function addBooksToGroupMask(
  bookUrls: string[],
  groupId: number
): Promise<void> {
  if (bookUrls.length === 0 || groupId <= 0) return;
  const db = await getDatabase();
  for (const bookUrl of bookUrls) {
    await addGroupItem(groupId, 'book', bookUrl);
    const mask = await rebuildGroupMaskFromItems(bookUrl);
    await db.execute(`UPDATE ${ReaderTables.books} SET "group" = ? WHERE bookUrl = ?`, [mask, bookUrl]);
  }
}

/** 为所选书籍移除分组 */
export async function removeBooksFromGroupMask(
  bookUrls: string[],
  groupId: number
): Promise<void> {
  if (bookUrls.length === 0 || groupId <= 0) return;
  for (const bookUrl of bookUrls) {
    await removeGroupItem(groupId, 'book', bookUrl);
  }
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
    await db.execute(`UPDATE ${ReaderTables.books} SET "order" = ? WHERE bookUrl = ?`, [order, bookUrl]);
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
    `UPDATE ${ReaderTables.books} SET "group" = ? WHERE "group" = ?`,
    [newGroupId, oldGroupId]
  );
}

/**
 * 移除书籍分组
 */
export async function removeBookGroup(groupId: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `DELETE FROM ${ReaderTables.bookGroupItems} WHERE group_id = ?`,
    [groupId],
  );
}

/**
 * 获取书籍总数
 */
export async function getBookCount(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${ReaderTables.books}`
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
    `SELECT * FROM ${ReaderTables.books} 
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
  const variable = row.variable ? String(row.variable) : undefined;
  const base: Book = {
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
    durVolumeIndex: Number(row.durVolumeIndex ?? 0),
    chapterInVolumeIndex: Number(row.chapterInVolumeIndex ?? 0),
    durChapterTime: Number(row.durChapterTime ?? 0),
    wordCount: row.wordCount ? String(row.wordCount) : undefined,
    canUpdate: Boolean(row.canUpdate ?? 1),
    order: Number(row.order ?? 0),
    originOrder: Number(row.originOrder ?? 0),
    variable,
    readConfig: row.readConfig
      ? (JSON.parse(String(row.readConfig)) as Book['readConfig'])
      : undefined,
    syncTime: Number(row.syncTime ?? 0),
  };
  return base;
}
