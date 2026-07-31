/**
 * v127: 订阅源 FeedView（对齐 Folo view 0–5），仅触及 sub_*。
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';
import { SubTables } from '@/lib/database/table-names';

export const SUBSCRIBE_FEED_VIEW_SCHEMA_VERSION = 127;

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

export async function migrateSubscribeFeedViewV127(db: DatabaseAdapter): Promise<void> {
  const table = SubTables.sources;
  if (await tableExists(db, table)) {
    if (!(await tableHasColumn(db, table, 'view'))) {
      await db.execute(
        `ALTER TABLE ${table} ADD COLUMN view INTEGER NOT NULL DEFAULT 0`,
      );
    }
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_sub_sources_view ON ${table}(view)`,
    );
  }
  await setSchemaModuleVersion(db, 'subscribe', 5);
}
