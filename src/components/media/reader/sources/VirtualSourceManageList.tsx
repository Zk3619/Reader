/**
 * 书源管理页虚拟列表：分组标题 + 书源行（固定行高）
 */

import { Show, createMemo, type Accessor, type JSX } from 'solid-js';
import {
  VirtualList,
  DEFAULT_VIRTUAL_LIST_DRAG_STYLE,
  type VirtualListSortableConfig,
} from '@/components/shared/virtual-list';
import type { Id } from '@thisbeyond/solid-dnd';
import {
  SOURCE_MANAGE_LIST_ROW_HEIGHT_PX,
  estimateSourceManageListRowSize,
} from '@/components/media/reader/sources/source-list-layout';
import type { SourceManageGroupMode } from '@/lib/sources/source-sort';
import { cn } from '@/lib/utils';
import type { BookSource } from '@/types';

export { SOURCE_MANAGE_LIST_ROW_HEIGHT_PX } from '@/components/media/reader/sources/source-list-layout';
export { SOURCE_PAGE_LIST_ROW_HEIGHT_PX } from '@/components/media/reader/sources/source-list-layout';

/** 拖拽浮层相对列表行的缩放（2:3） */
export const SOURCE_MANAGE_DRAG_OVERLAY_SCALE = 2 / 3;

/** 与 SourceManageListItem 内卡片一致的内容区（无复选框/开关） */
export function SourceManageListDragOverlay(props: {
  source: BookSource;
  showGroupBadge: boolean;
}) {
  return (
    <div
      class="origin-center"
      style={{ transform: `scale(${SOURCE_MANAGE_DRAG_OVERLAY_SCALE})` }}
    >
      <div class="flex h-12 w-max max-w-[min(85vw,32rem)] items-center gap-3 rounded-lg border border-border/50 bg-card px-3 text-sm shadow-lg">
        <div class="flex min-w-0 items-center gap-2 overflow-hidden">
          <span class="min-w-0 shrink truncate font-medium text-foreground">
            {props.source.sourceName}
          </span>
          <Show when={props.showGroupBadge && props.source.sourceGroup?.trim()}>
            <span class="min-w-0 shrink truncate rounded bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
              {props.source.sourceGroup}
            </span>
          </Show>
        </div>
      </div>
    </div>
  );
}

export type SourceManageListRow =
  | { type: 'header'; key: string; title: string }
  | { type: 'source'; key: string; source: BookSource; showGroupBadge: boolean };

export function buildSourceManageListRows(
  groups: { name: string; sources: BookSource[] }[],
  groupMode: SourceManageGroupMode,
): SourceManageListRow[] {
  const rows: SourceManageListRow[] = [];
  for (const group of groups) {
    if (group.name) {
      rows.push({ type: 'header', key: `header:${group.name}`, title: group.name });
    }
    for (const source of group.sources) {
      rows.push({
        type: 'source',
        key: source.sourceUrl,
        source,
        showGroupBadge: groupMode === 'flat' && !!source.sourceGroup?.trim(),
      });
    }
  }
  return rows;
}

export interface VirtualSourceManageListProps {
  rows: SourceManageListRow[];
  class?: string;
  /** 书源行虚拟槽高（默认书源管理 h-12 + 间距） */
  sourceRowHeightPx?: number;
  sortable?: VirtualListSortableConfig<SourceManageListRow>;
  renderDragOverlay?: (activeId: Id | null) => JSX.Element;
  children: (row: SourceManageListRow, index: number) => JSX.Element;
}

export function VirtualSourceManageList(props: VirtualSourceManageListProps) {
  const items: Accessor<readonly SourceManageListRow[]> = () => props.rows;
  const sourceRowHeightPx = () =>
    props.sourceRowHeightPx ?? SOURCE_MANAGE_LIST_ROW_HEIGHT_PX;

  const sortable = createMemo(() => {
    const cfg = props.sortable;
    if (!cfg) return undefined;
    return {
      ...cfg,
      dragStyle: cfg.dragStyle ?? DEFAULT_VIRTUAL_LIST_DRAG_STYLE,
      isSortable: (row: SourceManageListRow, index: number) =>
        row.type === 'source' && (cfg.isSortable ? cfg.isSortable(row, index) : true),
    };
  });

  return (
    <VirtualList
      class={cn('min-h-0 flex-1', props.class)}
      items={items}
      estimateSize={(index) =>
        estimateSourceManageListRowSize(items(), index, sourceRowHeightPx())
      }
      overscan={6}
      getItemKey={(row) => row.key}
      sortable={sortable()}
      renderDragOverlay={props.renderDragOverlay}
    >
      {(row, index) => props.children(row, index)}
    </VirtualList>
  );
}
