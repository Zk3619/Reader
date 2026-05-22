/**
 * 本地书籍批量导入页面
 * 提供文件浏览器界面，支持批量选择和导入
 */

import { createSignal, Show, For, onMount } from 'solid-js';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import { Checkbox } from '@/components/ui/checkbox';
import { PageHeader } from '@/components/shell/PageHeader';
import { showAppToast } from '@/components/shared/AppToasts';
import { getManagedBooksRoot } from '@/lib/platform/fs/managed-storage';
import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { listDirectory, getFileSize } from '@/lib/platform/fs/read-write';
import { formatStorageRef, parseStorageRef } from '@/lib/platform/fs/storage-ref';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { hasBook } from '@/lib/database/books';
import { importLocalBookFromContent } from '@/lib/local-book';
import { bookshelfStore } from '@/stores/bookshelf';
import { 
  FolderIcon, 
  FileIcon, 
  ChevronRightIcon,
  ChevronLeftIcon,
  SearchIcon,
  LoaderIcon
} from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import { isTauri } from '@/lib/platform/detect';

export interface FileItem {
  path: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  modifiedTime?: number;
  isSelected?: boolean;
  isInBookshelf?: boolean;
}

type SortType = 'name' | 'size' | 'time';
type SortOrder = 'asc' | 'desc';

export interface ImportPageProps {
  onClose?: () => void;
  groupId?: number;
}

