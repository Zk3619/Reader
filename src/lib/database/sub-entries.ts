import { getDatabase } from '@/lib/database/database-core';
import { SubTables } from '@/lib/database/table-names';
import { assertNoLegacyRssSql, assertSubscribeTable } from '@/lib/database/subscribe-guard';

export interface SubEntryRow {
  id: string;
  feedId: string;
  title: string;
  url: string | null;
  author: string | null;
  publishedAt: number | null;
  read: boolean;
  starred: boolean;
  content: string | null;
  metaJson: string;
  createdAt: number;
}

export interface SubEntryCursor {
  sortTime: number;
  createdAt: number;
  id: string;
}

export interface ListSubEntriesOptions {
  feedId?: string;
  feedIds?: string[];
  unreadOnly?: boolean;
  starredOnly?: boolean;
  query?: string;
  publishedAfter?: number;
  /** 下一页游标；按 sortTime、createdAt、id 三元组稳定翻页。 */
  before?: SubEntryCursor;
  limit?: number;
}

function mapRow(row: Record<string, unknown>): SubEntryRow {
  return {
    id: String(row.id ?? ''),
    feedId: String(row.feed_id ?? ''),
    title: String(row.title ?? ''),
    url: row.url == null ? null : String(row.url),
    author: row.author == null ? null : String(row.author),
    publishedAt: row.published_at == null ? null : Number(row.published_at),
    read: Boolean(row.read ?? 0),
    starred: Boolean(row.starred ?? 0),
    content: row.content == null ? null : String(row.content),
    metaJson: String(row.meta_json ?? '{}'),
    createdAt: Number(row.created_at ?? 0),
  };
}

export async function listSubEntries(options: ListSubEntriesOptions = {}): Promise<SubEntryRow[]> {
  assertSubscribeTable(SubTables.entries);
  const db = await getDatabase();
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.feedId) {
    where.push('feed_id = ?');
    params.push(options.feedId);
  } else if (options.feedIds?.length) {
    const feedIds = [...new Set(options.feedIds.filter(Boolean))];
    if (feedIds.length) {
      where.push(`feed_id IN (${feedIds.map(() => '?').join(', ')})`);
      params.push(...feedIds);
    }
  }
  if (options.unreadOnly) where.push('read = 0');
  if (options.starredOnly) where.push('starred = 1');
  if (options.publishedAfter != null) {
    where.push('published_at >= ?');
    params.push(options.publishedAfter);
  }
  if (options.before) {
    const sortExpr = 'COALESCE(published_at, created_at)';
    where.push(`(
      ${sortExpr} < ?
      OR (${sortExpr} = ? AND created_at < ?)
      OR (${sortExpr} = ? AND created_at = ? AND id < ?)
    )`);
    params.push(
      options.before.sortTime,
      options.before.sortTime,
      options.before.createdAt,
      options.before.sortTime,
      options.before.createdAt,
      options.before.id,
    );
  }
  if (options.query?.trim()) {
    where.push('(title LIKE ? OR content LIKE ?)');
    const q = `%${options.query.trim()}%`;
    params.push(q, q);
  }
  // service 会多取 1 条判断 hasMore；允许 100 + 1。
  const limit = Math.max(1, Math.min(101, options.limit ?? 20));
  const sql = `SELECT * FROM ${SubTables.entries}${
    where.length ? ` WHERE ${where.join(' AND ')}` : ''
  } ORDER BY COALESCE(published_at, created_at) DESC, created_at DESC, id DESC LIMIT ?`;
  params.push(limit);
  const rows = await db.select<Record<string, unknown>>(sql, params);
  return rows.map(mapRow);
}

