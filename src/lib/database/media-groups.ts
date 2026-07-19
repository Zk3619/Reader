/**
 * 分组数据访问层（M2 后：reader_book_groups / audio_groups / shell_favorites）
 */

import { getDatabase } from '@/lib/database/database-core';
import type { MediaKind } from '@/lib/book-source/book-type';
import type { BookGroup, MediaGroupDomain } from '@/types/book-group';
import { MediaGroupId } from '@/types/book-group';
import {
  AudioTables,
  ReaderTables,
  ShellTables,
} from '@/lib/database/table-names';

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

const SHELF_SYSTEM_GROUPS: BookGroup[] = [
  {
    groupId: MediaGroupId.Favorite,
    groupName: '收藏',
    order: -4,
    enableRefresh: false,
    show: true,
    bookSort: -1,
    onlyUpdateRead: false,
    domain: 'shared',
  },
  {
    groupId: MediaGroupId.Preview,
    groupName: '试读/试听/试看',
    order: -3,
    enableRefresh: false,
    show: true,
    bookSort: -1,
    onlyUpdateRead: false,
    domain: 'shared',
  },
];

function mapRowToGroup(
  row: Record<string, unknown>,
  domain: MediaGroupDomain,
): BookGroup {
  return {
    groupId: Number(row.groupId ?? 0),
    groupName: String(row.groupName ?? ''),
    cover: row.cover ? String(row.cover) : undefined,
    order: Number(row.order ?? 0),
    enableRefresh: Boolean(row.enableRefresh ?? 1),
    show: Boolean(row.show ?? 1),
    bookSort: Number(row.bookSort ?? -1),
    onlyUpdateRead: Boolean(row.onlyUpdateRead ?? 0),
    domain,
    listId: row.listId ? String(row.listId) : undefined,
    source: row.source ? String(row.source) : undefined,
    description: row.description != null ? String(row.description) : undefined,
  };
}

function groupsTable(domain: MediaGroupDomain): string {
  return domain === 'music' ? AudioTables.groups : ReaderTables.bookGroups;
}

export async function getAllMediaGroups(domain?: MediaGroupDomain): Promise<BookGroup[]> {
  if (domain === 'shared') return getSharedGroups();
  if (domain === 'music') {
    const db = await getDatabase();
    const rows = await db.select<Record<string, unknown>>(
      `SELECT * FROM ${AudioTables.groups} ORDER BY "order"`,
    );
    return rows.map((r) => mapRowToGroup(r, 'music'));
  }
  if (domain === 'shelf') {
    const db = await getDatabase();
    const rows = await db.select<Record<string, unknown>>(
      `SELECT * FROM ${ReaderTables.bookGroups} ORDER BY "order"`,
    );
    return rows.map((r) => mapRowToGroup(r, 'shelf'));
  }

  const [shelf, music, shared] = await Promise.all([
    getAllMediaGroups('shelf'),
    getAllMediaGroups('music'),
    getSharedGroups(),
  ]);
  return [...shelf, ...music, ...shared].sort((a, b) => a.order - b.order);
}

/** 书架 Tab 可见分组（shelf + shared） */
export async function getShelfGroups(): Promise<BookGroup[]> {
  const shelf = await getAllMediaGroups('shelf');
  const shared = await getSharedGroups();
  return [...shelf, ...shared].sort((a, b) => a.order - b.order);
}

export async function getSharedGroups(): Promise<BookGroup[]> {
  return SHELF_SYSTEM_GROUPS.map((g) => ({ ...g }));
}

export async function getMusicGroups(): Promise<BookGroup[]> {
  return getAllMediaGroups('music');
}

export async function getGroupById(groupId: number): Promise<BookGroup | null> {
  if (groupId === MediaGroupId.Favorite || groupId === MediaGroupId.Preview) {
    return SHELF_SYSTEM_GROUPS.find((g) => g.groupId === groupId) ?? null;
  }
  const db = await getDatabase();
  const shelf = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${ReaderTables.bookGroups} WHERE groupId = ?`,
    [groupId],
  );
  if (shelf[0]) return mapRowToGroup(shelf[0], 'shelf');
  const music = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${AudioTables.groups} WHERE groupId = ?`,
    [groupId],
  );
  return music[0] ? mapRowToGroup(music[0], 'music') : null;
}

