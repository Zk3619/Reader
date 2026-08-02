/**
 * 数据库迁移 v115 — 清理 tv_ 与无前缀双轨；影视 history/keep → tracks + groups
 *
 * chapters 双轨合并时，子表 FK 仍可能 REFERENCES books（数据却在 reader_books），
 * 必须在 foreign_keys=OFF 下 INSERT/DROP，并重定向 FK。
 *
 * 大库注意：chapters 合并/FK 重建是整表拷贝，可能要数十秒；影视改用 INSERT…SELECT，避免逐行 IPC。
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import {
  copyTableIfDual,
  dropTableIfExists,
  retargetTableForeignKeys,
  tableExists,
  withForeignKeysDisabled,
} from '@/lib/database/core/migration-helpers';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';
import { ReaderTables, VideoTables } from '@/lib/database/table-names';
import { MediaGroupId } from '@/types/book-group';

export const VIDEO_GROUPS_SCHEMA_VERSION = 115;

const FK_PARENT_MAP: Record<string, string> = {
  books: ReaderTables.books,
  book_sources: ReaderTables.bookSources,
};

async function step(label: string, fn: () => Promise<void>): Promise<void> {
  const t0 = Date.now();
  console.log(`[v115] ▶ ${label}`);
  await fn();
  console.log(`[v115] ✓ ${label} (${Date.now() - t0}ms)`);
}

async function countRows(db: DatabaseAdapter, table: string): Promise<number> {
  if (!(await tableExists(db, table))) return 0;
  const rows = await db.select<{ c: number }>(`SELECT COUNT(*) as c FROM "${table}"`);
  return Number(rows[0]?.c ?? 0);
}

export async function migrateVideoGroupsV115(db: DatabaseAdapter): Promise<void> {
  await withForeignKeysDisabled(db, async () => {
    await step('tv_* → video_* 双轨合并', async () => {
      await copyTableIfDual(db, 'tv_config', VideoTables.configs);
      await copyTableIfDual(db, 'tv_history', 'video_history');
      await copyTableIfDual(db, 'tv_keep', 'video_keep');
      await copyTableIfDual(db, 'tv_site_pref', VideoTables.sitePref);
    });

    const chaptersLegacy = await countRows(db, 'chapters');
    const chaptersReader = await countRows(db, ReaderTables.chapters);
    console.log(
      `[v115] chapters 行数: legacy=${chaptersLegacy}, reader=${chaptersReader}`,
    );

    await step('合并 chapters / txtTocRules（大表可能较慢）', async () => {
      await copyTableIfDual(db, 'chapters', ReaderTables.chapters);
      await copyTableIfDual(db, 'txtTocRules', ReaderTables.txtTocRules);
    });

    await step('重定向 chapters/searchBooks 外键 → reader_*', async () => {
      await retargetTableForeignKeys(db, ReaderTables.chapters, FK_PARENT_MAP);
      await retargetTableForeignKeys(db, ReaderTables.searchBooks, FK_PARENT_MAP);
    });

    await step('创建 video_tracks / groups / group_items', async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS ${VideoTables.tracks} (
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
          meta_json TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL DEFAULT 0
        )
      `);
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_video_tracks_updated
         ON ${VideoTables.tracks}(updated_at DESC)`,
      );

      await db.execute(`
        CREATE TABLE IF NOT EXISTS ${VideoTables.groups} (
          groupId INTEGER PRIMARY KEY,
          groupName TEXT NOT NULL,
          cover TEXT,
          "order" INTEGER NOT NULL DEFAULT 0,
          enableRefresh INTEGER NOT NULL DEFAULT 0,
          show INTEGER NOT NULL DEFAULT 1,
          bookSort INTEGER NOT NULL DEFAULT -1,
          onlyUpdateRead INTEGER NOT NULL DEFAULT 0,
          listId TEXT,
          source TEXT,
          description TEXT
        )
      `);
      await db.execute(
        `CREATE UNIQUE INDEX IF NOT EXISTS index_video_groups_listId
         ON ${VideoTables.groups}(listId) WHERE listId IS NOT NULL`,
      );

      await db.execute(`
        CREATE TABLE IF NOT EXISTS ${VideoTables.groupItems} (
          group_id INTEGER NOT NULL,
          item_id TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (group_id, item_id)
        )
      `);
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_vgi_group ON ${VideoTables.groupItems}(group_id, sort_order)`,
      );

      await db.execute(
        `INSERT OR IGNORE INTO ${VideoTables.groups}
          (groupId, groupName, "order", enableRefresh, show, bookSort, listId, source)
         VALUES (?, '最近观看', -2, 0, 1, -1, 'recent', 'builtin')`,
        [MediaGroupId.VideoRecent],
      );
      await db.execute(
        `INSERT OR IGNORE INTO ${VideoTables.groups}
          (groupId, groupName, "order", enableRefresh, show, bookSort, listId, source)
         VALUES (?, '我的收藏', -1, 0, 1, -1, 'keep', 'builtin')`,
        [MediaGroupId.VideoKeep],
      );
    });

    await step('video_history → tracks + recent（集合插入）', async () => {
      if (!(await tableExists(db, 'video_history'))) return;
      const n = await countRows(db, 'video_history');
      console.log(`[v115] video_history 行数=${n}`);

      await db.execute(`
        INSERT INTO ${VideoTables.tracks}
          (id, name, site_key, vod_id, cover_url, kind, cid, flag, episode, position, duration, meta_json, created_at, updated_at)
        SELECT
          key,
          COALESCE(vod_name, ''),
          COALESCE(site_key, ''),
          COALESCE(vod_id, ''),
          vod_pic,
          'vod',
          COALESCE(cid, 0),
          COALESCE(flag, ''),
          COALESCE(episode, ''),
          COALESCE(position, 0),
          COALESCE(duration, 0),
          '{}',
          COALESCE(updated_at, 0),
          COALESCE(updated_at, 0)
        FROM video_history
        WHERE key IS NOT NULL AND key != ''
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, site_key=excluded.site_key, vod_id=excluded.vod_id,
          cover_url=excluded.cover_url, cid=excluded.cid, flag=excluded.flag,
          episode=excluded.episode, position=excluded.position, duration=excluded.duration,
          updated_at=excluded.updated_at
      `);

      await db.execute(
        `
        INSERT OR IGNORE INTO ${VideoTables.groupItems}
          (group_id, item_id, sort_order, created_at)
        SELECT ?, key, 0, COALESCE(updated_at, 0)
        FROM video_history
        WHERE key IS NOT NULL AND key != ''
        `,
        [MediaGroupId.VideoRecent],
      );

      await dropTableIfExists(db, 'video_history');
    });

    await step('video_keep → tracks + keep（集合插入）', async () => {
      if (!(await tableExists(db, 'video_keep'))) return;
      const n = await countRows(db, 'video_keep');
      console.log(`[v115] video_keep 行数=${n}`);

      await db.execute(`
        INSERT INTO ${VideoTables.tracks}
          (id, name, site_key, vod_id, cover_url, kind, cid, flag, episode, position, duration, meta_json, created_at, updated_at)
        SELECT
          key,
          COALESCE(vod_name, ''),
          COALESCE(site_key, ''),
          COALESCE(vod_id, ''),
          vod_pic,
          COALESCE(kind, 'vod'),
          COALESCE(cid, 0),
          '',
          '',
          0,
          0,
          '{}',
          COALESCE(created_at, 0),
          COALESCE(created_at, 0)
        FROM video_keep
        WHERE key IS NOT NULL AND key != ''
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, site_key=excluded.site_key, vod_id=excluded.vod_id,
          cover_url=excluded.cover_url, kind=excluded.kind, cid=excluded.cid
      `);

      await db.execute(
        `
        INSERT OR IGNORE INTO ${VideoTables.groupItems}
          (group_id, item_id, sort_order, created_at)
        SELECT ?, key, 0, COALESCE(created_at, 0)
        FROM video_keep
        WHERE key IS NOT NULL AND key != ''
        `,
        [MediaGroupId.VideoKeep],
      );

      await dropTableIfExists(db, 'video_keep');
    });

    await step('DROP 残留 tv_* / chapters / txtTocRules', async () => {
      for (const name of [
        'tv_config',
        'tv_history',
        'tv_keep',
        'tv_site_pref',
        'chapters',
        'txtTocRules',
      ]) {
        await dropTableIfExists(db, name);
      }
    });
  });

  await setSchemaModuleVersion(db, 'video', 6);
  await setSchemaModuleVersion(db, 'reader', 6);
  await setSchemaModuleVersion(db, 'core', 6);
}
