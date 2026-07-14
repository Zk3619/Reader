/**
 * 通用虚拟列表：@tanstack/solid-virtual + 可选 @thisbeyond/solid-dnd 排序。
 * 行使用 translateY 绝对定位（TanStack 默认），容器需有明确宽度。
 */

import { createVirtualizer, type Virtualizer } from '@tanstack/solid-virtual';
import { useDragDropContext } from '@thisbeyond/solid-dnd';
import { For, Show, createEffect, createMemo, onCleanup, onMount, type Accessor, type JSX } from 'solid-js';
import { scrollEdgeInset, scrollGutterStableBoth } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import { VirtualListSortableRow } from '@/components/shared/virtual-list/VirtualListSortableRow';
import { VirtualListSortableShell } from '@/components/shared/virtual-list/VirtualListSortableRoot';
import type {
  VirtualListRowMeta,
  VirtualListSortableConfig,
  VirtualListDragStyle,
} from '@/components/shared/virtual-list/types';
import type { Id } from '@thisbeyond/solid-dnd';
import {
  pointerScrollContentCoords,
  resolveSortableIndexFromContentOffset,
} from '@/components/shared/virtual-list/virtual-sortable-coordinates';
import type { VirtualSortableTargetResolver } from '@/components/shared/virtual-list/virtual-sortable-collision';
import {
  mergePinnedVirtualRange,
  useVirtualListDragPinIndex,
} from '@/components/shared/virtual-list/virtual-list-drag-pin';
import {
  reorderItemsByIds,
  useVirtualListSortableDisplayIds,
} from '@/components/shared/virtual-list/virtual-list-sortable-display-order';
import {
  stabilizeListByRef,
  stabilizePrimitiveList,
  stabilizeReorderedListById,
} from '@/components/shared/virtual-list/stabilize-list-ref';
import {
  createVirtualListScrollCoalesce,
  setCoverLoadScrollIdleProbe,
  VirtualListScrollCoalesceContext,
} from '@/components/shared/virtual-list/virtual-list-scroll-coalesce';

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
  /** 滚动容器内、虚拟列表之前的顶部内容（如粘性表头，须与行同宽以对齐） */
  scrollHeader?: JSX.Element;
  /** 滚动容器内、虚拟列表之后的底部内容（如加载更多占位） */
  scrollFooter?: JSX.Element;
  /** 使用外部滚动容器（书架主滚动区等），避免双层滚动 */
  externalScrollElement?: Accessor<HTMLDivElement | null | undefined>;
  /** 布局依赖变化时重新 measure（如响应式网格列宽/行高） */
  remeasureWhen?: Accessor<unknown>;
  /** 虚拟化实例就绪（供外层 sortable 在自动滚动后 measure） */
  onVirtualizerReady?: (api: { measure: () => void }) => void;
  sortable?: VirtualListSortableConfig<T>;
  /** 拖拽浮层；未提供则不显示 DragOverlay 内容 */
  renderDragOverlay?: (activeId: Id | null) => JSX.Element;
  /** 实体 key 模式下行渲染（按 id 挂载，避免排序后 item 引用变化 remount） */
  renderByKey?: (
    itemKey: string,
    index: Accessor<number>,
    size: Accessor<number>,
  ) => JSX.Element;
  children?: (item: T, index: number, meta: VirtualListRowMeta) => JSX.Element;
}

function resolveEstimateSize(
  estimate: number | ((index: number) => number),
): (index: number) => number {
  return typeof estimate === 'number' ? () => estimate : estimate;
}

/** 行内订阅 item 变化，避免虚拟窗口 reconcile 时快照过期 */
function VirtualListRowContent<T>(props: {
  item: Accessor<T>;
  index: number;
  size: Accessor<number>;
  render: VirtualListProps<T>['children'];
}) {
  return <>{props.render!(props.item(), props.index, { size: props.size() })}</>;
}

