/**
 * 书架分组页网格：行级虚拟 + 响应式行高 + 手动排序（solid-dnd）
 */

import { createMemo, createSignal, type Accessor, type JSX } from 'solid-js';
import type { Id } from '@thisbeyond/solid-dnd';
import { VirtualGridRowsList, type VirtualListSortableConfig } from '@/components/shared/virtual-list';
import {
  BOOKSHELF_LAYOUT_GAP_CLASS,
  bindBookshelfLayoutGap,
  bookshelfLayoutSpacingToPx,
} from '@/lib/bookshelf/bookshelf-layout-gap';
import { estimateBookshelfGridCardHeight } from '@/lib/bookshelf/bookshelf-grid-row-height';
import {
  getViewModeContainerGridClass,
  getViewModeGridColumnCount,
  type ViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import {
  bookshelfLayoutStore,
  type BookTitleDisplay,
} from '@/stores/bookshelf-layout';
import type { BookGroup } from '@/types';
import { cn } from '@/lib/utils';
import { BookshelfGroupGridDragOverlay } from '@/components/bookshelf/BookshelfGridDragOverlay';

export interface VirtualBookshelfGroupGridProps {
  groups: readonly BookGroup[];
  viewMode: ViewMode;
  titleDisplay: BookTitleDisplay;
  getGroupBookCount: (group: BookGroup) => number;
  getGroupDisplayName: (group: BookGroup) => string;
  sortable?: VirtualListSortableConfig<BookGroup>;
  class?: string;
  externalScrollElement?: Accessor<HTMLDivElement | null | undefined>;
  children: (group: BookGroup, index: number) => JSX.Element;
}

export function VirtualBookshelfGroupGrid(props: VirtualBookshelfGroupGridProps) {
  const items = () => props.groups;
  const colCount = () => getViewModeGridColumnCount(props.viewMode);
  const titleOverlay = () => props.titleDisplay === 'overlay';

  const [scrollRoot, setScrollRoot] = createSignal<HTMLDivElement | undefined>();
  const gapContainer = () => props.externalScrollElement?.() ?? scrollRoot();
  bindBookshelfLayoutGap(gapContainer);

  const gridClass = () =>
    cn('grid', BOOKSHELF_LAYOUT_GAP_CLASS, getViewModeContainerGridClass(props.viewMode));

  const groupById = createMemo(() => new Map(items().map((g) => [g.groupId, g])));
  const sortableDragActive = () => props.sortable?.enabled() ?? false;

  const renderDragOverlay = (activeId: Id | null) => {
    if (activeId == null) return null;
    const group = groupById().get(Number(activeId));
    if (!group) return null;
    return (
      <BookshelfGroupGridDragOverlay
        group={group}
        title={props.getGroupDisplayName(group)}
        subtitle={`${props.getGroupBookCount(group)} 本书`}
      />
    );
  };

  return (
    <VirtualGridRowsList<BookGroup>
      items={items}
      colCount={colCount}
      rowHeightMode="responsive"
      estimateRowSize={280}
      responsiveRowHeight={{
        getGapPx: () => bookshelfLayoutSpacingToPx(bookshelfLayoutStore.settings.spacing),
        estimateRowHeight: (metrics) =>
          estimateBookshelfGridCardHeight(metrics, {
            titleOverlay: titleOverlay(),
            showSubtitle: !titleOverlay(),
          }),
      }}
      class={cn('min-h-0 w-full p-1', props.class)}
      listInnerClass="p-1"
      rowGapCssVar="bookshelf-layout-gap"
      remeasureDeps={() => bookshelfLayoutStore.settings.spacing}
      gridClass={gridClass()}
      overscan={2}
      externalScrollElement={props.externalScrollElement}
      getItemKey={(group) => group.groupId}
      sortable={props.sortable}
      renderDragOverlay={sortableDragActive() ? renderDragOverlay : undefined}
      onScrollContainer={setScrollRoot}
    >
      {props.children}
    </VirtualGridRowsList>
  );
}
