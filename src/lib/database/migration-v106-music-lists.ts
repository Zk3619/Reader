/**
 * 数据库迁移 v106 — 对齐音乐内置列表名称与固定顺序
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { MediaGroupId } from '@/types/book-group';

export const MUSIC_LISTS_SCHEMA_VERSION = 106;

export async function migrateMusicListsV106(db: DatabaseAdapter): Promise<void> {
  await db.execute(
    `UPDATE media_groups
     SET groupName = '试听列表', "order" = -4
     WHERE groupId = ? AND domain = 'music'`,
    [MediaGroupId.MusicDefault],
  );
  await db.execute(
    `UPDATE media_groups SET groupName = '最近播放', "order" = -3 WHERE groupId = ?`,
    [MediaGroupId.MusicRecent],
  );
  await db.execute(
    `UPDATE media_groups SET groupName = '本地音乐', "order" = -2 WHERE groupId = ?`,
    [MediaGroupId.MusicLocal],
  );
  await db.execute(
    `UPDATE audio_playlists SET name = '试听列表' WHERE id = 'default'`,
  );
  await db.execute(
    `UPDATE audio_playlists SET name = '我的收藏' WHERE id = 'love'`,
  );
}
