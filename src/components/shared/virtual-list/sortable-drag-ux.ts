/** 拖拽排序：边缘自动滚动与指针钳制 */

export const SORTABLE_SCROLL_EDGE_PX = 48;
export const SORTABLE_SCROLL_MAX_DELTA = 14;

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** 指针移出列表视口时，用于浮层定位的坐标钳制在视口内 */
export function clampPointerToScrollViewport(
  px: number,
  py: number,
  rect: DOMRect,
): { x: number; y: number } {
  return {
    x: clamp(px, rect.left, rect.right),
    y: clamp(py, rect.top, rect.bottom),
  };
}

/** 根据指针相对列表视口的位置计算本帧滚动量（px） */
export function sortableEdgeScrollDelta(
  pointerY: number,
  viewport: DOMRect,
  scrollTop: number,
  maxScrollTop: number,
): number {
  if (maxScrollTop <= 0) return 0;

  const edge = SORTABLE_SCROLL_EDGE_PX;

  if (pointerY <= viewport.top + edge && scrollTop > 0) {
    const t =
      pointerY <= viewport.top ? 1 : (viewport.top + edge - pointerY) / edge;
    return -SORTABLE_SCROLL_MAX_DELTA * t;
  }

  if (pointerY >= viewport.bottom - edge && scrollTop < maxScrollTop) {
    const t =
      pointerY >= viewport.bottom ? 1 : (pointerY - (viewport.bottom - edge)) / edge;
    return SORTABLE_SCROLL_MAX_DELTA * t;
  }

  return 0;
}

export function isPointerInSortableScrollEdge(
  pointerY: number,
  viewport: DOMRect,
  scrollTop: number,
  maxScrollTop: number,
): boolean {
  if (maxScrollTop <= 0) return false;
  const edge = SORTABLE_SCROLL_EDGE_PX;
  return (
    (pointerY <= viewport.top + edge && scrollTop > 0) ||
    (pointerY >= viewport.bottom - edge && scrollTop < maxScrollTop)
  );
}
