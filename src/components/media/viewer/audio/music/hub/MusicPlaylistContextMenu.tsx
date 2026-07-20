/**
 * 在线歌单卡片右键菜单（搜索结果 / 歌单页扩展）
 */

import { type Component, type JSX } from 'solid-js';
import {
  AppContextMenu,
  AppContextMenuItem,
  AppContextMenuTrigger,
} from '@/components/shared/AppContextMenu';
import {
  ViewerAppContextMenuContent,
  VIEWER_OVERLAY_Z,
} from '@/components/media/viewer/viewer-app-overlay';
import type { OnlinePlaylistSummary } from '@/lib/media/audio/music-sdk/types';
import {
  collectOnlinePlaylist,
  copyText,
  openPlaylistSourceDetail,
  playOnlinePlaylist,
} from '@/lib/media/audio/music-context-actions';
import { cn } from '@/lib/utils';

export interface MusicPlaylistContextMenuProps {
  playlist: OnlinePlaylistSummary;
  onOpen: () => void;
  class?: string;
  children: JSX.Element;
}

export const MusicPlaylistContextMenu: Component<MusicPlaylistContextMenuProps> = (props) => {
  return (
    <AppContextMenu>
      <AppContextMenuTrigger as="div" class={cn('h-full w-full min-w-0', props.class)}>
        {props.children}
      </AppContextMenuTrigger>
      <ViewerAppContextMenuContent layout="compact" portalZClass={VIEWER_OVERLAY_Z.popper}>
        <AppContextMenuItem onSelect={() => props.onOpen()}>打开</AppContextMenuItem>
        <AppContextMenuItem onSelect={() => void playOnlinePlaylist(props.playlist)}>
          播放全部
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={() => void collectOnlinePlaylist(props.playlist)}>
          收藏到播放列表
        </AppContextMenuItem>
        <AppContextMenuItem
          onSelect={() => void copyText(props.playlist.name, '已复制歌单名')}
        >
          复制名称
        </AppContextMenuItem>
        <AppContextMenuItem onSelect={() => void openPlaylistSourceDetail(props.playlist)}>
          源详情页
        </AppContextMenuItem>
      </ViewerAppContextMenuContent>
    </AppContextMenu>
  );
};
