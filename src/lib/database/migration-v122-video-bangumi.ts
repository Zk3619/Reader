/**
 * 数据库迁移 v122 — 番剧 / Kazumi 表族 + 系统分组 VideoBangumi
 *
 * - video_bangumi_rules / rule_subs / subjects / prefs
 * - 系统组「番剧」kind=bangumi 虚拟过滤
 * - video 模块版本 → 9
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { tableExists } from '@/lib/database/core/migration-helpers';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';
import { VideoTables } from '@/lib/database/table-names';
import { MediaGroupId } from '@/types/book-group';

export const VIDEO_BANGUMI_SCHEMA_VERSION = 122;

export async function migrateVideoBangumiV122(db: DatabaseAdapter): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${VideoTables.bangumiRules} (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      payload_json TEXT NOT NULL DEFAULT '{}',
      kazumi_api TEXT,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_video_bangumi_rules_enabled
     ON ${VideoTables.bangumiRules}(enabled, name)`,
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${VideoTables.bangumiRuleSubs} (
      url TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_fetch_at INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${VideoTables.bangumiSubjects} (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      name_cn TEXT NOT NULL DEFAULT '',
      cover TEXT,
      score REAL NOT NULL DEFAULT 0,
      air_date TEXT,
      air_weekday INTEGER NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      summary TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      fetched_at INTEGER NOT NULL DEFAULT 0
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_video_bangumi_subjects_fetched
     ON ${VideoTables.bangumiSubjects}(fetched_at DESC)`,
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${VideoTables.bangumiPrefs} (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL DEFAULT 'null'
    )
  `);

  if (await tableExists(db, VideoTables.groups)) {
    const groupId = MediaGroupId.VideoBangumi;
    const groupName = '番剧';
    const order = -6;
    const listId = 'bangumi';
    await db.execute(
      `INSERT OR IGNORE INTO ${VideoTables.groups}
        (groupId, groupName, "order", enableRefresh, show, bookSort, listId, source)
       VALUES (?, ?, ?, 0, 1, -1, ?, 'builtin')`,
      [groupId, groupName, order, listId],
    );
    await db.execute(
      `UPDATE ${VideoTables.groups}
       SET groupName = ?, "order" = ?, listId = ?, source = 'builtin', show = 1
       WHERE groupId = ?`,
      [groupName, order, listId, groupId],
    );
  }

  // 修正历史误写成 vod 的番剧行
  if (await tableExists(db, VideoTables.tracks)) {
    await db.execute(
      `UPDATE ${VideoTables.tracks}
       SET kind = 'bangumi'
       WHERE (id LIKE 'bangumi$%' OR site_key = 'bangumi') AND kind != 'bangumi'`,
    );
  }
  if (await tableExists(db, VideoTables.playRecord)) {
    await db.execute(
      `UPDATE ${VideoTables.playRecord}
       SET kind = 'bangumi'
       WHERE (id LIKE 'bangumi$%' OR site_key = 'bangumi') AND kind != 'bangumi'`,
    );
  }

  await setSchemaModuleVersion(db, 'video', 9);
}
