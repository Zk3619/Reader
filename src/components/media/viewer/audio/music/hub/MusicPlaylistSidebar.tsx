/**
 * 列表左栏：歌单分组（media_groups）+ 用户列表拖拽排序
 * 行高 / 内边距 / 行距对齐排行榜左栏榜单列表
 * 自定义列表操作对齐 lx-music 右键菜单（重命名 / 排序 / 重复 / 本地 / 更新 / 详情 / 导入导出 / 移除）
 */

import {
  closestCenter,
  createSortable,
  DragDropProvider,
  DragDropSensors,
  SortableProvider,
  useDragDropContext,
  useSortableContext,
  type DragEventHandler,
  type Id,
} from '@thisbeyond/solid-dnd';
import {
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Component,
  type JSX,
} from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  deletePlaylist,
  MUSIC_PLAYLISTS_CHANGED_EVENT,
  renamePlaylist,
  type MusicPlaylistsChangedDetail,
} from '@/lib/database/audio-library';
import { getGroupById, getMusicGroups, updateGroupsOrder } from '@/lib/database/media-groups';
import { viewerStore } from '@/stores/viewer';
import { setActiveMusicGroupId } from '@/stores/viewer/media/audio';
import { MediaGroupId } from '@/types/book-group';
import type { BookGroup } from '@/types';
import { cn } from '@/lib/utils';
import { shouldShowBlockingLoading } from '@/lib/media/audio/music-loading-ui';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { MusicSidebarListSkeleton } from '@/components/media/viewer/audio/music/hub/MusicHubSkeletons';
import {
  AppTextField,
  AppTextFieldInput,
  AppTextFieldLabel,
} from '@/components/shared/AppTextField';
import {
  AppContextMenu,
  AppContextMenuItem,
  AppContextMenuSeparator,
  AppContextMenuTrigger,
} from '@/components/shared/AppContextMenu';
import {
  ViewerAppContextMenuContent,
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
  VIEWER_OVERLAY_Z,
} from '@/components/media/viewer/viewer-app-overlay';
import { showAppToast } from '@/components/shared/AppToasts';
import { ChevronRight } from 'lucide-solid';
import { settingsStore } from '@/stores/settings';
import { MusicListSortDialog } from '@/components/media/viewer/audio/music/hub/MusicListSortDialog';
import { MusicListDuplicateDialog } from '@/components/media/viewer/audio/music/hub/MusicListDuplicateDialog';
import {
  getSourceBinding,
  syncSourceList,
} from '@/lib/media/audio/list/sync-source-list';
import {
  getPlatformSyncedListDetailUrl,
  parsePlatformSyncedListId,
  refreshPlatformSyncedList,
} from '@/lib/media/audio/platform/playlist-sync';
import { openUrlInBrowser } from '@/lib/platform/open-url';
import { pickFiles } from '@/lib/platform/fs/pick-file';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { formatStorageRef } from '@/lib/platform/fs/storage-ref';
import { importLocalFilesToLibrary } from '@/lib/media/audio/library/playlist-store';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import type { HubBrowseSource } from '@/lib/media/audio/music-sdk/types';

export interface MusicPlaylistSidebarProps {
  active?: boolean;
  class?: string;
  /** 外部变更时递增以刷新 */
  listsRevision?: number;
  onListsChanged?: () => void;
  onTracksChanged?: () => void;
  onOpenImport?: () => void;
  onOpenExport?: () => void;
}

type SidebarGroup = BookGroup & { sortable: boolean };

/** 与排行榜左栏榜单项一致（勿用 Button：其 gap-2 会拉开指示器与文字） */
function sidebarItemClass(active: boolean) {
  return cn(
    'flex h-9 w-full min-w-0 items-center rounded-md px-2.5 text-left text-[13px] font-normal',
    'transition-[color,background-color] duration-300 ease-out',
    active
      ? 'bg-primary/10 font-medium text-primary'
      : 'text-foreground hover:bg-primary/10',
  );
}

function playlistIdForGroup(group: BookGroup): string | null {
  if (group.groupId === MediaGroupId.Favorite) return 'love';
  if (group.listId) return group.listId;
  switch (group.groupId) {
    case MediaGroupId.MusicDefault:
      return 'default';
    case MediaGroupId.MusicTrial:
      return 'trial';
    case MediaGroupId.MusicRecent:
      return 'recent';
    case MediaGroupId.MusicLocal:
      return 'local';
    default:
      return null;
  }
}

