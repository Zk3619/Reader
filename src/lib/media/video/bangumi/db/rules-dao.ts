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
        // 列 name = 列表展示名；payload.name = 规则真实名称
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
  // rowid 顺序 = 导入/重排顺序（replaceAll 按序写入）
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${VideoTables.bangumiRules} ORDER BY rowid ASC`,
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

/** 读取 payload_json 原文（编辑弹窗用，含规则真实 name） */
export async function getBangumiRulePayloadJson(id: string): Promise<string | null> {
  const db = await getDatabase();
  const rows = await db.select<{ payload_json: string }>(
    `SELECT payload_json FROM ${VideoTables.bangumiRules} WHERE id = ? LIMIT 1`,
    [id],
  );
  const raw = rows?.[0]?.payload_json;
  return raw != null ? String(raw) : null;
}

export async function upsertBangumiRuleRow(
  rule: BangumiRule,
  options?: { payload?: unknown },
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();

  let payload: unknown;
  if (options?.payload !== undefined) {
    payload = options.payload;
  } else {
    const existing = await db.select<{ payload_json: string }>(
      `SELECT payload_json FROM ${VideoTables.bangumiRules} WHERE id = ? LIMIT 1`,
      [rule.id],
    );
    if (existing?.[0]?.payload_json) {
      try {
        const old = JSON.parse(String(existing[0].payload_json)) as unknown;
        // 更新字段时保留 payload 内真实 name，展示名只写 name 列
        payload = isRecord(old)
          ? { ...old, ...rule, name: old.name ?? rule.name, version: 2 }
          : { ...rule, version: 2 };
      } catch {
        payload = { ...rule, version: 2 };
      }
    } else {
      payload = { ...rule, version: 2 };
    }
  }

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
      JSON.stringify(payload),
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
  // 先取出旧 payload，重排时保留真实 name
  const oldRows = await db.select<{ id: string; payload_json: string }>(
    `SELECT id, payload_json FROM ${VideoTables.bangumiRules}`,
  );
  const oldPayloadById = new Map<string, unknown>();
  for (const row of oldRows ?? []) {
    try {
      oldPayloadById.set(row.id, JSON.parse(String(row.payload_json ?? '{}')));
    } catch {
      /* */
    }
  }
  await db.execute(`DELETE FROM ${VideoTables.bangumiRules}`);
  const now = Date.now();
  for (const rule of rules) {
    const oldPayload = oldPayloadById.get(rule.id);
    const payload = isRecord(oldPayload)
      ? { ...oldPayload, ...rule, name: oldPayload.name ?? rule.name, version: 2 }
      : { ...rule, version: 2 };
    await db.execute(
      `INSERT INTO ${VideoTables.bangumiRules}
        (id, name, base_url, enabled, payload_json, kazumi_api, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        rule.id,
        rule.name,
        rule.baseUrl,
        rule.enabled ? 1 : 0,
        JSON.stringify(payload),
        rule.kazumiApi ?? null,
        now,
      ],
    );
  }
}
