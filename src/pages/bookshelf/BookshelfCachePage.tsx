/**
 * 缓存 / 导出管理（对齐 Legado CacheActivity）
 */

import {
  createSignal,
  createEffect,
  Show,
  onMount,
  createMemo,
  type Component,
} from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import * as booksDb from '@/lib/database/books';
import * as groupsDb from '@/lib/database/book-groups';
import { isLocalBook } from '@/lib/local-book';
import type { Book, BookGroup } from '@/types';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import {
  FilterIcon,
  MoreIcon,
  PlayIcon,
  RefreshIcon,
  SquareIcon,
} from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import {
  chapterCacheDownloadStore,
  countCachedChapters,
  clearAllCachedChapters,
  deleteCachedChaptersByBook,
  enqueueDownloadAll,
  stopChapterDownload,
  stopAllChapterDownloads,
} from '@/lib/chapter-cache';
import { exportBookAsTxt } from '@/lib/export/export-book';
import { SaveTextFileCancelledError } from '@/lib/export/save-text-file';
import { showAppToast } from '@/components/shared/AppToasts';
import { BookshelfCacheGroupFilterDialog } from '@/components/bookshelf/BookshelfCacheGroupFilterDialog';
import {
  BookshelfCacheBookCard,
  type BookshelfCacheRowState,
} from '@/components/bookshelf/BookshelfCacheBookCard';
import { VirtualBookshelfCacheGrid } from '@/components/bookshelf/VirtualBookshelfCacheGrid';
import { formatBookshelfManageFilterSummary } from '@/lib/bookshelf/bookshelf-manage-prefs';
import { BookGroupId } from '@/types';
import { mainShellPageRoot, mainShellPageScroll } from '@/lib/ui/viewport-classes';
import { BookshelfManageToolbarLeading } from '@/components/bookshelf/BookshelfManagePageToolbar';
import { Button } from '@/components/ui/button';
import {
  AppDropdownMenu,
  AppDropdownMenuButtonTrigger,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';

export interface BookshelfCachePageProps {
  groupId: number;
  /** 当前书架分组名（与 Explore 页头一致，由入口传入） */
  groupName?: string;
  onBack: () => void;
}

export function BookshelfCachePage(props: BookshelfCachePageProps) {
  const [rows, setRows] = createStore<BookshelfCacheRowState[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [exportingUrl, setExportingUrl] = createSignal<string | null>(null);
  const [appliedGroupIds, setAppliedGroupIds] = createSignal<number[]>(
    props.groupId > 0 ? [props.groupId] : [],
  );
  const [userGroups, setUserGroups] = createSignal<BookGroup[]>([]);
  const [filterDialogOpen, setFilterDialogOpen] = createSignal(false);

  const onlineBooks = createMemo(() =>
    rows.map((r) => r.book).filter((b) => !isLocalBook(b)),
  );

  const groupDownloading = createMemo(() => {
    const urls = new Set(rows.map((r) => r.book.bookUrl));
    return chapterCacheDownloadStore.state.activeBookUrls.some((u) => urls.has(u));
  });

  function findRowIndex(bookUrl: string): number {
    return rows.findIndex((r) => r.book.bookUrl === bookUrl);
  }

  const userGroupNameMap = createMemo(() => {
    const m = new Map<number, string>();
    for (const g of userGroups()) {
      if (g.groupId > 0) m.set(g.groupId, g.groupName);
    }
    return m;
  });

  const groupTitle = () =>
    formatBookshelfManageFilterSummary({
      filterByBookGroup: true,
      filterBySource: false,
      appliedBookGroupIds: appliedGroupIds(),
      appliedSourceNames: [],
      userGroupNames: userGroupNameMap(),
    }).replace(/^分组：/, '') || '全部';

  async function loadBooksForAppliedGroups(groupIds: number[]): Promise<Book[]> {
    if (groupIds.length === 0) {
      return booksDb.getBooksByGroup(BookGroupId.All);
    }
    const byUrl = new Map<string, Book>();
    for (const gid of groupIds) {
      const list = await booksDb.getBooksByGroup(gid);
      for (const book of list) {
        if (!byUrl.has(book.bookUrl)) byUrl.set(book.bookUrl, book);
      }
    }
    return [...byUrl.values()];
  }

  const CacheAllHeaderIcon: Component<{ class?: string }> = (iconProps) => (
    <Show when={groupDownloading()} fallback={<PlayIcon class={iconProps.class} size={20} />}>
      <SquareIcon class={iconProps.class} size={20} />
    </Show>
  );

  async function refreshBookCached(bookUrl: string) {
    const cached = await countCachedChapters(bookUrl);
    const i = findRowIndex(bookUrl);
    if (i < 0) return;
    setRows(i, { cached, downloadPercent: null });
  }

  async function refreshCounts(books: Book[]): Promise<void> {
    const next: BookshelfCacheRowState[] = [];
    for (const book of books) {
      if (isLocalBook(book)) continue;
      const cached = await countCachedChapters(book.bookUrl);
      const total = book.totalChapterNum ?? 0;
      next.push({ book, cached, total, downloadPercent: null });
    }
    setRows(reconcile(next));
  }

  async function loadBooks() {
    setLoading(true);
    try {
      const list = await loadBooksForAppliedGroups(appliedGroupIds());
      await refreshCounts(list);
    } catch (e) {
      showAppToast({
        title: '加载失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  onMount(() => {
    void groupsDb.getUserGroups().then(setUserGroups);
  });

  createEffect(() => {
    setAppliedGroupIds(props.groupId > 0 ? [props.groupId] : []);
  });

  createEffect(() => {
    appliedGroupIds();
    void loadBooks();
  });

  /** 将队列进度同步到行数据（虚拟列表内子组件对 store 嵌套键订阅不可靠） */
  createEffect(() => {
    const activeUrls = chapterCacheDownloadStore.state.activeBookUrls;
    const progressByBook = chapterCacheDownloadStore.state.progressByBook;
    for (const url of activeUrls) {
      const p = progressByBook[url];
      if (p) {
        void p.done;
        void p.total;
      }
    }

    const activeSet = new Set(activeUrls);
    for (let i = 0; i < rows.length; i++) {
      const url = rows[i].book.bookUrl;
      const p = progressByBook[url];
      if (activeSet.has(url) && p) {
        const pct =
          p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : null;
        const cached = Math.max(rows[i].cached, p.done);
        if (rows[i].cached !== cached || rows[i].downloadPercent !== pct) {
          setRows(i, { cached, downloadPercent: pct });
        }
      } else if (rows[i].downloadPercent !== null) {
        setRows(i, 'downloadPercent', null);
      }
    }
  });

  /** 某本书离开下载队列后，再从 DB 校准缓存章数 */
  let prevActiveBookUrls = new Set<string>();
  createEffect(() => {
    const active = new Set(chapterCacheDownloadStore.state.activeBookUrls);
    for (const url of prevActiveBookUrls) {
      if (!active.has(url)) void refreshBookCached(url);
    }
    prevActiveBookUrls = active;
  });

  const handleDownloadAllGroup = () => {
    for (const book of onlineBooks()) {
      enqueueDownloadAll(book);
    }
    showAppToast({ title: '已开始缓存当前分组书籍' });
  };

  const handleStopAll = () => {
    stopAllChapterDownloads();
    showAppToast({ title: '已停止全部缓存任务' });
  };

  const toggleDownloadAllGroup = () => {
    if (groupDownloading()) handleStopAll();
    else handleDownloadAllGroup();
  };

  const handleClearAll = async () => {
    if (!confirm('确定清除全部章节缓存？')) return;
    stopAllChapterDownloads();
    await clearAllCachedChapters();
    await loadBooks();
    showAppToast({ title: '已清除全部章节缓存' });
  };

  const toggleBookDownload = (book: Book) => {
    if (chapterCacheDownloadStore.isBookActive(book.bookUrl)) {
      stopChapterDownload(book.bookUrl);
      return;
    }
    enqueueDownloadAll(book);
  };

  const handleExportBook = async (book: Book) => {
    setExportingUrl(book.bookUrl);
    try {
      await exportBookAsTxt(book, { fetchMissing: false, onlyCached: true });
      showAppToast({ title: `已导出：${book.name}` });
    } catch (e) {
      if (e instanceof SaveTextFileCancelledError) return;
      showAppToast({
        title: '导出失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setExportingUrl(null);
    }
  };

  const handleClearBook = async (book: Book) => {
    stopChapterDownload(book.bookUrl);
    await deleteCachedChaptersByBook(book);
    const i = findRowIndex(book.bookUrl);
    if (i >= 0) setRows(i, { cached: 0, downloadPercent: null });
    showAppToast({ title: `已清除：${book.name}` });
  };

  const handleApplyGroupFilter = (groupIds: number[]) => {
    setAppliedGroupIds(groupIds);
  };

  return (
    <div class={mainShellPageRoot}>
      <PageToolbar
        title="离线缓存"
        description={groupTitle()}
        titleSlot={
          <PageToolbarTitleDropdown
            title="离线缓存"
            description={groupTitle()}
            dropdownEnabled={false}
          />
        }
        leading={<BookshelfManageToolbarLeading onBack={props.onBack} />}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleDownloadAllGroup}
          aria-label={groupDownloading() ? '停止全部' : '缓存全部分组'}
          type="button"
        >
          <CacheAllHeaderIcon class="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setFilterDialogOpen(true)}
          aria-label={`筛选：${groupTitle()}`}
          type="button"
        >
          <FilterIcon class="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void loadBooks()}
          disabled={loading()}
          aria-label="刷新"
          type="button"
        >
          <RefreshIcon class="h-4 w-4" />
        </Button>
        <AppDropdownMenu>
          <AppDropdownMenuTrigger
            as={(triggerProps: Record<string, unknown>) => (
              <AppDropdownMenuButtonTrigger
                triggerProps={triggerProps}
                variant="ghost"
                size="icon"
                aria-label="更多"
              >
                <MoreIcon class="h-4 w-4" />
              </AppDropdownMenuButtonTrigger>
            )}
          />
          <AppDropdownMenuContent layout="compact">
            <AppDropdownMenuItem onSelect={() => void handleClearAll()}>
              清除全部缓存
            </AppDropdownMenuItem>
          </AppDropdownMenuContent>
        </AppDropdownMenu>
      </PageToolbar>

      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col')}>
        <Show when={loading()}>
          <p class="px-4 py-8 text-center text-sm text-muted-foreground">加载中…</p>
        </Show>
        <Show when={!loading() && rows.length === 0}>
          <p class="px-4 py-8 text-center text-sm text-muted-foreground">
            当前分组没有可缓存的在线书籍。
          </p>
        </Show>
        <Show when={!loading() && rows.length > 0}>
          <VirtualBookshelfCacheGrid items={rows} class="flex-1 py-2">
            {(row, index) => (
              <BookshelfCacheBookCard
                rows={rows}
                rowIndex={index}
                exporting={exportingUrl() === row.book.bookUrl}
                onToggleDownload={() => toggleBookDownload(row.book)}
                onExport={() => void handleExportBook(row.book)}
                onClear={() => void handleClearBook(row.book)}
              />
            )}
          </VirtualBookshelfCacheGrid>
        </Show>
      </div>

      <BookshelfCacheGroupFilterDialog
        open={filterDialogOpen()}
        onOpenChange={setFilterDialogOpen}
        userGroups={userGroups()}
        appliedGroupIds={appliedGroupIds()}
        onApply={handleApplyGroupFilter}
      />
    </div>
  );
}
