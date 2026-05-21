/**
 * 远程书籍页面
 * 参考 legado 项目的 RemoteBookActivity 实现
 * 支持浏览 WebDav 远程书籍并导入到书架
 */

import { createSignal, Show, For, onMount } from 'solid-js';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import { Checkbox } from '@/components/ui/checkbox';
import { PageHeader } from '@/components/shell/PageHeader';
import { showAppToast } from '@/components/shared/AppToasts';
import { WebDavRemoteBookManager } from '@/lib/remote-book/webdav';
import { WebDavConfigDialog } from '@/components/remote-book/WebDavConfigDialog';
import { importLocalBookFromContent } from '@/lib/local-book';
import { bookshelfStore } from '@/stores/bookshelf';
import { getFileSystem } from '@/lib/platform/filesystem';
import { 
  FolderIcon, 
  FileIcon, 
  ChevronRightIcon,
  ChevronLeftIcon,
  SearchIcon,
  LoaderIcon,
  SettingsIcon,
  RefreshIcon
} from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import { isTauri } from '@/lib/platform/detect';
import { getStorage } from '@/lib/platform/storage';
import type { RemoteBook, WebDavConfig, RemoteBookSort } from '@/types/remote-book';

const WEBDAV_CONFIG_KEY = 'webdav_config';

export interface RemoteBookPageProps {
  onClose?: () => void;
  groupId?: number;
}

