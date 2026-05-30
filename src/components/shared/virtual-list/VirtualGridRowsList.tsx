/**
 * 响应式网格按「行」虚拟化（内部 VirtualList，默认不启用拖拽）。
 *
 * - `rowHeightMode="fixed"`（默认）：固定行高，与现有探索/缓存页行为一致
 * - `rowHeightMode="responsive"`：ResizeObserver + 列宽推导行高，供书架网格接入
 * - `sortable`：按网格单元（书/分组）拖拽，ids 为平铺顺序
 */

import { For, createEffect, createMemo, createSignal, onCleanup, type Accessor, type JSX } from 'solid-js';
import { VirtualList } from '@/components/shared/virtual-list/VirtualList';
import { VirtualListSortableRow } from '@/components/shared/virtual-list/VirtualListSortableRow';
import { VirtualListSortableShell } from '@/components/shared/virtual-list/VirtualListSortableRoot';
import {
  DEFAULT_VIRTUAL_LIST_DRAG_STYLE,
  VIRTUAL_LIST_DRAG_OVERLAY_FIT_STYLE,
  type VirtualListSortableConfig,
} from '@/components/shared/virtual-list/types';
import type { Id } from '@thisbeyond/solid-dnd';
import type { VirtualSortableTargetResolver } from '@/components/shared/virtual-list/virtual-sortable-collision';
import {
  reorderItemsByIds,
  useVirtualListSortableDisplayIds,
} from '@/components/shared/virtual-list/virtual-list-sortable-display-order';
import {
  pointerScrollContentCoords,
  resolveGridSortableIndexFromContentOffset,
} from '@/components/shared/virtual-list/virtual-sortable-coordinates';
import {
  buildVirtualGridRowLayoutMetrics,
  readGridGapPx,
  useVirtualGridContainerWidth,
  type VirtualGridResponsiveRowHeightConfig,
} from '@/components/shared/virtual-list/virtual-grid-row-layout';
import { roundVirtualGridPx } from '@/components/shared/virtual-list/virtual-grid-measure';
import { cn } from '@/lib/utils';

function resolveItems<T>(items: Accessor<readonly T[]> | readonly T[]): readonly T[] {
  return typeof items === 'function' ? items() : items;
}

export type VirtualGridRowHeightMode = 'fixed' | 'responsive';

export type {
  VirtualGridRowLayoutMetrics,
  VirtualGridResponsiveRowHeightConfig,
} from '@/components/shared/virtual-list/virtual-grid-row-layout';

export interface VirtualGridRowsListProps<T> {
  items: Accessor<readonly T[]> | readonly T[];
  colCount: Accessor<number>;
  rowHeightMode?: VirtualGridRowHeightMode;
  estimateRowSize?: number | Accessor<number>;
  responsiveRowHeight?: VirtualGridResponsiveRowHeightConfig;
  class?: string;
  gridClass: string;
  rowUlClass?: string;
  overscan?: number;
  externalScrollElement?: Accessor<HTMLDivElement | null | undefined>;
  onScrollContainer?: (el: HTMLDivElement) => void;
  onScroll?: (el: HTMLDivElement) => void;
  /** 传给 VirtualList.listInnerClass（书架网格整体 p-1，避免每行重复） */
  listInnerClass?: string;
  /**
   * 行间纵向间距 CSS 变量名（不含 `--`），与 `.bookshelf-layout-gap` 的 gap 同源；
   * 非末行 ul 使用 padding-bottom 承载行距，虚拟行高与实测 ul.offsetHeight 一致。
   */
  rowGapCssVar?: string;
  /**
   * 行间纵向间距（px），与 rowGapCssVar / 布局 spacing 同源；
   * fixed 模式下列表多列时用于虚拟行高，不依赖 responsiveRowHeight。
   */
  getInterRowGapPx?: () => number;
  /** 额外布局依赖（如书架 spacing），变化时 remeasure */
  remeasureDeps?: Accessor<unknown>;
  getItemKey?: (item: T, index: number) => string | number;
  sortable?: VirtualListSortableConfig<T>;
  renderDragOverlay?: (activeId: Id | null) => JSX.Element;
  children: (item: T, index: number) => JSX.Element;
}

const DEFAULT_FIXED_ROW_HEIGHT = 184;
const DEFAULT_HORIZONTAL_PADDING_PX = 8;

function resolveFixedRowHeight(
  estimate: number | Accessor<number> | undefined,
): () => number {
  if (estimate === undefined) return () => DEFAULT_FIXED_ROW_HEIGHT;
  if (typeof estimate === 'number') return () => estimate;
  return estimate;
}

