import { getDatabase } from '@/lib/database/database-core';
import type { TxtTocRule } from '@/types';

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
