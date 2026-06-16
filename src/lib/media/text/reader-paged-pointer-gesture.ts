/**
 * 按页阅读：覆盖/滑动/仿真拖拽与移动端触屏（分区点击、系统手势）协调
 */

/** 与 TextViewerPage 轻点判定一致 */
export const READER_PAGED_TAP_MOVE_THRESHOLD_PX = 10;

/** 未选方向前的移动死区（与 ReaderPagedViewport DRAG_DIRECTION_DEADZONE 对齐） */
export const READER_PAGED_DRAG_AXIS_DEADZONE_PX = 8;

/** 翻页拖拽结束后抑制分区单击的时长（覆盖 click 合成延迟） */
export const READER_PAGED_TAP_SUPPRESS_MS = 450;

let suppressRegionalTapUntil = 0;

export function isTouchLikePointer(e: Pick<PointerEvent, 'pointerType'>): boolean {
  return e.pointerType === 'touch' || e.pointerType === 'pen';
}

/** 按页视口 touch-action：由应用接管横滑翻页，避免浏览器 pan/回退手势抢事件 */
export function readerPagedViewportTouchAction(): 'none' {
  return 'none';
}

export function resolvePagedDragAxis(
  dx: number,
  dy: number,
  deadzonePx: number = READER_PAGED_DRAG_AXIS_DEADZONE_PX,
): 'none' | 'x' | 'y' {
  if (Math.abs(dx) < deadzonePx && Math.abs(dy) < deadzonePx) return 'none';
  return Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
}

export function markPagedTurnPointerConsumed(
  ms: number = READER_PAGED_TAP_SUPPRESS_MS,
): void {
  suppressRegionalTapUntil = Date.now() + ms;
}

export function shouldSuppressPagedRegionalTap(): boolean {
  return Date.now() < suppressRegionalTapUntil;
}

export function shouldSuppressPagedTapAfterPointer(
  dx: number,
  dy: number,
  options?: {
    dragTurnInitialized?: boolean;
    turnStage?: 'idle' | 'drag' | 'anim';
    tapThresholdPx?: number;
  },
): boolean {
  if (options?.turnStage === 'drag' || options?.turnStage === 'anim') return true;
  if (options?.dragTurnInitialized) return true;
  const th = options?.tapThresholdPx ?? READER_PAGED_TAP_MOVE_THRESHOLD_PX;
  return Math.abs(dx) > th || Math.abs(dy) > th;
}

/** 水平翻页拖拽中：阻止触屏默认行为（滚动、橡皮筋、部分 WebView 横滑导航） */
export function shouldPreventTouchDefaultForPagedDrag(
  e: Pick<PointerEvent, 'pointerType'>,
  dragAxis: 'none' | 'x' | 'y',
): boolean {
  return isTouchLikePointer(e) && dragAxis === 'x';
}
