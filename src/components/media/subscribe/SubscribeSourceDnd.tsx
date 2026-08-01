/**
 * 订阅源跨分类拖拽 —— 对齐 multiple lists：
 * 每个分类 = droppable + SortableProvider；同分类 createSortable 默认位移动画，
 * 跨分类 onDragOver 改 containers；浮层挂 #app-drag-overlay-host。
 * 侧栏勿在 sortable 项祖先上加 overflow-hidden，否则 translate 会被裁切「消失」
 *（管理页无该结构故正常）。
 */

import { batch, createEffect, createMemo, createSignal, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { createStore, reconcile } from 'solid-js/store';
import {
  closestCenter,
  createDroppable,
  createSortable,
  transformStyle,
  useDragDropContext,
  type CollisionDetector,
  type Draggable,
  type DragEventHandler,
  type Id,
} from '@thisbeyond/solid-dnd';
import { cn } from '@/lib/utils';
import { APP_DRAG_OVERLAY_Z_INDEX } from '@/lib/ui/overlay-z';
import type { SubSourceRow } from '@/lib/database/subscribe';
import {
  parseSubscribeCategoryDroppableId,
  subscribeCategoryDroppableId,
} from '@/lib/subscribe/subscribe-source-groups';

const APP_DRAG_OVERLAY_HOST_ID = 'app-drag-overlay-host';

/** 全应用拖拽浮层宿主：固定铺满 + 明确 z-index，压过侧栏/主内容（Solid Portal 包装层也落在此层内） */
export function ensureAppDragOverlayHost(): HTMLElement {
  let host = document.getElementById(APP_DRAG_OVERLAY_HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = APP_DRAG_OVERLAY_HOST_ID;
    host.setAttribute('data-app-drag-overlay-host', '');
    host.style.cssText = [
      'position:fixed',
      'inset:0',
      `z-index:${APP_DRAG_OVERLAY_Z_INDEX}`,
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(host);
  }
  return host;
}

/**
 * 替代库自带 DragOverlay（其 Portal 直挂 body，包装层无 z-index，会被 z-40 侧栏与主区盖住）。
 * 行为对齐官方：setOverlay + 跟随 transform。
 */
export function SubscribeDragOverlay(props: {
  class?: string;
  children: JSX.Element | ((activeDraggable: Draggable | null) => JSX.Element);
}) {
  const ctx = useDragDropContext();
  if (!ctx) return null;

  const [state, { onDragStart, onDragEnd, setOverlay, clearOverlay }] = ctx;
  let node: HTMLDivElement | undefined;

  onDragStart(({ draggable }) => {
    setOverlay({
      node: draggable.node,
      layout: draggable.layout,
    });
    queueMicrotask(() => {
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const base = draggable.layout;
      const layout = Object.assign(Object.create(Object.getPrototypeOf(base)), base, {
        x: base.x + (base.width - rect.width) / 2,
        y: base.y + (base.height - rect.height) / 2,
      });
      setOverlay({ node, layout });
    });
  });

  onDragEnd(() => queueMicrotask(clearOverlay));

  const style = (): JSX.CSSProperties => {
    const overlay = state.active.overlay;
    const draggable = state.active.draggable;
    if (!overlay || !draggable) return {};
    return {
      position: 'fixed',
      transition: 'transform 0s',
      top: `${overlay.layout.top}px`,
      left: `${overlay.layout.left}px`,
      'min-width': `${draggable.layout.width}px`,
      'min-height': `${draggable.layout.height}px`,
      'pointer-events': 'none',
      ...transformStyle(overlay.transform),
    };
  };

  return (
    <Portal mount={ensureAppDragOverlayHost()}>
      <Show when={state.active.draggable}>
        <div
          ref={(el) => {
            node = el;
          }}
          class={cn('pointer-events-none', props.class)}
          style={style()}
        >
          {typeof props.children === 'function'
            ? props.children(state.active.draggable)
            : props.children}
        </div>
      </Show>
    </Portal>
  );
}

export type SubscribeSourceLayoutItem = { id: string; category: string };

export function subscribeContainerId(category: string): string {
  return String(subscribeCategoryDroppableId(category));
}

export function subscribeCategoryFromContainerId(containerId: Id): string {
  return parseSubscribeCategoryDroppableId(containerId) ?? '';
}

export function buildSubscribeContainers(
  groups: Array<[string, SubSourceRow[]]>,
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [category, list] of groups) {
    next[subscribeContainerId(category)] = list.map((s) => s.id);
  }
  return next;
}

export function subscribeContainersToLayout(
  containers: Record<string, string[]>,
): SubscribeSourceLayoutItem[] {
  const layout: SubscribeSourceLayoutItem[] = [];
  for (const [containerId, ids] of Object.entries(containers)) {
    const category = subscribeCategoryFromContainerId(containerId);
    for (const id of ids) {
      layout.push({ id, category });
    }
  }
  return layout;
}

function layoutToContainers(
  layout: SubscribeSourceLayoutItem[],
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const item of layout) {
    const key = subscribeContainerId(item.category);
    (next[key] ??= []).push(item.id);
  }
  return next;
}