/** 按 entityKey 稳定挂载行内容（组件实例随 For each 保留，不依赖 item 引用） */
function VirtualListEntityRowSlot(props: {
  entityKey: string;
  flatIndex: Accessor<number>;
  rowSize: Accessor<number>;
  renderByKey: (
    itemKey: string,
    index: Accessor<number>,
    size: Accessor<number>,
  ) => JSX.Element;
}) {
  return (
    <>{props.renderByKey(props.entityKey, props.flatIndex, props.rowSize)}</>
  );
}

/** 按实体 id 挂载可见行（与 VirtualGridRowsList 内层 For 一致），排序时 DOM 随实体迁移而非槽位 remount */
function VirtualListEntityVisibleRow<T>(props: {
  entityKey: string;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  renderedItems: Accessor<readonly T[]>;
  resolveRowId: (item: T, index: number) => Id;
  estimateSize: (index: number) => number;
  rowSortable: Accessor<boolean>;
  dragStyle?: VirtualListDragStyle;
  render?: VirtualListProps<T>['children'];
  renderByKey?: VirtualListProps<T>['renderByKey'];
}) {
  const flatIndex = createMemo(() => {
    const items = props.renderedItems();
    for (let i = 0; i < items.length; i++) {
      if (String(props.resolveRowId(items[i]!, i)) === props.entityKey) return i;
    }
    return -1;
  });

  const virtualRow = createMemo(() => {
    const index = flatIndex();
    if (index < 0) return undefined;
    return props.virtualizer.getVirtualItems().find((row) => row.index === index);
  });

  const item = () => {
    const index = flatIndex();
    if (index < 0) return undefined;
    return props.renderedItems()[index];
  };

  const rowSize = () => virtualRow()?.size ?? props.estimateSize(Math.max(0, flatIndex()));

  const rowBody = () =>
    props.renderByKey ? (
      <VirtualListEntityRowSlot
        entityKey={props.entityKey}
        flatIndex={flatIndex}
        rowSize={rowSize}
        renderByKey={props.renderByKey}
      />
    ) : (
      <Show when={item()}>
        <VirtualListRowContent
          item={item as Accessor<T>}
          index={flatIndex()}
          size={rowSize}
          render={props.render!}
        />
      </Show>
    );

  return (
    <div
      class="absolute left-0 w-full min-w-0"
      style={{
        top: `${virtualRow()?.start ?? 0}px`,
        height: `${rowSize()}px`,
      }}
    >
      <Show when={props.rowSortable()} fallback={rowBody()}>
        <VirtualListSortableRow
          id={props.entityKey}
          enabled
          dragStyle={props.dragStyle}
          class="h-full w-full min-w-0"
        >
          {rowBody()}
        </VirtualListSortableRow>
      </Show>
    </div>
  );
}

/** 按槽位 index 挂载可见行（网格行 / 无实体 key 场景） */
function VirtualListIndexVisibleRow<T>(props: {
  index: number;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  renderedItems: Accessor<readonly T[]>;
  resolveRowId: (item: T, index: number) => Id;
  estimateSize: (index: number) => number;
  rowSortable: Accessor<boolean>;
  useEntitySortableKeys: boolean;
  dragStyle?: VirtualListDragStyle;
  render: VirtualListProps<T>['children'];
}) {
  const virtualRow = createMemo(() =>
    props.virtualizer.getVirtualItems().find((row) => row.index === props.index),
  );

  const item = () => props.renderedItems()[props.index]!;
  const sortableId = () => String(props.resolveRowId(item(), props.index));
  const rowSize = () => virtualRow()?.size ?? props.estimateSize(props.index);

  const rowContent = (
    <VirtualListRowContent
      item={item}
      index={props.index}
      size={rowSize}
      render={props.render}
    />
  );

  return (
    <div
      class="absolute left-0 w-full min-w-0"
      style={{
        top: `${virtualRow()?.start ?? 0}px`,
        height: `${rowSize()}px`,
      }}
    >
      <Show when={props.rowSortable()} fallback={rowContent}>
        <VirtualListSortableRow
          id={props.useEntitySortableKeys ? sortableId() : props.index}
          enabled
          dragStyle={props.dragStyle}
          class="h-full w-full min-w-0"
        >
          {rowContent}
        </VirtualListSortableRow>
      </Show>
    </div>
  );
}

