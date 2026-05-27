import { getStorage } from '@/lib/platform/storage';
import { loadBookshelfPagePrefs, saveBookshelfPagePrefs } from '@/lib/search/search-prefs';

const LEGACY_OPEN_INFO_KEY = 'bookshelf_manage_open_info_by_title';

/** 书架管理页持久化偏好（嵌套在 bookshelf_page_prefs.children.manage） */
export interface BookshelfManagePrefs {
  filterByBookGroup: boolean;
  filterBySource: boolean;
  openBookInfoByClickTitle: boolean;
  coverClickPreview: boolean;
}

export const DEFAULT_BOOKSHELF_MANAGE_PREFS: BookshelfManagePrefs = {
  filterByBookGroup: false,
  filterBySource: false,
  openBookInfoByClickTitle: false,
  coverClickPreview: true,
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
      },
    },
  });
}

export async function loadGroupManageCoverClickPreview(): Promise<boolean> {
  const pagePrefs = await loadBookshelfPagePrefs();
  return pagePrefs.children.groupManage.coverClickPreview !== false;
}

export async function saveGroupManageCoverClickPreview(value: boolean): Promise<void> {
  const pagePrefs = await loadBookshelfPagePrefs();
  await saveBookshelfPagePrefs({
    ...pagePrefs,
    children: {
      ...pagePrefs.children,
      groupManage: { ...pagePrefs.children.groupManage, coverClickPreview: value },
    },
  });
}

/** 生成筛选条件摘要（用于工具栏 Tooltip 与页头描述） */
export function formatBookshelfManageFilterSummary(opts: {
  filterByBookGroup: boolean;
  filterBySource: boolean;
  appliedBookGroupIds: number[];
  appliedSourceNames: string[];
  userGroupNames: Map<number, string>;
}): string {
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