function subscribeContainersEqual(
  a: Record<string, string[]>,
  b: Record<string, string[]>,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left = a[key] ?? [];
    const right = b[key] ?? [];
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return false;
    }
  }
  return true;
}

/** groups 是否已反映本次落库 layout（用于挡住 refetch 前的旧数据回灌） */
export function subscribeGroupsMatchLayout(
  groups: Array<[string, SubSourceRow[]]>,
  layout: SubscribeSourceLayoutItem[],
): boolean {
  return subscribeContainersEqual(
    buildSubscribeContainers(groups),
    layoutToContainers(layout),
  );
}

/** 官方 closestContainerOrItem：先找最近容器，再找容器内最近项 */
export function createSubscribeClosestContainerOrItem(
  getContainers: () => Record<string, string[]>,
): CollisionDetector {
  return (draggable, droppables, context) => {
    const containers = getContainers();
    const isContainer = (id: Id) => Object.prototype.hasOwnProperty.call(containers, String(id));

    const closestContainer = closestCenter(
      draggable,
      droppables.filter((d) => isContainer(d.id)),
      context,
    );
    if (!closestContainer) return null;

    const containerItemIds = containers[String(closestContainer.id)] ?? [];
    const closestItem = closestCenter(
      draggable,
      droppables.filter((d) => containerItemIds.includes(String(d.id))),
      context,
    );
    if (!closestItem) return closestContainer;

    const draggableContainer = (() => {
      const id = String(draggable.id);
      for (const [key, items] of Object.entries(containers)) {
        if (items.includes(id)) return key;
      }
      return null;
    })();

    if (draggableContainer !== String(closestContainer.id)) {
      const isLastItem =
        containerItemIds.indexOf(String(closestItem.id)) === containerItemIds.length - 1;
      if (isLastItem) {
        const belowLastItem =
          draggable.transformed.center.y > closestItem.transformed.center.y;
        if (belowLastItem) return closestContainer;
      }
    }
    return closestItem;
  };
}

