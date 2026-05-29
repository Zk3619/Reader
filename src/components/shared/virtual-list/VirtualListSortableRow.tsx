import { createSortable, useDragDropContext, type Id } from '@thisbeyond/solid-dnd';
import { Show, type JSX } from 'solid-js';
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

function VirtualListSortableRowInner(props: {
  id: Id;
  dragStyle?: VirtualListDragStyle;
  class?: string;
  style?: JSX.CSSProperties;
  children: JSX.Element;
}) {
  const sortable = createSortable(props.id);
  const ctx = useDragDropContext();
  const isDragging = () => !!ctx?.[0].active.draggable;

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
      {props.children}
    </div>
  );
}
