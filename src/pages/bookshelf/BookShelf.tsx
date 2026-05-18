/**
 * 书架通用页面框架
 * 根据分组样式（常规/下拉框/标签）和当前视图（分组页 vs 具体分组书籍）动态加载数据并显示
 * - 常规：启动默认显示分组页，点击分组后显示该分组书籍；可返回分组页
 * - 下拉框/标签：默认显示「全部」书籍，分组名在导航栏以下拉/标签切换，不显示分组页
 */

import { createSignal, For, Show, onMount, onCleanup, createEffect, untrack, createMemo, type JSX } from 'solid-js';
import Sortable from 'sortablejs';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { bookshelfStore } from '@/stores/bookshelf';
import { bookshelfLayoutStore, initBookshelfLayoutSettings } from '@/stores/bookshelf-layout';
import { sortBooks } from '@/utils/book-sort';
import * as groupsDb from '@/lib/database/book-groups';
import * as booksDb from '@/lib/database/books';
import type { BookGroup } from '@/types';
import type { Book } from '@/types';
import { BookGroupId } from '@/types';
import { BookGroup as BookGroupPage } from './BookGroup';
import { BookEditDialog } from '@/components/BookEditDialog';
import { DeleteBookDialog } from '@/components/DeleteBookDialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshIcon, ChevronLeftIcon, BookshelfIcon } from '@/components/icons';
import { showAppToast } from '@/components/AppToasts';
import { getBooksDirectory } from '@/lib/local-book/import';
import { getFileSystem } from '@/lib/platform/filesystem';
import { hasBook } from '@/lib/database/books';
import { importLocalBookFromContent, isLocalBook } from '@/lib/local-book';
import { isTauri } from '@/lib/platform/detect';
import { join } from '@tauri-apps/api/path';
import { cn } from '@/lib/utils';
import { PageToolbar } from '@/components/PageToolbar';
import { BookshelfGroupNav, BookshelfGroupTitleDropdown } from '@/components/BookshelfGroupNav';

export interface BookShelfProps {
  /** 分组加载完成后回调，供导航栏下拉/标签使用 */
  onGroupsLoaded?: (groups: BookGroup[]) => void;
  /** 各分组书籍数量加载完成后回调，供导航栏下拉描述使用 */
  onGroupCountsLoaded?: (counts: Record<number, number>) => void;
  /** 点击书籍时打开阅读器 */
  onOpenBook?: (book: Book) => void;
  /** 页面工具栏右侧操作区（更多菜单等） */
  toolbarActions?: JSX.Element;
}