export async function getGroupByName(groupName: string): Promise<BookGroup | null> {
  const shared = SHELF_SYSTEM_GROUPS.find((g) => g.groupName === groupName);
  if (shared) return { ...shared };
  const db = await getDatabase();
  const shelf = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${ReaderTables.bookGroups} WHERE groupName = ?`,
    [groupName],
  );
  if (shelf[0]) return mapRowToGroup(shelf[0], 'shelf');
  const music = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${AudioTables.groups} WHERE groupName = ?`,
    [groupName],
  );
  return music[0] ? mapRowToGroup(music[0], 'music') : null;
}

export async function getMusicGroupByListId(listId: string): Promise<BookGroup | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${AudioTables.groups} WHERE listId = ? LIMIT 1`,
    [listId],
  );
  return rows[0] ? mapRowToGroup(rows[0], 'music') : null;
}

export async function insertGroup(group: BookGroup): Promise<void> {
  const db = await getDatabase();
  const domain = group.domain ?? 'shelf';
  if (domain === 'shared') return;
  if (domain === 'music') {
    await db.execute(
      `INSERT OR REPLACE INTO ${AudioTables.groups} (
        groupId, groupName, cover, "order", enableRefresh, show, bookSort, onlyUpdateRead,
        listId, source, description
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
        group.listId ?? null,
        group.source ?? null,
        group.description ?? null,
      ],
    );
    return;
  }
  await db.execute(
    `INSERT OR REPLACE INTO ${ReaderTables.bookGroups} (
      groupId, groupName, cover, "order", enableRefresh, show, bookSort, onlyUpdateRead
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      group.groupId,
      group.groupName,
      group.cover ?? null,
      group.order,
      group.enableRefresh ? 1 : 0,
      group.show ? 1 : 0,
      group.bookSort,
      group.onlyUpdateRead ? 1 : 0,
    ],
  );
}

export async function updateGroup(group: BookGroup): Promise<void> {
  const db = await getDatabase();
  const domain = group.domain ?? (await resolveDomain(group.groupId));
  if (domain === 'shared') return;
  if (domain === 'music') {
    await db.execute(
      `UPDATE ${AudioTables.groups} SET
        groupName = ?, cover = ?, "order" = ?,
        enableRefresh = ?, show = ?, bookSort = ?, onlyUpdateRead = ?,
        listId = ?, source = ?, description = ?
      WHERE groupId = ?`,
      [
        group.groupName,
        group.cover ?? null,
        group.order,
        group.enableRefresh ? 1 : 0,
        group.show ? 1 : 0,
        group.bookSort,
        group.onlyUpdateRead ? 1 : 0,
        group.listId ?? null,
        group.source ?? null,
        group.description ?? null,
        group.groupId,
      ],
    );
    return;
  }
  await db.execute(
    `UPDATE ${ReaderTables.bookGroups} SET
      groupName = ?, cover = ?, "order" = ?,
      enableRefresh = ?, show = ?, bookSort = ?, onlyUpdateRead = ?
    WHERE groupId = ?`,
    [
      group.groupName,
      group.cover ?? null,
      group.order,
      group.enableRefresh ? 1 : 0,
      group.show ? 1 : 0,
      group.bookSort,
      group.onlyUpdateRead ? 1 : 0,
      group.groupId,
    ],
  );
}

async function resolveDomain(groupId: number): Promise<MediaGroupDomain> {
  if (groupId === MediaGroupId.Favorite || groupId === MediaGroupId.Preview) {
    return 'shared';
  }
  const g = await getGroupById(groupId);
  return g?.domain ?? 'shelf';
}

export async function deleteGroup(groupId: number): Promise<void> {
  if (groupId === MediaGroupId.Favorite || groupId === MediaGroupId.Preview) return;
  const db = await getDatabase();
  const domain = await resolveDomain(groupId);
  if (domain === 'music') {
    await db.execute(`DELETE FROM ${AudioTables.groups} WHERE groupId = ?`, [groupId]);
    await db.execute(`DELETE FROM ${AudioTables.groupItems} WHERE group_id = ?`, [groupId]);
    return;
  }
  await db.execute(`DELETE FROM ${ReaderTables.bookGroups} WHERE groupId = ?`, [groupId]);
  await db.execute(`DELETE FROM ${ReaderTables.bookGroupItems} WHERE group_id = ?`, [groupId]);
}

export async function enableGroup(groupId: number): Promise<void> {
  const db = await getDatabase();
  const domain = await resolveDomain(groupId);
  if (domain === 'shared') return;
  await db.execute(
    `UPDATE ${groupsTable(domain)} SET show = 1 WHERE groupId = ?`,
    [groupId],
  );
}

export async function getGroupIdsSum(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ sum: number }>(
    `SELECT SUM(groupId) as sum FROM ${ReaderTables.bookGroups} WHERE groupId > 0`,
  );
  return Number(rows[0]?.sum ?? 0);
}

export async function getMaxOrder(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ max: number }>(
    `SELECT MAX("order") as max FROM ${ReaderTables.bookGroups} WHERE groupId > 0`,
  );
  return Number(rows[0]?.max ?? 0);
}

export async function canAddGroup(): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${ReaderTables.bookGroups} WHERE groupId > 0`,
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
    const domain = await resolveDomain(group.groupId);
    if (domain === 'shared') continue;
    await db.execute(
      `UPDATE ${groupsTable(domain)} SET "order" = ? WHERE groupId = ?`,
      [group.order, group.groupId],
    );
  }
}

