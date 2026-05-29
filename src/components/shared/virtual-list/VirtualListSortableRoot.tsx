import {
  closestCenter,
  DragDropProvider,
  DragDropSensors,
  SortableProvider,
  useDragDropContext,
  useSortableContext,
  type DragEventHandler,
  type Id,
} from '@thisbeyond/solid-dnd';
import { VirtualListDragOverlay } from '@/components/shared/virtual-list/VirtualListDragOverlay';
import { Show, type Accessor, type JSX } from 'solid-js';
import {
  VIRTUAL_LIST_DRAG_OVERLAY_FIT_STYLE,
  type VirtualListDragStyle,
} from '@/components/shared/virtual-list/types';

function SortableReorderBridge(props: {
  onReorder: (ids: Id[]) => void | Promise<void>;
}) {
  const sortable = useSortableContext();
  const dnd = useDragDropContext();
  if (!sortable || !dnd) return null;

  const [, { onDragEnd }] = dnd;
  const [state] = sortable;

  const handleEnd: DragEventHandler = () => {
    const sorted = state.sortedIds;
    const initial = state.initialIds;
    if (
      sorted.length !== initial.length ||
      sorted.some((id, i) => id !== initial[i])
    ) {
      void props.onReorder([...sorted]);
    }
  };

  onDragEnd(handleEnd);
  return null;
}

/** 拖拽/滚动时刷新 droppable 布局，供 sortable 计算位移动画 */
function SortableLayoutRefresh() {
  const ctx = useDragDropContext();
  if (!ctx) return null;
  const [, { onDragMove, recomputeLayouts }] = ctx;

  onDragMove(() => {
    recomputeLayouts();
  });

  return null;
}

export interface VirtualListSortableRootProps {
  enabled: Accessor<boolean>;
  ids: Accessor<Id[]>;
  onReorder: (ids: Id[]) => void | Promise<void>;
  dragStyle?: VirtualListDragStyle;
  /** 列表滚动容器，用于浮层边界钳制与边缘自动滚动 */
  scrollContainer?: Accessor<HTMLDivElement | undefined>;
  /** 渲染 DragOverlay 内容；activeId 为当前拖拽项 id */
  renderOverlay?: (activeId: Id | null) => JSX.Element;
  children: JSX.Element;
}

export function VirtualListSortableRoot(props: VirtualListSortableRootProps) {
  return (
    <DragDropProvider collisionDetector={closestCenter}>
      <DragDropSensors />
      <SortableProvider ids={props.ids()}>
        <SortableReorderBridge onReorder={props.onReorder} />
        <SortableLayoutRefresh />
        {props.children}
        <Show when={props.renderOverlay}>
          <VirtualListDragOverlay
            scrollContainer={props.scrollContainer}
            class={props.dragStyle?.overlayClass}
            style={{
              ...VIRTUAL_LIST_DRAG_OVERLAY_FIT_STYLE,
              ...props.dragStyle?.overlayStyle,
            }}
          >
            {(active) => props.renderOverlay!(active.id)}
          </VirtualListDragOverlay>
        </Show>
      </SortableProvider>
    </DragDropProvider>
  );
}

/** 仅在 enabled 时挂载 DnD 根，避免无效上下文 */
export function VirtualListSortableShell(props: VirtualListSortableRootProps) {
  return (
    <>
      {props.enabled() ? (
        <VirtualListSortableRoot {...props} />
      ) : (
        props.children
      )}
    </>
  );
}
