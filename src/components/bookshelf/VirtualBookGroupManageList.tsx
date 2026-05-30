/**
 * 分组管理页虚拟列表 + 可选拖拽排序
 */

import type { Accessor, JSX } from 'solid-js';
import {
  VirtualList,
  DEFAULT_VIRTUAL_LIST_DRAG_STYLE,
  type VirtualListSortableConfig,
} from '@/components/shared/virtual-list';
import { BOOKSHELF_MANAGE_LIST_ROW_HEIGHT_PX } from '@/components/bookshelf/bookshelf-manage-list-layout';
import { BookGroupCoverFace } from '@/components/bookshelf/BookGroupCoverFace';
import { bookshelfCompactCoverClass } from '@/lib/bookshelf/book-group-card-styles';
import type { Id } from '@thisbeyond/solid-dnd';
import type { BookGroup } from '@/types';
import { cn } from '@/lib/utils';

export const BOOK_GROUP_MANAGE_DRAG_OVERLAY_SCALE = 2 / 3;

export function BookGroupManageListDragOverlay(props: { group: BookGroup }) {
  return (
    <div
      class="origin-center"
      style={{ transform: `scale(${BOOK_GROUP_MANAGE_DRAG_OVERLAY_SCALE})` }}
    >
      <div class="flex h-16 w-max max-w-[min(85vw,24rem)] items-center gap-3 rounded-lg border border-border/50 bg-card px-2 text-sm shadow-lg">
        <div class={bookshelfCompactCoverClass('shrink-0 overflow-hidden')}>
          <BookGroupCoverFace group={props.group} compact />
        </div>
        <span class="min-w-0 truncate font-medium text-foreground">{props.group.groupName}</span>
      </div>
    </div>
  );
}

export interface VirtualBookGroupManageListProps {
  groups: readonly BookGroup[];
  class?: string;
  sortable?: VirtualListSortableConfig<BookGroup>;
  renderDragOverlay?: (activeId: Id | null) => JSX.Element;
  children: (group: BookGroup, index: number) => JSX.Element;
}

export function VirtualBookGroupManageList(props: VirtualBookGroupManageListProps) {
  const items: Accessor<readonly BookGroup[]> = () => props.groups;

  const sortable = () => {
    const cfg = props.sortable;
    if (!cfg) return undefined;
    return {
      ...cfg,
      dragStyle: cfg.dragStyle ?? DEFAULT_VIRTUAL_LIST_DRAG_STYLE,
    };
  };

  return (
    <VirtualList
      class={cn('min-h-0 flex-1 px-1', props.class)}
      items={items}
      estimateSize={() => BOOKSHELF_MANAGE_LIST_ROW_HEIGHT_PX}
      overscan={6}
      getItemKey={(group) => group.groupId}
      sortable={sortable()}
      renderDragOverlay={props.renderDragOverlay}
    >
      {(group, index) => props.children(group, index)}
    </VirtualList>
  );
}
