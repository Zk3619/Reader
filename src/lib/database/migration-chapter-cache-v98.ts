/**
 * 修复已写入 schema_version=97 但 file_path 列未创建的数据库
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { ensureChapterCacheSchema } from '@/lib/database/migration-chapter-cache-v97';

export const CHAPTER_CACHE_ENSURE_SCHEMA_VERSION = 98;

export async function migrateChapterCacheV98(db: DatabaseAdapter): Promise<void> {
  await ensureChapterCacheSchema(db);
}
