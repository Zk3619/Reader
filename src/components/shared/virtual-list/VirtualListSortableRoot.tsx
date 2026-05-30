import {
  DragDropProvider,
  DragDropSensors,
  SortableProvider,
  useDragDropContext,
  useSortableContext,
  type DragEventHandler,
  type Id,
} from '@thisbeyond/solid-dnd';
import { VirtualListDragOverlay } from '@/components/shared/virtual-list/VirtualListDragOverlay';
import { Show, createMemo, createSignal, createEffect, type Accessor, type JSX, type Setter } from 'solid-js';
import {
  VIRTUAL_LIST_DRAG_OVERLAY_FIT_STYLE,
  type VirtualListDragStyle,
} from '@/components/shared/virtual-list/types';
import {
  VirtualSortableCoordinateContext,
  createVirtualSortableCoordinateSession,
  type VirtualSortableTargetResolver,
} from '@/components/shared/virtual-list/virtual-sortable-collision';
import { VirtualListDragPinContext } from '@/components/shared/virtual-list/virtual-list-drag-pin';
import {
  VirtualListSortableDisplayIdsContext,
  syncSortableDisplayIds,
} from '@/components/shared/virtual-list/virtual-list-sortable-display-order';

function SortableReorderBridge(props: {
  onReorder: (ids: Id[]) => void | Promise<void>;
  onDragFinalize?: () => void;
  persistOnly: Accessor<boolean>;
  setDisplayIds: Setter<Id[]>;
}) {
  const sortable = useSortableContext();
  const dnd = useDragDropContext();
  if (!sortable || !dnd) return null;

  const [dndState, { onDragEnd }] = dnd;
  const [state] = sortable;

  let pendingSorted: Id[] | null = null;

  createEffect(() => {
    if (dndState.active.draggableId) {
      pendingSorted = [...state.sortedIds];
    }
  });

  const handleEnd: DragEventHandler = () => {
    const sorted = pendingSorted ?? [...state.sortedIds];
    const initial = state.initialIds;
    pendingSorted = null;

    const changed =
      sorted.length !== initial.length ||
      sorted.some((id, i) => id !== initial[i]);

    if (changed) {
      // persistOnly：拖拽中仅靠 transform 预览，松手后再提交展示顺序
      if (props.persistOnly()) {
        props.setDisplayIds([...sorted]);
      }
      void props.onReorder([...sorted]);
    }
    props.onDragFinalize?.();
  };

  onDragEnd(handleEnd);
  return null;
}

/** 同步指针坐标供坐标碰撞检测；刷新可见 droppable 布局以驱动位移动画 */
function VirtualSortablePointerBridge(props: {
  session: ReturnType<typeof createVirtualSortableCoordinateSession>;
}) {
  const ctx = useDragDropContext();
  if (!ctx) return null;
  const [state, { onDragStart, onDragMove, recomputeLayouts }] = ctx;

  const syncPointer = () => {
    const sensor = state.active.sensor;
    if (sensor) {
      props.session.setPointer(
        sensor.coordinates.current.x,
        sensor.coordinates.current.y,
      );
    }
  };

  onDragStart(() => {
    syncPointer();
    recomputeLayouts();
  });

  onDragMove(() => {
    syncPointer();
    recomputeLayouts();
  });

  return null;
}

/** 拖拽期间 pin 虚拟行，防止滚动回收 draggable DOM 导致 dragEnd */
function VirtualSortableDragPinBridge(props: {
  externalIds: Accessor<Id[]>;
  resolvePinnedVirtualIndex?: Accessor<
    ((activeId: Id) => number | undefined) | undefined
  >;
  gridColCount?: Accessor<number>;
  setPinnedVirtualIndex: (index: number | undefined) => void;
}) {
  const ctx = useDragDropContext();
  if (!ctx) return null;
  const [, { onDragStart }] = ctx;

  onDragStart(({ draggable }) => {
    const resolve = props.resolvePinnedVirtualIndex?.();
    if (resolve) {
      props.setPinnedVirtualIndex(resolve(draggable.id));
      return;
    }
    const ids = props.externalIds();
    const flatIndex = ids.findIndex((id) => String(id) === String(draggable.id));
    if (flatIndex < 0) return;
    const cols = Math.max(1, props.gridColCount?.() ?? 1);
    props.setPinnedVirtualIndex(Math.floor(flatIndex / cols));
  });

  return null;
}