/** 仅 scrollTop 实际变化时才算「在滚动」，避免内容增高触发的 scroll 事件误伤封面加载 */
function markScrollIfPositionChanged(
  el: HTMLDivElement,
  lastScrollTopRef: { current: number | null },
  markScrolling: () => void,
): boolean {
  const top = el.scrollTop;
  if (lastScrollTopRef.current === top) return false;
  lastScrollTopRef.current = top;
  markScrolling();
  return true;
}

/** 滚动容器；拖拽时刷新布局以驱动位移动画（scroll 由 virtualizer 自行订阅，勿每帧 measure） */
function VirtualListScrollHost(props: {
  class?: string;
  useExternalScroll: boolean;
  setScrollEl: (el: HTMLDivElement) => void;
  onScrollContainer?: (el: HTMLDivElement) => void;
  onScroll?: (el: HTMLDivElement) => void;
  markScrolling: () => void;
  children: JSX.Element;
}) {
  const ctx = useDragDropContext();
  const lastScrollTopRef = { current: null as number | null };

  return (
    <div
      ref={(el) => {
        props.setScrollEl(el);
        if (!props.useExternalScroll) {
          props.onScrollContainer?.(el);
          lastScrollTopRef.current = el.scrollTop;
        }
      }}
      class={props.class}
      onScroll={(e) => {
        if (props.useExternalScroll) return;
        const el = e.currentTarget;
        markScrollIfPositionChanged(el, lastScrollTopRef, props.markScrolling);
        props.onScroll?.(el);
        if (ctx?.[0].active.draggable) {
          ctx[1].recomputeLayouts();
        }
      }}
    >
      {props.children}
    </div>
  );
}

/**
 * 列表主体：须在 SortableShell 的 displayIds Provider 内渲染，
 * 与 VirtualGridRowsList 的 GridListContent 一致。
 */
