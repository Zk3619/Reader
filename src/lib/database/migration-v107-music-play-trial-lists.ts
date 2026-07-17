/**
 * 数据库迁移 v107 — 播放列表 / 试听列表拆分
 * - default：试听列表 → 播放列表
 * - 新增 trial（试听列表）：收录播放过且未加入其它列表的歌曲
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { MediaGroupId } from '@/types/book-group';

export const MUSIC_PLAY_TRIAL_LISTS_SCHEMA_VERSION = 107;

export async function migrateMusicPlayTrialListsV107(db: DatabaseAdapter): Promise<void> {
  const now = Date.now();

  await db.execute(
    `UPDATE media_groups
     SET groupName = '播放列表', "order" = -5
     WHERE groupId = ? AND domain = 'music'`,
    [MediaGroupId.MusicDefault],
  );
  await db.execute(
    `UPDATE audio_playlists SET name = '播放列表' WHERE id = 'default'`,
  );

  await db.execute(
    `INSERT OR IGNORE INTO audio_playlists (id, name, source, created_at, updated_at)
     VALUES ('trial', '试听列表', 'builtin', ?, ?)`,
    [now, now],
  );
  await db.execute(
    `INSERT OR IGNORE INTO media_groups
      (groupId, groupName, "order", enableRefresh, show, bookSort, onlyUpdateRead, domain, listId, source)
     VALUES (?, '试听列表', -4, 0, 1, -1, 0, 'music', 'trial', 'builtin')`,
    [MediaGroupId.MusicTrial],
  );

  await db.execute(
    `UPDATE media_groups SET groupName = '最近播放', "order" = -3 WHERE groupId = ?`,
    [MediaGroupId.MusicRecent],
  );
  await db.execute(
    `UPDATE media_groups SET groupName = '本地音乐', "order" = -2 WHERE groupId = ?`,
    [MediaGroupId.MusicLocal],
  );

  // 用「最近播放」中尚未加入收藏/本地/用户列表的歌曲初始化试听列表
  await db.execute(
    `INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
     SELECT ?, 'track', r.item_id, r.sort_order, ?
     FROM media_group_items r
     WHERE r.group_id = ? AND r.item_kind = 'track'
       AND NOT EXISTS (
         SELECT 1
         FROM media_group_items o
         INNER JOIN media_groups g ON g.groupId = o.group_id
         WHERE o.item_kind = 'track'
           AND o.item_id = r.item_id
           AND (
             g.groupId = ?
             OR g.listId = 'local'
             OR g.listId LIKE 'pl_%'
           )
       )`,
    [MediaGroupId.MusicTrial, now, MediaGroupId.MusicRecent, MediaGroupId.Favorite],
  );
}
