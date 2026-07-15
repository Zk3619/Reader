import {
  createSortable,
  useDragDropContext,
  useSortableContext,
  type Id,
} from '@thisbeyond/solid-dnd';
import { Show, createContext, useContext, type Accessor, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import type { VirtualListDragStyle } from '@/components/shared/virtual-list/types';

export interface VirtualListSortableRowProps {
  id: Id;
  enabled: boolean;
  dragStyle?: VirtualListDragStyle;
  class?: string;
  style?: JSX.CSSProperties;
  children: JSX.Element;
}

interface VirtualListSortableRowContextValue {
  dragActivators: Record<string, unknown>;
  isActiveDraggable: Accessor<boolean>;
  isDragging: Accessor<boolean>;
}

const VirtualListSortableRowContext =
  createContext<VirtualListSortableRowContextValue>();

export function useVirtualListSortableRow(): VirtualListSortableRowContextValue | undefined {
  return useContext(VirtualListSortableRowContext);
}

/** 在 SortableProvider 内包裹单行；enabled=false 时不注册 sortable */
export function VirtualListSortableRow(props: VirtualListSortableRowProps) {
  return (
    <Show when={props.enabled} fallback={props.children}>
      <VirtualListSortableRowInner
        id={props.id}
        dragStyle={props.dragStyle}
        class={props.class}
        style={props.style}
      >
        {props.children}
      </VirtualListSortableRowInner>
    </Show>
  );
}

function VirtualListSortableRowPlain(props: {
  dragStyle?: VirtualListDragStyle;
  class?: string;
  style?: JSX.CSSProperties;
  children: JSX.Element;
}) {
  return (
    <div
      class={cn(props.dragStyle?.rowClass, props.class)}
      style={props.style}
    >
      {props.children}
    </div>
  );
}

/** 仅在 DragDropProvider + SortableProvider 内挂载；避免 HMR/时序导致 createSortable 崩溃 */
function VirtualListSortableRowInner(props: {
  id: Id;
  dragStyle?: VirtualListDragStyle;
  class?: string;
  style?: JSX.CSSProperties;
  children: JSX.Element;
}) {
  const dnd = useDragDropContext();
  const sortableCtx = useSortableContext();

  if (import.meta.env.DEV && (!dnd || !sortableCtx)) {
    console.warn(
      `[VirtualListSortableRow] id=${String(props.id)} 缺少 DragDropProvider/SortableProvider，拖拽已降级为静态行`,
    );
  }

  return (
    <Show
      when={dnd && sortableCtx}
      fallback={
        <VirtualListSortableRowPlain
          dragStyle={props.dragStyle}
          class={props.class}
          style={props.style}
        >
          {props.children}
        </VirtualListSortableRowPlain>
      }
    >
      <VirtualListSortableRowDnd
        id={props.id}
        dragStyle={props.dragStyle}
        class={props.class}
        style={props.style}
      >
        {props.children}
      </VirtualListSortableRowDnd>
    </Show>
  );
}

function VirtualListSortableRowDnd(props: {
  id: Id;
  dragStyle?: VirtualListDragStyle;
  class?: string;
  style?: JSX.CSSProperties;
  children: JSX.Element;
}) {
  const sortable = createSortable(props.id);
  const ctx = useDragDropContext();
  const isDragging = () => !!ctx?.[0].active.draggable;
  const sortableRow: VirtualListSortableRowContextValue = {
    dragActivators: sortable.dragActivators as Record<string, unknown>,
    isActiveDraggable: () => sortable.isActiveDraggable,
    isDragging,
  };

  return (
    <div
      ref={sortable}
      class={cn(
        props.dragStyle?.rowClass,
        sortable.isActiveDraggable && props.dragStyle?.activeClass,
        isDragging() && 'transition-transform duration-200 ease-out',
        props.class,
      )}
      style={props.style}
    >
      <VirtualListSortableRowContext.Provider value={sortableRow}>
        {props.children}
      </VirtualListSortableRowContext.Provider>
    </div>
  );
}
