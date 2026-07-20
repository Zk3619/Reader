/**
 * 影视收藏卡片右键菜单
 */

import { For, Show, createResource, type Component, type JSX } from 'solid-js';
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
} from '@/components/media/viewer/viewer-app-overlay';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import type { TvKeepRow } from '@/lib/media/tv/types';
import { cn } from '@/lib/utils';

export interface TvKeepContextMenuProps {
  item: TvKeepRow;
  onOpen: () => void;
  onRemove: () => void;
  onMovedToGroup?: () => void;
  class?: string;
  children: JSX.Element;
}

export const TvKeepContextMenu: Component<TvKeepContextMenuProps> = (props) => {
  const [groups] = createResource(() => TvDao.listVideoGroups({ userOnly: true }));

  return (
    <AppContextMenu>
      <AppContextMenuTrigger as="div" class={cn('h-full w-full min-w-0', props.class)}>
        {props.children}
      </AppContextMenuTrigger>
      <ViewerAppContextMenuContent layout="compact" portalZClass={VIEWER_OVERLAY_Z.popper}>
        <AppContextMenuItem onSelect={() => props.onOpen()}>
          {props.item.kind === 'live' ? '播放' : '打开详情'}
        </AppContextMenuItem>
        <Show when={(groups() ?? []).length > 0}>
          <AppContextMenuSub>
            <AppContextMenuSubTrigger>移入分组</AppContextMenuSubTrigger>
            <AppContextMenuSubContent>
              <For each={groups() ?? []}>
                {(g) => (
                  <AppContextMenuItem
                    onSelect={() => {
                      void TvDao.addKeepToGroup(g.groupId, props.item.key).then(() => {
                        props.onMovedToGroup?.();
                      });
                    }}
                  >
                    {g.groupName}
                  </AppContextMenuItem>
                )}
              </For>
            </AppContextMenuSubContent>
          </AppContextMenuSub>
        </Show>
        <AppContextMenuSeparator />
        <AppContextMenuItem
          class="text-destructive focus:text-destructive"
          onSelect={() => props.onRemove()}
        >
          取消收藏
        </AppContextMenuItem>
      </ViewerAppContextMenuContent>
    </AppContextMenu>
  );
};
