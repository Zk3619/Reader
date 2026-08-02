/**
 * 数据库迁移 v119 — 音乐歌词持久化缓存表
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { AudioTables } from '@/lib/database/table-names';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';

export const MUSIC_LYRIC_COVER_CACHE_SCHEMA_VERSION = 119;

export async function migrateMusicLyricCoverCacheV119(db: DatabaseAdapter): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${AudioTables.lyricCache} (
      track_id TEXT PRIMARY KEY NOT NULL,
      lyric_json TEXT NOT NULL,
      has_lx INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS index_audio_lyric_cache_created_at ON ${AudioTables.lyricCache}(created_at)`,
  );
  await setSchemaModuleVersion(db, 'audio', 7);
}