export interface VirtualListSortableRootProps {
  enabled: Accessor<boolean>;
  ids: Accessor<Id[]>;
  onReorder: (ids: Id[]) => void | Promise<void>;
  persistOnly?: Accessor<boolean>;
  dragStyle?: VirtualListDragStyle;
  scrollContainer?: Accessor<HTMLDivElement | undefined>;
  resolveTargetIndex?: Accessor<VirtualSortableTargetResolver | undefined>;
  onAfterAutoScroll?: () => void;
  resolvePinnedVirtualIndex?: Accessor<
    ((activeId: Id) => number | undefined) | undefined
  >;
  /** 网格模式：列数，用于 displayIds → 虚拟行 pin */
  gridColCount?: Accessor<number>;
  renderOverlay?: (activeId: Id | null) => JSX.Element;
  children: JSX.Element;
}

/** 非拖拽时同步 displayIds（外部 ids 变化 / persistOnly 合并增删） */
function SortableDisplayIdsSync(props: {
  externalIds: Accessor<Id[]>;
  persistOnly: Accessor<boolean>;
  setDisplayIds: Setter<Id[]>;
}) {
  const dnd = useDragDropContext();

  createEffect(() => {
    const external = props.externalIds();
    if (dnd?.[0].active.draggableId) return;

    props.setDisplayIds((prev) => {
      const next = syncSortableDisplayIds(prev, external, props.persistOnly());
      if (prev.length === next.length && prev.every((id, i) => id === next[i])) {
        return prev;
      }
      return next;
    });
  });

  return null;
}

export function VirtualListSortableRoot(props: VirtualListSortableRootProps) {
  const coordinateSession = createVirtualSortableCoordinateSession();
  const persistOnly = () => props.persistOnly?.() ?? false;

  const [displayIds, setDisplayIds] = createSignal<Id[]>([]);

  const sortableProviderIds = createMemo((): Id[] => {
    const external = props.ids();
    if (!persistOnly()) return external;
    const display = displayIds();
    if (display.length === external.length) return display;
    return external;
  });

  const collisionDetector = coordinateSession.createCollisionDetector({
    scrollContainer: () => props.scrollContainer?.(),
    ids: sortableProviderIds,
    resolveTargetIndex: () => props.resolveTargetIndex?.(),
  });
  const [pinnedVirtualIndex, setPinnedVirtualIndex] = createSignal<
    number | undefined
  >(undefined);

  const displayOrderIds = createMemo(() => displayIds());

  return (
    <VirtualListDragPinContext.Provider value={pinnedVirtualIndex}>
      <VirtualListSortableDisplayIdsContext.Provider value={displayOrderIds}>
        <VirtualSortableCoordinateContext.Provider value={coordinateSession}>
          <DragDropProvider collisionDetector={collisionDetector}>
            <DragDropSensors />
            <SortableProvider ids={sortableProviderIds()}>
              <SortableDisplayIdsSync
                externalIds={props.ids}
                persistOnly={persistOnly}
                setDisplayIds={setDisplayIds}
              />
              <SortableReorderBridge
                onReorder={props.onReorder}
                persistOnly={persistOnly}
                setDisplayIds={setDisplayIds}
                onDragFinalize={() => setPinnedVirtualIndex(undefined)}
              />
              <VirtualSortablePointerBridge session={coordinateSession} />
              <VirtualSortableDragPinBridge
                externalIds={sortableProviderIds}
                resolvePinnedVirtualIndex={props.resolvePinnedVirtualIndex}
                gridColCount={props.gridColCount}
                setPinnedVirtualIndex={setPinnedVirtualIndex}
              />
              {props.children}
              <Show when={props.renderOverlay}>
                <VirtualListDragOverlay
                  scrollContainer={props.scrollContainer}
                  onAfterAutoScroll={props.onAfterAutoScroll}
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
        </VirtualSortableCoordinateContext.Provider>
      </VirtualListSortableDisplayIdsContext.Provider>
    </VirtualListDragPinContext.Provider>
  );
}

/** 仅在 enabled 时挂载 DnD 根，避免无效上下文 */
export function VirtualListSortableShell(props: VirtualListSortableRootProps) {
  return (
    <Show when={props.enabled()} fallback={props.children}>
      <VirtualListSortableRoot {...props} />
    </Show>
  );
}
