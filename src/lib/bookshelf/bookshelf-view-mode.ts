import type { ViewMode } from '@/stores/bookshelf-layout';

export const listViewModeOptions: { value: ViewMode; label: string }[] = [
  { value: 'list', label: '列表' },
  { value: 'list-2', label: '列表二列' },
  { value: 'list-3', label: '列表三列' },
  { value: 'compact', label: '紧凑列表' },
  { value: 'compact-2', label: '紧凑列表二列' },
  { value: 'compact-3', label: '紧凑列表三列' },
];

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
