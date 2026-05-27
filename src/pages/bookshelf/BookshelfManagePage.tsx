/**
 * 书架管理：多选列表 + 批量操作（对齐 legado BookshelfManageActivity）
 */

import {
  createSignal,
  createMemo,
  createEffect,
  For,
  Show,
  onMount,
  onCleanup,
} from 'solid-js';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import * as booksDb from '@/lib/database/books';
import * as groupsDb from '@/lib/database/book-groups';
import {
  formatBookshelfManageFilterSummary,
  loadBookshelfManagePrefs,
  saveBookshelfManagePrefs,
} from '@/lib/bookshelf/bookshelf-manage-prefs';
import { filterBookshelfManageBooks } from '@/lib/search/search-filters';
import {
  loadBookshelfManageSubPageMode,
  saveBookshelfManageSubPageMode,
  type SearchMode,
} from '@/lib/search/search-prefs';
import { BookshelfManageFilterDialog } from '@/components/bookshelf/BookshelfManageFilterDialog';
import { BookCoverImg } from '@/components/books/BookCoverImg';
import {
  bookshelfBookCustomGroupIds,
  formatBookshelfBookGroupNames,
  getBookshelfBookSourceName,
} from '@/lib/bookshelf/book-source-name';
import { cn } from '@/lib/utils';
import {
  bookshelfCompactCoverClass,
  bookshelfCompactListRowClass,
  bookshelfCompactMainClass,
  bookshelfRowSubtitleClass,
  bookshelfRowTitleClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { mainShellPageRoot, mainShellPageScroll } from '@/lib/ui/viewport-classes';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import {
  BookshelfManagePageToolbar,
  BookshelfManageToolbarLeading,
} from '@/components/bookshelf/BookshelfManagePageToolbar';
import { BookGroupPickDialog } from '@/components/bookshelf/BookGroupPickDialog';
import { BookGroupFormDialog } from '@/components/bookshelf/BookGroupFormDialog';
import {
  BookCoverPreviewDialog,
} from '@/components/books/BookCoverPreviewDialog';
import { BookCoverPreviewButton } from '@/components/books/BookCoverPreviewButton';
import { sourcesStore } from '@/stores/sources';
import { BookEditDialog } from '@/components/books/BookEditDialog';
import { DeleteBookDialog } from '@/components/books/DeleteBookDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuTrigger,
} from '@/components/shared/AppContextMenu';
import {
  AppDropdownMenu,
  AppDropdownMenuButtonTrigger,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { ChevronDownIcon, BookCoverIcon } from '@/components/shared/icons';
import { showAppToast } from '@/components/shared/AppToasts';
import { getSource } from '@/lib/database/sources';
import type { Book, BookGroup } from '@/types';

const BATCH_MENU_TRIGGER_CLASS = 'gap-1.5 group/trigger';
const BATCH_MENU_CHEVRON_CLASS =
  'h-4 w-4 shrink-0 opacity-50 transition-transform duration-200 group-data-expanded/trigger:rotate-180';

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
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    if ('button' in e && (e as MouseEvent).button !== 0) return;
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
      const clientX =
        'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientX : (e as MouseEvent).clientX;
      const clientY =
        'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientY : (e as MouseEvent).clientY;
      el.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY })
      );
      contextMenuTriggered = true;
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

export interface BookshelfManagePageProps {
  onClose?: () => void;
  onOpenBook?: (book: Book) => void;
  onOpenBookInfo?: (book: Book) => void;
}

