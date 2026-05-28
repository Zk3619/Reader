import { getStorage, setStorage } from '@/lib/platform/storage';
import type { BookshelfManagePrefs } from '@/lib/bookshelf/bookshelf-manage-prefs';
import {
  defaultBookshelfLayoutSettings,
  type BookTitleDisplay,
  type BookshelfLayoutSettings,
  type GroupStyle,
  type SortMode,
  type ViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';

const DEFAULT_MANAGE_PREFS: BookshelfManagePrefs = {
  filterByBookGroup: false,
  filterBySource: false,
  openBookInfoByClickTitle: false,
  coverClickPreview: true,
};

const BOOKSHELF_PAGE_PREFS_KEY = 'bookshelf_page_prefs';
const LEGACY_LAYOUT_KEY = 'bookshelf-layout-settings';
const LEGACY_SHOW_GROUP_LIST_KEY = 'bookshelf_showGroupList';
const SOURCES_PAGE_PREFS_KEY = 'sources_page_prefs';

/** 搜索模式：常规 / 模糊 / 扩展（各页面对扩展字段定义不同） */
export type SearchMode = 'name' | 'fuzzy' | 'extended';

export function normalizeSearchMode(mode: unknown): SearchMode {
  if (mode === 'fuzzy' || mode === 'extended' || mode === 'name') return mode;
  return 'name';
}

/** 常规模式对应 Legado 精准搜索（在线多源搜索） */
export function isPrecisionSearchMode(mode: SearchMode): boolean {
  return mode === 'name';
}

interface BookshelfManageChildPrefs extends BookshelfManagePrefs {
  searchMode: SearchMode;
}

interface BookshelfChildrenPrefs {
  search: { searchMode: SearchMode };
  manage: BookshelfManageChildPrefs;
  groupManage: { coverClickPreview: boolean };
}

export interface BookshelfPagePrefs {
  searchMode: SearchMode;
  /** 常规分组样式下是否显示分组列表页（见 bookshelf store） */
  showGroupList: boolean;
  /** 书架主列表布局（原 bookshelf-layout-settings） */
  layout: BookshelfLayoutSettings;
  children: BookshelfChildrenPrefs;
}

interface SourcesPagePrefs {
  searchMode: SearchMode;
}

const DEFAULT_BOOKSHELF_PAGE_PREFS: BookshelfPagePrefs = {
  searchMode: 'name',
  showGroupList: true,
  layout: defaultBookshelfLayoutSettings,
  children: {
    search: { searchMode: 'name' },
    manage: { searchMode: 'name', ...DEFAULT_MANAGE_PREFS },
    groupManage: { coverClickPreview: true },
  },
};

const DEFAULT_SOURCES_PAGE_PREFS: SourcesPagePrefs = {
  searchMode: 'name',
};

const GROUP_STYLES: GroupStyle[] = ['dropdown', 'tabs', 'normal'];
const VIEW_MODES: ViewMode[] = [
  'list',
  'list-2',
  'list-3',
  'compact',
  'compact-2',
  'compact-3',
  'grid-2',
  'grid-3',
  'grid-4',
  'grid-5',
  'grid-6',
  'grid-7',
  'grid-8',
];
const SORT_MODES: SortMode[] = [
  'read-time',
  'update-time',
  'book-name',
  'manual',
  'comprehensive',
  'author',
];
const TITLE_DISPLAYS: BookTitleDisplay[] = ['show', 'hide', 'overlay'];

function normalizeLayoutSettings(raw: unknown): BookshelfLayoutSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const spacing =
    typeof obj.spacing === 'number' && Number.isFinite(obj.spacing)
      ? Math.min(24, Math.max(0, obj.spacing))
      : defaultBookshelfLayoutSettings.spacing;
  return {
    groupStyle: GROUP_STYLES.includes(obj.groupStyle as GroupStyle)
      ? (obj.groupStyle as GroupStyle)
      : defaultBookshelfLayoutSettings.groupStyle,
    viewMode: VIEW_MODES.includes(obj.viewMode as ViewMode)
      ? (obj.viewMode as ViewMode)
      : defaultBookshelfLayoutSettings.viewMode,
    sortMode: SORT_MODES.includes(obj.sortMode as SortMode)
      ? (obj.sortMode as SortMode)
      : defaultBookshelfLayoutSettings.sortMode,
    bookTitleDisplay: TITLE_DISPLAYS.includes(obj.bookTitleDisplay as BookTitleDisplay)
      ? (obj.bookTitleDisplay as BookTitleDisplay)
      : defaultBookshelfLayoutSettings.bookTitleDisplay,
    spacing,
    showUnreadFlag: obj.showUnreadFlag !== false,
    showLastUpdateTime: obj.showLastUpdateTime !== false,
    showPendingUpdateCount: obj.showPendingUpdateCount === true,
    showQuickScrollbar: obj.showQuickScrollbar === true,
    coverClickPreview: obj.coverClickPreview !== false,
  };
}

