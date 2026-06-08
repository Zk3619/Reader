/**
 * chapter_cache 增加 cache_tier（auto / manual）
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { ensureChapterCacheSchema } from '@/lib/database/migration-chapter-cache-v97';

export const CHAPTER_CACHE_TIER_SCHEMA_VERSION = 99;

export async function migrateChapterCacheV99(db: DatabaseAdapter): Promise<void> {
  await ensureChapterCacheSchema(db);
  const cols = await db.select<{ name: string }>(`PRAGMA table_info(chapter_cache)`);
  const names = cols.map((c) => String(c.name ?? '').toLowerCase());
  if (!names.includes('cache_tier')) {
    console.log('[数据库迁移] chapter_cache 添加 cache_tier 列');
    await db.execute(
      `ALTER TABLE chapter_cache ADD COLUMN cache_tier TEXT NOT NULL DEFAULT 'auto'`,
    );
  }
}
