/**
 * 数据库迁移 v108 — 影视模块表（对齐 FongMi Room 语义）
 */

import type { DatabaseAdapter } from '@/lib/platform/database';

export const TV_MODULE_SCHEMA_VERSION = 108;

export async function migrateTvModuleV108(db: DatabaseAdapter): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tv_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      type INTEGER NOT NULL DEFAULT 0,
      json TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tv_history (
      key TEXT PRIMARY KEY NOT NULL,
      site_key TEXT NOT NULL DEFAULT '',
      vod_id TEXT NOT NULL DEFAULT '',
      vod_name TEXT NOT NULL DEFAULT '',
      vod_pic TEXT NOT NULL DEFAULT '',
      flag TEXT NOT NULL DEFAULT '',
      episode TEXT NOT NULL DEFAULT '',
      position REAL NOT NULL DEFAULT 0,
      duration REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      cid INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tv_keep (
      key TEXT PRIMARY KEY NOT NULL,
      site_key TEXT NOT NULL DEFAULT '',
      vod_id TEXT NOT NULL DEFAULT '',
      vod_name TEXT NOT NULL DEFAULT '',
      vod_pic TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'vod',
      cid INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tv_site_pref (
      key TEXT PRIMARY KEY NOT NULL,
      searchable INTEGER NOT NULL DEFAULT 1,
      changeable INTEGER NOT NULL DEFAULT 1
    )
  `);

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_tv_history_updated ON tv_history(updated_at DESC)`,
  );
}