export async function getUserGroups(): Promise<BookGroup[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${ReaderTables.bookGroups} WHERE groupId > 0 ORDER BY "order"`,
  );
  return rows.map((r) => mapRowToGroup(r, 'shelf'));
}

export async function getNextMusicUserGroupId(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ minId: number }>(
    `SELECT MIN(groupId) as minId FROM ${AudioTables.groups}
     WHERE groupId < ${MediaGroupId.MusicUserStart}`,
  );
  const min = rows[0]?.minId;
  if (min == null || min >= MediaGroupId.MusicUserStart) {
    return MediaGroupId.MusicUserStart - 1;
  }
  return min - 1;
}

function itemsTable(itemKind: MediaGroupItemKind, groupId: number): string {
  if (groupId === MediaGroupId.Favorite) return ShellTables.favorites;
  return itemKind === 'track' ? AudioTables.groupItems : ReaderTables.bookGroupItems;
}

export async function addGroupItem(
  groupId: number,
  itemKind: MediaGroupItemKind,
  itemId: string,
  sortOrder?: number,
): Promise<void> {
  const db = await getDatabase();
  const table = itemsTable(itemKind, groupId);
  let order = sortOrder;
  if (order == null) {
    const rows =
      table === ShellTables.favorites
        ? await db.select<{ maxOrder: number }>(
            `SELECT COALESCE(MAX(sort_order), -1) as maxOrder FROM ${table}
             WHERE item_kind = ?`,
            [itemKind],
          )
        : await db.select<{ maxOrder: number }>(
            `SELECT COALESCE(MAX(sort_order), -1) as maxOrder FROM ${table} WHERE group_id = ?`,
            [groupId],
          );
    order = (rows[0]?.maxOrder ?? -1) + 1;
  }
  const now = Date.now();
  if (table === ShellTables.favorites) {
    await db.execute(
      `INSERT OR REPLACE INTO ${ShellTables.favorites}
        (item_kind, item_id, sort_order, created_at) VALUES (?, ?, ?, ?)`,
      [itemKind, itemId, order, now],
    );
    return;
  }
  await db.execute(
    `INSERT OR REPLACE INTO ${table} (group_id, item_id, sort_order, created_at)
     VALUES (?, ?, ?, ?)`,
    [groupId, itemId, order, now],
  );
}

export async function removeGroupItem(
  groupId: number,
  itemKind: MediaGroupItemKind,
  itemId: string,
): Promise<void> {
  const db = await getDatabase();
  const table = itemsTable(itemKind, groupId);
  if (table === ShellTables.favorites) {
    await db.execute(
      `DELETE FROM ${ShellTables.favorites} WHERE item_kind = ? AND item_id = ?`,
      [itemKind, itemId],
    );
    return;
  }
  await db.execute(`DELETE FROM ${table} WHERE group_id = ? AND item_id = ?`, [
    groupId,
    itemId,
  ]);
}

export async function getGroupItemIds(
  groupId: number,
  itemKind?: MediaGroupItemKind,
): Promise<Array<{ itemId: string; sortOrder: number }>> {
  const db = await getDatabase();
  if (groupId === MediaGroupId.Favorite) {
    const rows = itemKind
      ? await db.select<Record<string, unknown>>(
          `SELECT item_id, sort_order FROM ${ShellTables.favorites}
           WHERE item_kind = ? ORDER BY sort_order ASC`,
          [itemKind],
        )
      : await db.select<Record<string, unknown>>(
          `SELECT item_id, sort_order FROM ${ShellTables.favorites}
           ORDER BY sort_order ASC`,
        );
    return rows.map((row) => ({
      itemId: String(row.item_id),
      sortOrder: Number(row.sort_order ?? 0),
    }));
  }

  const kind = itemKind ?? 'book';
  const table = itemsTable(kind, groupId);
  const rows = await db.select<Record<string, unknown>>(
    `SELECT item_id, sort_order FROM ${table}
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
  const table = itemsTable(itemKind, groupId);
  const now = Date.now();

  if (table === ShellTables.favorites) {
    await db.execute(`DELETE FROM ${ShellTables.favorites} WHERE item_kind = ?`, [itemKind]);
    for (let i = 0; i < uniqueIds.length; i++) {
      await db.execute(
        `INSERT OR IGNORE INTO ${ShellTables.favorites}
          (item_kind, item_id, sort_order, created_at) VALUES (?, ?, ?, ?)`,
        [itemKind, uniqueIds[i], i, now],
      );
    }
    return;
  }

  await db.execute(`DELETE FROM ${table} WHERE group_id = ?`, [groupId]);
  for (let i = 0; i < uniqueIds.length; i++) {
    await db.execute(
      `INSERT OR IGNORE INTO ${table} (group_id, item_id, sort_order, created_at)
       VALUES (?, ?, ?, ?)`,
      [groupId, uniqueIds[i], i, now],
    );
  }
}

