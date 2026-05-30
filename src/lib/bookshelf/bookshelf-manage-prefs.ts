import { getStorage } from '@/lib/platform/storage';
import { loadBookshelfPagePrefs, saveBookshelfPagePrefs } from '@/lib/search/search-prefs';

const LEGACY_OPEN_INFO_KEY = 'bookshelf_manage_open_info_by_title';

/** 书架管理页持久化偏好（嵌套在 bookshelf_page_prefs.children.manage） */
export interface BookshelfManagePrefs {
  filterByBookGroup: boolean;
  filterBySource: boolean;
  openBookInfoByClickTitle: boolean;
  coverClickPreview: boolean;
  enableDragSort: boolean;
}

export const DEFAULT_BOOKSHELF_MANAGE_PREFS: BookshelfManagePrefs = {
  filterByBookGroup: false,
  filterBySource: false,
  openBookInfoByClickTitle: false,
  coverClickPreview: true,
  enableDragSort: true,
};

import type { SearchMode } from '@/lib/search/search-prefs';

export interface GroupManagePrefs {
  searchMode: SearchMode;
  coverClickPreview: boolean;
  enableDragSort: boolean;
}

export const DEFAULT_GROUP_MANAGE_PREFS: GroupManagePrefs = {
  searchMode: 'name',
  coverClickPreview: true,
  enableDragSort: true,
};

export async function loadBookshelfManagePrefs(): Promise<BookshelfManagePrefs> {
  const pagePrefs = await loadBookshelfPagePrefs();
  const child = pagePrefs.children.manage;
  const legacy = await getStorage<Record<string, unknown>>('bookshelf_manage_prefs');
  const legacyOpenInfo = await getStorage<boolean>(LEGACY_OPEN_INFO_KEY);
  return {
    filterByBookGroup: child.filterByBookGroup || legacy?.filterByBookGroup === true,
    filterBySource: child.filterBySource || legacy?.filterBySource === true,
    openBookInfoByClickTitle:
      child.openBookInfoByClickTitle ||
      legacy?.openBookInfoByClickTitle === true ||
      legacyOpenInfo === true,
    coverClickPreview:
      legacy?.coverClickPreview === undefined
        ? child.coverClickPreview
        : child.coverClickPreview && legacy.coverClickPreview !== false,
    enableDragSort: child.enableDragSort !== false,
  };
}

export async function saveBookshelfManagePrefs(prefs: BookshelfManagePrefs): Promise<void> {
  const pagePrefs = await loadBookshelfPagePrefs();
  await saveBookshelfPagePrefs({
    ...pagePrefs,
    children: {
      ...pagePrefs.children,
      manage: {
        ...pagePrefs.children.manage,
        filterByBookGroup: prefs.filterByBookGroup,
        filterBySource: prefs.filterBySource,
        openBookInfoByClickTitle: prefs.openBookInfoByClickTitle,
        coverClickPreview: prefs.coverClickPreview,
        enableDragSort: prefs.enableDragSort,
      },
    },
  });
}

export async function loadGroupManagePrefs(): Promise<GroupManagePrefs> {
  const pagePrefs = await loadBookshelfPagePrefs();
  const child = pagePrefs.children.groupManage;
  return {
    searchMode: child.searchMode,
    coverClickPreview: child.coverClickPreview !== false,
    enableDragSort: child.enableDragSort !== false,
  };
}

export async function saveGroupManagePrefs(prefs: GroupManagePrefs): Promise<void> {
  const pagePrefs = await loadBookshelfPagePrefs();
  await saveBookshelfPagePrefs({
    ...pagePrefs,
    children: {
      ...pagePrefs.children,
      groupManage: { ...pagePrefs.children.groupManage, ...prefs },
    },
  });
}

export async function loadGroupManageCoverClickPreview(): Promise<boolean> {
  return (await loadGroupManagePrefs()).coverClickPreview;
}

export async function saveGroupManageCoverClickPreview(value: boolean): Promise<void> {
  const prefs = await loadGroupManagePrefs();
  await saveGroupManagePrefs({ ...prefs, coverClickPreview: value });
}

/** 全不选与全选均视为该维度不限制 */
export function effectiveBookshelfManageGroupIds(
  appliedIds: number[],
  allGroupIds: number[],
): number[] {
  if (
    appliedIds.length === 0 ||
    (allGroupIds.length > 0 && appliedIds.length >= allGroupIds.length)
  ) {
    return [];
  }
  return appliedIds;
}

