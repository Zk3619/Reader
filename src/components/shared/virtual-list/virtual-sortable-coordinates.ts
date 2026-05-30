/** 虚拟列表拖拽排序：指针 → 滚动内容坐标 → 数据索引 */

export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

export function readScrollContentPadding(scrollEl: HTMLElement): {
  left: number;
  top: number;
} {
  const style = getComputedStyle(scrollEl);
  return {
    left: parseFloat(style.paddingLeft) || 0,
    top: parseFloat(style.paddingTop) || 0,
  };
}

/** 指针在滚动容器 content 坐标系中的位置（含 scrollTop/Left，扣除 padding） */
export function pointerScrollContentCoords(
  scrollEl: HTMLElement,
  pointerX: number,
  pointerY: number,
): { contentX: number; contentY: number } {
  const rect = scrollEl.getBoundingClientRect();
  const pad = readScrollContentPadding(scrollEl);
  return {
    contentX: pointerX - rect.left - pad.left + scrollEl.scrollLeft,
    contentY: pointerY - rect.top - pad.top + scrollEl.scrollTop,
  };
}

/**
 * 根据 content Y 偏移解析 sortable 目标索引（支持可变槽高）。
 * 使用行/槽中点判定插入位置，与常见 sortable 行为一致。
 */
export function resolveSortableIndexFromContentOffset(
  contentY: number,
  itemCount: number,
  sizeAt: (index: number) => number,
): number {
  if (itemCount <= 0) return 0;

  let start = 0;
  for (let i = 0; i < itemCount; i++) {
    const size = Math.max(0, sizeAt(i));
    const mid = start + size / 2;
    const end = start + size;
    if (contentY < mid) return i;
    if (contentY < end) return i + 1 < itemCount ? i + 1 : i;
    start = end;
  }
  return itemCount - 1;
}

/** 网格：content 坐标 → 平铺 item 索引 */
export function resolveGridSortableIndexFromContentOffset(
  contentX: number,
  contentY: number,
  itemCount: number,
  colCount: number,
  rowSizeAt: (rowIndex: number) => number,
  colWidth: number,
  gapPx: number,
): number {
  const cols = Math.max(1, colCount);
  const rowCount = Math.max(1, Math.ceil(itemCount / cols));
  const rowIndex = resolveSortableIndexFromContentOffset(
    contentY,
    rowCount,
    rowSizeAt,
  );
  const clampedRow = clampIndex(rowIndex, rowCount);
  const colStep = colWidth + gapPx;
  const colIndex =
    colStep > 0 ? clampIndex(Math.floor(contentX / colStep), cols) : 0;
  return clampIndex(clampedRow * cols + colIndex, itemCount);
}