function isDatabaseBusy(error: unknown): boolean {
  return /database is locked|database is busy|SQLITE_BUSY/i.test(String(error));
}

async function executeWithBusyRetry(
  operation: () => Promise<unknown>,
  retries = 4,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      if (!isDatabaseBusy(error) || attempt >= retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * 2 ** attempt));
    }
  }
}

/** 仅调整现有分组项顺序；单条 UPDATE 避免跨异步调用长期持有写锁。 */
export async function reorderGroupItems(
  groupId: number,
  itemKind: MediaGroupItemKind,
  itemIds: string[],
): Promise<void> {
  const db = await getDatabase();
  const uniqueIds = [...new Set(itemIds.filter(Boolean))];
  if (uniqueIds.length !== itemIds.length) {
    throw new Error('排序列表包含重复或无效项目');
  }

  const current = await getGroupItemIds(groupId, itemKind);
  const currentIds = current.map((item) => item.itemId);
  const nextIdSet = new Set(uniqueIds);
  if (
    currentIds.length !== uniqueIds.length ||
    currentIds.some((id) => !nextIdSet.has(id))
  ) {
    throw new Error('列表内容已变化，请重试排序');
  }

  if (uniqueIds.length === 0) return;
  const table = itemsTable(itemKind, groupId);

  if (table === ShellTables.favorites) {
    await executeWithBusyRetry(() =>
      db.execute(
        `WITH desired(item_id, sort_order) AS (
           SELECT CAST(value AS TEXT), CAST(key AS INTEGER)
           FROM json_each(?)
         )
         UPDATE ${ShellTables.favorites}
         SET sort_order = (
           SELECT desired.sort_order FROM desired
           WHERE desired.item_id = ${ShellTables.favorites}.item_id
         )
         WHERE item_kind = ?
           AND item_id IN (SELECT item_id FROM desired)`,
        [JSON.stringify(uniqueIds), itemKind],
      ),
    );
    return;
  }

  await executeWithBusyRetry(() =>
    db.execute(
      `WITH desired(item_id, sort_order) AS (
         SELECT CAST(value AS TEXT), CAST(key AS INTEGER)
         FROM json_each(?)
       )
       UPDATE ${table}
       SET sort_order = (
         SELECT desired.sort_order FROM desired
         WHERE desired.item_id = ${table}.item_id
       )
       WHERE group_id = ?
         AND item_id IN (SELECT item_id FROM desired)`,
      [JSON.stringify(uniqueIds), groupId],
    ),
  );
}