export function BookshelfManagePage(props: BookshelfManagePageProps) {
  const [books, setBooks] = createSignal<Book[]>([]);
  const [userGroups, setUserGroups] = createSignal<BookGroup[]>([]);
  const [sourceNames, setSourceNames] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [searchMode, setSearchMode] = createSignal<SearchMode>('name');
  const [filterByBookGroup, setFilterByBookGroup] = createSignal(false);
  const [filterBySource, setFilterBySource] = createSignal(false);
  const [appliedBookGroupIds, setAppliedBookGroupIds] = createSignal<number[]>([]);
  const [appliedSourceNames, setAppliedSourceNames] = createSignal<string[]>([]);
  const [filterDialogOpen, setFilterDialogOpen] = createSignal(false);
  const [openInfoByTitle, setOpenInfoByTitle] = createSignal(false);
  const [coverClickPreview, setCoverClickPreview] = createSignal(true);
  const [prefsReady, setPrefsReady] = createSignal(false);
  const [selectedBookUrls, setSelectedBookUrls] = createSignal<Set<string>>(new Set());
  const [bookEditOpen, setBookEditOpen] = createSignal(false);
  const [bookToEdit, setBookToEdit] = createSignal<Book | null>(null);
  const [bookToDelete, setBookToDelete] = createSignal<Book | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = createSignal(false);
  const [batchDeleteCount, setBatchDeleteCount] = createSignal(0);
  const [groupPickOpen, setGroupPickOpen] = createSignal(false);
  const [groupPickMode, setGroupPickMode] = createSignal<'move' | 'add'>('move');
  const [groupPickInitialIds, setGroupPickInitialIds] = createSignal<number[]>([]);
  const [groupPickBook, setGroupPickBook] = createSignal<Book | null>(null);
  const [removeGroupConfirmOpen, setRemoveGroupConfirmOpen] = createSignal(false);
  const [removeGroupBook, setRemoveGroupBook] = createSignal<Book | null>(null);
  const [groupFormOpen, setGroupFormOpen] = createSignal(false);
  const [coverPreviewBook, setCoverPreviewBook] = createSignal<Book | null>(null);

  const showSkeleton = useSkeletonLoading(loading, { delay: 100, minDisplayTime: 300 });

  const userGroupNameMap = createMemo(() => {
    const map = new Map<number, string>();
    for (const g of userGroups()) {
      if (g.groupId > 0) map.set(g.groupId, g.groupName);
    }
    return map;
  });

  const filteredBooks = createMemo(() => {
    const q = searchQuery().trim();
    const mode = searchMode();
    const groupIds = appliedBookGroupIds();
    const selectedSourceNames = appliedSourceNames();
    const nameMap = userGroupNameMap();
    let list = books();
    if (filterByBookGroup() && groupIds.length > 0) {
      list = list.filter((b) => groupIds.some((gid) => gid > 0 && (b.group & gid) !== 0));
    }
    if (filterBySource() && selectedSourceNames.length > 0) {
      list = list.filter((b) => selectedSourceNames.includes(getBookshelfBookSourceName(b)));
    }
    if (q) {
      list = filterBookshelfManageBooks(list, q, mode, (b) => {
        const names: string[] = [];
        for (const [id, name] of nameMap) {
          if ((b.group & id) !== 0) names.push(name);
        }
        return names;
      });
    }
    return list;
  });

  const selectedCount = () => selectedBookUrls().size;
  const filteredSelectedCount = () =>
    filteredBooks().filter((b) => selectedBookUrls().has(b.bookUrl)).length;
  const allFilteredSelected = () =>
    filteredBooks().length > 0 && filteredSelectedCount() === filteredBooks().length;

  const filterConditionText = () =>
    formatBookshelfManageFilterSummary({
      filterByBookGroup: filterByBookGroup(),
      filterBySource: filterBySource(),
      appliedBookGroupIds: appliedBookGroupIds(),
      appliedSourceNames: appliedSourceNames(),
      userGroupNames: userGroupNameMap(),
    });

  const showFilterButton = () => filterByBookGroup() || filterBySource();

  const pageDescription = () => {
    const n = filteredBooks().length;
    if (showFilterButton()) {
      const cond = filterConditionText();
      return cond ? `${cond} · 共 ${n} 本书` : `共 ${n} 本书`;
    }
    return n > 0 ? `共 ${n} 本书` : undefined;
  };

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [allBooks, groups] = await Promise.all([
        booksDb.getAllBooks(),
        groupsDb.getUserGroups(),
      ]);
      const names = buildSourceNamesFromBooks(allBooks);
      setBooks(allBooks);
      setUserGroups(groups);
      setSourceNames(names);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  function buildSourceNamesFromBooks(allBooks: Book[]): string[] {
    return [
      ...new Set(
        allBooks.map((b) => getBookshelfBookSourceName(b)).filter((n) => n.length > 0),
      ),
    ].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }

  async function reloadUserGroups() {
    const groups = await groupsDb.getUserGroups();
    setUserGroups(groups);
  }

  /** 仅更新受影响书籍的 group 字段，避免整表 loadData 导致列表骨架屏重建 */
  function patchBooksGroupField(
    urls: string[],
    resolveNextGroup: (book: Book) => number,
  ): void {
    if (urls.length === 0) return;
    const urlSet = new Set(urls);
    setBooks((prev) =>
      prev.map((b) => {
        if (!urlSet.has(b.bookUrl)) return b;
        const next = resolveNextGroup(b);
        return next === b.group ? b : { ...b, group: next };
      }),
    );
  }

  let bookshelfRefreshFromSelf = false;

  function notifyBookshelfRefresh() {
    bookshelfRefreshFromSelf = true;
    window.dispatchEvent(new CustomEvent('bookshelf-refresh'));
    bookshelfRefreshFromSelf = false;
  }

  onMount(() => {
    void loadData();
    void sourcesStore.loadBookSources();
    void loadBookshelfManagePrefs().then((p) => {
      setFilterByBookGroup(p.filterByBookGroup);
      setFilterBySource(p.filterBySource);
      setOpenInfoByTitle(p.openBookInfoByClickTitle);
      setCoverClickPreview(p.coverClickPreview);
      setPrefsReady(true);
    });
    void loadBookshelfManageSubPageMode().then((mode) => setSearchMode(mode));
    const refresh = () => {
      if (bookshelfRefreshFromSelf) return;
      void loadData();
    };
    window.addEventListener('bookshelf-refresh', refresh);
    onCleanup(() => window.removeEventListener('bookshelf-refresh', refresh));
  });

  createEffect(() => {
    if (!prefsReady()) return;
    void saveBookshelfManagePrefs({
      filterByBookGroup: filterByBookGroup(),
      filterBySource: filterBySource(),
      openBookInfoByClickTitle: openInfoByTitle(),
      coverClickPreview: coverClickPreview(),
    });
  });

  function isSelected(bookUrl: string) {
    return selectedBookUrls().has(bookUrl);
  }

  function toggleBookSelection(bookUrl: string) {
    setSelectedBookUrls((prev) => {
      const next = new Set(prev);
      if (next.has(bookUrl)) next.delete(bookUrl);
      else next.add(bookUrl);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allFilteredSelected()) {
      const next = new Set(selectedBookUrls());
      filteredBooks().forEach((b) => next.delete(b.bookUrl));
      setSelectedBookUrls(next);
    } else {
      const next = new Set(selectedBookUrls());
      filteredBooks().forEach((b) => next.add(b.bookUrl));
      setSelectedBookUrls(next);
    }
  }

  function clearSelection() {
    setSelectedBookUrls(new Set<string>());
  }

  function invertSelection() {
    const current = selectedBookUrls();
    const next = new Set<string>();
    filteredBooks().forEach((b) => {
      if (!current.has(b.bookUrl)) next.add(b.bookUrl);
    });
    setSelectedBookUrls(next);
  }

  /** 当前勾选数 ≥ 2 时可用「选中区间」 */
  const canSelectRangesByPairs = () => selectedCount() >= 2;

  /**
   * 按列表顺序将已勾选项两两成组，各组选中两端及之间的全部书籍。
   * 奇数个已勾选项时，最后一项不参与配对。
   */
  function selectRangesByPairs() {
    if (!canSelectRangesByPairs()) return;
    const list = filteredBooks();
    const selectedIndices: number[] = [];
    list.forEach((b, i) => {
      if (selectedBookUrls().has(b.bookUrl)) selectedIndices.push(i);
    });
    if (selectedIndices.length < 2) return;

    const next = new Set(selectedBookUrls());
    for (let p = 0; p + 1 < selectedIndices.length; p += 2) {
      const lo = Math.min(selectedIndices[p], selectedIndices[p + 1]);
      const hi = Math.max(selectedIndices[p], selectedIndices[p + 1]);
      for (let i = lo; i <= hi; i++) {
        next.add(list[i].bookUrl);
      }
    }
    setSelectedBookUrls(next);
  }

  function selectedBooks(): Book[] {
    const urls = selectedBookUrls();
    return books().filter((b) => urls.has(b.bookUrl));
  }

  function selectedUrls(): string[] {
    return [...selectedBookUrls()];
  }

  async function handleTitleClick(book: Book) {
    if (!openInfoByTitle()) return;
    const source = await getSource(book.origin);
    if (!source) {
      showAppToast({
        title: '无法打开详情',
        description: '未找到对应书源',
        variant: 'destructive',
      });
      return;
    }
    props.onOpenBookInfo?.(book);
  }

  function groupPickTargetBook(book?: Book): Book | null {
    if (book) return book;
    const urls = selectedUrls();
    if (urls.length !== 1) return null;
    return books().find((b) => b.bookUrl === urls[0]) ?? null;
  }

  /** 多本书共有的自定义分组 id（用于加入分组对话框默认勾选） */
  function commonCustomGroupIds(urls: string[]): number[] {
    const selected = books().filter((b) => urls.includes(b.bookUrl));
    if (selected.length === 0) return [];
    let ids = bookshelfBookCustomGroupIds(selected[0], userGroups());
    for (let i = 1; i < selected.length; i++) {
      const cur = new Set(bookshelfBookCustomGroupIds(selected[i], userGroups()));
      ids = ids.filter((id) => cur.has(id));
    }
    return ids;
  }

  /** 移入分组：仅当所选书恰好属于一个自定义分组时预填，否则不勾选 */
  function initialGroupIdsForMove(urls: string[]): number[] {
    if (urls.length === 0) return [];
    if (urls.length === 1) {
      const book = books().find((b) => b.bookUrl === urls[0]);
      if (!book) return [];
      const ids = bookshelfBookCustomGroupIds(book, userGroups());
      return ids.length === 1 ? ids : [];
    }
    const common = commonCustomGroupIds(urls);
    return common.length === 1 ? common : [];
  }

  function openGroupPick(mode: 'move' | 'add', book?: Book) {
    setGroupPickMode(mode);
    setGroupPickBook(book ?? null);
    const target = groupPickTargetBook(book);
    const urls = book ? [book.bookUrl] : selectedUrls();
    let initial: number[] = [];
    if (mode === 'add') {
      if (target) {
        initial = bookshelfBookCustomGroupIds(target, userGroups());
      } else if (urls.length > 1) {
        initial = commonCustomGroupIds(urls);
      }
    } else {
      initial = initialGroupIdsForMove(urls);
    }
    setGroupPickInitialIds(initial);
    setGroupPickOpen(true);
  }

  function openRemoveGroupConfirm(book?: Book) {
    setRemoveGroupBook(book ?? null);
    setRemoveGroupConfirmOpen(true);
  }

  function removeGroupTargetCount(): number {
    const single = removeGroupBook();
    return single ? 1 : selectedCount();
  }

  async function applyGroupPick(groupIds: number[]) {
    const single = groupPickBook();
    const urls = single ? [single.bookUrl] : selectedUrls();
    if (urls.length === 0) return;
    try {
      if (groupPickMode() === 'move') {
        if (groupIds.length === 0) return;
        const mask = groupIds.reduce((m, id) => m | id, 0);
        await booksDb.updateBooksGroupMask(urls, mask);
        patchBooksGroupField(urls, () => mask);
      } else {
        if (groupIds.length === 0) return;
        for (const id of groupIds) {
          await booksDb.addBooksToGroupMask(urls, id);
        }
        patchBooksGroupField(urls, (b) =>
          groupIds.reduce((m, id) => m | id, b.group),
        );
      }
      notifyBookshelfRefresh();
      showAppToast({ title: '分组已更新', variant: 'default' });
    } catch (e) {
      showAppToast({
        title: '操作失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  async function confirmRemoveGroup() {
    const single = removeGroupBook();
    const urls = single ? [single.bookUrl] : selectedUrls();
    if (urls.length === 0) return;
    try {
      await booksDb.updateBooksGroupMask(urls, 0);
      patchBooksGroupField(urls, () => 0);
      notifyBookshelfRefresh();
      showAppToast({ title: '已清除分组', variant: 'default' });
      setRemoveGroupConfirmOpen(false);
      setRemoveGroupBook(null);
    } catch (e) {
      showAppToast({
        title: '操作失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  async function batchAllowUpdate(allow: boolean) {
    const urls = selectedUrls();
    if (urls.length === 0) return;
    try {
      await booksDb.updateBooksCanUpdate(urls, allow);
      await loadData();
      showAppToast({ title: allow ? '已允许更新' : '已禁止更新', variant: 'default' });
    } catch (e) {
      showAppToast({
        title: '操作失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  function openBatchDeleteConfirm() {
    const n = selectedCount();
    if (n > 0) setBatchDeleteCount(n);
  }

  async function handleBatchDeleteConfirm() {
    const list = selectedBooks();
    setBatchDeleteCount(0);
    try {
      for (const b of list) {
        await booksDb.deleteBook(b.bookUrl);
      }
      clearSelection();
      await loadData();
      window.dispatchEvent(new CustomEvent('bookshelf-refresh'));
      showAppToast({ title: `已删除 ${list.length} 本书`, variant: 'default' });
    } catch (e) {
      showAppToast({
        title: '批量删除失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  }

  function stubBatchAction(label: string) {
    showAppToast({ title: label, description: '功能开发中', variant: 'default' });
  }

  function handleExportAllUseBookSource() {
    stubBatchAction('导出所有书的书源');
  }

  return (
    <div class={cn('@container', mainShellPageRoot)}>
      <PageToolbar
        title="书架管理"
        description={pageDescription()}
        titleSlot={
          <PageToolbarTitleDropdown
            title="书架管理"
            description={pageDescription()}
            dropdownEnabled={false}
          />
        }
        leading={<BookshelfManageToolbarLeading onBack={() => props.onClose?.()} />}
      >
        <BookshelfManagePageToolbar
          searchQuery={searchQuery()}
          onSearchQueryChange={setSearchQuery}
          searchMode={searchMode()}
          onSearchModeChange={(mode) => {
            setSearchMode(mode);
            void saveBookshelfManageSubPageMode(mode);
          }}
          showFilterButton={showFilterButton()}
          filterTooltip={filterConditionText()}
          onOpenFilterDialog={() => setFilterDialogOpen(true)}
          filterByBookGroup={filterByBookGroup()}
          onFilterByBookGroupChange={setFilterByBookGroup}
          filterBySource={filterBySource()}
          onFilterBySourceChange={setFilterBySource}
          openBookInfoByClickTitle={openInfoByTitle()}
          onOpenBookInfoByClickTitleChange={setOpenInfoByTitle}
          coverClickPreview={coverClickPreview()}
          onCoverClickPreviewChange={setCoverClickPreview}
          onExportAllUseBookSource={handleExportAllUseBookSource}
        />
      </PageToolbar>

      <BookshelfManageFilterDialog
        open={filterDialogOpen()}
        onOpenChange={setFilterDialogOpen}
        filterByBookGroup={filterByBookGroup()}
        filterBySource={filterBySource()}
        userGroups={userGroups()}
        sourceNames={sourceNames()}
        appliedBookGroupIds={appliedBookGroupIds()}
        appliedSourceNames={appliedSourceNames()}
        onApply={(groupIds, names) => {
          setAppliedBookGroupIds(groupIds);
          setAppliedSourceNames(names);
        }}
      />

      <div class={cn(mainShellPageScroll, 'space-y-4 pb-4')}>
        <Show when={error()}>
          <p class="text-sm text-destructive">{error()}</p>
        </Show>
        <Show when={showSkeleton()}>
          <ul class="space-y-2">
            <For each={[1, 2, 3, 4, 5]}>
              {() => (
                <li class="flex h-18 items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-1 animate-pulse">
                  <span class="h-4 w-4 rounded bg-muted" />
                  <span class="h-full aspect-3/4 w-auto shrink-0 rounded-md bg-muted" />
                  <div class="min-w-0 flex-1 space-y-1">
                    <span class="block h-3.5 w-1/2 rounded bg-muted" />
                    <span class="block h-2.5 w-1/4 rounded bg-muted" />
                    <span class="block h-2.5 w-full rounded bg-muted" />
                    <span class="block h-2.5 w-2/3 rounded bg-muted" />
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <Show when={!loading() && !showSkeleton() && filteredBooks().length === 0}>
          <div class="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
            <p>暂无书籍</p>
          </div>
        </Show>

        <Show when={!loading() && !showSkeleton() && filteredBooks().length > 0}>
          <ul class="space-y-2">
            <For each={filteredBooks()}>
              {(book) => {
                let triggerEl: HTMLDivElement | null = null;
                const { onPointerDown, onPointerMove, onPointerUp, shouldPreventClick } =
                  useLongPressContextMenu(() => triggerEl);

                return (
                  <li class="w-full">
                    <AppContextMenu>
                      <AppContextMenuTrigger
                        as="div"
                        ref={(el) => {
                          triggerEl = el;
                        }}
                        class={cn(
                          bookshelfCompactListRowClass('select-none'),
                          'cursor-pointer min-w-0 text-left',
                        )}
                        onMouseDown={onPointerDown}
                        onMouseMove={onPointerMove}
                        onMouseUp={onPointerUp}
                        onTouchStart={onPointerDown}
                        onTouchMove={onPointerMove}
                        onTouchEnd={onPointerUp}
                        onClick={(e: MouseEvent) => {
                          if (shouldPreventClick()) {
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                          }
                          toggleBookSelection(book.bookUrl);
                        }}
                      >
                        <div
                          class="flex h-full shrink-0 items-center"
                          onClick={(e) => e.stopPropagation()}
                          role="presentation"
                        >
                          <Checkbox
                            checked={isSelected(book.bookUrl)}
                            onChange={(checked: boolean) => {
                              const next = new Set(selectedBookUrls());
                              if (checked) next.add(book.bookUrl);
                              else next.delete(book.bookUrl);
                              setSelectedBookUrls(next);
                            }}
                            aria-label={`选择 ${book.name}`}
                          />
                        </div>
                        <Show
                          when={coverClickPreview()}
                          fallback={
                            <div
                              class={bookshelfCompactCoverClass()}
                              role="presentation"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <BookCoverImg
                                src={book.customCoverUrl || book.coverUrl}
                                referer={book.origin}
                                source={sourcesStore.getBookSource(book.origin)}
                                bookUrl={book.bookUrl}
                                alt=""
                                class="h-full w-full object-cover"
                                fallback={
                                  <span class="flex h-full w-full items-center justify-center">
                                    <BookCoverIcon class="h-6 w-6 text-muted-foreground" />
                                  </span>
                                }
                              />
                            </div>
                          }
                        >
                          <BookCoverPreviewButton
                            class={bookshelfCompactCoverClass()}
                            coverUrl={book.coverUrl}
                            customCoverUrl={book.customCoverUrl}
                            bookUrl={book.bookUrl}
                            origin={book.origin}
                            source={sourcesStore.getBookSource(book.origin)}
                            name={book.name}
                            onPreview={() => setCoverPreviewBook(book)}
                            fallback={
                              <span class="flex h-full w-full items-center justify-center">
                                <BookCoverIcon class="h-6 w-6 text-muted-foreground" />
                              </span>
                            }
                          />
                        </Show>
                        <div class={bookshelfCompactMainClass()}>
                          <div class="flex min-w-0 items-center gap-1 overflow-hidden">
                            <Show
                              when={openInfoByTitle()}
                              fallback={
                                <span class={bookshelfRowTitleClass(true, 'min-w-0')}>
                                  {book.name}
                                </span>
                              }
                            >
                              <button
                                type="button"
                                class={cn(
                                  bookshelfRowTitleClass(true, 'min-w-0 shrink text-left'),
                                  'hover:underline',
                                )}
                                onClick={(e: MouseEvent) => {
                                  e.stopPropagation();
                                  void handleTitleClick(book);
                                }}
                              >
                                {book.name}
                              </button>
                            </Show>
                            <Show when={book.author}>
                              <span class="shrink-0 text-xs text-muted-foreground/70"> · </span>
                              <span class={cn(bookshelfRowSubtitleClass(true), 'min-w-0')}>
                                {book.author}
                              </span>
                            </Show>
                          </div>
                          <p class={bookshelfRowSubtitleClass(true, 'm-0 min-w-0')}>
                            来源：{getBookshelfBookSourceName(book) || '—'}
                          </p>
                          <p class={bookshelfRowSubtitleClass(true, 'm-0 min-w-0')}>
                            分组：{formatBookshelfBookGroupNames(book, userGroups())}
                          </p>
                        </div>
                        <div
                          class="flex h-full shrink-0 items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                          role="presentation"
                        >
                          <Button
                            variant="default"
                            size="sm"
                            type="button"
                            onClick={() => {
                              setBookToEdit(book);
                              setBookEditOpen(true);
                            }}
                          >
                            编辑
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => openGroupPick('move', book)}
                          >
                            分组
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            type="button"
                            onClick={() => {
                              setBookToDelete(book);
                              setDeleteConfirmOpen(true);
                            }}
                          >
                            删除
                          </Button>
                        </div>
                      </AppContextMenuTrigger>
                      <AppContextMenuContent>
                        <AppContextMenuItem
                          onSelect={() => {
                            setBookToEdit(book);
                            setBookEditOpen(true);
                          }}
                        >
                          编辑
                        </AppContextMenuItem>
                        <AppContextMenuItem onSelect={() => openGroupPick('move', book)}>
                          分组
                        </AppContextMenuItem>
                        <AppContextMenuItem
                          class="text-destructive focus:text-destructive"
                          onSelect={() => {
                            setBookToDelete(book);
                            setDeleteConfirmOpen(true);
                          }}
                        >
                          删除
                        </AppContextMenuItem>
                      </AppContextMenuContent>
                    </AppContextMenu>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
      </div>

      {/* 底部固定：批量操作栏（无选中时按钮禁用，分界线上方为可滚动内容） */}
      <div class="shrink-0 border-t border-border px-3 py-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAll}
              disabled={filteredBooks().length === 0}
            >
              {allFilteredSelected() ? '取消全选' : '全选'}({filteredSelectedCount()}/
              {filteredBooks().length})
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection} disabled={selectedCount() === 0}>
              取消选中
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={invertSelection}
              disabled={filteredBooks().length === 0}
            >
              反选
            </Button>
          </div>

          {/* 窄屏：仅「操作」下拉（视口 < 448px，删除并入下拉） */}
          <div class="flex min-[448px]:hidden! items-center gap-2">
            <AppDropdownMenu>
              <AppDropdownMenuTrigger
                as={(props: Record<string, unknown>) => (
                  <AppDropdownMenuButtonTrigger
                    triggerProps={props}
                    variant="outline"
                    size="sm"
                    disabled={selectedCount() === 0}
                    class={BATCH_MENU_TRIGGER_CLASS}
                  >
                    操作
                    <ChevronDownIcon class={BATCH_MENU_CHEVRON_CLASS} />
                  </AppDropdownMenuButtonTrigger>
                )}
              />
              <AppDropdownMenuContent layout="compact">
                <AppDropdownMenuItem onSelect={() => batchAllowUpdate(true)}>允许更新</AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => batchAllowUpdate(false)}>禁止更新</AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => openGroupPick('add')}>加入分组</AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => openGroupPick('move')}>移入分组</AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => openRemoveGroupConfirm()}>移除分组</AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => stubBatchAction('批量换源')}>批量换源</AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => stubBatchAction('清理缓存')}>清理缓存</AppDropdownMenuItem>
                <AppDropdownMenuItem
                  disabled={!canSelectRangesByPairs()}
                  onSelect={() => selectRangesByPairs()}
                >
                  选中区间
                </AppDropdownMenuItem>
                <AppDropdownMenuItem
                  class="text-destructive focus:text-destructive"
                  onSelect={() => openBatchDeleteConfirm()}
                >
                  删除所选
                </AppDropdownMenuItem>
              </AppDropdownMenuContent>
            </AppDropdownMenu>
          </div>
          {/* 紧凑：移入分组 + 更多（448px <= 视口 < xl；删除在所下拉首项） */}
          <div class="hidden min-[448px]:flex xl:hidden! items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={selectedCount() === 0}
              onClick={() => openGroupPick('move')}
            >
              移入分组
            </Button>
            <AppDropdownMenu>
              <AppDropdownMenuTrigger
                as={(props: Record<string, unknown>) => (
                  <AppDropdownMenuButtonTrigger
                    triggerProps={props}
                    variant="outline"
                    size="sm"
                    disabled={selectedCount() === 0}
                    class={BATCH_MENU_TRIGGER_CLASS}
                  >
                    更多
                    <ChevronDownIcon class={BATCH_MENU_CHEVRON_CLASS} />
                  </AppDropdownMenuButtonTrigger>
                )}
              />
              <AppDropdownMenuContent layout="compact">
                <AppDropdownMenuItem
                  class="text-destructive focus:text-destructive"
                  onSelect={() => openBatchDeleteConfirm()}
                >
                  删除所选
                </AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => batchAllowUpdate(true)}>允许更新</AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => batchAllowUpdate(false)}>禁止更新</AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => openGroupPick('add')}>加入分组</AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => openRemoveGroupConfirm()}>移除分组</AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => stubBatchAction('批量换源')}>批量换源</AppDropdownMenuItem>
                <AppDropdownMenuItem onSelect={() => stubBatchAction('清理缓存')}>清理缓存</AppDropdownMenuItem>
                <AppDropdownMenuItem
                  disabled={!canSelectRangesByPairs()}
                  onSelect={() => selectRangesByPairs()}
                >
                  选中区间
                </AppDropdownMenuItem>
              </AppDropdownMenuContent>
            </AppDropdownMenu>
          </div>
          {/* 全部按钮（视口 >= xl 时显示） */}
          <div class="hidden xl:flex! flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => batchAllowUpdate(true)}
              disabled={selectedCount() === 0}
            >
              允许更新
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => batchAllowUpdate(false)}
              disabled={selectedCount() === 0}
            >
              禁止更新
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openGroupPick('add')}
              disabled={selectedCount() === 0}
            >
              加入分组
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openGroupPick('move')}
              disabled={selectedCount() === 0}
            >
              移入分组
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openRemoveGroupConfirm()}
              disabled={selectedCount() === 0}
            >
              移除分组
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => stubBatchAction('批量换源')}
              disabled={selectedCount() === 0}
            >
              批量换源
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => stubBatchAction('清理缓存')}
              disabled={selectedCount() === 0}
            >
              清理缓存
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectRangesByPairs()}
              disabled={!canSelectRangesByPairs()}
            >
              选中区间
            </Button>
            <Button variant="destructive" size="sm" onClick={openBatchDeleteConfirm} disabled={selectedCount() === 0}>
              删除所选
            </Button>
          </div>
        </div>
      </div>

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

      <BookEditDialog
        open={bookEditOpen()}
        onOpenChange={setBookEditOpen}
        book={bookToEdit()}
        onSuccess={() => {
          void loadData();
          window.dispatchEvent(new CustomEvent('bookshelf-refresh'));
        }}
        onError={(msg) => setError(msg)}
      />

      <DeleteBookDialog
        open={deleteConfirmOpen()}
        onOpenChange={setDeleteConfirmOpen}
        book={bookToDelete()}
        onConfirm={async () => {
          const b = bookToDelete();
          if (!b) return;
          await booksDb.deleteBook(b.bookUrl);
          setBookToDelete(null);
          await loadData();
          window.dispatchEvent(new CustomEvent('bookshelf-refresh'));
        }}
      />

      <BookGroupPickDialog
        open={groupPickOpen()}
        onOpenChange={setGroupPickOpen}
        mode={groupPickMode()}
        title={groupPickMode() === 'move' ? '移入分组' : '加入分组'}
        description={
          groupPickMode() === 'move'
            ? '将所选书籍移到另一分组'
            : '将所选书籍加入所选分组'
        }
        groups={userGroups()}
        initialGroupIds={groupPickInitialIds()}
        onConfirm={(ids) => void applyGroupPick(ids)}
        onAddGroup={() => setGroupFormOpen(true)}
      />

      <AppDialog
        open={removeGroupConfirmOpen()}
        onOpenChange={(open) => {
          setRemoveGroupConfirmOpen(open);
          if (!open) setRemoveGroupBook(null);
        }}
      >
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>移除分组</AppDialogTitle>
            <AppDialogDescription>
              确定清除所选 {removeGroupTargetCount()} 本书的分组信息？清除后这些书将不再属于任何自定义分组。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setRemoveGroupConfirmOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void confirmRemoveGroup()}>确定</Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <BookGroupFormDialog
        open={groupFormOpen()}
        onOpenChange={setGroupFormOpen}
        mode="add"
        initialGroup={null}
        onSuccess={() => {
          void reloadUserGroups();
          notifyBookshelfRefresh();
        }}
        onError={(msg) => {
          showAppToast({ title: '添加分组失败', description: msg, variant: 'destructive' });
        }}
      />

      <AppDialog open={batchDeleteCount() > 0} onOpenChange={(open) => !open && setBatchDeleteCount(0)}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>删除所选书籍</AppDialogTitle>
            <AppDialogDescription>
              确定删除所选 {batchDeleteCount()} 本书？删除后无法恢复。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteCount(0)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void handleBatchDeleteConfirm()}>
              删除
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
}
