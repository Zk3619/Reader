/**
 * v125: 订阅模块索引/唯一约束加固，保持与 legacy RSS 隔离。
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';
import { SubTables } from '@/lib/database/table-names';

export const SUBSCRIBE_HARDENING_SCHEMA_VERSION = 125;

export async function migrateSubscribeHardeningV125(db: DatabaseAdapter): Promise<void> {
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_sources_url_unique ON ${SubTables.sources}(url)`,
  );
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_feeds_feed_url_unique ON ${SubTables.feeds}(feed_url)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_sub_feeds_source ON ${SubTables.feeds}(source_id)`,
  );
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_entries_feed_url_unique ON ${SubTables.entries}(feed_id, url) WHERE url IS NOT NULL`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_sub_entries_read_pub ON ${SubTables.entries}(read, published_at DESC)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_sub_entries_starred_pub ON ${SubTables.entries}(starred, published_at DESC)`,
  );
  await setSchemaModuleVersion(db, 'subscribe', 3);
}
