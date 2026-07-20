/**
 * 数据库迁移 v120 — 影视观看记录独立表 + 收藏→系统分组语义
 *
 * - 最近观看（VideoRecent / listId=recent）→ video_play_record
 * - 我的收藏（VideoKeep / listId=keep）→ video_tracks.library + 系统分组
 * - 系统分组：全部 / 点播 / 直播 / 本地
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import {
  tableExists,
  withForeignKeysDisabled,
} from '@/lib/database/core/migration-helpers';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';
import { VideoTables } from '@/lib/database/table-names';
import { MediaGroupId } from '@/types/book-group';

export const VIDEO_PLAY_RECORD_SCHEMA_VERSION = 120;

/** 旧内置 ID（v115）；迁移后删除 */
const LEGACY_VIDEO_RECENT = -30;
const LEGACY_VIDEO_KEEP = -31;

async function tableHasColumn(
  db: DatabaseAdapter,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await db.select<{ name: string }>(`PRAGMA table_info(${table})`);
  return (rows ?? []).some((r) => r.name === column);
}

async function ensureColumn(
  db: DatabaseAdapter,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  if (!(await tableHasColumn(db, table, column))) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export async function migrateVideoPlayRecordV120(db: DatabaseAdapter): Promise<void> {
  await withForeignKeysDisabled(db, async () => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ${VideoTables.playRecord} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        site_key TEXT NOT NULL DEFAULT '',
        vod_id TEXT NOT NULL DEFAULT '',
        cover_url TEXT,
        kind TEXT NOT NULL DEFAULT 'vod',
        cid INTEGER NOT NULL DEFAULT 0,
        flag TEXT NOT NULL DEFAULT '',
        episode TEXT NOT NULL DEFAULT '',
        position REAL NOT NULL DEFAULT 0,
        duration REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      )
    `);
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_video_play_record_updated
       ON ${VideoTables.playRecord}(updated_at DESC)`,
    );

    if (await tableExists(db, VideoTables.tracks)) {
      await ensureColumn(db, VideoTables.tracks, 'library', 'INTEGER NOT NULL DEFAULT 0');
      await ensureColumn(db, VideoTables.tracks, 'library_order', 'INTEGER NOT NULL DEFAULT 0');
    }

    // 最近观看 → play_record
    if (
      (await tableExists(db, VideoTables.tracks)) &&
      (await tableExists(db, VideoTables.groupItems))
    ) {
      await db.execute(
        `INSERT OR REPLACE INTO ${VideoTables.playRecord}
          (id, name, site_key, vod_id, cover_url, kind, cid, flag, episode, position, duration, created_at, updated_at)
         SELECT t.id, t.name, t.site_key, t.vod_id, t.cover_url, t.kind, t.cid,
                t.flag, t.episode, t.position, t.duration,
                COALESCE(NULLIF(i.created_at, 0), t.created_at, t.updated_at),
                COALESCE(NULLIF(t.updated_at, 0), i.created_at, t.created_at)
         FROM ${VideoTables.tracks} t
         INNER JOIN ${VideoTables.groupItems} i
           ON i.item_id = t.id AND i.group_id = ?`,
        [LEGACY_VIDEO_RECENT],
      );
    }

    // 我的收藏 → library=1，保留原 sort_order
    if (
      (await tableExists(db, VideoTables.tracks)) &&
      (await tableExists(db, VideoTables.groupItems))
    ) {
      await db.execute(
        `UPDATE ${VideoTables.tracks}
         SET library = 1,
             library_order = COALESCE(
               (SELECT i.sort_order FROM ${VideoTables.groupItems} i
                WHERE i.item_id = ${VideoTables.tracks}.id AND i.group_id = ?),
               library_order
             )
         WHERE id IN (
           SELECT item_id FROM ${VideoTables.groupItems} WHERE group_id = ?
         )`,
        [LEGACY_VIDEO_KEEP, LEGACY_VIDEO_KEEP],
      );
    }

    if (await tableExists(db, VideoTables.groupItems)) {
      await db.execute(
        `DELETE FROM ${VideoTables.groupItems} WHERE group_id IN (?, ?)`,
        [LEGACY_VIDEO_RECENT, LEGACY_VIDEO_KEEP],
      );
    }

    if (await tableExists(db, VideoTables.groups)) {
      await db.execute(
        `DELETE FROM ${VideoTables.groups} WHERE groupId IN (?, ?)
          OR listId IN ('recent', 'keep')`,
        [LEGACY_VIDEO_RECENT, LEGACY_VIDEO_KEEP],
      );

      const seeds: Array<[number, string, number, string]> = [
        [MediaGroupId.VideoAll, '全部', -10, 'all'],
        [MediaGroupId.VideoVod, '点播', -9, 'vod'],
        [MediaGroupId.VideoLive, '直播', -8, 'live'],
        [MediaGroupId.VideoLocal, '本地', -7, 'local'],
      ];
      for (const [groupId, groupName, order, listId] of seeds) {
        await db.execute(
          `INSERT OR IGNORE INTO ${VideoTables.groups}
            (groupId, groupName, "order", enableRefresh, show, bookSort, listId, source)
           VALUES (?, ?, ?, 0, 1, -1, ?, 'builtin')`,
          [groupId, groupName, order, listId],
        );
        // 若 ID 已被旧数据占用但 listId 不同，强制校正名称
        await db.execute(
          `UPDATE ${VideoTables.groups}
           SET groupName = ?, "order" = ?, listId = ?, source = 'builtin', show = 1
           WHERE groupId = ?`,
          [groupName, order, listId, groupId],
        );
      }
    }
  });

  await setSchemaModuleVersion(db, 'video', 8);
}
