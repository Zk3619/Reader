import { createSignal, createEffect, For, Show, onMount, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./components/ui/button";
import { Navigation, type PageType } from "./components/Navigation";
import { PageToolbar } from "./components/PageToolbar";
import { PageToolbarTitleDropdown } from "./components/PageToolbarTitleDropdown";
import { BookshelfPageToolbar } from "./components/BookshelfPageToolbar";
import { SourcesPageToolbar } from "./components/SourcesPageToolbar";
import { SettingsPageToolbar } from "./components/SettingsPageToolbar";
import { SourceGroupTitleDropdown } from "./components/SourceGroupSelector";
import { SideBar } from "./components/SideBar";
import { BottomBar } from "./components/BottomBar";
import { Tray } from "./components/Tray";
import { SplashScreen } from "./components/SplashScreen";
import { SidebarProvider, useSidebar } from "./components/ui/sidebar";
import { BookShelf } from "./pages/bookshelf/BookShelf";
import { SourcesPage } from "./pages/sources/SourcesPage";
import { DiscoverPage } from "./pages/discover/DiscoverPage";
import { BookInfoPage } from "./pages/book-info/BookInfoPage";
import { BookGroupManage } from "./pages/bookshelf/BookGroupManage";
import { ReaderPage } from "./pages/reader/ReaderPage";
import { ImportPage } from "./pages/import/ImportPage";
import { RemoteBookPage } from "./pages/remote-book/RemoteBookPage";
import { AddBookByUrlDialog } from "./components/AddBookByUrlDialog";
import { ImportSourceLocalDialog } from "./components/ImportSourceLocalDialog";
import { ImportSourceNetworkDialog } from "./components/ImportSourceNetworkDialog";
import { SourceGroupManageDialog } from "./components/SourceGroupManageDialog";
import { SourceSearchDialog } from "./components/SourceSearchDialog";
import { bookshelfStore } from "@/stores/bookshelf";
import { readerStore } from "@/stores/reader";
import { initBookshelfLayoutSettings } from "@/stores/bookshelf-layout";
import type { BookSource } from "@/types";
import type { SearchBook } from "@/types";
import { getSource } from "@/lib/database/sources";
import type { ExploreSection } from "@/lib/book-source/explore-sections";
import { DatabaseBackup } from "./components/DatabaseBackup";
import { ThemeSwitch } from "./components/ThemeSwitch";
import { ScrollToTop } from "./components/ScrollToTop";
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from "./components/ui/switch";
import { ShellLayoutProvider, useShellLayout } from "./components/ShellLayoutProvider";
import { ShellLayoutSetting } from "./components/ShellLayoutSetting";
import { cn } from "src/lib/utils";
import { Toaster } from "./components/ui/sonner";
import { showAppToast } from "./components/AppToasts";
import { initDatabase } from "@/lib/database";
import { setupWindowStateListeners } from "@/utils/window-state";
import { settingsStore } from "@/stores/settings";
import { applyThemeToDocument } from "@/lib/theme";
import { hasBook } from "@/lib/database/books";
import { importLocalBook, importLocalBookFromContent, isAndroidContentUri, pickLocalBookFile } from "@/lib/local-book";
import { copyFileToBooksDir, getBooksDirectory, moveFileToBooksDir } from "@/lib/local-book/import";
import { isMobile, isTauri } from "@/lib/platform/detect";
import { getFileSystem } from "@/lib/platform/filesystem";
import { basename, extname, join, normalize } from "@tauri-apps/api/path";
import { BookDirectoryDialog } from "./components/BookDirectoryDialog";
import { ImportActionDialog, type ImportAction } from "./components/ImportActionDialog";
import { ReplaceFileDialog, type ReplaceFileAction } from "./components/ReplaceFileDialog";
import { getSourceGroupLabel, type SourceSearchMode } from "@/lib/sources-filters";
import { openUrlInApp } from "@/lib/platform/open-url";
import { SourceLoginDialog } from "./components/SourceLoginDialog";
import { readHmrData, writeHmrData } from "@/lib/dev-hmr-state";
import "./App.css";
// 窗口显示逻辑已移至 SplashScreen 组件，确保在开屏动画前显示

/** 开发环境 HMR 下跳过重复开屏（避免白屏盖住主界面） */
function isSplashDoneForSession(): boolean {
  if (import.meta.env.DEV && import.meta.hot) {
    return !!import.meta.hot.data.splashDone;
  }
  return false;
}

function markSplashDoneForSession(): void {
  if (import.meta.env.DEV && import.meta.hot) {
    import.meta.hot.data.splashDone = true;
  }
}

// 模拟最近读过的书籍数据
const mockRecentBooks = [
  {
    id: 1,
    title: "深入理解计算机系统",
    chapterName: "第3章 程序的机器级表示",
  },
  {
    id: 2,
    title: "设计模式：可复用面向对象软件的基础",
    chapterName: "第5章 单例模式",
  },
  {
    id: 3,
    title: "代码整洁之道",
    chapterName: "第7章 错误处理",
  },
];

// 独立页面列表：这些页面不显示应用级导航栏（Navigation、SideBar、BottomBar），类似阅读器页面
const STANDALONE_PAGES: PageType[] = ["reader", "discover", "book-info", "import", "remote-book"];

// 内部组件，用于访问 SidebarProvider 的上下文
function AppContent() {
  const [currentPage, setCurrentPage] = createSignal<PageType>(
    readHmrData<PageType>("currentPage", "bookshelf")
  );

  // 判断是否为独立页面
  const isStandalonePage = () => STANDALONE_PAGES.includes(currentPage());
  const [greetMsg, setGreetMsg] = createSignal("");
  const [showSplash, setShowSplash] = createSignal(!isSplashDoneForSession());
  // 数据库初始化状态（保留用于将来显示加载状态）
  const [_dbInitialized, setDbInitialized] = createSignal(false);
  const [dbError, setDbError] = createSignal<string | null>(null);
  const { state } = useSidebar();
  const [windowWidth, setWindowWidth] = createSignal(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  const [showGroupManage, setShowGroupManage] = createSignal(false);
  const [showBookDirectoryDialog, setShowBookDirectoryDialog] = createSignal(false);
  const [showImportActionDialog, setShowImportActionDialog] = createSignal(false);
  const [showReplaceFileDialog, setShowReplaceFileDialog] = createSignal(false);
  const [showAddBookByUrlDialog, setShowAddBookByUrlDialog] = createSignal(false);
  const [showImportSourceLocalDialog, setShowImportSourceLocalDialog] = createSignal(false);
  const [showImportSourceNetworkDialog, setShowImportSourceNetworkDialog] = createSignal(false);
  /** 书源页：分组管理对话框 */
  const [showSourceGroupManageDialog, setShowSourceGroupManageDialog] = createSignal(false);
  /** 书源搜索对话框：从书源项右键「搜索」打开，限定该书源 */
  const [sourceSearchContext, setSourceSearchContext] = createSignal<{ source: BookSource } | null>(null);
  /** 书源登录对话框：配置了 loginUi 时弹窗显示登录页 */
  const [sourceLoginDialogSource, setSourceLoginDialogSource] = createSignal<BookSource | null>(null);
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
  const [currentSourceGroup, setCurrentSourceGroup] = createSignal<string | null>(
    readHmrData<string | null>("currentSourceGroup", null)
  );

  // 开发 HMR：持久化当前页与书源筛选，避免工具栏下拉与列表状态错位
  createEffect(() => {
    writeHmrData("currentPage", currentPage());
    writeHmrData("currentSourceGroup", currentSourceGroup());
  });
  /** 书源页：搜索关键词（导航栏扩展输入框，在当前分组内搜索） */
  const [sourceSearchQuery, setSourceSearchQuery] = createSignal("");
  /** 书源页：按分组名分块显示（仅全部/筛选时有效） */
  const [sourcesGroupByGroupName, setSourcesGroupByGroupName] = createSignal(false);
  /** 书源页：搜索模式 name=仅名称，fuzzy=模糊搜索，extended=扩展搜索规则（与 legado 对齐）；模糊与扩展互斥 */
  const [sourceSearchMode, setSourceSearchMode] = createSignal<SourceSearchMode>('name');

  const sourcePageToolbarTitle = () => {
    const label = getSourceGroupLabel(currentSourceGroup());
    return label === "全部" ? "书源" : `书源 · ${label}`;
  };

  const sourcePageToolbarDescription = () => (
    <>
      共 {sourceCount()} 个书源
      <Show when={currentSourceGroup() == null || currentSourceGroup() === ""}>
        ，共 {sourceGroups().length} 个分组
      </Show>
    </>
  );

  /** 发现页上下文：从书源页点击某个分类/排行榜后进入发现页 */
  const [discoverContext, setDiscoverContext] = createSignal<{ source: BookSource; section: ExploreSection } | null>(null);
  /** 书籍信息页上下文：从发现页或阅读器进入书籍信息页 */
  const [bookInfoContext, setBookInfoContext] = createSignal<{ source: BookSource; book: SearchBook; fromPage: 'discover' | 'reader' } | null>(null);
  /** 发现页分页偏好对话框显示状态 */
  const [showDiscoverPaginationPreferenceDialog, setShowDiscoverPaginationPreferenceDialog] = createSignal(false);

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
          showProgress: true,
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
      const settings = settingsStore.state.app;
      if (settings.booksDirectorySet) {
        const groupId = bookshelfStore.state.currentGroup;
        await performImport(groupId >= 0 ? groupId : undefined);
      }
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
      const booksDir = await getBooksDirectory();
      const targetPath = await join(booksDir, fileInfo.fileName);
      const fs = await getFileSystem();

      const targetFileExists = await fs.exists(targetPath);
      let isSameFile = false;
      let isSameSize = false;
      let isSameContent = false;

      if (targetFileExists) {
        // 检查是否是同一个文件（路径相同）
        try {
          const normalizedSource = await normalize(fileInfo.bookUrl);
          const normalizedTarget = await normalize(targetPath);
          isSameFile = normalizedSource === normalizedTarget;
        } catch (error) {
          console.warn('路径规范化失败，假设不是同一文件:', error);
          isSameFile = false;
        }

        // 如果不是同一文件，检查文件大小和内容是否相同
        if (!isSameFile) {
          try {
            const sourceSize = fileInfo.content ? fileInfo.content.byteLength : await fs.getFileSize(fileInfo.bookUrl);
            const targetSize = await fs.getFileSize(targetPath);
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

                // 计算目标文件哈希
                const targetHash = await fs.getFileHash(targetPath);
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
          showProgress: true,
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

      if (isTauri()) {
        // Tauri 环境：先执行文件操作，再读取内容
        if (isAndroidContentUri(fileInfo.bookUrl) || fileInfo.bookUrl.startsWith('local::')) {
          // Android Content URI 或虚拟路径：内容已经在内存中
          // 将内容保存到书籍目录
          if (!fileInfo.content) {
            throw new Error('Android Content URI 必须预先读取内容');
          }

          const booksDir = await getBooksDirectory();
          const fs = await getFileSystem();

          // 确保目录存在
          try {
            await fs.mkdir(booksDir, true);
          } catch (error) {
            // 目录可能已存在，忽略错误
          }

          // 构建目标路径
          const targetPath = await join(booksDir, fileInfo.fileName);

          // 如果目标文件已存在且需要替换，先删除它
          if (replaceFile) {
            try {
              const exists = await fs.exists(targetPath);
              if (exists) {
                await fs.remove(targetPath, false);
              }
            } catch (error) {
              // 删除失败不影响后续操作，writeFile 可能会覆盖
              console.warn('删除已存在文件失败，尝试直接覆盖:', error);
            }
          }

          // 写入文件到书籍目录
          if (!fileInfo.content) {
            throw new Error('Android Content URI 必须预先读取内容');
          }
          await fs.writeFile(targetPath, fileInfo.content);
          finalBookUrl = targetPath;
          finalContent = fileInfo.content; // 使用已读取的内容
        } else {
          // 普通文件路径：先复制/移动文件，再读取内容（更高效，避免大文件全部加载到内存）
          if (action === 'copy') {
            finalBookUrl = await copyFileToBooksDir(fileInfo.bookUrl, fileInfo.fileName, replaceFile);
          } else if (action === 'move') {
            finalBookUrl = await moveFileToBooksDir(fileInfo.bookUrl, fileInfo.fileName, replaceFile);
          }

          // 从目标位置读取文件内容
          const fs = await getFileSystem();
          finalContent = await fs.readFile(finalBookUrl);
        }
      } else {
        // Web 端：使用已有内容
        if (!fileInfo.content) {
          throw new Error('Web 端必须预先读取内容');
        }
        finalContent = fileInfo.content;
      }

      // 执行导入
      const result = await importLocalBookFromContent(
        finalBookUrl,
        fileInfo.fileName,
        finalContent,
        { groupId: finalGroupId }
      );

      if (result) {
        showAppToast({
          title: "导入成功",
          description: `已导入《${result.book.name}》，共 ${result.chapterCount} 章`,
          variant: "success",
          showProgress: true,
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

  // 初始化数据库、应用设置与布局设置
  onMount(async () => {
    try {
      await settingsStore.loadSettings();
    } catch (e) {
      console.warn('加载应用设置失败:', e);
    }
    try {
      console.log('正在初始化数据库...');
      await initDatabase();
      setDbInitialized(true);
      console.log('数据库初始化成功');

      // 初始化书架布局设置
      await initBookshelfLayoutSettings();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('数据库初始化失败:', error);
      setDbError(errorMessage);
      setDbInitialized(true); // 即使失败也设置为 true，避免无限等待
    }
  });

  // 设置窗口状态监听器
  onMount(() => {
    const cleanup = setupWindowStateListeners();

    onCleanup(() => {
      cleanup();
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

  async function testTauriCommand() {
    try {
      const result = await invoke("greet", { name: "Tauri Reader" });
      setGreetMsg(result as string);
    } catch (e) {
      setGreetMsg(`调用失败: ${e}`);
    }
  }

  async function handleBookshelfImportLocal() {
    try {
      const groupId = bookshelfStore.state.currentGroup;
      const settings = settingsStore.state.app;
      if (!settings.booksDirectorySet) {
        setShowBookDirectoryDialog(true);
        return;
      }
      const picked = await pickLocalBookFile();
      if (!picked) return;

      if (isTauri()) {
        if (!settings.rememberImportAction || !settings.importBookAction) {
          setPendingImportFile({ ...picked, groupId: groupId >= 0 ? groupId : undefined });
          setShowImportActionDialog(true);
          return;
        }

        const booksDir = await getBooksDirectory();
        const targetPath = await join(booksDir, picked.fileName);
        const fs = await getFileSystem();
        const targetFileExists = await fs.exists(targetPath);
        let isSameFile = false;
        let isSameSize = false;
        let isSameContent = false;

        if (targetFileExists) {
          try {
            const normalizedSource = await normalize(picked.bookUrl);
            const normalizedTarget = await normalize(targetPath);
            isSameFile = normalizedSource === normalizedTarget;
          } catch (error) {
            console.warn('路径规范化失败，假设不是同一文件:', error);
            isSameFile = false;
          }

          if (!isSameFile) {
            try {
              const sourceSize = picked.content ? picked.content.byteLength : await fs.getFileSize(picked.bookUrl);
              const targetSize = await fs.getFileSize(targetPath);
              isSameSize = sourceSize === targetSize;
              if (isSameSize) {
                try {
                  let sourceHash: string;
                  if (picked.content) {
                    const hashBuffer = await crypto.subtle.digest('SHA-256', picked.content);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    sourceHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                  } else {
                    sourceHash = await fs.getFileHash(picked.bookUrl);
                  }
                  const targetHash = await fs.getFileHash(targetPath);
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

  const reduceMotion = () => settingsStore.state.app.reduceMotion;

  const AppChrome = () => {
    const shell = useShellLayout();
    const showTopNav = () => !isStandalonePage() && shell().showTopNavigation;
    const showBottomBar = () => !isStandalonePage() && shell().showBottomBar;

    return (
      <div
        class="min-h-screen w-full transition-colors duration-300"
        data-reduce-motion={reduceMotion() ? "true" : undefined}
      >
        {/* 数据库初始化错误提示 */}
        <Show when={dbError()}>
          <div
            class={cn(
              "fixed left-0 right-0 z-50 bg-destructive/90 p-4 text-center text-destructive-foreground",
              showTopNav() ? "top-14" : "top-0 safe-area-inset-top"
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
              markSplashDoneForSession();
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
              onPageChange={setCurrentPage}
            />
          </div>
        </Show>

        {/* 左侧边栏：桌面壳层且宽度 ≥768px（与 ui/sidebar md 断点一致） */}
        <Show when={!isStandalonePage() && shell().showSidebar}>
          <div
            class={cn(
              "fixed bottom-0 left-0 z-40",
              showTopNav() ? "top-14" : "top-0"
            )}
          >
            <SideBar
              currentPage={currentPage()}
              onPageChange={setCurrentPage}
              recentBooks={mockRecentBooks}
            />
          </div>
        </Show>

        {/* 底栏 - 移动壳层；独立页面时隐藏 */}
        <Show when={showBottomBar()}>
          <BottomBar
            currentPage={currentPage()}
            onPageChange={setCurrentPage}
          />
        </Show>

        {/* 主容器 - 为导航栏、侧边栏和底栏留出空间；独立页面时隐藏 */}
        <Show when={!isStandalonePage()}>
          <div
            id="main-content-container"
            class={cn(
              "fixed bottom-0 right-0 flex flex-col overflow-hidden bg-background/80 backdrop-blur-sm transition-all duration-200",
              showTopNav() ? "top-14" : "top-0",
              shell().showSidebar &&
              (state() === "expanded" ? "left-(--sidebar-width)" : "left-(--sidebar-width-icon)"),
              shell().useMobileShell && "left-0",
              showBottomBar() && "bottom-14",
            )}
          >
            {/* 主内容区：flex-1 min-h-0 限制高度，由各页面内部处理滚动 */}
            <main class="flex flex-col flex-1 min-h-0 w-full overflow-hidden p-2">
              {/* 书架视图 */}
              <Show when={currentPage() === "bookshelf"}>
                <section class="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col flex-1 min-h-0 overflow-hidden">
                  {showGroupManage() ? (
                    <BookGroupManage onClose={() => setShowGroupManage(false)} />
                  ) : (
                    <BookShelf
                      toolbarActions={
                        <BookshelfPageToolbar
                          onPageChange={setCurrentPage}
                          onOpenGroupManage={() => setShowGroupManage(true)}
                          onImportLocal={handleBookshelfImportLocal}
                          onAddBookByUrl={() => setShowAddBookByUrlDialog(true)}
                        />
                      }
                      onOpenBook={async (book) => {
                        // 先设置初始状态，触发 skeleton 显示
                        readerStore.setBookInitialState(book);
                        // 立即切换到阅读器页面
                        setCurrentPage("reader");
                        // 异步加载书籍内容（不阻塞页面切换）
                        readerStore.openBook(book).catch((e) => {
                          console.error('打开书籍失败:', e);
                          // 如果加载失败，返回书架页面
                          setCurrentPage("bookshelf");
                        });
                      }}
                    />
                  )}
                </section>
              </Show>

              {/* 书源视图 */}
              <Show when={currentPage() === "sources"}>
                <section class="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col flex-1 min-h-0 overflow-hidden">
                  <PageToolbar
                    title={sourcePageToolbarTitle()}
                    description={sourcePageToolbarDescription()}
                    titleSlot={
                      <SourceGroupTitleDropdown
                        title={sourcePageToolbarTitle()}
                        description={sourcePageToolbarDescription()}
                        sourceGroups={sourceGroups()}
                        currentSourceGroup={currentSourceGroup()}
                        onSourceGroupChange={(g) => setCurrentSourceGroup(g)}
                      />
                    }
                  >
                    <SourcesPageToolbar
                      sourceSearchQuery={sourceSearchQuery()}
                      onSourceSearchQueryChange={(q) => setSourceSearchQuery(q)}
                      sourceSearchMode={sourceSearchMode()}
                      onSourceSearchModeChange={(m) => setSourceSearchMode(m)}
                      currentSourceGroup={currentSourceGroup()}
                      sourcesGroupByGroupName={sourcesGroupByGroupName()}
                      onSourcesGroupByGroupNameChange={(v) => setSourcesGroupByGroupName(v)}
                      onSourcesNew={() => showAppToast({ title: "新建书源", description: "功能开发中", variant: "default" })}
                      onSourcesImportLocal={() => setShowImportSourceLocalDialog(true)}
                      onSourcesImportNetwork={() => setShowImportSourceNetworkDialog(true)}
                      onSourcesImportQR={() => showAppToast({ title: "二维码导入书源", description: "功能开发中", variant: "default" })}
                      showSourcesImportQR={isMobile()}
                      onOpenSourceGroupManage={() => setShowSourceGroupManageDialog(true)}
                    />
                  </PageToolbar>
                  <SourcesPage
                    currentSourceGroup={currentSourceGroup()}
                    sourceSearchQuery={sourceSearchQuery()}
                    sourceSearchMode={sourceSearchMode()}
                    sourcesGroupByGroupName={sourcesGroupByGroupName()}
                    onGroupsLoaded={(g) => setSourceGroups(g)}
                    onSourceCountChange={(n) => setSourceCount(n)}
                    onSourceGroupChange={(g) => setCurrentSourceGroup(g)}
                    onSourceEdit={() => showAppToast({ title: "编辑书源", description: "功能开发中", variant: "default" })}
                    onSourceLogin={async (source) => {
                      const url = source.loginUrl?.trim();
                      const hasUi = !!source.loginUi?.trim();
                      const isHttp =
                        !!url && (url.startsWith('http://') || url.startsWith('https://'));
                      if (isHttp) {
                        try {
                          await openUrlInApp(url, `${source.sourceName ?? '书源'} · 登录`);
                          showAppToast({ title: "已打开登录页", description: "请在窗口内完成登录", variant: "default" });
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
                      setSourceSearchContext({ source });
                    }}
                    onSourcesNew={() => showAppToast({ title: "新建书源", description: "功能开发中", variant: "default" })}
                    onSourcesImportLocal={() => setShowImportSourceLocalDialog(true)}
                    onSourcesImportNetwork={() => setShowImportSourceNetworkDialog(true)}
                    onSourcesImportQR={() => showAppToast({ title: "二维码导入书源", description: "功能开发中", variant: "default" })}
                    onExploreSectionClick={(source, section) => {
                      if (section.url) {
                        setDiscoverContext({ source, section });
                        setCurrentPage("discover");
                      } else {
                        showAppToast({ title: `${source.sourceName} · ${section.title}`, description: "该分类暂无链接", variant: "default" });
                      }
                    }}
                  />
                </section>
              </Show>


              {/* 订阅视图 */}
              <Show when={currentPage() === "subscription"}>
                <section class="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col flex-1 min-h-0 overflow-hidden">
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
                  <div class="flex-1 min-h-0 overflow-y-auto pt-2">
                    <div class="rounded-2xl border border-border/50 bg-card p-6 text-center text-muted-foreground">
                      <p>订阅功能开发中...</p>
                    </div>
                  </div>
                </section>
              </Show>

              {/* 书签视图 */}
              <Show when={currentPage() === "bookmark"}>
                <section class="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col flex-1 min-h-0 overflow-hidden">
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
                  <div class="flex-1 min-h-0 overflow-y-auto pt-2">
                    <div class="rounded-2xl border border-border/50 bg-card p-6 text-center text-muted-foreground">
                      <p>书签功能开发中...</p>
                    </div>
                  </div>
                </section>
              </Show>

              {/* 记录视图 */}
              <Show when={currentPage() === "record"}>
                <section class="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col flex-1 min-h-0 overflow-hidden">
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
                  <div class="flex-1 min-h-0 overflow-y-auto pt-2">
                    <div class="rounded-2xl border border-border/50 bg-card p-6 text-center text-muted-foreground">
                      <p>阅读记录功能开发中...</p>
                    </div>
                  </div>
                </section>
              </Show>


              {/* 设置视图 */}
              <Show when={currentPage() === "settings"}>
                <section class="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col flex-1 min-h-0 overflow-hidden">
                  <PageToolbar
                    title="设置"
                    description="自定义你的阅读体验"
                    titleSlot={
                      <PageToolbarTitleDropdown
                        title="设置"
                        description="自定义你的阅读体验"
                        dropdownEnabled={false}
                      />
                    }
                  >
                    <SettingsPageToolbar />
                  </PageToolbar>

                  <div class="flex-1 min-h-0 overflow-y-auto pt-2">
                    <div class="w-full max-w-4xl mx-auto space-y-4">
                      {/* 数据库备份 */}
                      <div class="rounded-2xl border border-border/50 bg-card p-6">
                        <div class="mb-4">
                          <h3 class="mb-2 font-semibold text-foreground">💾 数据备份</h3>
                          <p class="text-sm text-muted-foreground">
                            导出数据库备份文件，或从备份文件恢复数据
                          </p>
                        </div>
                        <DatabaseBackup />
                      </div>
                      {/* Tauri 命令测试 */}
                      <div class="rounded-2xl border border-border/50 bg-card p-6">
                        <h3 class="mb-4 font-semibold text-foreground">🔧 Tauri 命令测试</h3>
                        <div class="flex flex-col gap-4">
                          <Button onClick={testTauriCommand} variant="default">
                            测试 Tauri invoke
                          </Button>
                          <Show when={greetMsg()}>
                            <div class="rounded-xl bg-success/10 p-4 text-sm text-success-foreground">
                              <span class="font-medium">响应结果：</span> {greetMsg()}
                            </div>
                          </Show>
                        </div>
                      </div>

                      {/* 按钮变体展示 */}
                      <div class="rounded-2xl border border-border/50 bg-card p-6">
                        <h3 class="mb-4 font-semibold text-foreground">🎨 Button 组件变体</h3>
                        <div class="flex flex-wrap gap-3">
                          <Button variant="default">Default</Button>
                          <Button variant="secondary">Secondary</Button>
                          <Button variant="destructive">Destructive</Button>
                          <Button variant="outline">Outline</Button>
                          <Button variant="ghost">Ghost</Button>
                          <Button variant="link">Link</Button>
                        </div>
                      </div>

                      {/* 按钮尺寸展示 */}
                      <div class="rounded-2xl border border-border/50 bg-card p-6">
                        <h3 class="mb-4 font-semibold text-foreground">📐 Button 尺寸</h3>
                        <div class="flex flex-wrap items-center gap-3">
                          <Button size="sm">Small</Button>
                          <Button size="default">Default</Button>
                          <Button size="lg">Large</Button>
                          <Button size="icon">🔔</Button>
                        </div>
                      </div>

                      {/* 主题切换（浅色 / 跟随系统 / 深色，左键循环、右键或长按选一项） */}
                      <div class="rounded-2xl border border-border/50 bg-card p-6">
                        <div class="flex items-center justify-between">
                          <div>
                            <h3 class="font-semibold text-foreground">主题</h3>
                            <p class="text-sm text-muted-foreground">浅色、跟随系统或深色；左键循环切换，右键或长按选择</p>
                          </div>
                          <ThemeSwitch withTooltip={false} />
                        </div>
                      </div>

                      <ShellLayoutSetting />

                      {/* 减少动效 */}
                      <div class="rounded-2xl border border-border/50 bg-card p-6">
                        <div class="flex items-center justify-between gap-4">
                          <div class="space-y-0.5">
                            <h3 class="font-semibold text-foreground">减少动效</h3>
                            <p class="text-sm text-muted-foreground">
                              关闭或缩短动画与过渡，适合对动效敏感或追求性能的用户
                            </p>
                          </div>
                          <Switch
                            checked={settingsStore.state.app.reduceMotion}
                            onChange={(v) => settingsStore.setReduceMotion(!!v)}
                          >
                            <SwitchControl class="data-disabled:cursor-not-allowed">
                              <SwitchThumb />
                            </SwitchControl>
                            <SwitchLabel class="sr-only">减少动效</SwitchLabel>
                          </Switch>
                        </div>
                      </div>

                      {/* 技术栈信息 */}
                      <div class="rounded-2xl border border-dashed border-border bg-muted/30 p-6">
                        <h3 class="mb-3 font-semibold text-foreground">⚡ 技术栈</h3>
                        <div class="flex flex-wrap gap-2">
                          <For each={["Tauri 2.0", "SolidJS", "TailwindCSS v4", "solid-ui", "Kobalte"]}>
                            {(tech) => (
                              <span class="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
                                {tech}
                              </span>
                            )}
                          </For>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </Show>
            </main>
          </div>
        </Show>

        {/* 独立页面（阅读器、发现、书籍信息、导入、远程书籍）- 全屏显示，在主容器外部 */}
        <Show when={isStandalonePage()}>
          {/* 阅读器页面 */}
          <Show when={currentPage() === "reader"}>
            <ReaderPage
              onClose={() => {
                readerStore.closeBook();
                setCurrentPage("bookshelf");
              }}
              onOpenBookInfo={async () => {
                const book = readerStore.state.book;
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
                setBookInfoContext({ source, book: sb, fromPage: "reader" });
                setCurrentPage("book-info");
              }}
            />
          </Show>

          {/* 发现页：书源 · 分类下的书籍列表 */}
          <Show when={currentPage() === "discover" && discoverContext()}>
            {(ctx) => {
              const { source, section } = ctx();
              return (
                <DiscoverPage
                  source={source}
                  section={section}
                  onBack={() => {
                    setDiscoverContext(null);
                    setCurrentPage("sources");
                  }}
                  onOpenBook={(book) => {
                    readerStore.setBookInitialState(book);
                    setCurrentPage("reader");
                    readerStore.openBook(book).catch((e) => {
                      console.error("打开书籍失败:", e);
                      setCurrentPage("discover");
                    });
                  }}
                  onOpenBookInfo={(book) => {
                    setBookInfoContext({ source, book, fromPage: "discover" });
                    setCurrentPage("book-info");
                  }}
                  showPaginationPreferenceDialog={showDiscoverPaginationPreferenceDialog()}
                  onPaginationPreferenceDialogChange={setShowDiscoverPaginationPreferenceDialog}
                />
              );
            }}
          </Show>

          {/* 书籍信息页 */}
          <Show when={currentPage() === "book-info" && bookInfoContext()}>
            {(ctx) => {
              const { book, fromPage } = ctx();
              return (
                <BookInfoPage
                  book={book}
                  onBack={() => {
                    setBookInfoContext(null);
                    setCurrentPage(fromPage ?? "discover");
                  }}
                  onOpenBook={(book) => {
                    readerStore.setBookInitialState(book);
                    setCurrentPage("reader");
                    setBookInfoContext(null);
                    readerStore.openBook(book).catch((e) => {
                      console.error("打开书籍失败:", e);
                      setCurrentPage("book-info");
                    });
                  }}
                />
              );
            }}
          </Show>

          {/* 导入页面 */}
          <Show when={currentPage() === "import"}>
            <ImportPage
              onClose={() => setCurrentPage("bookshelf")}
              groupId={bookshelfStore.state.currentGroup >= 0 ? bookshelfStore.state.currentGroup : undefined}
            />
          </Show>

          {/* 远程书籍页面 */}
          <Show when={currentPage() === "remote-book"}>
            <RemoteBookPage
              onClose={() => setCurrentPage("bookshelf")}
              groupId={bookshelfStore.state.currentGroup >= 0 ? bookshelfStore.state.currentGroup : undefined}
            />
          </Show>
        </Show>

        {/* 回到顶部按钮 - 放在滚动容器外部，确保 fixed 定位正确 */}
        <ScrollToTop
          container={() => {
            // 获取主内容容器元素
            const containerEl = document.getElementById('main-content-container');
            return containerEl || window;
          }}
          threshold={300}
          positionClass={cn(
            "bottom-8",
            shell().useMobileShell ? "right-4" : "right-8"
          )}
        />

        {/* 书籍目录选择弹窗 */}
        <BookDirectoryDialog
          open={showBookDirectoryDialog()}
          onOpenChange={handleBookDirectoryDialogClose}
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
        <ImportSourceLocalDialog
          open={showImportSourceLocalDialog()}
          onOpenChange={setShowImportSourceLocalDialog}
        />
        <ImportSourceNetworkDialog
          open={showImportSourceNetworkDialog()}
          onOpenChange={setShowImportSourceNetworkDialog}
        />
        <SourceGroupManageDialog
          open={showSourceGroupManageDialog()}
          onOpenChange={setShowSourceGroupManageDialog}
          onGroupsChange={() => window.dispatchEvent(new CustomEvent('sources-refresh'))}
        />
        <SourceSearchDialog
          open={!!sourceSearchContext()}
          onOpenChange={(open) => !open && setSourceSearchContext(null)}
          source={sourceSearchContext()?.source ?? null}
          onOpenBookInfo={(source, book) => {
            setBookInfoContext({ source, book, fromPage: 'discover' });
            setCurrentPage('book-info');
            setSourceSearchContext(null);
          }}
          onAddedToShelf={() => window.dispatchEvent(new CustomEvent('bookshelf-refresh'))}
        />
        <SourceLoginDialog
          open={!!sourceLoginDialogSource()}
          onOpenChange={(open) => !open && setSourceLoginDialogSource(null)}
          source={sourceLoginDialogSource()}
        />
      </div>
    );
  };

  return (
    <ShellLayoutProvider windowWidth={windowWidth}>
      <AppChrome />
    </ShellLayoutProvider>
  );
}

/** 应用级侧边栏宽度（覆盖 ui/sidebar 默认 16rem，与 w-48 一致） */
const appSidebarStyle = {
  "--sidebar-width": "12rem",
  "--sidebar-width-icon": "3rem",
} as const;

function App() {
  return (
    <SidebarProvider style={appSidebarStyle}>
      <AppContent />
      <Portal mount={document.body}>
        <div class="reader-toast-host" data-kb-top-layer>
          <Toaster
            theme="system"
            position="bottom-right"
            closeButton
            richColors
            swipeDirections={["bottom", "right"]}
            class="z-200"
          />
        </div>
      </Portal>
    </SidebarProvider>
  );
}

export default App;
