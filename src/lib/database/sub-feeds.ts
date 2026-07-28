import { getDatabase } from '@/lib/database/database-core';
import { SubTables } from '@/lib/database/table-names';
import { assertNoLegacyRssSql, assertSubscribeTable } from '@/lib/database/subscribe-guard';

export interface SubFeedRow {
  id: string;
  sourceId: string | null;
  feedUrl: string;
  title: string;
  siteUrl: string | null;
  description: string | null;
  metaJson: string;
  createdAt: number;
  updatedAt: number;
}

function mapRow(row: Record<string, unknown>): SubFeedRow {
  return {
    id: String(row.id ?? ''),
    sourceId: row.source_id == null ? null : String(row.source_id),
    feedUrl: String(row.feed_url ?? ''),
    title: String(row.title ?? ''),
    siteUrl: row.site_url == null ? null : String(row.site_url),
    description: row.description == null ? null : String(row.description),
    metaJson: String(row.meta_json ?? '{}'),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

export async function listSubFeeds(sourceId?: string): Promise<SubFeedRow[]> {
  assertSubscribeTable(SubTables.feeds);
  const db = await getDatabase();
  const rows = sourceId
    ? await db.select<Record<string, unknown>>(
        `SELECT * FROM ${SubTables.feeds} WHERE source_id = ? ORDER BY updated_at DESC, title ASC`,
        [sourceId],
      )
    : await db.select<Record<string, unknown>>(
        `SELECT * FROM ${SubTables.feeds} ORDER BY updated_at DESC, title ASC`,
      );
  return rows.map(mapRow);
}

export async function getSubFeed(id: string): Promise<SubFeedRow | null> {
  assertSubscribeTable(SubTables.feeds);
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${SubTables.feeds} WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertSubFeed(
  row: Omit<SubFeedRow, 'createdAt' | 'updatedAt'> & { createdAt?: number; updatedAt?: number },
): Promise<void> {
  assertSubscribeTable(SubTables.feeds);
  const db = await getDatabase();
  const now = Date.now();
  const sql = `INSERT INTO ${SubTables.feeds}
      (id, source_id, feed_url, title, site_url, description, meta_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_id = excluded.source_id,
      feed_url = excluded.feed_url,
      title = excluded.title,
      site_url = excluded.site_url,
      description = excluded.description,
      meta_json = excluded.meta_json,
      updated_at = excluded.updated_at`;
  assertNoLegacyRssSql(sql);
  await db.execute(sql, [
    row.id,
    row.sourceId ?? null,
    row.feedUrl.trim(),
    row.title.trim(),
    row.siteUrl?.trim() || null,
    row.description ?? null,
    row.metaJson || '{}',
    row.createdAt ?? now,
    row.updatedAt ?? now,
  ]);
}

export async function deleteSubFeed(id: string): Promise<void> {
  assertSubscribeTable(SubTables.feeds);
  const db = await getDatabase();
  const sql = `DELETE FROM ${SubTables.feeds} WHERE id = ?`;
  assertNoLegacyRssSql(sql);
  await db.execute(sql, [id]);
}

export async function deleteSubFeedsBySource(sourceId: string): Promise<void> {
  assertSubscribeTable(SubTables.feeds);
  const db = await getDatabase();
  const sql = `DELETE FROM ${SubTables.feeds} WHERE source_id = ?`;
  assertNoLegacyRssSql(sql);
  await db.execute(sql, [sourceId]);
}