export function BookShelf(props: BookShelfProps) {
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

  const groupStyle = () => bookshelfLayoutStore.settings.groupStyle;
  const showGroupList = () => bookshelfStore.state.showGroupList;
  const currentGroup = () => bookshelfStore.state.currentGroup;
  const currentGroupName = () => bookshelfStore.state.currentGroupName;
  const viewMode = () => bookshelfLayoutStore.settings.viewMode;
  const titleDisplay = () => bookshelfLayoutStore.settings.bookTitleDisplay;
  // 直接访问 store 属性以确保响应式追踪
  const sortMode = () => {
    const settings = bookshelfLayoutStore.settings;
    return settings.sortMode;
  };

  onMount(async () => {
    await initBookshelfLayoutSettings();
    // 等待状态恢复完成，确保使用恢复的状态
    await bookshelfStore.waitForStateRestore();
    // 始终加载分组（供导航栏与分组页使用），与书源页一致：数据由父级加载一次，进入分组页不重复请求
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
    if (groupStyle() !== 'normal' && groups().length === 0) loadGroups(); // 下拉/标签模式且分组未加载时加载，供导航栏使用
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

  createEffect(() => {
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

    // 其他情况：加载当前分组的书籍
    loadBooksForGroup(cg);
  });

  async function loadBooksForGroup(groupId: number) {
    setBooksLoading(true);
    setBooksError(null);
    try {
      const list = await booksDb.getBooksByGroup(groupId);
      // 根据当前排序模式对书籍进行排序
      const sorted = sortBooks(list, sortMode());
      setBooks(sorted);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载书籍失败';
      setBooksError(msg);
      setBooks([]);
    } finally {
      setBooksLoading(false);
    }
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
          const fs = await getFileSystem();
          if (!book.bookUrl.startsWith('local::')) {
            await fs.remove(book.bookUrl, false);
          }
        } catch (fileError) {
          console.warn('删除本地文件失败:', fileError);
          fileDeleteFailed = true;
        }
      }

      setDeleteConfirmOpen(false);
      setBookToDelete(null);
      loadBooksForGroup(currentGroup());
      if (props.onGroupsLoaded && groups().length) loadGroupCounts(groups());

      if (fileDeleteFailed) {
        showAppToast({
          title: '已从书架删除',
          description: '本地文件未能删除，请手动清理。',
          variant: 'default',
        });
      } else if (deleteFile && isLocal) {
        showAppToast({
          title: '已删除书籍及本地文件',
          description: `《${book.name}》已从书架移除，本地文件已删除。`,
          variant: 'success',
        });
      } else if (isLocal) {
        showAppToast({
          title: '已从书架删除',
          description: '本地文件已保留。',
          variant: 'success',
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

  const showGroupPage = () =>
    groupStyle() === 'normal' && showGroupList();
  const showBooksView = () =>
    groupStyle() !== 'normal' || !showGroupList();
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
    return `共 ${books().length} 本书`;
  };

  const showGroupTabsBelow = () => groupStyle() === 'tabs' && groups().length > 0;

  /** 下拉框样式：书籍视图下标题可切换分组 */
  const showGroupTitleDropdown = () =>
    groupStyle() === 'dropdown' && showBooksView();
  /** 常规 / 下拉框：使用 PageToolbarTitleDropdown（常规为不可下拉） */
  const showToolbarTitleSlot = () =>
    groupStyle() === 'normal' || showGroupTitleDropdown();

  const handleGroupChange = (groupId: number) => {
    bookshelfStore.setCurrentGroup(groupId);
    const name =
      groupId === -1
        ? '全部'
        : groups().find((g) => g.groupId === groupId)?.groupName ?? '全部';
    bookshelfStore.setCurrentGroupName(name);
  };

  async function handleReloadLocalBooks() {
    if (!isTauri()) {
      showAppToast({
        title: '不支持',
        description: '重新加载功能仅在桌面端和移动端可用',
        variant: 'error',
      });
      return;
    }

    setIsReloadingBooks(true);
    try {
      const booksDir = await getBooksDirectory();
      const fs = await getFileSystem();
      const files = await fs.readDir(booksDir);
      const bookFiles: string[] = [];

      for (const file of files) {
        const fileName = file;
        if (!fileName) continue;
        const fullPath = await join(booksDir, fileName);
        try {
          await fs.readDir(fullPath);
          continue;
        } catch {
          const ext = fileName.toLowerCase().split('.').pop();
          if (ext === 'txt' || ext === 'epub') {
            bookFiles.push(fullPath);
          }
        }
      }

      if (bookFiles.length === 0) {
        showAppToast({
          title: '未找到书籍',
          description: '本地目录中没有找到书籍文件',
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
          const fileName = filePath.split(/[/\\]/).pop() || '';
          const content = await fs.readFile(filePath);
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

  onMount(() => {
    const handler = () => {
      // 重新加载书籍列表（会自动应用当前排序模式）
      loadBooksForGroup(currentGroup());
      if (props.onGroupsLoaded && groups().length) loadGroupCounts(groups());
    };
    window.addEventListener('bookshelf-refresh', handler);

    // 监听布局设置变化事件，重新排序当前书籍列表
    const layoutChangeHandler = () => {
      const currentBooks = books();
      if (currentBooks.length > 0) {
        const sorted = sortBooks(currentBooks, sortMode());
        setBooks(sorted);
      }
    };
    window.addEventListener('bookshelf-layout-changed', layoutChangeHandler);

    // 监听页面可见性变化：当用户从阅读器返回书架页面时，重新加载并排序
    let wasHidden = document.hidden;
    const visibilityChangeHandler = () => {
      const isHidden = document.hidden;
      // 页面从隐藏变为可见时，重新加载并排序
      if (wasHidden && !isHidden && books().length > 0) {
        loadBooksForGroup(currentGroup());
      }
      wasHidden = isHidden;
    };
    document.addEventListener('visibilitychange', visibilityChangeHandler);

    onCleanup(() => {
      window.removeEventListener('bookshelf-refresh', handler);
      window.removeEventListener('bookshelf-layout-changed', layoutChangeHandler);
      document.removeEventListener('visibilitychange', visibilityChangeHandler);
    });
  });

  return (
    <div class="flex flex-col flex-1 min-h-0 w-full">
      <PageToolbar
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
        {props.toolbarActions}
        <Show when={showBooksView() && currentGroup() === BookGroupId.Local}>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReloadLocalBooks}
            disabled={isReloadingBooks()}
          >
            <RefreshIcon class="h-4 w-4 mr-2" />
            {isReloadingBooks() ? '重新加载中...' : '重新加载书籍列表'}
          </Button>
        </Show>
      </PageToolbar>

      <div class="flex-1 min-h-0 overflow-y-auto pt-2">
        <Show when={showGroupPage()}>
          <BookGroupPage
            initialGroups={groups()}
            onGroupSelect={handleGroupSelect}
            onGroupsLoaded={(g) => {
              props.onGroupsLoaded?.(g);
              loadGroupCounts(g);
            }}
          />
        </Show>

        <Show when={showBooksView()}>
          <GroupBooksView
            books={books()}
            loading={booksLoading()}
            error={booksError()}
            viewMode={viewMode()}
            titleDisplay={titleDisplay()}
            sortMode={sortMode()}
            onOpenBook={props.onOpenBook}
            onEditBook={handleEditBook}
            onDeleteBook={handleDeleteBook}
            onBooksReorder={async (newOrderedBooks) => {
              const updates = newOrderedBooks.map((b, i) => ({ bookUrl: b.bookUrl, order: i }));
              await booksDb.updateBooksOrder(updates);
              // 不 setBooks、不派发 refresh：SortableJS 已重排 DOM，仅持久化顺序；下次进入页面会从 DB 刷新
            }}
          />
        </Show>
      </div>

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
    </div>
  );
}

/** 具体分组的书籍列表/网格，与分组页共用书架布局设置 */
function GroupBooksView(props: {
  books: Book[];
  loading: boolean;
  error: string | null;
  viewMode: string;
  titleDisplay: string;
  sortMode: string;
  onOpenBook?: (book: Book) => void;
  onEditBook?: (book: Book) => void;
  onDeleteBook?: (book: Book) => void;
  onBooksReorder?: (newOrderedBooks: Book[]) => void | Promise<void>;
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
          sortMode={props.sortMode}
          onOpenBook={props.onOpenBook}
          onEditBook={props.onEditBook}
          onDeleteBook={props.onDeleteBook}
          onBooksReorder={props.onBooksReorder}
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

/** 长按/右键触发上下文菜单的包装逻辑（与分组管理一致） */
const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10;

function useLongPressContextMenu(triggerRef: () => HTMLElement | null) {
  let pressStartTime = 0;
  let pressStartX = 0;
  let pressStartY = 0;
  let hasMoved = false;
  let longPressTimer: number | null = null;
  let longPressTriggered = false;
  let contextMenuTriggered = false;

  const onPointerDown = (e: MouseEvent | TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    if ('button' in e && e.button !== 0) return;
    pressStartTime = Date.now();
    pressStartX = clientX;
    pressStartY = clientY;
    hasMoved = false;
    longPressTriggered = false;
    contextMenuTriggered = false;
    longPressTimer = window.setTimeout(() => {
      if (!hasMoved) longPressTriggered = true;
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: MouseEvent | TouchEvent) => {
    if (pressStartTime === 0) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    const dist = Math.sqrt((clientX - pressStartX) ** 2 + (clientY - pressStartY) ** 2);
    if (dist > MOVE_THRESHOLD && longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (dist > MOVE_THRESHOLD) hasMoved = true;
  };

  const onPointerUp = (e: MouseEvent | TouchEvent) => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    const el = triggerRef();
    if (longPressTriggered && !hasMoved && el) {
      const clientX = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientY : (e as MouseEvent).clientY;
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY }));
      contextMenuTriggered = true;
      // 延迟重置，确保 onClick 事件能检测到
      setTimeout(() => {
        contextMenuTriggered = false;
      }, 100);
    }
    pressStartTime = 0;
    hasMoved = false;
    longPressTriggered = false;
  };

  const shouldPreventClick = () => contextMenuTriggered;

  return { onPointerDown, onPointerMove, onPointerUp, shouldPreventClick };
}

/** 书籍列表/网格，复用书架布局的视图模式与间距；仅当 sortMode === 'manual' 时启用 SortableJS 拖动排序 */
function BooksGrid(props: {
  books: Book[];
  viewMode: string;
  titleDisplay: string;
  sortMode: string;
  onOpenBook?: (book: Book) => void;
  onEditBook?: (book: Book) => void;
  onDeleteBook?: (book: Book) => void;
  onBooksReorder?: (newOrderedBooks: Book[]) => void | Promise<void>;
}) {
  const spacing = () => bookshelfLayoutStore.settings.spacing * 0.25;
  let gridRef: HTMLDivElement | null = null;
  let sortableInstance: Sortable | null = null;

  const gridClass = createMemo(() => {
    const mode = props.viewMode;
    const gap = mode.startsWith('grid-') ? '' : mode === 'list' || mode === 'list-2' ? 'gap-3' : 'gap-2';
    const cols =
      mode === 'list' || mode === 'compact' ? 'grid-cols-1'
        : mode === 'list-2' || mode === 'compact-2' ? 'grid-cols-1 md:grid-cols-2'
          : mode === 'grid-2' ? 'grid-cols-2'
            : mode === 'grid-3' ? 'grid-cols-3'
              : mode === 'grid-4' ? 'grid-cols-4'
                : mode === 'grid-5' ? 'grid-cols-5'
                  : mode === 'grid-6' ? 'grid-cols-6'
                    : 'grid-cols-1';
    return cn('grid', cols, gap);
  });

  const cardLayout = (): 'list' | 'compact' | 'grid' =>
    props.viewMode === 'list' || props.viewMode === 'list-2' ? 'list'
      : props.viewMode === 'compact' || props.viewMode === 'compact-2' ? 'compact'
        : 'grid';

  const gridStyle = () =>
    props.viewMode.startsWith('grid-') ? { gap: `${spacing()}rem` } : undefined;

  createEffect(() => {
    const manual = props.sortMode === 'manual';
    const container = gridRef;
    const books = props.books;

    if (!manual || !container || books.length === 0) {
      if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
      }
      return;
    }

    if (sortableInstance && sortableInstance.el === container) return;

    if (sortableInstance) {
      sortableInstance.destroy();
      sortableInstance = null;
    }

    sortableInstance = Sortable.create(container, {
      animation: 150,
      ghostClass: 'opacity-50',
      forceFallback: true,
      fallbackOnBody: true,
      onEnd: (evt) => {
        const { oldIndex, newIndex } = evt;
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex || !props.onBooksReorder) return;
        const list = [...props.books];
        const [removed] = list.splice(oldIndex, 1);
        list.splice(newIndex, 0, removed);
        const newOrderedBooks = list.map((b, i) => ({ ...b, order: i }));
        props.onBooksReorder(newOrderedBooks);
      },
    });

    onCleanup(() => {
      if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
      }
    });
  });

  return (
    <div
      ref={(el) => { gridRef = el; }}
      class={gridClass()}
      style={gridStyle()}
    >
      <For each={props.books}>
        {(book) => {
          let triggerEl: HTMLDivElement | null = null;
          const { onPointerDown, onPointerMove, onPointerUp, shouldPreventClick } = useLongPressContextMenu(() => triggerEl);
          return (
            <BookCardWithMenu
              book={book}
              layout={cardLayout()}
              titleDisplay={props.titleDisplay}
              triggerRef={(el) => { triggerEl = el; }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              shouldPreventClick={shouldPreventClick}
              onOpenBook={props.onOpenBook}
              onEditBook={props.onEditBook}
              onDeleteBook={props.onDeleteBook}
            />
          );
        }}
      </For>
    </div>
  );
}

/** 单本书卡片 + 右键/长按菜单（编辑、删除） */
function BookCardWithMenu(props: {
  book: Book;
  layout: 'list' | 'compact' | 'grid';
  titleDisplay: string;
  triggerRef: (el: HTMLDivElement | null) => void;
  onPointerDown: (e: MouseEvent | TouchEvent) => void;
  onPointerMove: (e: MouseEvent | TouchEvent) => void;
  onPointerUp: (e: MouseEvent | TouchEvent) => void;
  shouldPreventClick: () => boolean;
  onOpenBook?: (book: Book) => void;
  onEditBook?: (book: Book) => void;
  onDeleteBook?: (book: Book) => void;
}) {
  const cardClass = () =>
    props.layout === 'list'
      ? 'flex cursor-pointer items-center gap-4 rounded-xl border border-border/50 bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md'
      : props.layout === 'compact'
        ? 'flex cursor-pointer items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2 transition-all hover:border-primary/30 hover:bg-accent/30'
        : 'group/card flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-border/50 bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md';

  return (
    <ContextMenu>
      <ContextMenuTrigger
        as="div"
        ref={props.triggerRef}
        onMouseDown={(e: MouseEvent) => props.onPointerDown(e)}
        onMouseMove={(e: MouseEvent) => props.onPointerMove(e)}
        onMouseUp={(e: MouseEvent) => props.onPointerUp(e)}
        onMouseLeave={() => { }}
        onTouchStart={(e: TouchEvent) => props.onPointerDown(e)}
        onTouchMove={(e: TouchEvent) => props.onPointerMove(e)}
        onTouchEnd={(e: TouchEvent) => props.onPointerUp(e)}
        class={cardClass()}
        onClick={(e: MouseEvent) => {
          if (props.shouldPreventClick()) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          props.onOpenBook?.(props.book);
        }}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            props.onOpenBook?.(props.book);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div class={
          props.layout === 'grid'
            ? 'flex w-full aspect-3/4 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/50'
            : props.layout === 'compact'
              ? 'h-14 aspect-3/4 shrink-0 overflow-hidden rounded-md bg-muted/50'
              : 'h-20 aspect-3/4 shrink-0 overflow-hidden rounded-lg bg-muted/50'
        }>
          <Show when={props.book.customCoverUrl || props.book.coverUrl} fallback={<span class="flex h-full w-full items-center justify-center text-2xl">📖</span>}>
            <img
              src={props.book.customCoverUrl || props.book.coverUrl || ''}
              alt=""
              class="h-full w-full object-cover"
              draggable={false}
            />
          </Show>
        </div>
        <Show when={props.layout === 'grid' ? props.titleDisplay === 'show' : props.titleDisplay !== 'hide'}>
          {props.layout === 'grid' ? (
            <>
              <h3 class="w-full truncate text-center text-sm font-semibold text-foreground">{props.book.name}</h3>
              <p class="text-xs text-muted-foreground truncate w-full text-center">{props.book.author ?? '—'}</p>
            </>
          ) : (
            <div class="flex min-w-0 flex-1 items-center gap-3">
              <div class="shrink-0 min-w-0 max-w-[40%] text-left">
                <h3 class="truncate font-semibold text-foreground">{props.book.name}</h3>
                <p class={cn(
                  "text-muted-foreground truncate",
                  props.layout === 'list' ? "text-sm" : "text-xs"
                )}>{props.book.author ?? '—'}</p>
              </div>
              <Show when={props.book.intro}>
                <p class={cn(
                  "min-w-0 flex-1 text-left text-xs text-muted-foreground",
                  props.layout === 'list' ? "line-clamp-4" : "line-clamp-2"
                )}>{props.book.intro}</p>
              </Show>
            </div>
          )}
        </Show>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => props.onEditBook?.(props.book)}>编辑</ContextMenuItem>
        <ContextMenuItem onSelect={() => props.onDeleteBook?.(props.book)}>删除</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