function VirtualListCore<T>(props: VirtualListProps<T>) {
  const scrollCoalesce = createVirtualListScrollCoalesce();
  onMount(() => {
    setCoverLoadScrollIdleProbe(() => scrollCoalesce.isScrollIdle());
  });
  onCleanup(() => setCoverLoadScrollIdleProbe(null));
  const overscan = () => props.overscan ?? DEFAULT_OVERSCAN;
  const estimate = createMemo(() => resolveEstimateSize(props.estimateSize));
  const pinnedVirtualIndex = useVirtualListDragPinIndex();
  const displayIds = useVirtualListSortableDisplayIds();

  let scrollEl: HTMLDivElement | undefined;
  const useExternalScroll = () => !!props.externalScrollElement;

  const resolveScrollElement = () => {
    const external = props.externalScrollElement?.();
    if (external) return external;
    return scrollEl ?? null;
  };

  const sortableEnabled = () => props.sortable?.enabled() ?? false;

  const rowId = (item: T, index: number): Id => {
    if (props.getItemKey) return props.getItemKey(item, index);
    return index;
  };

  let renderedItemsCache: readonly T[] = [];
  const renderedItems = createMemo(() => {
    const raw = props.items();
    const ids = displayIds();
    let next: readonly T[];
    const useDisplayOrder =
      sortableEnabled() && ids.length > 0 && ids.length === raw.length;
    if (!useDisplayOrder) {
      next = raw;
    } else {
      next = reorderItemsByIds(raw, ids, (item, index) => rowId(item, index));
    }
    const itemId = (entry: T) => String(rowId(entry, 0));
    next = stabilizeReorderedListById(renderedItemsCache, next, itemId);
    const stabilized = stabilizeListByRef(renderedItemsCache, next);
    renderedItemsCache = stabilized;
    return stabilized;
  });

  const sortableCfg = () => props.sortable;
  const useEntitySortableKeys = () =>
    !!sortableCfg() && !!props.getItemKey;

  const virtualizer = createVirtualizer({
    get count() {
      return renderedItems().length;
    },
    getScrollElement: resolveScrollElement,
    estimateSize: (i) => estimate()(i),
    overscan: overscan(),
    rangeExtractor: (range) =>
      mergePinnedVirtualRange(
        range,
        pinnedVirtualIndex(),
        renderedItems().length,
      ),
    getItemKey: (i) => {
      if (useEntitySortableKeys()) return String(i);
      if (props.getItemKey) {
        return String(props.getItemKey!(renderedItems()[i]!, i));
      }
      return String(i);
    },
  });

  let visibleIndicesCache: readonly number[] = [];
  const visibleIndices = createMemo(() => {
    const next = virtualizer.getVirtualItems().map((row) => row.index);
    const stabilized = stabilizePrimitiveList(visibleIndicesCache, next);
    visibleIndicesCache = stabilized;
    return stabilized;
  });

  let visibleEntityKeysCache: readonly string[] = [];
  const visibleEntityKeys = createMemo(() => {
    const items = renderedItems();
    const next = visibleIndices().map((index) =>
      String(rowId(items[index]!, index)),
    );
    const stabilized = stabilizePrimitiveList(visibleEntityKeysCache, next);
    visibleEntityKeysCache = stabilized;
    return stabilized;
  });

  const isRowSortable = (item: T, index: number): boolean => {
    const cfg = props.sortable;
    if (!cfg || !sortableEnabled()) return false;
    return cfg.isSortable ? cfg.isSortable(item, index) : true;
  };

  const externalLastScrollTop = { current: null as number | null };
  createEffect(() => {
    const external = props.externalScrollElement?.();
    if (!external) return;
    props.onScrollContainer?.(external);
    externalLastScrollTop.current = external.scrollTop;
    const handleScroll = () => {
      markScrollIfPositionChanged(
        external,
        externalLastScrollTop,
        () => scrollCoalesce.markScrolling(),
      );
      props.onScroll?.(external);
    };
    external.addEventListener('scroll', handleScroll, { passive: true });
    onCleanup(() => external.removeEventListener('scroll', handleScroll));
  });

  onMount(() => {
    virtualizer.measure();
    props.onVirtualizerReady?.({ measure: () => virtualizer.measure() });
  });

  createEffect(() => {
    props.remeasureWhen?.();
    virtualizer.measure();
  });

  const listBody = (
    <div
      class="relative w-full min-w-0"
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      <Show
        when={useEntitySortableKeys()}
        fallback={
          <For each={visibleIndices()}>
            {(index) => (
              <VirtualListIndexVisibleRow
                index={index}
                virtualizer={virtualizer}
                renderedItems={renderedItems}
                resolveRowId={rowId}
                estimateSize={(i) => estimate()(i)}
                rowSortable={() => {
                  const items = renderedItems();
                  const item = items[index];
                  if (!item) return false;
                  return sortableEnabled() && isRowSortable(item, index);
                }}
                useEntitySortableKeys={false}
                dragStyle={sortableCfg()?.dragStyle}
                render={props.children}
              />
            )}
          </For>
        }
      >
        <For each={visibleEntityKeys()}>
          {(entityKey) => (
            <VirtualListEntityVisibleRow
              entityKey={entityKey}
              virtualizer={virtualizer}
              renderedItems={renderedItems}
              resolveRowId={rowId}
              estimateSize={(i) => estimate()(i)}
              rowSortable={() => {
                const items = renderedItems();
                for (let i = 0; i < items.length; i++) {
                  if (String(rowId(items[i]!, i)) !== entityKey) continue;
                  return sortableEnabled() && isRowSortable(items[i]!, i);
                }
                return false;
              }}
              dragStyle={sortableCfg()?.dragStyle}
              render={props.children}
              renderByKey={props.renderByKey}
            />
          )}
        </For>
      </Show>
    </div>
  );

  return (
    <VirtualListScrollCoalesceContext.Provider value={scrollCoalesce}>
      {useExternalScroll() ? (
        <>
          {props.scrollHeader}
          {listBody}
          {props.scrollFooter}
        </>
      ) : (
        <VirtualListScrollHost
          useExternalScroll={false}
          class={cn(
            'min-w-0 w-full flex-1 overflow-y-auto',
            scrollGutterStableBoth,
            // 粘性表头贴顶：勿用 scrollEdgeInset 的 padding-top，否则滚动时表头上方透出行内容
            props.scrollHeader
              ? 'pt-0 pb-2 app-scroll-bottom-inset'
              : scrollEdgeInset,
            props.listInnerClass,
            props.class,
          )}
          setScrollEl={(el) => {
            scrollEl = el;
          }}
          onScrollContainer={props.onScrollContainer}
          onScroll={props.onScroll}
          markScrolling={() => scrollCoalesce.markScrolling()}
        >
          {props.scrollHeader}
          {listBody}
          {props.scrollFooter}
        </VirtualListScrollHost>
      )}
    </VirtualListScrollCoalesceContext.Provider>
  );
}