function normalizeManageChild(raw: unknown, searchModeFallback: SearchMode): BookshelfManageChildPrefs {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    searchMode: normalizeSearchMode(obj.searchMode ?? searchModeFallback),
    filterByBookGroup: obj.filterByBookGroup === true,
    filterBySource: obj.filterBySource === true,
    openBookInfoByClickTitle: obj.openBookInfoByClickTitle === true,
    coverClickPreview: obj.coverClickPreview !== false,
  };
}

function normalizeBookshelfPagePrefs(raw: unknown): BookshelfPagePrefs {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const searchMode = normalizeSearchMode(obj.searchMode);
  const children =
    obj.children && typeof obj.children === 'object'
      ? (obj.children as Record<string, unknown>)
      : {};
  const searchChild =
    children.search && typeof children.search === 'object'
      ? (children.search as Record<string, unknown>)
      : {};
  const manageChild = children.manage;
  const groupManageChild =
    children.groupManage && typeof children.groupManage === 'object'
      ? (children.groupManage as Record<string, unknown>)
      : {};
  const layoutRaw =
    obj.layout && typeof obj.layout === 'object' ? obj.layout : undefined;
  return {
    searchMode,
    showGroupList: obj.showGroupList !== false,
    layout: normalizeLayoutSettings(layoutRaw),
    children: {
      search: { searchMode: normalizeSearchMode(searchChild.searchMode ?? searchMode) },
      manage: normalizeManageChild(manageChild, searchMode),
      groupManage: { coverClickPreview: groupManageChild.coverClickPreview !== false },
    },
  };
}

function normalizeSourcesPagePrefs(raw: unknown): SourcesPagePrefs {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { searchMode: normalizeSearchMode(obj.searchMode) };
}

export async function loadBookshelfPagePrefs(): Promise<BookshelfPagePrefs> {
  const stored = await getStorage<Record<string, unknown>>(BOOKSHELF_PAGE_PREFS_KEY);
  let prefs: BookshelfPagePrefs;
  if (stored && typeof stored === 'object') {
    prefs = normalizeBookshelfPagePrefs(stored);
    if (!stored.layout) {
      const legacyLayout = await getStorage<Record<string, unknown>>(LEGACY_LAYOUT_KEY);
      if (legacyLayout) {
        prefs = { ...prefs, layout: normalizeLayoutSettings(legacyLayout) };
      }
    }
    if (stored.showGroupList === undefined) {
      const legacyShow = await getStorage<boolean>(LEGACY_SHOW_GROUP_LIST_KEY);
      if (legacyShow !== undefined && legacyShow !== null) {
        prefs = { ...prefs, showGroupList: legacyShow !== false };
      }
    }
  } else {
    const legacyGlobal = await getStorage<Record<string, unknown>>('search_prefs');
    const legacyShelf = await getStorage<Record<string, unknown>>('bookshelf_search_prefs');
    const legacyManage = await getStorage<Record<string, unknown>>('bookshelf_manage_prefs');
    const seedMode = normalizeSearchMode(
      legacyGlobal?.searchMode ?? legacyShelf?.searchMode ?? legacyManage?.searchMode,
    );
    prefs = {
      ...DEFAULT_BOOKSHELF_PAGE_PREFS,
      searchMode: seedMode,
      children: {
        ...DEFAULT_BOOKSHELF_PAGE_PREFS.children,
        search: { searchMode: seedMode },
        manage: normalizeManageChild(
          { searchMode: seedMode, ...legacyManage },
          seedMode,
        ),
      },
    };
    const [legacyLayout, legacyShowGroupList] = await Promise.all([
      getStorage<Record<string, unknown>>(LEGACY_LAYOUT_KEY),
      getStorage<boolean>(LEGACY_SHOW_GROUP_LIST_KEY),
    ]);
    if (legacyLayout) {
      prefs = { ...prefs, layout: normalizeLayoutSettings(legacyLayout) };
    }
    if (legacyShowGroupList !== undefined && legacyShowGroupList !== null) {
      prefs = { ...prefs, showGroupList: legacyShowGroupList !== false };
    }
  }
  return prefs;
}

