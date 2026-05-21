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
import { GroupContextMenu, type GroupContextMenuActions } from '@/components/bookshelf/BookGroupContextMenu';
import { bookGroupCompactCardClass, bookGroupCompactCoverClass } from '@/lib/bookshelf/book-group-card-styles';
import {
  applyGroupsOrder,
  isDefaultBookGroup,
  pinGroupToBottom,
  pinGroupToTop,
} from '@/lib/bookshelf/book-group-order';
import { getCoverPreviewInfo } from '@/lib/bookshelf/book-group-cover';
import * as groupsDb from '@/lib/database/book-groups';
import { BookGroupId } from '@/types';
import type { BookGroup } from '@/types';
import { BookGroupFormDialog } from '@/components/bookshelf/BookGroupFormDialog';
import { BookshelfIcon, GripVerticalIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import { mainShellPageScroll } from '@/lib/ui/viewport-classes';
import { BookCoverPlaceholderIcon } from '@/components/bookshelf/book-group-cover-icon';
// 注意：不使用 Key 组件，因为 SortableJS 已经移动了 DOM
// 我们需要让 SolidJS 根据数据顺序重新渲染，而不是阻止它

export type BookGroupManageToolbarActions = {
  handleAdd: () => void;
};

export interface BookGroupManageProps {
  onClose?: () => void;
  /** 供 App 层 PageToolbar 绑定「添加分组」等操作 */
  onToolbarActionsChange?: (actions: BookGroupManageToolbarActions | null) => void;
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
  // 封面图片加载失败的 groupId 集合，用于显示默认图标
  const [coverImageErrorIds, setCoverImageErrorIds] = createSignal<Set<number>>(new Set());
  // SortableJS 实例
  let sortableInstance: Sortable | null = null;
  let sortableContainer: HTMLDivElement | null = null;

  // 加载分组数据
  onMount(() => {
    loadGroups();
    props.onToolbarActionsChange?.({ handleAdd });

    onCleanup(() => {
      props.onToolbarActionsChange?.(null);
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

  async function applyOrderUpdate(updated: BookGroup[] | null) {
    if (!updated) return;
    try {
      await applyGroupsOrder(updated);
      await loadGroups();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '更新顺序失败';
      setError(errorMsg);
      console.error('更新分组顺序失败:', e);
      await loadGroups();
    }
  }

  async function handlePinTop(group: BookGroup) {
    await applyOrderUpdate(pinGroupToTop(groups(), group.groupId));
  }

  async function handlePinBottom(group: BookGroup) {
    await applyOrderUpdate(pinGroupToBottom(groups(), group.groupId));
  }

  const groupContextMenuActions: GroupContextMenuActions = {
    onEdit: handleEdit,
    onDelete: handleDelete,
    onPinTop: handlePinTop,
    onPinBottom: handlePinBottom,
  };

  async function handleDelete(group: BookGroup) {
    if (isDefaultBookGroup(group.groupId)) {
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

  return (
    <>
      <div class={cn(mainShellPageScroll, 'space-y-6 w-full')}>
        <Show when={error()}>
          <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {error()}
          </div>
        </Show>

        <Show when={loading()}>
          <div class="space-y-2">
            <For each={[1, 2, 3, 4, 5, 6]}>
              {() => (
                <div class="flex items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2 animate-pulse">
                  <span class="h-5 w-5 shrink-0 rounded bg-muted" />
                  <span class="aspect-3/4 h-14 shrink-0 rounded-md bg-muted" />
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
                const isDefault = isDefaultBookGroup(group.groupId);

                return (
                  <GroupContextMenu
                    group={group}
                    orderGroups={groups()}
                    actions={groupContextMenuActions}
                    withLongPress
                    data-group-id={group.groupId}
                    class={bookGroupCompactCardClass('select-none')}
                  >
                    <div class="drag-handle cursor-move text-muted-foreground hover:text-foreground select-none">
                      <GripVerticalIcon class="h-4 w-4" size={16} />
                    </div>

                    <div class={bookGroupCompactCoverClass('text-lg')}>
                      {(() => {
                        const info = getCoverPreviewInfo(group.cover);
                        const imageFailed = coverImageErrorIds().has(group.groupId);
                        if (info.type === 'invalid' || (info.url && imageFailed)) {
                          return (
                            <span class="flex h-full w-full items-center justify-center text-muted-foreground" aria-hidden>
                              <BookCoverPlaceholderIcon class="h-4 w-4" size={16} />
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
                            <BookCoverPlaceholderIcon class="h-4 w-4" size={16} />
                          </span>
                        );
                      })()}
                    </div>

                    <div class="min-w-0 flex-1">
                      <div class="flex min-w-0 items-center gap-2">
                        <h3 class="mb-0.5 truncate font-semibold text-foreground">
                          {getGroupDisplayName(group)}
                        </h3>
                        {isDefault && (
                          <span class="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            系统
                          </span>
                        )}
                      </div>
                      <p class="text-xs text-muted-foreground">
                        排序方式: {bookSortOptions.find(o => o.value === group.bookSort)?.label || '默认'}
                      </p>
                    </div>

                    <div
                      class="flex items-center gap-3"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div class="flex items-center gap-2">
                        <Label for={`show-${group.groupId}`} class="text-sm">
                          显示
                        </Label>
                        <Switch
                          checked={group.show}
                          onChange={(checked) => handleToggleShow(group, checked)}
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
                  </GroupContextMenu>
                );
              }}
            </For>
          </div>
        </Show>

        <Show when={!loading() && groups().length === 0}>
          <div class="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-12">
            <BookshelfIcon class="mb-4 h-12 w-12 text-muted-foreground" size={48} />

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
    </>
  );
}
