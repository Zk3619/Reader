/**
 * 书架通用页面框架
 * 根据分组样式（常规/下拉框/标签）和当前视图（分组页 vs 具体分组书籍）动态加载数据并显示
 * - 常规：启动默认显示分组页，点击分组后显示该分组书籍；可返回分组页
 * - 下拉框/标签：默认显示「全部」书籍，分组名在导航栏以下拉/标签切换，不显示分组页
 */

import {
  type Accessor,
  createSignal,
  For,
  Show,
  onMount,
  onCleanup,
  createEffect,
  untrack,
  createMemo,
} from 'solid-js';
import { readShellPageActive } from '@/lib/ui/shell-page-active';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { bookshelfStore } from '@/stores/bookshelf';
import { sourcesStore } from '@/stores/sources';
import { bookshelfLayoutStore, initBookshelfLayoutSettings } from '@/stores/bookshelf-layout';
import { sortBooks } from '@/lib/bookshelf/book-sort';
import {
  applyShelfBookInPlace,
  mergeShelfBookList,
  shelfListsSameOrderAndRefs,
} from '@/lib/bookshelf/shelf-book-list-merge';
import * as groupsDb from '@/lib/database/book-groups';
import * as booksDb from '@/lib/database/books';
import type { BookGroup } from '@/types';
import type { Book } from '@/types';
import { BookGroupId } from '@/types';
import { exportBookshelfJson } from '@/lib/bookshelf/export-bookshelf';
import { ImportBookshelfDialog } from '@/components/bookshelf/ImportBookshelfDialog';
import { SaveTextFileCancelledError } from '@/lib/export/save-text-file';
import { BookGroup as BookGroupPage } from '@/pages/bookshelf/BookGroupPage';
import { BookCoverFallback } from '@/components/books/BookCoverFallback';
import { BookCoverImg } from '@/components/books/BookCoverImg';
import { BookEditDialog } from '@/components/books/BookEditDialog';
import { BookCoverPreviewDialog } from '@/components/books/BookCoverPreviewDialog';
import { DeleteBookDialog } from '@/components/books/DeleteBookDialog';
import { BookContextMenu, type BookContextMenuActions } from '@/components/bookshelf/BookContextMenu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronLeftIcon, BookshelfIcon } from '@/components/shared/icons';
import {
  dismissAppToast,
  showAppToast,
  UPDATE_TOC_TOAST_ID,
  updateAppToastProgress,
} from '@/components/shared/AppToasts';
import { getManagedBooksRoot } from '@/lib/platform/fs/managed-storage';
import { listDirectory } from '@/lib/platform/fs/read-write';
import {
  displayFileNameFromBookUrl,
  formatStorageRef,
  parseStorageRef,
} from '@/lib/platform/fs/storage-ref';
import { readBytes } from '@/lib/platform/fs/read-write';
import { hasBook } from '@/lib/database/books';
import { scheduleShelfChapterRepairs } from '@/lib/bookshelf/save-book-to-shelf';
import {
  importLocalBookFromContent,
  isLocalBook,
  describeDeleteLocalBookToast,
  removeLocalBookStoredFile,
} from '@/lib/local-book';
import { pinBookToBottom, pinBookToTop } from '@/lib/bookshelf/book-order';
import {
  getViewModeCardLayout,
  isGridViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import { VirtualBookshelfBookGrid } from '@/components/bookshelf/VirtualBookshelfBookGrid';
import { VirtualBookshelfBookList } from '@/components/bookshelf/VirtualBookshelfBookList';
import type { Id } from '@thisbeyond/solid-dnd';
import type { VirtualListSortableConfig } from '@/components/shared/virtual-list';
import { getEffectiveTitleDisplay } from '@/lib/bookshelf/bookshelf-title-display';
import { BookshelfCoverTitleOverlay } from '@/components/bookshelf/BookshelfCoverTitleOverlay';
import { BookshelfGridHideTooltip } from '@/components/bookshelf/BookshelfGridHideTooltip';
import {
  BookShelfGridLastUpdateBadge,
  BookShelfGridUnreadBadge,
} from '@/components/bookshelf/BookShelfReadingMeta';
import { shouldShowBookshelfLastUpdateTime } from '@/lib/bookshelf/book-reading-progress';
import { BookShelfListBookRow } from '@/components/bookshelf/BookShelfListBookRow';
import {
  bookGroupGridCardClass,
  bookGroupGridCoverClass,
  bookGroupGridSubtitleClass,
  bookGroupGridTitleClass,
  bookshelfCompactListCardClass,
  bookshelfListCardClass,
} from '@/lib/bookshelf/book-group-card-styles';
import type { BookTitleDisplay, ViewMode } from '@/stores/bookshelf-layout';
import { isTauri } from '@/lib/platform/detect';
import { cn } from '@/lib/utils';
import { mainShellPageRoot, mainShellPageScroll } from '@/lib/ui/viewport-classes';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { QuickScrollButtons } from '@/components/shell/QuickScrollButtons';
import { BookshelfGroupNav, BookshelfGroupTitleDropdown } from '@/components/bookshelf/BookshelfGroupNav';
import { BookshelfPageToolbar } from '@/components/bookshelf/BookshelfPageToolbar';
import type { PageType } from '@/components/shell/Navigation';
import { enqueueUpdateToc } from '@/lib/book-source/update-toc-queue';
import { textViewerStore } from '@/stores/viewer';
import {
  loadBookshelfMainSearchMode,
  saveBookshelfMainSearchMode,
  type SearchMode,
} from '@/lib/search/search-prefs';

export interface BookShelfProps {
  /** 为 false 时保留 UI 状态但不拉取分组/书籍（侧边栏隐藏态） */
  active?: boolean | Accessor<boolean>;
  /** 分组加载完成后回调，供导航栏下拉/标签使用 */
  onGroupsLoaded?: (groups: BookGroup[]) => void;
  /** 各分组书籍数量加载完成后回调，供导航栏下拉描述使用 */
  onGroupCountsLoaded?: (counts: Record<number, number>) => void;
  /** 点击书籍时打开阅读器 */
  onOpenBook?: (book: Book) => void;
  onPageChange?: (page: PageType) => void;
  onOpenGroupManage?: () => void;
  onOpenBookshelfManage?: () => void;
  onImportLocal?: () => void;
  onAddBookByUrl?: () => void;
  /** 打开章节缓存管理（传入当前分组 id） */
  onOpenBookshelfCache?: (groupId: number) => void;
  /** 进入全网搜索页 */
  onOpenBookSearch?: (query: string) => void;
}

export function BookShelf(props: BookShelfProps) {
  const isActive = createMemo(() => readShellPageActive(props.active));
  const [groups, setGroups] = createSignal<BookGroup[]>([]);
  const [groupBookCounts, setGroupBookCounts] = createSignal<Record<number, number>>({});
  const [books, setBooks] = createSignal<Book[]>([]);
  const [booksLoading, setBooksLoading] = createSignal(false);
  const [booksError, setBooksError] = createSignal<string | null>(null);
  const [bookEditOpen, setBookEditOpen] = createSignal(false);
  const [bookToEdit, setBookToEdit] = createSignal<Book | null>(null);
  const [bookToDelete, setBookToDelete] = createSignal<Book | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = createSignal(false);
  const [isReloadingBooks, setIsReloadingBooks] = createSignal(false);
  const [importBookshelfOpen, setImportBookshelfOpen] = createSignal(false);
  const [shelfSearchMode, setShelfSearchMode] = createSignal<SearchMode>('name');

  const groupStyle = () => bookshelfLayoutStore.settings.groupStyle;
  const showGroupList = () => bookshelfStore.state.showGroupList;
  const showGroupPage = () => groupStyle() === 'normal' && showGroupList();
  const showBooksView = () => groupStyle() !== 'normal' || !showGroupList();
  const isGroupSearchToolbar = () => showGroupPage();
  const currentGroup = () => bookshelfStore.state.currentGroup;
  const currentGroupName = () => bookshelfStore.state.currentGroupName;
  const viewMode = () => bookshelfLayoutStore.settings.viewMode;
  const titleDisplay = () => bookshelfLayoutStore.settings.bookTitleDisplay;
  const showUnreadFlag = () => bookshelfLayoutStore.settings.showUnreadFlag;
  const showLastUpdateTime = () => bookshelfLayoutStore.settings.showLastUpdateTime;
  const showQuickScrollButtons = () => bookshelfLayoutStore.settings.showQuickScrollbar;
  const coverClickPreview = () => bookshelfLayoutStore.settings.coverClickPreview;
  const [coverPreviewBook, setCoverPreviewBook] = createSignal<Book | null>(null);
  const [bookshelfScrollRoot, setBookshelfScrollRoot] = createSignal<HTMLDivElement>();
  // 直接访问 store 属性以确保响应式追踪
  const sortMode = () => {
    const settings = bookshelfLayoutStore.settings;
    return settings.sortMode;
  };

  let layoutSettingsInitialized = false;
  createEffect(() => {
    if (!isActive() || layoutSettingsInitialized) return;
    layoutSettingsInitialized = true;
    void (async () => {
      await initBookshelfLayoutSettings();
      await bookshelfStore.waitForStateRestore();
      void sourcesStore.loadBookSources();
      const mode = await loadBookshelfMainSearchMode();
      setShelfSearchMode(mode);
    })();
  });

  createEffect(() => {
    if (!isActive() || !showBooksView()) return;
    void loadBookshelfMainSearchMode().then((mode) => setShelfSearchMode(mode));
  });

  createEffect(() => {
    if (!isActive()) return;
    if (groups().length > 0) return;
    loadGroups();
  });

  async function loadGroups() {
    try {
      const all = await groupsDb.getAllGroups();
      const sorted = [...all].sort((a, b) => a.order - b.order);
      const visible = sorted.filter((g) => g.show);
      setGroups(visible);
      props.onGroupsLoaded?.(visible);
      loadGroupCounts(visible);
    } catch (e) {
      console.error('加载分组失败:', e);
    }
  }

  async function loadGroupCounts(groupsList: BookGroup[]) {
    if (groupsList.length === 0) return;
    try {
      const pairs = await Promise.all(
        groupsList.map((g) => booksDb.getBookCountByGroup(g.groupId).then((c) => [g.groupId, c] as const))
      );
      const counts: Record<number, number> = {};
      for (const [id, c] of pairs) counts[id] = c;
      setGroupBookCounts(counts);
      props.onGroupCountsLoaded?.(counts);
    } catch (e) {
      console.error('加载分组书籍数量失败:', e);
    }
  }

  createEffect(() => {
    if (!isActive()) return;
    if (groupStyle() !== 'normal' && groups().length === 0) loadGroups();
  });

  /** 分组列表加载后校正标题名，避免 HMR / 存储恢复后 currentGroup 与 currentGroupName 不一致 */
  createEffect(() => {
    const cg = currentGroup();
    const list = groups();
    if (list.length === 0) return;
    const expected =
      cg === -1 ? '全部' : list.find((g) => g.groupId === cg)?.groupName;
    if (expected && expected !== currentGroupName()) {
      bookshelfStore.setCurrentGroupName(expected);
    }
  });

  /** 上次已加载书籍列表的分组，用于从阅读器等返回时静默刷新 */
  let lastLoadedBooksGroupId: number | null = null;

  createEffect(() => {
    if (!isActive()) return;
    const style = groupStyle();
    const cg = currentGroup();
    const showList = showGroupList();

    // 常规模式下，如果显示分组列表，不加载书籍
    if (style === 'normal' && showList) {
      // 确保分组列表已加载
      if (groups().length === 0) {
        loadGroups();
      }
      return;
    }

    const sameGroupWithList =
      lastLoadedBooksGroupId === cg && untrack(() => books().length > 0);
    // 从阅读器返回：列表仍在内存，进度由 bookshelf-book-updated 补丁
    if (!sameGroupWithList) {
      void loadBooksForGroup(cg);
      lastLoadedBooksGroupId = cg;
    }
  });

  async function loadBooksForGroup(groupId: number, options?: { silent?: boolean }) {
    if (!options?.silent) {
      setBooksLoading(true);
    }
    setBooksError(null);
    try {
      const list = await booksDb.getBooksByGroup(groupId);
      // 根据当前排序模式对书籍进行排序
      const sorted = sortBooks(list, sortMode());
      setBooks((prev) => {
        if (options?.silent && prev.length > 0) {
          const merged = mergeShelfBookList(prev, sorted);
          return shelfListsSameOrderAndRefs(prev, merged) ? prev : merged;
        }
        return sorted;
      });
      scheduleShelfChapterRepairs(sorted);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载书籍失败';
      setBooksError(msg);
      setBooks([]);
    } finally {
      if (!options?.silent) {
        setBooksLoading(false);
      }
    }
  }

  /** 目录更新后仅替换列表中的单本书，避免整页重载 */
  async function patchBookInShelf(resultUrl: string, requestedUrl?: string) {
    const updated = await booksDb.getBook(resultUrl);
    const lookupUrls = new Set(
      [resultUrl, requestedUrl].filter((u): u is string => Boolean(u)),
    );
    const prev = untrack(() => books());

    if (!updated) {
      setBooks((list) => {
        const idx = list.findIndex((b) => lookupUrls.has(b.bookUrl));
        if (idx < 0) return list;
        const next = list.filter((b) => !lookupUrls.has(b.bookUrl));
        return next.length === list.length ? list : next;
      });
      return;
    }

    const idx = prev.findIndex((b) => lookupUrls.has(b.bookUrl));
    if (idx < 0) return;

    const existing = prev[idx];
    applyShelfBookInPlace(existing, updated);
    const sorted = sortBooks([...prev], sortMode());
    const merged = mergeShelfBookList(prev, sorted);
    if (shelfListsSameOrderAndRefs(prev, merged)) return;

    setBooks(merged);
  }

  async function handleCoverUrlRefreshed(bookUrl: string, newCoverUrl: string) {
    const list = books();
    const idx = list.findIndex((b) => b.bookUrl === bookUrl);
    if (idx < 0) return;
    if (list[idx]!.coverUrl === newCoverUrl) return;
    const updated: Book = { ...list[idx], coverUrl: newCoverUrl };
    try {
      await booksDb.updateBook(updated);
    } catch (e) {
      console.warn('[bookshelf] 更新封面 URL 失败', e);
    }
    const next = [...list];
    next[idx] = updated;
    setBooks(next);
  }

  // 监听排序模式变化，立即重新排序当前书籍列表
  // 使用 untrack 避免对 books() 的响应式依赖，防止无限循环
  createEffect(() => {
    // 直接访问 store 属性以确保响应式追踪
    const settings = bookshelfLayoutStore.settings;
    const mode = settings.sortMode;
    // 使用 untrack 获取当前书籍列表，避免创建响应式依赖
    const currentBooks = untrack(() => books());
    if (currentBooks.length > 0) {
      const sorted = sortBooks(currentBooks, mode);
      // 检查排序后的数组是否真的不同，避免不必要的更新
      const isDifferent = sorted.length !== currentBooks.length ||
        sorted.some((book, i) => book.bookUrl !== currentBooks[i]?.bookUrl);
      if (isDifferent) {
        setBooks(sorted);
      }
    }
  });

  function handleGroupSelect(group: BookGroup) {
    bookshelfStore.setCurrentGroup(group.groupId);
    bookshelfStore.setCurrentGroupName(group.groupName);
    bookshelfStore.setShowGroupList(false);
  }

  function handleUpdateToc() {
    if (!showBooksView()) {
      showAppToast({
        title: '请先选择分组',
        description: '进入具体分组后再更新该分组书籍的目录',
        variant: 'warning',
      });
      return;
    }
    const targets = books().filter((b) => !isLocalBook(b) && b.canUpdate !== false);
    if (targets.length === 0) {
      showAppToast({
        title: '没有可更新的书籍',
        description: '当前分组没有需要更新的在线书籍',
      });
      return;
    }

    const batchSize = targets.length;
    showAppToast({
      id: UPDATE_TOC_TOAST_ID,
      title: '正在更新目录',
      description: `共 ${batchSize} 本`,
      variant: 'plain',
      progress: 0,
      persistent: true,
    });

    let lastProgressDone = -1;
    enqueueUpdateToc(
      targets.map((b) => b.bookUrl),
      {
        onProgress: ({ done, total }) => {
          if (total <= 0) return;
          const ratio = done / total;
          updateAppToastProgress(UPDATE_TOC_TOAST_ID, ratio);
          if (done === lastProgressDone) return;
          lastProgressDone = done;
          showAppToast({
            id: UPDATE_TOC_TOAST_ID,
            title: '正在更新目录',
            description: `已完成 ${done} / ${total} 本`,
            variant: 'plain',
            progress: ratio,
            persistent: true,
          });
        },
        onBookDone: (bookUrl, error, requestedUrl) => {
          void patchBookInShelf(bookUrl, requestedUrl);
          const open = textViewerStore.state.book;
          const openUrls = new Set(
            [bookUrl, requestedUrl, open?.bookUrl].filter((u): u is string => Boolean(u)),
          );
          if (open && openUrls.has(open.bookUrl) && !error) {
            void textViewerStore.loadCatalog(bookUrl);
          }
        },
        onAllDone: (result) => {
          dismissAppToast(UPDATE_TOC_TOAST_ID);
          if (result.total === 0) return;
          if (result.failed === 0) {
            showAppToast({
              title: '目录更新完成',
              description: `成功更新 ${result.success} 本`,
              variant: 'success',
            });
          } else if (result.success === 0) {
            showAppToast({
              title: '目录更新失败',
              description: `${result.failed} 本更新失败，可在「更新失败」分组查看`,
              variant: 'error',
            });
          } else {
            showAppToast({
              title: '目录更新完成',
              description: `成功 ${result.success} 本，失败 ${result.failed} 本`,
              variant: 'warning',
            });
          }
        },
      },
    );
  }

  function resolveBookshelfScopeGroupId(): number {
    return showBooksView() ? currentGroup() : BookGroupId.All;
  }

  function handleOpenChapterCache() {
    props.onOpenBookshelfCache?.(resolveBookshelfScopeGroupId());
  }

  async function handleExportBookshelf() {
    try {
      const list = await booksDb.getBooksByGroup(resolveBookshelfScopeGroupId());
      if (list.length === 0) {
        showAppToast({
          title: '当前范围没有书籍',
          variant: 'warning',
        });
        return;
      }
      await exportBookshelfJson(list);
      showAppToast({
        title: '书单已导出',
        description: `共 ${list.length} 本（仅书名、作者、简介）`,
        variant: 'success',
      });
    } catch (e) {
      if (e instanceof SaveTextFileCancelledError) return;
      showAppToast({
        title: '导出失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  }

  function handleEditBook(book: Book) {
    setBookToEdit(book);
    setBookEditOpen(true);
  }

  function handleDeleteBook(book: Book) {
    setBookToDelete(book);
    setDeleteConfirmOpen(true);
  }

  async function confirmDeleteBook(deleteFile: boolean) {
    const book = bookToDelete();
    if (!book) return;
    const isLocal = isLocalBook(book);
    let fileDeleteFailed = false;
    try {
      await booksDb.deleteBook(book.bookUrl);

      if (deleteFile && isLocal) {
        try {
          await removeLocalBookStoredFile(book.bookUrl);
        } catch (fileError) {
          console.warn('删除本地书籍存储失败:', fileError);
          fileDeleteFailed = true;
        }
      }

      setDeleteConfirmOpen(false);
      setBookToDelete(null);
      loadBooksForGroup(currentGroup());
      if (props.onGroupsLoaded && groups().length) loadGroupCounts(groups());

      const toast = isLocal
        ? describeDeleteLocalBookToast(book.bookUrl, book.name, {
          deleteFile,
          fileDeleteFailed,
        })
        : { title: '已从书架删除', description: '' };
      if (fileDeleteFailed || (deleteFile && isLocal) || isLocal) {
        showAppToast({
          title: toast.title,
          description: toast.description,
          variant: fileDeleteFailed ? 'default' : 'success',
        });
      } else {
        showAppToast({
          title: '已从书架删除',
          variant: 'success',
        });
      }
    } catch (e) {
      console.error('删除书籍失败:', e);
      showAppToast({
        title: '删除书籍失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  const displayBooks = createMemo(() => {
    if (!showBooksView()) return books();
    return books();
  });

  /** 常规分组样式：在具体分组书籍页显示返回分组列表 */
  const showBackToGroupList = createMemo(
    () => groupStyle() === 'normal' && !showGroupList()
  );

  function handleBackToGroupList() {
    bookshelfStore.setShowGroupList(true);
  }

  const pageTitle = () => {
    if (showGroupPage()) return '分组';
    return currentGroupName() || '书架';
  };

  const pageDescription = () => {
    if (showGroupPage()) {
      const n = groups().length;
      return n > 0 ? `共 ${n} 个分组` : undefined;
    }
    const total = books().length;
    return `共 ${total} 本书`;
  };

  const showGroupTabsBelow = () => groupStyle() === 'tabs' && groups().length > 0;

  /** 下拉框样式：书籍视图下标题可切换分组 */
  const showGroupTitleDropdown = () =>
    groupStyle() === 'dropdown' && showBooksView();
  /** 常规 / 标签 / 下拉：标题区均经 PageToolbarTitleDropdown 渲染（常规与标签禁下拉，样式一致） */
  const showToolbarTitleSlot = () =>
    groupStyle() === 'normal' || groupStyle() === 'tabs' || showGroupTitleDropdown();

  const handleGroupChange = (groupId: number) => {
    bookshelfStore.setCurrentGroup(groupId);
    const name =
      groupId === -1
        ? '全部'
        : groups().find((g) => g.groupId === groupId)?.groupName ?? '全部';
    bookshelfStore.setCurrentGroupName(name);
  };

  async function handleReloadLocalBooks() {
    setIsReloadingBooks(true);
    try {
      const root = await getManagedBooksRoot();
      const entries = await listDirectory(root);
      const bookFiles: string[] = [];

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const ext = entry.name.toLowerCase().split('.').pop();
        if (ext !== 'txt' && ext !== 'epub') continue;
        const bookUrl =
          entry.path.startsWith('path:') ||
            entry.path.startsWith('uri:') ||
            entry.path.startsWith('opfs:')
            ? entry.path
            : formatStorageRef(
              root.kind === 'path'
                ? { kind: 'path', value: entry.path }
                : parseStorageRef(entry.path),
            );
        bookFiles.push(bookUrl);
      }

      if (bookFiles.length === 0) {
        showAppToast({
          title: '未找到书籍',
          description: isTauri()
            ? '本地目录中没有找到书籍文件'
            : '浏览器书籍库（OPFS）中没有找到 .txt / .epub 文件',
          variant: 'default',
        });
        return;
      }

      const missingBooks: string[] = [];
      for (const filePath of bookFiles) {
        const exists = await hasBook(filePath);
        if (!exists) missingBooks.push(filePath);
      }

      if (missingBooks.length === 0) {
        showAppToast({
          title: '无需恢复',
          description: '所有本地书籍文件已在书架中',
          variant: 'default',
        });
        return;
      }

      let successCount = 0;
      let failCount = 0;
      for (const filePath of missingBooks) {
        try {
          const fileName = displayFileNameFromBookUrl(filePath);
          const content = await readBytes(parseStorageRef(filePath));
          await importLocalBookFromContent(filePath, fileName, content, { groupId: BookGroupId.Local });
          successCount++;
        } catch (error) {
          console.error(`导入文件失败: ${filePath}`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        showAppToast({
          title: '恢复完成',
          description: `成功恢复 ${successCount} 本书${failCount > 0 ? `，${failCount} 本失败` : ''}`,
          variant: 'success',
        });
        window.dispatchEvent(new CustomEvent('bookshelf-refresh'));
        loadBooksForGroup(currentGroup());
        if (groups().length) loadGroupCounts(groups());
      } else {
        showAppToast({
          title: '恢复失败',
          description: `所有 ${missingBooks.length} 本书恢复失败`,
          variant: 'error',
        });
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '重新加载失败';
      console.error('重新加载本地书籍失败:', e);
      showAppToast({
        title: '重新加载失败',
        description: errorMsg,
        variant: 'error',
      });
    } finally {
      setIsReloadingBooks(false);
    }
  }

  /** 导入/删书等事件触发：组件仍挂载在隐藏区时也刷新，避免从导入页返回后列表陈旧 */
  async function refreshFromBookshelfEvent() {
    if (groups().length === 0) {
      await loadGroups();
    } else {
      await loadGroupCounts(groups());
    }
    // 始终刷新当前分组书籍（含常规样式停留在分组页时预加载，进入分组即可见新书）
    await loadBooksForGroup(currentGroup());
  }

  /** 从阅读器等切回书架：列表仍在内存中时不整页重载 */
  let wasBookshelfActive = false;
  createEffect(() => {
    const active = isActive();
    if (active && !wasBookshelfActive) {
      if (books().length === 0) {
        void refreshFromBookshelfEvent();
      } else if (groups().length > 0) {
        void loadGroupCounts(groups());
      }
    }
    wasBookshelfActive = active;
  });

  onMount(() => {
    const handler = () => {
      void refreshFromBookshelfEvent();
    };
    const bookUpdatedHandler = (e: Event) => {
      const url = (e as CustomEvent<{ bookUrl?: string }>).detail?.bookUrl;
      if (url) {
        void patchBookInShelf(url);
        return;
      }
      void refreshFromBookshelfEvent();
    };
    window.addEventListener('bookshelf-refresh', handler);
    window.addEventListener('bookshelf-book-updated', bookUpdatedHandler);

    // 监听布局设置变化事件，重新排序当前书籍列表
    const layoutChangeHandler = () => {
      const currentBooks = books();
      if (currentBooks.length > 0) {
        const sorted = sortBooks(currentBooks, sortMode());
        setBooks(sorted);
      }
    };
    window.addEventListener('bookshelf-layout-changed', layoutChangeHandler);

    onCleanup(() => {
      window.removeEventListener('bookshelf-refresh', handler);
      window.removeEventListener('bookshelf-book-updated', bookUpdatedHandler);
      window.removeEventListener('bookshelf-layout-changed', layoutChangeHandler);
    });
  });

  return (
    <div class={mainShellPageRoot}>
      <PageToolbar
        belowHorizontalWheel={showGroupTabsBelow()}
        title={pageTitle()}
        description={pageDescription()}
        titleSlot={
          showToolbarTitleSlot() ? (
            <BookshelfGroupTitleDropdown
              title={pageTitle()}
              description={pageDescription()}
              groups={groups()}
              groupBookCounts={groupBookCounts()}
              currentGroupId={currentGroup()}
              onGroupChange={handleGroupChange}
              dropdownEnabled={showGroupTitleDropdown()}
            />
          ) : undefined
        }
        leading={
          showBackToGroupList() ? (
            <Tooltip>
              <TooltipTrigger
                as={Button}
                variant="ghost"
                size="icon"
                class="h-9 w-9 shrink-0"
                onClick={handleBackToGroupList}
                aria-label="返回分组页"
              >
                <ChevronLeftIcon class="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent>返回分组</TooltipContent>
            </Tooltip>
          ) : undefined
        }
        below={
          showGroupTabsBelow() ? (
            <BookshelfGroupNav
              groupStyle="tabs"
              groups={groups()}
              groupBookCounts={groupBookCounts()}
              currentGroupId={currentGroup()}
              onGroupChange={handleGroupChange}
            />
          ) : undefined
        }
      >
        <BookshelfPageToolbar
          onPageChange={props.onPageChange}
          onOpenGroupManage={props.onOpenGroupManage}
          onOpenBookshelfManage={props.onOpenBookshelfManage}
          onImportLocal={props.onImportLocal}
          onAddBookByUrl={props.onAddBookByUrl}
          onUpdateToc={handleUpdateToc}
          onOpenChapterCache={handleOpenChapterCache}
          onExportBookshelf={() => void handleExportBookshelf()}
          onImportBookshelf={() => setImportBookshelfOpen(true)}
          pendingUpdateScope={showBooksView() ? 'group' : 'total'}
          pendingUpdateBookUrls={() => displayBooks().map((b) => b.bookUrl)}
          showReloadLocal={showBooksView() && currentGroup() === BookGroupId.Local}
          isReloadingLocal={isReloadingBooks()}
          onReloadLocal={handleReloadLocalBooks}
          searchTarget={isGroupSearchToolbar() ? 'groups' : 'books'}
          onSearchQueryChange={undefined}
          searchMode={isGroupSearchToolbar() ? undefined : shelfSearchMode()}
          onSearchModeChange={
            isGroupSearchToolbar()
              ? undefined
              : (mode) => {
                setShelfSearchMode(mode);
                void saveBookshelfMainSearchMode(mode);
              }
          }
          onOpenGlobalSearch={(q) => props.onOpenBookSearch?.(q)}
        />
      </PageToolbar>

      <div ref={setBookshelfScrollRoot} class={mainShellPageScroll}>
        <Show when={showGroupPage()}>
          <BookGroupPage
            initialGroups={groups()}
            searchQuery=""
            scrollElement={bookshelfScrollRoot}
            onGroupSelect={handleGroupSelect}
            onGroupsLoaded={(g) => {
              props.onGroupsLoaded?.(g);
              loadGroupCounts(g);
            }}
          />
        </Show>

        <Show when={showBooksView()}>
          <GroupBooksView
            books={displayBooks()}
            loading={booksLoading()}
            error={booksError()}
            viewMode={viewMode()}
            titleDisplay={titleDisplay()}
            showUnreadFlag={showUnreadFlag()}
            showLastUpdateTime={showLastUpdateTime()}
            sortMode={sortMode()}
            scrollElement={bookshelfScrollRoot}
            onOpenBook={props.onOpenBook}
            onEditBook={handleEditBook}
            onDeleteBook={handleDeleteBook}
            onBooksReorder={async (newOrderedBooks) => {
              const updates = newOrderedBooks.map((b, i) => ({ bookUrl: b.bookUrl, order: i }));
              await booksDb.updateBooksOrder(updates);
            }}
            onCoverUrlRefreshed={handleCoverUrlRefreshed}
            coverClickPreview={coverClickPreview()}
            onCoverPreview={setCoverPreviewBook}
          />
        </Show>
      </div>

      <Show when={showQuickScrollButtons()}>
        <QuickScrollButtons
          container={bookshelfScrollRoot}
          contentRevision={() =>
            [
              showGroupPage(),
              showBooksView(),
              books().length,
              booksLoading(),
              groups().length,
            ].join(':')
          }
        />
      </Show>

      <BookEditDialog
        open={bookEditOpen()}
        onOpenChange={setBookEditOpen}
        book={bookToEdit()}
        onSuccess={() => {
          loadBooksForGroup(currentGroup());
          if (props.onGroupsLoaded && groups().length) loadGroupCounts(groups());
        }}
        onError={(msg) => setBooksError(msg)}
      />

      <DeleteBookDialog
        open={deleteConfirmOpen()}
        onOpenChange={setDeleteConfirmOpen}
        book={bookToDelete()}
        onConfirm={confirmDeleteBook}
      />

      <ImportBookshelfDialog
        open={importBookshelfOpen()}
        onOpenChange={setImportBookshelfOpen}
        groupId={resolveBookshelfScopeGroupId()}
        onDone={() => {
          loadBooksForGroup(currentGroup());
          if (props.onGroupsLoaded && groups().length) loadGroupCounts(groups());
        }}
      />

      <BookCoverPreviewDialog
        open={!!coverPreviewBook()}
        onOpenChange={(open) => {
          if (!open) setCoverPreviewBook(null);
        }}
        coverUrl={coverPreviewBook()?.coverUrl}
        customCoverUrl={coverPreviewBook()?.customCoverUrl}
        bookUrl={coverPreviewBook()?.bookUrl ?? ''}
        origin={coverPreviewBook()?.origin}
        source={
          coverPreviewBook()
            ? sourcesStore.getBookSource(coverPreviewBook()!.origin)
            : null
        }
        name={coverPreviewBook()?.name ?? ''}
      />
    </div>
  );
}

/** 具体分组的书籍列表/网格，与分组页共用书架布局设置 */
function GroupBooksView(props: {
  books: Book[];
  loading: boolean;
  error: string | null;
  viewMode: ViewMode;
  titleDisplay: BookTitleDisplay;
  showUnreadFlag: boolean;
  showLastUpdateTime: boolean;
  sortMode: string;
  scrollElement?: Accessor<HTMLDivElement | null | undefined>;
  onOpenBook?: (book: Book) => void;
  onEditBook?: (book: Book) => void;
  onDeleteBook?: (book: Book) => void;
  onBooksReorder?: (newOrderedBooks: Book[]) => void | Promise<void>;
  onCoverUrlRefreshed?: (bookUrl: string, newCoverUrl: string) => void;
  coverClickPreview?: boolean;
  onCoverPreview?: (book: Book) => void;
}) {
  const showSkeleton = useSkeletonLoading(() => props.loading, { delay: 100, minDisplayTime: 300 });

  return (
    <div class="w-full space-y-6">
      <Show when={props.error}>
        <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {props.error}
        </div>
      </Show>

      <Show when={showSkeleton()}>
        <ul class="space-y-2">
          <For each={[1, 2, 3, 4, 5, 6]}>
            {() => (
              <li class="flex items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2.5 animate-pulse">
                <span class="h-10 aspect-3/4 shrink-0 rounded-md bg-muted" />
                <div class="min-w-0 flex-1 space-y-2">
                  <span class="block h-4 w-3/4 rounded bg-muted" />
                  <span class="block h-3 w-1/2 rounded bg-muted" />
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Show when={!props.loading && !showSkeleton() && props.books.length > 0}>
        <BooksGrid
          books={props.books}
          viewMode={props.viewMode}
          titleDisplay={props.titleDisplay}
          showUnreadFlag={props.showUnreadFlag}
          showLastUpdateTime={props.showLastUpdateTime}
          sortMode={props.sortMode}
          scrollElement={props.scrollElement}
          onOpenBook={props.onOpenBook}
          onEditBook={props.onEditBook}
          onDeleteBook={props.onDeleteBook}
          onBooksReorder={props.onBooksReorder}
          onCoverUrlRefreshed={props.onCoverUrlRefreshed}
          coverClickPreview={props.coverClickPreview}
          onCoverPreview={props.onCoverPreview}
        />
      </Show>

      <Show when={!props.loading && !showSkeleton() && !props.error && props.books.length === 0}>
        <div class="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-12">
          <BookshelfIcon class="mb-4 h-12 w-12 text-muted-foreground" size={48} />

          <h3 class="mb-2 text-lg font-semibold text-foreground">暂无书籍</h3>
          <p class="text-sm text-muted-foreground">该分组下还没有书籍</p>
        </div>
      </Show>
    </div>
  );
}

/** 书籍列表/网格：虚拟列表 + solid-dnd 手动排序 */
function BooksGrid(props: {
  books: Book[];
  viewMode: ViewMode;
  titleDisplay: BookTitleDisplay;
  showUnreadFlag: boolean;
  showLastUpdateTime: boolean;
  sortMode: string;
  scrollElement?: Accessor<HTMLDivElement | null | undefined>;
  onOpenBook?: (book: Book) => void;
  onEditBook?: (book: Book) => void;
  onDeleteBook?: (book: Book) => void;
  onBooksReorder?: (newOrderedBooks: Book[]) => void | Promise<void>;
  onCoverUrlRefreshed?: (bookUrl: string, newCoverUrl: string) => void;
  coverClickPreview?: boolean;
  onCoverPreview?: (book: Book) => void;
}) {
  const manualSort = () => props.sortMode === 'manual';
  const enableDragSort = () => bookshelfLayoutStore.settings.enableDragSort;
  const isGrid = () => isGridViewMode(props.viewMode);
  const cardLayout = (): 'list' | 'compact' | 'grid' => getViewModeCardLayout(props.viewMode);

  const bookContextMenuActions = (): BookContextMenuActions => ({
    onEdit: (book) => props.onEditBook?.(book),
    onDelete: (book) => props.onDeleteBook?.(book),
    onPinTop: async (book) => {
      const updated = pinBookToTop(props.books, book.bookUrl);
      if (updated) await props.onBooksReorder?.(updated);
    },
    onPinBottom: async (book) => {
      const updated = pinBookToBottom(props.books, book.bookUrl);
      if (updated) await props.onBooksReorder?.(updated);
    },
  });

  const bookSortableEnabled = createMemo(() => manualSort() && enableDragSort());
  const bookSortableIds = createMemo(() => props.books.map((b) => b.bookUrl));

  /** 始终传入 sortable，首屏即挂 SortableShell；仅 enabled 控制是否 createSortable */
  const bookSortable = createMemo(
    (): VirtualListSortableConfig<Book> => ({
      enabled: bookSortableEnabled,
      ids: () => bookSortableIds(),
      onReorder: (ids: Id[]) => {
        const map = new Map(props.books.map((b) => [b.bookUrl, b]));
        const list = ids
          .map((id) => map.get(String(id)))
          .filter((b): b is Book => !!b);
        if (list.length !== props.books.length) return;
        void props.onBooksReorder?.(list.map((b, i) => ({ ...b, order: i })));
      },
      persistOnly: true,
    }),
  );

  const listCard = (book: Book) => (
    <BookCardWithMenu
      book={book}
      layout={cardLayout()}
      viewMode={props.viewMode}
      titleDisplay={props.titleDisplay}
      showUnreadFlag={props.showUnreadFlag}
      showLastUpdateTime={props.showLastUpdateTime}
      orderedBooks={props.books}
      manualSort={manualSort()}
      actions={bookContextMenuActions()}
      onOpenBook={props.onOpenBook}
      onCoverUrlRefreshed={props.onCoverUrlRefreshed}
      coverClickPreview={props.coverClickPreview}
      onCoverPreview={props.onCoverPreview}
    />
  );

  return (
    <Show
      when={isGrid()}
      fallback={
        <VirtualBookshelfBookList
          books={props.books}
          viewMode={props.viewMode}
          showLastUpdateTime={props.showLastUpdateTime}
          sortable={bookSortable()}
          externalScrollElement={props.scrollElement}
        >
          {(book) => listCard(book)}
        </VirtualBookshelfBookList>
      }
    >
      <VirtualBookshelfBookGrid
        books={props.books}
        viewMode={props.viewMode}
        bookTitleDisplay={props.titleDisplay}
        showLastUpdateTime={props.showLastUpdateTime}
        sortable={bookSortable()}
        externalScrollElement={props.scrollElement}
      >
        {(book) => <div class="min-w-0 w-full">{listCard(book)}</div>}
      </VirtualBookshelfBookGrid>
    </Show>
  );
}

const bookListCardClass = bookshelfListCardClass();

const bookCompactCardClass = bookshelfCompactListCardClass();

const bookGridCardClass = bookGroupGridCardClass('cursor-pointer');

/** 单本书卡片 + 右键/长按菜单 */
function BookCardWithMenu(props: {
  book: Book;
  layout: 'list' | 'compact' | 'grid';
  viewMode: ViewMode;
  titleDisplay: BookTitleDisplay;
  showUnreadFlag: boolean;
  showLastUpdateTime: boolean;
  orderedBooks: Book[];
  manualSort: boolean;
  actions: BookContextMenuActions;
  onOpenBook?: (book: Book) => void;
  onCoverUrlRefreshed?: (bookUrl: string, newCoverUrl: string) => void;
  coverClickPreview?: boolean;
  onCoverPreview?: (book: Book) => void;
}) {
  const cardClass = () =>
    props.layout === 'list'
      ? bookListCardClass
      : props.layout === 'compact'
        ? bookCompactCardClass
        : bookGridCardClass;

  const effectiveTitleDisplay = () =>
    getEffectiveTitleDisplay(props.layout, props.titleDisplay);

  const showGridHideTooltip = () =>
    props.layout === 'grid' && effectiveTitleDisplay() === 'hide';

  return (
    <BookContextMenu
      book={props.book}
      orderedBooks={props.orderedBooks}
      manualSort={props.manualSort}
      actions={props.actions}
      class={cardClass()}
      onOpenBook={() => props.onOpenBook?.(props.book)}
    >
      <BookshelfGridHideTooltip
        enabled={showGridHideTooltip()}
        title={props.book.name}
        subtitle={props.book.author ?? '—'}
      >
        <Show
          when={props.layout !== 'grid' && effectiveTitleDisplay() === 'show'}
          fallback={
            <>
              <div
                class={cn(
                  bookGroupGridCoverClass(),
                  (effectiveTitleDisplay() === 'overlay' ||
                    (props.layout === 'grid' &&
                      (props.showUnreadFlag ||
                        shouldShowBookshelfLastUpdateTime(
                          props.book,
                          props.showLastUpdateTime,
                        )))) &&
                  'relative',
                )}
              >
                <Show when={props.showLastUpdateTime && props.layout === 'grid'}>
                  <BookShelfGridLastUpdateBadge
                    book={props.book}
                    showLastUpdateTime={props.showLastUpdateTime}
                  />
                </Show>
                <Show when={props.showUnreadFlag && props.layout === 'grid'}>
                  <BookShelfGridUnreadBadge book={props.book} />
                </Show>
                <BookCoverImg
                  src={props.book.customCoverUrl || props.book.coverUrl}
                  referer={props.book.origin}
                  source={sourcesStore.getBookSource(props.book.origin)}
                  bookUrl={props.book.bookUrl}
                  onCoverUrlRefreshed={(url) =>
                    props.onCoverUrlRefreshed?.(props.book.bookUrl, url)
                  }
                  alt=""
                  class="h-full w-full object-cover"
                  draggable={false}
                  fallback={<BookCoverFallback class="h-8 w-8" />}
                />
                <Show when={effectiveTitleDisplay() === 'overlay'}>
                  <BookshelfCoverTitleOverlay
                    title={props.book.name}
                    subtitle={props.book.author ?? '—'}
                  />
                </Show>
              </div>
              <Show when={effectiveTitleDisplay() === 'show' && props.layout === 'grid'}>
                <div class="flex w-full flex-col items-center gap-0.5">
                  <h3 class={bookGroupGridTitleClass()}>
                    {props.book.name}
                  </h3>
                  <p class={cn(bookGroupGridSubtitleClass(), 'w-full truncate text-center')}>
                    {props.book.author ?? '—'}
                  </p>
                </div>
              </Show>
            </>
          }
        >
          <BookShelfListBookRow
            book={props.book}
            layout={props.layout === 'compact' ? 'compact' : 'list'}
            viewMode={props.viewMode}
            showUnreadFlag={props.showUnreadFlag}
            showLastUpdateTime={props.showLastUpdateTime}
            coverClickPreview={props.coverClickPreview}
            source={sourcesStore.getBookSource(props.book.origin)}
            onCoverUrlRefreshed={props.onCoverUrlRefreshed}
            onCoverPreview={() => props.onCoverPreview?.(props.book)}
          />
        </Show>
      </BookshelfGridHideTooltip>
    </BookContextMenu>
  );
}
