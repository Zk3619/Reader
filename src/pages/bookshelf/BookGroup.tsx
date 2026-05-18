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

import { createSignal, For, Show, onMount, createEffect, onCleanup } from 'solid-js';
import Sortable from 'sortablejs';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { bookshelfStore } from '@/stores/bookshelf';
import { bookshelfLayoutStore, initBookshelfLayoutSettings } from '@/stores/bookshelf-layout';
import * as groupsDb from '@/lib/database/book-groups';
import { getBooksByGroup } from '@/lib/database/books';
import { BookGroupId } from '@/types';
import type { BookGroup } from '@/types';
import { cn } from '@/lib/utils';
import { withLongPressSortableOptions } from '@/utils/sortable-long-press';
import { getCoverPreviewInfo } from '@/utils/book-group-cover';
import {
  DefaultGroupCoverIcon,
  BookCoverPlaceholderIcon,
} from '@/components/book-group-cover-icon';
import { BookshelfIcon } from '@/components/icons';

// 视图模式从布局设置 Store 获取，不再使用本地状态

/**
 * 分组显示逻辑与 legado 一致：从数据库 getAllGroups() 获取全部分组（含系统分组），
 * 再按 show 过滤。不再使用硬编码 defaultGroups + getUserGroups()，避免数据库中
 * 的系统分组（如网络未分组、本地未分组、更新失败）不显示。
 */

/**
 * 获取分组显示名称
 * 与 BookGroupManage 一致，覆盖全部系统分组 ID
 */
function getGroupDisplayName(group: BookGroup): string {
  switch (group.groupId) {
    case BookGroupId.All:
    case BookGroupId.Local:
    case BookGroupId.Audio:
    case BookGroupId.NetNone:
    case BookGroupId.LocalNone:
    case BookGroupId.Error:
      return group.groupName;
    default:
      return group.groupName;
  }
}

export interface BookGroupProps {
  /** 父级已加载的分组（有则直接使用，不重复请求，与书源页一致） */
  initialGroups?: BookGroup[];
  /** 点击分组时回调（用于常规模式下切换到该分组书籍页） */
  onGroupSelect?: (group: BookGroup) => void;
  /** 分组加载完成后回调（供导航栏下拉/标签使用） */
  onGroupsLoaded?: (groups: BookGroup[]) => void;
}

