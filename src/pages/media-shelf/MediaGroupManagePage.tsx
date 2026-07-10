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

import { createSignal, For, Show, onMount, batch, createMemo } from 'solid-js';
import { blurActiveElement } from '@/utils/accessibility';
import { Button } from '@/components/ui/button';
import { AppSwitch, AppSwitchControl, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { Label } from '@/components/ui/label';
import { GroupContextMenu, type GroupContextMenuActions } from '@/components/bookshelf/BookGroupContextMenu';
import {
  bookshelfCompactCoverClass,
  bookshelfCompactListCardClass,
  bookshelfCompactMainClass,
} from '@/lib/bookshelf/book-group-card-styles';
import {
  applyGroupsOrder,
  isDefaultBookGroup,
  pinGroupToBottom,
  pinGroupToTop,
} from '@/lib/bookshelf/book-group-order';
import { bookGroupMatchesSearch } from '@/lib/search/search-filters';
import { useChunkedFilter } from '@/lib/hooks/useChunkedFilter';
import { getCoverPreviewInfo } from '@/lib/bookshelf/book-group-cover';
import * as groupsDb from '@/lib/database/book-groups';
import { BookGroupId } from '@/types';
import type { BookGroup } from '@/types';
import { BookGroupFormDialog } from '@/components/bookshelf/BookGroupFormDialog';
import { BookCoverPreviewDialog } from '@/components/books/BookCoverPreviewDialog';
import {
  BookGroupManageListDragOverlay,
  VirtualBookGroupManageList,
} from '@/components/bookshelf/VirtualBookGroupManageList';
import type { VirtualListSortableConfig } from '@/components/shared/virtual-list';
import type { Id } from '@thisbeyond/solid-dnd';
import { BookshelfIcon, GripVerticalIcon, SearchIcon } from '@/components/shared/icons';
import {
  loadGroupManagePrefs,
  saveGroupManagePrefs,
} from '@/lib/bookshelf/bookshelf-manage-prefs';
import {
  loadGroupManageSubPageMode,
  saveGroupManageSubPageMode,
  type SearchMode,
} from '@/lib/search/search-prefs';
import { cn } from '@/lib/utils';
import { notifyPageError, notifyPageWarning } from '@/lib/ui/page-notify';
import { mainShellPageRoot, mainShellPageScroll } from '@/lib/ui/viewport-classes';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import {
  BookGroupManagePageToolbar,
  BookGroupManageToolbarLeading,
} from '@/components/bookshelf/BookGroupManagePageToolbar';
import { DefaultGroupCoverIcon, BookCoverPlaceholderIcon } from '@/components/bookshelf/book-group-cover-icon';

export interface MediaGroupManagePageProps {
  onClose?: () => void;
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

function GroupManageListCover(props: {
  group: BookGroup;
  coverImageErrorIds: Set<number>;
  onCoverError: (groupId: number) => void;
  coverClickPreview?: boolean;
  onCoverPreview?: () => void;
  blockDragFromCover?: boolean;
}) {
  const info = () => getCoverPreviewInfo(props.group.cover);
  const imageFailed = () => props.coverImageErrorIds.has(props.group.groupId);
  const canPreview = () =>
    !!props.coverClickPreview && !!info().url && !imageFailed();
  const coverDragBlockProps = () =>
    props.blockDragFromCover
      ? ({ onPointerDown: (e: PointerEvent) => e.stopPropagation() } as const)
      : ({} as const);

  const coverContent = () => {
    const preview = info();
    if (!props.group.cover?.trim()) {
      return (
        <span class="flex h-full w-full items-center justify-center text-muted-foreground" aria-hidden>
          <DefaultGroupCoverIcon group={props.group} class="h-4 w-4" size={16} />
        </span>
      );
    }
    if (preview.type === 'invalid' || (preview.url && imageFailed())) {
      return (
        <span class="flex h-full w-full items-center justify-center text-muted-foreground" aria-hidden>
          <BookCoverPlaceholderIcon class="h-4 w-4" size={16} />
        </span>
      );
    }
    if (preview.type === 'emoji' && props.group.cover) {
      return (
        <span class="flex h-full w-full items-center justify-center">{props.group.cover.trim()}</span>
      );
    }
    if (preview.url && !imageFailed()) {
      return (
        <img
          src={preview.url ?? undefined}
          alt=""
          class="h-full w-full object-cover"
          onError={() => props.onCoverError(props.group.groupId)}
        />
      );
    }
    return (
      <span class="flex h-full w-full items-center justify-center text-muted-foreground" aria-hidden>
        <BookCoverPlaceholderIcon class="h-4 w-4" size={16} />
      </span>
    );
  };

  return (
    <Show
      when={canPreview()}
      fallback={
        <div
          class={bookshelfCompactCoverClass('text-lg')}
          role="presentation"
          onClick={(e) => e.stopPropagation()}
          {...coverDragBlockProps()}
        >
          {coverContent()}
        </div>
      }
    >
      <div
        class={cn(bookshelfCompactCoverClass('text-lg'), 'cursor-pointer')}
        role="button"
        tabIndex={0}
        aria-label={`查看 ${props.group.groupName} 封面大图`}
        onClick={(e) => {
          e.stopPropagation();
          props.onCoverPreview?.();
        }}
        {...coverDragBlockProps()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            props.onCoverPreview?.();
          }
        }}
      >
        {coverContent()}
      </div>
    </Show>
  );
}

