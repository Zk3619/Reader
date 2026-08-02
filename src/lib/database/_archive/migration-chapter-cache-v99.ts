/**
 * chapter_cache 增加 cache_tier（auto / manual）
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { ensureChapterCacheSchema } from '@/lib/database/migration-chapter-cache-v97';
import { ReaderTables } from '@/lib/database/table-names';
import { tableExists } from '@/lib/database/core/migration-helpers';

export const CHAPTER_CACHE_TIER_SCHEMA_VERSION = 99;

export async function migrateChapterCacheV99(db: DatabaseAdapter): Promise<void> {
  await ensureChapterCacheSchema(db);
  // 历史库可能仍叫 chapter_cache；目标态为 reader_chapter_cache
  const table = (await tableExists(db, ReaderTables.chapterCache))
    ? ReaderTables.chapterCache
    : 'chapter_cache';
  if (!(await tableExists(db, table))) return;
  const cols = await db.select<{ name: string }>(`PRAGMA table_info(${table})`);
  const names = cols.map((c) => String(c.name ?? '').toLowerCase());
  if (!names.includes('cache_tier')) {
    console.log(`[数据库迁移] ${table} 添加 cache_tier 列`);
    await db.execute(
      `ALTER TABLE ${table} ADD COLUMN cache_tier TEXT NOT NULL DEFAULT 'auto'`,
    );
  }
}
