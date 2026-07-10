/**
 * 数据库迁移 v105 — MediaBox 统一成员模型
 * - books."group" 位标志 → media_group_items
 * - audio_playlist_items 收敛为视图（只读兼容）
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { MediaGroupId } from '@/types/book-group';

export const MEDIASBOX_SCHEMA_VERSION = 105;

async function tableExists(db: DatabaseAdapter, table: string): Promise<boolean> {
  const rows = await db.select<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
    [table],
  );
  return rows.length > 0;
}

async function isView(db: DatabaseAdapter, name: string): Promise<boolean> {
  const rows = await db.select<{ type: string }>(
    `SELECT type FROM sqlite_master WHERE name = ?`,
    [name],
  );
  return rows[0]?.type === 'view';
}

export async function migrateMediaboxV105(db: DatabaseAdapter): Promise<void> {
  const now = Date.now();

  // A. 书架书籍：位标志 → media_group_items
  const shelfGroups = await db.select<{ groupId: number }>(
    `SELECT groupId FROM media_groups WHERE groupId > 0 AND domain = 'shelf'`,
  );

  const books = await db.select<{ bookUrl: string; groupMask: number }>(
    'SELECT bookUrl, "group" AS groupMask FROM books WHERE "group" > 0',
  );

  for (const book of books) {
    const mask = Number(book.groupMask ?? 0);
    if (!mask) continue;

    for (const g of shelfGroups) {
      const gid = Number(g.groupId);
      if ((mask & gid) > 0) {
        await db.execute(
          `INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'book', ?, 0, ?)`,
          [gid, book.bookUrl, now],
        );
      }
    }

    // 收藏位（若曾用位标志）
    if ((mask & MediaGroupId.Favorite) > 0) {
      await db.execute(
        `INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
         VALUES (?, 'book', ?, 0, ?)`,
        [MediaGroupId.Favorite, book.bookUrl, now],
      );
    }
  }

  // 清零 shelf 自定义分组位（收藏已走 media_group_items，不参与位掩码）
  const shelfIdsSum = shelfGroups.reduce((s, g) => s | Number(g.groupId), 0);
  if (shelfIdsSum > 0) {
    await db.execute(`UPDATE books SET "group" = "group" & ~? WHERE "group" > 0`, [shelfIdsSum]);
  }

  // B. audio_playlist_items → 视图（若仍是表则迁移遗漏项后替换）
  if (await tableExists(db, 'audio_playlist_items')) {
    const isAlreadyView = await isView(db, 'audio_playlist_items');
    if (!isAlreadyView) {
      const orphanItems = await db.select<Record<string, unknown>>(
        `SELECT api.playlist_id, api.track_id, api.sort_order
         FROM audio_playlist_items api
         LEFT JOIN media_group_items mgi
           ON mgi.item_id = api.track_id AND mgi.item_kind = 'track'
         LEFT JOIN media_groups mg ON mg.groupId = mgi.group_id AND mg.listId = api.playlist_id
         WHERE mgi.item_id IS NULL`,
      );
      for (const item of orphanItems) {
        const listId = String(item.playlist_id);
        const trackId = String(item.track_id);
        const sortOrder = Number(item.sort_order ?? 0);
        const mapped = await db.select<{ groupId: number }>(
          'SELECT groupId FROM media_groups WHERE listId = ? LIMIT 1',
          [listId],
        );
        if (!mapped[0]) continue;
        await db.execute(
          `INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
           VALUES (?, 'track', ?, ?, ?)`,
          [mapped[0].groupId, trackId, sortOrder, now],
        );
      }
      await db.execute('DROP TABLE audio_playlist_items');
    }
  }

  if (!(await isView(db, 'audio_playlist_items'))) {
    await db.execute(`
      CREATE VIEW IF NOT EXISTS audio_playlist_items AS
      SELECT mg.listId AS playlist_id, mgi.item_id AS track_id, mgi.sort_order
      FROM media_group_items mgi
      INNER JOIN media_groups mg ON mg.groupId = mgi.group_id AND mg.domain = 'music'
      WHERE mgi.item_kind = 'track'
    `);
  }
}
