/**
 * 选区游标（对标 Legado cursor_left / cursor_right）
 * 长按松手选中单字后，字符行底左右各一游标，仅拖游标调整选区。
 */

import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { getSelectionPlainText } from '@/lib/media/text/read-aloud-selection';
import {
  captureSelectionDragSession,
  getDragHandleLayouts,
  getSelectionHandleLayouts,
  READER_SELECTION_CURSOR_SIZE_PX,
  setSelectionRangeWithDragSession,
  type SelectionHandleLayout,
  type SelectionHandleSide,
  type SelectionDragSession,
} from '@/lib/media/text/reader-text-selection-range';
import { textViewerStore } from '@/stores/viewer';
import {
  isSelectionHandleDragActive,
  READER_TEXT_SELECTION_CLEARED_EVENT,
  setSelectionHandleDragActive,
} from '@/lib/media/text/reader-text-selection-gesture';
import {
  isSelectionAnchorInReaderContent,
  resolveReaderContentRootFromSelection,
} from '@/lib/media/text/reader-text-selection-shared';
import { cn } from '@/lib/utils';

export interface ReaderTextSelectionHandlesProps {
  contentRootRef?: () => HTMLElement | null;
}

function CursorLeftIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      width={READER_SELECTION_CURSOR_SIZE_PX}
      height={READER_SELECTION_CURSOR_SIZE_PX}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12,4h8v8c0,4.418-3.582,8-8,8s-8-3.582-8-8S7.582,4,12,4z"
      />
    </svg>
  );
}

function CursorRightIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      width={READER_SELECTION_CURSOR_SIZE_PX}
      height={READER_SELECTION_CURSOR_SIZE_PX}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12,4.208H4v8c0,4.418,3.582,8,8,8s8-3.582,8-8S16.418,4.208,12,4.208z"
      />
    </svg>
  );
}

function SelectionHandleView(props: {
  layout: SelectionHandleLayout;
  onPointerDown: (side: SelectionHandleSide, e: PointerEvent) => void;
}) {
  return (
    <div
      class={cn(
        'pointer-events-auto fixed z-[calc(var(--viewer-chrome-z,50)+1)] text-primary',
        'cursor-grab touch-none select-none active:cursor-grabbing',
      )}
      data-reader-selection-handle={props.layout.side}
      style={{
        left: `${props.layout.x}px`,
        top: `${props.layout.y}px`,
        width: `${READER_SELECTION_CURSOR_SIZE_PX}px`,
        height: `${READER_SELECTION_CURSOR_SIZE_PX}px`,
      }}
      role="button"
      aria-label={props.layout.side === 'start' ? '选区起点' : '选区终点'}
      onPointerDown={(e) => props.onPointerDown(props.layout.side, e)}
    >
      {props.layout.side === 'start' ? (
        <CursorLeftIcon class="block h-full w-full drop-shadow-sm" />
      ) : (
        <CursorRightIcon class="block h-full w-full drop-shadow-sm" />
      )}
    </div>
  );
}

