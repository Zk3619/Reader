/**
 * 通用虚拟列表：@tanstack/solid-virtual + 可选 @thisbeyond/solid-dnd 排序。
 * 行使用 translateY 绝对定位（TanStack 默认），容器需有明确宽度。
 */

import { createVirtualizer } from '@tanstack/solid-virtual';
import { useDragDropContext } from '@thisbeyond/solid-dnd';
import { For, createEffect, createMemo, onCleanup, onMount, type Accessor, type JSX } from 'solid-js';
import { scrollGutterStableBoth } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import { VirtualListSortableRow } from '@/components/shared/virtual-list/VirtualListSortableRow';
import { VirtualListSortableShell } from '@/components/shared/virtual-list/VirtualListSortableRoot';
import type {
  VirtualListRowMeta,
  VirtualListSortableConfig,
} from '@/components/shared/virtual-list/types';
import type { Id } from '@thisbeyond/solid-dnd';

const DEFAULT_OVERSCAN = 8;

export interface VirtualListProps<T> {
  items: Accessor<readonly T[]>;
  /** 固定行高（px），或按索引估算 */
  estimateSize: number | ((index: number) => number);
  class?: string;
  overscan?: number;
  getItemKey?: (item: T, index: number) => string | number;
  onScrollContainer?: (el: HTMLDivElement) => void;
  onScroll?: (el: HTMLDivElement) => void;
  /** 列表外壳 padding（加在滚动宿主层；行绝对定位时内层 relative 的 padding 不生效） */
  listInnerClass?: string;
  /** 使用外部滚动容器（书架主滚动区等），避免双层滚动 */
  externalScrollElement?: Accessor<HTMLDivElement | null | undefined>;
  /** 布局依赖变化时重新 measure（如响应式网格列宽/行高） */
  remeasureWhen?: Accessor<unknown>;
  sortable?: VirtualListSortableConfig<T>;
  /** 拖拽浮层；未提供则不显示 DragOverlay 内容 */
  renderDragOverlay?: (activeId: Id | null) => JSX.Element;
  children: (item: T, index: number, meta: VirtualListRowMeta) => JSX.Element;
}

function resolveEstimateSize(
  estimate: number | ((index: number) => number),
): (index: number) => number {
  return typeof estimate === 'number' ? () => estimate : estimate;
}

/** 滚动容器；在 Sortable 上下文中拖拽时刷新布局以驱动位移动画 */
function VirtualListScrollHost(props: {
  class?: string;
  useExternalScroll: boolean;
  setScrollEl: (el: HTMLDivElement) => void;
  onScrollContainer?: (el: HTMLDivElement) => void;
  onScroll?: (el: HTMLDivElement) => void;
  onMeasure: () => void;
  children: JSX.Element;
}) {
  const ctx = useDragDropContext();

  return (
    <div
      ref={(el) => {
        props.setScrollEl(el);
        if (!props.useExternalScroll) {
          props.onScrollContainer?.(el);
        }
      }}
      class={props.class}
      onScroll={(e) => {
        if (props.useExternalScroll) return;
        props.onMeasure();
        props.onScroll?.(e.currentTarget);
        if (ctx?.[0].active.draggable) {
          ctx[1].recomputeLayouts();
        }
      }}
    >
      {props.children}
    </div>
  );
}

export function VirtualList<T>(props: VirtualListProps<T>) {
  const overscan = () => props.overscan ?? DEFAULT_OVERSCAN;
  const estimate = createMemo(() => resolveEstimateSize(props.estimateSize));

  let scrollEl: HTMLDivElement | undefined;
  const useExternalScroll = () => !!props.externalScrollElement;

  const resolveScrollElement = () => {
    const external = props.externalScrollElement?.();
    if (external) return external;
    return scrollEl ?? null;
  };

  const virtualizer = createVirtualizer({
    get count() {
      return props.items().length;
    },
    getScrollElement: resolveScrollElement,
    estimateSize: (i) => estimate()(i),
    overscan: overscan(),
    getItemKey: props.getItemKey
      ? (i) => String(props.getItemKey!(props.items()[i]!, i))
      : undefined,
  });

  const sortableEnabled = () => props.sortable?.enabled() ?? false;

  const isRowSortable = (item: T, index: number): boolean => {
    const cfg = props.sortable;
    if (!cfg || !sortableEnabled()) return false;
    return cfg.isSortable ? cfg.isSortable(item, index) : true;
  };

  const rowId = (item: T, index: number): Id => {
    if (props.getItemKey) return props.getItemKey(item, index);
    return index;
  };

  const listBody = () => (
    <VirtualListScrollHost
      useExternalScroll={useExternalScroll()}
      class={cn(
        'min-w-0 w-full',
        useExternalScroll() ? 'flex-1' : cn('flex-1 overflow-y-auto py-1', scrollGutterStableBoth),
        props.listInnerClass,
        props.class,
      )}
      setScrollEl={(el) => {
        scrollEl = el;
      }}
      onScrollContainer={props.onScrollContainer}
      onScroll={props.onScroll}
      onMeasure={() => virtualizer.measure()}
    >
      <div
        class="relative w-full min-w-0"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        <For each={virtualizer.getVirtualItems()}>
          {(virtualRow) => {
            const index = virtualRow.index;
            const item = () => props.items()[index]!;
            const size = virtualRow.size;
            const sortable = sortableEnabled() && isRowSortable(item(), index);
            const id = rowId(item(), index);

            return (
              <div
                class="absolute left-0 w-full min-w-0"
                style={{
                  top: `${virtualRow.start}px`,
                  height: `${size}px`,
                }}
              >
                <VirtualListSortableRow
                  id={id}
                  enabled={sortable}
                  dragStyle={props.sortable?.dragStyle}
                  class="h-full w-full min-w-0"
                >
                  {props.children(item(), index, { size })}
                </VirtualListSortableRow>
              </div>
            );
          }}
        </For>
      </div>
    </VirtualListScrollHost>
  );

  createEffect(() => {
    const external = props.externalScrollElement?.();
    if (!external) return;
    props.onScrollContainer?.(external);
    const handleScroll = () => {
      virtualizer.measure();
      props.onScroll?.(external);
    };
    external.addEventListener('scroll', handleScroll, { passive: true });
    onCleanup(() => external.removeEventListener('scroll', handleScroll));
  });

  onMount(() => {
    virtualizer.measure();
  });

  createEffect(() => {
    props.remeasureWhen?.();
    virtualizer.measure();
  });

  const sortableCfg = props.sortable;
  if (!sortableCfg) {
    return listBody();
  }

  return (
    <VirtualListSortableShell
      enabled={sortableEnabled}
      ids={sortableCfg.ids}
      onReorder={sortableCfg.onReorder}
      dragStyle={sortableCfg.dragStyle}
      scrollContainer={() => resolveScrollElement() ?? undefined}
      renderOverlay={props.renderDragOverlay}
    >
      {listBody()}
    </VirtualListSortableShell>
  );
}
