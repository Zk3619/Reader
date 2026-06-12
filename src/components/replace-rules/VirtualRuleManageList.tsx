/**
 * 规则管理页固定行高虚拟列表（TXT 目录 / 替换净化 / 字典）
 */

import type { Accessor, JSX } from 'solid-js';
import { VirtualList, type VirtualListSortableConfig } from '@/components/shared/virtual-list';

export const RULE_MANAGE_ROW_HEIGHT_PX = 56;

const DEFAULT_OVERSCAN = 10;

export interface VirtualRuleManageListProps<T> {
  items: Accessor<readonly T[]>;
  getItemKey: (item: T) => string | number;
  class?: string;
  sortable?: VirtualListSortableConfig<T>;
  children: (item: T, index: number) => JSX.Element;
}

export function VirtualRuleManageList<T>(props: VirtualRuleManageListProps<T>) {
  return (
    <VirtualList
      items={props.items}
      estimateSize={RULE_MANAGE_ROW_HEIGHT_PX}
      getItemKey={(item) => props.getItemKey(item)}
      class={props.class}
      overscan={DEFAULT_OVERSCAN}
      sortable={props.sortable}
    >
      {(item, index) => props.children(item, index)}
    </VirtualList>
  );
}