export function useSubscribeMultiListDnd(options: {
  groups: () => Array<[string, SubSourceRow[]]>;
  sources: () => SubSourceRow[];
  onPersist: (layout: SubscribeSourceLayoutItem[]) => void | Promise<void>;
  onExpandCategory?: (category: string) => void;
}) {
  const [containers, setContainers] = createStore<Record<string, string[]>>({});
  const [dragging, setDragging] = createSignal(false);
  /** 松手后已乐观提交的顺序；在 groups refetch 追上前禁止用旧数据 reconcile */
  const [pendingLayout, setPendingLayout] = createSignal<SubscribeSourceLayoutItem[] | null>(
    null,
  );

  const sourceById = createMemo(() => {
    const map = new Map<string, SubSourceRow>();
    for (const source of options.sources()) map.set(source.id, source);
    return map;
  });

  createEffect(() => {
    const groups = options.groups();
    if (dragging()) return;
    const pending = pendingLayout();
    const next = buildSubscribeContainers(groups);
    if (pending) {
      if (subscribeGroupsMatchLayout(groups, pending)) {
        setPendingLayout(null);
        // 顺序已一致时勿 reconcile，避免 For/样式无意义刷新导致选中·hover 闪烁
        if (!subscribeContainersEqual(containers, next)) {
          setContainers(reconcile(next));
        }
      }
      return;
    }
    if (!subscribeContainersEqual(containers, next)) {
      setContainers(reconcile(next));
    }
  });

  const containerIds = createMemo(() => Object.keys(containers));

  const isContainer = (id: Id) =>
    Object.prototype.hasOwnProperty.call(containers, String(id));

  const getContainer = (id: Id): string | undefined => {
    const itemId = String(id);
    for (const [key, items] of Object.entries(containers)) {
      if (items.includes(itemId)) return key;
    }
    return undefined;
  };

  const collisionDetector = createSubscribeClosestContainerOrItem(() => ({ ...containers }));

  const move = (
    draggableId: Id,
    droppableId: Id,
    /** true：仅跨容器时改 store（同分类留给 SortableProvider 做位移动画） */
    onlyWhenChangingContainer = true,
  ): string | null => {
    const draggableContainer = getContainer(draggableId);
    const droppableContainer = isContainer(droppableId)
      ? String(droppableId)
      : getContainer(droppableId);
    if (!draggableContainer || !droppableContainer) return null;

    if (draggableContainer !== droppableContainer || !onlyWhenChangingContainer) {
      const containerItemIds = containers[droppableContainer] ?? [];
      let index = containerItemIds.indexOf(String(droppableId));
      if (index === -1) index = containerItemIds.length;
      const movingId = String(draggableId);

      if (draggableContainer === droppableContainer) {
        const fromItems = containers[draggableContainer] ?? [];
        if (String(droppableId) === movingId) {
          return subscribeCategoryFromContainerId(droppableContainer);
        }
        const next = fromItems.filter((item) => item !== movingId);
        const result = [...next.slice(0, index), movingId, ...next.slice(index)];
        if (result.every((id, i) => id === fromItems[i])) {
          return subscribeCategoryFromContainerId(droppableContainer);
        }
        setContainers(draggableContainer, result);
      } else {
        batch(() => {
          setContainers(draggableContainer, (items) =>
            (items ?? []).filter((item) => item !== movingId),
          );
          setContainers(droppableContainer, (items) => {
            const list = (items ?? []).filter((item) => item !== movingId);
            return [...list.slice(0, index), movingId, ...list.slice(index)];
          });
        });
      }
    }
    return subscribeCategoryFromContainerId(droppableContainer);
  };

  const onDragOver: DragEventHandler = ({ draggable, droppable }) => {
    if (!draggable || !droppable) return;
    // 同分类不改 store，交给 SortableProvider + createSortable 位移动画
    const targetCategory = move(draggable.id, droppable.id, true);
    if (targetCategory !== null) {
      options.onExpandCategory?.(targetCategory);
    }
  };

  const onDragEnd: DragEventHandler = ({ draggable, droppable }) => {
    if (draggable && droppable) {
      const targetCategory = move(draggable.id, droppable.id, false);
      if (targetCategory !== null) {
        options.onExpandCategory?.(targetCategory);
      }
    }
    const snapshot: Record<string, string[]> = {};
    for (const key of Object.keys(containers)) {
      snapshot[key] = [...(containers[key] ?? [])];
    }
    const layout = subscribeContainersToLayout(snapshot);
    // 乐观顺序钉住：persist 返回后 revision 已 bump，但 createResource 仍可能短暂是旧 groups
    setPendingLayout(layout);
    void Promise.resolve(options.onPersist(layout))
      .catch(() => {
        setPendingLayout(null);
        setContainers(reconcile(buildSubscribeContainers(options.groups())));
      })
      .finally(() => {
        setDragging(false);
      });
  };

  const onDragStart: DragEventHandler = () => {
    setPendingLayout(null);
    setDragging(true);
  };

  /** 拖拽中或等待列表数据追上：侧栏保持 overflow-visible，避免松手瞬间裁切/样式闪 */
  const settleVisual = () => dragging() || pendingLayout() != null;

  return {
    containers,
    containerIds,
    sourceById,
    dragging,
    settleVisual,
    collisionDetector,
    onDragStart,
    onDragOver,
    onDragEnd,
    itemsOf: (category: string) => containers[subscribeContainerId(category)] ?? [],
  };
}

export function SubscribeCategoryDroppable(props: {
  category: string;
  class?: string;
  children: JSX.Element;
}) {
  const droppable = createDroppable(subscribeContainerId(props.category));
  return (
    <div
      ref={droppable}
      class={cn(
        props.class,
        droppable.isActiveDroppable && 'rounded-md ring-1 ring-primary/35 bg-primary/5',
      )}
    >
      {props.children}
    </div>
  );
}

export function SubscribeSourceSortableRow(props: {
  id: Id;
  class?: string;
  children: (api: {
    dragActivators: Record<string, unknown>;
    isActiveDraggable: boolean;
  }) => JSX.Element;
}) {
  const sortable = createSortable(props.id);
  const ctx = useDragDropContext();
  const isDragging = () => !!ctx?.[0].active.draggable;

  return (
    <div
      ref={sortable}
      class={cn(
        props.class,
        sortable.isActiveDraggable && 'opacity-25',
        isDragging() && 'transition-transform duration-200 ease-out',
      )}
    >
      {props.children({
        dragActivators: sortable.dragActivators,
        isActiveDraggable: sortable.isActiveDraggable,
      })}
    </div>
  );
}

export function SubscribeDragHandle(props: {
  activators: Record<string, unknown>;
  class?: string;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      class={cn(
        'flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center px-0 text-muted-foreground active:cursor-grabbing',
        props.class,
      )}
      aria-label={props['aria-label'] ?? '拖拽排序'}
      {...props.activators}
      onClick={(e: MouseEvent) => e.stopPropagation()}
    >
      ≡
    </button>
  );
}