export function ReaderTextSelectionHandles(props: ReaderTextSelectionHandlesProps) {
  const [handles, setHandles] = createSignal<SelectionHandleLayout[]>([]);

  const clearHandles = () => setHandles([]);

  const syncHandles = () => {
    if (isSelectionHandleDragActive()) return;
    if (textViewerStore.state.config.selectText === false) {
      clearHandles();
      return;
    }
    if (typeof window !== 'undefined') {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || sel.toString().length === 0) {
        clearHandles();
        return;
      }
    }
    const text = getSelectionPlainText();
    if (!text) {
      clearHandles();
      return;
    }
    if (!isSelectionAnchorInReaderContent()) {
      clearHandles();
      return;
    }
    setHandles(getSelectionHandleLayouts() ?? []);
  };

  const refreshHandlesFromSelection = () => {
    const layouts = getSelectionHandleLayouts();
    if (layouts?.length) setHandles(layouts);
  };

  const applyDragFrame = (session: SelectionDragSession, x: number, y: number) => {
    const movingSide = setSelectionRangeWithDragSession(session, x, y, session.contentRoot, {
      quiet: true,
    });
    if (!movingSide) return null;
    const dragLayouts = getDragHandleLayouts(session, movingSide, x, y);
    if (dragLayouts) {
      setHandles(dragLayouts);
    } else {
      refreshHandlesFromSelection();
    }
    return movingSide;
  };

  onMount(() => {
    const onSelectionCleared = () => clearHandles();
    document.addEventListener('selectionchange', syncHandles);
    document.addEventListener(READER_TEXT_SELECTION_CLEARED_EVENT, onSelectionCleared);
    window.addEventListener('scroll', syncHandles, true);
    window.addEventListener('resize', syncHandles);
    syncHandles();
    onCleanup(() => {
      document.removeEventListener('selectionchange', syncHandles);
      document.removeEventListener(READER_TEXT_SELECTION_CLEARED_EVENT, onSelectionCleared);
      window.removeEventListener('scroll', syncHandles, true);
      window.removeEventListener('resize', syncHandles);
    });
  });

  const onHandlePointerDown = (side: SelectionHandleSide, e: PointerEvent) => {
    if (e.button !== 0 || isSelectionHandleDragActive()) return;
    e.preventDefault();
    e.stopPropagation();

    const container = props.contentRootRef?.() ?? null;
    const contentRoot = resolveReaderContentRootFromSelection(container);
    const session = captureSelectionDragSession(side, contentRoot);
    if (!session) return;

    const handleEl = e.currentTarget as HTMLElement;

    let dragRaf = 0;
    let pendingX = 0;
    let pendingY = 0;
    let hasPending = false;

    const flushMove = () => {
      dragRaf = 0;
      if (!hasPending) return;
      hasPending = false;
      applyDragFrame(session, pendingX, pendingY);
    };

    const queueMove = (x: number, y: number) => {
      pendingX = x;
      pendingY = y;
      hasPending = true;
      if (dragRaf) return;
      dragRaf = requestAnimationFrame(flushMove);
    };

    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (dragRaf) {
        cancelAnimationFrame(dragRaf);
        dragRaf = 0;
      }
      if (hasPending) flushMove();
      detach();
      try {
        handleEl.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setSelectionHandleDragActive(false);
      refreshHandlesFromSelection();
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new Event('selectionchange'));
      }
    };

    const capture = true;
    const onPointerMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      ev.preventDefault();
      ev.stopPropagation();
      queueMove(ev.clientX, ev.clientY);
    };
    const onMouseMove = (ev: MouseEvent) => {
      if ((ev.buttons & 1) === 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      queueMove(ev.clientX, ev.clientY);
    };
    const onPointerFinish = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      ev.preventDefault();
      ev.stopPropagation();
      finish();
    };
    const onMouseFinish = (ev: MouseEvent) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      finish();
    };

    const detach = () => {
      window.removeEventListener('pointermove', onPointerMove, capture);
      window.removeEventListener('pointerup', onPointerFinish, capture);
      window.removeEventListener('pointercancel', onPointerFinish, capture);
      window.removeEventListener('mousemove', onMouseMove, capture);
      window.removeEventListener('mouseup', onMouseFinish, capture);
    };

    window.addEventListener('pointermove', onPointerMove, capture);
    window.addEventListener('pointerup', onPointerFinish, capture);
    window.addEventListener('pointercancel', onPointerFinish, capture);
    window.addEventListener('mousemove', onMouseMove, capture);
    window.addEventListener('mouseup', onMouseFinish, capture);

    setSelectionHandleDragActive(true);
    try {
      handleEl.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    applyDragFrame(session, e.clientX, e.clientY);
  };

  const layoutFor = (side: SelectionHandleSide) =>
    handles().find((h) => h.side === side) ?? null;

  return (
    <Show when={handles().length > 0}>
      <Show when={layoutFor('start')}>
        {(layout) => (
          <SelectionHandleView layout={layout()} onPointerDown={onHandlePointerDown} />
        )}
      </Show>
      <Show when={layoutFor('end')}>
        {(layout) => (
          <SelectionHandleView layout={layout()} onPointerDown={onHandlePointerDown} />
        )}
      </Show>
    </Show>
  );
}
