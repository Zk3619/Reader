import { getDatabase } from '@/lib/database/database-core';
import type { TxtTocRule } from '@/types';

export async function countTxtTocRules(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ count: number }>('SELECT COUNT(*) as count FROM txtTocRules');
  return Number(rows[0]?.count ?? 0);
}

export async function getEnabledTxtTocRules(): Promise<TxtTocRule[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM txtTocRules WHERE enable = 1 ORDER BY serialNumber ASC'
  );
  return rows.map(mapRow);
}

export async function allocateTxtTocRuleId(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ maxId: number | null }>(
    'SELECT MAX(id) as maxId FROM txtTocRules WHERE id > 0'
  );
  const maxId = rows[0]?.maxId;
  if (maxId == null) return 1;
  return maxId + 1;
}

export async function getAllTxtTocRules(): Promise<TxtTocRule[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM txtTocRules ORDER BY serialNumber ASC'
  );
  return rows.map(mapRow);
}

export async function getTxtTocRule(id: number): Promise<TxtTocRule | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM txtTocRules WHERE id = ?',
    [id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertTxtTocRule(rule: TxtTocRule): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO txtTocRules (id, name, rule, replacement, example, serialNumber, enable)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      rule.id,
      rule.name,
      rule.rule,
      rule.replacement,
      rule.example ?? null,
      rule.serialNumber,
      rule.enable ? 1 : 0,
    ]
  );
}

export async function deleteTxtTocRule(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM txtTocRules WHERE id = ?', [id]);
}

export async function deleteTxtTocRules(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await db.execute(`DELETE FROM txtTocRules WHERE id IN (${placeholders})`, ids);
}

export async function setTxtTocRulesEnabled(ids: number[], enabled: boolean): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await db.execute(
    `UPDATE txtTocRules SET enable = ? WHERE id IN (${placeholders})`,
    [enabled ? 1 : 0, ...ids],
  );
}

async function getSerialNumberBounds(): Promise<{ min: number; max: number }> {
  const db = await getDatabase();
  const rows = await db.select<{ minOrder: number | null; maxOrder: number | null }>(
    'SELECT MIN(serialNumber) as minOrder, MAX(serialNumber) as maxOrder FROM txtTocRules',
  );
  return {
    min: Number(rows[0]?.minOrder ?? 0),
    max: Number(rows[0]?.maxOrder ?? 0),
  };
}

export async function moveTxtTocRulesToTop(rules: TxtTocRule[]): Promise<void> {
  if (rules.length === 0) return;
  const { min } = await getSerialNumberBounds();
  let order = min - 1;
  for (const rule of rules) {
    await upsertTxtTocRule({ ...rule, serialNumber: order });
    order -= 1;
  }
}

export async function moveTxtTocRulesToBottom(rules: TxtTocRule[]): Promise<void> {
  if (rules.length === 0) return;
  const { max } = await getSerialNumberBounds();
  let order = max + 1;
  for (const rule of rules) {
    await upsertTxtTocRule({ ...rule, serialNumber: order });
    order += 1;
  }
}

export async function importDefaultTxtTocRules(): Promise<number> {
  const { DEFAULT_TXT_TOC_RULES } = await import('@/lib/database/default-txt-toc-rules');
  for (const rule of DEFAULT_TXT_TOC_RULES) {
    await upsertTxtTocRule(rule);
  }
  return DEFAULT_TXT_TOC_RULES.length;
}

function mapRow(row: Record<string, unknown>): TxtTocRule {
  return {
    id: Number(row.id ?? 0),
    name: String(row.name ?? ''),
    rule: String(row.rule ?? ''),
    replacement: String(row.replacement ?? ''),
    example: row.example ? String(row.example) : undefined,
    serialNumber: Number(row.serialNumber ?? 0),
    enable: Boolean(row.enable ?? 1),
  };
}
