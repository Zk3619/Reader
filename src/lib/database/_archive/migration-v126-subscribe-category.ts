/**
 * v126: 订阅源分类/文件夹字段（对齐 Folo category 字符串模型），仅触及 sub_*。
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';
import { SubTables } from '@/lib/database/table-names';

export const SUBSCRIBE_CATEGORY_SCHEMA_VERSION = 126;

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

export async function migrateSubscribeCategoryV126(db: DatabaseAdapter): Promise<void> {
  const table = SubTables.sources;
  if (await tableExists(db, table)) {
    if (!(await tableHasColumn(db, table, 'category'))) {
      await db.execute(
        `ALTER TABLE ${table} ADD COLUMN category TEXT NOT NULL DEFAULT ''`,
      );
    }
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_sub_sources_category ON ${table}(category)`,
    );
  }
  await setSchemaModuleVersion(db, 'subscribe', 4);
}
