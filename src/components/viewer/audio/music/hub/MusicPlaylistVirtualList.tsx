/**
 * 在线歌单虚拟列表：桌面 lx 响应式网格 / 移动竖向网格
 */

import { createEffect, createMemo, createSignal, onCleanup, type Accessor, type Component } from 'solid-js';
import {
  VirtualGridRowsList,
  useVirtualGridContainerWidth,
} from '@/components/shared/virtual-list';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { MusicPlaylistListCard, type MusicPlaylistCardVariant } from '@/components/viewer/audio/music/hub/MusicPlaylistListCard';
import {
  estimateLxDesktopPlaylistRowHeightPx,
  estimateLxMobilePlaylistRowHeightPx,
  LX_PLAYLIST_DESKTOP_COL_GAP_PX,
  LX_PLAYLIST_DESKTOP_ROW_GAP_PX,
  LX_PLAYLIST_MOBILE_COL_GAP_PX,
  LX_PLAYLIST_MOBILE_ROW_GAP_PX,
  musicPlaylistItemKey,
  resolveDesktopPlaylistColumnCount,
  resolveMobilePlaylistColumnCount,
} from '@/lib/media/audio/music-playlist-list-layout';
import type { OnlinePlaylistSummary } from '@/lib/media/audio/music-sdk/types';
import { cn } from '@/lib/utils';

export interface MusicPlaylistVirtualListProps {
  playlists: Accessor<readonly OnlinePlaylistSummary[]> | readonly OnlinePlaylistSummary[];
  showSource?: boolean;
  onOpen: (playlist: OnlinePlaylistSummary) => void;
  class?: string;
  listInnerClass?: string;
}

const DESKTOP_LIST_PADDING_PX = 32;
const MOBILE_LIST_PADDING_PX = 20;
const PLAYLIST_ROW_GAP_CSS_VAR = 'music-playlist-row-gap';

export const MusicPlaylistVirtualList: Component<MusicPlaylistVirtualListProps> = (props) => {
  const shell = useShellLayout();
  const isMobileLayout = () => shell().useMobileShell;
  const items: Accessor<readonly OnlinePlaylistSummary[]> = () =>
    typeof props.playlists === 'function' ? props.playlists() : props.playlists;

  const [scrollRoot, setScrollRoot] = createSignal<HTMLDivElement | undefined>();
  const containerWidth = useVirtualGridContainerWidth(scrollRoot);

  const interRowGapPx = () =>
    isMobileLayout() ? LX_PLAYLIST_MOBILE_ROW_GAP_PX : LX_PLAYLIST_DESKTOP_ROW_GAP_PX;

  createEffect(() => {
    const el = scrollRoot();
    if (!el) return;
    el.style.setProperty(`--${PLAYLIST_ROW_GAP_CSS_VAR}`, `${interRowGapPx()}px`);
    onCleanup(() => el.style.removeProperty(`--${PLAYLIST_ROW_GAP_CSS_VAR}`));
  });

  const colCount = createMemo(() => {
    if (isMobileLayout()) {
      return resolveMobilePlaylistColumnCount(shell().windowWidth);
    }
    const width = containerWidth();
    if (width <= 0) return 3;
    return resolveDesktopPlaylistColumnCount(
      width,
      LX_PLAYLIST_DESKTOP_COL_GAP_PX,
      DESKTOP_LIST_PADDING_PX,
    );
  });

  const remeasureLayout = () =>
    `${isMobileLayout()}|${shell().windowWidth}|${containerWidth()}|${colCount()}|${interRowGapPx()}`;

  const gridClass = () =>
    isMobileLayout() ? 'grid gap-x-6' : 'grid gap-x-5';

  const listInnerClass = () =>
    props.listInnerClass ??
    (isMobileLayout() ? 'px-2.5 pb-4 pt-1' : 'px-4 pb-4 pt-1');

  const responsiveRowHeight = createMemo(() => ({
    horizontalPaddingPx: isMobileLayout() ? MOBILE_LIST_PADDING_PX : DESKTOP_LIST_PADDING_PX,
    getGapPx: () =>
      isMobileLayout() ? LX_PLAYLIST_MOBILE_COL_GAP_PX : LX_PLAYLIST_DESKTOP_COL_GAP_PX,
    estimateRowHeight: isMobileLayout()
      ? estimateLxMobilePlaylistRowHeightPx
      : estimateLxDesktopPlaylistRowHeightPx,
  }));

  const cardVariant = (): MusicPlaylistCardVariant =>
    isMobileLayout() ? 'grid' : 'horizontal';

  return (
    <VirtualGridRowsList<OnlinePlaylistSummary>
      class={cn('min-h-0 flex-1', props.class)}
      items={items}
      colCount={colCount}
      rowHeightMode="responsive"
      responsiveRowHeight={responsiveRowHeight()}
      rowGapCssVar={PLAYLIST_ROW_GAP_CSS_VAR}
      getInterRowGapPx={interRowGapPx}
      remeasureDeps={remeasureLayout}
      gridClass={gridClass()}
      listInnerClass={listInnerClass()}
      overscan={2}
      getItemKey={musicPlaylistItemKey}
      onScrollContainer={(el) => setScrollRoot(el)}
    >
      {(playlist) => (
        <div class="flex h-full w-full min-w-0 justify-start">
          <MusicPlaylistListCard
            playlist={playlist}
            variant={cardVariant()}
            showSource={props.showSource}
            onOpen={() => props.onOpen(playlist)}
            class="h-full"
          />
        </div>
      )}
    </VirtualGridRowsList>
  );
};