export async function saveBookshelfPagePrefs(prefs: BookshelfPagePrefs): Promise<void> {
  await setStorage(BOOKSHELF_PAGE_PREFS_KEY, prefs);
}

export async function loadBookshelfPageLayoutSettings(): Promise<BookshelfLayoutSettings> {
  const prefs = await loadBookshelfPagePrefs();
  return prefs.layout;
}

export async function saveBookshelfPageLayoutSettings(
  layout: BookshelfLayoutSettings,
): Promise<void> {
  const prefs = await loadBookshelfPagePrefs();
  await saveBookshelfPagePrefs({ ...prefs, layout: normalizeLayoutSettings(layout) });
}

export async function loadBookshelfPageShowGroupList(): Promise<boolean> {
  const prefs = await loadBookshelfPagePrefs();
  return prefs.showGroupList;
}

export async function saveBookshelfPageShowGroupList(show: boolean): Promise<void> {
  const prefs = await loadBookshelfPagePrefs();
  await saveBookshelfPagePrefs({ ...prefs, showGroupList: show });
}

export async function loadSourcesPagePrefs(): Promise<SourcesPagePrefs> {
  const stored = await getStorage<Record<string, unknown>>(SOURCES_PAGE_PREFS_KEY);
  if (stored && typeof stored === 'object') {
    return normalizeSourcesPagePrefs(stored);
  }
  const legacyGlobal = await getStorage<Record<string, unknown>>('search_prefs');
  return {
    ...DEFAULT_SOURCES_PAGE_PREFS,
    searchMode: normalizeSearchMode(legacyGlobal?.searchMode),
  };
}

export async function saveSourcesPagePrefs(prefs: SourcesPagePrefs): Promise<void> {
  await setStorage(SOURCES_PAGE_PREFS_KEY, prefs);
}

export async function loadBookshelfMainSearchMode(): Promise<SearchMode> {
  const prefs = await loadBookshelfPagePrefs();
  return prefs.searchMode;
}

export async function saveBookshelfMainSearchMode(mode: SearchMode): Promise<void> {
  const prefs = await loadBookshelfPagePrefs();
  await saveBookshelfPagePrefs({ ...prefs, searchMode: mode });
}

export async function loadBookshelfSearchSubPageMode(): Promise<SearchMode> {
  const prefs = await loadBookshelfPagePrefs();
  return prefs.children.search.searchMode;
}

export async function saveBookshelfSearchSubPageMode(mode: SearchMode): Promise<void> {
  const prefs = await loadBookshelfPagePrefs();
  await saveBookshelfPagePrefs({
    ...prefs,
    children: {
      ...prefs.children,
      search: { ...prefs.children.search, searchMode: mode },
    },
  });
}

export async function loadBookshelfManageSubPageMode(): Promise<SearchMode> {
  const prefs = await loadBookshelfPagePrefs();
  return prefs.children.manage.searchMode;
}

export async function saveBookshelfManageSubPageMode(mode: SearchMode): Promise<void> {
  const prefs = await loadBookshelfPagePrefs();
  await saveBookshelfPagePrefs({
    ...prefs,
    children: {
      ...prefs.children,
      manage: { ...prefs.children.manage, searchMode: mode },
    },
  });
}
