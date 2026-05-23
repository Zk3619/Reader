import { getStorage, setStorage } from '@/lib/platform/storage';

const PREFS_KEY = 'bookshelf_manage_prefs';
const LEGACY_OPEN_INFO_KEY = 'bookshelf_manage_open_info_by_title';

/** 书架管理搜索模式：常规 / 模糊 / 扩展（至少保留一项，默认常规） */
export type BookshelfManageSearchMode = 'name' | 'fuzzy' | 'extended';

export function normalizeBookshelfManageSearchMode(
  mode: unknown,
): BookshelfManageSearchMode {
  if (mode === 'fuzzy' || mode === 'extended' || mode === 'name') return mode;
  return 'name';
}

/** 书架管理页持久化偏好（不含具体筛选条件） */
export interface BookshelfManagePrefs {
  filterByBookGroup: boolean;
  filterBySource: boolean;
  openBookInfoByClickTitle: boolean;
  coverClickPreview: boolean;
  searchMode: BookshelfManageSearchMode;
}

export const DEFAULT_BOOKSHELF_MANAGE_PREFS: BookshelfManagePrefs = {
  filterByBookGroup: false,
  filterBySource: false,
  openBookInfoByClickTitle: false,
  coverClickPreview: true,
  searchMode: 'name',
};

export async function loadBookshelfManagePrefs(): Promise<BookshelfManagePrefs> {
  const stored = await getStorage<Record<string, unknown>>(PREFS_KEY);
  if (stored && typeof stored === 'object') {
    return {
      filterByBookGroup: stored.filterByBookGroup === true,
      filterBySource: stored.filterBySource === true,
      openBookInfoByClickTitle: stored.openBookInfoByClickTitle === true,
      coverClickPreview: stored.coverClickPreview !== false,
      searchMode: normalizeBookshelfManageSearchMode(stored.searchMode),
    };
  }
  const legacyOpenInfo = await getStorage<boolean>(LEGACY_OPEN_INFO_KEY);
  if (legacyOpenInfo === true) {
    return { ...DEFAULT_BOOKSHELF_MANAGE_PREFS, openBookInfoByClickTitle: true };
  }
  return { ...DEFAULT_BOOKSHELF_MANAGE_PREFS };
}

export async function saveBookshelfManagePrefs(prefs: BookshelfManagePrefs): Promise<void> {
  await setStorage(PREFS_KEY, prefs);
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
