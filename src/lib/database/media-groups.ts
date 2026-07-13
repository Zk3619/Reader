/**
 * 媒体分组数据访问层（media_groups 全局共享）
 */

import { getDatabase } from '@/lib/database/database-core';
import type { MediaKind } from '@/lib/book-source/book-type';
import type { BookGroup, MediaGroupDomain } from '@/types/book-group';
import { MediaGroupId } from '@/types/book-group';

const GROUPS_TABLE = 'media_groups';

export type MediaGroupItemKind = 'book' | 'track';

export interface MediaPreviewItem {
  id: string;
  mediaKind: MediaKind;
  title?: string;
  author?: string;
  coverUrl?: string;
  refJson: string;
  createdAt: number;
  lastOpenedAt?: number;
}

function mapRowToGroup(row: Record<string, unknown>): BookGroup {
  return {
    groupId: Number(row.groupId ?? 0),
    groupName: String(row.groupName ?? ''),
    cover: row.cover ? String(row.cover) : undefined,
    order: Number(row.order ?? 0),
    enableRefresh: Boolean(row.enableRefresh ?? 1),
    show: Boolean(row.show ?? 1),
    bookSort: Number(row.bookSort ?? -1),
    onlyUpdateRead: Boolean(row.onlyUpdateRead ?? 0),
    domain: row.domain ? (String(row.domain) as MediaGroupDomain) : 'shelf',
    listId: row.listId ? String(row.listId) : undefined,
    source: row.source ? String(row.source) : undefined,
  };
}

export async function getAllMediaGroups(domain?: MediaGroupDomain): Promise<BookGroup[]> {
  const db = await getDatabase();
  const rows = domain
    ? await db.select<Record<string, unknown>>(
        `SELECT * FROM ${GROUPS_TABLE} WHERE domain = ? ORDER BY "order"`,
        [domain],
      )
    : await db.select<Record<string, unknown>>(
        `SELECT * FROM ${GROUPS_TABLE} ORDER BY "order"`,
      );
  return rows.map(mapRowToGroup);
}

/** 书架 Tab 可见分组（shelf + shared） */
export async function getShelfGroups(): Promise<BookGroup[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${GROUPS_TABLE}
     WHERE domain IN ('shelf', 'shared')
     ORDER BY "order"`,
  );
  return rows.map(mapRowToGroup);
}

export async function getSharedGroups(): Promise<BookGroup[]> {
  return getAllMediaGroups('shared');
}

export async function getMusicGroups(): Promise<BookGroup[]> {
  return getAllMediaGroups('music');
}

export async function getGroupById(groupId: number): Promise<BookGroup | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${GROUPS_TABLE} WHERE groupId = ?`,
    [groupId],
  );
  return rows[0] ? mapRowToGroup(rows[0]) : null;
}

export async function getGroupByName(groupName: string): Promise<BookGroup | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${GROUPS_TABLE} WHERE groupName = ?`,
    [groupName],
  );
  return rows[0] ? mapRowToGroup(rows[0]) : null;
}

export async function getMusicGroupByListId(listId: string): Promise<BookGroup | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${GROUPS_TABLE} WHERE listId = ? LIMIT 1`,
    [listId],
  );
  return rows[0] ? mapRowToGroup(rows[0]) : null;
}

export async function insertGroup(group: BookGroup): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO ${GROUPS_TABLE} (
      groupId, groupName, cover, "order", enableRefresh, show, bookSort, onlyUpdateRead,
      domain, listId, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      group.groupId,
      group.groupName,
      group.cover ?? null,
      group.order,
      group.enableRefresh ? 1 : 0,
      group.show ? 1 : 0,
      group.bookSort,
      group.onlyUpdateRead ? 1 : 0,
      group.domain ?? 'shelf',
      group.listId ?? null,
      group.source ?? null,
    ],
  );
}

export async function updateGroup(group: BookGroup): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE ${GROUPS_TABLE} SET
      groupName = ?, cover = ?, "order" = ?,
      enableRefresh = ?, show = ?, bookSort = ?, onlyUpdateRead = ?,
      domain = ?, listId = ?, source = ?
    WHERE groupId = ?`,
    [
      group.groupName,
      group.cover ?? null,
      group.order,
      group.enableRefresh ? 1 : 0,
      group.show ? 1 : 0,
      group.bookSort,
      group.onlyUpdateRead ? 1 : 0,
      group.domain ?? 'shelf',
      group.listId ?? null,
      group.source ?? null,
      group.groupId,
    ],
  );
}

export async function deleteGroup(groupId: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${GROUPS_TABLE} WHERE groupId = ?`, [groupId]);
  await db.execute('DELETE FROM media_group_items WHERE group_id = ?', [groupId]);
}

