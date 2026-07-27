/**
 * 影视收藏 / 历史共用右键菜单：查看详情、立即播放、调整分组、删除
 */

import type { Component, JSX } from 'solid-js';
import {
  AppContextMenu,
  AppContextMenuItem,
  AppContextMenuSeparator,
  AppContextMenuTrigger,
} from '@/components/shared/AppContextMenu';
import {
  ViewerAppContextMenuContent,
  VIEWER_OVERLAY_Z,
} from '@/components/media/viewer/viewer-app-overlay';
import { cn } from '@/lib/utils';

export interface TvLibraryItemContextMenuProps {
  onDetail: () => void;
  onPlay: () => void;
  onGroup: () => void;
  onRemove: () => void;
  class?: string;
  children: JSX.Element;
}

export const TvLibraryItemContextMenu: Component<TvLibraryItemContextMenuProps> = (props) => {
  return (
    <AppContextMenu>
      <AppContextMenuTrigger as="div" class={cn('h-full w-full min-w-0', props.class)}>
        {props.children}
      </AppContextMenuTrigger>
      <ViewerAppContextMenuContent layout="compact" portalZClass={VIEWER_OVERLAY_Z.popper}>
        <AppContextMenuItem onSelect={() => props.onDetail()}>查看详情</AppContextMenuItem>
        <AppContextMenuItem onSelect={() => props.onPlay()}>立即播放</AppContextMenuItem>
        <AppContextMenuItem onSelect={() => props.onGroup()}>调整分组</AppContextMenuItem>
        <AppContextMenuSeparator />
        <AppContextMenuItem
          class="text-destructive focus:text-destructive"
          onSelect={() => props.onRemove()}
        >
          删除
        </AppContextMenuItem>
      </ViewerAppContextMenuContent>
    </AppContextMenu>
  );
};
