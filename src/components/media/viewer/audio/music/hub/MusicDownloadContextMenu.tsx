import { Show, createSignal, type Component, type JSX } from 'solid-js';
import {
  AppContextMenu,
  AppContextMenuItem,
  AppContextMenuSeparator,
  AppContextMenuTrigger,
} from '@/components/shared/AppContextMenu';
import { Button } from '@/components/ui/button';
import { MoreIcon } from '@/components/shared/icons';
import {
  ViewerAppContextMenuContent,
  VIEWER_OVERLAY_Z,
} from '@/components/media/viewer/viewer-app-overlay';
import { DeleteDownloadTaskDialog } from '@/components/media/viewer/audio/music/hub/DeleteDownloadTaskDialog';
import {
  type AudioDownloadTask,
  deleteDownloadTask,
  openDownloadTaskFolder,
  pauseDownloadTask,
  playDownloadTask,
  resumeDownloadTask,
  retryDownloadTask,
} from '@/lib/media/audio/audio-download';
import { isTauri } from '@/lib/platform/detect';
import { cn } from '@/lib/utils';
import { showAppToast } from '@/components/shared/AppToasts';

export interface MusicDownloadContextMenuProps {
  task: AudioDownloadTask;
  onChanged?: () => void;
  showActionButton?: boolean;
  class?: string;
  children: JSX.Element;
}

export const MusicDownloadContextMenu: Component<MusicDownloadContextMenuProps> = (props) => {
  let triggerEl: HTMLDivElement | undefined;
  const [deleteOpen, setDeleteOpen] = createSignal(false);

  const refresh = () => props.onChanged?.();

  const openFromActionButton = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const rect =
      event.currentTarget instanceof HTMLElement
        ? event.currentTarget.getBoundingClientRect()
        : triggerEl?.getBoundingClientRect();
    triggerEl?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect?.left ?? 0,
        clientY: rect?.bottom ?? 0,
      }),
    );
  };

  const handleRemoveConfirm = async (deleteFile: boolean) => {
    try {
      await deleteDownloadTask(props.task.id, { deleteFile });
      showAppToast({
        title: '已移除',
        description: deleteFile ? '已删除本地下载文件' : '已从下载列表移除',
        variant: 'success',
      });
      refresh();
    } catch (err) {
      showAppToast({
        title: '移除失败',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <AppContextMenu>
        <AppContextMenuTrigger
          as="div"
          ref={(element: HTMLDivElement) => {
            triggerEl = element;
          }}
          class={cn('relative h-full w-full min-w-0', props.class)}
        >
          {props.children}
          <Show when={props.showActionButton}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="absolute right-1 top-1/2 z-2 h-10 w-10 -translate-y-1/2 text-muted-foreground"
              aria-label={`更多操作 ${props.task.trackName}`}
              onClick={openFromActionButton}
            >
              <MoreIcon class="h-4 w-4" />
            </Button>
          </Show>
        </AppContextMenuTrigger>
        <ViewerAppContextMenuContent layout="compact" portalZClass={VIEWER_OVERLAY_Z.popper}>
          <Show when={props.task.status === 'completed'}>
            <AppContextMenuItem
              onSelect={() =>
                void playDownloadTask(props.task).catch((err) =>
                  console.warn('[download] play failed', err),
                )
              }
            >
              播放
            </AppContextMenuItem>
          </Show>
          <Show when={props.task.status === 'run' || props.task.status === 'waiting'}>
            <AppContextMenuItem
              onSelect={() => void pauseDownloadTask(props.task.id).then(refresh)}
            >
              暂停
            </AppContextMenuItem>
          </Show>
          <Show when={props.task.status === 'pause'}>
            <AppContextMenuItem
              onSelect={() => void resumeDownloadTask(props.task.id).then(refresh)}
            >
              继续
            </AppContextMenuItem>
          </Show>
          <Show when={props.task.status === 'error'}>
            <AppContextMenuItem
              onSelect={() => void retryDownloadTask(props.task.id).then(refresh)}
            >
              重试
            </AppContextMenuItem>
          </Show>
          <Show when={isTauri() && props.task.status !== 'error'}>
            <AppContextMenuItem
              onSelect={() =>
                void openDownloadTaskFolder(props.task).catch((err) =>
                  console.warn('[download] open folder failed', err),
                )
              }
            >
              打开文件夹
            </AppContextMenuItem>
          </Show>
          <AppContextMenuSeparator />
          <AppContextMenuItem
            class="text-destructive focus:text-destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            移除
          </AppContextMenuItem>
        </ViewerAppContextMenuContent>
      </AppContextMenu>

      <DeleteDownloadTaskDialog
        open={deleteOpen()}
        onOpenChange={setDeleteOpen}
        task={props.task}
        onConfirm={(deleteFile) => void handleRemoveConfirm(deleteFile)}
      />
    </>
  );
};
