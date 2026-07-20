/**
 * 在线歌单虚拟列表：固定列数（书架式 viewMode）+ 横向/网格卡片
 */

import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  type Accessor,
  type Component,
  type JSX,
} from 'solid-js';
import {
  VirtualGridRowsList,
  useVirtualGridContainerWidth,
} from '@/components/shared/virtual-list';
import {
  MusicPlaylistListCard,
  type MusicPlaylistCardVariant,
} from '@/components/media/viewer/audio/music/hub/MusicPlaylistListCard';
import {
  BOOKSHELF_LAYOUT_GAP_CLASS,
  bookshelfLayoutGapToRem,
  bookshelfLayoutSpacingToPx,
} from '@/lib/bookshelf/bookshelf-layout-gap';
import {
  getBookshelfListColumnLayout,
  getViewModeGridColumnCount,
  isGridViewMode,
  isListViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import {
  estimateLxDesktopPlaylistRowHeightPx,
  estimateLxMobilePlaylistRowHeightPx,
  LX_PLAYLIST_LIST_HORIZONTAL_PADDING_PX,
  LX_PLAYLIST_ROW_HOVER_PAD_PX,
  musicPlaylistItemKey,
} from '@/lib/media/audio/music-playlist-list-layout';
import type { OnlinePlaylistSummary } from '@/lib/media/audio/music-sdk/types';
import { musicHubListInsetClass } from '@/lib/media/audio/music-hub-section-meta';
import { getMusicSongListUi } from '@/stores/music-hub/music-songlist-ui';
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

const PLAYLIST_ROW_GAP_CSS_VAR = 'bookshelf-layout-gap';

export const MusicPlaylistVirtualList: Component<MusicPlaylistVirtualListProps> = (props) => {
  const ui = getMusicSongListUi;
  const items: Accessor<readonly OnlinePlaylistSummary[]> = () =>
    typeof props.playlists === 'function' ? props.playlists() : props.playlists;

  const [scrollRoot, setScrollRoot] = createSignal<HTMLDivElement | undefined>();
  const containerWidth = useVirtualGridContainerWidth(scrollRoot);

  const isGrid = () => isGridViewMode(ui().viewMode);

  const colCount = () => {
    const mode = ui().viewMode;
    if (isGridViewMode(mode)) return getViewModeGridColumnCount(mode);
    if (isListViewMode(mode)) return getBookshelfListColumnLayout(mode);
    return 2;
  };

  const gapPx = () => bookshelfLayoutSpacingToPx(ui().spacing);
  const horizontalPaddingPx = () => LX_PLAYLIST_LIST_HORIZONTAL_PADDING_PX;

  createEffect(() => {
    const el = scrollRoot();
    if (!el) return;
    const gap = bookshelfLayoutGapToRem(ui().spacing);
    el.style.setProperty(`--${PLAYLIST_ROW_GAP_CSS_VAR}`, gap);
    onCleanup(() => el.style.removeProperty(`--${PLAYLIST_ROW_GAP_CSS_VAR}`));
  });

  const fixedRowContentHeightPx = createMemo(() => {
    const cols = Math.max(1, colCount());
    const width = containerWidth();
    const pad = horizontalPaddingPx();
    const gap = gapPx();
    const inner = Math.max(0, (width > 0 ? width : 720) - pad);
    const colWidth = cols === 1 ? inner : Math.max(0, (inner - gap * (cols - 1)) / cols);
    const metrics = {
      containerWidth: width > 0 ? width : 720,
      colCount: cols,
      gapPx: gap,
      colWidth,
    };
    return isGrid()
      ? estimateLxMobilePlaylistRowHeightPx(metrics)
      : estimateLxDesktopPlaylistRowHeightPx(metrics);
  });

  const remeasureLayout = () =>
    `${ui().viewMode}|${ui().spacing}|${containerWidth()}|${colCount()}|${fixedRowContentHeightPx()}`;

  const listInnerClass = () =>
    props.listInnerClass ?? cn(musicHubListInsetClass, 'px-2 pb-4 pt-1');

  const cardVariant = (): MusicPlaylistCardVariant => (isGrid() ? 'grid' : 'horizontal');

  return (
    <VirtualGridRowsList<OnlinePlaylistSummary>
      class={cn('min-h-0 flex-1', props.class)}
      items={items}
      colCount={colCount}
      rowHeightMode="fixed"
      estimateRowSize={fixedRowContentHeightPx}
      rowGapCssVar={PLAYLIST_ROW_GAP_CSS_VAR}
      getInterRowGapPx={gapPx}
      remeasureDeps={remeasureLayout}
      gridClass={cn('grid', BOOKSHELF_LAYOUT_GAP_CLASS)}
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
