/**
 * 按页视口：capture 阶段绑定长按选文，与翻页 pointer 逻辑的 early return 解耦。
 */

import type { ReaderTextSelectionGestureHandle } from '@/lib/media/text/reader-text-selection-gesture';
import {
  isReaderTextSelectionUiNode,
  READER_TEXT_MOUSE_GESTURE_POINTER_ID,
} from '@/lib/media/text/reader-text-selection-gesture';

export type ReaderPagedTextSelectionBridgeOptions = {
  gesture: ReaderTextSelectionGestureHandle;
  isEnabled: () => boolean;
  isHandleDragActive: () => boolean;
  isInteractiveTarget: (target: EventTarget | null) => boolean;
};

export function attachReaderPagedTextSelectionBridge(
  viewportEl: HTMLElement,
  options: ReaderPagedTextSelectionBridgeOptions,
): () => void {
  let skipMouseDown = false;
  let mouseSessionActive = false;
  /** pointerdown 已交给 gesture，等待 pointerup / mouseup 兜底 */
  let gesturePointerId: number | null = null;

  const finishGesturePointer = (
    pointerId: number,
    clientX: number,
    clientY: number,
  ) => {
    if (gesturePointerId === null || gesturePointerId !== pointerId) return false;
    const suppress = options.gesture.onPointerUp({ pointerId, clientX, clientY });
    gesturePointerId = null;
    return suppress;
  };

  const canTrack = (target: EventTarget | null) => {
    if (!options.isEnabled()) return false;
    if (options.isHandleDragActive()) return false;
    if (!target || typeof target !== 'object') return false;
    if (!viewportEl.contains(target as Node)) return false;
    if (options.isInteractiveTarget(target)) return false;
    if (isReaderTextSelectionUiNode(target)) return false;
    return true;
  };

  const onSelectStartCapture = (e: Event) => {
    if (!options.isEnabled()) return;
    if (options.isHandleDragActive()) return;
    const target = e.target;
    if (!target || typeof target !== 'object') return;
    if (!viewportEl.contains(target as Node)) return;
    e.preventDefault();
  };

  const onPointerDownCapture = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (!canTrack(e.target)) return;
    skipMouseDown = true;
    gesturePointerId = e.pointerId;
    options.gesture.onPointerDown(
      {
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        pointerType: e.pointerType,
      },
      viewportEl,
      e.target,
    );
  };

  const onPointerMoveCapture = (e: PointerEvent) => {
    if (options.isHandleDragActive()) return;
    options.gesture.onPointerMove(
      {
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        pointerType: e.pointerType,
      },
      viewportEl,
    );
  };

  const onPointerUpCapture = (e: PointerEvent) => {
    if (options.isHandleDragActive()) return;
    if (finishGesturePointer(e.pointerId, e.clientX, e.clientY)) {
      e.preventDefault();
    }
    if (e.pointerType === 'mouse') {
      mouseSessionActive = false;
    }
  };

  const onPointerCancelCapture = (e: PointerEvent) => {
    if (options.isHandleDragActive()) return;
    if (gesturePointerId === null || gesturePointerId !== e.pointerId) return;
    gesturePointerId = null;
    options.gesture.onPointerCancel();
    if (e.pointerType === 'mouse') {
      mouseSessionActive = false;
    }
  };

  const onMouseDownCapture = (e: MouseEvent) => {
    if (skipMouseDown) {
      skipMouseDown = false;
      return;
    }
    if (e.button !== 0) return;
    if (!canTrack(e.target)) return;
    if (mouseSessionActive) return;
    mouseSessionActive = true;
    gesturePointerId = READER_TEXT_MOUSE_GESTURE_POINTER_ID;
    options.gesture.onPointerDown(
      {
        pointerId: READER_TEXT_MOUSE_GESTURE_POINTER_ID,
        clientX: e.clientX,
        clientY: e.clientY,
        pointerType: 'mouse',
      },
      viewportEl,
      e.target,
    );
  };

  const onMouseMoveCapture = (e: MouseEvent) => {
    if (options.isHandleDragActive()) return;
    if (!mouseSessionActive) return;
    options.gesture.onPointerMove(
      {
        pointerId: READER_TEXT_MOUSE_GESTURE_POINTER_ID,
        clientX: e.clientX,
        clientY: e.clientY,
        pointerType: 'mouse',
      },
      viewportEl,
    );
  };

  const onMouseUpCapture = (e: MouseEvent) => {
    if (options.isHandleDragActive()) return;
    let suppress = false;
    if (mouseSessionActive) {
      mouseSessionActive = false;
      suppress = finishGesturePointer(READER_TEXT_MOUSE_GESTURE_POINTER_ID, e.clientX, e.clientY);
    } else if (gesturePointerId !== null) {
      // WebView2 等环境：pointerdown 后可能只有 mouseup、无 pointerup
      suppress = finishGesturePointer(gesturePointerId, e.clientX, e.clientY);
    }
    if (suppress) {
      e.preventDefault();
    }
  };

  const capture = true;
  viewportEl.addEventListener('selectstart', onSelectStartCapture, capture);
  viewportEl.addEventListener('pointerdown', onPointerDownCapture, capture);
  viewportEl.addEventListener('mousedown', onMouseDownCapture, capture);
  window.addEventListener('pointermove', onPointerMoveCapture, capture);
  window.addEventListener('pointerup', onPointerUpCapture, capture);
  window.addEventListener('pointercancel', onPointerCancelCapture, capture);
  window.addEventListener('mousemove', onMouseMoveCapture, capture);
  window.addEventListener('mouseup', onMouseUpCapture, capture);

  return () => {
    viewportEl.removeEventListener('selectstart', onSelectStartCapture, capture);
    viewportEl.removeEventListener('pointerdown', onPointerDownCapture, capture);
    viewportEl.removeEventListener('mousedown', onMouseDownCapture, capture);
    window.removeEventListener('pointermove', onPointerMoveCapture, capture);
    window.removeEventListener('pointerup', onPointerUpCapture, capture);
    window.removeEventListener('pointercancel', onPointerCancelCapture, capture);
    window.removeEventListener('mousemove', onMouseMoveCapture, capture);
    window.removeEventListener('mouseup', onMouseUpCapture, capture);
  };
};