export function ImportPage(props: ImportPageProps) {
  const [currentPath, setCurrentPath] = createSignal<string>('');
  const [files, setFiles] = createSignal<FileItem[]>([]);
  const [selectedFiles, setSelectedFiles] = createSignal(new Set<string>());
  const [searchQuery, setSearchQuery] = createSignal('');
  const [sortType, setSortType] = createSignal<SortType>('name');
  const [sortOrder, setSortOrder] = createSignal<SortOrder>('asc');
  const [isLoading, setIsLoading] = createSignal(false);
  const [isImporting, setIsImporting] = createSignal(false);
  const [importProgress, setImportProgress] = createSignal({ current: 0, total: 0 });
  const [pathHistory, setPathHistory] = createSignal<string[]>([]);

  // 初始化：设置当前路径为书籍目录或用户选择的目录
  onMount(async () => {
    if (!isTauri()) {
      showAppToast({
        title: "不支持",
        description: "批量导入功能仅在桌面端和移动端可用",
        variant: "error",
      });
      props.onClose?.();
      return;
    }

    try {
      const root = await getManagedBooksRoot();
      const rootKey = formatStorageRef(root);
      setCurrentPath(rootKey);
      await loadDirectory(rootKey);
    } catch (error) {
      console.error('初始化导入页面失败:', error);
      showAppToast({
        title: "初始化失败",
        description: error instanceof Error ? error.message : "无法加载目录",
        variant: "error",
      });
    }
  });

  // 加载目录内容
  const loadDirectory = async (pathKey: string) => {
    setIsLoading(true);
    try {
      const ref = parseStorageRef(pathKey);
      const entries = await listDirectory(ref);
      const fileItems: FileItem[] = [];

      for (const entry of entries) {
        let childKey = entry.path;
        if (ref.kind === 'saf-tree') {
          childKey = entry.isDirectory
            ? formatStorageRef({ kind: 'saf-tree', value: entry.path })
            : formatStorageRef({ kind: 'uri', value: entry.path });
        } else if (
          !entry.path.startsWith('path:') &&
          !entry.path.startsWith('uri:') &&
          !entry.path.startsWith('handle:') &&
          ref.kind === 'path' &&
          isTauri()
        ) {
          childKey = entry.path;
        } else if (entry.path.startsWith('handle:dir:')) {
          childKey = entry.path;
        }

        const fileItem: FileItem = {
          path: childKey,
          name: entry.name,
          isDirectory: entry.isDirectory,
        };

        if (!entry.isDirectory) {
          try {
            const childRef = parseStorageRef(childKey);
            fileItem.size = await getFileSize(childRef);
          } catch (error) {
            console.warn(`获取文件信息失败: ${childKey}`, error);
          }
          try {
            fileItem.isInBookshelf = await hasBook(childKey);
          } catch (error) {
            console.warn(`检查书籍存在性失败: ${childKey}`, error);
          }
        }

        fileItems.push(fileItem);
      }

      // 排序
      const sorted = sortFiles(fileItems, sortType(), sortOrder());
      setFiles(sorted);
    } catch (error) {
      console.error('加载目录失败:', error);
      showAppToast({
        title: "加载失败",
        description: error instanceof Error ? error.message : "无法读取目录内容",
        variant: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 排序文件
  const sortFiles = (items: FileItem[], type: SortType, order: SortOrder): FileItem[] => {
    const sorted = [...items].sort((a, b) => {
      // 目录优先
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;

      let comparison = 0;
      switch (type) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case 'time':
          comparison = (a.modifiedTime || 0) - (b.modifiedTime || 0);
          break;
      }

      return order === 'asc' ? comparison : -comparison;
    });

    return sorted;
  };

  // 切换排序
  const toggleSort = (type: SortType) => {
    if (sortType() === type) {
      setSortOrder(sortOrder() === 'asc' ? 'desc' : 'asc');
    } else {
      setSortType(type);
      setSortOrder('asc');
    }
    const sorted = sortFiles(files(), sortType(), sortOrder());
    setFiles(sorted);
  };

  // 过滤文件
  const filteredFiles = () => {
    const query = searchQuery().toLowerCase();
    if (!query) return files();
    return files().filter(file => file.name.toLowerCase().includes(query));
  };

  // 选择文件夹
  const selectFolder = async () => {
    try {
      const result = await pickDirectory();
      const key = formatStorageRef(result.ref);
      setCurrentPath(key);
      setPathHistory([]);
      await loadDirectory(key);
    } catch (error) {
      if (isUserCancelled(error)) return;
      console.error('选择文件夹失败:', error);
      showAppToast({
        title: '选择文件夹失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    }
  };

  // 进入目录
  const enterDirectory = async (path: string) => {
    setPathHistory([...pathHistory(), currentPath()]);
    setCurrentPath(path);
    await loadDirectory(path);
  };

  // 返回上一级
  const goBack = async () => {
    const history = pathHistory();
    if (history.length > 0) {
      const prevPath = history[history.length - 1];
      setPathHistory(history.slice(0, -1));
      setCurrentPath(prevPath);
      await loadDirectory(prevPath);
    }
  };

  // 切换文件选择
  const toggleFileSelection = (path: string) => {
    const selected = new Set(selectedFiles());
    if (selected.has(path)) {
      selected.delete(path);
    } else {
      selected.add(path);
    }
    setSelectedFiles(selected);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    const filtered = filteredFiles();
    const fileItems = filtered.filter(f => !f.isDirectory && !f.isInBookshelf);
    
    if (fileItems.length === 0) return;

    const selected = new Set<string>(selectedFiles());
    const allSelected = fileItems.every(f => selected.has(f.path));

    if (allSelected) {
      fileItems.forEach(f => selected.delete(f.path));
    } else {
      fileItems.forEach(f => selected.add(f.path));
    }
    setSelectedFiles(selected);
  };

  // 格式化文件大小
  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  // 批量导入
  const handleBatchImport = async () => {
    const selected = Array.from(selectedFiles());
    const fileItems = files().filter(f => selected.includes(f.path) && !f.isDirectory && !f.isInBookshelf);

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
      const { readBytes } = await import('@/lib/platform/fs/read-write');

      for (let i = 0; i < fileItems.length; i++) {
        const fileItem = fileItems[i];
        setImportProgress({ current: i + 1, total: fileItems.length });

        try {
          const content = await readBytes(parseStorageRef(fileItem.path));
          const fileName = fileItem.name;

          // 导入书籍
          await importLocalBookFromContent(
            fileItem.path,
            fileName,
            content,
            { groupId }
          );

          successCount++;
        } catch (error) {
          console.error(`导入文件失败: ${fileItem.path}`, error);
          failCount++;
        }
      }

      // 显示结果
      if (successCount > 0) {
        showAppToast({
          title: "导入完成",
          description: `成功导入 ${successCount} 本书${failCount > 0 ? `，${failCount} 本失败` : ''}`,
          variant: "success",
        });
        
        // 刷新文件列表（更新 isInBookshelf 状态）
        await loadDirectory(currentPath());
        setSelectedFiles(new Set<string>());
        
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

  // 获取选中文件数量
  const selectedCount = () => {
    const filtered = filteredFiles();
    return filtered.filter(f => selectedFiles().has(f.path) && !f.isDirectory && !f.isInBookshelf).length;
  };

  return (
    <div class="flex h-full flex-col bg-background">
      {/* 统一页面头部 */}
      <PageHeader
        onBack={props.onClose}
        title={currentPath() || '未选择目录'}
        subtitle="批量导入"
        draggable={true}
        showThemeToggle={true}
        showWindowControls={true}
        actions={[
          {
            icon: FolderIcon,
            label: '选择文件夹',
            onClick: selectFolder,
            showTooltip: true,
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
              onClick={() => toggleSort('name')}
              class="h-8"
            >
              名称 {sortType() === 'name' && (sortOrder() === 'asc' ? '↑' : '↓')}
            </Button>
            <Button
              variant={sortType() === 'size' ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleSort('size')}
              class="h-8"
            >
              大小 {sortType() === 'size' && (sortOrder() === 'asc' ? '↑' : '↓')}
            </Button>
            <Button
              variant={sortType() === 'time' ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleSort('time')}
              class="h-8"
            >
              时间 {sortType() === 'time' && (sortOrder() === 'asc' ? '↑' : '↓')}
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
            when={filteredFiles().length > 0}
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
                  checked={filteredFiles().filter(f => !f.isDirectory && !f.isInBookshelf).every(f => selectedFiles().has(f.path))}
                  onChange={toggleSelectAll}
                />
                <span class="text-sm font-medium">全选</span>
                <span class="ml-auto text-sm text-muted-foreground">
                  已选择 {selectedCount()} 个文件
                </span>
              </div>

              {/* 文件项 */}
              <For each={filteredFiles()}>
                {(file) => (
                  <div
                    class={cn(
                      "flex items-center gap-4 rounded-md border border-border bg-card p-3 transition-colors",
                      file.isDirectory && "cursor-pointer hover:bg-accent",
                      !file.isDirectory && selectedFiles().has(file.path) && "bg-accent",
                      file.isInBookshelf && "opacity-60"
                    )}
                    onClick={() => {
                      if (file.isDirectory) {
                        enterDirectory(file.path);
                      } else if (!file.isInBookshelf) {
                        toggleFileSelection(file.path);
                      }
                    }}
                  >
                    {/* 选择框 */}
                    <Show when={!file.isDirectory}>
                      <Checkbox
                        checked={selectedFiles().has(file.path)}
                        onChange={() => toggleFileSelection(file.path)}
                        disabled={file.isInBookshelf}
                        onClick={(e: MouseEvent) => e.stopPropagation()}
                      />
                    </Show>

                    {/* 图标 */}
                    <Show
                      when={file.isDirectory}
                      fallback={<FileIcon class="h-5 w-5 text-muted-foreground" />}
                    >
                      <FolderIcon class="h-5 w-5 text-primary" />
                    </Show>

                    {/* 文件名 */}
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="truncate font-medium">{file.name}</span>
                        <Show when={file.isInBookshelf}>
                          <span class="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                            已导入
                          </span>
                        </Show>
                      </div>
                      <div class="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                        <Show when={!file.isDirectory}>
                          <span>{formatFileSize(file.size)}</span>
                        </Show>
                        <Show when={file.modifiedTime}>
                          <span>{new Date(file.modifiedTime!).toLocaleString()}</span>
                        </Show>
                      </div>
                    </div>

                    {/* 目录箭头 */}
                    <Show when={file.isDirectory}>
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
              onClick={() => {
                setSelectedFiles(new Set<string>());
              }}
              disabled={selectedFiles().size === 0 || isImporting()}
            >
              清空选择
            </Button>
            <Button
              onClick={handleBatchImport}
              disabled={selectedCount() === 0 || isImporting()}
            >
              <Show when={isImporting()} fallback="批量导入">
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
