/**
 * 数据库迁移 v124 — 弹幕离线缓存索引 + 匹配覆盖
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';
import { VideoTables } from '@/lib/database/table-names';

export const VIDEO_DANMAKU_CACHE_SCHEMA_VERSION = 124;

export async function migrateVideoDanmakuCacheV124(
  db: DatabaseAdapter,
): Promise<void> {
  const cache = VideoTables.danmakuCache;
  const override = VideoTables.danmakuOverride;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${cache} (
      vod_key TEXT NOT NULL,
      episode INTEGER NOT NULL,
      search_title TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT '',
      file_path TEXT,
      cache_bytes INTEGER NOT NULL DEFAULT 0,
      cache_tier TEXT NOT NULL DEFAULT 'auto',
      cached_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (vod_key, episode)
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_video_danmaku_cache_tier ON ${cache}(cache_tier)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_video_danmaku_cache_cached_at ON ${cache}(cached_at)`,
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${override} (
      vod_key TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      episode_no INTEGER,
      skip_clean INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `);

  await setSchemaModuleVersion(db, 'video', 11);
}
