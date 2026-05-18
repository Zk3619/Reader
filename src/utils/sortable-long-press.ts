import type { Options } from 'sortablejs';

/** 长按等待时间（毫秒） */
export const SORTABLE_LONG_PRESS_DELAY_MS = 100;

/**
 * 长按期间允许的最大抖动；超过则取消本次拖拽（避免与点击/滚动冲突）
 * @see Sortable touchStartThreshold
 */
export const SORTABLE_LONG_PRESS_HOLD_MOVE_PX = 8;

/**
 * 长按结束后，指针需移动的最小距离才进入拖拽
 * @see Sortable fallbackTolerance（需 forceFallback）
 */
export const SORTABLE_DRAG_START_MOVE_PX = 10;

/**
 * 分组/书籍手动排序：长按 + 移动一定距离后才开始拖拽
 */
export function withLongPressSortableOptions<T extends Options>(options: T): T {
  return {
    delay: SORTABLE_LONG_PRESS_DELAY_MS,
    delayOnTouchOnly: false,
    touchStartThreshold: SORTABLE_LONG_PRESS_HOLD_MOVE_PX,
    fallbackTolerance: SORTABLE_DRAG_START_MOVE_PX,
    forceFallback: true,
    fallbackOnBody: true,
    ...options,
  };
}
