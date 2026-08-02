/**
 * v128: 订阅源分类内排序（sort_order），仅触及 sub_*。
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';
import { SubTables } from '@/lib/database/table-names';

export const SUBSCRIBE_SORT_ORDER_SCHEMA_VERSION = 128;

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

/** 按当前列表习惯为各分类内源写入 0…n-1 */
async function backfillSortOrders(db: DatabaseAdapter, table: string): Promise<void> {
  const rows = await db.select<{ id: string; category: string }>(
    `SELECT id, category FROM ${table}
     ORDER BY category ASC, updated_at DESC, title ASC`,
  );
  const counters = new Map<string, number>();
  for (const row of rows) {
    const category = String(row.category ?? '');
    const next = counters.get(category) ?? 0;
    counters.set(category, next + 1);
    await db.execute(`UPDATE ${table} SET sort_order = ? WHERE id = ?`, [next, row.id]);
  }
}

export async function migrateSubscribeSortOrderV128(db: DatabaseAdapter): Promise<void> {
  const table = SubTables.sources;
  if (await tableExists(db, table)) {
    if (!(await tableHasColumn(db, table, 'sort_order'))) {
      await db.execute(
        `ALTER TABLE ${table} ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`,
      );
      await backfillSortOrders(db, table);
    }
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_sub_sources_category_sort ON ${table}(category, sort_order)`,
    );
  }
  await setSchemaModuleVersion(db, 'subscribe', 6);
}
