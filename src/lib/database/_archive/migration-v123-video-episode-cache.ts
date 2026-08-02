/**
 * 数据库迁移 v123 — 影视剧集磁盘缓存索引表
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';
import { VideoTables } from '@/lib/database/table-names';

export const VIDEO_EPISODE_CACHE_SCHEMA_VERSION = 123;

export async function migrateVideoEpisodeCacheV123(db: DatabaseAdapter): Promise<void> {
  const t = VideoTables.episodeCache;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${t} (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      episode_url TEXT NOT NULL DEFAULT '',
      media_url TEXT NOT NULL DEFAULT '',
      bgm_id INTEGER,
      cache_path TEXT,
      cache_tier TEXT NOT NULL DEFAULT 'auto',
      cached_at INTEGER NOT NULL DEFAULT 0,
      cache_bytes INTEGER NOT NULL DEFAULT 0,
      cache_mime TEXT,
      local_path TEXT,
      is_hls INTEGER NOT NULL DEFAULT 0,
      has_media INTEGER NOT NULL DEFAULT 0
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_video_episode_cache_tier ON ${t}(cache_tier)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_video_episode_cache_cached_at ON ${t}(cached_at)`,
  );
  await setSchemaModuleVersion(db, 'video', 10);
}
