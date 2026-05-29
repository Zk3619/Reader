import { useDragDropContext } from '@thisbeyond/solid-dnd';

/** 拖拽开始至结束后短暂窗口内为 true，用于阻止行点击切换选中等副作用 */
export function useSuppressClickAfterDrag(): () => boolean {
  const ctx = useDragDropContext();
  if (!ctx) return () => false;

  const [, { onDragStart, onDragEnd }] = ctx;
  let suppress = false;
  let clearTimer: ReturnType<typeof setTimeout> | undefined;

  const arm = () => {
    suppress = true;
    if (clearTimer !== undefined) clearTimeout(clearTimer);
  };

  onDragStart(arm);

  onDragEnd(() => {
    arm();
    clearTimer = setTimeout(() => {
      suppress = false;
      clearTimer = undefined;
    }, 100);
  });

  return () => suppress;
}