export async function enableGroup(groupId: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE ${GROUPS_TABLE} SET show = 1 WHERE groupId = ?`, [groupId]);
}

export async function getGroupIdsSum(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ sum: number }>(
    `SELECT SUM(groupId) as sum FROM ${GROUPS_TABLE} WHERE groupId > 0 AND domain = 'shelf'`,
  );
  return Number(rows[0]?.sum ?? 0);
}

export async function getMaxOrder(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ max: number }>(
    `SELECT MAX("order") as max FROM ${GROUPS_TABLE} WHERE groupId > 0 AND domain = 'shelf'`,
  );
  return Number(rows[0]?.max ?? 0);
}

export async function canAddGroup(): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${GROUPS_TABLE} WHERE groupId > 0 AND domain = 'shelf'`,
  );
  return (rows[0]?.count ?? 0) < 64;
}

export async function getUnusedGroupId(): Promise<number> {
  const idsSum = await getGroupIdsSum();
  let id = 1;
  while ((id & idsSum) !== 0) {
    id = id << 1;
    if (id > Number.MAX_SAFE_INTEGER) {
      throw new Error('无法找到可用的分组ID');
    }
  }
  return id;
}

export async function updateGroupsOrder(
  groups: Array<{ groupId: number; order: number }>,
): Promise<void> {
  const db = await getDatabase();
  for (const group of groups) {
    await db.execute(`UPDATE ${GROUPS_TABLE} SET "order" = ? WHERE groupId = ?`, [
      group.order,
      group.groupId,
    ]);
  }
}

export async function getUserGroups(): Promise<BookGroup[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${GROUPS_TABLE} WHERE groupId > 0 AND domain = 'shelf' ORDER BY "order"`,
  );
  return rows.map(mapRowToGroup);
}

export async function getNextMusicUserGroupId(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ minId: number }>(
    `SELECT MIN(groupId) as minId FROM ${GROUPS_TABLE} WHERE domain = 'music' AND groupId < ${MediaGroupId.MusicUserStart}`,
  );
  const min = rows[0]?.minId;
  if (min == null || min >= MediaGroupId.MusicUserStart) {
    return MediaGroupId.MusicUserStart - 1;
  }
  return min - 1;
}

export async function addGroupItem(
  groupId: number,
  itemKind: MediaGroupItemKind,
  itemId: string,
  sortOrder?: number,
): Promise<void> {
  const db = await getDatabase();
  let order = sortOrder;
  if (order == null) {
    const rows = await db.select<{ maxOrder: number }>(
      'SELECT COALESCE(MAX(sort_order), -1) as maxOrder FROM media_group_items WHERE group_id = ?',
      [groupId],
    );
    order = (rows[0]?.maxOrder ?? -1) + 1;
  }
  const now = Date.now();
  await db.execute(
    `INSERT OR REPLACE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [groupId, itemKind, itemId, order, now],
  );
}

export async function removeGroupItem(
  groupId: number,
  itemKind: MediaGroupItemKind,
  itemId: string,
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'DELETE FROM media_group_items WHERE group_id = ? AND item_kind = ? AND item_id = ?',
    [groupId, itemKind, itemId],
  );
}

export async function getGroupItemIds(
  groupId: number,
  itemKind?: MediaGroupItemKind,
): Promise<Array<{ itemId: string; sortOrder: number }>> {
  const db = await getDatabase();
  const rows = itemKind
    ? await db.select<Record<string, unknown>>(
        `SELECT item_id, sort_order FROM media_group_items
         WHERE group_id = ? AND item_kind = ?
         ORDER BY sort_order ASC`,
        [groupId, itemKind],
      )
    : await db.select<Record<string, unknown>>(
        `SELECT item_id, sort_order FROM media_group_items
         WHERE group_id = ?
         ORDER BY sort_order ASC`,
        [groupId],
      );
  return rows.map((row) => ({
    itemId: String(row.item_id),
    sortOrder: Number(row.sort_order ?? 0),
  }));
}

