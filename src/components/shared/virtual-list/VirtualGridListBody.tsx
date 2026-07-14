/**
 * 网格虚拟列表主体：独立组件，避免在父级 render 中调用工厂函数导致 VirtualList 整树 remount。
 */

import { For, type Accessor, type JSX } from 'solid-js';
import { VirtualGridEntityCell } from '@/components/shared/virtual-list/VirtualGridEntityCell';
import { VirtualList } from '@/components/shared/virtual-list/VirtualList';
import { VirtualListSortableRow } from '@/components/shared/virtual-list/VirtualListSortableRow';
import type { VirtualListSortableConfig } from '@/components/shared/virtual-list/types';
import type { Id } from '@thisbeyond/solid-dnd';
import { cn } from '@/lib/utils';

export type VirtualGridListBodyProps<T> = {
  orderedItems: Accessor<readonly T[]>;
  rowIndices: Accessor<readonly number[]>;
  colCount: Accessor<number>;
  rowSlotHeightPx: (rowIndex: number) => number;
  layoutRevision: Accessor<unknown>;
  overscan?: number;
  class?: string;
  listInnerClass?: string;
  scrollFooter?: JSX.Element;
  gridClass: string;
  rowUlClass?: string;
  rowGapCssVar?: string;
  usesRowGapPadding: () => boolean;
  externalScrollElement?: Accessor<HTMLDivElement | null | undefined>;
  onScrollContainer?: (el: HTMLDivElement) => void;
  onScroll?: (el: HTMLDivElement) => void;
  onVirtualizerReady?: (api: { measure: () => void }) => void;
  onSampleRowRef: (rowIndex: number, el: HTMLUListElement) => void;
  useEntityCellKeys: () => boolean;
  rowEntityKeys: (rowIndex: number, items: readonly T[]) => readonly string[];
  itemSortableId: (item: T, index: number) => Id;
  sortableShell: Accessor<VirtualListSortableConfig<T> | undefined>;
  sortableEnabled: () => boolean;
  getItemKey?: (item: T, index: number) => string | number;
  renderByKey?: (itemKey: string, flatIndex: Accessor<number>) => JSX.Element;
  /** 按 entityKey 稳定挂载（如 ExploreBookGridCell），避免 children 闭包 + 全表 Map */
  renderEntityByKey?: (entityKey: string) => JSX.Element;
  children?: (item: T, index: number) => JSX.Element;
};

export function VirtualGridListBody<T>(props: VirtualGridListBodyProps<T>) {

  const rowSlice = (rowIndex: number, items: readonly T[]): readonly T[] => {
    const cols = Math.max(1, props.colCount());
    const start = rowIndex * cols;
    return items.slice(start, start + cols);
  };

  const renderGridCells = (rowIndex: number, items: readonly T[]) => {
    const cols = Math.max(1, props.colCount());
    if (props.useEntityCellKeys()) {
      return (
        <For each={props.rowEntityKeys(rowIndex, items)}>
          {(entityKey) => {
            const flatIndex = () => {
              const list = props.orderedItems();
              for (let i = 0; i < list.length; i++) {
                if (String(props.itemSortableId(list[i]!, i)) === entityKey) return i;
              }
              return rowIndex * cols;
            };
            const cell = (
              <VirtualGridEntityCell
                entityKey={entityKey}
                flatIndex={flatIndex}
                orderedItems={props.orderedItems}
                itemSortableId={props.itemSortableId}
                renderByKey={props.renderByKey}
                renderEntityByKey={props.renderEntityByKey}
              >
                {props.children}
              </VirtualGridEntityCell>
            );
            const item = props.orderedItems().find(
              (it, i) => String(props.itemSortableId(it, i)) === entityKey,
            );
            const cfg = props.sortableShell();
            if (!cfg || !item) return cell;
            const index = flatIndex();
            const rowEnabled =
              props.sortableEnabled() && (cfg.isSortable?.(item, index) ?? true);
            return (
              <VirtualListSortableRow
                id={entityKey}
                enabled={rowEnabled}
                dragStyle={cfg.dragStyle}
                class="min-w-0 w-full touch-none"
              >
                {cell}
              </VirtualListSortableRow>
            );
          }}
        </For>
      );
    }

    return (
      <For each={rowSlice(rowIndex, items)}>
        {(item, i) => {
          const flatIndex = rowIndex * cols + i();
          const id = props.itemSortableId(item, flatIndex);
          const cell = props.children?.(item, flatIndex) ?? null;
          const cfg = props.sortableShell();
          if (!cfg) return cell;
          const rowEnabled =
            props.sortableEnabled() && (cfg.isSortable?.(item, flatIndex) ?? true);
          return (
            <VirtualListSortableRow
              id={id}
              enabled={rowEnabled}
              dragStyle={cfg.dragStyle}
              class="min-w-0 w-full touch-none"
            >
              {cell}
            </VirtualListSortableRow>
          );
        }}
      </For>
    );
  };

  return (
    <VirtualList
      class={cn('h-full min-h-0', props.class)}
      listInnerClass={props.listInnerClass}
      items={props.rowIndices}
      estimateSize={(rowIndex) => props.rowSlotHeightPx(rowIndex)}
      remeasureWhen={props.layoutRevision}
      overscan={props.overscan ?? 2}
      getItemKey={(rowIndex) => rowIndex}
      externalScrollElement={props.externalScrollElement}
      onScrollContainer={props.onScrollContainer}
      onScroll={props.onScroll}
      onVirtualizerReady={props.onVirtualizerReady}
      scrollFooter={props.scrollFooter}
    >
      {(rowIndex) => {
        const lastRow = rowIndex >= props.rowIndices().length - 1;
        const gapVar = props.rowGapCssVar;
        return (
          <ul
            ref={(el) => props.onSampleRowRef(rowIndex, el)}
            class={cn(
              props.gridClass,
              props.rowUlClass,
              props.usesRowGapPadding() && 'box-border items-start',
            )}
            style={{
              // fixed / responsive 都按 colCount 铺列；否则仅 `grid` class 会塌成单列
              'grid-template-columns': `repeat(${Math.max(1, props.colCount())}, minmax(0, 1fr))`,
              ...(gapVar && !lastRow
                ? { 'padding-bottom': `var(--${gapVar})` }
                : undefined),
            }}
          >
            {renderGridCells(rowIndex, props.orderedItems())}
          </ul>
        );
      }}
    </VirtualList>
  );
}
