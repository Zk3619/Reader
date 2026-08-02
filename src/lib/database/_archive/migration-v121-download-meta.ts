/**
 * 数据库迁移 v121 — 下载任务换源元数据
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { AudioTables } from '@/lib/database/table-names';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';

export const DOWNLOAD_META_SCHEMA_VERSION = 121;

async function tableExists(db: DatabaseAdapter, table: string): Promise<boolean> {
  const rows = await db.select<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
    [table],
  );
  return rows.length > 0;
}

async function tableHasColumn(
  db: DatabaseAdapter,
  table: string,
  column: string,
): Promise<boolean> {
  if (!(await tableExists(db, table))) return false;
  const rows = await db.select<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

async function addColumnIfMissing(
  db: DatabaseAdapter,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  if (!(await tableHasColumn(db, table, column))) {
    console.log(`[数据库迁移] ${table} 添加 ${column}`);
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export async function migrateDownloadMetaV121(db: DatabaseAdapter): Promise<void> {
  const tasks = AudioTables.downloadTasks;
  if (await tableExists(db, tasks)) {
    await addColumnIfMissing(db, tasks, 'resolved_source', "TEXT NOT NULL DEFAULT ''");
    await addColumnIfMissing(db, tasks, 'task_meta', "TEXT NOT NULL DEFAULT ''");
  }
  await setSchemaModuleVersion(db, 'audio', 8);
}
