import * as groupsDb from '@/lib/database/book-groups';
import type { BookGroup } from '@/types';

export function isDefaultBookGroup(groupId: number): boolean {
  return groupId < 0;
}

export function sortGroupsByOrder(groups: BookGroup[]): BookGroup[] {
  return [...groups].sort((a, b) => a.order - b.order);
}

export function findGroupOrderIndex(groups: BookGroup[], groupId: number): number {
  return sortGroupsByOrder(groups).findIndex((g) => g.groupId === groupId);
}

/** 将分组移动到指定下标，返回新顺序；无法移动时返回 null */
export function moveGroupToIndex(
  groups: BookGroup[],
  groupId: number,
  targetIndex: number,
): BookGroup[] | null {
  const list = sortGroupsByOrder(groups);
  const from = list.findIndex((g) => g.groupId === groupId);
  if (from < 0) return null;
  const to = Math.max(0, Math.min(targetIndex, list.length - 1));
  if (from === to) return list;
  const [removed] = list.splice(from, 1);
  list.splice(to, 0, removed);
  return list.map((g, i) => ({ ...g, order: i }));
}

export function pinGroupToTop(groups: BookGroup[], groupId: number): BookGroup[] | null {
  return moveGroupToIndex(groups, groupId, 0);
}

export function pinGroupToBottom(groups: BookGroup[], groupId: number): BookGroup[] | null {
  const list = sortGroupsByOrder(groups);
  return moveGroupToIndex(groups, groupId, list.length - 1);
}

export async function applyGroupsOrder(groups: BookGroup[]): Promise<void> {
  await groupsDb.updateGroupsOrder(
    groups.map((g) => ({ groupId: g.groupId, order: g.order })),
  );
}
