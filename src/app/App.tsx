import { createSignal, createEffect, createMemo, createResource, For, Match, Show, Switch, onMount, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { Navigation, type PageType } from "@/components/shell/Navigation";
import { PageToolbar } from "@/components/shell/PageToolbar";
import { PageToolbarTitleDropdown } from "@/components/shell/PageToolbarTitleDropdown";
import { SourcesPageToolbar } from "@/components/media/reader/sources/SourcesPageToolbar";
import { SourcesFilterDialog } from "@/components/media/reader/sources/SourcesFilterDialog";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import type { ReadingRulePageId } from "@/lib/settings/reading-rules-nav";
import { ReplaceRulesPage } from "@/pages/media/reader/replace-rules/ReplaceRulesPage";
import { TxtTocRulesPage } from "@/pages/media/reader/txt-toc-rules/TxtTocRulesPage";
import { DictRulesPage } from "@/pages/media/reader/dict-rules/DictRulesPage";
import { ThemeStudioPage } from "@/pages/settings/ThemeStudioPage";
import { ThemesManagePage } from "@/pages/settings/ThemesManagePage";
import { GlobalThemeEffectsLayer } from "@/components/theme/GlobalThemeEffectsLayer";
import { SideBar } from "@/components/shell/SideBar";
import { ModuleSidebarRail } from "@/components/shell/ModuleSidebarRail";
import { BottomBar } from "@/components/shell/BottomBar";
import {
  GlobalMediaPlayer,
  useGlobalMediaPlayerFixedInset,
} from "@/components/shell/GlobalMediaPlayer";
import { TvMiniPlayer } from "@/components/media/viewer/video/tv/TvMiniPlayer";
import { registerTvMiniOpenShell, tvMiniPlayerStore } from "@/stores/tv-mini-player";
import { getTvHubState } from "@/stores/tv-hub/section";
import { isTvMiniPlayerEnabled, getTvPlayUiState } from "@/stores/tv-hub/tv-play-ui";
import { hasTvPlayerSession } from "@/lib/media/tv/play/tv-player-runtime";
import {
  AppBackNavigationBridge,
  type BackLayerDefinition,
} from "@/components/shell/AppBackNavigationBridge";
import { Tray } from "@/components/shell/Tray";
import { SplashScreen } from "@/components/shell/SplashScreen";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { ReaderPage } from "@/pages/media/reader/ReaderPage";
import { ReaderShelfPanel } from "@/pages/media/reader/ReaderShelfPanel";
import { ReaderSettingsPage } from "@/pages/media/reader/ReaderSettingsPage";
import { MusicPage } from "@/pages/media/audio/MusicPage";
import { TvPage } from "@/pages/media/video/TvPage";
import { TvSettingsPage } from "@/pages/media/video/TvSettingsPage";
import { SubscribePage } from "@/pages/media/subscribe/SubscribePage";
import { SubscribeDiscoverPage } from "@/pages/media/subscribe/SubscribeDiscoverPage";
import { SubscribeSettingsPage } from "@/pages/media/subscribe/SubscribeSettingsPage";
import { DownloadShell } from "@/pages/media/download/DownloadShell";
import { BookshelfCachePage } from "@/pages/media/reader/bookshelf/BookshelfCachePage";
import { SourcesPage } from "@/pages/media/reader/sources/SourcesPage";
import { SourcesManagePage } from "@/pages/media/reader/sources/SourcesManagePage";
import { SourceEditPage } from "@/pages/media/reader/sources/SourceEditPage";
import { ExploreSourcePage } from "@/pages/media/reader/explore/ExploreSourcePage";
import { ExplorePage } from "@/pages/media/reader/explore/ExplorePage";
import { BookInfoPage } from "@/pages/media/reader/book-info/BookInfoPage";
import { BookInfoDrawer } from "@/pages/media/reader/book-info/BookInfoDrawer";
import { BookGroupManage } from "@/pages/media/reader/bookshelf/BookGroupManagePage";
import { BookshelfManagePage } from "@/pages/media/reader/bookshelf/BookshelfManagePage";
import { BookSearchPage, formatSourceScope } from "@/pages/media/reader/bookshelf/BookSearchPage";
import { bookToSearchBook } from "@/lib/bookshelf/book-to-search-book";
import { openAudioHubShell, isAudioHubBookUrl } from "@/app/open-content";
import {
  effectiveSourceTypeFilter,
  SourcesTypeTabs,
} from "@/components/media/reader/sources/SourcesTypeTabs";
import { navigateToMusicHub } from "@/stores/shell-tabs";
import { subscribeHubSectionValue, setSubscribeSection } from "@/stores/subscribe-hub/section";
import { registerGlobalAudioOpenViewer } from "@/lib/media/audio/audio-shell-controls";
import { registerMusicHotkeys } from "@/lib/media/audio/platform/music-hotkeys";
import {
  BookReader,
  ImageViewerPage,
  AudioViewerPage,
  VideoViewerPage,
  FileViewerPage,
  PdfViewerPage,
} from "@/pages/media/reader/viewer";
import { BookmarkPage } from "@/pages/media/reader/bookmark/BookmarkPage";
import { ReadRecordPage } from "@/pages/media/reader/record/ReadRecordPage";
import {
  RssPage,
  RssSourcesManagePage,
  RssSourceEditPage,
  RssArticleListPage,
  RssReadPage,
  RuleSubPage,
  RssFavoritesPage,
} from "@/pages/media/reader/rss";
import {
  READER_MEDIA_TEXT_FALLBACK_EVENT,
  type ReaderMediaTextFallbackDetail,
} from "@/lib/media/text/reader-media-messages";
import { MediaKind, resolveMediaKindWithSource, isLocalPdfBook } from "@/lib/book-source/book-type";
import { searchBookToEphemeralBook } from "@/lib/bookshelf/book-to-search-book";
import {
  mediaViewerPageForKind,
  NON_TEXT_MEDIA_VIEWER_PAGES,
  normalizeMediaViewerPage,
  type MediaViewerPage,
} from "@/lib/book-source/media-viewer";
import { RemoteBookPage } from "@/pages/media/reader/remote-book/RemoteBookPage";
import { AddBookByUrlDialog } from "@/components/media/reader/books/AddBookByUrlDialog";
import { ImportSourceNetworkDialog } from "@/components/media/reader/sources/ImportSourceNetworkDialog";
import { ImportSourceLocalDialog } from "@/components/media/reader/sources/ImportSourceLocalDialog";
import { ImportBookLocalDialog } from "@/components/media/reader/books/ImportBookLocalDialog";
import { ImportSourceQrDialog } from "@/components/media/reader/sources/ImportSourceQrDialog";
import { ImportCodeDialog } from "@/components/shared/ImportCodeDialog";
import { ImportSourceSelectDialog } from "@/components/media/reader/sources/ImportSourceSelectDialog";
import { ImportThemeLocalDialog } from "@/components/theme/ImportThemeLocalDialog";
import { ImportThemeSelectDialog } from "@/components/theme/ImportThemeSelectDialog";
import { ImportRssSourceSelectDialog } from "@/components/media/reader/rss/ImportRssSourceSelectDialog";
import { RssPageToolbar } from "@/components/media/reader/rss/RssPageToolbar";
import { RssSourcesManageFilterDialog } from "@/components/media/reader/rss/RssSourcesManageFilterDialog";
import { RssReadHistoryDialog } from "@/components/media/reader/rss/RssReadHistoryDialog";
import {
  EMPTY_RSS_SOURCE_LIST_FILTER,
  buildRssManageFilterDomainOptions,
  hasEffectiveRssSourceListFilter,
  type RssSourceListFilterCriteria,
} from "@/lib/rss/rss-source-list-filter";
import { SourceGroupManageDialog } from "@/components/media/reader/sources/SourceGroupManageDialog";
import { getActiveShelfNavigation } from "@/lib/bookshelf/active-shelf-navigation";
import { normalizePageType, dispatchMediaRefresh } from "@/lib/media-shelf/compat-keys";
import {
  openReaderAtTab,
  prepareShellNavigation,
} from "@/lib/modules/shell-compat";
import { hasModuleSidebarRailContent, navigateModuleNav } from "@/lib/modules/module-nav-registry";
import {
  resolveShellContentLeft,
  shellContentLeftClass,
} from "@/lib/shell/shell-chrome-inset";
import {
  persistModuleSidebarRailExpanded,
  readModuleSidebarRailExpanded,
} from "@/lib/shell/module-sidebar-rail-state";
import {
  closeReaderBookSearch,
  consumeReaderBookSearchStandaloneRequest,
  openReaderBookSearch,
  readerBookSearchRequest,
  readerBookSearchReturnTab,
} from "@/stores/reader-search-page";
import {
  readerInternalTabValue,
  setReaderInternalTab,
  type ReaderInternalTab,
} from "@/stores/reader-internal-tab";
import { isPreviewBook, resolvePreviewBookForOpen } from "@/lib/bookshelf/preview-book";
import { removePreviewByRef } from "@/lib/database/media-groups";
import { sourcesStore } from "@/stores/sources";
import { textViewerStore, viewerStore } from "@/stores/viewer";
import { initBookshelfLayoutSettings } from "@/stores/bookshelf-layout";
import type { Book, BookSource, NewBookSource, NewRssSource, RssArticle, RssReadRecord, RssSource, SearchBook } from "@/types";
import { ReaderGuestAddToShelfDialog } from "@/components/media/viewer/text/ReaderGuestAddToShelfDialog";
import {
  freezeMediaViewerChromeAutoHide,
  resumeMediaViewerChromeAutoHide,
} from "@/lib/media/media-viewer-chrome-auto-hide-registry";
import { tryRevealMediaViewerChromeOnSystemBack } from "@/lib/media/media-viewer-chrome-back";
import {
  markBackNavigationPreservedHistory,
  ROOT_EXIT_CONFIRM_MS,
} from "@/lib/navigation/back-navigation";
import { syncPageNavigationScopeStack } from "@/lib/navigation/page-navigation-scope";
import { publishActiveOverlayLayer } from "@/lib/ui/overlay-layer-active";
import {
  afterViewerShellOverlaysClosed,
  dismissViewerBodyOverlays,
  requestCloseViewerShellOverlays,
} from "@/lib/ui/overlay-cleanup";
import { clearReadAloudBackgroundExitFlag } from "@/lib/media/text/read-aloud-background";
import { globalMediaPlayerStore } from "@/stores/global-media-player";
import { scheduleOverlayPositionSync } from "@/lib/ui/overlay-position-sync";
import { addSearchBookToShelf } from "@/lib/bookshelf/save-book-to-shelf";
import { ensureShelfBookReadyForReading } from "@/lib/bookshelf/save-book-to-shelf";
import { getReaderProgressSnapshot } from "@/lib/bookshelf/reading-progress-snapshot";
import { getAllSourceGroups, getSource } from "@/lib/database/sources";
import {
  openExploreSectionInInnerWeb,
  shouldOpenExplorePageForSection,
} from "@/lib/book-source/explore-section-action";
import { ShellLayoutProvider, useShellLayout } from "@/components/shell/ShellLayoutProvider";
import { ShellSidebarLifecycle } from "@/components/shell/ShellSidebarLifecycle";
import { cn } from "@/lib/utils";
import {
  hViewport,
  mainShellInset,
  mainShellPageRoot,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from "@/lib/ui/viewport-classes";
import { showAppToast, AppToastHost, createAppToastIcons } from "@/components/shared/AppToasts";
import { initDatabase } from "@/lib/database";
import { clearAppDataDirCache } from "@/lib/platform/app-data-dir";
import { isDesktopTauri } from "@/lib/platform/webview-storage";
import { setupWindowStateListeners } from "@/utils/window-state";
import { settingsStore } from "@/stores/settings";
import {
  DEFAULT_STARTUP_PAGE,
  parseStartupPageTarget,
  persistLastShellPage,
  readLastShellPage,
  STARTUP_PAGE_LAST_USED,
} from "@/lib/settings/main-program-settings";
import { applyThemeToDocument } from "@/lib/theme";
import { applyActiveThemePackToDocument } from "@/lib/theme/theme-runtime";
import { getThemePreset } from "@/lib/database/theme-presets";
import { ThemedComponentBackground } from "@/components/theme/ThemedComponentBackground";
import { ThemePackRuntimeProvider } from "@/components/theme/ThemePackRuntimeProvider";
import { ThemeTargetHost } from "@/components/theme/ThemeTargetHost";
import { componentDataAttr } from "@/lib/theme/preview/component-registry";
import { themeStudioStore } from "@/stores/theme-studio";
import type { ReaderThemePackV1 } from "@/lib/theme/schema/theme-pack-v1";
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
import { isTauri } from "@/lib/platform/detect";
import { getFileSystem, toNativeFilesystemPath } from "@/lib/platform/filesystem";
import { basename, extname, join, normalize } from "@tauri-apps/api/path";
import { BookDirectoryDialog } from "@/components/media/reader/books/BookDirectoryDialog";
import { ImportActionDialog, type ImportAction } from "@/components/media/reader/books/ImportActionDialog";
import { ReplaceFileDialog, type ReplaceFileAction } from "@/components/media/reader/books/ReplaceFileDialog";
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
import {
  loadSourcesPagePrefs,
  saveSourcesPagePrefs,
  loadRssPagePrefs,
  saveRssPagePrefs,
  type RssLayoutMode,
} from "@/lib/search/search-prefs";
import type { SearchMode as RssSearchMode } from "@/lib/search/search-prefs";
import { openRssSourceLogin } from "@/lib/rss/open-rss-source-login";
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
  dismissInnerWebSession,
  type InnerWebPayload,
} from "@/lib/platform/inner-web";
import {
  releaseInnerWebPanelAfterImportDialog,
  retainInnerWebPanelForOverlay,
  shouldManageInnerWebPanelOverlay,
} from "@/lib/platform/inner-web-panel-overlay";
import { APP_INNER_WEB_DIALOG_Z } from "@/lib/ui/overlay-z";
import {
  handleReaderImportDeepLink,
  parseReaderImportDeepLink,
  READER_BOOKSOURCE_IDENTIFY_EVENT,
  READER_RSS_IMPORT_EVENT,
  READER_REPLACE_RULE_IMPORT_EVENT,
} from "@/lib/platform/legado-import-uri";
import { handleMusicOpenUri } from "@/lib/media/audio/music-deeplink";
import { LyricDesktopPage } from "@/pages/media/audio/lyric-desktop/LyricDesktopPage";
import { MusicMiniPlayerPage } from "@/pages/media/audio/music-mini-player/MusicMiniPlayerPage";
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
import type { BookSourceImportProgress } from "@/lib/book-source/import-progress";
import { pickLocalBookSourceFiles } from "@/lib/book-source/pick-local-booksource-file";
import { pickLocalBookSourceDirectory } from "@/lib/book-source/pick-local-booksource-directory";
import {
  importLegadoJsonFromNetworkUrl,
  importReplaceRulesFromNetworkUrl,
} from "@/lib/book-source/import-network-sidecar";
import {
  buildRssImportComparisons,
  defaultRssImportSelection,
  importSelectedRssSources,
  resolveRssSourcesFromNetworkUrl,
  type ImportRssSourceComparison,
} from "@/lib/book-source/import-rss-resolver";
import { getAllRssSourceGroups, getRssSource } from "@/lib/database/rss-sources";
import {
  buildImportComparisons as buildThemeImportComparisons,
  defaultImportSelection as defaultThemeImportSelection,
  flattenResolvedThemes,
  resolveThemesFromLocalFiles,
  resolveThemesFromNetworkUrl,
  resolveThemesFromText,
  type ImportThemeComparison,
  type ThemeImportProgress,
} from "@/lib/theme/import/import-theme-resolver";
import { importSelectedThemes } from "@/lib/theme/import/import-theme-batch";
import { emitThemePresetsChanged } from "@/lib/theme/theme-preset-events";
import { pickLocalThemeFiles } from "@/lib/theme/import/pick-local-theme-file";
import { pickLocalThemeDirectory } from "@/lib/theme/import/pick-local-theme-directory";
import { runAutoRuleSubUpdates } from "@/lib/rss-source";
import { importDatabase } from "@/lib/database/export-import";
import { RssOverlayShell } from "@/components/media/reader/rss/RssOverlayShell";
import { getRssOverlayPortalMount } from "@/lib/rss/rss-overlay-portal";
import { InnerWebHost } from "@/components/media/reader/inner-web/InnerWebHost";
import { SourceLoginDialog } from "@/components/media/reader/sources/SourceLoginDialog";
import { SourceVariableDialog } from "@/components/media/reader/sources/SourceVariableDialog";
import { SourceVerificationDialog } from "@/components/media/reader/sources/SourceVerificationDialog";
import {
  registerSourceVerificationHandler,
  SourceVerificationCancelledError,
  type SourceVerificationRequest,
} from "@/lib/book-source/source-verification";
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
  if (page === "import") return "reader";
  if (page === "subscription") return "subscribe";
  const viewer = normalizeMediaViewerPage(page);
  if (viewer) return viewer;
  return normalizePageType(page);
}

