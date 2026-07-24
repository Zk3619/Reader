/**
 * 响应式网格按「行」虚拟化（内部 VirtualList，默认不启用拖拽）。
 *
 * - `rowHeightMode="fixed"`（默认）：固定行高，与现有探索/缓存页行为一致
 * - `rowHeightMode="responsive"`：ResizeObserver + 列宽推导行高，供书架网格接入
 * - `sortable`：按网格单元（书/分组）拖拽，ids 为平铺顺序
 */

import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  type Accessor,
  type JSX,
} from 'solid-js';
import {
  stabilizePrimitiveList,
  stabilizeReorderedListById,
} from '@/components/shared/virtual-list/stabilize-list-ref';
import {
  VirtualGridListBody,
  type VirtualGridListBodyProps,
} from '@/components/shared/virtual-list/VirtualGridListBody';
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
  scrollFooter?: JSX.Element;
  /**
   * 固定列轨宽度（px）。提供时网格列不随容器 1fr 挤压（影视等固定卡宽场景）。
   */
  columnTrackPx?: Accessor<number> | number;
  /** 传给内层 VirtualList */
  scrollGutter?: import('@/lib/ui/viewport-classes').ScrollGutterMode;
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
  /**
   * 与 VirtualList.renderByKey 一致：按实体 key 渲染单元格，避免 item 引用变化导致 remount。
   * 须同时提供 getItemKey。
   */
  renderByKey?: (itemKey: string, flatIndex: Accessor<number>) => JSX.Element;
  renderEntityByKey?: (entityKey: string) => JSX.Element;
  sortable?: VirtualListSortableConfig<T>;
  renderDragOverlay?: (activeId: Id | null) => JSX.Element;
  children?: (item: T, index: number) => JSX.Element;
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

  let rowIndicesCache: readonly number[] = [];
  const rowIndices = createMemo(() => {
    const cols = Math.max(1, props.colCount());
    const len = resolveItems(props.items).length;
    const count = Math.max(0, Math.ceil(len / cols));
    const next = Array.from({ length: count }, (_, i) => i);
    const stabilized = stabilizePrimitiveList(rowIndicesCache, next);
    rowIndicesCache = stabilized;
    return stabilized;
  });

  const interRowGapPx = () => {
    const fromProp = props.getInterRowGapPx?.();
    if (fromProp != null) return roundVirtualGridPx(fromProp);
    return roundVirtualGridPx(layoutMetrics()?.gapPx ?? 8);
  };

  const usesRowGapPadding = () => !!props.rowGapCssVar;

  const rowContentHeightPx = () => {
    if (rowHeightMode() === 'fixed') {
      return roundVirtualGridPx(fixedRowHeight());
    }
    const measured = measuredRowHeightPx();
    if (measured != null) return measured;
    return roundVirtualGridPx(responsiveCardHeightPx());
  };

  const estimatedRowSlotPx = (rowIndex: number) => {
    const base = rowContentHeightPx();
    if (!usesRowGapPadding()) return base;
    const last = rowIndex >= rowIndices().length - 1;
    return last ? base : base + interRowGapPx();
  };

  const rowSlotHeightPx = (rowIndex: number) => estimatedRowSlotPx(rowIndex);

  const layoutRevision = createMemo(() => {
    const mode = rowHeightMode();
    const w = containerWidth();
    const cols = props.colCount();
    const measured = measuredRowHeightPx();
    const deps = props.remeasureDeps?.();
    return `${mode}|${w}|${cols}|${rowContentHeightPx()}|${interRowGapPx()}|${measured ?? ''}|${deps ?? ''}`;
  });

  const syncSampleRowHeight = () => {
    const el = sampleRowEl;
    if (!el || rowHeightMode() !== 'responsive') return;
    let h = roundVirtualGridPx(el.offsetHeight);
    if (h > 0 && usesRowGapPadding() && rowIndices().length > 1) {
      // 样本行（index 0）非末行时 ul 含 padding-bottom，需剥离后作为统一内容高度
      h = Math.max(0, h - interRowGapPx());
    }
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

  const sortableEnabled = () => props.sortable?.enabled() ?? false;

  const itemSortableId = (item: T, index: number): Id => {
    if (props.getItemKey) return props.getItemKey(item, index);
    return index;
  };

  const useEntityCellKeys = () => !!props.getItemKey;

  let stabilizedItemsCache: readonly T[] = [];
  const stabilizeItems = (raw: readonly T[]): readonly T[] => {
    if (!props.getItemKey) return raw;
    const next = stabilizeReorderedListById(stabilizedItemsCache, raw, (item) =>
      String(props.getItemKey!(item, 0)),
    );
    stabilizedItemsCache = next;
    return next;
  };

  const rowEntityKeysCache = new Map<number, readonly string[]>();
  const rowEntityKeys = (rowIndex: number, items: readonly T[]): readonly string[] => {
    const cols = Math.max(1, props.colCount());
    const start = rowIndex * cols;
    const next = items.slice(start, start + cols).map((item, i) =>
      String(itemSortableId(item, start + i)),
    );
    const prev = rowEntityKeysCache.get(rowIndex);
    const stabilized = prev ? stabilizePrimitiveList(prev, next) : next;
    rowEntityKeysCache.set(rowIndex, stabilized);
    return stabilized;
  };

  let lastRowEntityListLen = -1;
  let lastRowEntityColCount = -1;
  createEffect(() => {
    const len = resolveItems(props.items).length;
    const cols = props.colCount();
    if (len !== lastRowEntityListLen) {
      lastRowEntityListLen = len;
      rowEntityKeysCache.clear();
      stabilizedItemsCache = [];
    }
    if (cols !== lastRowEntityColCount) {
      lastRowEntityColCount = cols;
      rowEntityKeysCache.clear();
    }
  });

  const sortableShell = createMemo(() => {
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

  const buildGridListBodyProps = (
    orderedItems: Accessor<readonly T[]>,
  ): VirtualGridListBodyProps<T> => ({
    orderedItems,
    rowIndices,
    colCount: props.colCount,
    rowSlotHeightPx,
    layoutRevision,
    overscan: props.overscan,
    class: props.class,
    listInnerClass: props.listInnerClass,
    scrollFooter: props.scrollFooter,
    gridClass: props.gridClass,
    rowUlClass: props.rowUlClass,
    rowGapCssVar: props.rowGapCssVar,
    columnTrackPx: props.columnTrackPx,
    scrollGutter: props.scrollGutter,
    usesRowGapPadding,
    externalScrollElement: props.externalScrollElement,
    onScrollContainer: handleScrollContainer,
    onScroll: props.onScroll,
    onVirtualizerReady: (api: { measure: () => void }) => {
      remeasureVirtualList = () => api.measure();
    },
    onSampleRowRef: (rowIndex: number, el: HTMLUListElement) => {
      if (rowIndex === 0) sampleRowEl = el;
    },
    useEntityCellKeys,
    rowEntityKeys,
    itemSortableId,
    sortableShell,
    sortableEnabled,
    getItemKey: props.getItemKey,
    renderByKey: props.renderByKey,
    renderEntityByKey: props.renderEntityByKey,
    children: props.children,
  });

  const GridListContent = () => {
    const displayIds = useVirtualListSortableDisplayIds();
    const orderedItems = createMemo(() => {
      const raw = resolveItems(props.items);
      const ids = displayIds();
      const useDisplayOrder =
        sortableEnabled() && ids.length > 0 && ids.length === raw.length;
      const next = !useDisplayOrder
        ? raw
        : reorderItemsByIds(raw, ids, (item, index) => itemSortableId(item, index));
      return stabilizeItems(next);
    });
    return <VirtualGridListBody {...buildGridListBodyProps(orderedItems)} />;
  };

  const staticItems = createMemo(() => stabilizeItems(resolveItems(props.items)));

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
    <Show when={sortableShell()} fallback={<VirtualGridListBody {...buildGridListBodyProps(staticItems)} />}>
      {(shell) => {
        const cfg = shell();
        return (
        <VirtualListSortableShell
          enabled={sortableEnabled}
          ids={cfg.ids}
          onReorder={cfg.onReorder}
          persistOnly={() => cfg.persistOnly ?? false}
          dragStyle={{
            ...cfg.dragStyle,
            overlayStyle: {
              ...VIRTUAL_LIST_DRAG_OVERLAY_FIT_STYLE,
              ...cfg.dragStyle?.overlayStyle,
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
      }}
    </Show>
  );
}