function VirtualListWithSortable<T>(props: VirtualListProps<T>) {
  const sortableConfig = props.sortable!;
  let scrollEl: HTMLDivElement | undefined;
  let remeasureVirtualList: (() => void) | undefined;

  const resolveScrollElement = () => {
    const external = props.externalScrollElement?.();
    if (external) return external;
    return scrollEl ?? null;
  };

  const estimate = createMemo(() => resolveEstimateSize(props.estimateSize));

  const resolveTargetIndex: VirtualSortableTargetResolver = ({
    scrollEl: scrollHost,
    pointerX,
    pointerY,
  }) => {
    const { contentY } = pointerScrollContentCoords(scrollHost, pointerX, pointerY);
    return resolveSortableIndexFromContentOffset(
      contentY,
      props.items().length,
      (i) => estimate()(i),
    );
  };

  return (
    <VirtualListSortableShell
      enabled={() => sortableConfig.enabled()}
      ids={sortableConfig.ids}
      onReorder={sortableConfig.onReorder}
      persistOnly={() => sortableConfig.persistOnly ?? false}
      dragStyle={sortableConfig.dragStyle}
      scrollContainer={() => resolveScrollElement() ?? undefined}
      resolveTargetIndex={() => resolveTargetIndex}
      resolvePinnedVirtualIndex={() => (activeId) => {
        const ids = sortableConfig.ids();
        const index = ids.findIndex((id) => String(id) === String(activeId));
        return index >= 0 ? index : undefined;
      }}
      onAfterAutoScroll={() => remeasureVirtualList?.()}
      renderOverlay={props.renderDragOverlay}
    >
      <VirtualListCore
        {...props}
        onScrollContainer={(el) => {
          scrollEl = el;
          props.onScrollContainer?.(el);
        }}
        onVirtualizerReady={(api) => {
          remeasureVirtualList = () => api.measure();
          props.onVirtualizerReady?.(api);
        }}
      />
    </VirtualListSortableShell>
  );
}

export function VirtualList<T>(props: VirtualListProps<T>) {
  const sortableConfig = () => props.sortable;
  return (
    <Show when={sortableConfig()} fallback={<VirtualListCore {...props} />}>
      {(cfg) => <VirtualListWithSortable {...props} sortable={cfg()} />}
    </Show>
  );
}
