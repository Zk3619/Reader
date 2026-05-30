import { defaultRangeExtractor, type Range } from '@tanstack/solid-virtual';
import { createContext, useContext, type Accessor } from 'solid-js';

/** 拖拽期间强制保留的虚拟行索引（由 SortableRoot 写入，VirtualList 读取） */
export type VirtualListDragPinIndex = Accessor<number | undefined>;

const VirtualListDragPinContext = createContext<VirtualListDragPinIndex>(() => undefined);

export function useVirtualListDragPinIndex(): VirtualListDragPinIndex {
  return useContext(VirtualListDragPinContext);
}

export { VirtualListDragPinContext };

/** 将 pin 行并入 TanStack Virtual 渲染范围，避免拖拽源 DOM 被回收 */
export function mergePinnedVirtualRange(
  range: Range,
  pinnedIndex: number | undefined,
  count: number,
): number[] {
  const indices = defaultRangeExtractor(range);
  if (
    pinnedIndex == null ||
    pinnedIndex < 0 ||
    pinnedIndex >= count ||
    indices.includes(pinnedIndex)
  ) {
    return indices;
  }
  return [...indices, pinnedIndex].sort((a, b) => a - b);
}
