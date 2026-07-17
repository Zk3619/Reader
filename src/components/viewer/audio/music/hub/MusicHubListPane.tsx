/**
 * 列表分区：桌面左右分栏 / 移动全宽曲目 + Drawer 歌单
 * 页头：播放全部 / 新建列表 / 更多（更新管理·导入·导出·去重·保存列表）
 */

import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
  Show,
  type Component,
} from 'solid-js';
import { Menu } from 'lucide-solid';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { MusicPlaylistSidebar } from '@/components/viewer/audio/music/hub/MusicPlaylistSidebar';
import { MusicTrackList } from '@/components/viewer/audio/music/hub/MusicTrackList';
import { MusicListCreateDialog } from '@/components/viewer/audio/music/hub/MusicListCreateDialog';
import { MusicListSaveDialog } from '@/components/viewer/audio/music/hub/MusicListSaveDialog';
import { MusicListUpdateManageDialog } from '@/components/viewer/audio/music/hub/MusicListUpdateManageDialog';
import { MusicListImportDialog } from '@/components/viewer/audio/music/hub/MusicListImportDialog';
import { MusicListExportDialog } from '@/components/viewer/audio/music/hub/MusicListExportDialog';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuCheckboxItem,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  DeduplicateIcon,
  ExportIcon,
  FolderPlusIcon,
  GripVerticalIcon,
  ImportIcon,
  ListRefreshIcon,
  MoreIcon,
  PlayIcon,
  SaveIcon,
} from '@/components/shared/icons';
import { viewerStore } from '@/stores/viewer';
import {
  getTracksForGroupId,
  MUSIC_PLAYLISTS_CHANGED_EVENT,
} from '@/lib/database/audio-library';
import { getGroupById } from '@/lib/database/media-groups';
import {
  playByListId,
  playPlaylist,
  restoreActiveMusicPlaylistSelection,
} from '@/stores/viewer/media/audio';
import { showAppToast } from '@/components/shared/AppToasts';
import { dedupePlaylistTracks } from '@/lib/media/audio/list/playlist-share';
import { MusicHubPageShell } from '@/components/viewer/audio/music/hub/MusicHubPageShell';
import { musicHubPageContentInsetClass } from '@/lib/media/audio/music-hub-section-meta';
import { BUILTIN_PLAYLIST_IDS } from '@/lib/media/audio/track-types';
import { MediaGroupId } from '@/types/book-group';
import { cn } from '@/lib/utils';
import {
  getMusicSettings,
  setMusicSettings,
  subscribeMusicSettings,
} from '@/lib/media/audio/music-settings';

export interface MusicHubListPaneProps {
  drawerOpen?: boolean;
  onDrawerOpen?: () => void;
  onScanLocal?: () => void;
  /** 本地扫描完成后递增，用于刷新曲目 */
  scanRevision?: number;
}

const SAVEABLE_LIST_IDS = new Set<string>([
  BUILTIN_PLAYLIST_IDS.DEFAULT,
  BUILTIN_PLAYLIST_IDS.TRIAL,
  BUILTIN_PLAYLIST_IDS.RECENT,
]);

