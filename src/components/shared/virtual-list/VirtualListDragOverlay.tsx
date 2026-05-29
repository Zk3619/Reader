/**
 * 拖拽浮层：指针中心跟随（不依赖库的 overlay transform/layout，避免 recomputeLayouts 干扰）；
 * 指针移出列表视口时浮层停在边界；靠近上下边缘时自动滚动。
 */

import { useDragDropContext, type Id } from '@thisbeyond/solid-dnd';
import { createSignal, onCleanup, Show, type Accessor, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { cn } from '@/lib/utils';
import {
  clamp,
  clampPointerToScrollViewport,
  isPointerInSortableScrollEdge,
  sortableEdgeScrollDelta,
} from '@/components/shared/virtual-list/sortable-drag-ux';

export interface VirtualListDragOverlayProps {
  class?: string;
  style?: JSX.CSSProperties;
  scrollContainer?: Accessor<HTMLDivElement | undefined>;
  children: (active: { id: Id }) => JSX.Element;
}

export function VirtualListDragOverlay(props: VirtualListDragOverlayProps) {
  const ctx = useDragDropContext();
  if (!ctx) return null;

  const [state, { setOverlay, onDragStart, onDragMove, onDragEnd, recomputeLayouts }] =
    ctx;

  const [position, setPosition] = createSignal<{ left: number; top: number } | null>(
    null,
  );

  let measureEl: HTMLDivElement | undefined;
  let overlaySize = { width: 0, height: 0 };
  let scrollRaf = 0;

  const measureOverlaySize = () => {
    const el = measureEl;
    if (!el) return;
    const box = el.getBoundingClientRect();
    overlaySize = { width: box.width, height: box.height };
  };

  const updateOverlayPosition = () => {
    const sensor = state.active.sensor;
    if (!sensor) return;

    const { x: px, y: py } = sensor.coordinates.current;
    const scroll = props.scrollContainer?.();
    const { x, y } = scroll
      ? clampPointerToScrollViewport(px, py, scroll.getBoundingClientRect())
      : { x: px, y: py };

    const halfW = overlaySize.width > 0 ? overlaySize.width / 2 : 0;
    const halfH = overlaySize.height > 0 ? overlaySize.height / 2 : 0;

    setPosition({
      left: x - halfW,
      top: y - halfH,
    });
  };

  const scheduleMeasureAndPosition = () => {
    requestAnimationFrame(() => {
      measureOverlaySize();
      updateOverlayPosition();
      if (overlaySize.width <= 0) {
        requestAnimationFrame(() => {
          measureOverlaySize();
          updateOverlayPosition();
        });
      }
    });
  };

  const autoScrollStep = () => {
    scrollRaf = 0;
    const scroll = props.scrollContainer?.();
    const sensor = state.active.sensor;
    if (!state.active.draggable || !scroll || !sensor) return;

    const rect = scroll.getBoundingClientRect();
    const py = sensor.coordinates.current.y;
    const maxScroll = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    const delta = sortableEdgeScrollDelta(py, rect, scroll.scrollTop, maxScroll);

    if (delta !== 0) {
      scroll.scrollTop = clamp(scroll.scrollTop + delta, 0, maxScroll);
      recomputeLayouts();
      updateOverlayPosition();
    }

    const nearEdge = isPointerInSortableScrollEdge(py, rect, scroll.scrollTop, maxScroll);
    if (state.active.draggable && (delta !== 0 || nearEdge)) {
      scrollRaf = requestAnimationFrame(autoScrollStep);
    }
  };

  const ensureScrollLoop = () => {
    if (!scrollRaf && state.active.draggable) {
      scrollRaf = requestAnimationFrame(autoScrollStep);
    }
  };

  const stopScrollLoop = () => {
    if (scrollRaf) {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = 0;
    }
  };

  onDragStart(({ draggable }) => {
    setOverlay({ node: draggable.node, layout: draggable.layout });
    updateOverlayPosition();
    scheduleMeasureAndPosition();
    ensureScrollLoop();
  });

  onDragMove(() => {
    updateOverlayPosition();
    ensureScrollLoop();
  });

  onDragEnd(() => {
    stopScrollLoop();
    setPosition(null);
  });

  onCleanup(stopScrollLoop);

  const overlayStyle = (): JSX.CSSProperties => {
    if (!state.active.draggable) return { display: 'none' };

    const p = position();
    const sensor = state.active.sensor;
    const base: JSX.CSSProperties = {
      position: 'fixed',
      margin: 0,
      padding: 0,
      transition: 'none',
      'z-index': 50,
      ...props.style,
    };

    if (p) {
      return {
        ...base,
        left: `${p.left}px`,
        top: `${p.top}px`,
        visibility: 'visible',
      };
    }

    // 首帧尚未量到尺寸：保持挂载以便测量，勿用 display:none
    const x = sensor?.coordinates.current.x ?? 0;
    const y = sensor?.coordinates.current.y ?? 0;
    return {
      ...base,
      left: `${x}px`,
      top: `${y}px`,
      visibility: 'hidden',
    };
  };

  return (
    <Portal>
      <Show when={state.active.draggable}>
        {(draggable) => (
          <div class={cn('pointer-events-none', props.class)} style={overlayStyle()}>
            <div
              ref={(el) => {
                measureEl = el;
              }}
              class="w-fit"
            >
              {props.children(draggable())}
            </div>
          </div>
        )}
      </Show>
    </Portal>
  );
}
