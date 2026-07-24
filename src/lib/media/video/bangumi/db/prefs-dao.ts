/**
 * video_bangumi_prefs DAO（KV）
 */

import { getDatabase } from '@/lib/database/database-core';
import { VideoTables } from '@/lib/database/table-names';

export const BANGUMI_PREF_KEYS = {
  module: 'module',
  meta: 'meta',
} as const;

export async function getBangumiPrefJson<T>(key: string): Promise<T | null> {
  const db = await getDatabase();
  const rows = await db.select<{ value_json: string }>(
    `SELECT value_json FROM ${VideoTables.bangumiPrefs} WHERE key = ? LIMIT 1`,
    [key],
  );
  const raw = rows?.[0]?.value_json;
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setBangumiPrefJson(key: string, value: unknown): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO ${VideoTables.bangumiPrefs} (key, value_json)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`,
    [key, JSON.stringify(value)],
  );
}

export async function deleteBangumiPref(key: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${VideoTables.bangumiPrefs} WHERE key = ?`, [key]);
}

export async function countBangumiPrefs(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ c: number }>(
    `SELECT COUNT(*) as c FROM ${VideoTables.bangumiPrefs}`,
  );
  return Number(rows?.[0]?.c ?? 0);
}
