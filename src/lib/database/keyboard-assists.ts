import { getDatabase } from '@/lib/database/database-core';
import { ReaderTables } from '@/lib/database/table-names';
import type { KeyboardAssist } from '@/types';

export async function getAllKeyboardAssists(type = 0): Promise<KeyboardAssist[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${ReaderTables.keyboardAssists} WHERE type = ? ORDER BY serialNo ASC`,
    [type]
  );
  return rows.map(mapRow);
}

export async function upsertKeyboardAssist(assist: KeyboardAssist): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO ${ReaderTables.keyboardAssists} (type, key, value, serialNo)
     VALUES (?, ?, ?, ?)`,
    [assist.type, assist.key, assist.value, assist.serialNo]
  );
}

export async function deleteKeyboardAssist(type: number, key: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${ReaderTables.keyboardAssists} WHERE type = ? AND key = ?`, [type, key]);
}

function mapRow(row: Record<string, unknown>): KeyboardAssist {
  return {
    type: Number(row.type ?? 0),
    key: String(row.key ?? ''),
    value: String(row.value ?? ''),
    serialNo: Number(row.serialNo ?? 0),
  };
}