function isUserListId(listId: string | null | undefined): listId is string {
  return !!listId?.startsWith('pl_');
}

function buildBoundListDetailUrl(
  source: HubBrowseSource,
  sourceId: string,
  type: 'songlist' | 'leaderboard',
): string | null {
  if (type === 'leaderboard') return null;
  switch (source) {
    case 'wy':
      return `https://music.163.com/#/playlist?id=${encodeURIComponent(sourceId)}`;
    case 'kw':
      return `https://www.kuwo.cn/playlist_detail/${encodeURIComponent(sourceId)}`;
    case 'kg':
      return `https://www.kugou.com/yy/special/single/${encodeURIComponent(sourceId)}.html`;
    case 'tx':
      return `https://y.qq.com/n/ryqq/playlist/${encodeURIComponent(sourceId)}`;
    case 'mg':
      return `https://music.migu.cn/v3/music/playlist/${encodeURIComponent(sourceId)}`;
    default:
      return null;
  }
}

async function loadSidebarGroups(): Promise<SidebarGroup[]> {
  const [favorite, music] = await Promise.all([
    getGroupById(MediaGroupId.Favorite),
    getMusicGroups(),
  ]);
  const users = music
    .filter((g) => g.listId?.startsWith('pl_'))
    .sort((a, b) => a.order - b.order || a.groupId - b.groupId);
  const builtins = new Map(
    music
      .filter((g) => g.listId && !g.listId.startsWith('pl_'))
      .map((g) => [g.listId!, g]),
  );
  const pinned: SidebarGroup[] = [
    builtins.get('default')
      ? { ...builtins.get('default')!, groupName: '播放列表', sortable: false }
      : null,
    builtins.get('trial')
      ? { ...builtins.get('trial')!, groupName: '试听列表', sortable: false }
      : null,
    builtins.get('recent')
      ? { ...builtins.get('recent')!, groupName: '最近播放', sortable: false }
      : null,
    builtins.get('local')
      ? { ...builtins.get('local')!, groupName: '本地音乐', sortable: false }
      : null,
    favorite ? { ...favorite, groupName: '我的收藏', sortable: false } : null,
  ].filter((group): group is SidebarGroup => group != null);
  return [...pinned, ...users.map((g) => ({ ...g, sortable: true }))];
}

function PlaylistActiveIndicator(props: { active: boolean }) {
  const reduceMotion = () => settingsStore.state.app.reduceMotion;
  return (
    <span
      class={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden',
        reduceMotion() ? '' : 'transition-[width,opacity] duration-130 ease-out',
        props.active ? 'mr-0.5 w-[0.9em] opacity-100' : 'w-0 opacity-0',
      )}
      aria-hidden={!props.active}
    >
      <ChevronRight class="h-[0.9em] w-[0.9em] shrink-0" />
    </span>
  );
}

function ReorderBridge(props: { onReorder: (ids: Id[]) => void | Promise<void> }) {
  const sortable = useSortableContext();
  const dnd = useDragDropContext();
  if (!sortable || !dnd) return null;
  const [state] = sortable;
  const [, { onDragEnd }] = dnd;
  const handleEnd: DragEventHandler = () => {
    const sorted = [...state.sortedIds];
    const initial = state.initialIds;
    const changed =
      sorted.length !== initial.length || sorted.some((id, i) => id !== initial[i]);
    if (changed) void props.onReorder(sorted);
  };
  onDragEnd(handleEnd);
  return null;
}

type ListMenuActions = {
  onRename: (group: SidebarGroup) => void;
  onSort: (group: SidebarGroup) => void;
  onDuplicate: (group: SidebarGroup) => void;
  onAddLocal: (group: SidebarGroup) => void;
  onUpdate: (group: SidebarGroup) => void;
  onSourceDetail: (group: SidebarGroup) => void;
  onImport: (group: SidebarGroup) => void;
  onExport: (group: SidebarGroup) => void;
  onRemove: (group: SidebarGroup) => void;
};

