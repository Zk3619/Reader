/**
 * video_bangumi_rules DAO
 */

import { getDatabase } from '@/lib/database/database-core';
import { VideoTables } from '@/lib/database/table-names';
import type { BangumiRule } from '@/lib/media/video/bangumi/rules';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function rowToRule(row: Record<string, unknown>): BangumiRule | null {
  try {
    const payload = JSON.parse(String(row.payload_json ?? '{}')) as unknown;
    if (isRecord(payload) && typeof payload.id === 'string' && payload.id) {
      return {
        ...(payload as BangumiRule),
        id: String(row.id || payload.id),
        name: String(row.name || payload.name || ''),
        baseUrl: String(row.base_url || payload.baseUrl || ''),
        enabled: Number(row.enabled ?? 1) !== 0,
        kazumiApi:
          (typeof row.kazumi_api === 'string' && row.kazumi_api) ||
          (typeof payload.kazumiApi === 'string' ? payload.kazumiApi : undefined),
        version: 2,
      };
    }
  } catch {
    /* */
  }
  const id = String(row.id ?? '');
  const name = String(row.name ?? '');
  const baseUrl = String(row.base_url ?? '');
  if (!id || !name || !baseUrl) return null;
  return {
    id,
    name,
    baseUrl,
    enabled: Number(row.enabled ?? 1) !== 0,
    kazumiApi: typeof row.kazumi_api === 'string' ? row.kazumi_api : undefined,
    version: 2,
  };
}

export async function listBangumiRules(): Promise<BangumiRule[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${VideoTables.bangumiRules} ORDER BY name COLLATE NOCASE ASC`,
  );
  return (rows ?? [])
    .map(rowToRule)
    .filter((r): r is BangumiRule => r != null);
}

export async function countBangumiRules(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ c: number }>(
    `SELECT COUNT(*) as c FROM ${VideoTables.bangumiRules}`,
  );
  return Number(rows?.[0]?.c ?? 0);
}

export async function upsertBangumiRuleRow(rule: BangumiRule): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.execute(
    `INSERT INTO ${VideoTables.bangumiRules}
      (id, name, base_url, enabled, payload_json, kazumi_api, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, base_url=excluded.base_url, enabled=excluded.enabled,
       payload_json=excluded.payload_json, kazumi_api=excluded.kazumi_api,
       updated_at=excluded.updated_at`,
    [
      rule.id,
      rule.name,
      rule.baseUrl,
      rule.enabled ? 1 : 0,
      JSON.stringify({ ...rule, version: 2 }),
      rule.kazumiApi ?? null,
      now,
    ],
  );
}

export async function removeBangumiRuleRow(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${VideoTables.bangumiRules} WHERE id = ?`, [id]);
}

export async function replaceAllBangumiRules(rules: BangumiRule[]): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${VideoTables.bangumiRules}`);
  const now = Date.now();
  for (const rule of rules) {
    await db.execute(
      `INSERT INTO ${VideoTables.bangumiRules}
        (id, name, base_url, enabled, payload_json, kazumi_api, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        rule.id,
        rule.name,
        rule.baseUrl,
        rule.enabled ? 1 : 0,
        JSON.stringify({ ...rule, version: 2 }),
        rule.kazumiApi ?? null,
        now,
      ],
    );
  }
}