export function effectiveBookshelfManageSourceNames(
  appliedNames: string[],
  allSourceNames: string[],
): string[] {
  if (
    appliedNames.length === 0 ||
    (allSourceNames.length > 0 && appliedNames.length >= allSourceNames.length)
  ) {
    return [];
  }
  return appliedNames;
}

export function hasEffectiveBookshelfManageFilter(opts: {
  filterByBookGroup: boolean;
  filterBySource: boolean;
  appliedBookGroupIds: number[];
  appliedSourceNames: string[];
  allBookGroupIds: number[];
  allSourceNames: string[];
}): boolean {
  if (
    opts.filterByBookGroup &&
    effectiveBookshelfManageGroupIds(opts.appliedBookGroupIds, opts.allBookGroupIds).length > 0
  ) {
    return true;
  }
  if (
    opts.filterBySource &&
    effectiveBookshelfManageSourceNames(opts.appliedSourceNames, opts.allSourceNames).length > 0
  ) {
    return true;
  }
  return false;
}

/** 页头描述：分组 · 来源 · 共 y 本书 */
export function formatBookshelfManageToolbarDescription(opts: {
  filterByBookGroup: boolean;
  filterBySource: boolean;
  appliedBookGroupIds: number[];
  appliedSourceNames: string[];
  userGroupNames: Map<number, string>;
  allBookGroupIds: number[];
  allSourceNames: string[];
  bookCount: number;
}): string | undefined {
  const parts: string[] = [];
  const effGroupIds = opts.filterByBookGroup
    ? effectiveBookshelfManageGroupIds(opts.appliedBookGroupIds, opts.allBookGroupIds)
    : [];
  if (effGroupIds.length > 0) {
    if (effGroupIds.length > 1) {
      parts.push('多个分组');
    } else {
      const name = opts.userGroupNames.get(effGroupIds[0]!);
      parts.push(name ?? '—');
    }
  }
  const effSourceNames = opts.filterBySource
    ? effectiveBookshelfManageSourceNames(opts.appliedSourceNames, opts.allSourceNames)
    : [];
  if (effSourceNames.length > 0) {
    parts.push(effSourceNames.length > 1 ? '多个来源' : effSourceNames[0]!);
  }
  if (parts.length === 0) {
    return opts.bookCount > 0 ? `共 ${opts.bookCount} 本书` : undefined;
  }
  parts.push(`共 ${opts.bookCount} 本书`);
  return parts.join(' · ');
}

/** 生成筛选条件摘要（用于工具栏 Tooltip 等） */
export function formatBookshelfManageFilterSummary(opts: {
  filterByBookGroup: boolean;
  filterBySource: boolean;
  appliedBookGroupIds: number[];
  appliedSourceNames: string[];
  userGroupNames: Map<number, string>;
  allBookGroupIds?: number[];
  allSourceNames?: string[];
  bookCount?: number;
}): string {
  if (
    opts.allBookGroupIds !== undefined &&
    opts.allSourceNames !== undefined &&
    hasEffectiveBookshelfManageFilter({
      filterByBookGroup: opts.filterByBookGroup,
      filterBySource: opts.filterBySource,
      appliedBookGroupIds: opts.appliedBookGroupIds,
      appliedSourceNames: opts.appliedSourceNames,
      allBookGroupIds: opts.allBookGroupIds,
      allSourceNames: opts.allSourceNames,
    })
  ) {
    return (
      formatBookshelfManageToolbarDescription({
        ...opts,
        allBookGroupIds: opts.allBookGroupIds,
        allSourceNames: opts.allSourceNames,
        bookCount: opts.bookCount ?? 0,
      })?.replace(/ · 共 \d+ 本书$/, '') ?? ''
    );
  }
  const parts: string[] = [];
  if (opts.filterByBookGroup) {
    if (opts.appliedBookGroupIds.length === 0) {
      parts.push('分组：全部');
    } else {
      const names = opts.appliedBookGroupIds
        .map((id) => opts.userGroupNames.get(id))
        .filter((n): n is string => !!n);
      parts.push(`分组：${names.length > 0 ? names.join('、') : '—'}`);
    }
  }
  if (opts.filterBySource) {
    if (opts.appliedSourceNames.length === 0) {
      parts.push('来源：全部');
    } else {
      parts.push(`来源：${opts.appliedSourceNames.join('、')}`);
    }
  }
  return parts.join('；');
}