function ListItemContextMenu(props: {
  group: SidebarGroup;
  children: JSX.Element;
  actions: ListMenuActions;
}) {
  const listId = () => playlistIdForGroup(props.group);
  const canRenameRemove = () => isUserListId(listId());
  const binding = () => {
    const id = listId();
    return id ? getSourceBinding(id) : undefined;
  };
  const platformSync = () => {
    const id = listId();
    return id ? parsePlatformSyncedListId(id) : null;
  };
  const canUpdate = () => Boolean(binding()) || Boolean(platformSync());
  const canSourceDetail = () => {
    const id = listId();
    if (!id) return false;
    if (getPlatformSyncedListDetailUrl(id)) return true;
    const b = binding();
    if (!b) return false;
    return Boolean(buildBoundListDetailUrl(b.source, b.sourceId, b.type));
  };

  return (
    <AppContextMenu>
      <AppContextMenuTrigger as="div" class="w-full min-w-0">
        {props.children}
      </AppContextMenuTrigger>
      <ViewerAppContextMenuContent layout="compact" portalZClass={VIEWER_OVERLAY_Z.popper}>
        <AppContextMenuItem
          disabled={!canRenameRemove()}
          onSelect={() => props.actions.onRename(props.group)}
        >
          重命名
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={() => props.actions.onSort(props.group)}>
          排序歌曲
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={() => props.actions.onDuplicate(props.group)}>
          重复歌曲
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={() => props.actions.onAddLocal(props.group)}>
          添加本地歌曲
        </AppContextMenuItem>
        <AppContextMenuSeparator />
        <AppContextMenuItem
          disabled={!canUpdate()}
          onSelect={() => props.actions.onUpdate(props.group)}
        >
          更新
        </AppContextMenuItem>
        <AppContextMenuItem
          disabled={!canSourceDetail()}
          onSelect={() => props.actions.onSourceDetail(props.group)}
        >
          歌单详情页
        </AppContextMenuItem>
        <AppContextMenuSeparator />
        <AppContextMenuItem onSelect={() => props.actions.onImport(props.group)}>
          导入
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={() => props.actions.onExport(props.group)}>
          导出
        </AppContextMenuItem>
        <AppContextMenuItem
          disabled={!canRenameRemove()}
          onSelect={() => props.actions.onRemove(props.group)}
        >
          移除
        </AppContextMenuItem>
      </ViewerAppContextMenuContent>
    </AppContextMenu>
  );
}

function SortableListRow(props: {
  group: SidebarGroup;
  active: boolean;
  onSelect: () => void;
  actions: ListMenuActions;
}) {
  const sortable = createSortable(props.group.groupId);
  const ctx = useDragDropContext();
  const isDragging = () => !!ctx?.[0].active.draggable;

  return (
    <li>
      <ListItemContextMenu group={props.group} actions={props.actions}>
        <div
          ref={sortable}
          class={cn(
            'flex h-9 w-full min-w-0 items-center rounded-md',
            'transition-[color,background-color] duration-300 ease-out',
            sortable.isActiveDraggable && 'z-10 bg-background shadow-sm',
            isDragging() && 'transition-transform duration-200 ease-out',
            props.active
              ? 'bg-primary/10 text-primary'
              : 'text-foreground hover:bg-primary/10',
          )}
        >
          <button
            type="button"
            class="flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center px-0 text-muted-foreground active:cursor-grabbing"
            aria-label="拖拽排序"
            {...sortable.dragActivators}
          >
            ≡
          </button>
          <button
            type="button"
            class={cn(
              'flex h-9 min-w-0 flex-1 items-center rounded-md pr-2.5 text-left text-[13px] font-normal text-inherit',
              props.active && 'font-medium',
            )}
            onClick={() => {
              if (!props.active) props.onSelect();
            }}
          >
            <PlaylistActiveIndicator active={props.active} />
            <span class="min-w-0 flex-1 truncate">{props.group.groupName}</span>
          </button>
        </div>
      </ListItemContextMenu>
    </li>
  );
}

