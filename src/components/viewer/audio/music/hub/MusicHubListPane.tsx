/**
 * 列表分区：桌面左右分栏 / 移动全宽曲目 + Drawer 歌单
 * 页头：播放全部 / 新建列表 / 更多（更新管理·导入·导出·去重）
 */

import {
  createEffect,
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
import { FolderPlusIcon, MoreIcon, PlayIcon } from '@/components/shared/icons';
import { viewerStore } from '@/stores/viewer';
import { getTracksForGroupId } from '@/lib/database/audio-library';
import {
  playPlaylist,
  restoreActiveMusicPlaylistSelection,
} from '@/stores/viewer/media/audio';
import { showAppToast } from '@/components/shared/AppToasts';
import { dedupePlaylistTracks } from '@/lib/media/audio/list/playlist-share';
import { MusicHubPageShell } from '@/components/viewer/audio/music/hub/MusicHubPageShell';
import { musicHubPageContentInsetClass } from '@/lib/media/audio/music-hub-section-meta';
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

function MusicListMoreMenu(props: {
  dragSortEnabled: boolean;
  onDragSortChange: (checked: boolean) => void;
  onOpenUpdate: () => void;
  onOpenImport: () => void;
  onOpenExport: () => void;
  onDeduplicate: () => void;
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
          拖拽排序
        </AppDropdownMenuCheckboxItem>
        <AppDropdownMenuItem onSelect={props.onOpenUpdate}>列表更新管理</AppDropdownMenuItem>
        <AppDropdownMenuItem onSelect={props.onOpenImport}>导入</AppDropdownMenuItem>
        <AppDropdownMenuItem onSelect={props.onOpenExport}>导出</AppDropdownMenuItem>
        <AppDropdownMenuItem onSelect={props.onDeduplicate}>去重</AppDropdownMenuItem>
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
  const [updateOpen, setUpdateOpen] = createSignal(false);
  const [importOpen, setImportOpen] = createSignal(false);
  const [exportOpen, setExportOpen] = createSignal(false);
  const [listsRevision, setListsRevision] = createSignal(0);
  const [tracksRevision, setTracksRevision] = createSignal(0);

  onMount(() => {
    const unsubscribe = subscribeMusicSettings((settings) => {
      setDragSortEnabled(settings.musicListDragSortEnabled !== false);
    });
    onCleanup(unsubscribe);
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

  const playAll = () => {
    const list = tracks() ?? [];
    if (list.length === 0) {
      showAppToast({ title: '当前列表暂无曲目', variant: 'warning' });
      return;
    }
    void playPlaylist(list, 0, { origin: 'list' });
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