export async function setGroupItems(
  groupId: number,
  itemKind: MediaGroupItemKind,
  itemIds: string[],
): Promise<void> {
  const db = await getDatabase();
  const uniqueIds = [...new Set(itemIds.filter(Boolean))];
  await db.execute('DELETE FROM media_group_items WHERE group_id = ? AND item_kind = ?', [
    groupId,
    itemKind,
  ]);
  const now = Date.now();
  for (let i = 0; i < uniqueIds.length; i++) {
    await db.execute(
      `INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [groupId, itemKind, uniqueIds[i], i, now],
    );
  }
}

export async function isItemInGroup(
  groupId: number,
  itemKind: MediaGroupItemKind,
  itemId: string,
): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<{ c: number }>(
    `SELECT COUNT(*) as c FROM media_group_items
     WHERE group_id = ? AND item_kind = ? AND item_id = ?`,
    [groupId, itemKind, itemId],
  );
  return (rows[0]?.c ?? 0) > 0;
}

export async function upsertPreviewItem(input: {
  id: string;
  mediaKind: MediaKind;
  title?: string;
  author?: string;
  coverUrl?: string;
  refJson: string;
}): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.execute(
    `INSERT INTO media_preview_items (id, media_kind, title, author, cover_url, ref_json, created_at, last_opened_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       media_kind = excluded.media_kind,
       title = excluded.title,
       author = excluded.author,
       cover_url = excluded.cover_url,
       ref_json = excluded.ref_json,
       last_opened_at = excluded.last_opened_at`,
    [
      input.id,
      input.mediaKind,
      input.title ?? null,
      input.author ?? null,
      input.coverUrl ?? null,
      input.refJson,
      now,
      now,
    ],
  );
}

export async function removePreviewByRef(bookUrl: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `DELETE FROM media_preview_items WHERE json_extract(ref_json, '$.bookUrl') = ?`,
    [bookUrl],
  );
}

export async function removePreviewItem(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM media_preview_items WHERE id = ?', [id]);
}

export async function getPreviewItemsByKind(kind?: MediaKind): Promise<MediaPreviewItem[]> {
  const db = await getDatabase();
  const rows = kind
    ? await db.select<Record<string, unknown>>(
        `SELECT * FROM media_preview_items
         WHERE media_kind = ?
           AND NOT EXISTS (
             SELECT 1 FROM books b
             WHERE b.bookUrl = json_extract(ref_json, '$.bookUrl')
           )
         ORDER BY last_opened_at DESC, created_at DESC`,
        [kind],
      )
    : await db.select<Record<string, unknown>>(
        `SELECT * FROM media_preview_items
         WHERE NOT EXISTS (
             SELECT 1 FROM books b
             WHERE b.bookUrl = json_extract(ref_json, '$.bookUrl')
           )
         ORDER BY last_opened_at DESC, created_at DESC`,
      );
  return rows.map(mapPreviewRow);
}

function mapPreviewRow(row: Record<string, unknown>): MediaPreviewItem {
  return {
    id: String(row.id),
    mediaKind: String(row.media_kind) as MediaKind,
    title: row.title ? String(row.title) : undefined,
    author: row.author ? String(row.author) : undefined,
    coverUrl: row.cover_url ? String(row.cover_url) : undefined,
    refJson: String(row.ref_json ?? '{}'),
    createdAt: Number(row.created_at ?? 0),
    lastOpenedAt: row.last_opened_at ? Number(row.last_opened_at) : undefined,
  };
}

export async function addFavoriteBook(bookUrl: string): Promise<void> {
  await addGroupItem(MediaGroupId.Favorite, 'book', bookUrl, 0);
}

export async function removeFavoriteBook(bookUrl: string): Promise<void> {
  await removeGroupItem(MediaGroupId.Favorite, 'book', bookUrl);
}

export async function isBookFavorite(bookUrl: string): Promise<boolean> {
  return isItemInGroup(MediaGroupId.Favorite, 'book', bookUrl);
}

export async function addFavoriteTrack(trackId: string): Promise<void> {
  await addGroupItem(MediaGroupId.Favorite, 'track', trackId, 0);
}

export async function removeFavoriteTrack(trackId: string): Promise<void> {
  await removeGroupItem(MediaGroupId.Favorite, 'track', trackId);
}

export async function isTrackFavorite(trackId: string): Promise<boolean> {
  return isItemInGroup(MediaGroupId.Favorite, 'track', trackId);
}

/** 获取分组内书籍 URL 列表 */
export async function getBookUrlsInGroup(groupId: number): Promise<string[]> {
  const items = await getGroupItemIds(groupId, 'book');
  return items.map((i) => i.itemId);
}

/** 设置书籍在指定分组的成员关系 */
export async function setBookGroupMembership(
  bookUrl: string,
  groupId: number,
  member: boolean,
): Promise<void> {
  if (member) {
    await addGroupItem(groupId, 'book', bookUrl);
  } else {
    await removeGroupItem(groupId, 'book', bookUrl);
  }
}

/** Legado 导入后：从 books."group" 位标志重建 media_group_items */
export async function rebuildGroupItemsFromGroupMask(): Promise<void> {
  const db = await getDatabase();
  const shelfGroups = await db.select<{ groupId: number }>(
    `SELECT groupId FROM media_groups WHERE groupId > 0 AND domain = 'shelf'`,
  );
  const books = await db.select<{ bookUrl: string; groupMask: number }>(
    'SELECT bookUrl, "group" AS groupMask FROM books WHERE "group" > 0',
  );
  const now = Date.now();
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
    if ((mask & MediaGroupId.Favorite) > 0) {
      await db.execute(
        `INSERT OR IGNORE INTO media_group_items (group_id, item_kind, item_id, sort_order, created_at)
         VALUES (?, 'book', ?, 0, ?)`,
        [MediaGroupId.Favorite, book.bookUrl, now],
      );
    }
  }
}

/** 从 media_group_items 重建 Legado 导出用位掩码 */
export async function rebuildGroupMaskFromItems(bookUrl: string): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ group_id: number }>(
    `SELECT mgi.group_id FROM media_group_items mgi
     INNER JOIN media_groups mg ON mg.groupId = mgi.group_id
     WHERE mgi.item_kind = 'book' AND mgi.item_id = ?
       AND (mg.domain = 'shelf' OR mgi.group_id = ?)`,
    [bookUrl, MediaGroupId.Favorite],
  );
  return rows.reduce((mask, r) => mask | Number(r.group_id), 0);
}
