/**
 * 数据库迁移 v109 — 音乐播放会话态（队列/进度，对齐阅读 books 进度落 DB）
 */

import type { DatabaseAdapter } from '@/lib/platform/database';

export const MUSIC_PLAYBACK_SCHEMA_VERSION = 109;

export async function migrateMusicPlaybackV109(db: DatabaseAdapter): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS music_playback_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      list_id TEXT,
      track_index INTEGER NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 0,
      max_time REAL NOT NULL DEFAULT 0,
      player_list_name TEXT,
      player_list_kind TEXT,
      play_mode TEXT,
      tracks_json TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `);
}