export function RemoteBookPage(props: RemoteBookPageProps) {
  const [manager, setManager] = createSignal<WebDavRemoteBookManager | null>(null);
  const [books, setBooks] = createSignal<RemoteBook[]>([]);
  const [selectedBooks, setSelectedBooks] = createSignal(new Set<string>());
  const [searchQuery, setSearchQuery] = createSignal('');
  const [sortType, setSortType] = createSignal<RemoteBookSort>('name');
  const [sortAscending, setSortAscending] = createSignal(true);
  const [isLoading, setIsLoading] = createSignal(false);
  const [isImporting, setIsImporting] = createSignal(false);
  const [importProgress, setImportProgress] = createSignal({ current: 0, total: 0 });
  const [pathHistory, setPathHistory] = createSignal<string[]>([]);
  const [currentPath, setCurrentPath] = createSignal<string>('');
  const [showConfigDialog, setShowConfigDialog] = createSignal(false);

  // 检查并加载配置
  onMount(async () => {
    if (!isTauri()) {
      showAppToast({
        title: "不支持",
        description: "远程书籍功能仅在桌面端和移动端可用",
        variant: "error",
      });
      props.onClose?.();
      return;
    }

    await checkAndLoadConfig();
  });

  const checkAndLoadConfig = async () => {
    try {
      const config = await getStorage<WebDavConfig>(WEBDAV_CONFIG_KEY);
      if (config && config.url && config.username && config.password) {
        const managerInstance = new WebDavRemoteBookManager(config);
        setManager(managerInstance);
        await loadRemoteBooks('');
      } else {
        setShowConfigDialog(true);
      }
    } catch (error) {
      console.error('加载 WebDav 配置失败:', error);
      setShowConfigDialog(true);
    }
  };

  const handleConfigSaved = async (config: WebDavConfig) => {
    const managerInstance = new WebDavRemoteBookManager(config);
    setManager(managerInstance);
    await loadRemoteBooks('');
  };

  // 加载远程书籍列表
  const loadRemoteBooks = async (path: string) => {
    const managerInstance = manager();
    if (!managerInstance) return;

    setIsLoading(true);
    try {
      const remoteBooks = await managerInstance.getRemoteBookList(path);
      setBooks(remoteBooks);
      setCurrentPath(path);
    } catch (error) {
      console.error('加载远程书籍失败:', error);
      showAppToast({
        title: "加载失败",
        description: error instanceof Error ? error.message : "无法加载远程书籍列表",
        variant: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 进入目录
  const enterDirectory = async (book: RemoteBook) => {
    if (!book.contentType || book.contentType === 'folder') {
      setPathHistory([...pathHistory(), currentPath()]);
      await loadRemoteBooks(book.path);
    }
  };

  // 返回上一级
  const goBack = async () => {
    const history = pathHistory();
    if (history.length > 0) {
      const prevPath = history[history.length - 1];
      setPathHistory(history.slice(0, -1));
      await loadRemoteBooks(prevPath);
    }
  };

  // 切换选择
  const toggleSelection = (path: string) => {
    const selected = new Set(selectedBooks());
    if (selected.has(path)) {
      selected.delete(path);
    } else {
      selected.add(path);
    }
    setSelectedBooks(selected);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    const filtered = filteredBooks();
    const fileItems = filtered.filter(f => f.contentType !== 'folder' && !f.isOnBookShelf);

    if (fileItems.length === 0) return;

    const selected = new Set<string>(selectedBooks());
    const allSelected = fileItems.every(f => selected.has(f.path));

    if (allSelected) {
      fileItems.forEach(f => selected.delete(f.path));
    } else {
      fileItems.forEach(f => selected.add(f.path));
    }
    setSelectedBooks(selected);
  };

  // 过滤和排序
  const filteredBooks = () => {
    let result = books();
    
    // 搜索过滤
    const query = searchQuery().toLowerCase();
    if (query) {
      result = result.filter(book => book.filename.toLowerCase().includes(query));
    }

    // 排序
    result = [...result].sort((a, b) => {
      // 目录优先
      if (a.contentType === 'folder' && b.contentType !== 'folder') return -1;
      if (a.contentType !== 'folder' && b.contentType === 'folder') return 1;

      let comparison = 0;
      switch (sortType()) {
        case 'name':
          comparison = a.filename.localeCompare(b.filename);
          break;
        case 'time':
          comparison = a.lastModify - b.lastModify;
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
      }

      return sortAscending() ? comparison : -comparison;
    });

    return result;
  };

  // 批量导入
  const handleBatchImport = async () => {
    const selected = Array.from(selectedBooks());
    const managerInstance = manager();
    if (!managerInstance) return;

    const fileItems = books().filter(b => selected.includes(b.path) && b.contentType !== 'folder' && !b.isOnBookShelf);

    if (fileItems.length === 0) {
      showAppToast({
        title: "未选择文件",
        description: "请至少选择一个文件进行导入",
        variant: "default",
      });
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: fileItems.length });

    const groupId = props.groupId ?? (bookshelfStore.state.currentGroup >= 0 ? bookshelfStore.state.currentGroup : undefined);
    let successCount = 0;
    let failCount = 0;

    try {
      for (let i = 0; i < fileItems.length; i++) {
        const book = fileItems[i];
        setImportProgress({ current: i + 1, total: fileItems.length });

        try {
          // 下载文件
          const localPath = await managerInstance.downloadRemoteBook(book);
          
          // 读取文件内容
          const fs = await getFileSystem();
          const content = await fs.readFile(localPath);

          // 导入书籍
          await importLocalBookFromContent(
            localPath,
            book.filename,
            content,
            { groupId }
          );

          successCount++;
        } catch (error) {
          console.error(`导入文件失败: ${book.filename}`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        showAppToast({
          title: "导入完成",
          description: `成功导入 ${successCount} 本${failCount > 0 ? `，${failCount} 本失败` : ''}`,
          variant: "success",
        });

        // 刷新列表
        await loadRemoteBooks(currentPath());
        setSelectedBooks(new Set<string>());

        // 触发书架刷新
        window.dispatchEvent(new CustomEvent("bookshelf-refresh"));
      } else {
        showAppToast({
          title: "导入失败",
          description: `所有 ${fileItems.length} 本书导入失败`,
          variant: "error",
        });
      }
    } catch (error) {
      console.error('批量导入失败:', error);
      showAppToast({
        title: "导入失败",
        description: error instanceof Error ? error.message : "批量导入过程中发生错误",
        variant: "error",
      });
    } finally {
      setIsImporting(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  // 获取选中文件数量
  const selectedCount = () => {
    const filtered = filteredBooks();
    return filtered.filter(f => selectedBooks().has(f.path) && f.contentType !== 'folder' && !f.isOnBookShelf).length;
  };

  return (
    <div class="flex h-full flex-col bg-background">
      {/* WebDav 配置对话框 */}
      <WebDavConfigDialog
        open={showConfigDialog()}
        onOpenChange={setShowConfigDialog}
        onConfigSaved={handleConfigSaved}
      />

      {/* 统一页面头部 */}
      <PageHeader
        onBack={props.onClose}
        title={currentPath() || '根目录'}
        subtitle="远程书籍"
        draggable={true}
        showThemeToggle={true}
        showWindowControls={true}
        actions={[
          {
            icon: SettingsIcon,
            label: '配置',
            onClick: () => setShowConfigDialog(true),
            showTooltip: true,
          },
          {
            icon: RefreshIcon,
            label: '刷新',
            onClick: () => loadRemoteBooks(currentPath()),
            disabled: isLoading(),
            showTooltip: true,
            iconClass: cn('transition-transform', isLoading() && 'animate-spin'),
          },
        ]}
        class="border-b"
      />

      {/* 路径导航工具栏 */}
      <div class="border-b border-border bg-card px-4 py-2">
        <div class="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            disabled={pathHistory().length === 0}
            class="h-8"
          >
            <ChevronLeftIcon class="h-4 w-4 mr-1" />
            返回上一级
          </Button>
        </div>

        {/* 搜索和排序 */}
        <div class="mt-4 flex items-center gap-4">
          <div class="relative flex-1">
            <SearchIcon class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground z-10" />
            <TextField class="w-full">
              <TextFieldInput
                type="text"
                placeholder="搜索文件..."
                value={searchQuery()}
                onInput={(e: Event) => setSearchQuery((e.currentTarget as HTMLInputElement).value)}
                class="pl-9"
              />
            </TextField>
          </div>
          <div class="flex gap-2">
            <Button
              variant={sortType() === 'name' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                if (sortType() === 'name') {
                  setSortAscending(!sortAscending());
                } else {
                  setSortType('name');
                  setSortAscending(true);
                }
              }}
              class="h-8"
            >
              名称 {sortType() === 'name' && (sortAscending() ? '↑' : '↓')}
            </Button>
            <Button
              variant={sortType() === 'time' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                if (sortType() === 'time') {
                  setSortAscending(!sortAscending());
                } else {
                  setSortType('time');
                  setSortAscending(true);
                }
              }}
              class="h-8"
            >
              时间 {sortType() === 'time' && (sortAscending() ? '↑' : '↓')}
            </Button>
          </div>
        </div>
      </div>

      {/* 文件列表 */}
      <div class="flex-1 overflow-auto scroll-gutter-stable-both px-2 py-4">
        <Show
          when={!isLoading()}
          fallback={
            <div class="space-y-2">
              <For each={[1, 2, 3, 4, 5, 6, 7, 8]}>
                {() => (
                  <div class="flex items-center gap-4 rounded-md border border-border/50 bg-card px-3 py-2.5 animate-pulse">
                    <span class="h-5 w-5 shrink-0 rounded bg-muted" />
                    <span class="h-5 w-5 shrink-0 rounded bg-muted" />
                    <span class="h-4 flex-1 max-w-[240px] rounded bg-muted" />
                  </div>
                )}
              </For>
            </div>
          }
        >
          <Show
            when={filteredBooks().length > 0}
            fallback={
              <div class="flex h-full items-center justify-center text-muted-foreground">
                当前目录为空
              </div>
            }
          >
            <div class="space-y-1">
              {/* 全选 */}
              <div class="flex items-center gap-4 rounded-md border border-border bg-card p-3">
                <Checkbox
                  checked={filteredBooks().filter(f => f.contentType !== 'folder' && !f.isOnBookShelf).every(f => selectedBooks().has(f.path))}
                  onChange={toggleSelectAll}
                />
                <span class="text-sm font-medium">全选</span>
                <span class="ml-auto text-sm text-muted-foreground">
                  已选择 {selectedCount()} 个文件
                </span>
              </div>

              {/* 文件项 */}
              <For each={filteredBooks()}>
                {(book) => (
                  <div
                    class={cn(
                      "flex items-center gap-4 rounded-md border border-border bg-card p-3 transition-colors",
                      book.contentType === 'folder' && "cursor-pointer hover:bg-accent",
                      !book.contentType || book.contentType !== 'folder' && selectedBooks().has(book.path) && "bg-accent",
                      book.isOnBookShelf && "opacity-60"
                    )}
                    onClick={() => {
                      if (book.contentType === 'folder') {
                        enterDirectory(book);
                      } else if (!book.isOnBookShelf) {
                        toggleSelection(book.path);
                      }
                    }}
                  >
                    {/* 选择框 */}
                    <Show when={book.contentType !== 'folder'}>
                      <Checkbox
                        checked={selectedBooks().has(book.path)}
                        onChange={() => toggleSelection(book.path)}
                        disabled={book.isOnBookShelf}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Show>

                    {/* 图标 */}
                    <Show
                      when={book.contentType === 'folder'}
                      fallback={<FileIcon class="h-5 w-5 text-muted-foreground" />}
                    >
                      <FolderIcon class="h-5 w-5 text-primary" />
                    </Show>

                    {/* 文件名 */}
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="truncate font-medium">{book.filename}</span>
                        <Show when={book.isOnBookShelf}>
                          <span class="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                            已导入
                          </span>
                        </Show>
                      </div>
                      <div class="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                        <Show when={book.contentType !== 'folder'}>
                          <span>{formatFileSize(book.size)}</span>
                        </Show>
                        <span>{new Date(book.lastModify).toLocaleString()}</span>
                      </div>
                    </div>

                    {/* 目录箭头 */}
                    <Show when={book.contentType === 'folder'}>
                      <ChevronRightIcon class="h-4 w-4 text-muted-foreground" />
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>

      {/* 底部操作栏 */}
      <div class="border-t border-border bg-card p-4">
        <div class="flex items-center justify-between">
          <div class="text-sm text-muted-foreground">
            <Show when={isImporting()}>
              正在导入 {importProgress().current} / {importProgress().total}...
            </Show>
            <Show when={!isImporting()}>
              已选择 {selectedCount()} 个文件
            </Show>
          </div>
          <div class="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setSelectedBooks(new Set<string>())}
              disabled={selectedBooks().size === 0 || isImporting()}
            >
              清空选择
            </Button>
            <Button
              onClick={handleBatchImport}
              disabled={selectedCount() === 0 || isImporting()}
            >
              <Show when={isImporting()} fallback="加入书架">
                <LoaderIcon class="h-4 w-4 mr-2 animate-spin" />
                导入中...
              </Show>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
