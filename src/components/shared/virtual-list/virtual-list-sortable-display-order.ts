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

function sameMemberSet(a: readonly Id[], b: readonly Id[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a.map(String));
  return b.every((id) => set.has(String(id)));
}

/**
 * persistOnly 下同步 displayIds：
 * - 成员集合不变时以 displayIds（prev）为展示顺序权威；external 可能在 onReorder 完成前滞后
 * - 增删成员时合并保留相对顺序
 */
export function syncSortableDisplayIds(
  prev: readonly Id[],
  external: readonly Id[],
  persistOnly: boolean,
): Id[] {
  if (prev.length === 0) return [...external];
  if (!persistOnly) return [...external];

  if (prev.length !== external.length) {
    return mergeSortableDisplayIds(prev, external);
  }

  if (!sameMemberSet(prev, external)) {
    return mergeSortableDisplayIds(prev, external);
  }

  if (prev.every((id, i) => id === external[i])) return [...prev];

  // 成员相同、顺序不同：保留 displayIds，避免 stale external 在 pending 结束后覆盖 dragEnd 结果
  return [...prev];
}
