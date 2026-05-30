import type { Id } from '@thisbeyond/solid-dnd';
import { createContext, useContext, type Accessor } from 'solid-js';

/** 拖拽排序后的展示 id 顺序（与外层 items 数组解耦，避免 dragEnd 虚拟列表回弹） */
export type VirtualListSortableDisplayIds = Accessor<readonly Id[]>;

const VirtualListSortableDisplayIdsContext =
  createContext<VirtualListSortableDisplayIds>(() => []);

export function useVirtualListSortableDisplayIds(): VirtualListSortableDisplayIds {
  return useContext(VirtualListSortableDisplayIdsContext);
}

export { VirtualListSortableDisplayIdsContext };

export function reorderItemsByIds<T>(
  items: readonly T[],
  ids: readonly Id[],
  getId: (item: T, index: number) => Id,
): T[] {
  const map = new Map<string, T>();
  items.forEach((item, index) => {
    map.set(String(getId(item, index)), item);
  });
  const ordered: T[] = [];
  for (const id of ids) {
    const item = map.get(String(id));
    if (item) ordered.push(item);
  }
  return ordered;
}

/** 成员变化时合并展示顺序：保留已有 id 相对顺序，追加新 id */
export function mergeSortableDisplayIds(
  current: readonly Id[],
  external: readonly Id[],
): Id[] {
  const externalSet = new Set(external.map(String));
  const kept = current.filter((id) => externalSet.has(String(id)));
  const keptSet = new Set(kept.map(String));
  const appended = external.filter((id) => !keptSet.has(String(id)));
  return [...kept, ...appended];
}
