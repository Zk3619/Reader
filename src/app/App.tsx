import { createSignal, createEffect, createResource, For, Match, Show, Switch, onMount, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { Navigation, type PageType } from "@/components/shell/Navigation";
import { PageToolbar } from "@/components/shell/PageToolbar";
import { PageToolbarTitleDropdown } from "@/components/shell/PageToolbarTitleDropdown";
import { SourcesPageToolbar } from "@/components/sources/SourcesPageToolbar";
import { SourcesFilterDialog } from "@/components/sources/SourcesFilterDialog";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { SideBar } from "@/components/shell/SideBar";
import { BottomBar } from "@/components/shell/BottomBar";
import {
  AppBackNavigationBridge,
  type BackLayerDefinition,
} from "@/components/shell/AppBackNavigationBridge";
import { Tray } from "@/components/shell/Tray";
import { SplashScreen } from "@/components/shell/SplashScreen";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { BookShelf } from "@/pages/bookshelf/BookShelfPage";
import { BookshelfCachePage } from "@/pages/bookshelf/BookshelfCachePage";
import { SourcesPage } from "@/pages/sources/SourcesPage";
import { SourcesManagePage } from "@/pages/sources/SourcesManagePage";
import { SourceEditPage } from "@/pages/sources/SourceEditPage";
import { ExploreSourcePage } from "@/pages/explore/ExploreSourcePage";
import { ExplorePage } from "@/pages/explore/ExplorePage";
import { BookInfoPage } from "@/pages/book-info/BookInfoPage";
import { BookInfoDrawer } from "@/pages/book-info/BookInfoDrawer";
import { BookGroupManage } from "@/pages/bookshelf/BookGroupManagePage";
import { BookshelfManagePage } from "@/pages/bookshelf/BookshelfManagePage";
import { BookSearchPage, formatSourceScope } from "@/pages/bookshelf/BookSearchPage";
import { bookToSearchBook } from "@/lib/bookshelf/book-to-search-book";
import {
  BookReader,
  ImageViewerPage,
  AudioViewerPage,
  VideoViewerPage,
  FileViewerPage,
} from "@/pages/viewer";
import { BookmarkPage } from "@/pages/bookmark/BookmarkPage";
import { ReadRecordPage } from "@/pages/record/ReadRecordPage";
import {
  READER_MEDIA_TEXT_FALLBACK_EVENT,
  type ReaderMediaTextFallbackDetail,
} from "@/lib/media/text/reader-media-messages";
import { MediaKind, resolveMediaKindWithSource } from "@/lib/book-source/book-type";
import { searchBookToEphemeralBook } from "@/lib/bookshelf/book-to-search-book";
import {
  mediaViewerPageForKind,
  NON_TEXT_MEDIA_VIEWER_PAGES,
  normalizeMediaViewerPage,
  type MediaViewerPage,
} from "@/lib/book-source/media-viewer";
import { RemoteBookPage } from "@/pages/remote-book/RemoteBookPage";
import { AddBookByUrlDialog } from "@/components/books/AddBookByUrlDialog";
import { ImportSourceNetworkDialog } from "@/components/sources/ImportSourceNetworkDialog";
import { ImportSourceLocalDialog } from "@/components/sources/ImportSourceLocalDialog";
import { ImportBookLocalDialog } from "@/components/books/ImportBookLocalDialog";
import { ImportSourceQrDialog } from "@/components/sources/ImportSourceQrDialog";
import { ImportSourceSelectDialog } from "@/components/sources/ImportSourceSelectDialog";
import { SourceGroupManageDialog } from "@/components/sources/SourceGroupManageDialog";
import { bookshelfStore } from "@/stores/bookshelf";
import { sourcesStore } from "@/stores/sources";
import { textViewerStore, viewerStore } from "@/stores/viewer";
import { initBookshelfLayoutSettings } from "@/stores/bookshelf-layout";
import type { Book, BookSource, NewBookSource, SearchBook } from "@/types";
import { ReaderGuestAddToShelfDialog } from "@/components/viewer/text-viewer/ReaderGuestAddToShelfDialog";
import {
  freezeMediaViewerChromeAutoHide,
  resumeMediaViewerChromeAutoHide,
} from "@/lib/media/media-viewer-chrome-auto-hide-registry";
import { publishActiveOverlayLayer } from "@/lib/ui/overlay-layer-active";
import { APP_TOAST_Z } from "@/lib/ui/overlay-z";
import { scheduleOverlayPositionSync } from "@/lib/ui/overlay-position-sync";
import { addSearchBookToShelf } from "@/lib/bookshelf/save-book-to-shelf";
import { getReaderProgressSnapshot } from "@/lib/bookshelf/reading-progress-snapshot";
import { getAllSourceGroups, getSource } from "@/lib/database/sources";
import {
  openExploreSectionInInnerWeb,
  shouldOpenExplorePageForSection,
} from "@/lib/book-source/explore-section-action";
import { ShellLayoutProvider, useShellLayout } from "@/components/shell/ShellLayoutProvider";
import { cn } from "@/lib/utils";
import {
  mainShellInset,
  mainShellPageRoot,
  mainShellPageScroll,
  mainShellTabEnterClass,
} from "@/lib/ui/viewport-classes";
import { Toaster } from "@/components/ui/sonner";
import { showAppToast, DEFAULT_TOAST_DURATION, SonnerInteractionFix, appToastHostStyle, createAppToastIcons, getAppToastVisibleLimit } from "@/components/shared/AppToasts";
import { initDatabase } from "@/lib/database";
import { clearAppDataDirCache } from "@/lib/platform/app-data-dir";
import { isDesktopTauri } from "@/lib/platform/webview-storage";
import { setupWindowStateListeners } from "@/utils/window-state";
import { settingsStore } from "@/stores/settings";
import { applyThemeToDocument } from "@/lib/theme";
import { getBook, getBookByNameAndAuthor, hasBook } from "@/lib/database/books";
import { getRecentReadBooks, type RecentReadBook } from "@/lib/bookshelf/recent-reading";
import {
  importLocalBook,
  importLocalBookFromContent,
  isAndroidContentUri,
  pickLocalBookFiles,
  type LocalBookPickResult,
} from "@/lib/local-book";
import { pickLocalBookDirectory } from "@/lib/local-book/pick-local-book-directory";
import {
  copyFileToBooksDir,
  copyWebFileToBooksDir,
  getBooksDirectory,
  moveFileToBooksDir,
  moveWebFileToBooksDir,
  needsImportBookActionPrompt,
  needsImportFileActionSelection,
  resolveTauriImportTarget,
} from "@/lib/local-book/import";
import {
  getManagedBooksRoot,
  sanitizeManagedFileName,
  usesSafTreeBooksRoot,
} from "@/lib/platform/fs/managed-storage";
import { formatStorageRef, parseStorageRef } from "@/lib/platform/fs/storage-ref";
import { fileRefExists, readBytes } from "@/lib/platform/fs/read-write";
import { isMobile, isTauri } from "@/lib/platform/detect";
import { getFileSystem, toNativeFilesystemPath } from "@/lib/platform/filesystem";
import { basename, extname, join, normalize } from "@tauri-apps/api/path";
import { BookDirectoryDialog } from "@/components/books/BookDirectoryDialog";
import { ImportActionDialog, type ImportAction } from "@/components/books/ImportActionDialog";
import { ReplaceFileDialog, type ReplaceFileAction } from "@/components/books/ReplaceFileDialog";
import {
  formatSourceListFilterSummary,
  formatSourceListToolbarDescription,
  buildSourceFilterGroupOptions,
  hasEffectiveSourceListFilter,
  EMPTY_SOURCE_LIST_FILTER,
  shouldGroupSourcesByGroupName,
  getEffectiveSourceListFilter,
  type SourceSearchMode,
  type SourceListFilterCriteria,
} from "@/lib/sources/source-list-filter";
import type { SourceSortMode } from "@/lib/sources/source-sort";
import { loadSourcesPagePrefs, saveSourcesPagePrefs } from "@/lib/search/search-prefs";
import { openSourceSettingsInApp } from "@/lib/platform/open-url";
import { getStoredSourceCookiesForInnerWeb } from "@/lib/js-engine";
import {
  registerInnerWebOpener,
  registerInnerWebClose,
  registerInnerWebPatch,
  loadPersistedInnerWebSession,
  applyRestoredInnerWebSession,
  shouldSuppressLoginDialogDismiss,
  READER_BOOKSOURCE_IMPORT_NETWORK_EVENT,
  isInnerWebSessionActive,
  cancelInnerWebClose,
  type InnerWebPayload,
} from "@/lib/platform/inner-web";
import {
  releaseInnerWebPanelForOverlay,
  retainInnerWebPanelForOverlay,
  shouldManageInnerWebPanelOverlay,
} from "@/lib/platform/inner-web-panel-overlay";
import { APP_INNER_WEB_DIALOG_Z } from "@/lib/ui/overlay-z";
import {
  parseReaderImportDeepLink,
  READER_BOOKSOURCE_IDENTIFY_EVENT,
  READER_RSS_IMPORT_EVENT,
  READER_REPLACE_RULE_IMPORT_EVENT,
} from "@/lib/platform/legado-import-uri";
import {
  buildImportComparisons,
  defaultImportSelection,
  DatabaseRestoreRequiredError,
  importSelectedBookSources,
  resolveBookSourcesFromFile,
  resolveBookSourcesFromLocalFiles,
  resolveBookSourcesFromNetworkUrl,
  resolveBookSourcesFromText,
  type ImportSourceComparison,
} from "@/lib/book-source/import-booksource-resolver";
import { pickLocalBookSourceFiles } from "@/lib/book-source/pick-local-booksource-file";
import { pickLocalBookSourceDirectory } from "@/lib/book-source/pick-local-booksource-directory";
import {
  importLegadoJsonFromNetworkUrl,
  importReplaceRulesFromNetworkUrl,
  importRssFromNetworkUrl,
} from "@/lib/book-source/import-network-sidecar";
import { importDatabase } from "@/lib/database/export-import";
import { InnerWebHost } from "@/components/inner-web/InnerWebHost";
import { SourceLoginDialog } from "@/components/sources/SourceLoginDialog";
import { SourceVariableDialog } from "@/components/sources/SourceVariableDialog";
import { readHmrData, writeHmrData } from "@/lib/dev/hmr-state";
import { OverlayStackEntry } from "@/components/navigation/OverlayStackEntry";
import { dismissFloatingOverlaysForShellChange } from "@/utils/accessibility";
import {
  createOverlayStack,
  isOverlayPage,
  isViewerOverlayKind,
  normalizeOverlayBookUrl,
  normalizeShellTab,
  type OverlayEntry,
  type ShellTabPage,
} from "@/lib/navigation/overlay-stack";
import {
  ensureMainWindowVisible,
  isDevSplashDone,
  markDevSplashDone,
} from "@/lib/dev/splash-session";
import "@/app/App.css";
// 窗口显示：开屏时由 SplashScreen 处理；HMR 跳过开屏时由 App onMount 补 show

function isMediaViewerPage(page: PageType): page is MediaViewerPage {
  return (NON_TEXT_MEDIA_VIEWER_PAGES as PageType[]).includes(page);
}

function normalizeRestoredPage(page: string): PageType {
  if (page === "import") return "bookshelf";
  const viewer = normalizeMediaViewerPage(page);
  if (viewer) return viewer;
  return page as PageType;
}

// 内部组件，用于访问 SidebarProvider 的上下文
function AppContent() {
  const restoredPage = normalizeRestoredPage(readHmrData<string>("currentPage", "bookshelf"));
  const nav = createOverlayStack(
    isOverlayPage(restoredPage) ? "bookshelf" : normalizeShellTab(restoredPage),
  );
  const currentPage = nav.currentPage;
  const isStandalonePage = nav.isStandaloneVisible;

  createEffect(() => {
    publishActiveOverlayLayer(nav.top());
  });

  const navigateToPage = (page: PageType) => {
    if (page === "book-search") {
      openBookSearch();
      return;
    }
    if (page === "remote-book") {
      nav.push({ kind: "remote-book", originShell: nav.shellTab() });
      return;
    }
    nav.navigateShell(page);
  };
  const [showSplash, setShowSplash] = createSignal(!isDevSplashDone());
  const [settingsSubPageOpen, setSettingsSubPageOpen] = createSignal(false);
  const settingsSubPageCloseRef: { current: () => void } = { current: () => {} };
  // 数据库初始化状态（保留用于将来显示加载状态）
  const [dbInitialized, setDbInitialized] = createSignal(false);
  const [dbError, setDbError] = createSignal<string | null>(null);
  const { state, toggleSidebar } = useSidebar();
  const [windowWidth, setWindowWidth] = createSignal(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  const [recentBooks, { refetch: refetchRecentBooks }] = createResource(() => {
    if (!dbInitialized()) return;
    return getRecentReadBooks(5);
  });

  createEffect(() => {
    const refreshRecentBooks = () => void refetchRecentBooks();
    window.addEventListener("bookshelf-book-updated", refreshRecentBooks);
    window.addEventListener("read-record-updated", refreshRecentBooks);
    onCleanup(() => {
      window.removeEventListener("bookshelf-book-updated", refreshRecentBooks);
      window.removeEventListener("read-record-updated", refreshRecentBooks);
    });
  });
  const [showGroupManage, setShowGroupManage] = createSignal(false);
  const [showBookshelfManage, setShowBookshelfManage] = createSignal(false);
  const [showSourcesManage, setShowSourcesManage] = createSignal(false);
  /** null=关闭；'new'=新建；string=编辑该书源 URL */
  const [sourceEditTarget, setSourceEditTarget] = createSignal<null | "new" | string>(null);

  function openSourceEditor(source?: BookSource) {
    setSourceEditTarget(source ? source.sourceUrl : "new");
  }
  const [showBookshelfCache, setShowBookshelfCache] = createSignal(false);
  const [bookshelfCacheGroupId, setBookshelfCacheGroupId] = createSignal(-1);
  const [showBookDirectoryDialog, setShowBookDirectoryDialog] = createSignal(false);
  const [showImportActionDialog, setShowImportActionDialog] = createSignal(false);
  const [showReplaceFileDialog, setShowReplaceFileDialog] = createSignal(false);
  const [showAddBookByUrlDialog, setShowAddBookByUrlDialog] = createSignal(false);
  const [showImportSourceNetworkDialog, setShowImportSourceNetworkDialog] = createSignal(false);
  const [showImportSourceLocalDialog, setShowImportSourceLocalDialog] = createSignal(false);
  const [importSourceLocalBusy, setImportSourceLocalBusy] = createSignal(false);
  const [showImportBookLocalDialog, setShowImportBookLocalDialog] = createSignal(false);
  const [importBookLocalBusy, setImportBookLocalBusy] = createSignal(false);
  const [pendingImportBatch, setPendingImportBatch] = createSignal<LocalBookPickResult[] | null>(
    null
  );
  const [pendingImportBatchGroupId, setPendingImportBatchGroupId] = createSignal<
    number | undefined
  >();
  const [showImportSourceQrDialog, setShowImportSourceQrDialog] = createSignal(false);
  const [showImportSourceSelectDialog, setShowImportSourceSelectDialog] = createSignal(false);
  const [importSourceNetworkPresetUrl, setImportSourceNetworkPresetUrl] = createSignal("");
  const [importSourceLoading, setImportSourceLoading] = createSignal(false);
  const [importSourceCandidates, setImportSourceCandidates] = createSignal<NewBookSource[]>([]);
  const [importSourceComparisons, setImportSourceComparisons] = createSignal<ImportSourceComparison[]>([]);
  const [importSourceSelectedUrls, setImportSourceSelectedUrls] = createSignal<Set<string>>(new Set());
  const [importKeepName, setImportKeepName] = createSignal(false);
  const [importKeepGroup, setImportKeepGroup] = createSignal(false);
  const [importKeepEnable, setImportKeepEnable] = createSignal(false);
  const [importGroupName, setImportGroupName] = createSignal('');
  const [importGroupOptions, setImportGroupOptions] = createSignal<string[]>([]);
  const [importAdjustGroup, setImportAdjustGroup] = createSignal(false);
  /** 书源页：分组管理对话框 */
  const [showSourceGroupManageDialog, setShowSourceGroupManageDialog] = createSignal(false);
  /** 书籍搜索页：书架/书源入口 */
  /** 书源登录对话框：配置了 loginUi 时弹窗显示登录页 */
  const [sourceLoginDialogSource, setSourceLoginDialogSource] = createSignal<BookSource | null>(null);
  const [sourceVariableDialogSource, setSourceVariableDialogSource] =
    createSignal<BookSource | null>(null);

  function openSourceVariables(source: BookSource) {
    setSourceVariableDialogSource(source);
  }
  const initialInnerWeb = loadPersistedInnerWebSession();
  const [innerWebPayload, setInnerWebPayload] = createSignal<InnerWebPayload | null>(
    initialInnerWeb
  );
  if (initialInnerWeb) {
    applyRestoredInnerWebSession(initialInnerWeb);
  }
  const [pendingImportFile, setPendingImportFile] = createSignal<{
    bookUrl: string;
    fileName: string;
    content?: ArrayBuffer; // Android Content URI 需要预先读取内容
    groupId?: number;
  } | null>(null);
  const [pendingReplaceFile, setPendingReplaceFile] = createSignal<{
    fileInfo: { bookUrl: string; fileName: string; content?: ArrayBuffer };
    action?: ImportAction; // 如果用户已记住导入操作，这里会有值；否则为 undefined
    groupId?: number;
    isSameSize?: boolean; // 文件大小是否相同
    isSameContent?: boolean; // 文件内容是否相同（通过哈希比较）
    renameImport?: boolean; // 是否需要在选择操作后执行重命名导入
  } | null>(null);
  const [sourceGroups, setSourceGroups] = createSignal<string[]>([]);
  const [sourceCount, setSourceCount] = createSignal(0);
  /** 书源页：搜索关键词 */
  const [sourceSearchQuery, setSourceSearchQuery] = createSignal("");
  /** 书源页：按分组名分块显示（仅全部/筛选时有效） */
  const [sourcesGroupByGroupName, setSourcesGroupByGroupName] = createSignal(false);
  /** 书源页：搜索模式（持久化到 sources_page_prefs） */
  const [sourceSearchMode, setSourceSearchMode] = createSignal<SourceSearchMode>('name');
  /** 书源页：拖拽排序开关（持久化到 sources_page_prefs） */
  const [sourceEnableDragSort, setSourceEnableDragSort] = createSignal(true);
  /** 书源页：排序 */
  const [sourceSortMode, setSourceSortMode] = createSignal<SourceSortMode>('manual');
  const [sourceSortReverse, setSourceSortReverse] = createSignal(false);
  /** 书源页：对话框筛选 */
  const [sourceFilterDialogOpen, setSourceFilterDialogOpen] = createSignal(false);
  const [sourceListFilter, setSourceListFilter] = createSignal<SourceListFilterCriteria>(EMPTY_SOURCE_LIST_FILTER);

  createEffect(() => {
    writeHmrData("currentPage", currentPage());
  });

  /** Tab / 全屏子页 / 阅读叠层变化时关掉仍挂着的菜单 Portal，避免 Android 闪到左上角 */
  createEffect(() => {
    currentPage();
    showGroupManage();
    showSourcesManage();
    showBookshelfManage();
    showBookshelfCache();
    nav.top();
    dismissFloatingOverlaysForShellChange();
  });

  /** DEV HMR：页面仍停在媒体阅读器但 store 已重置时，尝试从缓存会话恢复或退回书架 */
  createEffect(() => {
    if (!import.meta.env.DEV) return;
    const page = currentPage();
    if (!isMediaViewerPage(page)) return;
    if (viewerStore.state.book || viewerStore.state.loading || viewerStore.isMediaViewerBootstrapping()) {
      return;
    }

    const session = readHmrData<{ bookUrl: string; kind: MediaKind } | null>(
      "mediaViewerSession",
      null,
    );
    if (session?.bookUrl) {
      void getBook(session.bookUrl).then((book) => {
        if (!book || viewerStore.state.book) return;
        viewerStore.setBookInitialState(book, session.kind);
        void viewerStore.openBook(book, session.kind).catch((e) => {
          console.error("HMR 恢复媒体阅读器失败:", e);
          nav.pop();
        });
      });
      return;
    }

    // 有 mediaViewerSession 说明正在打开中，勿误 pop（openReaderPage 会先写 session 再 push）
    if (session) return;

    nav.pop();
  });

  createEffect(() => {
    if (sourceSortMode() === 'manual' && sourceSortReverse()) {
      setSourceSortReverse(false);
    }
  });

  createEffect(() => {
    if (currentPage() !== "sources") return;
    void loadSourcesPagePrefs().then((p) => {
      setSourceSearchMode(p.searchMode);
      setSourceEnableDragSort(p.enableDragSort);
    });
  });

  const persistSearchMode = (mode: SourceSearchMode) => {
    setSourceSearchMode(mode);
    void loadSourcesPagePrefs().then((p) => saveSourcesPagePrefs({ ...p, searchMode: mode }));
  };

  const persistSourceEnableDragSort = (value: boolean) => {
    setSourceEnableDragSort(value);
    void loadSourcesPagePrefs().then((p) => saveSourcesPagePrefs({ ...p, enableDragSort: value }));
  };

  const openBookSearch = (query?: string, scope?: string) => {
    nav.push({
      kind: "book-search",
      initialQuery: query?.trim() || undefined,
      initialScope: scope,
      originShell: nav.shellTab(),
    });
  };

  const sourcePageToolbarTitle = () => "书源";

  const sourceFilterGroupOptions = () => buildSourceFilterGroupOptions(sourceGroups());

  const sourcePageToolbarDescription = () => {
    const count = sourceCount();
    const allGroups = sourceFilterGroupOptions();
    const filter = sourceListFilter();
    if (hasEffectiveSourceListFilter(filter, allGroups)) {
      return formatSourceListToolbarDescription({
        criteria: filter,
        allGroupNames: allGroups,
        count,
      });
    }
    return (
      <>
        共 {count} 个书源
        <Show when={sourceGroups().length > 0}>
          ，共 {sourceGroups().length} 个分组
        </Show>
      </>
    );
  };

  const sourceFilterTooltip = () =>
    formatSourceListFilterSummary(sourceListFilter(), sourceFilterGroupOptions());

  /** Tauri 子 WebView 叠在主界面之上时需先 hide；与内嵌浮层 z-150 对齐的 Dialog portal */
  let bookSourceImportPanelRetained = false;

  function releaseBookSourceImportPanelIfNeeded(): void {
    if (!bookSourceImportPanelRetained) return;
    bookSourceImportPanelRetained = false;
    releaseInnerWebPanelForOverlay({ overlap: true });
  }

  const bookSourceImportDialogPortalZ = () =>
    isInnerWebSessionActive() ? APP_INNER_WEB_DIALOG_Z : undefined;

  const openImportSourceSelectLoading = async () => {
    if (nav.shellTab() !== 'sources') {
      nav.navigateShell('sources');
    }
    setImportSourceLoading(true);
    setImportSourceCandidates([]);
    setImportSourceComparisons([]);
    setImportSourceSelectedUrls(new Set<string>());
    const app = settingsStore.state.app;
    setImportKeepName(app.importKeepName ?? false);
    setImportKeepGroup(app.importKeepGroup ?? false);
    setImportKeepEnable(app.importKeepEnable ?? false);
    setImportGroupName('');
    setImportAdjustGroup(false);
    try {
      const raw = await getAllSourceGroups();
      const names = new Set<string>();
      const split = /[,，;；]\s*/;
      for (const g of raw) {
        for (const part of g.split(split)) {
          const t = part.trim();
          if (t) names.add(t);
        }
      }
      setImportGroupOptions([...names].sort((a, b) => a.localeCompare(b, 'zh-CN')));
    } catch {
      setImportGroupOptions([]);
    }
    const p = innerWebPayload();
    if (
      isTauri() &&
      shouldManageInnerWebPanelOverlay({ url: p?.url, html: p?.html }) &&
      !bookSourceImportPanelRetained
    ) {
      await retainInnerWebPanelForOverlay();
      bookSourceImportPanelRetained = true;
    }
    setShowImportSourceSelectDialog(true);
    scheduleOverlayPositionSync();
    requestAnimationFrame(() => scheduleOverlayPositionSync());
  };

  const applyRecognizedSources = async (sources: NewBookSource[], title = '导入书源') => {
    if (sources.length === 0) {
      setShowImportSourceSelectDialog(false);
      releaseBookSourceImportPanelIfNeeded();
      showAppToast({ title, description: '未识别到有效书源', variant: 'default' });
      return;
    }
    const comparisons = await buildImportComparisons(sources);
    setImportSourceCandidates(sources);
    setImportSourceComparisons(comparisons);
    setImportSourceSelectedUrls(defaultImportSelection(comparisons));
    setImportSourceLoading(false);
  };

  const identifySourcesFromNetwork = async (url: string) => {
    const normalized = url.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      showAppToast({ title: '网络导入书源', description: '链接无效', variant: 'destructive' });
      return;
    }
    await openImportSourceSelectLoading();
    try {
      const { sources } = await resolveBookSourcesFromNetworkUrl(normalized);
      await applyRecognizedSources(sources, '网络导入书源');
    } catch (err) {
      setShowImportSourceSelectDialog(false);
      releaseBookSourceImportPanelIfNeeded();
      showAppToast({ title: '网络导入书源失败', description: String(err), variant: 'destructive' });
    } finally {
      setImportSourceLoading(false);
    }
  };

  const restoreDatabaseFromFile = async (file: File) => {
    const ok = confirm(
      '检测到数据库备份（.db）。恢复将替换当前全部数据且不可撤销。\n\n是否立即恢复？也可稍后在「设置 → 数据备份」中操作。'
    );
    if (!ok) return;
    try {
      const buf = await file.arrayBuffer();
      await importDatabase(buf, true);
      showAppToast({
        title: '数据库已恢复',
        description: '建议刷新页面以应用更改',
        variant: 'default',
      });
      setTimeout(() => {
        if (confirm('数据库已恢复，是否刷新页面？')) {
          window.location.reload();
        }
      }, 800);
    } catch (e) {
      showAppToast({
        title: '数据库恢复失败',
        description: String(e),
        variant: 'destructive',
      });
    }
  };

  const identifySourcesFromLocalFile = async (file: File) => {
    await openImportSourceSelectLoading();
    try {
      const { sources, sideImportSummary } = await resolveBookSourcesFromFile(file);
      if (sideImportSummary?.length) {
        showAppToast({
          title: 'ZIP 附带导入',
          description: sideImportSummary.join('、'),
          variant: 'default',
        });
      }
      await applyRecognizedSources(sources, '本地导入书源');
    } catch (err) {
      if (err instanceof DatabaseRestoreRequiredError) {
        setShowImportSourceSelectDialog(false);
        releaseBookSourceImportPanelIfNeeded();
        await restoreDatabaseFromFile(err.file);
        return;
      }
      setShowImportSourceSelectDialog(false);
      releaseBookSourceImportPanelIfNeeded();
      showAppToast({ title: '本地导入书源失败', description: String(err), variant: 'destructive' });
    } finally {
      setImportSourceLoading(false);
    }
  };

  const openLocalBookSourceImport = () => {
    setShowImportSourceLocalDialog(true);
  };

  const runLocalBookSourceFilePick = async () => {
    setImportSourceLocalBusy(true);
    try {
      const files = await pickLocalBookSourceFiles();
      if (!files?.length) return;
      if (files.length === 1) {
        void identifySourcesFromLocalFile(files[0]!);
        return;
      }
      await openImportSourceSelectLoading();
      try {
        const { sources, sideImportSummary } = await resolveBookSourcesFromLocalFiles(files);
        if (sideImportSummary?.length) {
          showAppToast({
            title: '多文件导入',
            description: sideImportSummary.join('；'),
            variant: 'default',
          });
        }
        await applyRecognizedSources(
          sources,
          `本地导入书源（${files.length} 个文件）`
        );
      } catch (err) {
        if (err instanceof DatabaseRestoreRequiredError) {
          setShowImportSourceSelectDialog(false);
          releaseBookSourceImportPanelIfNeeded();
          await restoreDatabaseFromFile(err.file);
          return;
        }
        setShowImportSourceSelectDialog(false);
        releaseBookSourceImportPanelIfNeeded();
        showAppToast({
          title: '本地导入书源失败',
          description: String(err),
          variant: 'destructive',
        });
      } finally {
        setImportSourceLoading(false);
      }
    } catch (err) {
      showAppToast({
        title: '选择文件失败',
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      setImportSourceLocalBusy(false);
    }
  };

  const identifySourcesFromLocalDirectory = async () => {
    setImportSourceLocalBusy(true);
    try {
      const picked = await pickLocalBookSourceDirectory();
      if (!picked) return;
      if (picked.files.length === 0) {
        showAppToast({
          title: '目录导入书源',
          description: '该目录中未找到符合条件的书源文件',
          variant: 'default',
        });
        return;
      }
      await openImportSourceSelectLoading();
      try {
        const { sources, sideImportSummary } = await resolveBookSourcesFromLocalFiles(
          picked.files
        );
        if (sideImportSummary?.length) {
          showAppToast({
            title: '目录扫描',
            description: sideImportSummary.join('；'),
            variant: 'default',
          });
        }
        await applyRecognizedSources(
          sources,
          `目录导入书源（${picked.files.length} 个文件）`
        );
      } catch (err) {
        if (err instanceof DatabaseRestoreRequiredError) {
          setShowImportSourceSelectDialog(false);
          releaseBookSourceImportPanelIfNeeded();
          await restoreDatabaseFromFile(err.file);
          return;
        }
        setShowImportSourceSelectDialog(false);
        releaseBookSourceImportPanelIfNeeded();
        showAppToast({
          title: '目录导入书源失败',
          description: String(err),
          variant: 'destructive',
        });
      } finally {
        setImportSourceLoading(false);
      }
    } catch (err) {
      showAppToast({
        title: '选择目录失败',
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      setImportSourceLocalBusy(false);
    }
  };

  const handleLocalImportPickFile = () => {
    setShowImportSourceLocalDialog(false);
    void runLocalBookSourceFilePick();
  };

  const handleLocalImportPickDirectory = () => {
    setShowImportSourceLocalDialog(false);
    void identifySourcesFromLocalDirectory();
  };

  const handleLegadoNetworkImport = async (url: string, title = '网络导入') => {
    const parsed = parseReaderImportDeepLink(url);
    if (parsed?.kind === 'unsupported') {
      showAppToast({ title, description: parsed.reason, variant: 'default' });
      return;
    }
    if (parsed?.kind === 'rssNetwork') {
      try {
        const n = await importRssFromNetworkUrl(parsed.src);
        showAppToast({ title: '导入 RSS', description: `已导入 ${n} 条`, variant: 'default' });
      } catch (err) {
        showAppToast({ title: '导入 RSS 失败', description: String(err), variant: 'destructive' });
      }
      return;
    }
    if (parsed?.kind === 'replaceRuleNetwork') {
      try {
        const n = await importReplaceRulesFromNetworkUrl(parsed.src);
        showAppToast({ title: '导入替换规则', description: `已导入 ${n} 条`, variant: 'default' });
      } catch (err) {
        showAppToast({
          title: '导入替换规则失败',
          description: String(err),
          variant: 'destructive',
        });
      }
      return;
    }
    if (parsed?.kind === 'determineType') {
      try {
        const result = await importLegadoJsonFromNetworkUrl(parsed.src);
        if (result.kind === 'book') {
          void identifySourcesFromNetwork(parsed.src);
          return;
        }
        const label = result.kind === 'rss' ? 'RSS 源' : '替换规则';
        showAppToast({
          title: `导入${label}`,
          description: `已导入 ${result.count} 条`,
          variant: 'default',
        });
        return;
      } catch {
        void identifySourcesFromNetwork(parsed.src);
        return;
      }
    }
    void identifySourcesFromNetwork(parsed?.src ?? url);
  };

  const identifySourcesFromQrRaw = async (raw: string) => {
    const parsed = parseReaderImportDeepLink(raw);
    if (parsed?.kind === 'unsupported') {
      showAppToast({ title: '二维码导入', description: parsed.reason, variant: 'default' });
      return;
    }
    if (parsed) {
      void handleLegadoNetworkImport(
        parsed.kind === 'bookSourceNetwork' ||
          parsed.kind === 'rssNetwork' ||
          parsed.kind === 'replaceRuleNetwork' ||
          parsed.kind === 'determineType'
          ? parsed.src
          : raw,
        '二维码导入'
      );
      return;
    }
    await openImportSourceSelectLoading();
    try {
      const { sources } = await resolveBookSourcesFromText(raw);
      await applyRecognizedSources(sources, '二维码导入书源');
    } catch (err) {
      setShowImportSourceSelectDialog(false);
      releaseBookSourceImportPanelIfNeeded();
      showAppToast({ title: '二维码导入书源失败', description: String(err), variant: 'destructive' });
    } finally {
      setImportSourceLoading(false);
    }
  };

  const toggleImportSourceSelected = (sourceUrl: string, checked: boolean) => {
    setImportSourceSelectedUrls((prev) => {
      const next = new Set(prev);
      if (checked) next.add(sourceUrl);
      else next.delete(sourceUrl);
      return next;
    });
  };

  const toggleImportSourceSelectAll = () => {
    const candidates = importSourceCandidates();
    if (candidates.length === 0) return;
    const allSelected = importSourceSelectedUrls().size === candidates.length;
    setImportSourceSelectedUrls(
      allSelected ? new Set<string>() : new Set<string>(candidates.map((s) => s.sourceUrl))
    );
  };

  const toggleImportSourceInvert = () => {
    const current = importSourceSelectedUrls();
    const next = new Set<string>();
    for (const source of importSourceCandidates()) {
      if (!current.has(source.sourceUrl)) next.add(source.sourceUrl);
    }
    setImportSourceSelectedUrls(next);
  };

  const toggleImportSourceSelectNew = () => {
    const comparisons = importSourceComparisons();
    const current = importSourceSelectedUrls();
    const newUrls = comparisons.filter((c) => c.isNew).map((c) => c.source.sourceUrl);
    const allNewSelected = newUrls.length > 0 && newUrls.every((u) => current.has(u));
    const next = new Set(current);
    for (const u of newUrls) {
      if (allNewSelected) next.delete(u);
      else next.add(u);
    }
    setImportSourceSelectedUrls(next);
  };

  const toggleImportSourceSelectUpdate = () => {
    const comparisons = importSourceComparisons();
    const current = importSourceSelectedUrls();
    const updateUrls = comparisons.filter((c) => c.isUpdate).map((c) => c.source.sourceUrl);
    const allUpdateSelected = updateUrls.length > 0 && updateUrls.every((u) => current.has(u));
    const next = new Set(current);
    for (const u of updateUrls) {
      if (allUpdateSelected) next.delete(u);
      else next.add(u);
    }
    setImportSourceSelectedUrls(next);
  };

  const persistImportKeepSettings = async () => {
    await settingsStore.setImportSourceKeepOptions({
      importKeepName: importKeepName(),
      importKeepGroup: importKeepGroup(),
      importKeepEnable: importKeepEnable(),
    });
  };

  const confirmImportSelectedSources = async () => {
    const selected = new Set(importSourceSelectedUrls());
    const list = importSourceCandidates().filter((s) => selected.has(s.sourceUrl));
    if (list.length === 0) {
      showAppToast({ title: '导入书源', description: '请先选择书源', variant: 'default' });
      return;
    }
    try {
      setImportSourceLoading(true);
      await persistImportKeepSettings();
      const { inserted, blocked } = await importSelectedBookSources(list, {
        keepName: importKeepName(),
        keepGroup: importKeepGroup(),
        keepEnable: importKeepEnable(),
        groupName: importGroupName(),
        adjustGroup: importAdjustGroup(),
      });
      const blockedNote =
        blocked.length > 0 ? `，跳过 ${blocked.length} 条黑名单书源` : '';
      showAppToast({
        title: '导入书源',
        description: `已导入 ${inserted} 条书源${blockedNote}`,
        variant: 'default',
      });
      setShowImportSourceSelectDialog(false);
      releaseBookSourceImportPanelIfNeeded();
      setImportSourceCandidates([]);
      setImportSourceComparisons([]);
      setImportSourceSelectedUrls(new Set<string>());
    } catch (err) {
      showAppToast({ title: '导入书源失败', description: String(err), variant: 'destructive' });
    } finally {
      setImportSourceLoading(false);
    }
  };

  /** 书源页展开项（切到发现页再返回时保持展开） */
  const [sourcesExpandedSourceUrl, setSourcesExpandedSourceUrl] = createSignal<string | null>(null);

  const [bookInfoDrawer, setBookInfoDrawer] = createSignal<{
    source: BookSource;
    book: SearchBook;
    originShell: ShellTabPage;
  } | null>(null);
  const [bookInfoDrawerOpen, setBookInfoDrawerOpen] = createSignal(false);

  const bookInfoUsesDrawer = () =>
    (settingsStore.state.app.bookInfoPresentation ?? 'page') === 'drawer';

  const bookInfoCanContinueReading = () => {
    if (bookInfoUsesDrawer()) {
      const drawer = bookInfoDrawer();
      if (!bookInfoDrawerOpen() || !drawer) return false;
      const bookUrl = drawer.book.bookUrl;
      const kind = resolveMediaKindWithSource(
        searchBookToEphemeralBook(drawer.book, drawer.source),
        drawer.source.sourceType,
      );
      const viewerKind = mediaViewerPageForKind(kind);
      const existing = nav.findViewerEntry(viewerKind, bookUrl);
      return (
        !!existing &&
        viewerStore.isOpen() &&
        viewerStore.state.kind === kind &&
        normalizeOverlayBookUrl(viewerStore.state.book?.bookUrl ?? "") ===
          normalizeOverlayBookUrl(bookUrl) &&
        !viewerStore.isMediaViewerBootstrapping()
      );
    }
    return nav.bookInfoCanContinueReading();
  };

  let pendingAfterBookInfoDrawerDismiss: (() => void) | null = null;

  function finalizeBookInfoDrawerDismiss() {
    setBookInfoDrawerOpen(false);
    setBookInfoDrawer(null);
    const top = nav.top();
    if (top?.kind === "book-info") {
      nav.pop();
    }
    const pending = pendingAfterBookInfoDrawerDismiss;
    pendingAfterBookInfoDrawerDismiss = null;
    pending?.();
  }

  function closeBookInfo() {
    pendingAfterBookInfoDrawerDismiss = null;
    if (bookInfoUsesDrawer()) {
      setBookInfoDrawerOpen(false);
      return;
    }
    const top = nav.top();
    if (top?.kind === "book-info") {
      nav.pop();
      return;
    }
    setBookInfoDrawerOpen(false);
  }

  function openBookInfo(params: {
    source: BookSource;
    book: SearchBook;
    originShell?: ShellTabPage;
  }) {
    const originShell = params.originShell ?? nav.shellTab();
    if (bookInfoUsesDrawer()) {
      setBookInfoDrawer({
        source: params.source,
        book: params.book,
        originShell,
      });
      setBookInfoDrawerOpen(true);
      return;
    }
    nav.push({
      kind: "book-info",
      source: params.source,
      book: params.book,
      originShell,
    });
  }

  function openBookFromBookInfo(
    book: Book,
    catalog?: import("@/types").BookChapter[],
    source?: BookSource,
  ) {
    if (bookInfoUsesDrawer()) {
      pendingAfterBookInfoDrawerDismiss = () =>
        openReaderPage(book, catalog, source);
      setBookInfoDrawerOpen(false);
      return;
    }
    if (nav.top()?.kind === "book-info") {
      nav.pop();
    }
    openReaderPage(book, catalog, source);
  }

  const [guestAddToShelfOpen, setGuestAddToShelfOpen] = createSignal(false);
  const [guestAddToShelfBusy, setGuestAddToShelfBusy] = createSignal(false);

  /** 叠层栈条目是否栈顶可见（须在 JSX 中调用 visible() 以保持响应式） */
  function overlayEntryVisible(entry: OverlayEntry) {
    return nav.top()?.id === entry.id;
  }

  function mountReaderOnNav(
    book: Book,
    viewerKind: ReturnType<typeof mediaViewerPageForKind>,
  ) {
    const bookUrl = normalizeOverlayBookUrl(book.bookUrl);
    nav.removeViewerKinds(viewerKind);
    nav.push({ kind: viewerKind, bookUrl });
  }

  function popViewerNavIfTop(bookUrl: string) {
    const top = nav.top();
    if (
      top &&
      isViewerOverlayKind(top.kind) &&
      "bookUrl" in top &&
      top.bookUrl === bookUrl
    ) {
      nav.pop();
    }
  }

  async function openRecentBook(item: RecentReadBook) {
    if (item.book) {
      openReaderPage(item.book);
      return;
    }
    if (item.bookUrl) {
      const book = await getBook(item.bookUrl);
      if (book) {
        openReaderPage(book);
        return;
      }
    }
    const book = await getBookByNameAndAuthor(item.title, item.author);
    if (book) {
      openReaderPage(book);
      return;
    }
    openBookSearch(item.title);
  }

  function openReaderPage(
    book: Book,
    initialCatalog?: import("@/types").BookChapter[],
    source?: Pick<BookSource, "sourceType">,
  ) {
    const kind = resolveMediaKindWithSource(book, source?.sourceType);
    const viewerKind = mediaViewerPageForKind(kind);
    if (import.meta.env.DEV) {
      console.info("[reader-nav] openReaderPage", {
        kind,
        viewerKind,
        sourceType: source?.sourceType,
        bookType: book.type,
        stack: nav.entries().map((e) => e.kind),
        top: nav.top()?.kind,
      });
    }
    const existing = nav.findViewerEntry(viewerKind, book.bookUrl);
    const storeReady =
      kind === MediaKind.text
        ? viewerStore.isOpen() &&
          viewerStore.state.kind === MediaKind.text &&
          viewerStore.state.book?.bookUrl === book.bookUrl &&
          !viewerStore.state.contentBootstrapping
        : viewerStore.isOpen() &&
          normalizeOverlayBookUrl(viewerStore.state.book?.bookUrl ?? "") ===
            normalizeOverlayBookUrl(book.bookUrl) &&
          viewerStore.state.kind === kind &&
          !viewerStore.isMediaViewerBootstrapping();

    if (existing && storeReady) {
      if (nav.top()?.id !== existing.id) {
        nav.popToEntryId(existing.id);
      }
      return;
    }

    const prevUrl = viewerStore.state.book?.bookUrl;
    const mustCloseOther =
      viewerStore.isOpen() && !!prevUrl && prevUrl !== book.bookUrl;

    const primeReaderStore = () => {
      if (kind === MediaKind.text) {
        textViewerStore.setBookInitialState(book);
      } else {
        viewerStore.setBookInitialState(book, kind);
        writeHmrData("mediaViewerSession", { bookUrl: book.bookUrl, kind });
      }
    };

    const loadBook = async () => {
      try {
        if (kind === MediaKind.text) {
          await textViewerStore.openBook(book, { initialCatalog });
        } else {
          await viewerStore.openBook(book, kind, { initialCatalog });
        }
      } catch (e) {
        console.error("打开书籍失败:", e);
        if (kind === MediaKind.text) {
          await textViewerStore.closeBook();
        } else {
          await viewerStore.closeBook();
          writeHmrData("mediaViewerSession", null);
        }
        popViewerNavIfTop(book.bookUrl);
      }
    };

    if (mustCloseOther) {
      void (async () => {
        if (kind === MediaKind.text) {
          await textViewerStore.closeBook();
        } else {
          await viewerStore.closeBook();
          writeHmrData("mediaViewerSession", null);
        }
        primeReaderStore();
        mountReaderOnNav(book, viewerKind);
        await loadBook();
      })();
      return;
    }

    primeReaderStore();
    mountReaderOnNav(book, viewerKind);
    if (import.meta.env.DEV) {
      console.info("[reader-nav] mounted", {
        viewerKind,
        stack: nav.entries().map((e) => e.kind),
        top: nav.top()?.kind,
      });
    }
    void (async () => {
      await loadBook();
      if (kind !== MediaKind.text) {
        const { isLocalBook } = await import("@/lib/local-book");
        const guest =
          !isLocalBook(book) && !(await hasBook(book.bookUrl));
        if (
          viewerStore.state.book?.bookUrl === book.bookUrl &&
          viewerStore.state.kind === kind
        ) {
          viewerStore.setGuestReading(guest);
        }
      }
    })();
  }

  function openTextViewerFromMediaFallback(detail: ReaderMediaTextFallbackDetail) {
    const book = viewerStore.state.book;
    const catalog = viewerStore.state.catalog;
    if (!book || book.bookUrl !== detail.bookUrl) return;

    const initialCatalog = catalog.length > 0 ? catalog : undefined;
    const chapterIndex = detail.chapterIndex;
    const mediaTop = nav.top();
    if (mediaTop && isViewerOverlayKind(mediaTop.kind) && mediaTop.kind !== "text-viewer") {
      nav.pop();
    }
    nav.removeViewerKinds("text-viewer");
    nav.push({ kind: "text-viewer", bookUrl: book.bookUrl });
    void viewerStore.closeBook().then(() => {
      textViewerStore.setBookInitialState(book);
      void textViewerStore
        .openBook(book, { initialCatalog })
        .then(() => textViewerStore.loadChapter(chapterIndex))
        .catch((e) => {
          console.error("回退文本阅读器失败:", e);
          nav.pop();
        });
    });
  }

  onMount(() => {
    const onMediaTextFallback = (event: Event) => {
      openTextViewerFromMediaFallback(
        (event as CustomEvent<ReaderMediaTextFallbackDetail>).detail,
      );
    };
    window.addEventListener(READER_MEDIA_TEXT_FALLBACK_EVENT, onMediaTextFallback);
    onCleanup(() => {
      window.removeEventListener(READER_MEDIA_TEXT_FALLBACK_EVENT, onMediaTextFallback);
    });
  });

  async function finishCloseReader() {
    setGuestAddToShelfOpen(false);
    setGuestAddToShelfBusy(false);
    const top = nav.top();
    if (!top || !isViewerOverlayKind(top.kind)) return;
    nav.pop();
    if (top.kind === "text-viewer") {
      await textViewerStore.closeBook();
    } else {
      await viewerStore.closeBook();
      writeHmrData("mediaViewerSession", null);
    }
  }

  let closeReaderPromptInFlight = false;

  function activeReaderBook(): Book | null {
    const top = nav.top();
    if (!top || !isViewerOverlayKind(top.kind)) {
      return textViewerStore.state.book ?? null;
    }
    if (top.kind === "text-viewer") {
      return textViewerStore.state.book;
    }
    return viewerStore.state.book;
  }

  function activeReaderIsGuest(): boolean {
    const top = nav.top();
    if (top?.kind === "text-viewer") {
      return textViewerStore.isGuestReading();
    }
    if (top && isViewerOverlayKind(top.kind)) {
      return viewerStore.isGuestReading();
    }
    return false;
  }

  function openGuestAddToShelfPrompt() {
    freezeMediaViewerChromeAutoHide();
    setGuestAddToShelfOpen(true);
  }

  function requestCloseReader() {
    if (guestAddToShelfOpen()) return;

    const book = activeReaderBook();
    if (!book) {
      void finishCloseReader();
      return;
    }

    if (activeReaderIsGuest()) {
      openGuestAddToShelfPrompt();
      return;
    }

    if (closeReaderPromptInFlight) return;
    closeReaderPromptInFlight = true;
    void (async () => {
      try {
        const { isLocalBook } = await import("@/lib/local-book");
        const onShelf = await hasBook(book.bookUrl);
        if (!isLocalBook(book) && !onShelf) {
          openGuestAddToShelfPrompt();
          return;
        }
        await finishCloseReader();
      } finally {
        closeReaderPromptInFlight = false;
      }
    })();
  }

  async function confirmGuestAddToShelf() {
    const book = textViewerStore.state.book ?? viewerStore.state.book;
    if (!book || guestAddToShelfBusy()) return;
    setGuestAddToShelfBusy(true);
    try {
      const catalog =
        textViewerStore.state.book?.bookUrl === book.bookUrl
          ? textViewerStore.state.catalog
          : viewerStore.state.catalog;
      const saved = await addSearchBookToShelf(bookToSearchBook(book), {
        chapters: catalog.length > 0 ? catalog : undefined,
        fetchChapters: catalog.length > 0 ? false : "background",
        readingProgress: getReaderProgressSnapshot(book.bookUrl),
      });
      if (saved) {
        showAppToast({
          title: "已加入书架",
          description: book.name,
          variant: "success",
        });
        window.dispatchEvent(new CustomEvent("bookshelf-refresh"));
        void finishCloseReader();
      } else {
        showAppToast({ title: "加入书架失败", variant: "destructive" });
      }
    } catch (e) {
      console.error("试读加入书架失败:", e);
      showAppToast({
        title: "加入书架失败",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setGuestAddToShelfBusy(false);
    }
  }

  /**
   * 执行导入操作
   */
  const performImport = async (groupId?: number, action?: ImportAction, fileInfo?: {
    bookUrl: string;
    fileName: string;
    content?: ArrayBuffer;
  }) => {
    try {
      let result;

      if (fileInfo) {
        // 使用已选择的文件信息直接导入
        if (!fileInfo.content) {
          // 需要先读取文件内容
          const fs = await getFileSystem();
          fileInfo.content = await fs.readFile(fileInfo.bookUrl);
        }

        result = await importLocalBookFromContent(
          fileInfo.bookUrl,
          fileInfo.fileName,
          fileInfo.content,
          { groupId }
        );
      } else {
        // 正常导入流程
        result = await importLocalBook({
          groupId,
          action,
          skipDialogs: !!action, // 如果提供了 action，跳过弹窗
        });
      }

      if (result) {
        showAppToast({
          title: "导入成功",
          description: `已导入《${result.book.name}》，共 ${result.chapterCount} 章`,
          variant: "success",
          progress: true,
        });
        window.dispatchEvent(new CustomEvent("bookshelf-refresh"));
      }
    } catch (e) {
      const error = e instanceof Error ? e : null;
      if (error?.message === 'NEED_ACTION_SELECTION') {
        // 这种情况不应该在这里发生，因为我们已经先选择了文件
        console.error('Unexpected NEED_ACTION_SELECTION error');
      }
      const msg = error?.message || "导入失败";
      showAppToast({
        title: "导入失败",
        description: msg,
        variant: "error",
      });
      window.dispatchEvent(new CustomEvent("bookshelf-refresh"));
    }
  };

  /**
   * 处理目录选择弹窗关闭
   */
  const handleBookDirectoryDialogClose = async (open: boolean) => {
    setShowBookDirectoryDialog(open);
    if (!open) {
      // 弹窗关闭后，如果目录已设置，继续导入流程
      const { hasBooksStorageRoot: hasRoot } = await import(
        '@/lib/platform/fs/managed-storage'
      );
      if (hasRoot()) {
        const groupId = bookshelfStore.state.currentGroup;
        await performImport(groupId >= 0 ? groupId : undefined);
      }
    }
  };

  const runBatchLocalBookImport = async (
    candidates: LocalBookPickResult[],
    action: ImportAction,
    groupId?: number
  ) => {
    const gid = groupId !== undefined && groupId >= 0 ? groupId : undefined;
    let success = 0;
    let skipped = 0;
    let failed = 0;

    for (const picked of candidates) {
      try {
        if (isTauri()) {
          const { targetUrl, exists } = await resolveTauriImportTarget(picked.fileName);
          if (exists && (await hasBook(targetUrl))) {
            skipped += 1;
            continue;
          }
          await performImportWithAction(picked, action, exists, gid);
          success += 1;
        } else {
          let item = picked;
          if (!item.content) {
            item = {
              ...item,
              content: await readBytes(parseStorageRef(item.bookUrl)),
            };
          }
          const root = await getManagedBooksRoot();
          const safeName = sanitizeManagedFileName(item.fileName);
          const targetRef =
            root.kind === 'dir-handle'
              ? { kind: 'dir-handle' as const, value: `${root.value}/${safeName}` }
              : null;
          const targetUrl = targetRef ? formatStorageRef(targetRef) : '';
          const targetExists = targetRef ? await fileRefExists(targetRef) : false;
          if (targetExists && targetUrl && (await hasBook(targetUrl))) {
            skipped += 1;
            continue;
          }
          await performImportWithAction(item, action, targetExists, gid);
          success += 1;
        }
      } catch (e) {
        console.error('[目录导入书籍]', picked.fileName, e);
        failed += 1;
      }
    }

    const parts = [`成功 ${success} 本`];
    if (skipped > 0) parts.push(`跳过 ${skipped} 本`);
    if (failed > 0) parts.push(`失败 ${failed} 本`);
    showAppToast({
      title: '目录导入完成',
      description: parts.join('，'),
      variant: success > 0 ? 'success' : failed > 0 ? 'error' : 'default',
    });
    if (success > 0) {
      window.dispatchEvent(new CustomEvent('bookshelf-refresh'));
    }
  };

  /**
   * 处理导入操作选择确认
   */
  const handleImportActionConfirm = async (action: ImportAction, remember: boolean) => {
    setShowImportActionDialog(false);

    // 如果用户选择记住，保存到设置中（这个逻辑在 ImportActionDialog 组件内部已经处理，但为了保持一致性保留）
    if (remember) {
      await settingsStore.setImportBookAction(action, true);
    }

    const batch = pendingImportBatch();
    if (batch && batch.length > 0) {
      const batchGroupId = pendingImportBatchGroupId();
      setPendingImportBatch(null);
      setPendingImportBatchGroupId(undefined);
      await runBatchLocalBookImport(batch, action, batchGroupId);
      return;
    }

    const fileInfo = pendingImportFile();
    if (!fileInfo) {
      showAppToast({
        title: "导入失败",
        description: "文件信息丢失，请重新选择文件",
        variant: "error",
      });
      return;
    }

    // 检查是否需要重命名导入
    const pendingReplace = pendingReplaceFile();
    if (pendingReplace?.renameImport) {
      // 用户选择了重命名导入，现在执行
      await performRenameImport(fileInfo, action, fileInfo.groupId);
      setPendingReplaceFile(null);
      setPendingImportFile(null);
      return;
    }

    // 用户选择操作后，检查文件是否存在
    if (isTauri()) {
      const { targetUrl: targetPath, exists: targetFileExists } =
        await resolveTauriImportTarget(fileInfo.fileName);
      const fs = await getFileSystem();
      const safRoot = await usesSafTreeBooksRoot();

      let isSameFile = false;
      let isSameSize = false;
      let isSameContent = false;

      if (targetFileExists) {
        if (safRoot) {
          const srcUrl = formatStorageRef(parseStorageRef(fileInfo.bookUrl));
          isSameFile = srcUrl === targetPath || fileInfo.bookUrl === targetPath;
        } else {
          try {
            const normalizedSource = await normalize(
              toNativeFilesystemPath(fileInfo.bookUrl),
            );
            const normalizedTarget = await normalize(targetPath);
            isSameFile = normalizedSource === normalizedTarget;
          } catch (error) {
            console.warn('路径规范化失败，假设不是同一文件:', error);
            isSameFile = false;
          }
        }

        // 如果不是同一文件，检查文件大小和内容是否相同
        if (!isSameFile) {
          try {
            const sourceSize = fileInfo.content
              ? fileInfo.content.byteLength
              : await fs.getFileSize(fileInfo.bookUrl);
            const targetSize = safRoot
              ? (
                await readBytes(parseStorageRef(targetPath))
              ).byteLength
              : await fs.getFileSize(targetPath);
            isSameSize = sourceSize === targetSize;

            // 如果文件大小相同，进一步比较文件内容（哈希）
            if (isSameSize) {
              try {
                // 计算源文件哈希
                let sourceHash: string;
                if (fileInfo.content) {
                  // 如果内容已在内存中，直接计算哈希
                  const hashBuffer = await crypto.subtle.digest('SHA-256', fileInfo.content);
                  const hashArray = Array.from(new Uint8Array(hashBuffer));
                  sourceHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                } else {
                  // 否则从文件系统读取并计算哈希
                  sourceHash = await fs.getFileHash(fileInfo.bookUrl);
                }

                let targetHash: string;
                if (safRoot) {
                  const targetBytes = await readBytes(parseStorageRef(targetPath));
                  const hashBuffer = await crypto.subtle.digest('SHA-256', targetBytes);
                  const hashArray = Array.from(new Uint8Array(hashBuffer));
                  targetHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
                } else {
                  targetHash = await fs.getFileHash(targetPath);
                }
                isSameContent = sourceHash === targetHash;
              } catch (error) {
                console.warn('计算文件哈希失败:', error);
                // 如果哈希计算失败，假设内容不同（更安全）
                isSameContent = false;
              }
            }
          } catch (error) {
            console.warn('获取文件大小失败:', error);
            isSameSize = false;
            isSameContent = false;
          }
        }
      }

      // 如果文件完全一致（同一文件或大小和内容都相同），检查书籍列表中是否已存在
      if (isSameFile || (isSameSize && isSameContent)) {
        const bookExists = await hasBook(targetPath);
        if (bookExists) {
          showAppToast({
            title: "书籍已存在",
            description: `《${fileInfo.fileName}》已在书架中，已跳过导入`,
            variant: "default",
          });
          setPendingImportFile(null);
          return;
        }
        // 如果书籍不存在但文件完全一致，显示替换对话框让用户选择恢复或跳过
        const settings = settingsStore.state.app;
        if (settings.rememberReplaceFile && settings.replaceExistingFile) {
          const replaceAction = settings.replaceExistingFile;
          if (replaceAction === 'skip') {
            showAppToast({
              title: "导入已跳过",
              description: "文件已存在，已跳过导入",
              variant: "default",
            });
            setPendingImportFile(null);
            return;
          } else if (replaceAction === 'restore-existing') {
            // 恢复已存在的书籍（文件大小和内容都相同）
            await performRestoreExistingBook(targetPath, fileInfo.fileName, fileInfo.groupId);
            setPendingImportFile(null);
            return;
          }
          // replaceAction === 'replace'，继续导入
        } else {
          // 需要用户选择，默认选中"恢复已存在的书籍"
          setPendingReplaceFile({ fileInfo, action, groupId: fileInfo.groupId, isSameSize: true, isSameContent: true });
          setPendingImportFile(null);
          setShowReplaceFileDialog(true);
          return;
        }
      }

      // 如果文件已存在且不是同一文件，显示替换对话框
      if (targetFileExists && !isSameFile) {
        const settings = settingsStore.state.app;
        if (settings.rememberReplaceFile && settings.replaceExistingFile) {
          const replaceAction = settings.replaceExistingFile;
          if (replaceAction === 'skip') {
            showAppToast({
              title: "导入已跳过",
              description: "文件已存在，已跳过导入",
              variant: "default",
            });
            setPendingImportFile(null);
            return;
          } else if (replaceAction === 'restore-existing' && isSameSize && isSameContent) {
            // 恢复已存在的书籍（文件大小和内容都相同）
            await performRestoreExistingBook(targetPath, fileInfo.fileName, fileInfo.groupId);
            setPendingImportFile(null);
            return;
          } else if (replaceAction === 'rename-import' && (!isSameSize || !isSameContent)) {
            // 重命名导入（文件大小或内容不同）
            await performRenameImport(fileInfo, action, fileInfo.groupId);
            setPendingImportFile(null);
            return;
          }
          // replaceAction === 'replace'，继续导入
        } else {
          // 需要用户选择
          setPendingReplaceFile({ fileInfo, action, groupId: fileInfo.groupId, isSameSize, isSameContent });
          setPendingImportFile(null);
          setShowReplaceFileDialog(true);
          return;
        }
      }

      // 文件不存在或是同一文件，或者用户选择替换，直接导入
      await performImportWithAction(fileInfo, action, targetFileExists && !isSameFile);
    } else {
      // Web 端直接导入
      await performImportWithAction(fileInfo, action, false);
    }

    setPendingImportFile(null);
  };

  /**
   * 处理文件替换确认
   */
  const handleReplaceFileConfirm = async (replaceAction: ReplaceFileAction, _remember: boolean) => {
    setShowReplaceFileDialog(false);

    const pending = pendingReplaceFile();
    if (!pending) {
      showAppToast({
        title: "导入失败",
        description: "文件信息丢失，请重新选择文件",
        variant: "error",
      });
      return;
    }

    if (replaceAction === 'cancel') {
      setPendingReplaceFile(null);
      setPendingImportFile(null);
      return;
    }

    if (replaceAction === 'skip') {
      showAppToast({
        title: "导入已跳过",
        description: "文件已存在，已跳过导入",
        variant: "default",
      });
      setPendingReplaceFile(null);
      setPendingImportFile(null);
      return;
    }

    if (replaceAction === 'restore-existing') {
      // 恢复已存在的书籍（使用已存在文件的路径，文件大小相同）
      const booksDir = await getBooksDirectory();
      const targetPath = await join(booksDir, pending.fileInfo.fileName);

      await performRestoreExistingBook(targetPath, pending.fileInfo.fileName, pending.groupId);
      setPendingReplaceFile(null);
      setPendingImportFile(null);
      return;
    }

    if (replaceAction === 'rename-import') {
      // 重命名导入（文件大小不同，避免覆盖）
      if (pending.action) {
        await performRenameImport(pending.fileInfo, pending.action, pending.groupId);
      } else {
        // 需要先选择操作（复制/移动）
        setPendingImportFile({ ...pending.fileInfo, groupId: pending.groupId });
        setPendingReplaceFile({ ...pending, renameImport: true });
        setShowImportActionDialog(true);
      }
      setPendingReplaceFile(null);
      setPendingImportFile(null);
      return;
    }

    // replaceAction === 'replace'
    // 如果用户已记住导入操作，直接使用；否则显示导入操作选择对话框
    if (pending.action) {
      await performImportWithAction(pending.fileInfo, pending.action, true);
      setPendingReplaceFile(null);
      setPendingImportFile(null);
    } else {
      // 用户选择替换但没有记住导入操作，需要选择复制或移动
      setPendingImportFile({ ...pending.fileInfo, groupId: pending.groupId });
      setPendingReplaceFile(null);
      setShowImportActionDialog(true);
    }
  };

  /**
   * 恢复已存在的书籍（文件大小相同，可能是同一文件的不同路径）
   * 使用已存在文件的路径，更新书籍信息，不替换文件
   */
  const performRestoreExistingBook = async (existingFilePath: string, fileName: string, groupId?: number) => {
    try {
      // 先检查书籍是否已存在
      const bookExists = await hasBook(existingFilePath);
      if (bookExists) {
        showAppToast({
          title: "书籍已存在",
          description: `《${fileName}》已在书架中，已跳过导入`,
          variant: "default",
        });
        return;
      }

      const fs = await getFileSystem();

      // 读取已存在文件的内容
      const content = await fs.readFile(existingFilePath);

      // 使用已存在文件的路径导入
      const result = await importLocalBookFromContent(
        existingFilePath,
        fileName,
        content,
        { groupId }
      );

      if (result) {
        showAppToast({
          title: "恢复成功",
          description: `已恢复《${result.book.name}》，共 ${result.chapterCount} 章`,
          variant: "success",
          progress: true,
        });
        window.dispatchEvent(new CustomEvent("bookshelf-refresh"));
      }
    } catch (e) {
      const error = e instanceof Error ? e : null;
      const msg = error?.message || "恢复失败";
      showAppToast({
        title: "恢复失败",
        description: msg,
        variant: "error",
      });
      window.dispatchEvent(new CustomEvent("bookshelf-refresh"));
    }
  };

  /**
   * 重命名导入（文件大小不同，避免覆盖）
   * 生成新的文件名（添加序号），然后执行导入
   */
  const performRenameImport = async (
    fileInfo: { bookUrl: string; fileName: string; content?: ArrayBuffer },
    action: ImportAction,
    groupId?: number
  ) => {
    try {

      const booksDir = await getBooksDirectory();
      const fs = await getFileSystem();

      // 生成新文件名（添加序号）
      const ext = await extname(fileInfo.fileName);
      const baseName = await basename(fileInfo.fileName, ext);
      let newFileName = fileInfo.fileName;
      let counter = 1;

      while (true) {
        const testPath = await join(booksDir, newFileName);
        const exists = await fs.exists(testPath);
        if (!exists) break;

        newFileName = `${baseName}_${counter}${ext}`;
        counter++;

        // 防止无限循环
        if (counter > 1000) {
          throw new Error('无法生成唯一的文件名');
        }
      }

      // 使用新文件名执行导入
      await performImportWithAction(
        { ...fileInfo, fileName: newFileName },
        action,
        false, // 新文件名不存在，不需要替换
        groupId
      );
    } catch (e) {
      const error = e instanceof Error ? e : null;
      const msg = error?.message || "重命名导入失败";
      showAppToast({
        title: "导入失败",
        description: msg,
        variant: "error",
      });
      window.dispatchEvent(new CustomEvent("bookshelf-refresh"));
    }
  };

  /**
   * 使用指定的操作执行导入
   * 优化：先执行文件操作（复制/移动），再从目标位置读取内容
   * @param replaceFile 是否替换已存在的文件
   */
  const performImportWithAction = async (
    fileInfo: { bookUrl: string; fileName: string; content?: ArrayBuffer },
    action: ImportAction,
    replaceFile: boolean = false,
    groupId?: number
  ) => {
    try {

      let finalBookUrl = fileInfo.bookUrl;
      let finalContent: ArrayBuffer;
      const finalGroupId = groupId !== undefined ? groupId : (bookshelfStore.state.currentGroup >= 0 ? bookshelfStore.state.currentGroup : undefined);

      if (action === 'none') {
        finalBookUrl = fileInfo.bookUrl;
        if (isAndroidContentUri(fileInfo.bookUrl) || fileInfo.bookUrl.startsWith('local::')) {
          if (!fileInfo.content) {
            throw new Error('Android Content URI 必须预先读取内容');
          }
          finalContent = fileInfo.content;
        } else if (fileInfo.content) {
          finalContent = fileInfo.content;
        } else {
          finalContent = await readBytes(parseStorageRef(finalBookUrl));
        }
      } else if (isTauri()) {
        // Tauri 环境：先执行文件操作，再读取内容
        if (isAndroidContentUri(fileInfo.bookUrl) || fileInfo.bookUrl.startsWith('local::')) {
          if (!fileInfo.content) {
            throw new Error('Android Content URI 必须预先读取内容');
          }
          if (action === 'copy') {
            finalBookUrl = await copyFileToBooksDir(
              fileInfo.bookUrl,
              fileInfo.fileName,
              replaceFile,
              fileInfo.content,
            );
          } else {
            finalBookUrl = await moveFileToBooksDir(
              fileInfo.bookUrl,
              fileInfo.fileName,
              replaceFile,
              fileInfo.content,
            );
          }
          finalContent = fileInfo.content;
        } else {
          if (action === 'copy') {
            finalBookUrl = await copyFileToBooksDir(fileInfo.bookUrl, fileInfo.fileName, replaceFile);
          } else {
            finalBookUrl = await moveFileToBooksDir(fileInfo.bookUrl, fileInfo.fileName, replaceFile);
          }
          finalContent = await readBytes(parseStorageRef(finalBookUrl));
        }
      } else if (await needsImportFileActionSelection()) {
        if (!fileInfo.content) {
          throw new Error('Web 端必须预先读取内容');
        }
        if (action === 'copy') {
          finalBookUrl = await copyWebFileToBooksDir(
            fileInfo.bookUrl,
            fileInfo.fileName,
            fileInfo.content,
            replaceFile,
          );
          finalContent = await readBytes(parseStorageRef(finalBookUrl));
        } else if (action === 'move') {
          finalBookUrl = await moveWebFileToBooksDir(
            fileInfo.bookUrl,
            fileInfo.fileName,
            fileInfo.content,
            replaceFile,
          );
          finalContent = await readBytes(parseStorageRef(finalBookUrl));
        } else {
          finalBookUrl = fileInfo.bookUrl;
          finalContent = fileInfo.content;
        }
      } else {
        if (!fileInfo.content) {
          throw new Error('Web 端必须预先读取内容');
        }
        finalContent = fileInfo.content;
      }

      const result = await importLocalBookFromContent(
        finalBookUrl,
        fileInfo.fileName,
        finalContent,
        { groupId: finalGroupId, keepSourceRef: action === 'none' },
      );

      if (result) {
        showAppToast({
          title: "导入成功",
          description: `已导入《${result.book.name}》，共 ${result.chapterCount} 章`,
          variant: "success",
          progress: true,
        });
        window.dispatchEvent(new CustomEvent("bookshelf-refresh"));
      }
    } catch (e) {
      const error = e instanceof Error ? e : null;
      const msg = error?.message || "导入失败";
      showAppToast({
        title: "导入失败",
        description: msg,
        variant: "error",
      });
      window.dispatchEvent(new CustomEvent("bookshelf-refresh"));
    }
  };

  // 主题与设置同步到 document（持久化在 settingsStore，此处只做应用）
  createEffect(() => {
    applyThemeToDocument(settingsStore.state.app.theme);
  });

  // HMR 已跳过开屏时仍须 show 主窗口（tauri.conf visible:false）
  onMount(() => {
    if (!showSplash()) {
      void ensureMainWindowVisible();
    }
  });

  // 设置尽早加载；数据库等重初始化延至开屏结束，避免动画结束后主线程长时间无响应
  onMount(() => {
    void settingsStore.loadSettings().catch((e) => {
      console.warn('加载应用设置失败:', e);
    });
  });

  let appHeavyInitStarted = false;
  createEffect(() => {
    if (showSplash() || appHeavyInitStarted) return;
    appHeavyInitStarted = true;
    void (async () => {
      try {
        if (isDesktopTauri()) {
          clearAppDataDirCache();
        }
        console.log('正在初始化数据库...');
        await initDatabase();
        setDbInitialized(true);
        console.log('数据库初始化成功');

        const { clearInvalidChapterCache } = await import('@/lib/chapter-cache');
        void clearInvalidChapterCache().catch((e) => {
          console.warn('[chapter-cache] clearInvalidChapterCache', e);
        });

        await initBookshelfLayoutSettings();
        void sourcesStore.loadBookSources().catch((e) => {
          console.warn("[sources] loadBookSources on app init", e);
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('数据库初始化失败:', error);
        setDbError(errorMessage);
        setDbInitialized(true);
      }
    })();
  });

  // 设置窗口状态监听器
  onMount(() => {
    const cleanup = setupWindowStateListeners();

    onCleanup(() => {
      cleanup();
    });
  });

  onMount(() => {
    registerInnerWebOpener((payload) => {
      setInnerWebPayload(payload);
    });
    registerInnerWebPatch((payload) => {
      setInnerWebPayload(payload);
    });
    registerInnerWebClose(() => {
      setInnerWebPayload(null);
    });

    const onBookImport = (ev: Event) => {
      const detail = (ev as CustomEvent<{ url?: string }>).detail;
      const u = detail?.url?.trim();
      if (!u?.startsWith("http")) return;
      if (isInnerWebSessionActive()) {
        cancelInnerWebClose();
      }
      void identifySourcesFromNetwork(u);
    };
    window.addEventListener(READER_BOOKSOURCE_IMPORT_NETWORK_EVENT, onBookImport);
    const onBookSourceIdentify = (ev: Event) => {
      const detail = (ev as CustomEvent<{ url?: string }>).detail;
      const u = detail?.url?.trim();
      if (u) void handleLegadoNetworkImport(u);
    };
    window.addEventListener(READER_BOOKSOURCE_IDENTIFY_EVENT, onBookSourceIdentify);
    const onRssImport = (ev: Event) => {
      const u = (ev as CustomEvent<{ url?: string }>).detail?.url?.trim();
      if (!u) return;
      void importRssFromNetworkUrl(u)
        .then((n) =>
          showAppToast({ title: '导入 RSS', description: `已导入 ${n} 条`, variant: 'default' })
        )
        .catch((err) =>
          showAppToast({ title: '导入 RSS 失败', description: String(err), variant: 'destructive' })
        );
    };
    window.addEventListener(READER_RSS_IMPORT_EVENT, onRssImport);
    const onReplaceImport = (ev: Event) => {
      const u = (ev as CustomEvent<{ url?: string }>).detail?.url?.trim();
      if (!u) return;
      void importReplaceRulesFromNetworkUrl(u)
        .then((n) =>
          showAppToast({
            title: '导入替换规则',
            description: `已导入 ${n} 条`,
            variant: 'default',
          })
        )
        .catch((err) =>
          showAppToast({
            title: '导入替换规则失败',
            description: String(err),
            variant: 'destructive',
          })
        );
    };
    window.addEventListener(READER_REPLACE_RULE_IMPORT_EVENT, onReplaceImport);

    const unlistenFns: Array<() => void> = [];
    if (isTauri()) {
      void (async () => {
        try {
          const { listen } = await import("@tauri-apps/api/event");
          unlistenFns.push(
            await listen<{ uri?: string }>("reader-import-deeplink", (e) => {
              const uri = e.payload?.uri?.trim();
              if (!uri) return;
              const parsed = parseReaderImportDeepLink(uri);
              if (!parsed) return;
              if (parsed.kind === 'unsupported') {
                showAppToast({ title: '暂不支持', description: parsed.reason, variant: 'default' });
                return;
              }
              void handleLegadoNetworkImport(
                parsed.kind === 'bookSourceNetwork' ||
                  parsed.kind === 'rssNetwork' ||
                  parsed.kind === 'replaceRuleNetwork' ||
                  parsed.kind === 'determineType'
                  ? parsed.src
                  : uri
              );
            })
          );
          unlistenFns.push(
            await listen<{ url?: string }>("reader-network-booksource-import", (e) => {
              const u = e.payload?.url?.trim();
              if (u?.startsWith("http")) void identifySourcesFromNetwork(u);
            })
          );
        } catch (err) {
          console.warn("[App] Tauri deeplink/import listen failed", err);
        }
      })();
    }

    onCleanup(() => {
      window.removeEventListener(READER_BOOKSOURCE_IMPORT_NETWORK_EVENT, onBookImport);
      window.removeEventListener(READER_BOOKSOURCE_IDENTIFY_EVENT, onBookSourceIdentify);
      window.removeEventListener(READER_RSS_IMPORT_EVENT, onRssImport);
      window.removeEventListener(READER_REPLACE_RULE_IMPORT_EVENT, onReplaceImport);
      for (const fn of unlistenFns) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }
    });
  });

  // 监听窗口宽度变化
  onMount(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    onCleanup(() => {
      window.removeEventListener("resize", handleResize);
    });
  });

  async function processSingleLocalBookPick(picked: LocalBookPickResult) {
    try {
      const groupId = bookshelfStore.state.currentGroup;
      const settings = settingsStore.state.app;

      if (isTauri()) {
        if (!settings.rememberImportAction || !settings.importBookAction) {
          setPendingImportFile({ ...picked, groupId: groupId >= 0 ? groupId : undefined });
          setShowImportActionDialog(true);
          return;
        }

        const { targetUrl: targetPath, exists: targetFileExists } =
          await resolveTauriImportTarget(picked.fileName);
        const fs = await getFileSystem();
        const safRoot = await usesSafTreeBooksRoot();

        let isSameFile = false;
        let isSameSize = false;
        let isSameContent = false;

        if (targetFileExists) {
          if (safRoot) {
            const srcUrl = formatStorageRef(parseStorageRef(picked.bookUrl));
            isSameFile = srcUrl === targetPath || picked.bookUrl === targetPath;
          } else {
            try {
              const normalizedSource = await normalize(
                toNativeFilesystemPath(picked.bookUrl),
              );
              const normalizedTarget = await normalize(targetPath);
              isSameFile = normalizedSource === normalizedTarget;
            } catch (error) {
              console.warn('路径规范化失败，假设不是同一文件:', error);
              isSameFile = false;
            }
          }

          if (!isSameFile) {
            try {
              const sourceSize = picked.content
                ? picked.content.byteLength
                : await fs.getFileSize(picked.bookUrl);
              const targetSize = safRoot
                ? (await readBytes(parseStorageRef(targetPath))).byteLength
                : await fs.getFileSize(targetPath);
              isSameSize = sourceSize === targetSize;
              if (isSameSize) {
                try {
                  let sourceHash: string;
                  if (picked.content) {
                    const hashBuffer = await crypto.subtle.digest('SHA-256', picked.content);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    sourceHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
                  } else {
                    sourceHash = await fs.getFileHash(picked.bookUrl);
                  }
                  let targetHash: string;
                  if (safRoot) {
                    const targetBytes = await readBytes(parseStorageRef(targetPath));
                    const hashBuffer = await crypto.subtle.digest('SHA-256', targetBytes);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    targetHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
                  } else {
                    targetHash = await fs.getFileHash(targetPath);
                  }
                  isSameContent = sourceHash === targetHash;
                } catch (error) {
                  console.warn('计算文件哈希失败:', error);
                  isSameContent = false;
                }
              }
            } catch (error) {
              console.warn('获取文件大小失败:', error);
              isSameSize = false;
              isSameContent = false;
            }
          }
        }

        if (isSameFile || (isSameSize && isSameContent)) {
          const bookExists = await hasBook(targetPath);
          if (bookExists) {
            showAppToast({
              title: "书籍已存在",
              description: `《${picked.fileName}》已在书架中，已跳过导入`,
              variant: "default",
            });
            return;
          }
          if (settings.rememberReplaceFile && settings.replaceExistingFile) {
            const replaceAction = settings.replaceExistingFile;
            if (replaceAction === 'skip') {
              showAppToast({
                title: "导入已跳过",
                description: "文件已存在，已跳过导入",
                variant: "default",
              });
              return;
            } else if (replaceAction === 'restore-existing') {
              await performRestoreExistingBook(targetPath, picked.fileName, groupId >= 0 ? groupId : undefined);
              return;
            }
          } else {
            setPendingReplaceFile({
              fileInfo: picked,
              action: settings.importBookAction,
              groupId: groupId >= 0 ? groupId : undefined,
              isSameSize: true,
              isSameContent: true,
            });
            setShowReplaceFileDialog(true);
            return;
          }
        }

        if (targetFileExists && !isSameFile) {
          if (settings.rememberReplaceFile && settings.replaceExistingFile) {
            const replaceAction = settings.replaceExistingFile;
            if (replaceAction === 'skip') {
              showAppToast({
                title: "导入已跳过",
                description: "文件已存在，已跳过导入",
                variant: "default",
              });
              return;
            } else if (replaceAction === 'restore-existing' && isSameSize && isSameContent) {
              await performRestoreExistingBook(targetPath, picked.fileName, groupId >= 0 ? groupId : undefined);
              return;
            } else if (replaceAction === 'rename-import' && (!isSameSize || !isSameContent)) {
              await performRenameImport(picked, settings.importBookAction, groupId >= 0 ? groupId : undefined);
              return;
            }
          } else {
            setPendingReplaceFile({
              fileInfo: picked,
              action: settings.importBookAction,
              groupId: groupId >= 0 ? groupId : undefined,
              isSameSize,
              isSameContent,
            });
            setShowReplaceFileDialog(true);
            return;
          }
        }

        await performImportWithAction(picked, settings.importBookAction, targetFileExists && !isSameFile);
      } else {
        if (!picked.content) {
          showAppToast({
            title: "导入失败",
            description: "无法读取文件内容",
            variant: "error",
          });
          return;
        }

        if (await needsImportFileActionSelection()) {
          if (await needsImportBookActionPrompt()) {
            setPendingImportFile({
              ...picked,
              groupId: groupId >= 0 ? groupId : undefined,
            });
            setShowImportActionDialog(true);
            return;
          }

          const root = await getManagedBooksRoot();
          const safeName = sanitizeManagedFileName(picked.fileName);
          const targetRef =
            root.kind === 'dir-handle'
              ? { kind: 'dir-handle' as const, value: `${root.value}/${safeName}` }
              : null;
          const targetUrl = targetRef ? formatStorageRef(targetRef) : '';
          const targetExists = targetRef ? await fileRefExists(targetRef) : false;

          if (targetExists) {
            const bookExists = targetUrl ? await hasBook(targetUrl) : false;
            if (bookExists) {
              showAppToast({
                title: "书籍已存在",
                description: `《${picked.fileName}》已在书架中，已跳过导入`,
                variant: "default",
              });
              return;
            }
          }

          await performImportWithAction(
            picked,
            settings.importBookAction ?? 'copy',
            targetExists,
            groupId >= 0 ? groupId : undefined,
          );
          return;
        }

        const result = await importLocalBookFromContent(
          picked.bookUrl,
          picked.fileName,
          picked.content,
          { groupId: groupId >= 0 ? groupId : undefined }
        );
        if (result) {
          showAppToast({
            title: "导入成功",
            description: `已导入《${result.book.name}》，共 ${result.chapterCount} 章`,
            variant: "success",
          });
          window.dispatchEvent(new CustomEvent("bookshelf-refresh"));
        }
      }
    } catch (e) {
      const error = e instanceof Error ? e : null;
      const msg = error?.message || "导入失败";
      showAppToast({
        title: "导入失败",
        description: msg,
        variant: "error",
      });
      window.dispatchEvent(new CustomEvent("bookshelf-refresh"));
    }
  }

  const ensureBooksStorageForImport = async (): Promise<boolean> => {
    const { hasBooksStorageRoot } = await import('@/lib/platform/fs/managed-storage');
    if (!hasBooksStorageRoot()) {
      setShowBookDirectoryDialog(true);
      return false;
    }
    return true;
  };

  function handleBookshelfImportLocal() {
    setShowImportBookLocalDialog(true);
  }

  const runLocalBookFilePick = async () => {
    setImportBookLocalBusy(true);
    try {
      if (!(await ensureBooksStorageForImport())) return;
      const candidates = await pickLocalBookFiles();
      if (!candidates?.length) return;
      const groupId = bookshelfStore.state.currentGroup;
      const settings = settingsStore.state.app;
      const gid = groupId >= 0 ? groupId : undefined;
      if (candidates.length === 1) {
        await processSingleLocalBookPick(candidates[0]!);
        return;
      }
      if (await needsImportBookActionPrompt()) {
        setPendingImportBatch(candidates);
        setPendingImportBatchGroupId(gid);
        setShowImportActionDialog(true);
        return;
      }
      const action = settings.importBookAction ?? 'copy';
      await runBatchLocalBookImport(candidates, action, gid);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '选择文件失败';
      showAppToast({ title: '选择文件失败', description: msg, variant: 'error' });
    } finally {
      setImportBookLocalBusy(false);
    }
  };

  const runLocalBookDirectoryPick = async () => {
    setImportBookLocalBusy(true);
    try {
      if (!(await ensureBooksStorageForImport())) return;
      const candidates = await pickLocalBookDirectory();
      if (!candidates) return;
      if (candidates.length === 0) {
        showAppToast({
          title: '目录导入',
          description: '该目录中未找到符合条件的书籍文件（txt、epub）',
          variant: 'default',
        });
        return;
      }
      const groupId = bookshelfStore.state.currentGroup;
      const settings = settingsStore.state.app;
      const gid = groupId >= 0 ? groupId : undefined;
      if (await needsImportBookActionPrompt()) {
        setPendingImportBatch(candidates);
        setPendingImportBatchGroupId(gid);
        setShowImportActionDialog(true);
        return;
      }
      const action = settings.importBookAction ?? 'copy';
      await runBatchLocalBookImport(candidates, action, gid);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '选择目录失败';
      showAppToast({ title: '选择目录失败', description: msg, variant: 'error' });
    } finally {
      setImportBookLocalBusy(false);
    }
  };

  const handleBookLocalImportPickFile = () => {
    setShowImportBookLocalDialog(false);
    void runLocalBookFilePick();
  };

  const handleBookLocalImportPickDirectory = () => {
    setShowImportBookLocalDialog(false);
    void runLocalBookDirectoryPick();
  };

  const reduceMotion = () => settingsStore.state.app.reduceMotion;
  const shellTabEnter = () => mainShellTabEnterClass(reduceMotion(), isMobile());

  const getOpenBackLayers = (): BackLayerDefinition[] => {
    const layers: BackLayerDefinition[] = [];

    const push = (id: string, open: boolean, close: () => void) => {
      if (open) layers.push({ id, close });
    };

    push("source-edit", sourceEditTarget() !== null, () => setSourceEditTarget(null));
    push("inner-web", Boolean(innerWebPayload()), () => setInnerWebPayload(null));
    push("source-login", Boolean(sourceLoginDialogSource()), () => setSourceLoginDialogSource(null));
    push(
      "source-variable",
      Boolean(sourceVariableDialogSource()),
      () => setSourceVariableDialogSource(null),
    );
    push(
      "import-source-select",
      showImportSourceSelectDialog(),
      () => setShowImportSourceSelectDialog(false),
    );
    push(
      "source-group-manage",
      showSourceGroupManageDialog(),
      () => setShowSourceGroupManageDialog(false),
    );
    push(
      "import-source-network",
      showImportSourceNetworkDialog(),
      () => setShowImportSourceNetworkDialog(false),
    );
    push(
      "import-source-local",
      showImportSourceLocalDialog(),
      () => setShowImportSourceLocalDialog(false),
    );
    push(
      "import-source-qr",
      showImportSourceQrDialog(),
      () => setShowImportSourceQrDialog(false),
    );
    push(
      "import-book-local",
      showImportBookLocalDialog(),
      () => setShowImportBookLocalDialog(false),
    );
    push(
      "add-book-url",
      showAddBookByUrlDialog(),
      () => setShowAddBookByUrlDialog(false),
    );
    push(
      "book-directory",
      showBookDirectoryDialog(),
      () => setShowBookDirectoryDialog(false),
    );
    push(
      "import-action",
      showImportActionDialog(),
      () => setShowImportActionDialog(false),
    );
    push(
      "replace-file",
      showReplaceFileDialog(),
      () => setShowReplaceFileDialog(false),
    );
    push(
      "source-filter",
      sourceFilterDialogOpen(),
      () => setSourceFilterDialogOpen(false),
    );
    push("sources-manage", showSourcesManage(), () => setShowSourcesManage(false));
    push("group-manage", showGroupManage(), () => setShowGroupManage(false));
    push("bookshelf-manage", showBookshelfManage(), () => setShowBookshelfManage(false));
    push("bookshelf-cache", showBookshelfCache(), () => setShowBookshelfCache(false));
    push("settings-sub", settingsSubPageOpen(), () => settingsSubPageCloseRef.current());
    push(
      "sources-explore-drawer",
      currentPage() === "sources" && sourcesExpandedSourceUrl() != null,
      () => setSourcesExpandedSourceUrl(null),
    );

    // 固定 id：勿用 overlay-${kind}，否则 search→viewer 会换掉层 id 并连触两次 history.back()，误关阅读器
    if (nav.top()) {
      push("overlay-nav", true, () => {
        const top = nav.top();
        if (!top) return;
        if (top.kind === "text-viewer" || isViewerOverlayKind(top.kind)) {
          void requestCloseReader();
          return;
        }
        nav.pop();
      });
    }

    // 叠在 overlay-nav 之上，系统返回先关详情抽屉
    push("book-info-drawer", bookInfoDrawerOpen(), () => closeBookInfo());

    // 须在阅读器叠层之上：否则系统返回会先走 overlay-nav，且弹窗在 z-[110] 下方时点击会误触「点外关闭」
    push("guest-add-shelf", guestAddToShelfOpen(), () => {
      setGuestAddToShelfOpen(false);
      resumeMediaViewerChromeAutoHide();
    });

    return layers;
  };

  const AppChrome = () => {
    const shell = useShellLayout();
    const showTopNav = () => !isStandalonePage() && shell().showTopNavigation;
    const showBottomBar = () => !isStandalonePage() && shell().showBottomBar;

    return (
      <div
        class="min-h-dvh w-full transition-colors duration-300"
        data-reduce-motion={reduceMotion() ? "true" : undefined}
      >
        {/* 数据库初始化错误提示 */}
        <Show when={dbError()}>
          <div
            class={cn(
              "fixed left-0 right-0 z-50 bg-destructive/90 p-4 text-center text-destructive-foreground",
              showTopNav() ? "inset-top-app-bar" : "top-0 safe-area-inset-top"
            )}
          >
            <p class="font-medium">数据库初始化失败: {dbError()}</p>
            <p class="text-sm mt-1">请检查控制台获取详细信息</p>
          </div>
        </Show>

        {/* 开屏动画 */}
        <Show when={showSplash()}>
          <SplashScreen
            onComplete={() => {
              markDevSplashDone();
              setShowSplash(false);
            }}
          />
        </Show>

        {/* 系统托盘 - 全局初始化，不渲染 UI */}
        <Tray />

        {/* 阅读器页面 - 独立页面，不覆盖其他内容 */}

        {/* 渐变背景装饰 */}
        <div class="fixed inset-0 -z-10 overflow-hidden">
          <div class="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
          <div class="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-secondary/5 blur-3xl" />
        </div>

        {/* 顶部导航栏：桌面壳层；独立页隐藏 */}
        <Show when={showTopNav()}>
          <div class="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur">
            <Navigation
              currentPage={currentPage()}
              onPageChange={navigateToPage}
            />
          </div>
        </Show>

        {/* 左侧边栏：桌面壳层且宽度 ≥768px；独立页仅隐藏不卸载，避免返回时 useSidebar 上下文丢失 */}
        <Show when={shell().showSidebar}>
          <div
            class={cn(
              "fixed bottom-0 left-0 z-40",
              showTopNav() ? "inset-top-app-bar" : "top-0",
              isStandalonePage() && "hidden pointer-events-none",
            )}
          >
            <SideBar
              currentPage={currentPage()}
              onPageChange={navigateToPage}
              recentBooks={recentBooks() ?? []}
              onOpenRecentBook={(book) => void openRecentBook(book)}
              sidebarState={state}
              onToggleSidebar={toggleSidebar}
            />
          </div>
        </Show>

        {/* 底栏 - 移动壳层；独立页面时隐藏 */}
        <Show when={showBottomBar()}>
          <BottomBar
            currentPage={currentPage()}
            onPageChange={navigateToPage}
          />
        </Show>

        {/* 主容器 - 独立页时仅 hidden，保持挂载以保留书架/探索/书源状态 */}
        <div
          id="main-content-container"
          data-shell-bottom-bar={showBottomBar() ? 'visible' : 'hidden'}
          class={cn(
            "fixed bottom-0 right-0 flex flex-col overflow-hidden bg-background/80 backdrop-blur-sm transition-all duration-200",
            showTopNav() ? "inset-top-app-bar" : "top-0",
            shell().showSidebar
              ? state() === "expanded"
                ? "left-(--sidebar-width)"
                : "left-(--sidebar-width-icon)"
              : "left-0",
            showBottomBar() && "inset-bottom-app-bar",
            isStandalonePage() && "hidden pointer-events-none",
          )}
        >
          {/* 主内容区：flex-1 min-h-0 限制高度，由各页面内部处理滚动 */}
          <main class={cn("flex flex-col flex-1 min-h-0 w-full overflow-hidden", mainShellInset)}>
            {/* 书架：保持挂载，切走再回保留分组/列表状态 */}
            <section
              class={cn(
                mainShellPageRoot,
                currentPage() === "bookshelf" ? shellTabEnter() : "hidden",
              )}
            >
              <div class="flex flex-col flex-1 min-h-0 w-full">
                <div
                  class={cn(
                    'flex flex-col flex-1 min-h-0 w-full',
                    (showGroupManage() ||
                      showBookshelfManage() ||
                      showBookshelfCache()) &&
                    'hidden pointer-events-none',
                  )}
                >
                  <BookShelf
                    active={() => currentPage() === "bookshelf"}
                    onPageChange={navigateToPage}
                    onOpenGroupManage={() => setShowGroupManage(true)}
                    onOpenBookshelfManage={() => setShowBookshelfManage(true)}
                    onImportLocal={handleBookshelfImportLocal}
                    onAddBookByUrl={() => setShowAddBookByUrlDialog(true)}
                    onOpenBook={(book) => openReaderPage(book)}
                    onOpenBookInfo={async (book) => {
                      const source = await getSource(book.origin);
                      if (!source) {
                        showAppToast({
                          title: "无法打开详情",
                          description: "未找到对应书源",
                          variant: "destructive",
                        });
                        return;
                      }
                      openBookInfo({
                        source,
                        book: bookToSearchBook(book),
                        originShell: "bookshelf",
                      });
                    }}
                    onOpenBookshelfCache={(groupId) => {
                      setBookshelfCacheGroupId(groupId);
                      setShowBookshelfCache(true);
                    }}
                    onOpenBookSearch={(q) => openBookSearch(q)}
                  />
                </div>

                <Show when={showGroupManage()}>
                  <BookGroupManage onClose={() => setShowGroupManage(false)} />
                </Show>

                <Show when={showBookshelfManage()}>
                  <BookshelfManagePage
                    onClose={() => setShowBookshelfManage(false)}
                    onOpenBook={(book) => openReaderPage(book)}
                    onOpenBookInfo={async (book) => {
                      const source = await getSource(book.origin);
                      if (!source) {
                        showAppToast({
                          title: "无法打开详情",
                          description: "未找到对应书源",
                          variant: "destructive",
                        });
                        return;
                      }
                      openBookInfo({
                        source,
                        book: bookToSearchBook(book),
                        originShell: "bookshelf",
                      });
                    }}
                  />
                </Show>

                <Show when={showBookshelfCache()}>
                  <BookshelfCachePage
                    groupId={bookshelfCacheGroupId()}
                    groupName={bookshelfStore.state.currentGroupName}
                    onBack={() => setShowBookshelfCache(false)}
                  />
                </Show>
              </div>
            </section>

            {/* 探索页：保持挂载保留状态；active 门控避免隐藏时触发发现请求 */}
            <section
              class={cn(
                mainShellPageRoot,
                currentPage() === "scout" ? shellTabEnter() : "hidden",
              )}
            >
              <ExplorePage
                active={() => nav.isShellActiveUnderBookInfo("scout")}
                onOpenBook={(book) => openReaderPage(book)}
                onOpenBookInfo={(source, book) => {
                  openBookInfo({ source, book, originShell: "scout" });
                }}
                onOpenBookSearch={(scope) => openBookSearch(undefined, scope)}
              />
            </section>

            {/* 书源视图：保持挂载，切到发现页再返回时不重载展开的发现脚本 */}
            <section
              class={cn(
                mainShellPageRoot,
                currentPage() === "sources" ? shellTabEnter() : "hidden",
              )}
            >
              <div class="flex flex-col flex-1 min-h-0 w-full">
                <div
                  class={cn(
                    'flex flex-col flex-1 min-h-0 w-full',
                    showSourcesManage() && 'hidden pointer-events-none',
                  )}
                >
                  <PageToolbar
                    title={sourcePageToolbarTitle()}
                    description={sourcePageToolbarDescription()}
                    titleSlot={
                      <PageToolbarTitleDropdown
                        title={sourcePageToolbarTitle()}
                        description={sourcePageToolbarDescription()}
                        dropdownEnabled={false}
                      />
                    }
                  >
                    <SourcesPageToolbar
                      sourceSearchQuery={sourceSearchQuery()}
                      onSourceSearchQueryChange={(q) => setSourceSearchQuery(q)}
                      sourceSearchMode={sourceSearchMode()}
                      onSourceSearchModeChange={persistSearchMode}
                      sortMode={sourceSortMode()}
                      sortReverse={sourceSortReverse()}
                      onSortModeChange={setSourceSortMode}
                      onSortReverseChange={setSourceSortReverse}
                      filterTooltip={sourceFilterTooltip()}
                      onOpenFilterDialog={() => setSourceFilterDialogOpen(true)}
                      onOpenSourcesManage={() => setShowSourcesManage(true)}
                      showGroupByGroupNameOption={shouldGroupSourcesByGroupName(
                        getEffectiveSourceListFilter(
                          sourceListFilter(),
                          sourceFilterGroupOptions(),
                        ).groupNames,
                      )}
                      sourcesGroupByGroupName={sourcesGroupByGroupName()}
                      onSourcesGroupByGroupNameChange={(v) => setSourcesGroupByGroupName(v)}
                      enableDragSort={sourceEnableDragSort()}
                      onEnableDragSortChange={persistSourceEnableDragSort}
                    />
                  </PageToolbar>
                  <SourcesFilterDialog
                    open={sourceFilterDialogOpen()}
                    onOpenChange={setSourceFilterDialogOpen}
                    sourceGroups={sourceGroups()}
                    appliedFilter={sourceListFilter()}
                    onApply={setSourceListFilter}
                  />
                  <SourcesPage
                    sourceSearchQuery={sourceSearchQuery()}
                    sourceSearchMode={sourceSearchMode()}
                    sourcesGroupByGroupName={sourcesGroupByGroupName()}
                    filterGroupNames={sourceGroups()}
                    appliedFilter={sourceListFilter()}
                    sortMode={sourceSortMode()}
                    sortReverse={sourceSortReverse()}
                    enableDragSort={sourceEnableDragSort()}
                    expandedSourceUrl={sourcesExpandedSourceUrl()}
                    onExpandedSourceUrlChange={setSourcesExpandedSourceUrl}
                    exploreDrawerPresentationOpen={currentPage() === "sources"}
                    onGroupsLoaded={(g) => setSourceGroups(g)}
                    onSourceCountChange={(n) => setSourceCount(n)}
                    onSourceEdit={(source) => openSourceEditor(source)}
                    onSourceVariables={openSourceVariables}
                    onSourceLogin={async (source) => {
                      const url = source.loginUrl?.trim();
                      const hasUi = !!source.loginUi?.trim();
                      const isHttp =
                        !!url && (url.startsWith('http://') || url.startsWith('https://'));
                      if (isHttp && !hasUi) {
                        try {
                          const cookies = getStoredSourceCookiesForInnerWeb(source, url);
                          await openSourceSettingsInApp(url, cookies, {
                            bookSourceUrl: source.bookSourceUrl,
                          });
                        } catch (e) {
                          console.error("打开登录页失败:", e);
                          showAppToast({ title: "打开失败", description: e instanceof Error ? e.message : "请稍后重试", variant: "destructive" });
                        }
                        return;
                      }
                      if (url || hasUi) {
                        setSourceLoginDialogSource(source);
                      }
                    }}
                    onSourceSearch={(source) => {
                      openBookSearch(undefined, formatSourceScope(source));
                    }}
                    onOpenBookSearch={(query, source) => {
                      openBookSearch(query, formatSourceScope(source));
                    }}
                    onExploreSectionClick={async (source, section) => {
                      if (!section.url?.trim()) {
                        showAppToast({
                          title: `${source.sourceName} · ${section.title}`,
                          description: "该分类暂无链接",
                          variant: "default",
                        });
                        return;
                      }
                      if (!shouldOpenExplorePageForSection(section)) {
                        try {
                          const opened = await openExploreSectionInInnerWeb(source, section);
                          if (!opened) {
                            showAppToast({
                              title: "无法打开",
                              description: section.title,
                              variant: "destructive",
                            });
                          }
                        } catch (e) {
                          console.error("打开发现子项失败:", e);
                          showAppToast({
                            title: "打开失败",
                            description: e instanceof Error ? e.message : "请稍后重试",
                            variant: "destructive",
                          });
                        }
                        return;
                      }
                      nav.push({ kind: "explore", source, section });
                    }}
                  />
                </div>

                <Show when={showSourcesManage()}>
                  <SourcesManagePage
                    onClose={() => setShowSourcesManage(false)}
                    sourceSearchMode={sourceSearchMode()}
                    onSourceSearchModeChange={persistSearchMode}
                    enableDragSort={sourceEnableDragSort()}
                    onEnableDragSortChange={persistSourceEnableDragSort}
                    onSourceEdit={(source) => openSourceEditor(source)}
                    onSourceVariables={openSourceVariables}
                    onSourcesNew={() => openSourceEditor()}
                    onSourcesImportLocal={() => void openLocalBookSourceImport()}
                    onSourcesImportNetwork={() => setShowImportSourceNetworkDialog(true)}
                    onSourcesImportQR={() => setShowImportSourceQrDialog(true)}
                    showSourcesImportQR={isMobile()}
                    onOpenSourceGroupManage={() => setShowSourceGroupManageDialog(true)}
                  />
                </Show>
              </div>
            </section>

            {/* 订阅视图 */}
            <Show when={currentPage() === "subscription"}>
              <section
                class={cn(shellTabEnter(), mainShellPageRoot)}
              >
                <PageToolbar
                  title="订阅"
                  description="管理你的订阅内容"
                  titleSlot={
                    <PageToolbarTitleDropdown
                      title="订阅"
                      description="管理你的订阅内容"
                      dropdownEnabled={false}
                    />
                  }
                />
                <div class={mainShellPageScroll}>
                  <div class="rounded-2xl border border-border/50 bg-card p-6 text-center text-muted-foreground">
                    <p>订阅功能开发中...</p>
                  </div>
                </div>
              </section>
            </Show>

            {/* 书签视图 */}
            <Show when={currentPage() === "bookmark"}>
              <section
                class={cn(shellTabEnter(), mainShellPageRoot)}
              >
                <PageToolbar
                  title="书签"
                  description="查看你的书签"
                  titleSlot={
                    <PageToolbarTitleDropdown
                      title="书签"
                      description="查看你的书签"
                      dropdownEnabled={false}
                    />
                  }
                />
                <div class={mainShellPageScroll}>
                  <BookmarkPage />
                </div>
              </section>
            </Show>

            {/* 记录视图 */}
            <Show when={currentPage() === "record"}>
              <section
                class={cn(shellTabEnter(), mainShellPageRoot)}
              >
                <PageToolbar
                  title="阅读记录"
                  description="查看你的阅读历史"
                  titleSlot={
                    <PageToolbarTitleDropdown
                      title="阅读记录"
                      description="查看你的阅读历史"
                      dropdownEnabled={false}
                    />
                  }
                />
                <div class={mainShellPageScroll}>
                  <ReadRecordPage
                    onOpenBook={(book) => openReaderPage(book)}
                    onSearchBook={(name) => openBookSearch(name)}
                  />
                </div>
              </section>
            </Show>


            {/* 设置视图：保持挂载，子页切换时保留主列表滚动位置 */}
            <section
              class={cn(
                mainShellPageRoot,
                currentPage() === "settings" ? shellTabEnter() : "hidden",
              )}
            >
              <SettingsPage
                onSubPageOpenChange={(open, close) => {
                  setSettingsSubPageOpen(open);
                  settingsSubPageCloseRef.current = close ?? (() => {});
                }}
              />
            </section>
          </main>
        </div>

        {/* 独立页导航栈：栈内条目均保持挂载，仅栈顶可见（对齐 Legado Activity 栈） */}
        <Show when={isStandalonePage()}>
          <For each={nav.entries()}>
            {(entry) => {
              const overlayTopId = () => nav.top()?.id;
              return (
              <OverlayStackEntry entry={entry} topId={overlayTopId}>
                <Switch>
                  <Match when={entry.kind === "text-viewer"}>
                    <BookReader
                entryVisible={() => overlayEntryVisible(entry)}
                onClose={requestCloseReader}
                onOpenBookInfo={async () => {
                const book = textViewerStore.state.book;
                if (!book) return;
                if (book.origin === "local") {
                  showAppToast({ title: "书籍信息", description: "本地书籍暂无书籍信息页", variant: "default" });
                  return;
                }
                const source = await getSource(book.origin);
                if (!source || !source.enabled) {
                  showAppToast({ title: "无法打开", description: "书源不存在或已禁用", variant: "default" });
                  return;
                }
                const sb: SearchBook = {
                  name: book.name,
                  author: book.author ?? "",
                  bookUrl: book.bookUrl,
                  kind: book.kind,
                  origin: book.origin,
                  originName: book.originName,
                  type: book.type,
                  tocUrl: book.tocUrl,
                  coverUrl: book.coverUrl ?? book.customCoverUrl,
                  intro: book.intro ?? book.customIntro,
                  latestChapterTitle: book.latestChapterTitle,
                  time: 0,
                  originOrder: book.originOrder ?? 0,
                  chapterWordCount: 0,
                  respondTime: 0,
                };
                openBookInfo({ source, book: sb, originShell: nav.shellTab() });
              }}
                    />
                  </Match>
                  <Match when={entry.kind === "image-viewer"}>
                    <ImageViewerPage
                      entryVisible={() => overlayEntryVisible(entry)}
                      onClose={requestCloseReader}
                    />
                  </Match>
                  <Match when={entry.kind === "audio-viewer"}>
                    <AudioViewerPage
                      entryVisible={() => overlayEntryVisible(entry)}
                      onClose={requestCloseReader}
                    />
                  </Match>
                  <Match when={entry.kind === "video-viewer"}>
                    <VideoViewerPage
                      entryVisible={() => overlayEntryVisible(entry)}
                      onClose={requestCloseReader}
                    />
                  </Match>
                  <Match when={entry.kind === "file-viewer"}>
                    <FileViewerPage
                      entryVisible={() => overlayEntryVisible(entry)}
                      onClose={requestCloseReader}
                    />
                  </Match>
                  <Match when={entry.kind === "explore"}>
                    {(() => {
                      const e = entry as Extract<OverlayEntry, { kind: "explore" }>;
                      return (
                    <ExploreSourcePage
                      source={e.source}
                      section={e.section}
                      onBack={() => nav.pop()}
                      onOpenBook={(book) => openReaderPage(book)}
                      onOpenBookInfo={(source, book) => {
                        openBookInfo({ source, book, originShell: "sources" });
                      }}
                    />
                      );
                    })()}
                  </Match>
                  <Match when={entry.kind === "book-info"}>
                    {(() => {
                      const e = entry as Extract<OverlayEntry, { kind: "book-info" }>;
                      return (
                    <BookInfoPage
                      book={e.book}
                      source={e.source}
                      continueReading={bookInfoCanContinueReading()}
                      onBack={closeBookInfo}
                      onOpenBook={(book, catalog, sourceFromPage) =>
                        openBookFromBookInfo(book, catalog, sourceFromPage ?? e.source)
                      }
                    />
                      );
                    })()}
                  </Match>
                  <Match when={entry.kind === "book-search"}>
                    {(() => {
                      const e = entry as Extract<OverlayEntry, { kind: "book-search" }>;
                      return (
                    <BookSearchPage
                      initialQuery={e.initialQuery}
                      initialScope={e.initialScope}
                      active={() => overlayEntryVisible(entry)}
                      overlayStack
                      onBack={() => nav.pop()}
                      onOpenBook={(book) => openReaderPage(book)}
                      onOpenBookInfo={(source, book) => {
                        openBookInfo({ source, book, originShell: e.originShell });
                      }}
                    />
                      );
                    })()}
                  </Match>
                  <Match when={entry.kind === "remote-book"}>
                    <RemoteBookPage
                      onClose={() => nav.pop()}
                      groupId={
                        bookshelfStore.state.currentGroup >= 0
                          ? bookshelfStore.state.currentGroup
                          : undefined
                      }
                    />
                  </Match>
                </Switch>
              </OverlayStackEntry>
            );
            }}
          </For>
        </Show>

        {/* 书籍信息抽屉（抽屉模式，覆盖在当前页面之上） */}
        <Show when={bookInfoUsesDrawer() ? bookInfoDrawer() : undefined}>
          {(ctx) => {
            const { book, source } = ctx();
            return (
              <BookInfoDrawer
                open={bookInfoDrawerOpen()}
                onOpenChange={(open) => {
                  if (!open) finalizeBookInfoDrawerDismiss();
                  else setBookInfoDrawerOpen(true);
                }}
                book={book}
                source={source}
                continueReading={bookInfoCanContinueReading()}
                onBack={closeBookInfo}
                onOpenBook={(book, catalog, sourceFromPage) =>
                  openBookFromBookInfo(book, catalog, sourceFromPage ?? source)
                }
              />
            );
          }}
        </Show>

        {/* 书籍目录选择弹窗 */}
        <BookDirectoryDialog
          open={showBookDirectoryDialog()}
          onOpenChange={handleBookDirectoryDialogClose}
          onOpenSettings={() => navigateToPage("settings")}
        />

        {/* 导入操作选择弹窗 */}
        <ImportActionDialog
          open={showImportActionDialog()}
          onOpenChange={setShowImportActionDialog}
          onConfirm={handleImportActionConfirm}
        />

        {/* 文件替换确认弹窗 */}
        <ReplaceFileDialog
          open={showReplaceFileDialog()}
          onOpenChange={setShowReplaceFileDialog}
          fileName={pendingReplaceFile()?.fileInfo.fileName || ''}
          isSameSize={pendingReplaceFile()?.isSameSize ?? false}
          isSameContent={pendingReplaceFile()?.isSameContent ?? false}
          onConfirm={handleReplaceFileConfirm}
        />

        <AddBookByUrlDialog
          open={showAddBookByUrlDialog()}
          onOpenChange={setShowAddBookByUrlDialog}
        />

        {/* 书源本地/网络导入（对齐 legado） */}
        <ImportBookLocalDialog
          open={showImportBookLocalDialog()}
          busy={importBookLocalBusy()}
          onOpenChange={setShowImportBookLocalDialog}
          onPickFile={handleBookLocalImportPickFile}
          onPickDirectory={handleBookLocalImportPickDirectory}
        />
        <ImportSourceLocalDialog
          open={showImportSourceLocalDialog()}
          busy={importSourceLocalBusy()}
          portalZClass={bookSourceImportDialogPortalZ()}
          onOpenChange={setShowImportSourceLocalDialog}
          onPickFile={handleLocalImportPickFile}
          onPickDirectory={handleLocalImportPickDirectory}
        />
        <ImportSourceNetworkDialog
          open={showImportSourceNetworkDialog()}
          onOpenChange={(open) => {
            setShowImportSourceNetworkDialog(open);
            if (!open) setImportSourceNetworkPresetUrl("");
          }}
          presetUrl={importSourceNetworkPresetUrl()}
          portalZClass={bookSourceImportDialogPortalZ()}
          onIdentify={(url) => {
            void identifySourcesFromNetwork(url);
          }}
        />
        <ImportSourceQrDialog
          open={showImportSourceQrDialog()}
          onOpenChange={setShowImportSourceQrDialog}
          portalZClass={bookSourceImportDialogPortalZ()}
          onIdentify={(raw) => {
            void identifySourcesFromQrRaw(raw);
          }}
        />
        <ImportSourceSelectDialog
          open={showImportSourceSelectDialog()}
          loading={importSourceLoading()}
          sources={importSourceCandidates()}
          comparisons={importSourceComparisons()}
          selectedUrls={importSourceSelectedUrls()}
          keepName={importKeepName()}
          keepGroup={importKeepGroup()}
          keepEnable={importKeepEnable()}
          groupName={importGroupName()}
          groupOptions={importGroupOptions()}
          adjustGroup={importAdjustGroup()}
          portalZClass={bookSourceImportDialogPortalZ()}
          onOpenChange={(open) => {
            setShowImportSourceSelectDialog(open);
            if (!open) releaseBookSourceImportPanelIfNeeded();
          }}
          onToggle={toggleImportSourceSelected}
          onSelectAllToggle={toggleImportSourceSelectAll}
          onInvertSelect={toggleImportSourceInvert}
          onSelectNewToggle={toggleImportSourceSelectNew}
          onSelectUpdateToggle={toggleImportSourceSelectUpdate}
          onKeepNameChange={setImportKeepName}
          onKeepGroupChange={setImportKeepGroup}
          onKeepEnableChange={setImportKeepEnable}
          onGroupNameChange={setImportGroupName}
          onAdjustGroupChange={setImportAdjustGroup}
          onConfirm={() => {
            void confirmImportSelectedSources();
          }}
        />
        <SourceGroupManageDialog
          open={showSourceGroupManageDialog()}
          onOpenChange={setShowSourceGroupManageDialog}
          onGroupsChange={() => window.dispatchEvent(new CustomEvent('sources-refresh'))}
        />
        <SourceLoginDialog
          open={!!sourceLoginDialogSource()}
          onOpenChange={(open) => {
            if (!open && shouldSuppressLoginDialogDismiss()) return;
            if (!open) setSourceLoginDialogSource(null);
          }}
          source={sourceLoginDialogSource()}
          onOpenSourceVariables={openSourceVariables}
        />
        <SourceVariableDialog
          open={!!sourceVariableDialogSource()}
          source={sourceVariableDialogSource()}
          onOpenChange={(open) => {
            if (!open) setSourceVariableDialogSource(null);
          }}
        />
        <ReaderGuestAddToShelfDialog
          open={guestAddToShelfOpen()}
          bookName={
            textViewerStore.state.book?.name ??
            viewerStore.state.book?.name ??
            ""
          }
          adding={guestAddToShelfBusy()}
          onOpenChange={(open) => {
            // 仅关闭提示，不退出阅读器；退出由「暂不加入」或确认后加入流程处理
            if (!open && !guestAddToShelfBusy()) {
              setGuestAddToShelfOpen(false);
              resumeMediaViewerChromeAutoHide();
            }
          }}
          onDecline={() => void finishCloseReader()}
          onConfirm={() => void confirmGuestAddToShelf()}
        />
        <InnerWebHost
          payload={innerWebPayload()}
          onClose={() => setInnerWebPayload(null)}
        />
        <Show when={sourceEditTarget()} keyed>
          {(target) => (
            <Portal mount={document.body}>
              <SourceEditPage
                sourceUrl={target === "new" ? undefined : (target as string)}
                onClose={() => setSourceEditTarget(null)}
                onOpenSourceVariables={openSourceVariables}
                onOpenLogin={async (source) => {
                const url = source.loginUrl?.trim();
                const hasUi = !!source.loginUi?.trim();
                const isHttp =
                  !!url && (url.startsWith("http://") || url.startsWith("https://"));
                if (isHttp && !hasUi) {
                  try {
                    const cookies = getStoredSourceCookiesForInnerWeb(source, url);
                    await openSourceSettingsInApp(url, cookies, {
                      bookSourceUrl: source.sourceUrl,
                    });
                  } catch (e) {
                    console.error("打开登录页失败:", e);
                    showAppToast({
                      title: "打开失败",
                      description: e instanceof Error ? e.message : "请稍后重试",
                      variant: "destructive",
                    });
                  }
                  return;
                }
                if (url || hasUi) {
                  setSourceLoginDialogSource(source);
                }
              }}
                onImportFromQr={(raw) => void identifySourcesFromQrRaw(raw)}
              />
            </Portal>
          )}
        </Show>
      </div>
    );
  };

  return (
    <ShellLayoutProvider windowWidth={windowWidth}>
      <AppBackNavigationBridge getOpenLayers={getOpenBackLayers} />
      <AppChrome />
    </ShellLayoutProvider>
  );
}

/** 应用级侧边栏宽度（覆盖 ui/sidebar 默认 16rem，与 w-48 一致） */
const appSidebarStyle = {
  "--sidebar-width": "12rem",
  "--sidebar-width-icon": "3rem",
} as const;

/** 模块级单例，避免 App 重渲染时 Toaster icons 引用变化导致整棵 Toaster 重建 */
const appToastIcons = createAppToastIcons();

function App() {
  return (
    <SidebarProvider style={appSidebarStyle}>
      <AppContent />
      <Portal mount={document.body}>
        <div class="reader-toast-host" data-kb-top-layer style={appToastHostStyle()}>
          <SonnerInteractionFix />
          <Toaster
            duration={DEFAULT_TOAST_DURATION}
            theme="system"
            position="bottom-right"
            expand={getAppToastVisibleLimit() > 1}
            visibleToasts={getAppToastVisibleLimit()}
            closeButton
            richColors={false}
            icons={appToastIcons}
            swipeDirections={["bottom", "right"]}
            class={APP_TOAST_Z}
          />
        </div>
      </Portal>
    </SidebarProvider>
  );
}

export default App;
