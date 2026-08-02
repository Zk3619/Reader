/**
 * 数据库迁移 v118 — 音乐缓存元数据 + 下载任务 LX 状态字段
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { AudioTables } from '@/lib/database/table-names';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';

export const MUSIC_CACHE_DOWNLOAD_SCHEMA_VERSION = 118;

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

async function addColumnIfMissing(
  db: DatabaseAdapter,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  if (!(await tableHasColumn(db, table, column))) {
    console.log(`[数据库迁移] ${table} 添加 ${column}`);
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export async function migrateMusicCacheDownloadV118(db: DatabaseAdapter): Promise<void> {
  const tracks = AudioTables.tracks;
  const tasks = AudioTables.downloadTasks;

  if (await tableExists(db, tracks)) {
    await addColumnIfMissing(db, tracks, 'cache_path', 'TEXT');
    await addColumnIfMissing(db, tracks, 'cache_tier', 'TEXT');
    await addColumnIfMissing(db, tracks, 'cached_at', 'INTEGER');
    await addColumnIfMissing(db, tracks, 'cache_bytes', 'INTEGER');
    await addColumnIfMissing(db, tracks, 'cache_mime', 'TEXT');
    await addColumnIfMissing(db, tracks, 'cache_quality', 'TEXT');
    await db.execute(
      `CREATE INDEX IF NOT EXISTS index_audio_tracks_cache_tier ON ${tracks}(cache_tier)`,
    );
  }

  if (await tableExists(db, tasks)) {
    await addColumnIfMissing(db, tasks, 'quality', "TEXT NOT NULL DEFAULT ''");
    await addColumnIfMissing(db, tasks, 'ext', "TEXT NOT NULL DEFAULT 'mp3'");
    await addColumnIfMissing(db, tasks, 'file_name', "TEXT NOT NULL DEFAULT ''");
    await addColumnIfMissing(db, tasks, 'progress_downloaded', 'INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing(db, tasks, 'progress_total', 'INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing(db, tasks, 'status_text', "TEXT NOT NULL DEFAULT ''");
    await addColumnIfMissing(db, tasks, 'position', 'INTEGER NOT NULL DEFAULT 0');

    // 旧状态 → LX 风格状态
    await db.execute(
      `UPDATE ${tasks} SET status = 'waiting', status_text = '等待下载' WHERE status = 'pending'`,
    );
    await db.execute(
      `UPDATE ${tasks} SET status = 'run', status_text = '正在下载' WHERE status = 'downloading'`,
    );
    await db.execute(
      `UPDATE ${tasks} SET status = 'error', status_text = '任务出错' WHERE status = 'failed'`,
    );
    await db.execute(
      `UPDATE ${tasks} SET status = 'completed', status_text = '下载完成' WHERE status = 'completed' AND (status_text IS NULL OR status_text = '')`,
    );
  }

  await setSchemaModuleVersion(db, 'audio', 6);
}