export async function isItemInGroup(
  groupId: number,
  itemKind: MediaGroupItemKind,
  itemId: string,
): Promise<boolean> {
  const db = await getDatabase();
  if (groupId === MediaGroupId.Favorite) {
    const rows = await db.select<{ c: number }>(
      `SELECT COUNT(*) as c FROM ${ShellTables.favorites}
       WHERE item_kind = ? AND item_id = ?`,
      [itemKind, itemId],
    );
    return (rows[0]?.c ?? 0) > 0;
  }
  const table = itemsTable(itemKind, groupId);
  const rows = await db.select<{ c: number }>(
    `SELECT COUNT(*) as c FROM ${table} WHERE group_id = ? AND item_id = ?`,
    [groupId, itemId],
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
    `INSERT INTO ${ShellTables.previewItems}
      (id, media_kind, title, author, cover_url, ref_json, created_at, last_opened_at)
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
    `DELETE FROM ${ShellTables.previewItems} WHERE json_extract(ref_json, '$.bookUrl') = ?`,
    [bookUrl],
  );
}

export async function removePreviewItem(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${ShellTables.previewItems} WHERE id = ?`, [id]);
}

export async function getPreviewItemsByKind(kind?: MediaKind): Promise<MediaPreviewItem[]> {
  const db = await getDatabase();
  const rows = kind
    ? await db.select<Record<string, unknown>>(
        `SELECT * FROM ${ShellTables.previewItems}
         WHERE media_kind = ?
           AND NOT EXISTS (
             SELECT 1 FROM ${ReaderTables.books} b
             WHERE b.bookUrl = json_extract(ref_json, '$.bookUrl')
           )
         ORDER BY last_opened_at DESC, created_at DESC`,
        [kind],
      )
    : await db.select<Record<string, unknown>>(
        `SELECT * FROM ${ShellTables.previewItems}
         WHERE NOT EXISTS (
             SELECT 1 FROM ${ReaderTables.books} b
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

export async function getBookUrlsInGroup(groupId: number): Promise<string[]> {
  const items = await getGroupItemIds(groupId, 'book');
  return items.map((i) => i.itemId);
}

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

/** Legado 导入后：从 books."group" 位标志重建 reader_book_group_items */
export async function rebuildGroupItemsFromGroupMask(): Promise<void> {
  const db = await getDatabase();
  const shelfGroups = await db.select<{ groupId: number }>(
    `SELECT groupId FROM ${ReaderTables.bookGroups} WHERE groupId > 0`,
  );
  const books = await db.select<{ bookUrl: string; groupMask: number }>(
    `SELECT bookUrl, "group" AS groupMask FROM ${ReaderTables.books} WHERE "group" > 0`,
  );
  const now = Date.now();
  for (const book of books) {
    const mask = Number(book.groupMask ?? 0);
    if (!mask) continue;
    for (const g of shelfGroups) {
      const gid = Number(g.groupId);
      if ((mask & gid) > 0) {
        await db.execute(
          `INSERT OR IGNORE INTO ${ReaderTables.bookGroupItems}
            (group_id, item_id, sort_order, created_at) VALUES (?, ?, 0, ?)`,
          [gid, book.bookUrl, now],
        );
      }
    }
    if ((mask & MediaGroupId.Favorite) > 0) {
      await db.execute(
        `INSERT OR IGNORE INTO ${ShellTables.favorites}
          (item_kind, item_id, sort_order, created_at) VALUES ('book', ?, 0, ?)`,
        [book.bookUrl, now],
      );
    }
  }
}

/** 从分组成员重建 Legado 导出用位掩码 */
export async function rebuildGroupMaskFromItems(bookUrl: string): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ group_id: number }>(
    `SELECT group_id FROM ${ReaderTables.bookGroupItems} WHERE item_id = ?`,
    [bookUrl],
  );
  let mask = rows.reduce((m, r) => m | Number(r.group_id), 0);
  const fav = await db.select<{ c: number }>(
    `SELECT COUNT(*) as c FROM ${ShellTables.favorites}
     WHERE item_kind = 'book' AND item_id = ?`,
    [bookUrl],
  );
  if ((fav[0]?.c ?? 0) > 0) {
    mask |= MediaGroupId.Favorite;
  }
  return mask;
}
