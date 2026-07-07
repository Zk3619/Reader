import type { JSX } from 'solid-js';
import {
  holdMediaViewerChromeAutoHide,
  releaseMediaViewerChromeAutoHide,
} from '@/lib/media/media-viewer-chrome-auto-hide-registry';

let dragReleaseListener: (() => void) | null = null;

function attachDragReleaseListener(): void {
  if (dragReleaseListener || typeof window === 'undefined') return;
  const onRelease = () => {
    endMediaViewerChromeSliderHold();
  };
  dragReleaseListener = onRelease;
  window.addEventListener('pointerup', onRelease);
  window.addEventListener('pointercancel', onRelease);
}

function detachDragReleaseListener(): void {
  if (!dragReleaseListener || typeof window === 'undefined') return;
  window.removeEventListener('pointerup', dragReleaseListener);
  window.removeEventListener('pointercancel', dragReleaseListener);
  dragReleaseListener = null;
}

/** 滑条拖动开始：暂停顶底栏自动隐藏 */
export function beginMediaViewerChromeSliderHold(): void {
  holdMediaViewerChromeAutoHide();
  attachDragReleaseListener();
}

/** 滑条拖动结束：重启自动隐藏倒计时 */
export function endMediaViewerChromeSliderHold(): void {
  detachDragReleaseListener();
  releaseMediaViewerChromeAutoHide();
}

/** 挂在 Kobalte Track / Thumb（Root 不含轨道 DOM，capture 无效） */
export function mergeMediaViewerChromeSliderPointerDownHold(
  existing?: JSX.EventHandlerUnion<HTMLElement, PointerEvent>,
): JSX.EventHandlerUnion<HTMLElement, PointerEvent> {
  return (event) => {
    beginMediaViewerChromeSliderHold();
    if (typeof existing === 'function') {
      existing(event);
    }
  };
}

/** 挂在 Slider Root 的 onChangeEnd */
export function mergeMediaViewerChromeSliderChangeEndHold(
  existing?: (value: number[]) => void,
): (value: number[]) => void {
  return (value) => {
    endMediaViewerChromeSliderHold();
    existing?.(value);
  };
}
