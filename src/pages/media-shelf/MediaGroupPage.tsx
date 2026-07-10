/**
 * 书架分组界面
 * 对应 legado 项目的分组功能
 * 参考 UI.md 中的主要内容区域部分
 * 
 * 功能：
 * 1. 显示分组列表（列表和网格两种模式）
 * 2. 支持视图切换（列表/网格）
 * 3. 点击分组切换当前分组
 * 4. 响应式设计（宽屏/窄屏）
 */

import {
  createSignal,
  For,
  Show,
  onMount,
  createEffect,
  createMemo,
  onCleanup,
  type Accessor,
  type JSX,
} from 'solid-js';
import type { Id } from '@thisbeyond/solid-dnd';
import { filterBookGroups } from '@/lib/search/search-filters';
import Sortable from 'sortablejs';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { useShelfNavigation } from '@/stores/shelf-navigation-context';
import { bookshelfLayoutStore, initBookshelfLayoutSettings } from '@/stores/bookshelf-layout';
import * as groupsDb from '@/lib/database/book-groups';
import type { MediaKind } from '@/lib/book-source/book-type';
import { getShelfGroups } from '@/lib/database/media-groups';
import { getBooksByGroup, getBooksByGroupAndKind } from '@/lib/database/books';
import type { BookGroup } from '@/types';
import { cn } from '@/lib/utils';
import {
  bookGroupCompactButtonClass,
  bookshelfCompactCoverClass,
  bookshelfCompactMainClass,
  bookshelfCompactRowClass,
  bookshelfListMainClass,
  bookGroupGridButtonClass,
  bookGroupGridCoverClass,
  bookGroupGridCoverZoomClass,
  bookGroupGridMetaClass,
  bookGroupGridSubtitleClass,
  bookGroupGridTitleClass,
  bookGroupListButtonClass,
  bookGroupListCoverClass,
  bookGroupRowSubtitleClass,
  bookGroupRowTitleClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { withLongPressSortableOptions } from '@/utils/sortable-long-press';
import { blurActiveElement } from '@/utils/accessibility';
import {
  applyGroupsOrder,
  isDefaultBookGroup,
  pinGroupToBottom,
  pinGroupToTop,
} from '@/lib/bookshelf/book-group-order';
import { getCoverPreviewInfo } from '@/lib/bookshelf/book-group-cover';
import { resolveGroupDisplayName } from '@/lib/bookshelf/media-group-display';
import { onMediaRefresh } from '@/lib/media-shelf/compat-keys';
import { notifyPageError, notifyPageWarning } from '@/lib/ui/page-notify';
import { GroupContextMenu, type GroupContextMenuActions } from '@/components/bookshelf/BookGroupContextMenu';
import { BookGroupFormDialog } from '@/components/bookshelf/BookGroupFormDialog';
import { BookCoverPreviewDialog } from '@/components/books/BookCoverPreviewDialog';
import {
  DefaultGroupCoverIcon,
  BookCoverPlaceholderIcon,
} from '@/components/bookshelf/book-group-cover-icon';
import { BookshelfIcon, SearchIcon } from '@/components/shared/icons';
import { BookshelfLayoutGrid } from '@/components/bookshelf/BookshelfLayoutGrid';
import { VirtualBookshelfGroupGrid } from '@/components/bookshelf/VirtualBookshelfGroupGrid';
import { useSuppressClickAfterDrag } from '@/components/shared/virtual-list/use-suppress-click-after-drag';
import {
  getGroupListSortableContainer,
  getViewModeContainerGridClass,
  isGridViewMode,
  isListViewMode,
  type GroupListSortRefs,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import { BookshelfCoverTitleOverlay } from '@/components/bookshelf/BookshelfCoverTitleOverlay';
import { BookshelfGridHideTooltip } from '@/components/bookshelf/BookshelfGridHideTooltip';
import type { BookTitleDisplay } from '@/stores/bookshelf-layout';

// 视图模式从布局设置 Store 获取，不再使用本地状态

/**
 * 分组显示逻辑与 legado 一致：从数据库 getAllGroups() 获取全部分组（含系统分组），
 * 再按 show 过滤。不再使用硬编码 defaultGroups + getUserGroups()，避免数据库中
 * 的系统分组（如网络未分组、本地未分组、更新失败）不显示。
 */


type GroupListVariant = 'list' | 'list-2' | 'list-3' | 'compact' | 'compact-2' | 'compact-3';

function GroupListCover(props: {
  group: BookGroup;
  compact: boolean;
  coverImageErrorIds: Set<number>;
  onCoverError: (groupId: number) => void;
  coverClickPreview?: boolean;
  onCoverPreview?: () => void;
}) {
  const coverClass = () =>
    props.compact
      ? bookshelfCompactCoverClass('text-lg')
      : bookGroupListCoverClass('text-2xl');
  const info = () => getCoverPreviewInfo(props.group.cover);
  const imageFailed = () => props.coverImageErrorIds.has(props.group.groupId);
  const canPreview = () =>
    !!props.coverClickPreview && !!info().url && !imageFailed();

  const coverDragBlockProps = () =>
    props.coverClickPreview
      ? ({ onPointerDown: (e: PointerEvent) => e.stopPropagation() } as const)
      : ({} as const);

  const coverContent = () => {
    const preview = info();
    if (!props.group.cover?.trim()) {
      return (
        <span class="flex h-full w-full items-center justify-center">
          <DefaultGroupCoverIcon group={props.group} class="h-8 w-8" />
        </span>
      );
    }
    if (preview.type === 'invalid' || (preview.url && imageFailed())) {
      return (
        <span class="flex h-full w-full items-center justify-center">
          {props.compact ? (
            <BookCoverPlaceholderIcon class="h-4 w-4" size={16} />
          ) : (
            <BookCoverPlaceholderIcon />
          )}
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
          draggable={false}
          onError={() => props.onCoverError(props.group.groupId)}
        />
      );
    }
    return (
      <span class="flex h-full w-full items-center justify-center">
        {props.compact ? (
          <BookCoverPlaceholderIcon class="h-4 w-4" size={16} />
        ) : (
          <BookCoverPlaceholderIcon />
        )}
      </span>
    );
  };

  return (
    <Show
      when={canPreview()}
      fallback={
        <div
          class={coverClass()}
          role="presentation"
          onClick={(e) => e.stopPropagation()}
          {...coverDragBlockProps()}
        >
          {coverContent()}
        </div>
      }
    >
      <div
        class={cn(coverClass(), 'cursor-pointer')}
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

function GroupListView(props: {
  variant: GroupListVariant;
  groups: BookGroup[];
  orderGroups: BookGroup[];
  actions: GroupContextMenuActions;
  titleDisplay: BookTitleDisplay;
  coverImageErrorIds: Set<number>;
  setCoverImageErrorIds: (fn: (prev: Set<number>) => Set<number>) => void;
  getGroupBookCount: (group: BookGroup) => number;
  getGroupDisplayName: (group: BookGroup) => string;
  onGroupClick: (group: BookGroup) => void;
  setContainerRef: (el: HTMLDivElement) => void;
  coverClickPreview?: boolean;
  onCoverPreview?: (group: BookGroup) => void;
}) {
  const compact = () => props.variant.startsWith('compact');
  const buttonClass = () =>
    compact()
      ? bookGroupCompactButtonClass()
      : bookGroupListButtonClass(props.variant === 'list' ? 'p-2' : 'p-4');

  return (
    <BookshelfLayoutGrid
      ref={props.setContainerRef}
      class={getViewModeContainerGridClass(props.variant)}
    >
      <For each={props.groups}>
        {(group) => (
          <BookGroupCardWithMenu
            group={group}
            orderGroups={props.orderGroups}
            actions={props.actions}
            class={buttonClass()}
            onClick={() => props.onGroupClick(group)}
          >
            <Show
              when={compact()}
              fallback={
                <>
                  <GroupListCover
                    group={group}
                    compact={false}
                    coverImageErrorIds={props.coverImageErrorIds}
                    onCoverError={(groupId) =>
                      props.setCoverImageErrorIds((prev) => new Set(prev).add(groupId))
                    }
                    coverClickPreview={props.coverClickPreview}
                    onCoverPreview={() => props.onCoverPreview?.(group)}
                  />
                  <div class={bookshelfListMainClass()}>
                    <h3 class={bookGroupRowTitleClass(false)}>
                      {props.getGroupDisplayName(group)}
                    </h3>
                    <p class={bookGroupRowSubtitleClass(false)}>
                      {props.getGroupBookCount(group)} 本书
                    </p>
                  </div>
                </>
              }
            >
              {/* 对齐书架紧凑列表结构：外层卡片仅负责固定行高/内边距，内部行负责布局与 gap */}
              <div class={bookshelfCompactRowClass(props.variant, false, 'w-full')}>
                <GroupListCover
                  group={group}
                  compact
                  coverImageErrorIds={props.coverImageErrorIds}
                  onCoverError={(groupId) =>
                    props.setCoverImageErrorIds((prev) => new Set(prev).add(groupId))
                  }
                  coverClickPreview={props.coverClickPreview}
                  onCoverPreview={() => props.onCoverPreview?.(group)}
                />
                <div class={bookshelfCompactMainClass()}>
                  <h3 class={bookGroupRowTitleClass(true)}>
                    {props.getGroupDisplayName(group)}
                  </h3>
                  <p class={bookGroupRowSubtitleClass(true)}>
                    {props.getGroupBookCount(group)} 本书
                  </p>
                </div>
              </div>
            </Show>
          </BookGroupCardWithMenu>
        )}
      </For>
    </BookshelfLayoutGrid>
  );
}

const GROUP_LIST_VARIANTS: GroupListVariant[] = [
  'list',
  'list-2',
  'list-3',
  'compact',
  'compact-2',
  'compact-3',
];

function BookGroupCardWithMenu(props: {
  group: BookGroup;
  orderGroups: BookGroup[];
  actions: GroupContextMenuActions;
  class: string;
  onClick: () => void;
  children: JSX.Element;
}) {
  const shouldSuppressClickAfterDrag = useSuppressClickAfterDrag();

  return (
    <GroupContextMenu
      group={props.group}
      orderGroups={props.orderGroups}
      actions={props.actions}
      triggerAs="button"
      withLongPress
      class={props.class}
      onClick={(e: MouseEvent) => {
        if (shouldSuppressClickAfterDrag()) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        e.stopPropagation();
        props.onClick();
      }}
    >
      {props.children}
    </GroupContextMenu>
  );
}

export interface MediaGroupPageProps {
  /** 父级已加载的分组（有则直接使用，不重复请求，与书源页一致） */
  initialGroups?: BookGroup[];
  /** 仅统计/展示指定媒体种类的书籍数量 */
  mediaKindFilter?: MediaKind;
  /** 工具栏分组搜索关键词（固定常规，仅过滤分组名） */
  searchQuery?: string;
  /** 点击分组时回调（用于常规模式下切换到该分组书籍页） */
  onGroupSelect?: (group: BookGroup) => void;
  /** 分组加载完成后回调（供导航栏下拉/标签使用） */
  onGroupsLoaded?: (groups: BookGroup[]) => void;
  /** 主壳滚动容器（网格虚拟列表挂载外部滚动） */
  scrollElement?: Accessor<HTMLDivElement | null | undefined>;
}

export function MediaGroupPage(props: MediaGroupPageProps = {}) {
  const shelfNav = useShelfNavigation();
  const [groups, setGroups] = createSignal<BookGroup[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [coverImageErrorIds, setCoverImageErrorIds] = createSignal<Set<number>>(new Set());
  const [allGroupsOrder, setAllGroupsOrder] = createSignal<BookGroup[]>([]);
  const [formDialogOpen, setFormDialogOpen] = createSignal(false);
  const [formDialogGroup, setFormDialogGroup] = createSignal<BookGroup | null>(null);

  const getGroupDisplayName = (group: BookGroup) =>
    resolveGroupDisplayName(group, props.mediaKindFilter);

  // 使用 skeleton 加载状态管理，避免快速加载时的闪烁
  const showSkeleton = useSkeletonLoading(loading, { delay: 100, minDisplayTime: 300 });

  const filteredGroups = createMemo(() =>
    filterBookGroups(groups(), props.searchQuery ?? '', getGroupDisplayName),
  );
  const hasSearchQuery = () => (props.searchQuery ?? '').trim().length > 0;

  let listRef: HTMLDivElement | null = null;
  let list2Ref: HTMLDivElement | null = null;
  let list3Ref: HTMLDivElement | null = null;
  let compactRef: HTMLDivElement | null = null;
  let compact2Ref: HTMLDivElement | null = null;
  let compact3Ref: HTMLDivElement | null = null;
  let sortableInstance: Sortable | null = null;

  createEffect(() => {
    const manual = sortMode() === 'manual' && bookshelfLayoutStore.settings.enableDragSort;
    const view = viewMode();
    if (hasSearchQuery() || isGridViewMode(view)) {
      if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
      }
      return;
    }
    const listVisible = !loading() && !showSkeleton() && groups().length > 0;
    const sortRefs: GroupListSortRefs = {
      list: listRef,
      list2: list2Ref,
      list3: list3Ref,
      compact: compactRef,
      compact2: compact2Ref,
      compact3: compact3Ref,
      grid: null,
    };
    const container = getGroupListSortableContainer(view, sortRefs);

    if (!manual || !listVisible || !container || groups().length === 0) {
      if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
      }
      return;
    }
    if (sortableInstance && sortableInstance.el === container) return;
    if (sortableInstance) {
      sortableInstance.destroy();
      sortableInstance = null;
    }
    sortableInstance = Sortable.create(
      container,
      withLongPressSortableOptions({
        animation: 150,
        ghostClass: 'opacity-50',
        onEnd: (evt) => {
          const { oldIndex, newIndex } = evt;
          if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;
          const list = [...groups()];
          const [removed] = list.splice(oldIndex, 1);
          list.splice(newIndex, 0, removed);
          const newGroups = list.map((g, i) => ({ ...g, order: i }));
          groupsDb.updateGroupsOrder(newGroups.map((g) => ({ groupId: g.groupId, order: g.order })));
          props.onGroupsLoaded?.(newGroups);
          // 不 setGroups，避免 Solid 在 Sortable 已移动的 DOM 上重算导致 insertBefore 报错；下次进入会从 DB 加载新顺序
        },
      })
    );
    onCleanup(() => {
      if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
      }
    });
  });

  // 获取视图模式（从布局设置 Store）
  const viewMode = () => bookshelfLayoutStore.settings.viewMode;

  // 获取书名/分组名显示方式（从布局设置 Store）
  const titleDisplay = () => bookshelfLayoutStore.settings.bookTitleDisplay;
  // 排序模式：仅当为手动排序时启用分组拖拽
  const sortMode = () => bookshelfLayoutStore.settings.sortMode;
  const coverClickPreview = () =>
    isListViewMode(viewMode()) && bookshelfLayoutStore.settings.coverClickPreview;
  const [coverPreviewGroup, setCoverPreviewGroup] = createSignal<BookGroup | null>(null);

  const groupSortableEnabled = createMemo(
    () =>
      sortMode() === 'manual' &&
      bookshelfLayoutStore.settings.enableDragSort &&
      !hasSearchQuery() &&
      isGridViewMode(viewMode()) &&
      !loading() &&
      !showSkeleton() &&
      filteredGroups().length > 0,
  );

  const groupSortable = createMemo(() => ({
    enabled: groupSortableEnabled,
    ids: () => filteredGroups().map((g) => g.groupId),
    onReorder: async (ids: Id[]) => {
      const map = new Map(filteredGroups().map((g) => [g.groupId, g]));
      const reordered = ids
        .map((id) => map.get(Number(id)))
        .filter((g): g is BookGroup => !!g);
      if (reordered.length !== filteredGroups().length) return;
      const nextVisible = reordered.map((g, i) => ({ ...g, order: i }));
      await groupsDb.updateGroupsOrder(
        nextVisible.map((g) => ({ groupId: g.groupId, order: g.order })),
      );
      const visibleIds = new Set(nextVisible.map((g) => g.groupId));
      const rest = groups().filter((g) => !visibleIds.has(g.groupId));
      const merged = [...nextVisible, ...rest].sort((a, b) => a.order - b.order);
      setGroups(merged.filter((g) => g.show));
      props.onGroupsLoaded?.(merged.filter((g) => g.show));
    },
    persistOnly: true,
  }));

  const useParentGroups = () => props.initialGroups !== undefined;

  /** 父级传入分组时同步（避免子组件抢跑 loadGroups 失败后残留错误提示） */
  createEffect(() => {
    const initial = props.initialGroups;
    if (!initial?.length) return;
    setGroups([...initial]);
    void groupsDb.getAllGroups().then((all) => {
      setAllGroupsOrder([...all].sort((a, b) => a.order - b.order));
    });
  });

  // 与书源页一致：有父级数据则交给父级加载，无父级时自行 loadGroups
  onMount(async () => {
    const onBookshelfRefresh = () => void reloadAllGroupBookCounts();
    const offRefresh = onMediaRefresh(onBookshelfRefresh);

    await initBookshelfLayoutSettings();
    if (!useParentGroups()) {
      await loadGroups();
    } else if (props.initialGroups?.length) {
      setGroups([...props.initialGroups]);
      void groupsDb.getAllGroups().then((all) => {
        setAllGroupsOrder([...all].sort((a, b) => a.order - b.order));
      });
    }
    onCleanup(offRefresh);
  });

  /**
   * 加载分组数据
   * 与 legado / 分组管理页一致：从数据库 getAllGroups() 获取全部分组，按 order 排序，再过滤 show=true
   */
  async function loadGroups() {
    setLoading(true);

    try {
      const allGroups = await groupsDb.getAllGroups();
      const sortedGroups = [...allGroups].sort((a, b) => a.order - b.order);
      setAllGroupsOrder(sortedGroups);
      const visibleGroups = [...(await getShelfGroups())]
        .filter((g) => g.show)
        .sort((a, b) => a.order - b.order);
      setGroups(visibleGroups);
      props.onGroupsLoaded?.(visibleGroups);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '加载分组失败';
      notifyPageError('加载分组失败', errorMsg);
      console.error('加载分组失败:', e);
    } finally {
      setLoading(false);
    }
  }

  /**
   * 处理分组点击：更新当前分组并通知父组件（常规模式下会切换到该分组书籍页）
   */
  function handleGroupClick(group: BookGroup) {
    shelfNav.setCurrentGroup(group.groupId);
    shelfNav.setCurrentGroupName(getGroupDisplayName(group));
    shelfNav.setShowGroupList(false);
    props.onGroupSelect?.(group);
  }

  function handleEdit(group: BookGroup) {
    blurActiveElement();
    setFormDialogGroup(group);
    setFormDialogOpen(true);
  }

  async function applyOrderUpdate(updated: BookGroup[] | null) {
    if (!updated) return;
    try {
      await applyGroupsOrder(updated);
      setAllGroupsOrder(updated);
      const visible = updated.filter((g) => g.show);
      setGroups(visible);
      props.onGroupsLoaded?.(visible);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '更新顺序失败';
      notifyPageError('更新顺序失败', errorMsg);
      console.error('更新分组顺序失败:', e);
      await loadGroups();
    }
  }

  async function handlePinTop(group: BookGroup) {
    await applyOrderUpdate(pinGroupToTop(allGroupsOrder(), group.groupId));
  }

  async function handlePinBottom(group: BookGroup) {
    await applyOrderUpdate(pinGroupToBottom(allGroupsOrder(), group.groupId));
  }

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

  const groupContextMenuActions: GroupContextMenuActions = {
    onEdit: handleEdit,
    onDelete: handleDelete,
    onPinTop: handlePinTop,
    onPinBottom: handlePinBottom,
  };

  const [groupBookCounts, setGroupBookCounts] = createSignal<Map<number, number>>(new Map());

  /** 重新统计各分组书籍数（导入/删书后由 bookshelf-refresh 触发） */
  async function reloadAllGroupBookCounts() {
    const list = groups();
    if (!list.length) return;
    const entries = await Promise.all(
      list.map(async (g) => {
        try {
          const kind = props.mediaKindFilter;
          const n = kind
            ? (await getBooksByGroupAndKind(g.groupId, kind)).length
            : (await getBooksByGroup(g.groupId)).length;
          return [g.groupId, n] as const;
        } catch {
          return [g.groupId, 0] as const;
        }
      }),
    );
    setGroupBookCounts(new Map(entries));
  }

  function getGroupBookCount(group: BookGroup): number {
    return groupBookCounts().get(group.groupId) ?? 0;
  }

  createEffect(() => {
    const list = groups();
    if (!list.length) return;
    void reloadAllGroupBookCounts();
  });

  return (
    <div class="w-full space-y-6">
      {/* 加载状态 - skeleton（根据布局模式） */}
      <Show when={showSkeleton()}>
        {/* 列表视图 skeleton */}
        <Show when={viewMode() === 'list'}>
          <BookshelfLayoutGrid class="grid-cols-1">
            <For each={[1, 2, 3, 4, 5, 6]}>
              {() => (
                <div class="flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4">
                  <div class="h-20 aspect-3/4 shrink-0 rounded-lg bg-muted/60 animate-pulse" />
                  <div class="min-w-0 flex-1 space-y-2">
                    <div class="h-4 w-2/3 rounded bg-muted/60 animate-pulse" />
                    <div class="h-3 w-1/3 rounded bg-muted/60 animate-pulse" />
                    <div class="space-y-1">
                      <div class="h-3 w-full rounded bg-muted/60 animate-pulse" />
                      <div class="h-3 w-5/6 rounded bg-muted/60 animate-pulse" />
                      <div class="h-3 w-4/5 rounded bg-muted/60 animate-pulse" />
                      <div class="h-3 w-3/4 rounded bg-muted/60 animate-pulse" />
                    </div>
                  </div>
                </div>
              )}
            </For>
          </BookshelfLayoutGrid>
        </Show>
        {/* 列表二列 skeleton */}
        <Show when={viewMode() === 'list-2'}>
          <BookshelfLayoutGrid class={getViewModeContainerGridClass('list-2')}>
            <For each={[1, 2, 3, 4, 5, 6]}>
              {() => (
                <div class="flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4">
                  <div class="h-20 aspect-3/4 shrink-0 rounded-lg bg-muted/60 animate-pulse" />
                  <div class="min-w-0 flex-1 space-y-2">
                    <div class="h-4 w-2/3 rounded bg-muted/60 animate-pulse" />
                    <div class="h-3 w-1/3 rounded bg-muted/60 animate-pulse" />
                    <div class="space-y-1">
                      <div class="h-3 w-full rounded bg-muted/60 animate-pulse" />
                      <div class="h-3 w-5/6 rounded bg-muted/60 animate-pulse" />
                      <div class="h-3 w-4/5 rounded bg-muted/60 animate-pulse" />
                      <div class="h-3 w-3/4 rounded bg-muted/60 animate-pulse" />
                    </div>
                  </div>
                </div>
              )}
            </For>
          </BookshelfLayoutGrid>
        </Show>
        {/* 列表三列 skeleton */}
        <Show when={viewMode() === 'list-3'}>
          <BookshelfLayoutGrid class={getViewModeContainerGridClass('list-3')}>
            <For each={[1, 2, 3, 4, 5, 6]}>
              {() => (
                <div class="flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4">
                  <div class="h-20 aspect-3/4 shrink-0 rounded-lg bg-muted/60 animate-pulse" />
                  <div class="min-w-0 flex-1 space-y-2">
                    <div class="h-4 w-2/3 rounded bg-muted/60 animate-pulse" />
                    <div class="h-3 w-1/3 rounded bg-muted/60 animate-pulse" />
                    <div class="space-y-1">
                      <div class="h-3 w-full rounded bg-muted/60 animate-pulse" />
                      <div class="h-3 w-5/6 rounded bg-muted/60 animate-pulse" />
                      <div class="h-3 w-4/5 rounded bg-muted/60 animate-pulse" />
                      <div class="h-3 w-3/4 rounded bg-muted/60 animate-pulse" />
                    </div>
                  </div>
                </div>
              )}
            </For>
          </BookshelfLayoutGrid>
        </Show>
        {/* 紧凑列表 skeleton */}
        <Show when={viewMode() === 'compact'}>
          <BookshelfLayoutGrid class="grid-cols-1">
            <For each={[1, 2, 3, 4, 5, 6, 7, 8]}>
              {() => (
                <div class="flex items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2">
                  <div class="h-14 aspect-3/4 shrink-0 rounded-md bg-muted/60 animate-pulse" />
                  <div class="min-w-0 flex-1 space-y-1.5">
                    <div class="h-3.5 w-1/2 rounded bg-muted/60 animate-pulse" />
                    <div class="h-2.5 w-1/4 rounded bg-muted/60 animate-pulse" />
                    <div class="space-y-1">
                      <div class="h-2.5 w-full rounded bg-muted/60 animate-pulse" />
                      <div class="h-2.5 w-4/5 rounded bg-muted/60 animate-pulse" />
                    </div>
                  </div>
                </div>
              )}
            </For>
          </BookshelfLayoutGrid>
        </Show>
        {/* 紧凑列表二列 skeleton */}
        <Show when={viewMode() === 'compact-2'}>
          <BookshelfLayoutGrid class={getViewModeContainerGridClass('compact-2')}>
            <For each={[1, 2, 3, 4, 5, 6, 7, 8]}>
              {() => (
                <div class="flex items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2">
                  <div class="h-14 aspect-3/4 shrink-0 rounded-md bg-muted/60 animate-pulse" />
                  <div class="min-w-0 flex-1 space-y-1.5">
                    <div class="h-3.5 w-1/2 rounded bg-muted/60 animate-pulse" />
                    <div class="h-2.5 w-1/4 rounded bg-muted/60 animate-pulse" />
                    <div class="space-y-1">
                      <div class="h-2.5 w-full rounded bg-muted/60 animate-pulse" />
                      <div class="h-2.5 w-4/5 rounded bg-muted/60 animate-pulse" />
                    </div>
                  </div>
                </div>
              )}
            </For>
          </BookshelfLayoutGrid>
        </Show>
        {/* 紧凑列表三列 skeleton */}
        <Show when={viewMode() === 'compact-3'}>
          <BookshelfLayoutGrid class={getViewModeContainerGridClass('compact-3')}>
            <For each={[1, 2, 3, 4, 5, 6, 7, 8]}>
              {() => (
                <div class="flex items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2">
                  <div class="h-14 aspect-3/4 shrink-0 rounded-md bg-muted/60 animate-pulse" />
                  <div class="min-w-0 flex-1 space-y-1.5">
                    <div class="h-3.5 w-1/2 rounded bg-muted/60 animate-pulse" />
                    <div class="h-2.5 w-1/4 rounded bg-muted/60 animate-pulse" />
                    <div class="space-y-1">
                      <div class="h-2.5 w-full rounded bg-muted/60 animate-pulse" />
                      <div class="h-2.5 w-4/5 rounded bg-muted/60 animate-pulse" />
                    </div>
                  </div>
                </div>
              )}
            </For>
          </BookshelfLayoutGrid>
        </Show>
        {/* 网格视图 skeleton */}
        <Show when={isGridViewMode(viewMode())}>
          <BookshelfLayoutGrid class={getViewModeContainerGridClass(viewMode())}>
            <For each={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}>
              {() => (
                <div class="flex flex-col items-center gap-3 rounded-xl border border-border/50 bg-card p-4">
                  <div class="w-full aspect-3/4 rounded-lg bg-muted/60 animate-pulse" />
                  <div class="w-full space-y-2">
                    <div class="h-4 w-full rounded bg-muted/60 animate-pulse" />
                    <div class="h-3 w-2/3 mx-auto rounded bg-muted/60 animate-pulse" />
                  </div>
                </div>
              )}
            </For>
          </BookshelfLayoutGrid>
        </Show>
      </Show>

      {/* 分组列表 */}
      <Show when={!loading() && !showSkeleton() && groups().length > 0}>
        <Show
          when={filteredGroups().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-12">
              <SearchIcon class="mb-4 h-12 w-12 text-muted-foreground" size={48} />
              <h3 class="mb-2 text-lg font-semibold text-foreground">无匹配分组</h3>
              <p class="text-sm text-muted-foreground">请尝试其他关键词</p>
            </div>
          }
        >
          <For each={GROUP_LIST_VARIANTS}>
            {(variant) => (
              <Show when={viewMode() === variant}>
                <GroupListView
                  variant={variant}
                  groups={filteredGroups()}
                  orderGroups={allGroupsOrder()}
                  actions={groupContextMenuActions}
                  titleDisplay={titleDisplay()}
                  coverImageErrorIds={coverImageErrorIds()}
                  setCoverImageErrorIds={setCoverImageErrorIds}
                  getGroupBookCount={getGroupBookCount}
                  getGroupDisplayName={getGroupDisplayName}
                  onGroupClick={handleGroupClick}
                  coverClickPreview={coverClickPreview()}
                  onCoverPreview={setCoverPreviewGroup}
                  setContainerRef={(el) => {
                    if (variant === 'list') listRef = el;
                    else if (variant === 'list-2') list2Ref = el;
                    else if (variant === 'list-3') list3Ref = el;
                    else if (variant === 'compact') compactRef = el;
                    else if (variant === 'compact-2') compact2Ref = el;
                    else if (variant === 'compact-3') compact3Ref = el;
                  }}
                />
              </Show>
            )}
          </For>

          {/* 网格视图（行级虚拟列表） */}
          <Show when={isGridViewMode(viewMode())}>
            <VirtualBookshelfGroupGrid
              groups={filteredGroups()}
              viewMode={viewMode()}
              titleDisplay={titleDisplay()}
              getGroupBookCount={getGroupBookCount}
              getGroupDisplayName={getGroupDisplayName}
              sortable={groupSortable()}
              externalScrollElement={props.scrollElement}
            >
              {(group) => (
                <BookGroupCardWithMenu
                  group={group}
                  orderGroups={allGroupsOrder()}
                  actions={groupContextMenuActions}
                  class={bookGroupGridButtonClass()}
                  onClick={() => handleGroupClick(group)}
                >
                  <BookshelfGridHideTooltip
                    enabled={titleDisplay() === 'hide'}
                    title={getGroupDisplayName(group)}
                    subtitle={`${getGroupBookCount(group)} 本书`}
                  >
                    <div
                      class={bookGroupGridCoverClass(
                        'bg-linear-to-br from-muted to-accent/30 text-4xl',
                      )}
                    >
                      <div class={bookGroupGridCoverZoomClass()}>
                        {(() => {
                          const info = getCoverPreviewInfo(group.cover);
                          const imageFailed = coverImageErrorIds().has(group.groupId);
                          if (!group.cover?.trim()) {
                            return (
                              <span class="flex h-full w-full items-center justify-center">
                                <DefaultGroupCoverIcon group={group} class="h-8 w-8" />
                              </span>
                            );
                          }
                          if (info.type === 'invalid' || (info.url && imageFailed)) {
                            return (
                              <span class="flex h-full w-full items-center justify-center">
                                <BookCoverPlaceholderIcon class="h-8 w-8" size={32} />
                              </span>
                            );
                          }
                          if (info.type === 'emoji' && group.cover) {
                            return (
                              <span class="flex h-full w-full items-center justify-center">
                                {group.cover.trim()}
                              </span>
                            );
                          }
                          if (info.url && !imageFailed) {
                            return (
                              <img
                                src={info.url}
                                alt=""
                                class="h-full w-full object-cover"
                                draggable={false}
                                onError={() =>
                                  setCoverImageErrorIds((prev) =>
                                    new Set(prev).add(group.groupId),
                                  )
                                }
                              />
                            );
                          }
                          return (
                            <span class="flex h-full w-full items-center justify-center">
                              <BookCoverPlaceholderIcon class="h-8 w-8" size={32} />
                            </span>
                          );
                        })()}
                        <Show when={titleDisplay() === 'overlay'}>
                          <BookshelfCoverTitleOverlay title={getGroupDisplayName(group)} />
                        </Show>
                      </div>
                    </div>

                    <Show when={titleDisplay() === 'show'}>
                      <div class={bookGroupGridMetaClass()}>
                        <h3 class={bookGroupGridTitleClass()}>{getGroupDisplayName(group)}</h3>
                        <p class={bookGroupGridSubtitleClass()}>
                          {getGroupBookCount(group)} 本书
                        </p>
                      </div>
                    </Show>
                  </BookshelfGridHideTooltip>
                </BookGroupCardWithMenu>
              )}
            </VirtualBookshelfGroupGrid>
          </Show>
        </Show>
      </Show>

      {/* 空状态 */}
      <Show when={!loading() && !showSkeleton() && groups().length === 0}>
        <div class="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card py-12">
          <BookshelfIcon class="mb-4 h-12 w-12 text-muted-foreground" size={48} />

          <h3 class="mb-2 text-lg font-semibold text-foreground">
            暂无分组
          </h3>
          <p class="text-sm text-muted-foreground">
            创建你的第一个分组来组织书籍
          </p>
        </div>
      </Show>

      <BookGroupFormDialog
        open={formDialogOpen()}
        onOpenChange={setFormDialogOpen}
        mode="edit"
        initialGroup={formDialogGroup()}
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
  );
}
