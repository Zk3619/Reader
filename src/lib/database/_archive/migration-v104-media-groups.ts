/**
 * 数据库迁移 v104 — book_groups → media_groups，统一分组与收藏/试读
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { MediaGroupId } from '@/types/book-group';

export const MEDIA_GROUPS_SCHEMA_VERSION = 104;

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
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const MUSIC_BUILTIN: Record<string, number> = {
  default: MediaGroupId.MusicDefault,
  trial: MediaGroupId.MusicTrial,
  recent: MediaGroupId.MusicRecent,
  local: MediaGroupId.MusicLocal,
};

export async function migrateMediaGroupsV104(db: DatabaseAdapter): Promise<void> {
  const groupsTable = (await tableExists(db, 'media_groups'))
    ? 'media_groups'
    : 'book_groups';

  if (groupsTable === 'book_groups') {
    await db.execute('ALTER TABLE book_groups RENAME TO media_groups');
  }

  await addColumnIfMissing(db, 'media_groups', 'domain', "TEXT NOT NULL DEFAULT 'shelf'");
  await addColumnIfMissing(db, 'media_groups', 'listId', 'TEXT');
  await addColumnIfMissing(db, 'media_groups', 'source', 'TEXT');

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS index_media_groups_listId
    ON media_groups(listId) WHERE listId IS NOT NULL
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS media_group_items (
      group_id INTEGER NOT NULL,
      item_kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, item_kind, item_id)
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_mgi_group ON media_group_items(group_id, sort_order)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS media_preview_items (
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
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_mpi_kind ON media_preview_items(media_kind, last_opened_at DESC)
  `);

  await db.execute('DELETE FROM media_groups WHERE groupId IN (-3, -6)');

  const now = Date.now();
  await db.execute(
    `INSERT OR IGNORE INTO media_groups
      (groupId, groupName, "order", enableRefresh, show, bookSort, onlyUpdateRead, domain, listId, source)
     VALUES (?, ?, ?, 0, 1, -1, 0, 'shared', NULL, NULL)`,
    [MediaGroupId.Favorite, '收藏', -4],
  );
  await db.execute(
    `INSERT OR IGNORE INTO media_groups
      (groupId, groupName, "order", enableRefresh, show, bookSort, onlyUpdateRead, domain, listId, source)
     VALUES (?, ?, ?, 0, 1, -1, 0, 'shared', NULL, NULL)`,
    [MediaGroupId.Preview, '试读/试听/试看', -3],
  );

  if (await tableExists(db, 'audio_playlists')) {
    const playlists = await db.select<Record<string, unknown>>(
      'SELECT * FROM audio_playlists ORDER BY updated_at DESC',
    );
    let nextUserMusicId = MediaGroupId.MusicUserStart;

    for (const row of playlists) {
      const listId = String(row.id);
      if (listId === 'love') continue;

      let groupId = MUSIC_BUILTIN[listId];
      if (groupId == null) {
        groupId = nextUserMusicId;
        nextUserMusicId -= 1;
      }

      await db.execute(
        `INSERT OR IGNORE INTO media_groups
          (groupId, groupName, "order", enableRefresh, show, bookSort, onlyUpdateRead, domain, listId, source)
         VALUES (?, ?, ?, 0, 1, -1, 0, 'music', ?, ?)`,
        [
          groupId,
          String(row.name),
          listId === 'local' ? -2 : listId === 'recent' ? -1 : 0,
          listId,
          String(row.source ?? 'builtin'),
        ],
      );
    }

    const items = await db.select<Record<string, unknown>>(
      'SELECT playlist_id, track_id, sort_order FROM audio_playlist_items ORDER BY playlist_id, sort_order',
    );

    for (const item of items) {
      const playlistId = String(item.playlist_id);
      const trackId = String(item.track_id);
      const sortOrder = Number(item.sort_order ?? 0);

      if (playlistId === 'love') {
        await db.execute(
          `INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'track', ?, ?, ?)`,
          [MediaGroupId.Favorite, trackId, sortOrder, now],
        );
        continue;
      }

      const groupId = MUSIC_BUILTIN[playlistId];
      if (groupId == null) {
        const mapped = await db.select<{ groupId: number }>(
          'SELECT groupId FROM media_groups WHERE listId = ? LIMIT 1',
          [playlistId],
        );
        if (!mapped[0]) continue;
        await db.execute(
          `INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'track', ?, ?, ?)`,
          [mapped[0].groupId, trackId, sortOrder, now],
        );
      } else {
        await db.execute(
          `INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'track', ?, ?, ?)`,
          [groupId, trackId, sortOrder, now],
        );
      }
    }
  }
}
