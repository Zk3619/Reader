/**
 * 书架布局设置类型、默认值与视图模式工具
 */

export type GroupStyle = 'dropdown' | 'tabs' | 'normal';

export type ViewMode =
  | 'list'
  | 'list-2'
  | 'list-3'
  | 'compact'
  | 'compact-2'
  | 'compact-3'
  | 'grid-2'
  | 'grid-3'
  | 'grid-4'
  | 'grid-5'
  | 'grid-6'
  | 'grid-7'
  | 'grid-8';

export type SortMode =
  | 'read-time'
  | 'update-time'
  | 'book-name'
  | 'manual'
  | 'comprehensive'
  | 'author';

export type BookTitleDisplay = 'show' | 'hide' | 'overlay';

export interface BookshelfLayoutSettings {
  groupStyle: GroupStyle;
  viewMode: ViewMode;
  sortMode: SortMode;
  bookTitleDisplay: BookTitleDisplay;
  spacing: number;
  showUnreadFlag: boolean;
  showLastUpdateTime: boolean;
  showPendingUpdateCount: boolean;
  showQuickScrollbar: boolean;
  coverClickPreview: boolean;
  /** 是否允许书架/分组页拖拽排序（仍需 sortMode=manual） */
  enableDragSort: boolean;
}

export const defaultBookshelfLayoutSettings: BookshelfLayoutSettings = {
  groupStyle: 'normal',
  viewMode: 'grid-4',
  sortMode: 'read-time',
  bookTitleDisplay: 'show',
  spacing: 12,
  showUnreadFlag: true,
  showLastUpdateTime: true,
  showPendingUpdateCount: false,
  showQuickScrollbar: false,
  coverClickPreview: true,
  enableDragSort: true,
};

export const listViewModeOptions: { value: ViewMode; label: string }[] = [
  { value: 'list', label: '标准列表一列' },
  { value: 'list-2', label: '标准列表二列' },
  { value: 'list-3', label: '标准列表三列' },
  { value: 'compact', label: '紧凑列表一列' },
  { value: 'compact-2', label: '紧凑列表二列' },
  { value: 'compact-3', label: '紧凑列表三列' },
];

export const bookshelfStandardListViewModeOptions = listViewModeOptions.filter((o) =>
  o.value.startsWith('list'),
);

export const bookshelfCompactListViewModeOptions = listViewModeOptions.filter((o) =>
  o.value.startsWith('compact'),
);

export const gridViewModeOptions: { value: ViewMode; label: string }[] = [
  { value: 'grid-2', label: '网格二列' },
  { value: 'grid-3', label: '网格三列' },
  { value: 'grid-4', label: '网格四列' },
  { value: 'grid-5', label: '网格五列' },
  { value: 'grid-6', label: '网格六列' },
  { value: 'grid-7', label: '网格七列' },
  { value: 'grid-8', label: '网格八列' },
];

const LIST_MODES = new Set<ViewMode>([
  'list',
  'list-2',
  'list-3',
  'compact',
  'compact-2',
  'compact-3',
]);

export function isListViewMode(mode: string): boolean {
  return LIST_MODES.has(mode as ViewMode);
}

export function isGridViewMode(mode: string): boolean {
  return mode.startsWith('grid-');
}

export function getViewModeCardLayout(mode: string): 'list' | 'compact' | 'grid' {
  if (mode === 'list' || mode === 'list-2' || mode === 'list-3') return 'list';
  if (mode === 'compact' || mode === 'compact-2' || mode === 'compact-3') return 'compact';
  return 'grid';
}

/** 列表/紧凑列表的列数（用于简介显示断点） */
export function getBookshelfListColumnLayout(mode: string): 1 | 2 | 3 {
  if (mode === 'list-3' || mode === 'compact-3') return 3;
  if (mode === 'list-2' || mode === 'compact-2') return 2;
  return 1;
}

/** 简介可见的最小视口断点：单列 sm、二列 lg、三列 2xl */
export function getBookshelfListIntroMinBreakpoint(mode: string): 'sm' | 'lg' | '2xl' {
  const cols = getBookshelfListColumnLayout(mode);
  if (cols === 3) return '2xl';
  if (cols === 2) return 'lg';
  return 'sm';
}

/** 列表/紧凑列表/网格容器的 grid-cols 类名 */
export function getViewModeContainerGridClass(mode: string): string {
  switch (mode) {
    case 'list':
    case 'compact':
      return 'grid-cols-1';
    case 'list-2':
    case 'compact-2':
      return 'grid-cols-2';
    case 'list-3':
    case 'compact-3':
      return 'grid-cols-3';
    case 'grid-2':
      return 'grid-cols-2';
    case 'grid-3':
      return 'grid-cols-3';
    case 'grid-4':
      return 'grid-cols-4';
    case 'grid-5':
      return 'grid-cols-5';
    case 'grid-6':
      return 'grid-cols-6';
    case 'grid-7':
      return 'grid-cols-7';
    case 'grid-8':
      return 'grid-cols-8';
    default:
      return isGridViewMode(mode) ? 'grid-cols-4' : 'grid-cols-1';
  }
}

/** 仅网格模式的 grid-cols 类名（用于 cn 条件拼接的替代） */
export function getViewModeGridColsClass(mode: string): string | false {
  if (!isGridViewMode(mode)) return false;
  return getViewModeContainerGridClass(mode);
}

export function getViewModeGridColumnCount(mode: string): number {
  switch (mode) {
    case 'grid-2':
      return 2;
    case 'grid-3':
      return 3;
    case 'grid-4':
      return 4;
    case 'grid-5':
      return 5;
    case 'grid-6':
      return 6;
    case 'grid-7':
      return 7;
    case 'grid-8':
      return 8;
    default:
      return 4;
  }
}

export type GroupListSortRefs = {
  list: HTMLDivElement | null;
  list2: HTMLDivElement | null;
  list3: HTMLDivElement | null;
  compact: HTMLDivElement | null;
  compact2: HTMLDivElement | null;
  compact3: HTMLDivElement | null;
  grid: HTMLDivElement | null;
};

export function getGroupListSortableContainer(
  view: ViewMode,
  refs: GroupListSortRefs,
): HTMLDivElement | null {
  switch (view) {
    case 'list':
      return refs.list;
    case 'list-2':
      return refs.list2;
    case 'list-3':
      return refs.list3;
    case 'compact':
      return refs.compact;
    case 'compact-2':
      return refs.compact2;
    case 'compact-3':
      return refs.compact3;
    default:
      return refs.grid;
  }
}
