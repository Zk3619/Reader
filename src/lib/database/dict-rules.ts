import { getDatabase } from '@/lib/database/database-core';
import type { DictRule } from '@/types';

export async function getAllDictRules(): Promise<DictRule[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM dictRules ORDER BY sortNumber ASC'
  );
  return rows.map(mapRow);
}

export async function upsertDictRule(rule: DictRule): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO dictRules (name, urlRule, showRule, enabled, sortNumber)
     VALUES (?, ?, ?, ?, ?)`,
    [rule.name, rule.urlRule, rule.showRule, rule.enabled ? 1 : 0, rule.sortNumber]
  );
}

export async function deleteDictRule(name: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM dictRules WHERE name = ?', [name]);
}

function mapRow(row: Record<string, unknown>): DictRule {
  return {
    name: String(row.name ?? ''),
    urlRule: String(row.urlRule ?? ''),
    showRule: String(row.showRule ?? ''),
    enabled: Boolean(row.enabled ?? 1),
    sortNumber: Number(row.sortNumber ?? 0),
  };
}