export function MediaGroupManagePage(props: MediaGroupManagePageProps) {
  const [groups, setGroups] = createSignal<BookGroup[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [formDialogOpen, setFormDialogOpen] = createSignal(false);
  const [formDialogMode, setFormDialogMode] = createSignal<'add' | 'edit'>('add');
  const [formDialogGroup, setFormDialogGroup] = createSignal<BookGroup | null>(null);
  // 封面图片加载失败的 groupId 集合，用于显示默认图标
  const [coverImageErrorIds, setCoverImageErrorIds] = createSignal<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = createSignal('');
  const [searchMode, setSearchMode] = createSignal<SearchMode>('name');
  const [coverClickPreview, setCoverClickPreview] = createSignal(true);
  const [enableDragSort, setEnableDragSort] = createSignal(true);
  const [coverPreviewGroup, setCoverPreviewGroup] = createSignal<BookGroup | null>(null);

  const { filtered: filteredGroups, filtering, progressText: filterProgressText } = useChunkedFilter({
    items: groups,
    deps: () => ({ q: searchQuery(), mode: searchMode() }),
    isPassThrough: () => groups().length > 0 && !searchQuery().trim(),
    match: (group) =>
      bookGroupMatchesSearch(group, searchQuery(), getGroupDisplayName, searchMode()),
    progressLabel: '正在筛选分组',
  });

  const listSortableEnabled = createMemo(
    () =>
      enableDragSort() &&
      !searchQuery().trim() &&
      filteredGroups().length === groups().length,
  );

  const groupListSortable = createMemo(
    (): VirtualListSortableConfig<BookGroup> => ({
      enabled: listSortableEnabled,
      ids: () => filteredGroups().map((g) => g.groupId),
      onReorder: handleGroupsReorder,
      persistOnly: true,
    }),
  );

  async function handleGroupsReorder(orderedIds: Id[]) {
    try {
      const map = new Map(groups().map((g) => [g.groupId, g]));
      const reordered = orderedIds
        .map((id) => map.get(Number(id)))
        .filter((g): g is BookGroup => !!g);
      if (reordered.length !== groups().length) return;
      const updated = reordered.map((group, index) => ({ ...group, order: index }));
      await groupsDb.updateGroupsOrder(
        updated.map((g) => ({ groupId: g.groupId, order: g.order })),
      );
      setGroups(updated);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '更新顺序失败';
      notifyPageError('更新顺序失败', errorMsg);
      await loadGroups();
    }
  }

  function renderGroupDragOverlay(activeId: Id | null) {
    if (activeId == null) return null;
    const group = groups().find((g) => g.groupId === Number(activeId));
    if (!group) return null;
    return <BookGroupManageListDragOverlay group={group} />;
  }

  const blockDragPointerProps = () =>
    enableDragSort()
      ? ({ onPointerDown: (e: PointerEvent) => e.stopPropagation() } as const)
      : ({} as const);

  async function saveGroupManageSettings() {
    await saveGroupManagePrefs({
      searchMode: searchMode(),
      coverClickPreview: coverClickPreview(),
      enableDragSort: enableDragSort(),
    });
  }

  async function handleCoverClickPreviewChange(value: boolean) {
    setCoverClickPreview(value);
    await saveGroupManageSettings();
  }

  async function handleEnableDragSortChange(value: boolean) {
    setEnableDragSort(value);
    await saveGroupManageSettings();
  }

  async function handleSearchModeChange(mode: SearchMode) {
    setSearchMode(mode);
    await saveGroupManageSubPageMode(mode);
  }

  onMount(() => {
    void loadGroupManagePrefs().then((p) => {
      setCoverClickPreview(p.coverClickPreview);
      setEnableDragSort(p.enableDragSort);
    });
    void loadGroupManageSubPageMode().then(setSearchMode);
    loadGroups();
  });

  async function loadGroups() {
    setLoading(true);

    try {
      const allGroups = await groupsDb.getAllGroups();
      const sortedGroups = [...allGroups].sort((a, b) => a.order - b.order);
      setGroups(sortedGroups);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '加载分组失败';
      notifyPageError('加载分组失败', errorMsg);
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
      notifyPageError('更新分组失败', errorMsg);
      console.error('更新分组失败:', e);
    }
  }

  function handleAdd() {
    blurActiveElement();
    setFormDialogMode('add');
    setFormDialogGroup(null);
    setFormDialogOpen(true);
  }

  async function applyOrderUpdate(updated: BookGroup[] | null) {
    if (!updated) return;
    try {
      await applyGroupsOrder(updated);
      await loadGroups();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '更新顺序失败';
      notifyPageError('更新顺序失败', errorMsg);
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
      notifyPageWarning('默认分组无法删除');
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
      notifyPageError('删除分组失败', errorMsg);
      console.error('删除分组失败:', e);
    }
  }

  const pageDescription = () => {
    const total = groups().length;
    if (total === 0) return undefined;
    const q = searchQuery().trim();
    if (q) {
      return `共 ${total} 个分组，匹配 ${filteredGroups().length} 个`;
    }
    return `共 ${total} 个分组`;
  };

  return (
    <div class={mainShellPageRoot}>
      <PageToolbar
        title="分组管理"
        description={pageDescription()}
        titleSlot={
          <PageToolbarTitleDropdown
            title="分组管理"
            description={pageDescription()}
            dropdownEnabled={false}
          />
        }
        leading={
          <BookGroupManageToolbarLeading onBack={() => props.onClose?.()} />
        }
      >
        <BookGroupManagePageToolbar
          searchQuery={searchQuery()}
          onSearchQueryChange={setSearchQuery}
          searchMode={searchMode()}
          onSearchModeChange={handleSearchModeChange}
          coverClickPreview={coverClickPreview()}
          onCoverClickPreviewChange={handleCoverClickPreviewChange}
          enableDragSort={enableDragSort()}
          onEnableDragSortChange={handleEnableDragSortChange}
          onAdd={handleAdd}
        />
      </PageToolbar>

      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 w-full flex-col')}>
        <Show when={loading()}>
          <div class="space-y-2">
            <For each={[1, 2, 3, 4, 5, 6]}>
              {() => (
                <div class="flex items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2 animate-pulse">
                  <span class="h-5 w-5 shrink-0 rounded bg-muted" />
                  <span class="aspect-3/4 h-16 shrink-0 rounded-md bg-muted" />
                  <span class="h-4 flex-1 max-w-[200px] rounded bg-muted" />
                  <span class="h-4 w-16 rounded bg-muted" />
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={filtering() && filterProgressText()}>
          <div class="shrink-0 pb-2 text-center text-xs text-muted-foreground">
            {filterProgressText()}
          </div>
        </Show>

        <Show when={!loading() && groups().length > 0}>
          <Show
            when={filteredGroups().length > 0 || filtering()}
            fallback={
              <div class="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-12">
                <SearchIcon class="mb-4 h-12 w-12 text-muted-foreground" size={48} />
                <h3 class="mb-2 text-lg font-semibold text-foreground">无匹配分组</h3>
                <p class="text-sm text-muted-foreground">请尝试其他关键词</p>
              </div>
            }
          >
            <VirtualBookGroupManageList
              groups={filteredGroups()}
              sortable={groupListSortable()}
              renderDragOverlay={groupListSortable() ? renderGroupDragOverlay : undefined}
            >
              {(group) => {
                const isDefault = isDefaultBookGroup(group.groupId);
                const showDragHandle = () => listSortableEnabled();

                return (
                  <div class="box-border flex h-full min-h-0 items-stretch py-1">
                    <GroupContextMenu
                      group={group}
                      orderGroups={groups()}
                      actions={groupContextMenuActions}
                      withLongPress
                      class={bookshelfCompactListCardClass('h-16 select-none')}
                    >
                      <Show when={showDragHandle()}>
                        <div class="flex h-full cursor-grab items-center text-muted-foreground hover:text-foreground active:cursor-grabbing">
                          <GripVerticalIcon class="h-4 w-4" size={16} />
                        </div>
                      </Show>

                      <GroupManageListCover
                        group={group}
                        coverImageErrorIds={coverImageErrorIds()}
                        onCoverError={(groupId) =>
                          setCoverImageErrorIds((prev) => new Set(prev).add(groupId))
                        }
                        coverClickPreview={coverClickPreview()}
                        onCoverPreview={() => setCoverPreviewGroup(group)}
                        blockDragFromCover={enableDragSort() && coverClickPreview()}
                      />

                      <div class={bookshelfCompactMainClass()}>
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
                        class="flex h-full items-center gap-3"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        {...blockDragPointerProps()}
                      >
                        <div class="flex items-center gap-2">
                          <Label for={`show-${group.groupId}`} class="text-sm">
                            显示
                          </Label>
                          <AppSwitch
                            checked={group.show}
                            onChange={(checked) => handleToggleShow(group, checked)}
                          >
                            <AppSwitchControl id={`show-${group.groupId}`}>
                              <AppSwitchThumb />
                            </AppSwitchControl>
                          </AppSwitch>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e: MouseEvent) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleEdit(group);
                          }}
                          onPointerDown={(e: PointerEvent) => e.stopPropagation()}
                          type="button"
                        >
                          编辑
                        </Button>
                      </div>
                    </GroupContextMenu>
                  </div>
                );
              }}
            </VirtualBookGroupManageList>
          </Show>
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
          onError={(msg) => notifyPageError(msg)}
        />

        <BookCoverPreviewDialog
          open={!!coverPreviewGroup()}
          onOpenChange={(open) => {
            if (!open) setCoverPreviewGroup(null);
          }}
          coverUrl={(() => {
            const g = coverPreviewGroup();
            if (!g) return null;
            return getCoverPreviewInfo(g.cover).url;
          })()}
          bookUrl=""
          name={
            coverPreviewGroup() ? getGroupDisplayName(coverPreviewGroup()!) : ''
          }
        />
      </div>
    </div>
  );
}