export async function upsertSubEntry(
  row: Omit<SubEntryRow, 'createdAt'> & { createdAt?: number },
): Promise<void> {
  assertSubscribeTable(SubTables.entries);
  const db = await getDatabase();
  const now = Date.now();
  const url = row.url?.trim() || null;

  // 同 feed + url 已存在时更新内容，保留原 id / read / starred（GUID 变化也能对齐最新）
  if (url) {
    const existing = await db.select<Record<string, unknown>>(
      `SELECT id FROM ${SubTables.entries} WHERE feed_id = ? AND url = ? LIMIT 1`,
      [row.feedId, url],
    );
    if (existing[0]?.id) {
      const sql = `UPDATE ${SubTables.entries}
        SET title = ?, author = ?, published_at = ?, content = ?, meta_json = ?
        WHERE id = ?`;
      assertNoLegacyRssSql(sql);
      await db.execute(sql, [
        row.title.trim(),
        row.author?.trim() || null,
        row.publishedAt ?? null,
        row.content ?? null,
        row.metaJson || '{}',
        String(existing[0].id),
      ]);
      return;
    }
  }

  const sql = `INSERT INTO ${SubTables.entries}
      (id, feed_id, title, url, author, published_at, read, starred, content, meta_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      feed_id = excluded.feed_id,
      title = excluded.title,
      url = excluded.url,
      author = excluded.author,
      published_at = excluded.published_at,
      content = excluded.content,
      meta_json = excluded.meta_json`;
  assertNoLegacyRssSql(sql);
  await db.execute(sql, [
    row.id,
    row.feedId,
    row.title.trim(),
    url,
    row.author?.trim() || null,
    row.publishedAt ?? null,
    row.read ? 1 : 0,
    row.starred ? 1 : 0,
    row.content ?? null,
    row.metaJson || '{}',
    row.createdAt ?? now,
  ]);
}

export async function getSubEntry(id: string): Promise<SubEntryRow | null> {
  assertSubscribeTable(SubTables.entries);
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${SubTables.entries} WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function markSubEntryRead(id: string, read: boolean): Promise<void> {
  assertSubscribeTable(SubTables.entries);
  const db = await getDatabase();
  const sql = `UPDATE ${SubTables.entries} SET read = ? WHERE id = ?`;
  assertNoLegacyRssSql(sql);
  await db.execute(sql, [read ? 1 : 0, id]);
}

export async function markSubEntryStarred(id: string, starred: boolean): Promise<void> {
  assertSubscribeTable(SubTables.entries);
  const db = await getDatabase();
  const sql = `UPDATE ${SubTables.entries} SET starred = ? WHERE id = ?`;
  assertNoLegacyRssSql(sql);
  await db.execute(sql, [starred ? 1 : 0, id]);
}

export async function markAllSubEntriesRead(feedIds?: string[]): Promise<void> {
  assertSubscribeTable(SubTables.entries);
  const db = await getDatabase();
  if (!feedIds?.length) {
    const sql = `UPDATE ${SubTables.entries} SET read = 1 WHERE read = 0`;
    assertNoLegacyRssSql(sql);
    await db.execute(sql);
    return;
  }
  const placeholders = feedIds.map(() => '?').join(', ');
  const sql = `UPDATE ${SubTables.entries} SET read = 1 WHERE read = 0 AND feed_id IN (${placeholders})`;
  assertNoLegacyRssSql(sql);
  await db.execute(sql, feedIds);
}

export async function deleteSubEntriesByFeed(feedId: string): Promise<void> {
  assertSubscribeTable(SubTables.entries);
  const db = await getDatabase();
  const sql = `DELETE FROM ${SubTables.entries} WHERE feed_id = ?`;
  assertNoLegacyRssSql(sql);
  await db.execute(sql, [feedId]);
}

export async function getAllSubEntries(): Promise<SubEntryRow[]> {
  assertSubscribeTable(SubTables.entries);
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${SubTables.entries} ORDER BY created_at DESC`,
  );
  return rows.map(mapRow);
}

export async function countUnreadByFeed(): Promise<Map<string, number>> {
  assertSubscribeTable(SubTables.entries);
  const db = await getDatabase();
  const rows = await db.select<{ feed_id: string; count: number }>(
    `SELECT feed_id, COUNT(*) as count FROM ${SubTables.entries} WHERE read = 0 GROUP BY feed_id`,
  );
  const map = new Map<string, number>();
  for (const row of rows) map.set(String(row.feed_id), Number(row.count ?? 0));
  return map;
}
