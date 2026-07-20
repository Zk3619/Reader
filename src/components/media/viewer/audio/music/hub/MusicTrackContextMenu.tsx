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
import { MusicAddToListDialog } from '@/components/media/viewer/audio/music/hub/MusicAddToListDialog';
import { MusicMovePositionDialog } from '@/components/media/viewer/audio/music/hub/MusicMovePositionDialog';
import { MusicTrackSourceDialog } from '@/components/media/viewer/audio/music/hub/MusicTrackSourceDialog';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import {
  buildTrackSourceDetailUrl,
  copyTrackName,
  dislikeTrack,
  downloadTracks,
  openTrackSourceDetail,
  playTrackAt,
  playTracksLaterFromMenu,
  removeTracksFromList,
  searchSimilarTrack,
} from '@/lib/media/audio/music-context-actions';
import { cn } from '@/lib/utils';

export type MusicTrackContextVariant = 'online' | 'library';

export interface MusicTrackContextMenuProps {
  track: AudioTrack;
  tracks: AudioTrack[];
  selectedTracks?: AudioTrack[];
  index: number;
  variant?: MusicTrackContextVariant;
  playlistId?: string | null;
  origin?: 'search' | 'list';
  onChanged?: () => void;
  showActionButton?: boolean;
  class?: string;
  children: JSX.Element;
}

export const MusicTrackContextMenu: Component<MusicTrackContextMenuProps> = (props) => {
  let triggerEl: HTMLDivElement | undefined;
  const [addDialogOpen, setAddDialogOpen] = createSignal(false);
  const [moveDialogOpen, setMoveDialogOpen] = createSignal(false);
  const [positionDialogOpen, setPositionDialogOpen] = createSignal(false);
  const [sourceDialogOpen, setSourceDialogOpen] = createSignal(false);
  const variant = () => props.variant ?? 'online';
  const playlistId = () => props.playlistId ?? null;
  const actionTracks = () => {
    const selected = props.selectedTracks ?? [];
    return selected.some(
      (track) => track.id === props.track.id && track.source === props.track.source,
    )
      ? selected
      : [props.track];
  };

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

  const removeSelected = async () => {
    const listId = playlistId();
    if (!listId) return;
    const selected = actionTracks();
    if (
      selected.length > 1 &&
      !window.confirm(`确定从当前列表移除所选 ${selected.length} 首歌曲吗？`)
    ) {
      return;
    }
    await removeTracksFromList(listId, selected);
    props.onChanged?.();
  };

  const markDisliked = async () => {
    if (!window.confirm(`确定将“${props.track.name}”加入不喜欢吗？`)) return;
    await dislikeTrack(props.track);
    props.onChanged?.();
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
              aria-label={`更多操作 ${props.track.name}`}
              onClick={openFromActionButton}
            >
              <MoreIcon class="h-4 w-4" />
            </Button>
          </Show>
        </AppContextMenuTrigger>
        <ViewerAppContextMenuContent layout="compact" portalZClass={VIEWER_OVERLAY_Z.popper}>
          <AppContextMenuItem
            onSelect={() => playTrackAt(props.tracks, props.index, props.origin)}
          >
            播放
          </AppContextMenuItem>
          <AppContextMenuItem
            disabled={actionTracks().every((track) => track.source === 'local')}
            onSelect={() => void downloadTracks(actionTracks(), props.playlistId)}
          >
            下载
          </AppContextMenuItem>
          <AppContextMenuItem onSelect={() => playTracksLaterFromMenu(actionTracks())}>
            稍后播放
          </AppContextMenuItem>
          <AppContextMenuItem onSelect={() => setAddDialogOpen(true)}>
            添加到...
          </AppContextMenuItem>

          <Show when={variant() === 'library' && playlistId()}>
            <AppContextMenuItem onSelect={() => setMoveDialogOpen(true)}>
              移动到...
            </AppContextMenuItem>
            <AppContextMenuItem onSelect={() => setPositionDialogOpen(true)}>
              调整位置
            </AppContextMenuItem>
            <AppContextMenuItem onSelect={() => setSourceDialogOpen(true)}>
              歌曲换源
            </AppContextMenuItem>
            <AppContextMenuItem onSelect={() => void copyTrackName(props.track)}>
              复制歌曲名
            </AppContextMenuItem>
          </Show>

          <AppContextMenuItem
            disabled={!buildTrackSourceDetailUrl(props.track)}
            onSelect={() => void openTrackSourceDetail(props.track)}
          >
            歌曲详情页
          </AppContextMenuItem>
          <AppContextMenuItem onSelect={() => searchSimilarTrack(props.track)}>
            搜索
          </AppContextMenuItem>
          <AppContextMenuItem onSelect={() => void markDisliked()}>
            不喜欢
          </AppContextMenuItem>

          <Show when={variant() === 'library' && playlistId()}>
            <AppContextMenuSeparator />
            <AppContextMenuItem
              class="text-destructive focus:text-destructive"
              onSelect={() => void removeSelected()}
            >
              从列表移除
            </AppContextMenuItem>
          </Show>
        </ViewerAppContextMenuContent>
      </AppContextMenu>

      <MusicAddToListDialog
        open={addDialogOpen()}
        tracks={actionTracks()}
        mode="add"
        onOpenChange={setAddDialogOpen}
        onChanged={props.onChanged}
      />
      <Show when={playlistId()}>
        {(listId) => (
          <>
            <MusicAddToListDialog
              open={moveDialogOpen()}
              tracks={actionTracks()}
              mode="move"
              fromPlaylistId={listId()}
              onOpenChange={setMoveDialogOpen}
              onChanged={props.onChanged}
            />
            <MusicMovePositionDialog
              open={positionDialogOpen()}
              playlistId={listId()}
              tracks={actionTracks()}
              maxPosition={props.tracks.length}
              onOpenChange={setPositionDialogOpen}
              onChanged={props.onChanged}
            />
            <MusicTrackSourceDialog
              open={sourceDialogOpen()}
              playlistId={listId()}
              track={props.track}
              onOpenChange={setSourceDialogOpen}
              onChanged={props.onChanged}
            />
          </>
        )}
      </Show>
    </>
  );
};
