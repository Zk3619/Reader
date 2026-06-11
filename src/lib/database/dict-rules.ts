import { getDatabase } from '@/lib/database/database-core';
import type { DictRule } from '@/types';

export async function getEnabledDictRules(): Promise<DictRule[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM dictRules WHERE enabled = 1 ORDER BY sortNumber ASC'
  );
  return rows.map(mapRow);
}

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

export async function deleteDictRules(names: string[]): Promise<void> {
  if (names.length === 0) return;
  const db = await getDatabase();
  for (const name of names) {
    await db.execute('DELETE FROM dictRules WHERE name = ?', [name]);
  }
}

export async function setDictRulesEnabled(names: string[], enabled: boolean): Promise<void> {
  if (names.length === 0) return;
  const db = await getDatabase();
  for (const name of names) {
    await db.execute('UPDATE dictRules SET enabled = ? WHERE name = ?', [enabled ? 1 : 0, name]);
  }
}

async function getSortNumberBounds(): Promise<{ min: number; max: number }> {
  const db = await getDatabase();
  const rows = await db.select<{ minOrder: number | null; maxOrder: number | null }>(
    'SELECT MIN(sortNumber) as minOrder, MAX(sortNumber) as maxOrder FROM dictRules',
  );
  return {
    min: Number(rows[0]?.minOrder ?? 0),
    max: Number(rows[0]?.maxOrder ?? 0),
  };
}

export async function moveDictRulesToTop(rules: DictRule[]): Promise<void> {
  if (rules.length === 0) return;
  const { min } = await getSortNumberBounds();
  let order = min - 1;
  for (const rule of rules) {
    await upsertDictRule({ ...rule, sortNumber: order });
    order -= 1;
  }
}

export async function moveDictRulesToBottom(rules: DictRule[]): Promise<void> {
  if (rules.length === 0) return;
  const { max } = await getSortNumberBounds();
  let order = max + 1;
  for (const rule of rules) {
    await upsertDictRule({ ...rule, sortNumber: order });
    order += 1;
  }
}

export async function importDefaultDictRules(): Promise<number> {
  const { DEFAULT_DICT_RULES } = await import('@/lib/database/default-dict-rules');
  for (const rule of DEFAULT_DICT_RULES) {
    await upsertDictRule(rule);
  }
  return DEFAULT_DICT_RULES.length;
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