export function VirtualGridRowsList<T>(props: VirtualGridRowsListProps<T>) {
  const rowHeightMode = () => props.rowHeightMode ?? 'fixed';
  const fixedRowHeight = resolveFixedRowHeight(props.estimateRowSize);

  let scrollContainer: HTMLDivElement | undefined;
  let sampleRowEl: HTMLUListElement | undefined;
  let remeasureVirtualList: (() => void) | undefined;

  const scrollContainerAccessor = () =>
    props.externalScrollElement?.() ?? scrollContainer;
  const containerWidth = useVirtualGridContainerWidth(scrollContainerAccessor);

  const horizontalPaddingPx = () =>
    props.responsiveRowHeight?.horizontalPaddingPx ?? DEFAULT_HORIZONTAL_PADDING_PX;

  const layoutMetrics = createMemo(() => {
    props.remeasureDeps?.();
    const w = containerWidth();
    const cols = Math.max(1, props.colCount());
    if (w <= 0) return null;
    const scrollEl = scrollContainerAccessor();
    const gapPx =
      scrollEl && props.responsiveRowHeight?.getGapPx
        ? props.responsiveRowHeight.getGapPx(scrollEl, sampleRowEl ?? null)
        : scrollEl
          ? readGridGapPx(scrollEl, sampleRowEl ?? null)
          : 8;
    return buildVirtualGridRowLayoutMetrics(w, cols, gapPx, horizontalPaddingPx());
  });

  const responsiveCardHeightPx = createMemo(() => {
    const cfg = props.responsiveRowHeight;
    const metrics = layoutMetrics();
    if (!cfg?.estimateRowHeight || !metrics) return fixedRowHeight();
    return cfg.estimateRowHeight(metrics);
  });

  const [measuredRowHeightPx, setMeasuredRowHeightPx] = createSignal<number | null>(null);

  const rowIndices = createMemo(() => {
    const cols = Math.max(1, props.colCount());
    const len = resolveItems(props.items).length;
    const count = Math.max(0, Math.ceil(len / cols));
    return Array.from({ length: count }, (_, i) => i);
  });

  const interRowGapPx = () => {
    const fromProp = props.getInterRowGapPx?.();
    if (fromProp != null) return roundVirtualGridPx(fromProp);
    return roundVirtualGridPx(layoutMetrics()?.gapPx ?? 8);
  };

  const usesRowGapPadding = () => !!props.rowGapCssVar;

  const estimatedRowSlotPx = (rowIndex: number) => {
    const base =
      rowHeightMode() === 'fixed'
        ? roundVirtualGridPx(fixedRowHeight())
        : roundVirtualGridPx(responsiveCardHeightPx());
    if (!usesRowGapPadding()) return base;
    const last = rowIndex >= rowIndices().length - 1;
    return last ? base : base + interRowGapPx();
  };

  const rowSlotHeightPx = (rowIndex: number) => {
    if (rowHeightMode() === 'fixed') return estimatedRowSlotPx(rowIndex);
    const measured = measuredRowHeightPx();
    if (measured != null) return measured;
    return estimatedRowSlotPx(rowIndex);
  };

  const layoutRevision = createMemo(() => ({
    mode: rowHeightMode(),
    width: containerWidth(),
    cols: props.colCount(),
    height: rowSlotHeightPx(0),
    gap: interRowGapPx(),
    measured: measuredRowHeightPx(),
    deps: props.remeasureDeps?.(),
  }));

  const syncSampleRowHeight = () => {
    const el = sampleRowEl;
    if (!el || rowHeightMode() !== 'responsive') return;
    const h = roundVirtualGridPx(el.offsetHeight);
    if (h > 0) setMeasuredRowHeightPx(h);
  };

  createEffect(() => {
    props.remeasureDeps?.();
    props.colCount();
    setMeasuredRowHeightPx(null);
    requestAnimationFrame(syncSampleRowHeight);
  });

  createEffect(() => {
    layoutRevision();
    const el = sampleRowEl;
    if (!el || rowHeightMode() !== 'responsive' || typeof ResizeObserver === 'undefined') {
      return;
    }

    syncSampleRowHeight();
    const ro = new ResizeObserver(() => requestAnimationFrame(syncSampleRowHeight));
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  });

  const rowSlice = (rowIndex: number, items: readonly T[]): readonly T[] => {
    const cols = Math.max(1, props.colCount());
    const start = rowIndex * cols;
    return items.slice(start, start + cols);
  };

  const sortableEnabled = () => props.sortable?.enabled() ?? false;

  const itemSortableId = (item: T, index: number): Id => {
    if (props.getItemKey) return props.getItemKey(item, index);
    return index;
  };

  const sortableCfg = createMemo(() => {
    const cfg = props.sortable;
    if (!cfg) return undefined;
    return {
      ...cfg,
      dragStyle: cfg.dragStyle ?? DEFAULT_VIRTUAL_LIST_DRAG_STYLE,
    };
  });

  createEffect(() => {
    if (rowHeightMode() !== 'responsive') return;
    const cfg = props.responsiveRowHeight;
    if (!cfg?.estimateRowHeight) {
      console.warn(
        '[VirtualGridRowsList] rowHeightMode="responsive" 需要 responsiveRowHeight.estimateRowHeight',
      );
    }
  });

  const handleScrollContainer = (el: HTMLDivElement) => {
    scrollContainer = el;
    props.onScrollContainer?.(el);
  };

  const listBody = (orderedItems: Accessor<readonly T[]>) => () => (
    <VirtualList
      class={cn('h-full min-h-0', props.class)}
      listInnerClass={props.listInnerClass}
      items={rowIndices}
      estimateSize={(rowIndex) => rowSlotHeightPx(rowIndex)}
      remeasureWhen={layoutRevision}
      overscan={props.overscan ?? 2}
      getItemKey={(rowIndex) => rowIndex}
      externalScrollElement={props.externalScrollElement}
      onScrollContainer={handleScrollContainer}
      onScroll={props.onScroll}
      onVirtualizerReady={(api) => {
        remeasureVirtualList = () => api.measure();
      }}
    >
      {(rowIndex) => {
        const lastRow = rowIndex >= rowIndices().length - 1;
        const gapVar = props.rowGapCssVar;
        return (
          <ul
            ref={(el) => {
              if (rowIndex === 0) sampleRowEl = el;
            }}
            class={cn(
              props.gridClass,
              props.rowUlClass,
              usesRowGapPadding() && 'box-border items-start',
            )}
            style={{
              ...(rowHeightMode() === 'responsive'
                ? {
                  'grid-template-columns': `repeat(${Math.max(1, props.colCount())}, minmax(0, 1fr))`,
                }
                : undefined),
              ...(gapVar && !lastRow
                ? { 'padding-bottom': `var(--${gapVar})` }
                : undefined),
            }}
          >
            <For each={rowSlice(rowIndex, orderedItems())}>
              {(item, i) => {
                const flatIndex =
                  rowIndex * Math.max(1, props.colCount()) + i();
                const id = itemSortableId(item, flatIndex);
                const cell = props.children(item, flatIndex);
                const cfg = sortableCfg();
                if (!cfg || !sortableEnabled()) {
                  return cell;
                }
                const enabled =
                  cfg.isSortable?.(item, flatIndex) ?? true;
                return (
                  <VirtualListSortableRow
                    id={id}
                    enabled={enabled}
                    dragStyle={cfg.dragStyle}
                    class="min-w-0 w-full touch-none"
                  >
                    {cell}
                  </VirtualListSortableRow>
                );
              }}
            </For>
          </ul>
        );
      }}
    </VirtualList>
  );

  const GridListContent = () => {
    const displayIds = useVirtualListSortableDisplayIds();
    const orderedItems = createMemo(() => {
      const raw = resolveItems(props.items);
      const ids = displayIds();
      if (ids.length === 0 || ids.length !== raw.length) return raw;
      return reorderItemsByIds(raw, ids, (item, index) => itemSortableId(item, index));
    });
    return listBody(orderedItems)();
  };

  const shell = sortableCfg();
  if (!shell) {
    const staticItems = createMemo(() => resolveItems(props.items));
    return listBody(staticItems)();
  }

  const resolveTargetIndex: VirtualSortableTargetResolver = ({
    scrollEl,
    pointerX,
    pointerY,
  }) => {
    const items = resolveItems(props.items);
    const cols = Math.max(1, props.colCount());
    const metrics = layoutMetrics();
    const { contentX, contentY } = pointerScrollContentCoords(
      scrollEl,
      pointerX,
      pointerY,
    );
    return resolveGridSortableIndexFromContentOffset(
      contentX,
      contentY,
      items.length,
      cols,
      rowSlotHeightPx,
      metrics?.colWidth ?? 0,
      metrics?.gapPx ?? interRowGapPx(),
    );
  };

  return (
    <VirtualListSortableShell
      enabled={sortableEnabled}
      ids={shell.ids}
      onReorder={shell.onReorder}
      persistOnly={() => shell.persistOnly ?? false}
      dragStyle={{
        ...shell.dragStyle,
        overlayStyle: {
          ...VIRTUAL_LIST_DRAG_OVERLAY_FIT_STYLE,
          ...shell.dragStyle?.overlayStyle,
        },
      }}
      scrollContainer={scrollContainerAccessor}
      resolveTargetIndex={() => resolveTargetIndex}
      gridColCount={props.colCount}
      onAfterAutoScroll={() => remeasureVirtualList?.()}
      renderOverlay={props.renderDragOverlay}
    >
      <GridListContent />
    </VirtualListSortableShell>
  );
}
