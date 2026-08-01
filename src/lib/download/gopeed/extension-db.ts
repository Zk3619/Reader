/**
 * 下载扩展 SQLite 持久化（download_extensions）
 */

import { getDatabase } from '@/lib/platform/database';
import { DownloadTables } from '@/lib/database/table-names';
import type { Extension } from '@/lib/download/gopeed/extensions/types';

type ExtRow = {
  identity: string;
  payload: string;
  disabled: number;
  created_at: number;
  updated_at: number;
};

function parseExtension(row: ExtRow): Extension | null {
  try {
    const parsed = JSON.parse(row.payload || '{}') as Extension;
    if (!parsed || typeof parsed !== 'object') return null;
    const identity = String(parsed.identity || row.identity || '').trim();
    if (!identity) return null;
    return {
      ...parsed,
      identity,
      disabled: Boolean(row.disabled) || Boolean(parsed.disabled),
      createdAt: Number(parsed.createdAt ?? row.created_at) || Date.now(),
      updatedAt: Number(parsed.updatedAt ?? row.updated_at) || Date.now(),
    };
  } catch {
    return null;
  }
}

export async function listDownloadExtensionsFromDb(): Promise<Extension[]> {
  try {
    const db = await getDatabase();
    const rows = await db.select<ExtRow>(
      `SELECT * FROM ${DownloadTables.extensions} ORDER BY updated_at DESC`,
    );
    return rows.map(parseExtension).filter((x): x is Extension => !!x);
  } catch {
    return [];
  }
}

export async function replaceAllDownloadExtensionsInDb(
  extensions: Extension[],
): Promise<void> {
  const db = await getDatabase();
  const table = DownloadTables.extensions;
  await db.execute(`DELETE FROM ${table}`);
  for (const ext of extensions) {
    const identity = String(ext.identity || '').trim();
    if (!identity) continue;
    await db.execute(
      `INSERT INTO ${table} (identity, payload, disabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        identity,
        JSON.stringify(ext),
        ext.disabled ? 1 : 0,
        Math.trunc(ext.createdAt || Date.now()),
        Math.trunc(ext.updatedAt || Date.now()),
      ],
    );
  }
}
