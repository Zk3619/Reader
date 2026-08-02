/**
 * 数据库迁移 v111 — M2：拆 media_groups / items，补源表与搜索历史、订阅骨架
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import {
  dropTableIfExists,
  dropViewIfExists,
  tableExists,
} from '@/lib/database/core/migration-helpers';
import { setSchemaModuleVersion } from '@/lib/database/core/schema-modules';
import {
  AudioTables,
  ReaderTables,
  ShellTables,
  SubTables,
  VideoTables,
} from '@/lib/database/table-names';

export const MODULE_SPLIT_SCHEMA_VERSION = 111;

const BUILTIN_AUDIO_SOURCES: Array<{
  id: string;
  name: string;
  customOrder: number;
}> = [
  { id: 'kw', name: '酷我', customOrder: 1 },
  { id: 'kg', name: '酷狗', customOrder: 2 },
  { id: 'tx', name: 'QQ音乐', customOrder: 3 },
  { id: 'wy', name: '网易云', customOrder: 4 },
  { id: 'mg', name: '咪咕', customOrder: 5 },
  { id: 'local', name: '本地', customOrder: 6 },
];

export async function migrateModuleSplitV111(db: DatabaseAdapter): Promise<void> {
  await createTargetTables(db);
  await copyFromMediaTables(db);
  await seedAudioSources(db);
  await createVideoSearchAndSubTables(db);
  await dropLegacyMediaTables(db);
  await recreateAudioPlaylistItemsView(db);

  await setSchemaModuleVersion(db, 'reader', 2);
  await setSchemaModuleVersion(db, 'audio', 2);
  await setSchemaModuleVersion(db, 'shell', 2);
  await setSchemaModuleVersion(db, 'subscribe', 2);
  await setSchemaModuleVersion(db, 'video', 2);
}

async function createTargetTables(db: DatabaseAdapter): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${ReaderTables.bookGroups} (
      groupId INTEGER PRIMARY KEY,
      groupName TEXT NOT NULL,
      cover TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      enableRefresh INTEGER NOT NULL DEFAULT 1,
      show INTEGER NOT NULL DEFAULT 1,
      bookSort INTEGER NOT NULL DEFAULT -1,
      onlyUpdateRead INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${ReaderTables.bookGroupItems} (
      group_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, item_id)
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_rbgi_group ON ${ReaderTables.bookGroupItems}(group_id, sort_order)`,
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${AudioTables.groups} (
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
    `CREATE UNIQUE INDEX IF NOT EXISTS index_audio_groups_listId
     ON ${AudioTables.groups}(listId) WHERE listId IS NOT NULL`,
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${AudioTables.groupItems} (
      group_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, item_id)
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_agi_group ON ${AudioTables.groupItems}(group_id, sort_order)`,
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${ShellTables.favorites} (
      item_kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (item_kind, item_id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${ShellTables.previewItems} (
      id TEXT PRIMARY KEY,
      media_kind TEXT NOT NULL,
      title TEXT,
      author TEXT,
      cover_url TEXT,
      ref_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_opened_at INTEGER
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_shell_preview_kind
     ON ${ShellTables.previewItems}(media_kind, last_opened_at DESC)`,
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${AudioTables.sources} (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'builtin',
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      script TEXT,
      script_url TEXT,
      version TEXT,
      custom_order INTEGER NOT NULL DEFAULT 0,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${AudioTables.searchKeywords} (
      word TEXT NOT NULL PRIMARY KEY,
      usage INTEGER NOT NULL DEFAULT 1,
      lastUseTime INTEGER NOT NULL
    )
  `);
}

async function copyFromMediaTables(db: DatabaseAdapter): Promise<void> {
  if (!(await tableExists(db, 'media_groups'))) return;

  await db.execute(`
    INSERT OR IGNORE INTO ${ReaderTables.bookGroups}
      (groupId, groupName, cover, "order", enableRefresh, show, bookSort, onlyUpdateRead)
    SELECT groupId, groupName, cover, "order", enableRefresh, show, bookSort, onlyUpdateRead
    FROM media_groups
    WHERE domain = 'shelf'
       OR (domain IS NULL AND groupId NOT IN (-7, -8) AND groupId > -20)
  `);

  await db.execute(`
    INSERT OR IGNORE INTO ${AudioTables.groups}
      (groupId, groupName, cover, "order", enableRefresh, show, bookSort, onlyUpdateRead, listId, source)
    SELECT groupId, groupName, cover, "order", enableRefresh, show, bookSort, onlyUpdateRead, listId, source
    FROM media_groups
    WHERE domain = 'music'
  `);

  if (await tableExists(db, 'media_group_items')) {
    await db.execute(`
      INSERT OR IGNORE INTO ${ReaderTables.bookGroupItems}
        (group_id, item_id, sort_order, created_at)
      SELECT group_id, item_id, sort_order, created_at
      FROM media_group_items
      WHERE item_kind = 'book' AND group_id != -7
    `);

    await db.execute(`
      INSERT OR IGNORE INTO ${AudioTables.groupItems}
        (group_id, item_id, sort_order, created_at)
      SELECT group_id, item_id, sort_order, created_at
      FROM media_group_items
      WHERE item_kind = 'track' AND group_id != -7
    `);

    await db.execute(`
      INSERT OR IGNORE INTO ${ShellTables.favorites}
        (item_kind, item_id, sort_order, created_at)
      SELECT item_kind, item_id, sort_order, created_at
      FROM media_group_items
      WHERE group_id = -7
    `);
  }

  if (await tableExists(db, 'media_preview_items')) {
    await db.execute(`
      INSERT OR IGNORE INTO ${ShellTables.previewItems}
        (id, media_kind, title, author, cover_url, ref_json, created_at, last_opened_at)
      SELECT id, media_kind, title, author, cover_url, ref_json, created_at, last_opened_at
      FROM media_preview_items
    `);
  }
}

async function seedAudioSources(db: DatabaseAdapter): Promise<void> {
  const now = Date.now();
  for (const src of BUILTIN_AUDIO_SOURCES) {
    await db.execute(
      `INSERT OR IGNORE INTO ${AudioTables.sources}
        (id, kind, name, enabled, script, script_url, version, custom_order, meta_json, created_at, updated_at)
       VALUES (?, 'builtin', ?, 1, NULL, NULL, NULL, ?, '{}', ?, ?)`,
      [src.id, src.name, src.customOrder, now, now],
    );
  }
}

async function createVideoSearchAndSubTables(db: DatabaseAdapter): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${VideoTables.searchKeywords} (
      word TEXT NOT NULL PRIMARY KEY,
      usage INTEGER NOT NULL DEFAULT 1,
      lastUseTime INTEGER NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${SubTables.sources} (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'opml',
      title TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_fetch_at INTEGER,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${SubTables.feeds} (
      id TEXT PRIMARY KEY,
      source_id TEXT,
      feed_url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      site_url TEXT,
      description TEXT,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_sub_feeds_source ON ${SubTables.feeds}(source_id)`,
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${SubTables.entries} (
      id TEXT PRIMARY KEY,
      feed_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      url TEXT,
      author TEXT,
      published_at INTEGER,
      read INTEGER NOT NULL DEFAULT 0,
      starred INTEGER NOT NULL DEFAULT 0,
      content TEXT,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_sub_entries_feed ON ${SubTables.entries}(feed_id, published_at DESC)`,
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${SubTables.searchKeywords} (
      word TEXT NOT NULL PRIMARY KEY,
      usage INTEGER NOT NULL DEFAULT 1,
      lastUseTime INTEGER NOT NULL
    )
  `);
}

async function dropLegacyMediaTables(db: DatabaseAdapter): Promise<void> {
  await dropViewIfExists(db, 'audio_playlist_items');
  await dropTableIfExists(db, 'media_group_items');
  await dropTableIfExists(db, 'media_preview_items');
  await dropTableIfExists(db, 'media_groups');
}

async function recreateAudioPlaylistItemsView(db: DatabaseAdapter): Promise<void> {
  // 过渡 VIEW：旧代码若仍查 audio_playlist_items，映射到 audio_groups.listId
  await db.execute(`
    CREATE VIEW IF NOT EXISTS audio_playlist_items AS
    SELECT
      g.listId AS playlist_id,
      i.item_id AS track_id,
      i.sort_order AS sort_order
    FROM ${AudioTables.groupItems} i
    INNER JOIN ${AudioTables.groups} g ON g.groupId = i.group_id
    WHERE g.listId IS NOT NULL
  `);
}
