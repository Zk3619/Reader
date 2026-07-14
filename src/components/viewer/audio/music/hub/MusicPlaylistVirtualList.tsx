/**
 * 在线歌单虚拟列表：桌面 lx 响应式网格 / 移动竖向网格（固定行高，避免聚合来源换行抖动）
 */

import { createEffect, createMemo, createSignal, onCleanup, type Accessor, type Component, type JSX } from 'solid-js';
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
  LX_PLAYLIST_LIST_HORIZONTAL_PADDING_PX,
  LX_PLAYLIST_MOBILE_COL_GAP_PX,
  LX_PLAYLIST_MOBILE_ROW_GAP_PX,
  LX_PLAYLIST_ROW_HOVER_PAD_PX,
  musicPlaylistItemKey,
  resolveDesktopPlaylistColumnCount,
  resolveMobilePlaylistColumnCount,
} from '@/lib/media/audio/music-playlist-list-layout';
import type { OnlinePlaylistSummary } from '@/lib/media/audio/music-sdk/types';
import { musicHubListInsetClass } from '@/lib/media/audio/music-hub-section-meta';
import { cn } from '@/lib/utils';

export interface MusicPlaylistVirtualListProps {
  playlists: Accessor<readonly OnlinePlaylistSummary[]> | readonly OnlinePlaylistSummary[];
  showSource?: boolean;
  onOpen: (playlist: OnlinePlaylistSummary) => void;
  class?: string;
  listInnerClass?: string;
  onScroll?: (el: HTMLDivElement) => void;
  onScrollContainer?: (el: HTMLDivElement) => void;
  scrollFooter?: JSX.Element;
}

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

  const horizontalPaddingPx = () => LX_PLAYLIST_LIST_HORIZONTAL_PADDING_PX;

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
      horizontalPaddingPx(),
    );
  });

  /** 固定行高：卡片高 + 顶留白（悬停抬升）；列宽按 content box 估算 */
  const fixedRowContentHeightPx = createMemo(() => {
    const cols = Math.max(1, colCount());
    const width = containerWidth();
    const pad = horizontalPaddingPx();
    const gap = isMobileLayout() ? LX_PLAYLIST_MOBILE_COL_GAP_PX : LX_PLAYLIST_DESKTOP_COL_GAP_PX;
    const inner = Math.max(0, (width > 0 ? width : 720) - pad);
    const colWidth = cols === 1 ? inner : Math.max(0, (inner - gap * (cols - 1)) / cols);
    const metrics = {
      containerWidth: width > 0 ? width : 720,
      colCount: cols,
      gapPx: gap,
      colWidth,
    };
    return isMobileLayout()
      ? estimateLxMobilePlaylistRowHeightPx(metrics)
      : estimateLxDesktopPlaylistRowHeightPx(metrics);
  });

  const remeasureLayout = () =>
    `${isMobileLayout()}|${shell().windowWidth}|${containerWidth()}|${colCount()}|${interRowGapPx()}|${fixedRowContentHeightPx()}`;

  const gridClass = () =>
    isMobileLayout() ? 'grid gap-x-6' : 'grid gap-x-5';

  // 对齐书架：四周留白；水平 px-2 避免奇数列中间卡右侧被裁切
  const listInnerClass = () =>
    props.listInnerClass ?? cn(musicHubListInsetClass, 'px-2 pb-4 pt-1');

  const cardVariant = (): MusicPlaylistCardVariant =>
    isMobileLayout() ? 'grid' : 'horizontal';

  return (
    <VirtualGridRowsList<OnlinePlaylistSummary>
      class={cn('min-h-0 flex-1', props.class)}
      items={items}
      colCount={colCount}
      rowHeightMode="fixed"
      estimateRowSize={fixedRowContentHeightPx}
      rowGapCssVar={PLAYLIST_ROW_GAP_CSS_VAR}
      getInterRowGapPx={interRowGapPx}
      remeasureDeps={remeasureLayout}
      gridClass={gridClass()}
      listInnerClass={listInnerClass()}
      overscan={2}
      getItemKey={musicPlaylistItemKey}
      onScrollContainer={(el) => {
        setScrollRoot(el);
        props.onScrollContainer?.(el);
      }}
      onScroll={props.onScroll}
      scrollFooter={props.scrollFooter}
    >
      {(playlist) => (
        <div
          class="flex h-full w-full min-w-0 flex-col justify-end overflow-visible"
          style={{ 'padding-top': `${LX_PLAYLIST_ROW_HOVER_PAD_PX}px` }}
        >
          <MusicPlaylistListCard
            playlist={playlist}
            variant={cardVariant()}
            showSource={props.showSource}
            onOpen={() => props.onOpen(playlist)}
            class="min-h-0 min-w-0 w-full max-w-full flex-1"
          />
        </div>
      )}
    </VirtualGridRowsList>
  );
};
