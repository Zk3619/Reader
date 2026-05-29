import type { Accessor } from 'solid-js';

/** 内联 style 对象（避免与 DOM CSSProperties 命名差异） */
type CSSProperties = Record<string, string | number | undefined>;
import type { Id } from '@thisbeyond/solid-dnd';

/** 拖拽排序时的行/浮层样式（Tailwind class） */
export interface VirtualListDragStyle {
  /** 拖拽激活时行样式 */
  activeClass?: string;
  /** 行在列表中的位移过渡（sortable 占位动画） */
  rowClass?: string;
  /** DragOverlay 浮层容器（建议仅定位类，边框放在浮层内容上） */
  overlayClass?: string;
  /** 覆盖库默认的 min-width/min-height（库会按整行尺寸撑开浮层） */
  overlayStyle?: CSSProperties;
}

export const DEFAULT_VIRTUAL_LIST_DRAG_STYLE: VirtualListDragStyle = {
  activeClass: 'opacity-50',
  rowClass: 'touch-none',
  overlayClass: 'z-50',
};

/** 浮层容器随内容收缩，避免边框铺满整行 */
export const VIRTUAL_LIST_DRAG_OVERLAY_FIT_STYLE: CSSProperties = {
  minWidth: 'unset',
  minHeight: 'unset',
  width: 'max-content',
};

export interface VirtualListSortableConfig<T> {
  enabled: Accessor<boolean>;
  /** 可排序项 id（与 SortableProvider 一致） */
  ids: Accessor<Id[]>;
  /** 当前行是否可拖拽（如分组标题行返回 false） */
  isSortable?: (item: T, index: number) => boolean;
  onReorder: (ids: Id[]) => void | Promise<void>;
  dragStyle?: VirtualListDragStyle;
}

export type VirtualListRowMeta = {
  /** 固定行高模式下的行高（px） */
  size: number;
};
