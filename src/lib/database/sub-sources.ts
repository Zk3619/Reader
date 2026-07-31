import { getDatabase } from '@/lib/database/database-core';
import { SubTables } from '@/lib/database/table-names';
import { assertNoLegacyRssSql, assertSubscribeTable } from '@/lib/database/subscribe-guard';
import { normalizeSubscribeFeedView } from '@/lib/subscribe/feed-view';

export type SubSourceType = 'opml' | 'rss' | 'atom' | 'json';

export interface SubSourceRow {
  id: string;
  url: string;
  type: SubSourceType;
  title: string;
  category: string;
  /** Folo FeedViewType：0 文章 … 5 通知（不含客户端「全部」） */
  view: number;
  enabled: boolean;
  lastFetchAt: number | null;
  metaJson: string;
  createdAt: number;
  updatedAt: number;
}

function mapRow(row: Record<string, unknown>): SubSourceRow {
  return {
    id: String(row.id ?? ''),
    url: String(row.url ?? ''),
    type: (String(row.type ?? 'opml') as SubSourceType) || 'opml',
    title: String(row.title ?? ''),
    category: String(row.category ?? ''),
    view: normalizeSubscribeFeedView(row.view),
    enabled: Boolean(row.enabled ?? 1),
    lastFetchAt: row.last_fetch_at == null ? null : Number(row.last_fetch_at),
    metaJson: String(row.meta_json ?? '{}'),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

export async function listSubSources(enabledOnly = false): Promise<SubSourceRow[]> {
  assertSubscribeTable(SubTables.sources);
  const db = await getDatabase();
  const sql = enabledOnly
    ? `SELECT * FROM ${SubTables.sources} WHERE enabled = 1 ORDER BY category ASC, updated_at DESC, title ASC`
    : `SELECT * FROM ${SubTables.sources} ORDER BY category ASC, updated_at DESC, title ASC`;
  const rows = await db.select<Record<string, unknown>>(sql);
  return rows.map(mapRow);
}

export async function getSubSource(id: string): Promise<SubSourceRow | null> {
  assertSubscribeTable(SubTables.sources);
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${SubTables.sources} WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getSubSourceByUrl(url: string): Promise<SubSourceRow | null> {
  assertSubscribeTable(SubTables.sources);
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${SubTables.sources} WHERE url = ? LIMIT 1`,
    [url.trim()],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertSubSource(
  row: Omit<SubSourceRow, 'createdAt' | 'updatedAt' | 'lastFetchAt'> & {
    createdAt?: number;
    updatedAt?: number;
    lastFetchAt?: number | null;
  },
): Promise<void> {
  assertSubscribeTable(SubTables.sources);
  const db = await getDatabase();
  const now = Date.now();
  const view = normalizeSubscribeFeedView(row.view);
  const sql = `INSERT INTO ${SubTables.sources}
      (id, url, type, title, category, view, enabled, last_fetch_at, meta_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      url = excluded.url,
      type = excluded.type,
      title = excluded.title,
      category = excluded.category,
      view = excluded.view,
      enabled = excluded.enabled,
      last_fetch_at = excluded.last_fetch_at,
      meta_json = excluded.meta_json,
      updated_at = excluded.updated_at`;
  assertNoLegacyRssSql(sql);
  await db.execute(sql, [
    row.id,
    row.url.trim(),
    row.type,
    row.title.trim(),
    (row.category ?? '').trim(),
    view,
    row.enabled ? 1 : 0,
    row.lastFetchAt ?? null,
    row.metaJson || '{}',
    row.createdAt ?? now,
    row.updatedAt ?? now,
  ]);
}

export async function updateSubSourceMeta(
  id: string,
  patch: { title?: string; category?: string; view?: number },
): Promise<void> {
  assertSubscribeTable(SubTables.sources);
  const existing = await getSubSource(id);
  if (!existing) throw new Error('订阅源不存在');
  await upsertSubSource({
    ...existing,
    title: patch.title?.trim() || existing.title,
    category: patch.category !== undefined ? patch.category.trim() : existing.category,
    view: patch.view !== undefined ? normalizeSubscribeFeedView(patch.view) : existing.view,
  });
}

export async function setSubSourceEnabled(id: string, enabled: boolean): Promise<void> {
  assertSubscribeTable(SubTables.sources);
  const db = await getDatabase();
  const sql = `UPDATE ${SubTables.sources} SET enabled = ?, updated_at = ? WHERE id = ?`;
  assertNoLegacyRssSql(sql);
  await db.execute(sql, [enabled ? 1 : 0, Date.now(), id]);
}

export async function touchSubSourceFetchTime(id: string, at = Date.now()): Promise<void> {
  assertSubscribeTable(SubTables.sources);
  const db = await getDatabase();
  const sql = `UPDATE ${SubTables.sources} SET last_fetch_at = ?, updated_at = ? WHERE id = ?`;
  assertNoLegacyRssSql(sql);
  await db.execute(sql, [at, at, id]);
}

export async function deleteSubSource(id: string): Promise<void> {
  assertSubscribeTable(SubTables.sources);
  const db = await getDatabase();
  const sql = `DELETE FROM ${SubTables.sources} WHERE id = ?`;
  assertNoLegacyRssSql(sql);
  await db.execute(sql, [id]);
}
