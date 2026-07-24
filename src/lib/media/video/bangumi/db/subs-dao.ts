/**
 * video_bangumi_rule_subs DAO
 */

import { getDatabase } from '@/lib/database/database-core';
import { VideoTables } from '@/lib/database/table-names';

export type BangumiRuleSubRow = {
  url: string;
  enabled: boolean;
  lastFetchAt: number;
  lastError: string | null;
  createdAt: number;
};

function rowToSub(row: Record<string, unknown>): BangumiRuleSubRow {
  return {
    url: String(row.url ?? ''),
    enabled: Number(row.enabled ?? 1) !== 0,
    lastFetchAt: Number(row.last_fetch_at ?? 0),
    lastError: row.last_error != null ? String(row.last_error) : null,
    createdAt: Number(row.created_at ?? 0),
  };
}

export async function listBangumiRuleSubs(): Promise<BangumiRuleSubRow[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${VideoTables.bangumiRuleSubs} ORDER BY created_at ASC`,
  );
  return (rows ?? []).map(rowToSub).filter((r) => !!r.url);
}

export async function listEnabledBangumiRuleSubUrls(): Promise<string[]> {
  const rows = await listBangumiRuleSubs();
  return rows.filter((r) => r.enabled).map((r) => r.url);
}

export async function countBangumiRuleSubs(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ c: number }>(
    `SELECT COUNT(*) as c FROM ${VideoTables.bangumiRuleSubs}`,
  );
  return Number(rows?.[0]?.c ?? 0);
}

export async function upsertBangumiRuleSub(
  url: string,
  patch?: Partial<Pick<BangumiRuleSubRow, 'enabled' | 'lastFetchAt' | 'lastError'>>,
): Promise<void> {
  const u = url.trim();
  if (!u) return;
  const db = await getDatabase();
  const now = Date.now();
  const existing = await db.select<{ url: string }>(
    `SELECT url FROM ${VideoTables.bangumiRuleSubs} WHERE url = ? LIMIT 1`,
    [u],
  );
  if (existing?.[0]) {
    if (patch?.enabled !== undefined) {
      await db.execute(
        `UPDATE ${VideoTables.bangumiRuleSubs} SET enabled = ? WHERE url = ?`,
        [patch.enabled ? 1 : 0, u],
      );
    }
    if (patch?.lastFetchAt !== undefined) {
      await db.execute(
        `UPDATE ${VideoTables.bangumiRuleSubs} SET last_fetch_at = ? WHERE url = ?`,
        [patch.lastFetchAt, u],
      );
    }
    if (patch?.lastError !== undefined) {
      await db.execute(
        `UPDATE ${VideoTables.bangumiRuleSubs} SET last_error = ? WHERE url = ?`,
        [patch.lastError, u],
      );
    }
    return;
  }
  await db.execute(
    `INSERT INTO ${VideoTables.bangumiRuleSubs}
      (url, enabled, last_fetch_at, last_error, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      u,
      patch?.enabled === false ? 0 : 1,
      patch?.lastFetchAt ?? 0,
      patch?.lastError ?? null,
      now,
    ],
  );
}

export async function removeBangumiRuleSub(url: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${VideoTables.bangumiRuleSubs} WHERE url = ?`, [url.trim()]);
}

export async function replaceAllBangumiRuleSubs(urls: string[]): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${VideoTables.bangumiRuleSubs}`);
  const now = Date.now();
  const seen = new Set<string>();
  for (const raw of urls) {
    const u = raw.trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    await db.execute(
      `INSERT INTO ${VideoTables.bangumiRuleSubs}
        (url, enabled, last_fetch_at, last_error, created_at)
       VALUES (?, 1, 0, NULL, ?)`,
      [u, now],
    );
  }
}
