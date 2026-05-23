import { getDatabase } from '@/lib/database/database-core';
import type { RuleSub } from '@/types';

export async function getAllRuleSubs(): Promise<RuleSub[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM ruleSubs ORDER BY customOrder ASC'
  );
  return rows.map(mapRow);
}

export async function upsertRuleSub(sub: RuleSub): Promise<void> {
  const db = await getDatabase();
  if (sub.id != null) {
    await db.execute(
      `UPDATE ruleSubs SET name = ?, url = ?, type = ?, customOrder = ?, autoUpdate = ?,
        "update" = ?, updateInterval = ?, silentUpdate = ?, js = ?, showRule = ?, sourceUrl = ?
       WHERE id = ?`,
      [
        sub.name,
        sub.url,
        sub.type,
        sub.customOrder,
        sub.autoUpdate ? 1 : 0,
        sub.update ? 1 : 0,
        sub.updateInterval,
        sub.silentUpdate ? 1 : 0,
        sub.js ?? null,
        sub.showRule ?? null,
        sub.sourceUrl ?? null,
        sub.id,
      ]
    );
    return;
  }
  await db.execute(
    `INSERT INTO ruleSubs (name, url, type, customOrder, autoUpdate, "update", updateInterval,
      silentUpdate, js, showRule, sourceUrl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sub.name,
      sub.url,
      sub.type,
      sub.customOrder,
      sub.autoUpdate ? 1 : 0,
      sub.update ? 1 : 0,
      sub.updateInterval,
      sub.silentUpdate ? 1 : 0,
      sub.js ?? null,
      sub.showRule ?? null,
      sub.sourceUrl ?? null,
    ]
  );
}

export async function deleteRuleSub(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM ruleSubs WHERE id = ?', [id]);
}

function mapRow(row: Record<string, unknown>): RuleSub {
  return {
    id: row.id != null ? Number(row.id) : undefined,
    name: String(row.name ?? ''),
    url: String(row.url ?? ''),
    type: Number(row.type ?? 0),
    customOrder: Number(row.customOrder ?? 0),
    autoUpdate: Boolean(row.autoUpdate ?? 0),
    update: Boolean(row.update ?? 0),
    updateInterval: Number(row.updateInterval ?? 0),
    silentUpdate: Boolean(row.silentUpdate ?? 0),
    js: row.js ? String(row.js) : undefined,
    showRule: row.showRule ? String(row.showRule) : undefined,
    sourceUrl: row.sourceUrl ? String(row.sourceUrl) : undefined,
  };
}
