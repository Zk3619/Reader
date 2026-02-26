/**
 * 分组管理页面
 * 对应 legado 项目的分组管理功能，但使用独立视图而非对话框
 *
 * 功能：
 * 1. 显示所有分组（默认分组和用户自定义分组）
 * 2. 拖拽排序（调整显示顺序）
 * 3. 编辑分组（封面、排序方式、是否允许刷新、是否显示）
 * 4. 对于默认分组，禁止删除和修改名称
 */

import { createSignal, For, Show, onMount, onCleanup, batch, createEffect } from 'solid-js';
import Sortable from 'sortablejs';
import { blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { Switch, SwitchControl, SwitchThumb } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { getCoverPreviewInfo } from '@/utils/book-group-cover';
import * as groupsDb from '@/lib/database/book-groups';
import { BookGroupId } from '@/types';
import type { BookGroup } from '@/types';
import { BookGroupFormDialog } from '@/components/BookGroupFormDialog';
import { RefreshIcon } from '@/components/icons';
import { showAppToast } from '@/components/AppToasts';
import { getBooksDirectory } from '@/lib/local-book/import';
import { getFileSystem } from '@/lib/platform/filesystem';
import { hasBook } from '@/lib/database/books';
import { importLocalBookFromContent } from '@/lib/local-book';
import { isTauri } from '@/lib/platform/detect';
import { join } from '@tauri-apps/api/path';

// 注意：不使用 Key 组件，因为 SortableJS 已经移动了 DOM
// 我们需要让 SolidJS 根据数据顺序重新渲染，而不是阻止它

interface BookGroupManageProps {
  onClose?: () => void;
}

/**
 * 判断是否为默认分组
 */
function isDefaultGroup(groupId: number): boolean {
  return groupId < 0;
}

/**
 * 获取分组显示名称
 */
function getGroupDisplayName(group: BookGroup): string {
  switch (group.groupId) {
    case BookGroupId.All:
      return `${group.groupName}`; // （全部）
    case BookGroupId.Local:
      return `${group.groupName}`; // （本地）
    case BookGroupId.Audio:
      return `${group.groupName}`; // （音频）
    case BookGroupId.NetNone:
      return `${group.groupName}`; // （网络未分组）
    case BookGroupId.LocalNone:
      return `${group.groupName}`; // （本地未分组）
    case BookGroupId.Error:
      return `${group.groupName}`; // （更新失败）
    default:
      return group.groupName;
  }
}

/**
 * 书籍排序方式选项
 */
const bookSortOptions = [
  { value: -1, label: '默认' },
  { value: 0, label: '最近阅读时间' },
  { value: 1, label: '最近更新时间' },
  { value: 2, label: '书名' },
  { value: 3, label: '手动排序' },
  { value: 4, label: '综合排序' },
  { value: 5, label: '作者' },
];

export function BookGroupManage(props: BookGroupManageProps) {
  const [groups, setGroups] = createSignal<BookGroup[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [formDialogOpen, setFormDialogOpen] = createSignal(false);
  const [formDialogMode, setFormDialogMode] = createSignal<'add' | 'edit'>('add');
  const [formDialogGroup, setFormDialogGroup] = createSignal<BookGroup | null>(null);
  // 手动管理 hover 状态，避免焦点变化导致 hover 样式丢失
  const [hoveredGroupId, setHoveredGroupId] = createSignal<number | null>(null);
  // 封面图片加载失败的 groupId 集合，用于显示默认图标
  const [coverImageErrorIds, setCoverImageErrorIds] = createSignal<Set<number>>(new Set());
  // 重新加载书籍列表状态
  const [isReloadingBooks, setIsReloadingBooks] = createSignal(false);
  // SortableJS 实例
  let sortableInstance: Sortable | null = null;
  let sortableContainer: HTMLDivElement | null = null;

  // 加载分组数据
  onMount(() => {
    loadGroups();

    // 跟踪鼠标位置，用于判断鼠标是否仍在元素上
    const handleMouseMove = (e: MouseEvent) => {
      (window as any).lastMouseX = e.clientX;
      (window as any).lastMouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    onCleanup(() => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
      }
    });
  });

  // 初始化 SortableJS 的函数
  function initSortable(container: HTMLDivElement) {
    // 如果已经存在实例且是同一个容器，跳过
    if (sortableInstance && sortableInstance.el === container) {
      return;
    }

    if (sortableInstance) {
      console.log('销毁旧的 SortableJS 实例');
      try {
        sortableInstance.destroy();
      } catch (e) {
        console.warn('销毁 SortableJS 实例时出错:', e);
      }
      sortableInstance = null;
    }

    setTimeout(() => {
      if (sortableInstance) {
        console.log('SortableJS 已在其他地方初始化，跳过');
        return;
      }

      const dragHandles = container.querySelectorAll('.drag-handle');
      console.log('初始化 SortableJS', {
        container,
        dragHandlesCount: dragHandles.length,
        groupsCount: groups().length,
        loading: loading(),
      });

      if (dragHandles.length === 0) {
        console.warn('未找到拖拽手柄元素！请检查 .drag-handle 类名是否正确。');
        return;
      }

      if (groups().length === 0) {
        console.warn('分组数据为空，跳过 SortableJS 初始化');
        return;
      }

      try {
        sortableInstance = Sortable.create(container, {
          animation: 150,
          handle: '.drag-handle',
          ghostClass: 'opacity-50',
          chosenClass: 'sortable-chosen',
          dragClass: 'sortable-drag',
          forceFallback: true,
          fallbackOnBody: true,
          fallbackTolerance: 0,
          fallbackOffset: { x: 0, y: 0 },
          preventOnFilter: false,
          emptyInsertThreshold: 0,
          swapThreshold: 0.65,
          onStart: (evt) => {
            console.log('拖拽开始', {
              oldIndex: evt.oldIndex,
              item: evt.item,
              from: evt.from,
            });
          },
          onMove: () => true,
          onEnd: async (evt) => {
            console.log('拖拽结束', {
              oldIndex: evt.oldIndex,
              newIndex: evt.newIndex,
              item: evt.item,
            });
            const { oldIndex, newIndex } = evt;
            if (oldIndex !== undefined && newIndex !== undefined && oldIndex !== newIndex) {
              await handleSortEnd(oldIndex, newIndex);
            }
          },
        });
        console.log('SortableJS 初始化成功！', sortableInstance);
      } catch (error) {
        console.error('SortableJS 初始化失败:', error);
      }
    }, 100);
  }

  let isInitialized = false;
  createEffect(() => {
    const groupsData = groups();
    const isLoading = loading();

    if (!isInitialized && sortableContainer && !isLoading && groupsData.length > 0) {
      setTimeout(() => {
        if (sortableContainer && !isLoading && groupsData.length > 0 && !sortableInstance) {
          initSortable(sortableContainer);
          isInitialized = true;
        }
      }, 150);
    }
  });

  async function loadGroups() {
    setLoading(true);
    setError(null);

    try {
      const allGroups = await groupsDb.getAllGroups();
      const sortedGroups = [...allGroups].sort((a, b) => a.order - b.order);
      setGroups(sortedGroups);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '加载分组失败';
      setError(errorMsg);
      console.error('加载分组失败:', e);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(group: BookGroup) {
    blurActiveElement();
    setFormDialogMode('edit');
    setFormDialogGroup(group);
    setFormDialogOpen(true);
  }

  async function handleToggleShow(group: BookGroup, newShowValue: boolean) {
    blurActiveElement();

    const updatedGroup: BookGroup = {
      ...group,
      show: newShowValue,
    };

    batch(() => {
      setGroups(groups().map(g =>
        g.groupId === group.groupId ? updatedGroup : g
      ));
    });

    try {
      await groupsDb.updateGroup(updatedGroup);
    } catch (e) {
      batch(() => {
        setGroups(groups().map(g =>
          g.groupId === group.groupId ? group : g
        ));
      });
      const errorMsg = e instanceof Error ? e.message : '更新失败';
      setError(errorMsg);
      console.error('更新分组失败:', e);
    }
  }

  function handleAdd() {
    blurActiveElement();
    setFormDialogMode('add');
    setFormDialogGroup(null);
    setFormDialogOpen(true);
  }

  async function handleSortEnd(oldIndex: number, newIndex: number) {
    try {
      const container = sortableContainer;
      if (!container) {
        console.error('sortableContainer 不存在');
        return;
      }

      const currentOrder: number[] = [];
      Array.from(container.children).forEach((child) => {
        const groupId = parseInt((child as HTMLElement).getAttribute('data-group-id') || '0');
        if (groupId) {
          currentOrder.push(groupId);
        }
      });

      if (currentOrder.length === 0) {
        const currentGroups = groups();
        const newGroups = [...currentGroups];
        const [moved] = newGroups.splice(oldIndex, 1);
        newGroups.splice(newIndex, 0, moved);

        const updatedGroups = newGroups.map((group, index) => ({
          ...group,
          order: index,
        }));

        await groupsDb.updateGroupsOrder(
          updatedGroups.map(g => ({ groupId: g.groupId, order: g.order }))
        );
        return;
      }

      const currentGroups = groups();
      const groupMap = new Map(currentGroups.map(g => [g.groupId, g]));

      const updatedGroups = currentOrder
        .map((groupId) => groupMap.get(groupId))
        .filter((group): group is BookGroup => group !== undefined)
        .map((group, index) => ({
          ...group,
          order: index,
        }));

      await groupsDb.updateGroupsOrder(
        updatedGroups.map(g => ({ groupId: g.groupId, order: g.order }))
      );

      console.log('数据库顺序已更新:', updatedGroups.map(g => g.groupId));
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '更新顺序失败';
      setError(errorMsg);
      console.error('更新分组顺序失败:', e);
      await loadGroups();
    }
  }

  async function handleDelete(group: BookGroup) {
    if (isDefaultGroup(group.groupId)) {
      setError('默认分组无法删除');
      return;
    }

    if (!confirm(`确定要删除分组"${group.groupName}"吗？`)) {
      return;
    }

    try {
      await groupsDb.deleteGroup(group.groupId);
      await loadGroups();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '删除失败';
      setError(errorMsg);
      console.error('删除分组失败:', e);
    }
  }

  /**
   * 重新加载本地书籍列表
   * 扫描本地书籍目录，找出不在数据库中的书籍文件并导入
   */
  async function handleReloadLocalBooks() {
    if (!isTauri()) {
      showAppToast({
        title: "不支持",
        description: "重新加载功能仅在桌面端和移动端可用",
        variant: "error",
      });
      return;
    }

    setIsReloadingBooks(true);
    setError(null);

    try {
      const booksDir = await getBooksDirectory();
      const fs = await getFileSystem();
      
      // 读取目录中的所有文件
      const files = await fs.readDir(booksDir);
      
      // 过滤出书籍文件（.txt, .epub 等）
      const bookFiles: string[] = [];
      for (const file of files) {
        // readDir 返回字符串数组
        const fileName = file;
        if (!fileName) continue;
        
        const fullPath = await join(booksDir, fileName);
        
        // 检查是否是文件（不是目录）
        try {
          // 尝试读取目录，如果失败则可能是文件
          await fs.readDir(fullPath);
          // 是目录，跳过
          continue;
        } catch {
          // 不是目录，检查是否是书籍文件
          const ext = fileName.toLowerCase().split('.').pop();
          if (ext === 'txt' || ext === 'epub') {
            bookFiles.push(fullPath);
          }
        }
      }

      if (bookFiles.length === 0) {
        showAppToast({
          title: "未找到书籍",
          description: "本地目录中没有找到书籍文件",
          variant: "default",
        });
        setIsReloadingBooks(false);
        return;
      }

      // 检查哪些文件不在数据库中
      const missingBooks: string[] = [];
      for (const filePath of bookFiles) {
        const exists = await hasBook(filePath);
        if (!exists) {
          missingBooks.push(filePath);
        }
      }

      if (missingBooks.length === 0) {
        showAppToast({
          title: "无需恢复",
          description: "所有本地书籍文件已在书架中",
          variant: "default",
        });
        setIsReloadingBooks(false);
        return;
      }

      // 导入缺失的书籍
      let successCount = 0;
      let failCount = 0;

      for (const filePath of missingBooks) {
        try {
          const fileName = filePath.split(/[/\\]/).pop() || '';
          const content = await fs.readFile(filePath);
          
          // 导入到本地分组
          await importLocalBookFromContent(
            filePath,
            fileName,
            content,
            { groupId: BookGroupId.Local }
          );
          
          successCount++;
        } catch (error) {
          console.error(`导入文件失败: ${filePath}`, error);
          failCount++;
        }
      }

      // 显示结果
      if (successCount > 0) {
        showAppToast({
          title: "恢复完成",
          description: `成功恢复 ${successCount} 本书${failCount > 0 ? `，${failCount} 本失败` : ''}`,
          variant: "success",
        });
        
        // 触发书架刷新
        window.dispatchEvent(new CustomEvent("bookshelf-refresh"));
      } else {
        showAppToast({
          title: "恢复失败",
          description: `所有 ${missingBooks.length} 本书恢复失败`,
          variant: "error",
        });
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '重新加载失败';
      setError(errorMsg);
      console.error('重新加载本地书籍失败:', e);
      showAppToast({
        title: "重新加载失败",
        description: errorMsg,
        variant: "error",
      });
    } finally {
      setIsReloadingBooks(false);
    }
  }

  return (
    <div class="w-full space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-foreground">分组管理</h2>
          <p class="text-sm text-muted-foreground">
            管理书架分组，调整显示顺序和设置
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button
            variant="default"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleAdd();
            }}
            type="button"
          >
            添加分组
          </Button>
          <Button
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              props.onClose?.();
            }}
          >
            返回
          </Button>
        </div>
      </div>

      <Show when={error()}>
        <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error()}
        </div>
      </Show>

      <Show when={loading()}>
        <div class="space-y-2">
          <For each={[1, 2, 3, 4, 5, 6]}>
            {() => (
              <div class="flex items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2.5 animate-pulse">
                <span class="h-4 w-4 shrink-0 rounded bg-muted" />
                <span class="h-10 w-24 shrink-0 rounded-lg bg-muted" />
                <span class="h-4 flex-1 max-w-[200px] rounded bg-muted" />
                <span class="h-4 w-16 rounded bg-muted" />
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={!loading() && groups().length > 0}>
        <div
          ref={(el) => {
            sortableContainer = el;
          }}
          class="space-y-2"
        >
          <For each={groups()} fallback={<div>暂无分组</div>}>
            {(group) => {
              const isDefault = isDefaultGroup(group.groupId);
              let pressStartTime = 0;
              let pressStartX = 0;
              let pressStartY = 0;
              let hasMoved = false;
              let longPressTimer: number | null = null;
              let longPressTriggered = false;
              let triggerElement: HTMLElement | null = null;

              return (
                <ContextMenu>
                  <ContextMenuTrigger
                    as="div"
                    ref={(el) => { triggerElement = el; }}
                    data-group-id={group.groupId}
                    onMouseEnter={() => setHoveredGroupId(group.groupId)}
                    onMouseLeave={(e) => {
                      const relatedTarget = e.relatedTarget as HTMLElement;
                      if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
                        setHoveredGroupId(null);
                      }
                    }}
                    onMouseDown={(e) => {
                      if (e.button === 0) {
                        pressStartTime = Date.now();
                        pressStartX = e.clientX;
                        pressStartY = e.clientY;
                        hasMoved = false;
                        longPressTriggered = false;
                        longPressTimer = window.setTimeout(() => {
                          if (!hasMoved) {
                            longPressTriggered = true;
                          }
                        }, 500);
                      }
                    }}
                    onMouseMove={(e) => {
                      if (pressStartTime > 0) {
                        const moveDistance = Math.sqrt(
                          Math.pow(e.clientX - pressStartX, 2) +
                          Math.pow(e.clientY - pressStartY, 2)
                        );
                        if (moveDistance > 5) {
                          hasMoved = true;
                          if (longPressTimer !== null) {
                            clearTimeout(longPressTimer);
                            longPressTimer = null;
                          }
                        }
                      }
                    }}
                    onMouseUp={(e) => {
                      if (longPressTimer !== null) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                      }
                      if (longPressTriggered && !hasMoved && triggerElement) {
                        const event = new MouseEvent('contextmenu', {
                          bubbles: true,
                          cancelable: true,
                          clientX: e.clientX,
                          clientY: e.clientY,
                        });
                        triggerElement.dispatchEvent(event);
                      }
                      pressStartTime = 0;
                      hasMoved = false;
                      longPressTriggered = false;
                    }}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      pressStartTime = Date.now();
                      pressStartX = touch.clientX;
                      pressStartY = touch.clientY;
                      hasMoved = false;
                      longPressTriggered = false;
                      longPressTimer = window.setTimeout(() => {
                        if (!hasMoved) {
                          longPressTriggered = true;
                        }
                      }, 500);
                    }}
                    onTouchMove={(e) => {
                      if (pressStartTime > 0) {
                        const touch = e.touches[0];
                        const moveDistance = Math.sqrt(
                          Math.pow(touch.clientX - pressStartX, 2) +
                          Math.pow(touch.clientY - pressStartY, 2)
                        );
                        if (moveDistance > 10) {
                          hasMoved = true;
                          if (longPressTimer !== null) {
                            clearTimeout(longPressTimer);
                            longPressTimer = null;
                          }
                        }
                      }
                    }}
                    onTouchEnd={(e) => {
                      if (longPressTimer !== null) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                      }
                      if (longPressTriggered && !hasMoved && triggerElement) {
                        const touch = e.changedTouches[0];
                        const event = new MouseEvent('contextmenu', {
                          bubbles: true,
                          cancelable: true,
                          clientX: touch.clientX,
                          clientY: touch.clientY,
                        });
                        triggerElement.dispatchEvent(event);
                      }
                      pressStartTime = 0;
                      hasMoved = false;
                      longPressTriggered = false;
                    }}
                    class={cn(
                      'group flex items-center gap-4 rounded-xl border bg-card p-4 transition-all select-none',
                      hoveredGroupId() === group.groupId && 'border-primary/50 shadow-md',
                      'hover:border-primary/50 hover:shadow-md',
                      'group-focus-within:border-primary/50 group-focus-within:shadow-md'
                    )}
                  >
                  <div class="drag-handle cursor-move text-muted-foreground hover:text-foreground select-none">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="h-5 w-5"
                    >
                      <circle cx="9" cy="12" r="1" />
                      <circle cx="9" cy="5" r="1" />
                      <circle cx="9" cy="19" r="1" />
                      <circle cx="15" cy="12" r="1" />
                      <circle cx="15" cy="5" r="1" />
                      <circle cx="15" cy="19" r="1" />
                    </svg>
                  </div>

                  <div class="flex h-10 aspect-3/4 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/50 text-lg">
                    {(() => {
                      const info = getCoverPreviewInfo(group.cover);
                      const imageFailed = coverImageErrorIds().has(group.groupId);
                      if (info.type === 'invalid' || (info.url && imageFailed)) {
                        return (
                          <span class="flex h-full w-full items-center justify-center text-muted-foreground" aria-hidden>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              class="h-5 w-5"
                            >
                              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                              <path d="M8 7h3" />
                              <path d="M8 11h6" />
                            </svg>
                          </span>
                        );
                      }
                      if (info.type === 'emoji' && group.cover) {
                        return <span class="flex h-full w-full items-center justify-center">{group.cover.trim()}</span>;
                      }
                      if (info.url && !imageFailed) {
                        return (
                          <img
                            src={info.url}
                            alt=""
                            class="h-full w-full object-cover"
                            onError={() => setCoverImageErrorIds((prev) => new Set(prev).add(group.groupId))}
                          />
                        );
                      }
                      return (
                        <span class="flex h-full w-full items-center justify-center text-muted-foreground" aria-hidden>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            class="h-5 w-5"
                          >
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                            <path d="M8 7h3" />
                            <path d="M8 11h6" />
                          </svg>
                        </span>
                      );
                    })()}
                  </div>

                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <h3 class="font-semibold text-foreground">
                        {getGroupDisplayName(group)}
                      </h3>
                      {isDefault && (
                        <span class="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          系统
                        </span>
                      )}
                    </div>
                    <p class="text-sm text-muted-foreground">
                      排序方式: {bookSortOptions.find(o => o.value === group.bookSort)?.label || '默认'}
                    </p>
                    {/* 本地分组显示重新加载按钮 */}
                    <Show when={group.groupId === BookGroupId.Local}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async (e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          await handleReloadLocalBooks();
                        }}
                        disabled={isReloadingBooks()}
                        class="mt-2"
                      >
                        <RefreshIcon class="h-4 w-4 mr-2" />
                        {isReloadingBooks() ? '重新加载中...' : '重新加载书籍列表'}
                      </Button>
                    </Show>
                  </div>

                  <div
                    class="flex items-center gap-3"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div
                      class="flex items-center gap-2"
                      onMouseEnter={() => setHoveredGroupId(group.groupId)}
                      onMouseLeave={(e) => {
                        const relatedTarget = e.relatedTarget as HTMLElement;
                        if (!relatedTarget || !e.currentTarget.closest(`[data-group-id="${group.groupId}"]`)?.contains(relatedTarget)) {
                          setTimeout(() => {
                            const element = document.elementFromPoint(
                              (window as any).lastMouseX || 0,
                              (window as any).lastMouseY || 0
                            );
                            if (!element?.closest(`[data-group-id="${group.groupId}"]`)) {
                              setHoveredGroupId(null);
                            }
                          }, 50);
                        }
                      }}
                    >
                      <Label for={`show-${group.groupId}`} class="text-sm">
                        显示
                      </Label>
                      <Switch
                        checked={group.show}
                        onChange={(checked) => handleToggleShow(group, checked)}
                        onFocus={() => setHoveredGroupId(group.groupId)}
                        onBlur={() => {
                          setTimeout(() => {
                            const element = document.elementFromPoint(
                              (window as any).lastMouseX || 0,
                              (window as any).lastMouseY || 0
                            );
                            if (!element?.closest(`[data-group-id="${group.groupId}"]`)) {
                              setHoveredGroupId(null);
                            }
                          }, 100);
                        }}
                      >
                        <SwitchControl id={`show-${group.groupId}`}>
                          <SwitchThumb />
                        </SwitchControl>
                      </Switch>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleEdit(group);
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      type="button"
                    >
                      编辑
                    </Button>
                  </div>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onSelect={() => handleEdit(group)}
                    >
                      编辑
                    </ContextMenuItem>
                    <ContextMenuItem
                      onSelect={() => handleDelete(group)}
                      disabled={isDefault}
                      class={cn(isDefault && 'opacity-50 cursor-not-allowed')}
                    >
                      删除
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenuTrigger>
                </ContextMenu>
              );
            }}
          </For>
        </div>
      </Show>

      <Show when={!loading() && groups().length === 0}>
        <div class="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-12">
          <div class="mb-4 text-5xl">📚</div>
          <h3 class="mb-2 text-lg font-semibold text-foreground">
            暂无分组
          </h3>
          <p class="text-sm text-muted-foreground">
            分组数据为空
          </p>
        </div>
      </Show>

      <BookGroupFormDialog
        open={formDialogOpen()}
        onOpenChange={(open) => setFormDialogOpen(open)}
        mode={formDialogMode()}
        initialGroup={formDialogMode() === 'edit' ? formDialogGroup() : null}
        onSuccess={loadGroups}
        onError={(msg) => setError(msg)}
      />
    </div>
  );
}