function MusicListMoreMenu(props: {
  dragSortEnabled: boolean;
  onDragSortChange: (checked: boolean) => void;
  onOpenUpdate: () => void;
  onOpenImport: () => void;
  onOpenExport: () => void;
  onDeduplicate: () => void;
  canSaveList: boolean;
  onSaveList: () => void;
}) {
  const [open, setOpen] = createSignal(false);
  return (
    <AppDropdownMenu open={open()} onOpenChange={setOpen}>
      <AppTooltip>
        <AppTooltipTrigger as="div">
          <AppDropdownMenuTrigger
            as={(triggerProps: Record<string, unknown>) => (
              <AppDropdownMenuIconTrigger triggerProps={triggerProps}>
                <MoreIcon class="h-4 w-4" />
                <span class="sr-only">更多</span>
              </AppDropdownMenuIconTrigger>
            )}
          />
        </AppTooltipTrigger>
        <AppTooltipContent>更多</AppTooltipContent>
      </AppTooltip>
      <AppDropdownMenuContent layout="compact">
        <AppDropdownMenuCheckboxItem
          closeOnSelect={false}
          checked={props.dragSortEnabled}
          onChange={props.onDragSortChange}
        >
          <span class="flex items-center gap-2">
            <GripVerticalIcon class="h-4 w-4" />
            <span>拖拽排序</span>
          </span>
        </AppDropdownMenuCheckboxItem>
        <AppDropdownMenuItem onSelect={props.onOpenUpdate}>
          <ListRefreshIcon class="h-4 w-4" />
          <span>列表更新管理</span>
        </AppDropdownMenuItem>
        <AppDropdownMenuItem onSelect={props.onOpenImport}>
          <ImportIcon class="h-4 w-4" />
          <span>导入</span>
        </AppDropdownMenuItem>
        <AppDropdownMenuItem onSelect={props.onOpenExport}>
          <ExportIcon class="h-4 w-4" />
          <span>导出</span>
        </AppDropdownMenuItem>
        <AppDropdownMenuItem onSelect={props.onDeduplicate}>
          <DeduplicateIcon class="h-4 w-4" />
          <span>去重</span>
        </AppDropdownMenuItem>
        <Show when={props.canSaveList}>
          <AppDropdownMenuItem onSelect={props.onSaveList}>
            <SaveIcon class="h-4 w-4" />
            <span>保存列表</span>
          </AppDropdownMenuItem>
        </Show>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

export const MusicHubListPane: Component<MusicHubListPaneProps> = (props) => {
  const shell = useShellLayout();
  const isMobileLayout = () => shell().useMobileShell;
  const [dragSortEnabled, setDragSortEnabled] = createSignal(
    getMusicSettings().musicListDragSortEnabled !== false,
  );
  const [createOpen, setCreateOpen] = createSignal(false);
  const [saveOpen, setSaveOpen] = createSignal(false);
  const [updateOpen, setUpdateOpen] = createSignal(false);
  const [importOpen, setImportOpen] = createSignal(false);
  const [exportOpen, setExportOpen] = createSignal(false);
  const [listsRevision, setListsRevision] = createSignal(0);
  const [tracksRevision, setTracksRevision] = createSignal(0);

  onMount(() => {
    const unsubscribe = subscribeMusicSettings((settings) => {
      setDragSortEnabled(settings.musicListDragSortEnabled !== false);
    });
    const handlePlaylistsChanged = () => {
      setListsRevision((v) => v + 1);
      setTracksRevision((v) => v + 1);
    };
    window.addEventListener(MUSIC_PLAYLISTS_CHANGED_EVENT, handlePlaylistsChanged);
    onCleanup(() => {
      unsubscribe();
      window.removeEventListener(MUSIC_PLAYLISTS_CHANGED_EVENT, handlePlaylistsChanged);
    });
  });

  const bumpLists = () => setListsRevision((v) => v + 1);
  const bumpTracks = () => setTracksRevision((v) => v + 1);

  createEffect(() => {
    if (viewerStore.state.musicSection !== 'list') return;
    void restoreActiveMusicPlaylistSelection();
  });

  const groupId = () => viewerStore.state.activeMusicGroupId ?? MediaGroupId.MusicLocal;
  const contentRev = () => tracksRevision() + (props.scanRevision ?? 0);
  const [tracks] = createResource(
    () => ({ id: groupId(), rev: contentRev() }),
    (key) => getTracksForGroupId(key.id),
  );
  const [activeGroup] = createResource(
    () => ({ id: groupId(), rev: listsRevision() }),
    (key) => getGroupById(key.id),
  );

  const activeListId = createMemo(() => {
    if (groupId() === MediaGroupId.Favorite) return BUILTIN_PLAYLIST_IDS.LOVE;
    return activeGroup()?.listId ?? viewerStore.state.activePlaylistId ?? null;
  });

  const canSaveList = createMemo(() => {
    const listId = activeListId();
    return !!listId && SAVEABLE_LIST_IDS.has(listId);
  });

  const saveSuggestedName = createMemo(() => {
    const listId = activeListId();
    if (listId === BUILTIN_PLAYLIST_IDS.DEFAULT) return '播放列表副本';
    if (listId === BUILTIN_PLAYLIST_IDS.TRIAL) return '试听列表副本';
    if (listId === BUILTIN_PLAYLIST_IDS.RECENT) return '最近播放副本';
    return activeGroup()?.groupName ? `${activeGroup()!.groupName}副本` : '新列表';
  });

  const playAll = () => {
    const list = tracks() ?? [];
    if (list.length === 0) {
      showAppToast({ title: '当前列表暂无曲目', variant: 'warning' });
      return;
    }
    const listId = activeListId();
    if (listId) {
      void playByListId(listId, 0, {
        listName: activeGroup()?.groupName,
        listKind: listId.startsWith('pl_') ? 'user' : 'builtin',
      });
      return;
    }
    void playPlaylist(list, 0, {
      origin: 'list',
      listName: activeGroup()?.groupName ?? '我的列表',
      listKind: 'temporary',
    });
  };

  const dedupPlaylist = async () => {
    const listId = viewerStore.state.activePlaylistId;
    if (!listId?.startsWith('pl_')) {
      showAppToast({ title: '请选择用户歌单', variant: 'warning' });
      return;
    }
    const count = await dedupePlaylistTracks(listId);
    showAppToast({ title: `去重后 ${count} 首`, variant: 'success' });
    bumpTracks();
  };

  return (
    <>
      <MusicHubPageShell
        section="list"
        toolbar={
          <>
            <Show when={isMobileLayout()}>
              <Button size="sm" variant="outline" onClick={props.onDrawerOpen}>
                <Menu class="mr-1 h-4 w-4" />
                歌单
              </Button>
            </Show>

            <AppTooltip>
              <AppTooltipTrigger
                as={Button}
                size="icon"
                variant="ghost"
                class="h-9 w-9 shrink-0"
                disabled={(tracks() ?? []).length === 0}
                onClick={playAll}
                aria-label="播放全部"
              >
                <PlayIcon class="h-4 w-4" />
                <span class="sr-only">播放全部</span>
              </AppTooltipTrigger>
              <AppTooltipContent>播放全部</AppTooltipContent>
            </AppTooltip>

            <AppTooltip>
              <AppTooltipTrigger
                as={Button}
                size="icon"
                variant="ghost"
                class="h-9 w-9 shrink-0"
                onClick={() => setCreateOpen(true)}
                aria-label="新建列表"
              >
                <FolderPlusIcon class="h-4 w-4" />
                <span class="sr-only">新建列表</span>
              </AppTooltipTrigger>
              <AppTooltipContent>新建列表</AppTooltipContent>
            </AppTooltip>

            <MusicListMoreMenu
              dragSortEnabled={dragSortEnabled()}
              onDragSortChange={(checked) => {
                setDragSortEnabled(checked);
                setMusicSettings({ musicListDragSortEnabled: checked });
              }}
              onOpenUpdate={() => setUpdateOpen(true)}
              onOpenImport={() => setImportOpen(true)}
              onOpenExport={() => setExportOpen(true)}
              onDeduplicate={() => void dedupPlaylist()}
              canSaveList={canSaveList()}
              onSaveList={() => setSaveOpen(true)}
            />
          </>
        }
        scrollClass="overflow-hidden"
      >
        <div class={cn('flex min-h-0 flex-1 overflow-hidden', musicHubPageContentInsetClass)}>
          <Show when={!isMobileLayout()}>
            <MusicPlaylistSidebar
              listsRevision={listsRevision()}
              onListsChanged={bumpLists}
            />
          </Show>
          <div class="flex min-h-0 min-w-0 flex-1 flex-col">
            <MusicTrackList
              reorderEnabled={dragSortEnabled()}
              tracksRevision={contentRev()}
              onListsChanged={bumpLists}
            />
          </div>
          <Show when={isMobileLayout() && props.drawerOpen}>
            <div class="fixed inset-0 z-30 flex">
              <div
                class="absolute inset-0 bg-black/40"
                onClick={props.onDrawerOpen}
                role="presentation"
              />
              <MusicPlaylistSidebar
                class="relative z-10 h-full w-56 bg-background shadow-lg"
                listsRevision={listsRevision()}
                onListsChanged={bumpLists}
              />
            </div>
          </Show>
        </div>
      </MusicHubPageShell>

      <MusicListCreateDialog
        open={createOpen()}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          bumpLists();
          bumpTracks();
        }}
      />
      <MusicListSaveDialog
        open={saveOpen()}
        onOpenChange={setSaveOpen}
        sourceGroupId={canSaveList() ? groupId() : null}
        suggestedName={saveSuggestedName()}
        onSaved={() => {
          bumpLists();
          bumpTracks();
        }}
      />
      <MusicListUpdateManageDialog
        open={updateOpen()}
        onOpenChange={setUpdateOpen}
        onUpdated={bumpTracks}
      />
      <MusicListImportDialog
        open={importOpen()}
        onOpenChange={setImportOpen}
        onImported={() => {
          bumpLists();
          bumpTracks();
        }}
        onScanLocal={props.onScanLocal}
      />
      <MusicListExportDialog open={exportOpen()} onOpenChange={setExportOpen} />
    </>
  );
};
