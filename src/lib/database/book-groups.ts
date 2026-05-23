/**
 * 书籍分组数据访问对象
 * 对应 legado 项目的 BookGroupDao.kt
 */

import { getDatabase } from '@/lib/database/database-core';
import type { BookGroup } from '@/types';

/**
 * 获取所有分组
 */
export async function getAllGroups(): Promise<BookGroup[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM book_groups ORDER BY "order"'
  );
  return rows.map((row) => mapRowToGroup(row));
}

/**
 * 获取用户自定义分组（groupId >= 0）
 */
export async function getUserGroups(): Promise<BookGroup[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM book_groups WHERE groupId >= 0 ORDER BY "order"'
  );
  return rows.map((row) => mapRowToGroup(row));
}

/**
 * 根据ID获取分组
 */
export async function getGroupById(groupId: number): Promise<BookGroup | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM book_groups WHERE groupId = ?',
    [groupId]
  );
  return rows.length > 0 ? mapRowToGroup(rows[0]) : null;
}

/**
 * 根据名称获取分组
 */
export async function getGroupByName(
  groupName: string
): Promise<BookGroup | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM book_groups WHERE groupName = ?',
    [groupName]
  );
  return rows.length > 0 ? mapRowToGroup(rows[0]) : null;
}

/**
 * 插入分组（如果存在则替换）
 */
export async function insertGroup(group: BookGroup): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO book_groups (
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
    ]
  );
}

/**
 * 更新分组
 */
export async function updateGroup(group: BookGroup): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE book_groups SET
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
    ]
  );
}

/**
 * 删除分组
 */
export async function deleteGroup(groupId: number): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM book_groups WHERE groupId = ?', [groupId]);
}

/**
 * 启用分组显示
 */
export async function enableGroup(groupId: number): Promise<void> {
  const db = await getDatabase();
  await db.execute('UPDATE book_groups SET show = 1 WHERE groupId = ?', [
    groupId,
  ]);
}

/**
 * 获取分组ID总和（用于位运算）
 */
export async function getGroupIdsSum(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ sum: number }>(
    'SELECT SUM(groupId) as sum FROM book_groups WHERE groupId >= 0'
  );
  return Number(rows[0]?.sum ?? 0);
}

/**
 * 获取最大排序值
 */
export async function getMaxOrder(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ max: number }>(
    'SELECT MAX("order") as max FROM book_groups WHERE groupId >= 0'
  );
  return Number(rows[0]?.max ?? 0);
}

/**
 * 检查是否可以添加分组（最多64个）
 */
export async function canAddGroup(): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<{ count: number }>(
    'SELECT COUNT(*) as count FROM book_groups WHERE groupId >= 0'
  );
  return (rows[0]?.count ?? 0) < 64;
}

/**
 * 获取未使用的分组ID（位运算）
 */
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

/**
 * 批量更新分组顺序
 */
export async function updateGroupsOrder(groups: Array<{ groupId: number; order: number }>): Promise<void> {
  const db = await getDatabase();
  // 使用事务批量更新
  for (const group of groups) {
    await db.execute(
      'UPDATE book_groups SET "order" = ? WHERE groupId = ?',
      [group.order, group.groupId]
    );
  }
}

/**
 * 将数据库行映射为BookGroup对象
 */
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
  };
}