export const MusicPlaylistSidebar: Component<MusicPlaylistSidebarProps> = (props) => {
  const [groups, { refetch }] = createResource(
    () => ({ active: props.active !== false, rev: props.listsRevision ?? 0 }),
    (key) => (key.active ? loadSidebarGroups() : Promise.resolve([])),
  );

  onMount(() => {
    const handlePlaylistsChanged = (event: Event) => {
      const detail =
        ((event as CustomEvent<MusicPlaylistsChangedDetail>).detail ??
          {}) as MusicPlaylistsChangedDetail;
      if (detail.listsChanged === false) return;
      void refetch();
    };
    window.addEventListener(MUSIC_PLAYLISTS_CHANGED_EVENT, handlePlaylistsChanged);
    onCleanup(() =>
      window.removeEventListener(MUSIC_PLAYLISTS_CHANGED_EVENT, handlePlaylistsChanged),
    );
  });

  const [renameOpen, setRenameOpen] = createSignal(false);
  const [renameValue, setRenameValue] = createSignal('');
  const [renameTarget, setRenameTarget] = createSignal<SidebarGroup | null>(null);
  const [removeOpen, setRemoveOpen] = createSignal(false);
  const [removeTarget, setRemoveTarget] = createSignal<SidebarGroup | null>(null);
  const [sortOpen, setSortOpen] = createSignal(false);
  const [sortTarget, setSortTarget] = createSignal<SidebarGroup | null>(null);
  const [dupOpen, setDupOpen] = createSignal(false);
  const [dupTarget, setDupTarget] = createSignal<SidebarGroup | null>(null);
  const [updateConfirmOpen, setUpdateConfirmOpen] = createSignal(false);
  const [updateTarget, setUpdateTarget] = createSignal<SidebarGroup | null>(null);

  const showSidebarSkeleton = useSkeletonLoading(() =>
    shouldShowBlockingLoading(groups.loading, (groups() ?? []).length),
  );

  const activeGroupId = () =>
    viewerStore.state.activeMusicGroupId ?? MediaGroupId.MusicLocal;

  const pinned = createMemo(() => (groups() ?? []).filter((g) => !g.sortable));
  const sortableGroups = createMemo(() => (groups() ?? []).filter((g) => g.sortable));
  const sortableIds = createMemo(() => sortableGroups().map((g) => g.groupId));

  const selectGroup = (group: SidebarGroup) => {
    setActiveMusicGroupId(group.groupId, playlistIdForGroup(group));
  };

  const ensureSelected = (group: SidebarGroup) => {
    if (activeGroupId() !== group.groupId) selectGroup(group);
  };

  const openRename = (group: SidebarGroup) => {
    const listId = playlistIdForGroup(group);
    if (!isUserListId(listId)) return;
    ensureSelected(group);
    setRenameTarget(group);
    setRenameValue(group.groupName);
    setRenameOpen(true);
  };

  const confirmRename = async () => {
    const group = renameTarget();
    const name = renameValue().trim();
    const listId = group ? playlistIdForGroup(group) : null;
    if (!group || !isUserListId(listId) || !name) return;
    await renamePlaylist(listId, name);
    setRenameOpen(false);
    setRenameTarget(null);
    void refetch();
    props.onListsChanged?.();
  };

  const openRemove = (group: SidebarGroup) => {
    const listId = playlistIdForGroup(group);
    if (!isUserListId(listId)) return;
    ensureSelected(group);
    setRemoveTarget(group);
    setRemoveOpen(true);
  };

  const confirmRemove = async () => {
    const group = removeTarget();
    const listId = group ? playlistIdForGroup(group) : null;
    if (!group || !isUserListId(listId)) return;
    await deletePlaylist(listId);
    setRemoveOpen(false);
    setRemoveTarget(null);
    setActiveMusicGroupId(MediaGroupId.MusicLocal, 'local');
    void refetch();
    props.onListsChanged?.();
    showAppToast({ title: '列表已移除', variant: 'success' });
  };

  const openSort = (group: SidebarGroup) => {
    const listId = playlistIdForGroup(group);
    if (!listId) return;
    ensureSelected(group);
    setSortTarget(group);
    setSortOpen(true);
  };

  const openDuplicate = (group: SidebarGroup) => {
    const listId = playlistIdForGroup(group);
    if (!listId) return;
    ensureSelected(group);
    setDupTarget(group);
    setDupOpen(true);
  };

  const addLocalSongs = async (group: SidebarGroup) => {
    const listId = playlistIdForGroup(group);
    if (!listId) return;
    ensureSelected(group);
    try {
      const picked = await pickFiles({
        multiple: true,
        filters: [
          {
            name: 'Media File',
            extensions: ['mp3', 'flac', 'ogg', 'oga', 'wav', 'm4a'],
          },
        ],
      });
      const paths = picked.map((p) => formatStorageRef(p.ref)).filter(Boolean);
      if (paths.length === 0) return;
      const tracks = await importLocalFilesToLibrary(paths, listId);
      showAppToast({
        title: `已添加 ${tracks.length} 首本地歌曲`,
        variant: 'success',
      });
      props.onTracksChanged?.();
    } catch (e) {
      if (isUserCancelled(e)) return;
      showAppToast({
        title: '添加失败',
        description: toUserFacingMusicError(e),
        variant: 'destructive',
      });
    }
  };

  const openUpdate = (group: SidebarGroup) => {
    const listId = playlistIdForGroup(group);
    if (!listId) return;
    if (!getSourceBinding(listId) && !parsePlatformSyncedListId(listId)) return;
    ensureSelected(group);
    setUpdateTarget(group);
    setUpdateConfirmOpen(true);
  };

  const confirmUpdate = async () => {
    const group = updateTarget();
    const listId = group ? playlistIdForGroup(group) : null;
    if (!listId) return;
    setUpdateConfirmOpen(false);
    try {
      const tracks = parsePlatformSyncedListId(listId)
        ? (await refreshPlatformSyncedList(listId)).trackCount
        : (await syncSourceList(listId)).length;
      showAppToast({
        title: `已更新「${group?.groupName ?? ''}」`,
        description: `${tracks} 首`,
        variant: 'success',
      });
      props.onTracksChanged?.();
    } catch (e) {
      showAppToast({
        title: '更新失败',
        description: toUserFacingMusicError(e),
        variant: 'destructive',
      });
    } finally {
      setUpdateTarget(null);
    }
  };

  const openSourceDetail = async (group: SidebarGroup) => {
    const listId = playlistIdForGroup(group);
    if (!listId) return;
    const platformUrl = getPlatformSyncedListDetailUrl(listId);
    if (platformUrl) {
      await openUrlInBrowser(platformUrl);
      return;
    }
    const binding = getSourceBinding(listId);
    if (!binding) return;
    const url = buildBoundListDetailUrl(binding.source, binding.sourceId, binding.type);
    if (!url) {
      showAppToast({ title: '暂无歌单详情页', variant: 'warning' });
      return;
    }
    await openUrlInBrowser(url);
  };

  const openImport = (group: SidebarGroup) => {
    ensureSelected(group);
    props.onOpenImport?.();
  };

  const openExport = (group: SidebarGroup) => {
    ensureSelected(group);
    props.onOpenExport?.();
  };

  const menuActions: ListMenuActions = {
    onRename: openRename,
    onSort: openSort,
    onDuplicate: openDuplicate,
    onAddLocal: (g) => void addLocalSongs(g),
    onUpdate: openUpdate,
    onSourceDetail: (g) => void openSourceDetail(g),
    onImport: openImport,
    onExport: openExport,
    onRemove: openRemove,
  };

  const handleReorder = async (ids: Id[]) => {
    await updateGroupsOrder(ids.map((id, order) => ({ groupId: Number(id), order })));
    void refetch();
    props.onListsChanged?.();
  };

  const dialogListId = (group: SidebarGroup | null) =>
    group ? playlistIdForGroup(group) ?? '' : '';

  return (
    <aside class={cn('flex min-h-0 w-44 shrink-0 flex-col border-r md:w-52', props.class)}>
      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <Show when={showSidebarSkeleton()}>
          <MusicSidebarListSkeleton class="px-0" />
        </Show>
        <Show when={!showSidebarSkeleton()}>
          <ul class="space-y-0.5">
            <For each={pinned()}>
              {(group) => {
                const active = () => activeGroupId() === group.groupId;
                return (
                  <li>
                    <ListItemContextMenu group={group} actions={menuActions}>
                      <button
                        type="button"
                        class={sidebarItemClass(active())}
                        onClick={() => {
                          if (active()) return;
                          selectGroup(group);
                        }}
                      >
                        <PlaylistActiveIndicator active={active()} />
                        <span class="min-w-0 flex-1 truncate">{group.groupName}</span>
                      </button>
                    </ListItemContextMenu>
                  </li>
                );
              }}
            </For>
          </ul>
          <Show when={sortableGroups().length > 0}>
            <DragDropProvider collisionDetector={closestCenter}>
              <DragDropSensors />
              <SortableProvider ids={sortableIds()}>
                <ReorderBridge onReorder={handleReorder} />
                <ul class="mt-1 space-y-0.5 border-t border-border/50 pt-1">
                  <For each={sortableGroups()}>
                    {(group) => (
                      <SortableListRow
                        group={group}
                        active={activeGroupId() === group.groupId}
                        onSelect={() => selectGroup(group)}
                        actions={menuActions}
                      />
                    )}
                  </For>
                </ul>
              </SortableProvider>
            </DragDropProvider>
          </Show>
        </Show>
      </div>

      <ViewerAppDialog open={renameOpen()} onOpenChange={setRenameOpen}>
        <ViewerAppDialogContent layout="app" class="w-[calc(100dvw-2rem)] max-w-sm">
          <ViewerAppDialogHeader>
            <ViewerAppDialogTitle>重命名列表</ViewerAppDialogTitle>
            <ViewerAppDialogDescription>修改用户列表的显示名称</ViewerAppDialogDescription>
          </ViewerAppDialogHeader>
          <div class="px-6 pb-6">
            <AppTextField>
              <AppTextFieldLabel>列表名</AppTextFieldLabel>
              <AppTextFieldInput
                value={renameValue()}
                onInput={(e) => setRenameValue(e.currentTarget.value)}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === 'Enter') void confirmRename();
                }}
              />
            </AppTextField>
          </div>
          <ViewerAppDialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void confirmRename()}>确定</Button>
          </ViewerAppDialogFooter>
        </ViewerAppDialogContent>
      </ViewerAppDialog>

      <ViewerAppDialog open={removeOpen()} onOpenChange={setRemoveOpen}>
        <ViewerAppDialogContent layout="app" class="w-[calc(100dvw-2rem)] max-w-sm">
          <ViewerAppDialogHeader>
            <ViewerAppDialogTitle>移除列表</ViewerAppDialogTitle>
            <ViewerAppDialogDescription>
              你真的想要移除「{removeTarget()?.groupName ?? ''}」吗？
            </ViewerAppDialogDescription>
          </ViewerAppDialogHeader>
          <ViewerAppDialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void confirmRemove()}>
              是的，没错
            </Button>
          </ViewerAppDialogFooter>
        </ViewerAppDialogContent>
      </ViewerAppDialog>

      <ViewerAppDialog open={updateConfirmOpen()} onOpenChange={setUpdateConfirmOpen}>
        <ViewerAppDialogContent layout="app" class="w-[calc(100dvw-2rem)] max-w-sm">
          <ViewerAppDialogHeader>
            <ViewerAppDialogTitle>更新列表</ViewerAppDialogTitle>
            <ViewerAppDialogDescription>
              这将会把「{updateTarget()?.groupName ?? ''}」内的歌曲替换成在线列表的歌曲，你确认要更新吗？
            </ViewerAppDialogDescription>
          </ViewerAppDialogHeader>
          <ViewerAppDialogFooter>
            <Button variant="outline" onClick={() => setUpdateConfirmOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void confirmUpdate()}>是的，没错</Button>
          </ViewerAppDialogFooter>
        </ViewerAppDialogContent>
      </ViewerAppDialog>

      <Show when={sortTarget() && dialogListId(sortTarget())}>
        <MusicListSortDialog
          open={sortOpen()}
          onOpenChange={setSortOpen}
          listId={dialogListId(sortTarget())}
          listName={sortTarget()?.groupName ?? ''}
          onSorted={() => props.onTracksChanged?.()}
        />
      </Show>

      <Show when={dupTarget() && dialogListId(dupTarget())}>
        <MusicListDuplicateDialog
          open={dupOpen()}
          onOpenChange={setDupOpen}
          listId={dialogListId(dupTarget())}
          listName={dupTarget()?.groupName ?? ''}
          onChanged={() => props.onTracksChanged?.()}
        />
      </Show>
    </aside>
  );
};
