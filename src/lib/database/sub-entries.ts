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

export interface ListSubEntriesOptions {
  feedId?: string;
  unreadOnly?: boolean;
  starredOnly?: boolean;
  query?: string;
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
  }
  if (options.unreadOnly) where.push('read = 0');
  if (options.starredOnly) where.push('starred = 1');
  if (options.query?.trim()) {
    where.push('(title LIKE ? OR content LIKE ?)');
    const q = `%${options.query.trim()}%`;
    params.push(q, q);
  }
  const limit = Math.max(1, Math.min(500, options.limit ?? 200));
  const sql = `SELECT * FROM ${SubTables.entries}${
    where.length ? ` WHERE ${where.join(' AND ')}` : ''
  } ORDER BY published_at DESC, created_at DESC LIMIT ?`;
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
  const sql = `INSERT INTO ${SubTables.entries}
      (id, feed_id, title, url, author, published_at, read, starred, content, meta_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      feed_id = excluded.feed_id,
      title = excluded.title,
      url = excluded.url,
      author = excluded.author,
      published_at = excluded.published_at,
      read = excluded.read,
      starred = excluded.starred,
      content = excluded.content,
      meta_json = excluded.meta_json`;
  assertNoLegacyRssSql(sql);
  await db.execute(sql, [
    row.id,
    row.feedId,
    row.title.trim(),
    row.url?.trim() || null,
    row.author?.trim() || null,
    row.publishedAt ?? null,
    row.read ? 1 : 0,
    row.starred ? 1 : 0,
    row.content ?? null,
    row.metaJson || '{}',
    row.createdAt ?? now,
  ]);
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
