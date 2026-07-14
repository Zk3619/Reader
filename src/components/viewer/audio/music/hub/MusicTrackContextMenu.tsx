/**
 * 曲目右键菜单（对齐 lx OnlineList / MusicList）
 */

import {
  For,
  Show,
  createResource,
  createSignal,
  type Component,
  type JSX,
} from 'solid-js';
import {
  AppContextMenu,
  AppContextMenuItem,
  AppContextMenuSeparator,
  AppContextMenuSub,
  AppContextMenuSubContent,
  AppContextMenuSubTrigger,
  AppContextMenuTrigger,
} from '@/components/shared/AppContextMenu';
import {
  ViewerAppContextMenuContent,
  VIEWER_OVERLAY_Z,
} from '@/components/viewer/viewer-app-overlay';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import {
  addTrackToPlaylist,
  buildTrackSourceDetailUrl,
  copyTrackName,
  dislikeTrack,
  downloadTrack,
  listPlaylistTargets,
  moveTrackToPlaylist,
  playTrackAt,
  playTrackLater,
  removeTrackFromList,
  searchSimilarTrack,
  openTrackSourceDetail,
  type PlaylistTarget,
} from '@/lib/media/audio/music-context-actions';
import { cn } from '@/lib/utils';

export type MusicTrackContextVariant = 'online' | 'library';

export interface MusicTrackContextMenuProps {
  track: AudioTrack;
  tracks: AudioTrack[];
  index: number;
  variant?: MusicTrackContextVariant;
  /** 当前所属用户/内置列表 id（library 用于移除/移动） */
  playlistId?: string | null;
  origin?: 'search' | 'list';
  onChanged?: () => void;
  class?: string;
  children: JSX.Element;
}

function PlaylistSubItems(props: {
  targets: PlaylistTarget[];
  currentPlaylistId?: string | null;
  onPick: (listId: string) => void;
}) {
  return (
    <For each={props.targets}>
      {(t) => (
        <AppContextMenuItem
          disabled={t.listId === props.currentPlaylistId}
          onSelect={() => props.onPick(t.listId)}
        >
          {t.name}
        </AppContextMenuItem>
      )}
    </For>
  );
}

export const MusicTrackContextMenu: Component<MusicTrackContextMenuProps> = (props) => {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [targets] = createResource(menuOpen, (open) =>
    open ? listPlaylistTargets() : Promise.resolve([] as PlaylistTarget[]),
  );

  const variant = () => props.variant ?? 'online';
  const sourceDetailAvailable = () => !!buildTrackSourceDetailUrl(props.track);
  const canDownload = () => props.track.source !== 'local';
  const playlistId = () => props.playlistId ?? null;

  return (
    <AppContextMenu onOpenChange={setMenuOpen}>
      <AppContextMenuTrigger as="div" class={cn('h-full w-full min-w-0', props.class)}>
        {props.children}
      </AppContextMenuTrigger>
      <ViewerAppContextMenuContent layout="compact" portalZClass={VIEWER_OVERLAY_Z.popper}>
        <AppContextMenuItem
          onSelect={() =>
            playTrackAt(props.tracks, props.index, props.origin)
          }
        >
          播放
        </AppContextMenuItem>
        <AppContextMenuItem
          disabled={!canDownload()}
          onSelect={() => void downloadTrack(props.track)}
        >
          下载
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={() => playTrackLater(props.track)}>
          下一首播放
        </AppContextMenuItem>

        <AppContextMenuSub>
          <AppContextMenuSubTrigger>添加到</AppContextMenuSubTrigger>
          <AppContextMenuSubContent portalZClass={VIEWER_OVERLAY_Z.popper}>
            <Show
              when={(targets() ?? []).length > 0}
              fallback={
                <AppContextMenuItem disabled class="text-muted-foreground">
                  暂无可用列表
                </AppContextMenuItem>
              }
            >
              <PlaylistSubItems
                targets={targets() ?? []}
                currentPlaylistId={playlistId()}
                onPick={(listId) => void addTrackToPlaylist(listId, props.track)}
              />
            </Show>
          </AppContextMenuSubContent>
        </AppContextMenuSub>

        <Show when={variant() === 'library' && playlistId()}>
          <AppContextMenuSub>
            <AppContextMenuSubTrigger>移动到</AppContextMenuSubTrigger>
            <AppContextMenuSubContent portalZClass={VIEWER_OVERLAY_Z.popper}>
              <Show
                when={(targets() ?? []).length > 0}
                fallback={
                  <AppContextMenuItem disabled class="text-muted-foreground">
                    暂无可用列表
                  </AppContextMenuItem>
                }
              >
                <PlaylistSubItems
                  targets={targets() ?? []}
                  currentPlaylistId={playlistId()}
                  onPick={(listId) =>
                    void moveTrackToPlaylist(playlistId()!, listId, props.track).then(() =>
                      props.onChanged?.(),
                    )
                  }
                />
              </Show>
            </AppContextMenuSubContent>
          </AppContextMenuSub>
        </Show>

        <Show when={variant() === 'library'}>
          <AppContextMenuItem onSelect={() => void copyTrackName(props.track)}>
            复制歌曲名
          </AppContextMenuItem>
        </Show>

        <AppContextMenuItem
          disabled={!sourceDetailAvailable()}
          onSelect={() => void openTrackSourceDetail(props.track)}
        >
          歌曲详情页
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={() => searchSimilarTrack(props.track)}>
          搜索
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={() => void dislikeTrack(props.track)}>
          不喜欢
        </AppContextMenuItem>

        <Show when={variant() === 'library' && playlistId()}>
          <AppContextMenuSeparator />
          <AppContextMenuItem
            class="text-destructive focus:text-destructive"
            onSelect={() =>
              void removeTrackFromList(playlistId()!, props.track.id).then(() =>
                props.onChanged?.(),
              )
            }
          >
            从列表移除
          </AppContextMenuItem>
        </Show>
      </ViewerAppContextMenuContent>
    </AppContextMenu>
  );
};