export function BookGroup(props: BookGroupProps = {}) {
  const [groups, setGroups] = createSignal<BookGroup[]>([]);
  const [loading, setLoading] = createSignal(false);
  /** 是否已完成至少一次加载，用于避免统计从 0 闪到正常值（与书源页描述一致） */
  const [hasLoaded, setHasLoaded] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [coverImageErrorIds, setCoverImageErrorIds] = createSignal<Set<number>>(new Set());
  
  // 使用 skeleton 加载状态管理，避免快速加载时的闪烁
  const showSkeleton = useSkeletonLoading(loading, { delay: 100, minDisplayTime: 300 });

  let listRef: HTMLDivElement | null = null;
  let list2Ref: HTMLDivElement | null = null;
  let compactRef: HTMLDivElement | null = null;
  let compact2Ref: HTMLDivElement | null = null;
  let gridRef: HTMLDivElement | null = null;
  let sortableInstance: Sortable | null = null;

  createEffect(() => {
    const manual = sortMode() === 'manual';
    const view = viewMode();
    const listVisible = !loading() && !showSkeleton() && groups().length > 0;
    const container =
      view === 'list' ? listRef
      : view === 'list-2' ? list2Ref
      : view === 'compact' ? compactRef
      : view === 'compact-2' ? compact2Ref
      : gridRef;

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

  // 与书源页一致：有父级数据则直接用，不重复请求
  onMount(async () => {
    await initBookshelfLayoutSettings();
    const initial = props.initialGroups;
    if (initial?.length) {
      setGroups([...initial]);
      setHasLoaded(true);
    } else {
      loadGroups();
    }
  });

  /**
   * 加载分组数据
   * 与 legado / 分组管理页一致：从数据库 getAllGroups() 获取全部分组，按 order 排序，再过滤 show=true
   */
  async function loadGroups() {
    setLoading(true);
    setError(null);

    try {
      const allGroups = await groupsDb.getAllGroups();
      const sortedGroups = [...allGroups].sort((a, b) => a.order - b.order);
      const visibleGroups = sortedGroups.filter(g => g.show);
      setGroups(visibleGroups);
      props.onGroupsLoaded?.(visibleGroups);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : '加载分组失败';
      setError(errorMsg);
      console.error('加载分组失败:', e);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }

  /**
   * 处理分组点击：更新当前分组并通知父组件（常规模式下会切换到该分组书籍页）
   */
  function handleGroupClick(group: BookGroup) {
    bookshelfStore.setCurrentGroup(group.groupId);
    bookshelfStore.setCurrentGroupName(getGroupDisplayName(group));
    bookshelfStore.setShowGroupList(false);
    props.onGroupSelect?.(group);
  }

  // 缓存分组书籍数量（避免重复查询）
  const [groupBookCounts, setGroupBookCounts] = createSignal<Map<number, number>>(new Map());

  /**
   * 获取分组中的书籍数量（带缓存）
   */
  async function loadGroupBookCount(group: BookGroup): Promise<void> {
    if (groupBookCounts().has(group.groupId)) return;
    try {
      const books = await getBooksByGroup(group.groupId);
      setGroupBookCounts((prev) => new Map(prev).set(group.groupId, books.length));
    } catch {
      setGroupBookCounts((prev) => new Map(prev).set(group.groupId, 0));
    }
  }

  /**
   * 获取分组书籍数量（从缓存）
   */
  function getGroupBookCount(group: BookGroup): number {
    loadGroupBookCount(group); // 触发加载（如果未缓存）
    return groupBookCounts().get(group.groupId) ?? 0;
  }

  return (
    <div class="w-full space-y-6">
      {/* 错误提示 */}
      <Show when={error()}>
        <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error()}
        </div>
      </Show>

      {/* 加载状态 - skeleton（根据布局模式） */}
      <Show when={showSkeleton()}>
        {/* 列表视图 skeleton */}
        <Show when={viewMode() === 'list'}>
          <div class="grid grid-cols-1 gap-3">
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
          </div>
        </Show>
        {/* 列表二列 skeleton */}
        <Show when={viewMode() === 'list-2'}>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
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
          </div>
        </Show>
        {/* 紧凑列表 skeleton */}
        <Show when={viewMode() === 'compact'}>
          <div class="grid grid-cols-1 gap-2">
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
          </div>
        </Show>
        {/* 紧凑列表二列 skeleton */}
        <Show when={viewMode() === 'compact-2'}>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
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
          </div>
        </Show>
        {/* 网格视图 skeleton */}
        <Show when={viewMode().startsWith('grid-')}>
          <div
            class={cn(
              'grid',
              viewMode() === 'grid-2' && 'grid-cols-2',
              viewMode() === 'grid-3' && 'grid-cols-3',
              viewMode() === 'grid-4' && 'grid-cols-4',
              viewMode() === 'grid-5' && 'grid-cols-5',
              viewMode() === 'grid-6' && 'grid-cols-6'
            )}
            style={{
              gap: `${bookshelfLayoutStore.settings.spacing * 0.25}rem`,
            }}
          >
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
          </div>
        </Show>
      </Show>

      {/* 分组列表 */}
      <Show when={!loading() && !showSkeleton() && groups().length > 0}>
        {/* 列表视图（常规列表） */}
        <Show when={viewMode() === 'list'}>
          <div ref={(el) => { listRef = el; }} class="grid grid-cols-1 gap-3">
            <For each={groups()}>
              {(group) => (
                <button
                  onClick={() => handleGroupClick(group)}
                  class={cn(
                    'group relative flex items-center gap-4 rounded-xl border p-4 transition-all duration-200',
                    'hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5',
                    'active:scale-[0.98]',
                  )}
                >
                  {/* 分组封面 */}
                  <div
                    class={cn(
                      'flex h-20 aspect-3/4 shrink-0 items-center justify-center overflow-hidden rounded-lg text-2xl transition-transform duration-200',
                      'group-hover:scale-110',
                      'bg-muted/50'
                    )}
                  >
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
                            <BookCoverPlaceholderIcon />
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
                            draggable={false}
                            onError={() => setCoverImageErrorIds((prev) => new Set(prev).add(group.groupId))}
                          />
                        );
                      }
                      return (
                        <span class="flex h-full w-full items-center justify-center">
                          <BookCoverPlaceholderIcon />
                        </span>
                      );
                    })()}
                  </div>

                  {/* 分组信息 */}
                  <Show when={titleDisplay() !== 'hide'}>
                    <div class="flex-1 min-w-0 text-left">
                      <h3 class="mb-1 font-semibold text-foreground truncate">
                        {getGroupDisplayName(group)}
                      </h3>
                      <p class="text-sm text-muted-foreground">
                        {getGroupBookCount(group)} 本书
                      </p>
                    </div>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Show>

        {/* 列表视图（列表二列） */}
        <Show when={viewMode() === 'list-2'}>
          <div ref={(el) => { list2Ref = el; }} class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <For each={groups()}>
              {(group) => (
                <button
                  onClick={() => handleGroupClick(group)}
                  class={cn(
                    'group relative flex items-center gap-4 rounded-xl border p-4 transition-all duration-200',
                    'hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5',
                    'active:scale-[0.98]',
                  )}
                >
                  {/* 分组封面 */}
                  <div
                    class={cn(
                      'flex h-20 aspect-3/4 shrink-0 items-center justify-center overflow-hidden rounded-lg text-2xl transition-transform duration-200',
                      'group-hover:scale-110',
                      'bg-muted/50'
                    )}
                  >
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
                            <BookCoverPlaceholderIcon />
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
                            draggable={false}
                            onError={() => setCoverImageErrorIds((prev) => new Set(prev).add(group.groupId))}
                          />
                        );
                      }
                      return (
                        <span class="flex h-full w-full items-center justify-center">
                          <BookCoverPlaceholderIcon />
                        </span>
                      );
                    })()}
                  </div>

                  {/* 分组信息 */}
                  <Show when={titleDisplay() !== 'hide'}>
                    <div class="flex-1 min-w-0 text-left">
                      <h3 class="mb-1 font-semibold text-foreground truncate">
                        {getGroupDisplayName(group)}
                      </h3>
                      <p class="text-sm text-muted-foreground">
                        {getGroupBookCount(group)} 本书
                      </p>
                    </div>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Show>

        {/* 列表视图（紧凑列表） */}
        <Show when={viewMode() === 'compact'}>
          <div ref={(el) => { compactRef = el; }} class="grid grid-cols-1 gap-2">
            <For each={groups()}>
              {(group) => (
                <button
                  onClick={() => handleGroupClick(group)}
                  class={cn(
                    'group flex items-center gap-3 rounded-lg border px-3 py-2 transition-all duration-200',
                    'hover:border-primary/50 hover:bg-accent/50',
                    'active:scale-[0.98]',
                  )}
                >
                  {/* 分组封面（小） */}
                  <div
                    class={cn(
                      'flex h-14 aspect-3/4 shrink-0 items-center justify-center overflow-hidden rounded-md text-lg transition-transform duration-200',
                      'group-hover:scale-110',
                      'bg-muted/50'
                    )}
                  >
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
                            draggable={false}
                            onError={() => setCoverImageErrorIds((prev) => new Set(prev).add(group.groupId))}
                          />
                        );
                      }
                      return (
                        <span class="flex h-full w-full items-center justify-center">
                          <BookCoverPlaceholderIcon class="h-4 w-4" size={16} />
                        </span>
                      );
                    })()}
                  </div>

                  {/* 分组信息 */}
                  <Show when={titleDisplay() !== 'hide'}>
                    <div class="flex-1 min-w-0 text-left">
                      <h3 class="font-semibold text-foreground truncate mb-0.5">
                        {getGroupDisplayName(group)}
                      </h3>
                      <p class="text-xs text-muted-foreground">
                        {getGroupBookCount(group)} 本书
                      </p>
                    </div>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Show>

        {/* 列表视图（紧凑列表二列） */}
        <Show when={viewMode() === 'compact-2'}>
          <div ref={(el) => { compact2Ref = el; }} class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <For each={groups()}>
              {(group) => (
                <button
                  onClick={() => handleGroupClick(group)}
                  class={cn(
                    'group flex items-center gap-3 rounded-lg border px-3 py-2 transition-all duration-200',
                    'hover:border-primary/50 hover:bg-accent/50',
                    'active:scale-[0.98]',
                  )}
                >
                  {/* 分组封面（小） */}
                  <div
                    class={cn(
                      'flex h-14 aspect-3/4 shrink-0 items-center justify-center overflow-hidden rounded-md text-lg transition-transform duration-200',
                      'group-hover:scale-110',
                      'bg-muted/50'
                    )}
                  >
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
                            draggable={false}
                            onError={() => setCoverImageErrorIds((prev) => new Set(prev).add(group.groupId))}
                          />
                        );
                      }
                      return (
                        <span class="flex h-full w-full items-center justify-center">
                          <BookCoverPlaceholderIcon class="h-4 w-4" size={16} />
                        </span>
                      );
                    })()}
                  </div>

                  {/* 分组信息 */}
                  <Show when={titleDisplay() !== 'hide'}>
                    <div class="flex-1 min-w-0 text-left">
                      <h3 class="font-semibold text-foreground truncate mb-0.5">
                        {getGroupDisplayName(group)}
                      </h3>
                      <p class="text-xs text-muted-foreground">
                        {getGroupBookCount(group)} 本书
                      </p>
                    </div>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Show>

        {/* 网格视图 */}
        <Show when={viewMode().startsWith('grid-')}>
          <div
            ref={(el) => { gridRef = el; }}
            class={cn(
              'grid',
              // 根据布局设置动态设置列数
              viewMode() === 'grid-2' && 'grid-cols-2',
              viewMode() === 'grid-3' && 'grid-cols-3',
              viewMode() === 'grid-4' && 'grid-cols-4',
              viewMode() === 'grid-5' && 'grid-cols-5',
              viewMode() === 'grid-6' && 'grid-cols-6'
            )}
            style={{
              gap: `${bookshelfLayoutStore.settings.spacing * 0.25}rem`,
            }}
          >
            <For each={groups()}>
              {(group) => (
                <button
                  onClick={() => handleGroupClick(group)}
                  class={cn(
                    'group/card relative flex flex-col items-center gap-3 rounded-xl border border-border/50 bg-card p-4 transition-all duration-200',
                    'hover:border-primary/30 hover:shadow-md',
                    'active:scale-[0.98]'
                  )}
                >
                  {/* 分组封面 */}
                  <div
                    class={cn(
                      'flex w-full aspect-3/4 shrink-0 items-center justify-center overflow-hidden rounded-lg text-4xl transition-transform duration-200',
                      'group-hover/card:scale-[1.02]',
                      'bg-linear-to-br from-muted to-accent/30',
                      titleDisplay() === 'overlay' && 'relative'
                    )}
                  >
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
                        return <span class="flex h-full w-full items-center justify-center">{group.cover.trim()}</span>;
                      }
                      if (info.url && !imageFailed) {
                        return (
                          <img
                            src={info.url}
                            alt=""
                            class="h-full w-full object-cover"
                            draggable={false}
                            onError={() => setCoverImageErrorIds((prev) => new Set(prev).add(group.groupId))}
                          />
                        );
                      }
                      return (
                        <span class="flex h-full w-full items-center justify-center">
                          <BookCoverPlaceholderIcon class="h-8 w-8" size={32} />
                        </span>
                      );
                    })()}
                    {/* 叠加模式：在封面上显示分组名 */}
                    <Show when={titleDisplay() === 'overlay'}>
                      <div class="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg backdrop-blur-sm">
                        <h3 class="px-2 py-1 text-xs font-semibold text-white truncate max-w-full">
                          {getGroupDisplayName(group)}
                        </h3>
                      </div>
                    </Show>
                  </div>

                  {/* 分组名称（显示模式） */}
                  <Show when={titleDisplay() === 'show'}>
                    <h3 class="w-full truncate text-center text-sm font-semibold text-foreground">
                      {getGroupDisplayName(group)}
                    </h3>
                  </Show>

                  {/* 书籍数量（显示模式） */}
                  <Show when={titleDisplay() === 'show'}>
                    <p class="text-xs text-muted-foreground">
                      {getGroupBookCount(group)} 本书
                    </p>
                  </Show>
                </button>
              )}
            </For>
          </div>
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
    </div>
  );
}