// 内部组件，用于访问 SidebarProvider 的上下文
function AppContent() {
  const restoredPage = normalizeRestoredPage(readHmrData<string>("currentPage", "reader"));
  const nav = createOverlayStack(
    isOverlayPage(restoredPage) ? "reader" : normalizeShellTab(restoredPage),
  );
  const currentPage = nav.currentPage;
  const isStandalonePage = nav.isStandaloneVisible;
  const [settingsReady, setSettingsReady] = createSignal(false);

  createEffect(() => {
    publishActiveOverlayLayer(nav.top(), nav.entries());
  });

  createEffect(() => {
    if (!settingsReady()) return;
    const page = currentPage();
    if (!isOverlayPage(page)) persistLastShellPage(page);
  });

  const [settingsQuickPageReturn, setSettingsQuickPageReturn] = createSignal<
    ReaderInternalTab | null
  >(null);

  const returnFromSettingsQuickPage = () => {
    setSettingsQuickPageReturn(null);
    nav.navigateShell('settings');
  };

  const navigateFromSettingsQuickPage = (page: PageType) => {
    const readerTab = page === 'bookmark' || page === 'record' ? page : null;
    if (readerTab) {
      setSettingsQuickPageReturn(readerTab);
    }
    navigateToPage(page);
  };

  const navigateToPage = (page: PageType) => {
    if (page === "book-search" || page === "media-search") {
      nav.navigateShell("reader");
      openBookSearch();
      return;
    }
    if (page === "remote-book") {
      nav.push({ kind: "remote-book", originShell: nav.shellTab() });
      return;
    }
    if (settingsQuickPageReturn() && page !== 'reader' && page !== 'bookmark' && page !== 'record') {
      setSettingsQuickPageReturn(null);
    }
    const shellPage = prepareShellNavigation(page);
    nav.navigateShell(shellPage);
  };
  const [showSplash, setShowSplash] = createSignal(!isDevSplashDone());
  const [showTvSettings, setShowTvSettings] = createSignal(false);
  const [showSubscribeSettings, setShowSubscribeSettings] = createSignal(false);
  const [showSubscribeDiscover, setShowSubscribeDiscover] = createSignal(false);
  createEffect(() => {
    const section = subscribeHubSectionValue();
    setShowSubscribeSettings(section === 'settings');
    setShowSubscribeDiscover(section === 'discover');
  });
  const [settingsSubPageOpen, setSettingsSubPageOpen] = createSignal(false);
  const settingsSubPageCloseRef: { current: () => void } = { current: () => { } };
  const [readingRulePage, setReadingRulePage] = createSignal<ReadingRulePageId | null>(null);
  // 数据库初始化状态（保留用于将来显示加载状态）
  const [dbInitialized, setDbInitialized] = createSignal(false);
  const [dbError, setDbError] = createSignal<string | null>(null);
  const { state, toggleSidebar, setOpenMobile } = useSidebar();
  const [moduleRailOpen, setModuleRailOpen] = createSignal(readModuleSidebarRailExpanded());
  const toggleModuleRail = () => {
    setModuleRailOpen((open) => {
      const next = !open;
      persistModuleSidebarRailExpanded(next);
      return next;
    });
  };
  const [windowWidth, setWindowWidth] = createSignal(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  const [recentBooks, { refetch: refetchRecentBooks }] = createResource(
    () => dbInitialized(),
    (initialized) => (initialized ? getRecentReadBooks(5) : Promise.resolve([])),
    { initialValue: [] as RecentReadBook[] },
  );

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
  const [showThemesManage, setShowThemesManage] = createSignal(false);
  /** null=关闭；'new'=新建；string=编辑该书源 URL */
  const [sourceEditTarget, setSourceEditTarget] = createSignal<null | "new" | string>(null);

  function openSourceEditor(source?: BookSource) {
    setSourceEditTarget(source ? source.sourceUrl : "new");
  }

  const openSourcesManagePage = () => {
    openReaderAtTab('sources');
    nav.navigateShell('reader');
    setShowSourcesManage(true);
  };

  const openThemesManagePage = () => {
    navigateToPage('settings');
    setShowThemesManage(true);
  };
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
  const [showImportSourceCodeDialog, setShowImportSourceCodeDialog] = createSignal(false);
  const [showImportSourceSelectDialog, setShowImportSourceSelectDialog] = createSignal(false);
  const [importSourceNetworkPresetUrl, setImportSourceNetworkPresetUrl] = createSignal("");
  const [importSourceLoading, setImportSourceLoading] = createSignal(false);
  const [importSourceProgress, setImportSourceProgress] = createSignal<BookSourceImportProgress | null>(null);
  const [importSourceCandidates, setImportSourceCandidates] = createSignal<NewBookSource[]>([]);
  const [importSourceComparisons, setImportSourceComparisons] = createSignal<ImportSourceComparison[]>([]);
  const [importSourceSelectedUrls, setImportSourceSelectedUrls] = createSignal<Set<string>>(new Set());
  const [importKeepName, setImportKeepName] = createSignal(false);
  const [importKeepGroup, setImportKeepGroup] = createSignal(false);
  const [importKeepEnable, setImportKeepEnable] = createSignal(false);
  const [importGroupName, setImportGroupName] = createSignal('');
  const [importGroupOptions, setImportGroupOptions] = createSignal<string[]>([]);
  const [importAdjustGroup, setImportAdjustGroup] = createSignal(false);
  const [showImportThemeLocalDialog, setShowImportThemeLocalDialog] = createSignal(false);
  const [importThemeLocalBusy, setImportThemeLocalBusy] = createSignal(false);
  const [showImportThemeNetworkDialog, setShowImportThemeNetworkDialog] = createSignal(false);
  const [showImportThemeCodeDialog, setShowImportThemeCodeDialog] = createSignal(false);
  const [showImportThemeSelectDialog, setShowImportThemeSelectDialog] = createSignal(false);
  const [importThemeLoading, setImportThemeLoading] = createSignal(false);
  const [importThemeProgress, setImportThemeProgress] = createSignal<ThemeImportProgress | null>(null);
  const [importThemeCandidates, setImportThemeCandidates] = createSignal<ReaderThemePackV1[]>([]);
  const [importThemeComparisons, setImportThemeComparisons] = createSignal<ImportThemeComparison[]>([]);
  const [importThemeSelectedIds, setImportThemeSelectedIds] = createSignal<Set<string>>(new Set());
  const [importKeepThemeName, setImportKeepThemeName] = createSignal(false);
  const [importKeepThemeActive, setImportKeepThemeActive] = createSignal(false);
  const [importOverwriteThemeAssets, setImportOverwriteThemeAssets] = createSignal(true);
  /** 书源页：分组管理对话框 */
  const [showSourceGroupManageDialog, setShowSourceGroupManageDialog] = createSignal(false);
  /** 书籍搜索页：书架/书源入口 */
  /** 书源登录对话框：配置了 loginUi 时弹窗显示登录页 */
  const [sourceLoginDialogSource, setSourceLoginDialogSource] = createSignal<BookSource | null>(null);
  const [sourceVariableDialogSource, setSourceVariableDialogSource] =
    createSignal<BookSource | null>(null);
  const [sourceVerificationRequest, setSourceVerificationRequest] =
    createSignal<SourceVerificationRequest | null>(null);
  let sourceVerificationCompleter: {
    resolve: (value: string) => void;
    reject: (reason?: unknown) => void;
  } | null = null;

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
  createEffect(() => {
    if (!innerWebPayload() && isInnerWebSessionActive()) {
      cancelInnerWebClose();
    }
  });
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

  /** 订阅：源管理全屏叠层 */
  const [showRssManage, setShowRssManage] = createSignal(false);
  /** null=关闭；'new'=新建；string=编辑 RSS 源 URL */
  const [rssEditTarget, setRssEditTarget] = createSignal<null | "new" | string>(null);
  /** RSS 文章列表 */
  const [rssArticleListTarget, setRssArticleListTarget] = createSignal<{
    sourceUrl: string;
    sortName?: string;
  } | null>(null);
  /** RSS 阅读 */
  const [rssReadTarget, setRssReadTarget] = createSignal<{
    source: RssSource;
    article?: RssArticle | null;
    openUrl?: string;
    useStartHtml?: boolean;
  } | null>(null);
  /** 从收藏进入阅读时暂存，关闭阅读后恢复收藏页 */
  const [rssReadResumeFavorites, setRssReadResumeFavorites] = createSignal(false);
  const [showRuleSub, setShowRuleSub] = createSignal(false);
  const [showRssFavorites, setShowRssFavorites] = createSignal(false);
  const [showImportRssNetworkDialog, setShowImportRssNetworkDialog] = createSignal(false);
  const [importRssNetworkPresetUrl, setImportRssNetworkPresetUrl] = createSignal("");
  const [showImportRssSelectDialog, setShowImportRssSelectDialog] = createSignal(false);
  const [importRssLoading, setImportRssLoading] = createSignal(false);
  const [importRssCandidates, setImportRssCandidates] = createSignal<NewRssSource[]>([]);
  const [importRssComparisons, setImportRssComparisons] = createSignal<ImportRssSourceComparison[]>([]);
  const [importRssSelectedUrls, setImportRssSelectedUrls] = createSignal<Set<string>>(new Set());
  const [importRssKeepName, setImportRssKeepName] = createSignal(false);
  const [importRssKeepGroup, setImportRssKeepGroup] = createSignal(false);
  const [importRssKeepEnable, setImportRssKeepEnable] = createSignal(false);
  const [importRssGroupName, setImportRssGroupName] = createSignal("");
  const [importRssGroupOptions, setImportRssGroupOptions] = createSignal<string[]>([]);
  const [importRssAdjustGroup, setImportRssAdjustGroup] = createSignal(false);

  const [rssSearchQuery, setRssSearchQuery] = createSignal("");
  const [rssPageFilter, setRssPageFilter] = createSignal<RssSourceListFilterCriteria>(
    EMPTY_RSS_SOURCE_LIST_FILTER,
  );
  const [rssGroups, setRssGroups] = createSignal<string[]>([]);
  const [rssEnabledSources, setRssEnabledSources] = createSignal<RssSource[]>([]);
  const [rssCount, setRssCount] = createSignal(0);
  const [rssHistoryOpen, setRssHistoryOpen] = createSignal(false);
  const [rssPageFilterOpen, setRssPageFilterOpen] = createSignal(false);
  const [rssLayoutMode, setRssLayoutMode] = createSignal<RssLayoutMode>('list');
  const [rssSearchMode, setRssSearchMode] = createSignal<RssSearchMode>('name');

  function openRssEditor(source?: RssSource) {
    setRssEditTarget(source ? source.sourceUrl : "new");
  }

  function openRssArticles(source: RssSource) {
    if (source.singleUrl) {
      openRssRead(source, {
        origin: source.sourceUrl,
        link: source.sourceUrl,
        title: source.sourceName,
        sort: "",
        order: 0,
        group: "默认分组",
        read: false,
        type: source.type ?? 0,
        durPos: 0,
      });
      return;
    }
    if (source.startHtml?.trim() && !source.ruleArticles?.trim()) {
      setRssReadTarget({ source, useStartHtml: true });
      return;
    }
    setRssArticleListTarget({ sourceUrl: source.sourceUrl });
  }

  function closeRssRead() {
    setRssReadTarget(null);
    if (rssReadResumeFavorites()) {
      setShowRssFavorites(true);
      setRssReadResumeFavorites(false);
    }
  }

  function openRssRead(
    source: RssSource,
    article?: RssArticle | null,
    opts?: { openUrl?: string; useStartHtml?: boolean },
  ) {
    if (showRssFavorites()) {
      setRssReadResumeFavorites(true);
      setShowRssFavorites(false);
    }
    setRssReadTarget({
      source,
      article: article ?? null,
      openUrl: opts?.openUrl,
      useStartHtml: opts?.useStartHtml,
    });
  }

  async function openRssFromHistoryRecord(record: RssReadRecord) {
    const source = await getRssSource(record.origin);
    if (!source) {
      showAppToast({ title: "订阅源已不存在", variant: "destructive" });
      return;
    }
    setRssReadResumeFavorites(false);
    setRssHistoryOpen(false);
    openRssRead(source, {
      origin: record.origin,
      link: record.record,
      sort: record.sort,
      title: record.title ?? record.record,
      order: 0,
      group: "默认分组",
      read: true,
      type: record.type,
      durPos: record.durPos,
      pubDate: record.pubDate,
      image: record.image,
    });
  }

  function openRssNetworkImport(url?: string) {
    if (url?.trim()) {
      void identifyRssFromNetworkUrl(url.trim());
      return;
    }
    setShowImportRssNetworkDialog(true);
  }

  const openImportRssSelectLoading = async () => {
    const app = settingsStore.state.app;
    setImportRssKeepName(app.importKeepName ?? false);
    setImportRssKeepGroup(app.importKeepGroup ?? false);
    setImportRssKeepEnable(app.importKeepEnable ?? false);
    setImportRssGroupName("");
    setImportRssAdjustGroup(false);
    setImportRssLoading(true);
    setImportRssCandidates([]);
    setImportRssComparisons([]);
    setImportRssSelectedUrls(new Set<string>());
    try {
      setImportRssGroupOptions(await getAllRssSourceGroups());
    } catch {
      setImportRssGroupOptions([]);
    }
    await retainImportSelectDialogPanelIfNeeded();
    setShowImportRssSelectDialog(true);
    scheduleOverlayPositionSync();
    requestAnimationFrame(() => scheduleOverlayPositionSync());
  };

  const applyRecognizedRssSources = async (sources: NewRssSource[], title = "导入订阅源") => {
    if (sources.length === 0) {
      setShowImportRssSelectDialog(false);
      releaseImportSelectDialogPanelIfNeeded();
      showAppToast({ title, description: "未识别到有效订阅源", variant: "default" });
      return;
    }
    const comparisons = await buildRssImportComparisons(sources);
    setImportRssCandidates(sources);
    setImportRssComparisons(comparisons);
    setImportRssSelectedUrls(defaultRssImportSelection(comparisons));
    setImportRssLoading(false);
  };

  const identifyRssFromNetworkUrl = async (url: string) => {
    const normalized = url.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      showAppToast({ title: "网络导入订阅源", description: "链接无效", variant: "destructive" });
      return;
    }
    await openImportRssSelectLoading();
    try {
      const sources = await resolveRssSourcesFromNetworkUrl(normalized);
      await applyRecognizedRssSources(sources, "网络导入订阅源");
    } catch (err) {
      setShowImportRssSelectDialog(false);
      releaseImportSelectDialogPanelIfNeeded();
      showAppToast({ title: "网络导入订阅源失败", description: String(err), variant: "destructive" });
    } finally {
      setImportRssLoading(false);
    }
  };

  const confirmImportSelectedRssSources = async () => {
    const selected = new Set(importRssSelectedUrls());
    const list = importRssCandidates().filter((s) => selected.has(s.sourceUrl));
    if (list.length === 0) {
      showAppToast({ title: "导入订阅源", description: "请先选择订阅源", variant: "default" });
      return;
    }
    try {
      setImportRssLoading(true);
      await settingsStore.setImportSourceKeepOptions({
        importKeepName: importRssKeepName(),
        importKeepGroup: importRssKeepGroup(),
        importKeepEnable: importRssKeepEnable(),
      });
      const n = await importSelectedRssSources(list, {
        keepName: importRssKeepName(),
        keepGroup: importRssKeepGroup(),
        keepEnable: importRssKeepEnable(),
        groupName: importRssGroupName(),
        adjustGroup: importRssAdjustGroup(),
      });
      showAppToast({ title: "导入订阅源", description: `已导入 ${n} 条`, variant: "default" });
      setShowImportRssSelectDialog(false);
      releaseImportSelectDialogPanelIfNeeded();
      setImportRssCandidates([]);
      setImportRssComparisons([]);
      setImportRssSelectedUrls(new Set<string>());
    } catch (err) {
      showAppToast({ title: "导入订阅源失败", description: String(err), variant: "destructive" });
    } finally {
      setImportRssLoading(false);
    }
  };

  createEffect(() => {
    writeHmrData("currentPage", currentPage());
  });

  /** Tab / 全屏子页 / 阅读叠层变化时关掉仍挂着的菜单 Portal，避免 Android 闪到左上角 */
  createEffect(() => {
    currentPage();
    showGroupManage();
    showSourcesManage();
    showRssManage();
    showRuleSub();
    showRssFavorites();
    showImportRssSelectDialog();
    rssHistoryOpen();
    rssPageFilterOpen();
    rssArticleListTarget();
    rssReadTarget();
    rssEditTarget();
    showBookshelfManage();
    showBookshelfCache();
    nav.top();
    dismissFloatingOverlaysForShellChange();
  });

  /** 同步 shell / 叠层请求作用域；叠层不得取消仍挂载的底层页面请求 */
  createEffect(() => {
    const shell = nav.shellTab();
    const entries = nav.entries();
    syncPageNavigationScopeStack([
      {
        key: `${shell}\0shell`,
        cancelExploreOnExit: shell === "reader",
      },
      ...entries.map((entry) => ({
        key: `${entry.kind}\0${entry.id}`,
        cancelExploreOnExit: entry.kind === "explore",
        inheritParent: entry.kind === "book-info",
      })),
    ]);
  });

  /** DEV HMR：页面仍停在媒体阅读器但 store 已重置时，尝试从缓存会话恢复或退回书架 */
  createEffect(() => {
    if (!import.meta.env.DEV) return;
    const page = currentPage();
    if (!isMediaViewerPage(page)) return;
    const top = nav.top();
    if (
      isMusicShellPage() ||
      viewerStore.isMusicHubOpen() ||
      (top && "bookUrl" in top && isAudioHubBookUrl(top.bookUrl))
    ) {
      return;
    }
    if (viewerStore.state.book || viewerStore.state.loading || viewerStore.isMediaViewerBootstrapping()) {
      return;
    }

    const session = readHmrData<{ bookUrl: string; kind: MediaKind } | null>(
      "mediaViewerSession",
      null,
    );
    const musicHubShell = readHmrData<boolean>("musicHubShellActive", false);
    if (musicHubShell || (session?.bookUrl && isAudioHubBookUrl(session.bookUrl))) {
      navigateToPage('music');
      const { section } = navigateToMusicHub();
      if (!viewerStore.isMusicHubOpen()) {
        void viewerStore.openMusicHub({ section });
      }
      return;
    }
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
    if (!isReaderShellPage() || readerInternalTabValue() !== 'sources') return;
    void loadSourcesPagePrefs().then((p) => {
      setSourceSearchMode(p.searchMode);
      setSourceEnableDragSort(p.enableDragSort);
    });
  });

  createEffect(() => {
    if (!isReaderShellPage() || readerInternalTabValue() !== 'rss') return;
    void loadRssPagePrefs().then((p) => {
      setRssLayoutMode(p.layoutMode);
      setRssSearchMode(p.searchMode);
    });
  });

  const persistRssLayoutMode = (mode: RssLayoutMode) => {
    setRssLayoutMode(mode);
    void loadRssPagePrefs().then((p) => saveRssPagePrefs({ ...p, layoutMode: mode }));
  };

  const persistRssSearchMode = (mode: RssSearchMode) => {
    setRssSearchMode(mode);
    void loadRssPagePrefs().then((p) => saveRssPagePrefs({ ...p, searchMode: mode }));
  };

  const persistSearchMode = (mode: SourceSearchMode) => {
    setSourceSearchMode(mode);
    void loadSourcesPagePrefs().then((p) => saveSourcesPagePrefs({ ...p, searchMode: mode }));
  };

  const persistSourceEnableDragSort = (value: boolean) => {
    setSourceEnableDragSort(value);
    void loadSourcesPagePrefs().then((p) => saveSourcesPagePrefs({ ...p, enableDragSort: value }));
  };

  const openBookSearch = (query?: string, scope?: string) => {
    if (nav.shellTab() !== "reader") {
      nav.navigateShell("reader");
    }
    openReaderBookSearch({ initialQuery: query, initialScope: scope });
  };

  const openBookSearchStandalone = (query?: string, scope?: string) => {
    if (readerInternalTabValue() === "search") {
      setReaderInternalTab(readerBookSearchReturnTab());
    }
    nav.push({
      kind: "book-search",
      initialQuery: query?.trim() || undefined,
      initialScope: scope,
      originShell: nav.shellTab(),
    });
  };

  createEffect(() => {
    if (!consumeReaderBookSearchStandaloneRequest()) return;
    const req = readerBookSearchRequest();
    openBookSearchStandalone(req?.initialQuery, req?.initialScope);
  });

  const sourcePageToolbarTitle = () => "来源";

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
  let importSelectDialogPanelRetained = false;

  function releaseImportSelectDialogPanelIfNeeded(): void {
    if (!importSelectDialogPanelRetained) return;
    importSelectDialogPanelRetained = false;
    releaseInnerWebPanelAfterImportDialog();
  }

  /** 内嵌页（如光遇更新页）触发书源导入前先关闭，避免 session 锁定 #root */
  async function dismissInnerWebBeforeImport(): Promise<void> {
    if (!isInnerWebSessionActive()) return;
    importSelectDialogPanelRetained = false;
    releaseImportSelectDialogPanelIfNeeded();
    await dismissInnerWebSession();
  }

  async function retainImportSelectDialogPanelIfNeeded(): Promise<void> {
    if (importSelectDialogPanelRetained) return;
    const p = innerWebPayload();
    if (!isTauri() || !shouldManageInnerWebPanelOverlay({ url: p?.url, html: p?.html })) {
      return;
    }
    importSelectDialogPanelRetained = true;
    await retainInnerWebPanelForOverlay();
  }

  /** 任意关闭路径（含 history.back / 父级 setOpen）均恢复 InnerWeb panel */
  createEffect(() => {
    if (showImportRssSelectDialog() || showImportSourceSelectDialog() || showImportThemeSelectDialog()) return;
    releaseImportSelectDialogPanelIfNeeded();
  });

  const bookSourceImportDialogPortalZ = () =>
    isInnerWebSessionActive() ? APP_INNER_WEB_DIALOG_Z : undefined;

  const openImportSourceSelectLoading = async () => {
    if (nav.shellTab() !== 'sources') {
      nav.navigateShell('sources');
    }
    setImportSourceLoading(true);
    setImportSourceProgress({ stage: 'parse', message: '正在准备导入…' });
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
    await retainImportSelectDialogPanelIfNeeded();
    setShowImportSourceSelectDialog(true);
    scheduleOverlayPositionSync();
    requestAnimationFrame(() => scheduleOverlayPositionSync());
  };

  const reportImportSourceProgress = (progress: BookSourceImportProgress) => {
    setImportSourceProgress(progress);
  };

  const applyRecognizedSources = async (sources: NewBookSource[], title = '导入书源') => {
    if (sources.length === 0) {
      setShowImportSourceSelectDialog(false);
      releaseImportSelectDialogPanelIfNeeded();
      setImportSourceProgress(null);
      showAppToast({ title, description: '未识别到有效书源', variant: 'default' });
      return;
    }
    const comparisons = await buildImportComparisons(sources, reportImportSourceProgress);
    setImportSourceCandidates(sources);
    setImportSourceComparisons(comparisons);
    setImportSourceSelectedUrls(defaultImportSelection(comparisons));
    setImportSourceLoading(false);
    setImportSourceProgress(null);
  };

  const identifySourcesFromNetwork = async (url: string) => {
    const normalized = url.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      showAppToast({ title: '网络导入书源', description: '链接无效', variant: 'destructive' });
      return;
    }
    await dismissInnerWebBeforeImport();
    await openImportSourceSelectLoading();
    try {
      const { sources } = await resolveBookSourcesFromNetworkUrl(
        normalized,
        reportImportSourceProgress,
      );
      await applyRecognizedSources(sources, '网络导入书源');
    } catch (err) {
      setShowImportSourceSelectDialog(false);
      releaseImportSelectDialogPanelIfNeeded();
      setImportSourceProgress(null);
      showAppToast({ title: '网络导入书源失败', description: String(err), variant: 'destructive' });
    } finally {
      setImportSourceLoading(false);
      setImportSourceProgress(null);
    }
  };

  const restoreDatabaseFromFile = async (file: File) => {
    const ok = confirm(
      '检测到数据库备份（.db）。恢复将替换当前全部数据且不可撤销。\n\n是否立即恢复？也可稍后在「设置 → 存储与缓存 → 数据备份」中操作。'
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
      reportImportSourceProgress({ stage: 'file', message: '正在解析文件…', current: 1, total: 1 });
      const { sources, sideImportSummary } = await resolveBookSourcesFromFile(file);
      if (sideImportSummary?.length) {
        showAppToast({
          title: '附带导入',
          description: sideImportSummary.join('、'),
          variant: 'default',
        });
      }
      await applyRecognizedSources(sources, '本地导入书源');
    } catch (err) {
      if (err instanceof DatabaseRestoreRequiredError) {
        setShowImportSourceSelectDialog(false);
        releaseImportSelectDialogPanelIfNeeded();
        await restoreDatabaseFromFile(err.file);
        return;
      }
      setShowImportSourceSelectDialog(false);
      releaseImportSelectDialogPanelIfNeeded();
      showAppToast({ title: '本地导入书源失败', description: String(err), variant: 'destructive' });
    } finally {
      setImportSourceLoading(false);
      setImportSourceProgress(null);
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
        const { sources, sideImportSummary } = await resolveBookSourcesFromLocalFiles(
          files,
          reportImportSourceProgress,
        );
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
          releaseImportSelectDialogPanelIfNeeded();
          await restoreDatabaseFromFile(err.file);
          return;
        }
        setShowImportSourceSelectDialog(false);
        releaseImportSelectDialogPanelIfNeeded();
        showAppToast({
          title: '本地导入书源失败',
          description: String(err),
          variant: 'destructive',
        });
      } finally {
        setImportSourceLoading(false);
        setImportSourceProgress(null);
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
          picked.files,
          reportImportSourceProgress,
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
          releaseImportSelectDialogPanelIfNeeded();
          await restoreDatabaseFromFile(err.file);
          return;
        }
        setShowImportSourceSelectDialog(false);
        releaseImportSelectDialogPanelIfNeeded();
        showAppToast({
          title: '目录导入书源失败',
          description: String(err),
          variant: 'destructive',
        });
      } finally {
        setImportSourceLoading(false);
        setImportSourceProgress(null);
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
    await dismissInnerWebBeforeImport();
    const parsed = parseReaderImportDeepLink(url);
    if (parsed?.kind === 'unsupported') {
      showAppToast({ title, description: parsed.reason, variant: 'default' });
      return;
    }
    if (parsed?.kind === 'rssNetwork') {
      void identifyRssFromNetworkUrl(parsed.src);
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
        if (result.kind === 'rss') {
          void identifyRssFromNetworkUrl(parsed.src);
          return;
        }
        const kindLabel =
          result.kind === 'replace'
            ? '替换规则'
            : result.kind === 'dict'
              ? '字典规则'
              : 'TXT 目录规则';
        showAppToast({
          title: `导入${kindLabel}`,
          description: `已导入 ${result.count} 条`,
          variant: 'default',
        });
        return;
      } catch (err) {
        showAppToast({
          title: '导入失败',
          description: String(err),
          variant: 'destructive',
        });
        return;
      }
    }
    void identifySourcesFromNetwork(parsed?.src ?? url);
  };

  const identifySourcesFromRawText = async (raw: string, via: 'qr' | 'code' = 'qr') => {
    const label = via === 'qr' ? '二维码导入' : '代码导入';
    const parsed = parseReaderImportDeepLink(raw);
    if (parsed?.kind === 'unsupported') {
      showAppToast({ title: label, description: parsed.reason, variant: 'default' });
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
        label
      );
      return;
    }
    await openImportSourceSelectLoading();
    try {
      const { sources } = await resolveBookSourcesFromText(raw, reportImportSourceProgress);
      await applyRecognizedSources(sources, `${label}书源`);
    } catch (err) {
      setShowImportSourceSelectDialog(false);
      releaseImportSelectDialogPanelIfNeeded();
      showAppToast({ title: `${label}书源失败`, description: String(err), variant: 'destructive' });
    } finally {
      setImportSourceLoading(false);
      setImportSourceProgress(null);
    }
  };

  const identifySourcesFromQrRaw = (raw: string) => identifySourcesFromRawText(raw, 'qr');

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
      releaseImportSelectDialogPanelIfNeeded();
      setImportSourceCandidates([]);
      setImportSourceComparisons([]);
      setImportSourceSelectedUrls(new Set<string>());
    } catch (err) {
      showAppToast({ title: '导入书源失败', description: String(err), variant: 'destructive' });
    } finally {
      setImportSourceLoading(false);
      setImportSourceProgress(null);
    }
  };

  const openImportThemeSelectLoading = async () => {
    setImportThemeLoading(true);
    setImportThemeProgress({ stage: 'parse', message: '正在准备导入…' });
    setImportThemeCandidates([]);
    setImportThemeComparisons([]);
    setImportThemeSelectedIds(new Set<string>());
    const app = settingsStore.state.app;
    setImportKeepThemeName(app.importKeepThemeName ?? false);
    setImportKeepThemeActive(app.importKeepThemeActive ?? false);
    setImportOverwriteThemeAssets(app.importOverwriteThemeAssets !== false);
    setShowImportThemeSelectDialog(true);
  };

  const reportImportThemeProgress = (progress: ThemeImportProgress) => {
    setImportThemeProgress(progress);
  };

  const applyRecognizedThemes = async (packs: ReaderThemePackV1[], title = '导入主题') => {
    if (packs.length === 0) {
      setShowImportThemeSelectDialog(false);
      setImportThemeProgress(null);
      showAppToast({ title, description: '未识别到有效主题包', variant: 'default' });
      return;
    }
    const comparisons = await buildThemeImportComparisons(packs);
    setImportThemeCandidates(packs);
    setImportThemeComparisons(comparisons);
    setImportThemeSelectedIds(defaultThemeImportSelection(comparisons));
    setImportThemeLoading(false);
    setImportThemeProgress(null);
  };

  const identifyThemesFromNetwork = async (url: string) => {
    const normalized = url.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      showAppToast({ title: '网络导入主题', description: '链接无效', variant: 'destructive' });
      return;
    }
    await openImportThemeSelectLoading();
    try {
      const resolved = await resolveThemesFromNetworkUrl(normalized, undefined, reportImportThemeProgress);
      await applyRecognizedThemes(flattenResolvedThemes(resolved), '网络导入主题');
    } catch (err) {
      setShowImportThemeSelectDialog(false);
      setImportThemeProgress(null);
      showAppToast({ title: '网络导入主题失败', description: String(err), variant: 'destructive' });
    } finally {
      setImportThemeLoading(false);
      setImportThemeProgress(null);
    }
  };

  const identifyThemesFromRawText = async (raw: string) => {
    await openImportThemeSelectLoading();
    try {
      const resolved = await resolveThemesFromText(raw, undefined, reportImportThemeProgress);
      await applyRecognizedThemes(flattenResolvedThemes(resolved), '代码导入主题');
    } catch (err) {
      setShowImportThemeSelectDialog(false);
      showAppToast({ title: '代码导入主题失败', description: String(err), variant: 'destructive' });
    } finally {
      setImportThemeLoading(false);
      setImportThemeProgress(null);
    }
  };

  const pickAndImportThemeFiles = async () => {
    setImportThemeLocalBusy(true);
    try {
      const files = await pickLocalThemeFiles();
      if (!files?.length) return;
      await openImportThemeSelectLoading();
      const resolved = await resolveThemesFromLocalFiles(files, undefined, reportImportThemeProgress);
      await applyRecognizedThemes(flattenResolvedThemes(resolved));
    } catch (err) {
      setShowImportThemeSelectDialog(false);
      showAppToast({ title: '本地导入主题失败', description: String(err), variant: 'destructive' });
    } finally {
      setImportThemeLocalBusy(false);
      setImportThemeLoading(false);
      setImportThemeProgress(null);
    }
  };

  const pickAndImportThemeDirectory = async () => {
    setImportThemeLocalBusy(true);
    try {
      const picked = await pickLocalThemeDirectory();
      if (!picked?.files.length) return;
      await openImportThemeSelectLoading();
      const resolved = await resolveThemesFromLocalFiles(picked.files, undefined, reportImportThemeProgress);
      await applyRecognizedThemes(flattenResolvedThemes(resolved));
    } catch (err) {
      setShowImportThemeSelectDialog(false);
      showAppToast({ title: '目录导入主题失败', description: String(err), variant: 'destructive' });
    } finally {
      setImportThemeLocalBusy(false);
      setImportThemeLoading(false);
      setImportThemeProgress(null);
    }
  };

  const toggleImportThemeSelected = (id: string, checked: boolean) => {
    setImportThemeSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleImportThemeSelectAll = () => {
    const candidates = importThemeCandidates();
    if (candidates.length === 0) return;
    const allSelected = importThemeSelectedIds().size === candidates.length;
    setImportThemeSelectedIds(
      allSelected ? new Set<string>() : new Set<string>(candidates.map((p) => p.id)),
    );
  };

  const toggleImportThemeInvert = () => {
    const current = importThemeSelectedIds();
    const next = new Set<string>();
    for (const pack of importThemeCandidates()) {
      if (!current.has(pack.id)) next.add(pack.id);
    }
    setImportThemeSelectedIds(next);
  };

  const toggleImportThemeSelectNew = () => {
    const comparisons = importThemeComparisons();
    const current = importThemeSelectedIds();
    const newIds = comparisons.filter((c) => c.status === 'new').map((c) => c.incoming.id);
    const allNewSelected = newIds.length > 0 && newIds.every((id) => current.has(id));
    const next = new Set(current);
    for (const id of newIds) {
      if (allNewSelected) next.delete(id);
      else next.add(id);
    }
    setImportThemeSelectedIds(next);
  };

  const toggleImportThemeSelectUpdate = () => {
    const comparisons = importThemeComparisons();
    const current = importThemeSelectedIds();
    const updateIds = comparisons.filter((c) => c.status === 'update').map((c) => c.incoming.id);
    const allUpdateSelected = updateIds.length > 0 && updateIds.every((id) => current.has(id));
    const next = new Set(current);
    for (const id of updateIds) {
      if (allUpdateSelected) next.delete(id);
      else next.add(id);
    }
    setImportThemeSelectedIds(next);
  };

  const persistImportThemeKeepSettings = async () => {
    await settingsStore.setImportThemeKeepOptions({
      importKeepThemeName: importKeepThemeName(),
      importKeepThemeActive: importKeepThemeActive(),
      importOverwriteThemeAssets: importOverwriteThemeAssets(),
    });
  };

  const confirmImportSelectedThemes = async () => {
    const selected = new Set(importThemeSelectedIds());
    const list = importThemeCandidates().filter((p) => selected.has(p.id));
    if (list.length === 0) {
      showAppToast({ title: '导入主题', description: '请先选择主题', variant: 'default' });
      return;
    }
    try {
      setImportThemeLoading(true);
      await persistImportThemeKeepSettings();
      const result = await importSelectedThemes(list, {
        keepName: importKeepThemeName(),
        keepActive: importKeepThemeActive(),
        overwriteAssets: importOverwriteThemeAssets(),
      });
      showAppToast({
        title: '导入主题',
        description: `已导入 ${result.inserted} 个主题${result.keptActive > 0 ? `，保留激活 ${result.keptActive} 个` : ''}`,
        variant: 'default',
      });
      setShowImportThemeSelectDialog(false);
      setImportThemeCandidates([]);
      setImportThemeComparisons([]);
      setImportThemeSelectedIds(new Set<string>());
      emitThemePresetsChanged();
    } catch (err) {
      showAppToast({ title: '导入主题失败', description: String(err), variant: 'destructive' });
    } finally {
      setImportThemeLoading(false);
      setImportThemeProgress(null);
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

  async function openBookInfoFromViewerBook(book: Book | null | undefined) {
    if (!book) return;
    if (book.origin === "local") {
      showAppToast({
        title: "书籍信息",
        description: "本地书籍暂无书籍信息页",
        variant: "default",
      });
      return;
    }
    const source = await getSource(book.origin);
    if (!source || !source.enabled) {
      showAppToast({
        title: "无法打开",
        description: "书源不存在或已禁用",
        variant: "default",
      });
      return;
    }
    openBookInfo({
      source,
      book: bookToSearchBook(book),
      originShell: nav.shellTab(),
    });
  }

  function syncViewerAfterBookInfoChangeSource(book: Book) {
    if (!bookInfoCanContinueReading()) return;
    if (textViewerStore.state.book) {
      void textViewerStore.openBook(book);
      return;
    }
    const kind = viewerStore.state.kind;
    if (viewerStore.state.book && kind) {
      void viewerStore.openBook(book, kind);
    }
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

  /**
   * 本地 PDF 书籍：不接入 textViewerStore/viewerStore，直接挂载独立 PdfViewerPage 叠层
   */
  function openPdfReaderPage(book: Book) {
    const bookUrl = normalizeOverlayBookUrl(book.bookUrl);
    const existing = nav
      .entries()
      .find((e) => e.kind === "pdf-viewer" && "bookUrl" in e && e.bookUrl === bookUrl);
    if (existing) {
      if (nav.top()?.id !== existing.id) {
        nav.popToEntryId(existing.id);
      }
      return;
    }
    nav.push({ kind: "pdf-viewer", bookUrl });
  }

  function openAudioHub(options?: import('@/app/open-content').OpenAudioHubOptions) {
    navigateToPage('music');
    void openAudioHubShell(
      (opts) => viewerStore.openMusicHub(opts),
      options,
    ).catch((e) => {
      console.error("[audio-hub] 打开失败:", e);
      showAppToast({
        title: "无法打开音乐中心",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    });
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
    if (item.missingFromShelf) {
      const { findPreviewDisplayBookByNameAuthor } = await import(
        "@/lib/bookshelf/preview-book"
      );
      const preview = await findPreviewDisplayBookByNameAuthor(
        item.title,
        item.author,
      );
      if (preview) {
        openReaderPage(preview);
        return;
      }
    }
    openBookSearch(item.title);
  }

  function openReaderPage(
    book: Book,
    initialCatalog?: import("@/types").BookChapter[],
    source?: Pick<BookSource, "sourceType">,
  ) {
    if (isPreviewBook(book)) {
      void resolvePreviewBookForOpen(book).then((resolved) => {
        if (resolved) openReaderPage(resolved, initialCatalog, source);
      });
      return;
    }
    if (isLocalPdfBook(book)) {
      openPdfReaderPage(book);
      return;
    }
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
        const { isLocalBook } = await import("@/lib/local-book");
        const activeBook = isLocalBook(book)
          ? book
          : await ensureShelfBookReadyForReading(book);
        if (kind === MediaKind.text) {
          await textViewerStore.openBook(activeBook, { initialCatalog });
        } else {
          await viewerStore.openBook(activeBook, kind, { initialCatalog });
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

  /** 从壳层播放器回到阅读器：书籍仍在 store 时不重载，避免朗读进度/高亮错位 */
  function reopenTextReaderFromShell(book: Book) {
    globalMediaPlayerStore.clearShell();
    const kind = MediaKind.text;
    const viewerKind = mediaViewerPageForKind(kind);
    const storeReady =
      viewerStore.state.kind === MediaKind.text &&
      viewerStore.state.book?.bookUrl === book.bookUrl &&
      !viewerStore.state.contentBootstrapping;

    if (storeReady) {
      mountReaderOnNav(book, viewerKind);
      return;
    }
    openReaderPage(book);
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

  onMount(() => {
    registerGlobalAudioOpenViewer(openAudioHub);
    onCleanup(() => registerGlobalAudioOpenViewer(null));
  });

  onMount(() => {
    registerTvMiniOpenShell(() => {
      navigateToPage('tv');
    });
    onCleanup(() => registerTvMiniOpenShell(null));
  });

  // 离开全屏播放（侧栏/底栏切页，不仅返回键）时确保进入视频小窗
  createEffect(() => {
    const onTv = normalizePageType(currentPage()) === 'tv';
    const section = getTvHubState().section;
    const onPlayFull = onTv && section === 'play';
    void getTvPlayUiState().miniPlayerEnabled;
    if (onPlayFull) return;
    if (tvMiniPlayerStore.isDismissed()) return;
    if (!isTvMiniPlayerEnabled()) return;
    if (!hasTvPlayerSession()) return;
    tvMiniPlayerStore.enterMini();
  });

  onMount(() => {
    registerSourceVerificationHandler((request) => {
      return new Promise<string>((resolve, reject) => {
        sourceVerificationCompleter = { resolve, reject };
        setSourceVerificationRequest(request);
      });
    });
    onCleanup(() => {
      registerSourceVerificationHandler(null);
      sourceVerificationCompleter?.reject(new SourceVerificationCancelledError());
      sourceVerificationCompleter = null;
    });
  });

  async function finishCloseReader() {
    setGuestAddToShelfOpen(false);
    setGuestAddToShelfBusy(false);
    const top = nav.top();
    if (!top || !isViewerOverlayKind(top.kind)) return;
    const keepBookForBackgroundAloud =
      globalMediaPlayerStore.isReadAloudShellActive() &&
      top.kind === 'text-viewer';
    requestCloseViewerShellOverlays();
    nav.pop();
    await afterViewerShellOverlaysClosed();
    dismissViewerBodyOverlays();
    if (!keepBookForBackgroundAloud) {
      if (top.kind === "text-viewer") {
        await textViewerStore.closeBook();
      } else {
        await viewerStore.closeBook();
        writeHmrData("mediaViewerSession", null);
      }
    }
    clearReadAloudBackgroundExitFlag();
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
        await removePreviewByRef(book.bookUrl);
        dispatchMediaRefresh();
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
        dispatchMediaRefresh();
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
      dispatchMediaRefresh();
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
        const groupId = getActiveShelfNavigation().state.currentGroup;
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
      dispatchMediaRefresh();
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
        dispatchMediaRefresh();
      }
    } catch (e) {
      const error = e instanceof Error ? e : null;
      const msg = error?.message || "恢复失败";
      showAppToast({
        title: "恢复失败",
        description: msg,
        variant: "error",
      });
      dispatchMediaRefresh();
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
      dispatchMediaRefresh();
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
      const finalGroupId = groupId !== undefined ? groupId : (getActiveShelfNavigation().state.currentGroup >= 0 ? getActiveShelfNavigation().state.currentGroup : undefined);

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
        dispatchMediaRefresh();
      }
    } catch (e) {
      const error = e instanceof Error ? e : null;
      const msg = error?.message || "导入失败";
      showAppToast({
        title: "导入失败",
        description: msg,
        variant: "error",
      });
      dispatchMediaRefresh();
    }
  };

  // 主题与设置同步到 document（持久化在 settingsStore，此处只做应用）
  createEffect(() => {
    applyThemeToDocument(settingsStore.state.app.theme);
  });

  createEffect(() => {
    const presetId = settingsStore.state.app.activeThemePresetId;
    if (!presetId || !dbInitialized()) return;
    void getThemePreset(presetId).then((record) => {
      if (record?.manifest.scopes.app) {
        applyActiveThemePackToDocument(record.manifest);
      }
    });
  });

  // HMR 已跳过开屏时仍须 show 主窗口（tauri.conf visible:false）
  onMount(() => {
    if (!showSplash()) {
      void ensureMainWindowVisible();
    }
  });

  // 设置尽早加载；数据库等重初始化延至开屏结束，避免动画结束后主线程长时间无响应
  onMount(() => {
    void settingsStore
      .loadSettings()
      .then(() => {
        const startupPage = settingsStore.state.app.startupPage ?? DEFAULT_STARTUP_PAGE;
        if (startupPage === STARTUP_PAGE_LAST_USED) {
          const lastPage = readLastShellPage();
          if (lastPage) {
            nav.navigateShell(normalizeShellTab(normalizeRestoredPage(lastPage)));
          } else {
            nav.navigateShell('reader');
            navigateModuleNav('reader', 'shelf');
          }
        } else {
          const target = parseStartupPageTarget(startupPage);
          if (target) {
            nav.navigateShell(target.shellPage);
            navigateModuleNav(target.shellPage, target.navId);
          } else {
            nav.navigateShell('reader');
            navigateModuleNav('reader', 'shelf');
          }
        }
        setSettingsReady(true);
      })
      .catch((e) => {
        console.warn('加载应用设置失败:', e);
        setSettingsReady(true);
      });
    if (isDesktopTauri()) {
      void registerMusicHotkeys().catch((e) => {
        console.warn('恢复音乐全局热键失败:', e);
      });
    }
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

        void import('@/lib/cookie-hub')
          .then((m) => m.warmCookieHub(['bili']))
          .catch((e) => console.warn('[cookie-hub] warm failed', e));

        void import('@/lib/media/video/danmaku/normalize-vod-title')
          .then((m) => m.hydrateDanmakuMatchOverrides())
          .catch((e) => console.warn('[danmaku] hydrate overrides failed', e));

        const { runPersistenceHydrateDeferred } = await import('@/lib/persistence');
        await runPersistenceHydrateDeferred().catch((e) => {
          console.warn('[persistence] hydrateDeferred failed', e);
        });

        const { clearInvalidChapterCache } = await import('@/lib/chapter-cache');
        void clearInvalidChapterCache().catch((e) => {
          console.warn('[chapter-cache] clearInvalidChapterCache', e);
        });

        await initBookshelfLayoutSettings();
        void sourcesStore.loadBookSources().catch((e) => {
          console.warn("[sources] loadBookSources on app init", e);
        });
        void sourcesStore.loadRssSources().catch((e) => {
          console.warn("[rss] loadRssSources on app init", e);
        });
        void runAutoRuleSubUpdates().catch((e) => {
          console.warn("[rss] runAutoRuleSubUpdates on app init", e);
        });

        if (isDesktopTauri()) {
          const { ensureWebApiBridge, tryAutoStartWebService } = await import('@/lib/web-api/bridge');
          await ensureWebApiBridge();
          await tryAutoStartWebService();
        } else {
          const { tryAutoStartWebService } = await import('@/lib/web-api/bridge');
          await tryAutoStartWebService();
        }
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
      void identifyRssFromNetworkUrl(u);
    };
    window.addEventListener(READER_RSS_IMPORT_EVENT, onRssImport);
    const onRssImportNetwork = (ev: Event) => {
      const u = (ev as CustomEvent<{ url?: string }>).detail?.url?.trim();
      if (!u) return;
      openRssNetworkImport(u);
    };
    window.addEventListener("rss-import-network", onRssImportNetwork);
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
              void (async () => {
                await dismissInnerWebBeforeImport();
                if (await handleMusicOpenUri(uri)) return;
                await handleReaderImportDeepLink(uri);
              })();
            })
          );
          unlistenFns.push(
            await listen<{ url?: string }>("reader-network-booksource-import", (e) => {
              const u = e.payload?.url?.trim();
              if (u?.startsWith("http")) void identifySourcesFromNetwork(u);
            })
          );
          unlistenFns.push(
            await listen<{ url?: string; target?: string | null }>(
              "reader-inner-web-open-link",
              (e) => {
                const u = e.payload?.url?.trim();
                if (!u?.startsWith("http")) return;
                void import("@/lib/platform/inner-web-navigation").then(({ navigateInnerWebLink }) =>
                  navigateInnerWebLink(u, e.payload?.target ?? null),
                );
              },
            ),
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
      window.removeEventListener("rss-import-network", onRssImportNetwork);
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

  // 监听窗口宽度变化（rAF 合并，避免拖拽改窗时整壳每事件重算）
  onMount(() => {
    let raf = 0;
    const handleResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const w = window.innerWidth;
        setWindowWidth((prev) => (prev === w ? prev : w));
      });
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    onCleanup(() => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
    });
  });

  async function processSingleLocalBookPick(picked: LocalBookPickResult) {
    try {
      const groupId = getActiveShelfNavigation().state.currentGroup;
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
          dispatchMediaRefresh();
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
      dispatchMediaRefresh();
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
      const groupId = getActiveShelfNavigation().state.currentGroup;
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
      const groupId = getActiveShelfNavigation().state.currentGroup;
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
  const visualShadow = () => settingsStore.state.app.enableVisualShadow !== false;
  const visualTransparency = () => settingsStore.state.app.enableVisualTransparency !== false;
  const visualBlur = () => settingsStore.state.app.enableVisualBlur !== false;
  const isReaderShellPage = () => normalizePageType(currentPage()) === "reader";
  const isMusicShellPage = () => normalizePageType(currentPage()) === "music";
  const isTvShellPage = () => normalizePageType(currentPage()) === "tv";
  const isSubscribeShellPage = () => normalizePageType(currentPage()) === "subscribe";
  const isDownloadShellPage = () => normalizePageType(currentPage()) === "download";
  const isReaderInternalTab = (tab: ReaderInternalTab) =>
    isReaderShellPage() && readerInternalTabValue() === tab;

  const readerBookSearchParams = createMemo(() => readerBookSearchRequest());

  const shellTabEnter = () => mainShellTabEnterClass(reduceMotion());

  const getOpenBackLayers = (): BackLayerDefinition[] => {
    const layers: BackLayerDefinition[] = [];

    const push = (id: string, open: boolean, close: () => void) => {
      if (open) layers.push({ id, close });
    };

    push("source-edit", sourceEditTarget() !== null, () => setSourceEditTarget(null));
    push("inner-web", Boolean(innerWebPayload()), () => cancelInnerWebClose());
    push("source-login", Boolean(sourceLoginDialogSource()), () => setSourceLoginDialogSource(null));
    push(
      "source-variable",
      Boolean(sourceVariableDialogSource()),
      () => setSourceVariableDialogSource(null),
    );
    push(
      "import-source-select",
      showImportSourceSelectDialog(),
      () => {
        setShowImportSourceSelectDialog(false);
        releaseImportSelectDialogPanelIfNeeded();
      },
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
      "import-source-code",
      showImportSourceCodeDialog(),
      () => setShowImportSourceCodeDialog(false),
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
    push("themes-manage", showThemesManage(), () => setShowThemesManage(false));
    push("rss-manage", showRssManage(), () => setShowRssManage(false));
    push("rule-sub", showRuleSub(), () => setShowRuleSub(false));
    push("rss-favorites", showRssFavorites(), () => setShowRssFavorites(false));
    push("rss-article-list", !!rssArticleListTarget(), () => setRssArticleListTarget(null));
    push("rss-read", !!rssReadTarget(), () => closeRssRead());
    push("rss-edit", !!rssEditTarget(), () => setRssEditTarget(null));
    push(
      "import-rss-select",
      showImportRssSelectDialog(),
      () => {
        setShowImportRssSelectDialog(false);
        releaseImportSelectDialogPanelIfNeeded();
      },
    );
    push(
      "rss-history",
      rssHistoryOpen(),
      () => setRssHistoryOpen(false),
    );
    push(
      "rss-page-filter",
      rssPageFilterOpen(),
      () => setRssPageFilterOpen(false),
    );
    push("group-manage", showGroupManage(), () => setShowGroupManage(false));
    push("bookshelf-manage", showBookshelfManage(), () => setShowBookshelfManage(false));
    push("bookshelf-cache", showBookshelfCache(), () => setShowBookshelfCache(false));
    push("settings-sub", settingsSubPageOpen(), () => settingsSubPageCloseRef.current());
    push(
      "settings-quick-page",
      settingsQuickPageReturn() != null && isReaderShellPage(),
      returnFromSettingsQuickPage,
    );
    push("reading-rule-page", readingRulePage() != null, () => setReadingRulePage(null));
    push("theme-studio", themeStudioStore.state.open, () => themeStudioStore.closeStudio());
    push(
      "sources-explore-drawer",
      isReaderInternalTab('sources') && sourcesExpandedSourceUrl() != null,
      () => setSourcesExpandedSourceUrl(null),
    );
    push("tv-settings", showTvSettings(), () => setShowTvSettings(false));
    push("subscribe-settings", showSubscribeSettings(), () => setSubscribeSection('home'));
    push("subscribe-discover", showSubscribeDiscover(), () => setSubscribeSection('home'));

    // 固定 id：勿用 overlay-${kind}，否则 search→viewer 会换掉层 id 并连触两次 history.back()，误关阅读器
    if (nav.top()) {
      push("overlay-nav", true, () => {
        if (tryRevealMediaViewerChromeOnSystemBack()) {
          markBackNavigationPreservedHistory();
          showAppToast({
            title: "再按一次退出阅读器",
            duration: ROOT_EXIT_CONFIRM_MS,
          });
          return;
        }
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
    const mediaPlayerFixedInset = useGlobalMediaPlayerFixedInset({
      shellOverlayOpen: isStandalonePage,
      overlayTopKind: () => nav.top()?.kind,
      currentShellPage: currentPage,
      showTopNav,
      showBottomBar,
    });
    const mainContentPlayerInsetStyle = createMemo(() => {
      const inset = mediaPlayerFixedInset();
      if (!inset.top && !inset.bottom) return undefined;
      const h = `${inset.heightPx}px`;
      return {
        ...(inset.top ? { 'padding-top': h } : {}),
        ...(inset.bottom ? { 'padding-bottom': h } : {}),
      } as Record<string, string>;
    });
    const showModuleRail = () =>
      !isStandalonePage() &&
      shell().showModuleSidebarRail &&
      hasModuleSidebarRailContent(currentPage());

    const shellChromeLeftInput = () => ({
      showSidebar: shell().showSidebar,
      sidebarExpanded: state() === "expanded",
      showModuleRail: showModuleRail(),
      moduleRailExpanded: moduleRailOpen(),
    });

    const shellChromeLeft = () => resolveShellContentLeft(shellChromeLeftInput());

    const shellMainLeftClass = () => shellContentLeftClass(shellChromeLeftInput());

    const mainContentShellStyle = createMemo(() => {
      const playerInset = mainContentPlayerInsetStyle();
      return {
        ...(playerInset ?? {}),
        left: shellChromeLeft(),
      } as Record<string, string>;
    });

    const showShellSidebar = () =>
      !isStandalonePage() &&
      (shell().showSidebar || shell().showTopNavigation || shell().showModuleSidebarNav);

    return (
      <div
        class={cn(hViewport, "w-full overflow-hidden transition-colors duration-300")}
        data-reduce-motion={reduceMotion() ? "true" : undefined}
        data-visual-shadow={visualShadow() ? undefined : "false"}
        data-visual-transparency={visualTransparency() ? undefined : "false"}
        data-visual-blur={visualBlur() ? undefined : "false"}
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
            <Navigation currentPage={currentPage()} />
          </div>
        </Show>

        {/* 左侧边栏：桌面固定 host / Sheet */}
        <Show when={showShellSidebar()}>
          <Show
            when={shell().showSidebar}
            fallback={
              <SideBar
                currentPage={currentPage()}
                onPageChange={(page) => {
                  navigateToPage(page);
                  if (shell().sidebarUseSheet) setOpenMobile(false);
                }}
                onOpenReaderRecord={() => {
                  navigateToPage('record');
                  if (shell().sidebarUseSheet) setOpenMobile(false);
                }}
                recentBooks={recentBooks()}
                onOpenRecentBook={(book) => {
                  void openRecentBook(book);
                  if (shell().sidebarUseSheet) setOpenMobile(false);
                }}
                sidebarState={state}
                onToggleSidebar={toggleSidebar}
                offsetTopAppBar={showTopNav()}
              />
            }
          >
            <div
              class={cn(
                "shell-sidebar-host group fixed bottom-0 left-0 z-40 overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-linear",
                showTopNav() ? "inset-top-app-bar" : "top-0",
                state() === "expanded" ? "w-(--sidebar-width)" : "w-(--sidebar-width-icon)",
              )}
              data-state={state()}
              data-collapsible={state() === "collapsed" ? "icon" : undefined}
            >
              <SideBar
                shellHosted
                currentPage={currentPage()}
                onPageChange={(page) => {
                  navigateToPage(page);
                }}
                onOpenReaderRecord={() => navigateToPage('record')}
                recentBooks={recentBooks()}
                onOpenRecentBook={(book) => void openRecentBook(book)}
                sidebarState={state}
                onToggleSidebar={toggleSidebar}
                offsetTopAppBar={showTopNav()}
              />
            </div>
          </Show>
        </Show>

        <Show when={showModuleRail()}>
          <ModuleSidebarRail
            shellPage={currentPage()}
            offsetTopAppBar={showTopNav()}
            mainSidebarExpanded={state() === 'expanded'}
            moduleRailExpanded={moduleRailOpen()}
            onToggleModuleRail={toggleModuleRail}
            recentBooks={recentBooks()}
            onOpenRecentBook={(book) => void openRecentBook(book)}
            onOpenReaderRecord={() => navigateToPage('record')}
          />
        </Show>

        {/* 底栏 - 移动壳层；独立页面时隐藏 */}
        <Show when={showBottomBar()}>
          <BottomBar
            currentPage={currentPage()}
            onPageChange={navigateToPage}
          />
        </Show>

        <GlobalMediaPlayer
          shellOverlayOpen={isStandalonePage}
          overlayTopKind={() => nav.top()?.kind}
          currentShellPage={currentPage}
          showTopNav={showTopNav}
          showBottomBar={showBottomBar}
          shellMainLeftClass={shellMainLeftClass()}
          onOpenAudioHub={openAudioHub}
          onOpenTextReader={(bookUrl) => {
            void getBook(bookUrl).then((book) => {
              if (book) reopenTextReaderFromShell(book);
            });
          }}
        />
        <TvMiniPlayer />
        {/* 主容器 - 独立页时仅 hidden，保持挂载以保留书架/探索/书源状态 */}
        <div
          id="main-content-container"
          data-shell-bottom-bar={showBottomBar() ? 'visible' : 'hidden'}
          style={mainContentShellStyle()}
          class={cn(
            "fixed bottom-0 right-0 flex flex-col overflow-hidden bg-background/80 backdrop-blur-sm transition-all duration-200",
            showTopNav() ? "inset-top-app-bar" : "top-0",
            showBottomBar() && "inset-bottom-app-bar",
            isStandalonePage() && "hidden pointer-events-none",
          )}
          {...componentDataAttr('pageContent')}
        >
          <ThemedComponentBackground componentId="pageContent" />
          {/* 主内容区：flex-1 min-h-0 限制高度，由各页面内部处理滚动 */}
          <main class={cn("relative z-1 flex flex-col flex-1 min-h-0 w-full overflow-hidden", mainShellInset)}>
            {/* 阅读模块：内部 Tab 保持挂载 */}
            <section
              class={cn(
                mainShellPageRoot,
                isReaderShellPage() ? shellTabEnter() : "hidden",
              )}
            >
              <div
                class={cn(
                  'flex min-h-0 flex-1 flex-col',
                  readingRulePage() != null && isReaderShellPage() && 'hidden pointer-events-none',
                )}
              >
                <ReaderPage
                  active={() => isReaderShellPage()}
                  shelf={
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
                        <ReaderShelfPanel
                          active={() => isReaderInternalTab('shelf')}
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
                              originShell: "reader",
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
                              originShell: "reader",
                            });
                          }}
                        />
                      </Show>

                      <Show when={showBookshelfCache()}>
                        <BookshelfCachePage
                          groupId={bookshelfCacheGroupId()}
                          groupName={getActiveShelfNavigation().state.currentGroupName}
                          onBack={() => setShowBookshelfCache(false)}
                        />
                      </Show>
                    </div>
                  }
                  explore={
                    <ExplorePage
                      active={() => nav.isShellActiveUnderBookInfo("reader") && isReaderInternalTab('explore')}
                      onOpenBook={(book) => openReaderPage(book)}
                      onOpenBookInfo={(source, book) => {
                        openBookInfo({ source, book, originShell: "reader" });
                      }}
                      onOpenBookSearch={(scope) => openBookSearch(undefined, scope)}
                    />
                  }
                  sources={
                    <>
                      <div
                        class={cn(
                          'flex flex-col flex-1 min-h-0 w-full',
                          showSourcesManage() && 'hidden pointer-events-none',
                        )}
                      >
                        <PageToolbar
                          class={pageToolbarBottomBorder}
                          title={sourcePageToolbarTitle()}
                          description={sourcePageToolbarDescription()}
                          titleSlot={
                            <PageToolbarTitleDropdown
                              title={sourcePageToolbarTitle()}
                              description={sourcePageToolbarDescription()}
                              dropdownEnabled={false}
                            />
                          }
                          below={<SourcesTypeTabs class="px-4 pb-2" />}
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
                            onOpenSourcesManage={openSourcesManagePage}
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
                          sourceTypeFilter={effectiveSourceTypeFilter() ?? undefined}
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
                          exploreDrawerPresentationOpen={isReaderInternalTab('sources')}
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
                          onSourcesImportCode={() => setShowImportSourceCodeDialog(true)}
                          onOpenSourceGroupManage={() => setShowSourceGroupManageDialog(true)}
                        />
                      </Show>
                    </>
                  }
                  search={
                    <BookSearchPage
                      presentation="embedded"
                      active={() => isReaderInternalTab("search")}
                      initialQuery={readerBookSearchParams()?.initialQuery}
                      initialScope={readerBookSearchParams()?.initialScope}
                      onBack={closeReaderBookSearch}
                      onOpenBook={(book) => openReaderPage(book)}
                      onOpenBookInfo={(source, book) => {
                        openBookInfo({ source, book, originShell: "reader" });
                      }}
                    />
                  }
                  bookmark={
                    <BookmarkPage
                      onBack={
                        settingsQuickPageReturn() === 'bookmark'
                          ? returnFromSettingsQuickPage
                          : undefined
                      }
                      onOpenBookmark={(bookmark, book) => {
                        openReaderPage({
                          ...book,
                          durChapterIndex: bookmark.chapterIndex,
                          durChapterPos: bookmark.chapterPos,
                        });
                      }}
                    />
                  }
                  record={
                    <ReadRecordPage
                      onBack={
                        settingsQuickPageReturn() === 'record'
                          ? returnFromSettingsQuickPage
                          : undefined
                      }
                      onOpenBook={(book) => openReaderPage(book)}
                      onSearchBook={(name) => openBookSearch(name)}
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
                          originShell: "reader",
                        });
                      }}
                    />
                  }
                  rss={
                    <div class="flex min-h-0 flex-1 flex-col">
                      <div
                        class={cn(
                          'flex min-h-0 flex-1 flex-col',
                          (showRssManage() || showRuleSub()) && 'hidden pointer-events-none',
                        )}
                      >
                        <PageToolbar
                          class={pageToolbarBottomBorder}
                          title="订阅"
                          description={
                            hasEffectiveRssSourceListFilter(
                              rssPageFilter(),
                              rssGroups(),
                              buildRssManageFilterDomainOptions(rssEnabledSources()),
                            )
                              ? `共 ${rssCount()} 个订阅源 · 已筛选`
                              : `共 ${rssCount()} 个订阅源`
                          }
                          titleSlot={
                            <PageToolbarTitleDropdown
                              title="订阅"
                              description={
                                hasEffectiveRssSourceListFilter(
                                  rssPageFilter(),
                                  rssGroups(),
                                  buildRssManageFilterDomainOptions(rssEnabledSources()),
                                )
                                  ? `共 ${rssCount()} 个订阅源 · 已筛选`
                                  : `共 ${rssCount()} 个订阅源`
                              }
                              dropdownEnabled={false}
                            />
                          }
                        >
                          <RssPageToolbar
                            searchQuery={rssSearchQuery()}
                            onSearchQueryChange={setRssSearchQuery}
                            onOpenHistory={() => setRssHistoryOpen(true)}
                            onOpenFavorites={() => setShowRssFavorites(true)}
                            onOpenFilter={() => setRssPageFilterOpen(true)}
                            onOpenManage={() => setShowRssManage(true)}
                            onOpenRuleSub={() => setShowRuleSub(true)}
                            filterActive={hasEffectiveRssSourceListFilter(
                              rssPageFilter(),
                              rssGroups(),
                              buildRssManageFilterDomainOptions(rssEnabledSources()),
                            )}
                            layoutMode={rssLayoutMode()}
                            onLayoutModeChange={persistRssLayoutMode}
                            searchMode={rssSearchMode()}
                            onSearchModeChange={persistRssSearchMode}
                          />
                        </PageToolbar>
                        <RssSourcesManageFilterDialog
                          open={rssPageFilterOpen()}
                          onOpenChange={setRssPageFilterOpen}
                          sourceGroups={rssGroups()}
                          sources={rssEnabledSources()}
                          appliedFilter={rssPageFilter()}
                          onApply={setRssPageFilter}
                        />
                        <RssReadHistoryDialog
                          open={rssHistoryOpen()}
                          onOpenChange={setRssHistoryOpen}
                          onOpenRecord={(record) => void openRssFromHistoryRecord(record)}
                        />
                        <RssPage
                          searchQuery={rssSearchQuery()}
                          searchMode={rssSearchMode()}
                          layoutMode={rssLayoutMode()}
                          appliedFilter={rssPageFilter()}
                          onGroupsLoaded={setRssGroups}
                          onSourcesLoaded={setRssEnabledSources}
                          onSourceCountChange={setRssCount}
                          onOpenSourceArticles={(source) => openRssArticles(source)}
                          onOpenManage={() => setShowRssManage(true)}
                          onSourceEdit={(source) => openRssEditor(source)}
                          onSourceLogin={(source) =>
                            void openRssSourceLogin(source, setSourceLoginDialogSource)
                          }
                        />
                      </div>
                      <Show when={showRssManage()}>
                        <RssSourcesManagePage
                          onClose={() => setShowRssManage(false)}
                          onSourceEdit={(source) => openRssEditor(source)}
                          onSourcesNew={() => openRssEditor()}
                        />
                      </Show>
                      <Show when={showRuleSub()}>
                        <RuleSubPage
                          onClose={() => setShowRuleSub(false)}
                          onImportBookFromUrl={(url) => void identifySourcesFromNetwork(url)}
                          onImportRssFromUrl={(url) => openRssNetworkImport(url)}
                          onImportReplaceFromUrl={(url) => {
                            void importReplaceRulesFromNetworkUrl(url)
                              .then((n) =>
                                showAppToast({
                                  title: '导入替换规则',
                                  description: `已导入 ${n} 条`,
                                  variant: 'default',
                                }),
                              )
                              .catch((err) =>
                                showAppToast({
                                  title: '导入替换规则失败',
                                  description: String(err),
                                  variant: 'destructive',
                                }),
                              );
                          }}
                        />
                      </Show>
                    </div>
                  }
                  settings={
                    <ReaderSettingsPage
                      onOpenReadingRulePage={(page) => setReadingRulePage(page)}
                    />
                  }
                />
              </div>
              <Show when={isReaderShellPage() && readingRulePage() === "txt-toc"}>
                <TxtTocRulesPage onBack={() => setReadingRulePage(null)} />
              </Show>
              <Show when={isReaderShellPage() && readingRulePage() === "replace"}>
                <ReplaceRulesPage onBack={() => setReadingRulePage(null)} />
              </Show>
              <Show when={isReaderShellPage() && readingRulePage() === "dict"}>
                <DictRulesPage onBack={() => setReadingRulePage(null)} />
              </Show>
            </section>

            {/* 音乐模块 */}
            <section
              class={cn(
                mainShellPageRoot,
                isMusicShellPage() ? shellTabEnter() : "hidden",
              )}
            >
              <MusicPage active={() => isMusicShellPage()} />
            </section>

            {/* 影视模块（TV-fongmi） */}
            <section
              class={cn(
                mainShellPageRoot,
                isTvShellPage() ? shellTabEnter() : "hidden",
              )}
            >
              <Show when={showTvSettings()}>
                <TvSettingsPage onBack={() => setShowTvSettings(false)} />
              </Show>
              <div class={cn(showTvSettings() && 'hidden pointer-events-none', 'flex min-h-0 flex-1 flex-col')}>
                <TvPage
                  active={() => isTvShellPage()}
                  onOpenTvSettings={() => setShowTvSettings(true)}
                />
              </div>
            </section>

            {/* 订阅模块（Folo 信息流） */}
            <section
              class={cn(
                mainShellPageRoot,
                isSubscribeShellPage() ? shellTabEnter() : "hidden",
              )}
            >
              <Show when={showSubscribeSettings()}>
                <SubscribeSettingsPage />
              </Show>
              <Show when={showSubscribeDiscover()}>
                <SubscribeDiscoverPage
                  onOpenHome={() => setSubscribeSection('home')}
                />
              </Show>
              <Show when={!showSubscribeSettings() && !showSubscribeDiscover()}>
                <div class="flex min-h-0 flex-1 flex-col">
                  <SubscribePage onOpenSubscribeSettings={() => setSubscribeSection('settings')} />
                </div>
              </Show>
            </section>

            {/* 下载模块（Gopeed + yt-dlp 进程内重写） */}
            <section
              class={cn(
                mainShellPageRoot,
                isDownloadShellPage() ? shellTabEnter() : "hidden",
              )}
            >
              <DownloadShell />
            </section>

            {/* 设置视图：保持挂载，子页切换时保留主列表滚动位置 */}
            <section
              class={cn(
                mainShellPageRoot,
                currentPage() === "settings" ? shellTabEnter() : "hidden",
              )}
            >
              <div
                class={cn(
                  "flex min-h-0 flex-1 flex-col w-full",
                  readingRulePage() && "hidden pointer-events-none",
                  themeStudioStore.state.open && "hidden pointer-events-none",
                  showThemesManage() && "hidden pointer-events-none",
                )}
              >
                <SettingsPage
                  onSubPageOpenChange={(open, close) => {
                    setSettingsSubPageOpen(open);
                    settingsSubPageCloseRef.current = close ?? (() => { });
                  }}
                  onNavigateToPage={navigateFromSettingsQuickPage}
                  onOpenReadingRulePage={(page) => {
                    setReadingRulePage(page);
                    navigateToPage("settings");
                  }}
                  onOpenThemeStudio={() => {
                    themeStudioStore.openStudio({ entry: "settings", scope: "all" });
                    navigateToPage("settings");
                  }}
                  onOpenThemesManage={openThemesManagePage}
                />
              </div>
              <Show when={currentPage() === "settings" && showThemesManage()}>
                <ThemesManagePage
                  onClose={() => setShowThemesManage(false)}
                  onThemesImportLocal={() => setShowImportThemeLocalDialog(true)}
                  onThemesImportNetwork={() => setShowImportThemeNetworkDialog(true)}
                  onThemesImportCode={() => setShowImportThemeCodeDialog(true)}
                  onOpenThemeStudio={(record) => {
                    themeStudioStore.openStudio({
                      entry: "settings",
                      scope: "all",
                      pack: record?.manifest,
                      presetId: record?.id ?? null,
                    });
                  }}
                />
              </Show>
              <Show when={currentPage() === "settings" && readingRulePage() === "txt-toc"}>
                <TxtTocRulesPage onBack={() => setReadingRulePage(null)} />
              </Show>
              <Show when={currentPage() === "settings" && readingRulePage() === "replace"}>
                <ReplaceRulesPage onBack={() => setReadingRulePage(null)} />
              </Show>
              <Show when={currentPage() === "settings" && readingRulePage() === "dict"}>
                <DictRulesPage onBack={() => setReadingRulePage(null)} />
              </Show>
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
                        sourceEditActive={() => sourceEditTarget() !== null}
                        onClose={requestCloseReader}
                        onOpenBookInfo={() => void openBookInfoFromViewerBook(textViewerStore.state.book)}
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
                              console.error('打开登录页失败:', e);
                              showAppToast({
                                title: '打开失败',
                                description: e instanceof Error ? e.message : '请稍后重试',
                                variant: 'destructive',
                              });
                            }
                            return;
                          }
                          if (url || hasUi) {
                            setSourceLoginDialogSource(source);
                          }
                        }}
                        onOpenSourcesManage={openSourcesManagePage}
                      />
                    </Match>
                    <Match when={entry.kind === "image-viewer"}>
                      <ImageViewerPage
                        entryVisible={() => overlayEntryVisible(entry)}
                        onClose={requestCloseReader}
                        onOpenBookInfo={() => void openBookInfoFromViewerBook(viewerStore.state.book)}
                      />
                    </Match>
                    <Match when={entry.kind === "audio-viewer"}>
                      <AudioViewerPage
                        entryVisible={() => overlayEntryVisible(entry)}
                        onClose={requestCloseReader}
                        onOpenBookInfo={() => void openBookInfoFromViewerBook(viewerStore.state.book)}
                      />
                    </Match>
                    <Match when={entry.kind === "video-viewer"}>
                      <VideoViewerPage
                        entryVisible={() => overlayEntryVisible(entry)}
                        onClose={requestCloseReader}
                        onOpenBookInfo={() => void openBookInfoFromViewerBook(viewerStore.state.book)}
                      />
                    </Match>
                    <Match when={entry.kind === "file-viewer"}>
                      <FileViewerPage
                        entryVisible={() => overlayEntryVisible(entry)}
                        onClose={requestCloseReader}
                        onOpenBookInfo={() => void openBookInfoFromViewerBook(viewerStore.state.book)}
                      />
                    </Match>
                    <Match when={entry.kind === "pdf-viewer"}>
                      <PdfViewerPage
                        bookUrl={(entry as Extract<OverlayEntry, { kind: "pdf-viewer" }>).bookUrl}
                        entryVisible={() => overlayEntryVisible(entry)}
                        onClose={() => nav.pop()}
                        onOpenBookInfo={() =>
                          showAppToast({
                            title: "书籍信息",
                            description: "本地书籍暂无书籍信息页",
                            variant: "default",
                          })
                        }
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
                              openBookInfo({ source, book, originShell: "reader" });
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
                            onBookSourceChanged={syncViewerAfterBookInfoChangeSource}
                            onOpenSourcesManage={openSourcesManagePage}
                            onSourceEdit={(source) => openSourceEditor(source)}
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
                            presentation="overlay"
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
                          getActiveShelfNavigation().state.currentGroup >= 0
                            ? getActiveShelfNavigation().state.currentGroup
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
                onBookSourceChanged={syncViewerAfterBookInfoChangeSource}
                onOpenSourcesManage={openSourcesManagePage}
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
          autoImport
          onIdentify={(raw) => {
            void identifySourcesFromQrRaw(raw);
          }}
        />
        <ImportCodeDialog
          open={showImportSourceCodeDialog()}
          onOpenChange={setShowImportSourceCodeDialog}
          portalZClass={bookSourceImportDialogPortalZ()}
          title="代码导入书源"
          description="粘贴书源 JSON 数组或对象，也支持 legado:// / yuedu:// 深链接与 http(s) 书源地址。"
          onIdentify={(raw) => {
            void identifySourcesFromRawText(raw, 'code');
          }}
        />
        <ImportThemeLocalDialog
          open={showImportThemeLocalDialog()}
          busy={importThemeLocalBusy()}
          onOpenChange={setShowImportThemeLocalDialog}
          onPickFile={() => void pickAndImportThemeFiles()}
          onPickDirectory={() => void pickAndImportThemeDirectory()}
        />
        <ImportSourceNetworkDialog
          open={showImportThemeNetworkDialog()}
          onOpenChange={setShowImportThemeNetworkDialog}
          title="网络导入主题"
          description="输入主题包 JSON 或 ZIP 的 http(s) 地址。"
          onIdentify={(url) => {
            void identifyThemesFromNetwork(url);
          }}
        />
        <ImportCodeDialog
          open={showImportThemeCodeDialog()}
          onOpenChange={setShowImportThemeCodeDialog}
          title="代码导入主题"
          description="粘贴主题 JSON / 数组，或 http(s) 主题包地址。"
          onIdentify={(raw) => {
            void identifyThemesFromRawText(raw);
          }}
        />
        <ImportThemeSelectDialog
          open={showImportThemeSelectDialog()}
          loading={importThemeLoading()}
          loadingMessage={importThemeProgress()?.message}
          packs={importThemeCandidates()}
          comparisons={importThemeComparisons()}
          selectedIds={importThemeSelectedIds()}
          keepName={importKeepThemeName()}
          keepActive={importKeepThemeActive()}
          overwriteAssets={importOverwriteThemeAssets()}
          onOpenChange={setShowImportThemeSelectDialog}
          onToggle={toggleImportThemeSelected}
          onSelectAllToggle={toggleImportThemeSelectAll}
          onInvertSelect={toggleImportThemeInvert}
          onSelectNewToggle={toggleImportThemeSelectNew}
          onSelectUpdateToggle={toggleImportThemeSelectUpdate}
          onKeepNameChange={setImportKeepThemeName}
          onKeepActiveChange={setImportKeepThemeActive}
          onOverwriteAssetsChange={setImportOverwriteThemeAssets}
          onConfirm={() => {
            void confirmImportSelectedThemes();
          }}
        />
        <ImportSourceSelectDialog
          open={showImportSourceSelectDialog()}
          loading={importSourceLoading()}
          loadingMessage={importSourceProgress()?.message}
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
            if (!open) releaseImportSelectDialogPanelIfNeeded();
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
        />
        <SourceVariableDialog
          open={!!sourceVariableDialogSource()}
          source={sourceVariableDialogSource()}
          onOpenChange={(open) => {
            if (!open) setSourceVariableDialogSource(null);
          }}
        />
        <SourceVerificationDialog
          request={sourceVerificationRequest()}
          onSubmit={(value) => {
            sourceVerificationCompleter?.resolve(value);
            sourceVerificationCompleter = null;
            setSourceVerificationRequest(null);
          }}
          onCancel={() => {
            sourceVerificationCompleter?.reject(new SourceVerificationCancelledError());
            sourceVerificationCompleter = null;
            setSourceVerificationRequest(null);
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
        <InnerWebHost payload={innerWebPayload()} onClose={cancelInnerWebClose} />
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
        <Show when={rssEditTarget()} keyed>
          {(target) => (
            <Portal mount={document.body}>
              <RssSourceEditPage
                sourceUrl={target === "new" ? undefined : (target as string)}
                onClose={() => setRssEditTarget(null)}
                onOpenLogin={(source) =>
                  void openRssSourceLogin(source, setSourceLoginDialogSource)
                }
              />
            </Portal>
          )}
        </Show>
        <Show when={rssArticleListTarget()} keyed>
          {(target) => (
            <Portal mount={getRssOverlayPortalMount()}>
              <RssOverlayShell zClass="z-[110]">
                <RssArticleListPage
                  sourceUrl={target.sourceUrl}
                  initialSortName={target.sortName}
                  onClose={() => setRssArticleListTarget(null)}
                  onOpenArticle={(source, article) => openRssRead(source, article)}
                  onSourceEdit={openRssEditor}
                  onOpenSourceVariables={(source) =>
                    openSourceVariables(source as unknown as BookSource)
                  }
                  onOpenHistoryRecord={(record) => void openRssFromHistoryRecord(record)}
                />
              </RssOverlayShell>
            </Portal>
          )}
        </Show>
        <Show when={rssReadTarget()} keyed>
          {(target) => (
            <Portal mount={getRssOverlayPortalMount()}>
              <RssOverlayShell zClass="z-[115]">
                <RssReadPage
                  source={target.source}
                  article={target.article}
                  openUrl={target.openUrl}
                  useStartHtml={target.useStartHtml}
                  onClose={() => closeRssRead()}
                  onOpenArticle={(source, article) => openRssRead(source, article)}
                  onOpenLogin={(source) =>
                    void openRssSourceLogin(source, setSourceLoginDialogSource)
                  }
                  onOpenSort={(source, sortName) => {
                    setRssReadTarget(null);
                    setRssReadResumeFavorites(false);
                    setRssArticleListTarget({
                      sourceUrl: source.sourceUrl,
                      sortName,
                    });
                  }}
                  onOpenSearch={(keyword) => openBookSearch(keyword)}
                />
              </RssOverlayShell>
            </Portal>
          )}
        </Show>
        <Show when={showRuleSub()}>
          <Portal mount={document.body}>
            <RuleSubPage
              onClose={() => setShowRuleSub(false)}
              onImportRssFromUrl={(url) => openRssNetworkImport(url)}
            />
          </Portal>
        </Show>
        <Show when={showRssFavorites()}>
          <Portal mount={document.body}>
            <RssFavoritesPage
              onClose={() => setShowRssFavorites(false)}
              onOpenArticle={(source, article) => openRssRead(source, article)}
            />
          </Portal>
        </Show>
        <ImportSourceNetworkDialog
          open={showImportRssNetworkDialog()}
          onOpenChange={(open) => {
            setShowImportRssNetworkDialog(open);
            if (!open) setImportRssNetworkPresetUrl("");
          }}
          presetUrl={importRssNetworkPresetUrl()}
          title="网络导入订阅源"
          description="输入订阅源 JSON 链接（http/https），兼容 legado 格式。"
          placeholder="https://example.com/rssSources.json"
          onIdentify={(url) => void identifyRssFromNetworkUrl(url)}
        />
        <ImportRssSourceSelectDialog
          open={showImportRssSelectDialog()}
          loading={importRssLoading()}
          sources={importRssCandidates()}
          comparisons={importRssComparisons()}
          selectedUrls={importRssSelectedUrls()}
          keepName={importRssKeepName()}
          keepGroup={importRssKeepGroup()}
          keepEnable={importRssKeepEnable()}
          groupName={importRssGroupName()}
          groupOptions={importRssGroupOptions()}
          adjustGroup={importRssAdjustGroup()}
          portalZClass={bookSourceImportDialogPortalZ()}
          onOpenChange={(open) => {
            setShowImportRssSelectDialog(open);
            if (!open) releaseImportSelectDialogPanelIfNeeded();
          }}
          onToggle={(url, checked) => {
            setImportRssSelectedUrls((prev) => {
              const next = new Set(prev);
              if (checked) next.add(url);
              else next.delete(url);
              return next;
            });
          }}
          onSelectAllToggle={() => {
            const candidates = importRssCandidates();
            const all = importRssSelectedUrls().size === candidates.length;
            setImportRssSelectedUrls(
              all ? new Set<string>() : new Set(candidates.map((s) => s.sourceUrl)),
            );
          }}
          onInvertSelect={() => {
            const current = importRssSelectedUrls();
            const next = new Set<string>();
            for (const s of importRssCandidates()) {
              if (!current.has(s.sourceUrl)) next.add(s.sourceUrl);
            }
            setImportRssSelectedUrls(next);
          }}
          onSelectNewToggle={() => {
            const urls = importRssComparisons().filter((c) => c.isNew).map((c) => c.source.sourceUrl);
            const all = urls.every((u) => importRssSelectedUrls().has(u));
            const next = new Set(importRssSelectedUrls());
            for (const u of urls) {
              if (all) next.delete(u);
              else next.add(u);
            }
            setImportRssSelectedUrls(next);
          }}
          onSelectUpdateToggle={() => {
            const urls = importRssComparisons().filter((c) => c.isUpdate).map((c) => c.source.sourceUrl);
            const all = urls.every((u) => importRssSelectedUrls().has(u));
            const next = new Set(importRssSelectedUrls());
            for (const u of urls) {
              if (all) next.delete(u);
              else next.add(u);
            }
            setImportRssSelectedUrls(next);
          }}
          onKeepNameChange={setImportRssKeepName}
          onKeepGroupChange={setImportRssKeepGroup}
          onKeepEnableChange={setImportRssKeepEnable}
          onGroupNameChange={setImportRssGroupName}
          onAdjustGroupChange={setImportRssAdjustGroup}
          onConfirm={() => void confirmImportSelectedRssSources()}
        />
      </div>
    );
  };

  return (
    <ShellLayoutProvider windowWidth={windowWidth}>
      <ShellSidebarLifecycle />
      <AppBackNavigationBridge getOpenLayers={getOpenBackLayers} />
      <AppChrome />
      <Show when={themeStudioStore.state.open}>
        <ThemeStudioPage onBack={() => themeStudioStore.closeStudio()} />
      </Show>
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
  if (typeof window !== "undefined" && window.location.hash === "#lyric-desktop") {
    document.documentElement.classList.add("lyric-desktop");
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return (
      <ThemePackRuntimeProvider>
        <LyricDesktopPage />
      </ThemePackRuntimeProvider>
    );
  }
  if (typeof window !== "undefined" && window.location.hash === "#music-mini-player") {
    document.documentElement.classList.add("music-mini-player");
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return (
      <ThemePackRuntimeProvider>
        <MusicMiniPlayerPage />
      </ThemePackRuntimeProvider>
    );
  }
  return (
    <ThemePackRuntimeProvider>
      <ThemeTargetHost target="app">
        <SidebarProvider
          style={appSidebarStyle}
          class={cn(hViewport, "relative min-h-0 overflow-hidden")}
          {...componentDataAttr('appShell')}
        >
          <ThemedComponentBackground componentId="appShell" />
          <AppContent />
          <AppToastHost icons={appToastIcons} />
          <GlobalThemeEffectsLayer domain="app" />
        </SidebarProvider>
      </ThemeTargetHost>
    </ThemePackRuntimeProvider>
  );
}

export default App;
