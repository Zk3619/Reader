/**
 * 音乐 Hub 骨架屏：对齐各页面真实布局（曲目行 / 歌单卡 / 侧栏 / 详情头 / 评论）
 * 视觉原语与发现页一致：bg-muted/60 animate-pulse
 */

import { For, Show, createEffect, createSignal, onCleanup, type Component } from 'solid-js';
import {
  BOOK_GROUP_CARD_HOVER_ELEVATION,
  bookGroupGridCardClass,
  bookGroupGridCoverClass,
  bookGroupGridMetaClass,
  exploreSkeletonPulseClass,
} from '@/lib/bookshelf/book-group-card-styles';
import {
  BOOKSHELF_LAYOUT_GAP_CLASS,
  bookshelfLayoutGapToRem,
} from '@/lib/bookshelf/bookshelf-layout-gap';
import {
  getBookshelfListColumnLayout,
  getViewModeGridColumnCount,
  isGridViewMode,
  isListViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import { musicHubListInsetClass, musicHubPageContentInsetClass } from '@/lib/media/audio/music-hub-section-meta';
import { MusicHubPageShell } from '@/components/media/viewer/audio/music/hub/MusicHubPageShell';
import { SettingsToolbarLeading } from '@/components/shell/SettingsPageToolbar';
import { getMusicSongListUi } from '@/stores/music-hub/music-songlist-ui';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { cn } from '@/lib/utils';

/** 与搜索/排行榜桌面曲目列对齐 */
const DESKTOP_TRACK_COLS =
  'grid w-full min-w-0 grid-cols-[3.25rem_minmax(0,1fr)_minmax(6rem,24%)_minmax(6rem,27%)_4.5rem] items-center gap-0 px-2 text-left';

/** 固定行宽，避免 Math.random 导致重挂载错位 */
const TRACK_ROW_WIDTHS: readonly (readonly [number, number, number, number])[] = [
  [72, 48, 55, 40],
  [88, 62, 42, 36],
  [65, 55, 70, 44],
  [78, 40, 58, 38],
  [92, 70, 45, 42],
  [58, 52, 62, 36],
  [80, 45, 50, 40],
  [70, 60, 68, 38],
  [85, 38, 52, 44],
  [62, 58, 40, 36],
  [76, 50, 65, 42],
  [90, 42, 48, 38],
];

const SIDEBAR_ROW_WIDTHS = [78, 62, 88, 55, 70, 82, 48, 75, 66, 90] as const;

const COMMENT_ROW_WIDTHS: readonly (readonly [number, number, number])[] = [
  [42, 88, 72],
  [55, 95, 60],
  [38, 78, 85],
  [60, 90, 55],
  [48, 82, 70],
  [52, 70, 90],
];

function Pulse(props: { class?: string; style?: Record<string, string> }) {
  return <div class={cn(exploreSkeletonPulseClass, props.class)} style={props.style} aria-hidden />;
}

function DesktopTrackRowSkeleton(props: { widths: readonly [number, number, number, number] }) {
  const [name, artist, album, duration] = props.widths;
  return (
    <div class={cn(DESKTOP_TRACK_COLS, 'h-11 border-b border-border/40')} aria-hidden>
      <div class="px-1">
        <Pulse class="h-3 w-5" />
      </div>
      <div class="px-1">
        <Pulse class="h-3.5" style={{ width: `${name}%` }} />
      </div>
      <div class="px-1">
        <Pulse class="h-3.5" style={{ width: `${artist}%` }} />
      </div>
      <div class="px-1">
        <Pulse class="h-3.5" style={{ width: `${album}%` }} />
      </div>
      <div class="px-1">
        <Pulse class="h-3.5" style={{ width: `${duration}%` }} />
      </div>
    </div>
  );
}

function MobileTrackRowSkeleton(props: { widths: readonly [number, number, number, number] }) {
  const [name, subtitle] = props.widths;
  return (
    <div
      class="flex min-h-[54px] items-center gap-2 border-b border-border/40 px-3"
      aria-hidden
    >
      <Pulse class="h-3 w-6 shrink-0" />
      <div class="min-w-0 flex-1 space-y-1.5">
        <Pulse class="h-3.5" style={{ width: `${name}%` }} />
        <Pulse class="h-3" style={{ width: `${Math.min(subtitle, 70)}%` }} />
      </div>
    </div>
  );
}

export interface MusicTrackListSkeletonProps {
  /** 行数，默认 12 */
  count?: number;
  /** 是否显示桌面表头 */
  showHeader?: boolean;
  class?: string;
}

/** 曲目列表骨架（搜索 / 排行榜 / 我的列表 / 歌单详情共用） */
export const MusicTrackListSkeleton: Component<MusicTrackListSkeletonProps> = (props) => {
  const shell = useShellLayout();
  const isMobile = () => shell().useMobileShell;
  const rows = () => TRACK_ROW_WIDTHS.slice(0, props.count ?? 12);

  return (
    <div class={cn('min-h-0 w-full', props.class)} aria-busy="true" aria-label="加载曲目列表">
      <Show when={!isMobile() && (props.showHeader ?? true)}>
        <div
          class={cn(
            DESKTOP_TRACK_COLS,
            'h-9.5 border-b border-border/50 bg-background text-xs font-medium text-muted-foreground',
          )}
        >
          <span class="w-full truncate px-1 text-left">#</span>
          <span class="min-w-0 w-full truncate px-1 text-left">歌曲名</span>
          <span class="min-w-0 w-full truncate px-1 text-left">艺术家</span>
          <span class="min-w-0 w-full truncate px-1 text-left">专辑名</span>
          <span class="min-w-0 w-full truncate px-1 text-left">时长</span>
        </div>
      </Show>
      <For each={rows()}>
        {(widths) => (
          <Show
            when={isMobile()}
            fallback={<DesktopTrackRowSkeleton widths={widths} />}
          >
            <MobileTrackRowSkeleton widths={widths} />
          </Show>
        )}
      </For>
    </div>
  );
};

const lxHorizontalCardClass = cn(
  'relative flex h-full w-full min-w-0 max-w-full items-center overflow-hidden rounded-xl border border-border/50 bg-card',
  'pointer-events-none shadow-none',
  BOOK_GROUP_CARD_HOVER_ELEVATION,
);

function PlaylistHorizontalCardSkeleton() {
  return (
    <div class={cn(lxHorizontalCardClass, 'gap-0 p-2')} aria-hidden>
      <Pulse class="aspect-square w-[40%] shrink-0 self-center rounded" />
      <div class="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-2 overflow-hidden py-0.5 pl-2 pr-2">
        <Pulse class="h-4 w-[78%]" />
        <Pulse class="h-3 w-[48%]" />
        <Pulse class="h-3 w-[62%]" />
      </div>
    </div>
  );
}

function PlaylistGridCardSkeleton() {
  return (
    <div
      class={cn(bookGroupGridCardClass('h-full w-full min-w-0 overflow-hidden'), 'pointer-events-none')}
      aria-hidden
    >
      <Pulse class={bookGroupGridCoverClass('aspect-square')} />
      <div class={bookGroupGridMetaClass()}>
        <Pulse class="h-3.5 w-[85%]" />
        <Pulse class="mt-1 h-3 w-[55%]" />
      </div>
    </div>
  );
}

export interface MusicPlaylistGridSkeletonProps {
  /** 卡片数，默认 12 */
  count?: number;
  class?: string;
  listInnerClass?: string;
}

/** 在线歌单网格骨架（浏览 / 搜索歌单 Tab） */
export const MusicPlaylistGridSkeleton: Component<MusicPlaylistGridSkeletonProps> = (props) => {
  const ui = getMusicSongListUi;
  const isGrid = () => isGridViewMode(ui().viewMode);
  const cols = () => {
    const mode = ui().viewMode;
    if (isGridViewMode(mode)) return getViewModeGridColumnCount(mode);
    if (isListViewMode(mode)) return getBookshelfListColumnLayout(mode);
    return 2;
  };
  const items = () => Array.from({ length: props.count ?? Math.max(cols() * 3, 12) }, (_, i) => i);
  const [root, setRoot] = createSignal<HTMLUListElement | undefined>();

  createEffect(() => {
    const el = root();
    if (!el) return;
    el.style.setProperty('--bookshelf-layout-gap', bookshelfLayoutGapToRem(ui().spacing));
    onCleanup(() => el.style.removeProperty('--bookshelf-layout-gap'));
  });

  return (
    <ul
      ref={setRoot}
      class={cn(
        musicHubListInsetClass,
        'grid px-2 pb-4 pt-1',
        BOOKSHELF_LAYOUT_GAP_CLASS,
        props.listInnerClass,
        props.class,
      )}
      style={{ 'grid-template-columns': `repeat(${cols()}, minmax(0, 1fr))` }}
      aria-busy="true"
      aria-label="加载歌单列表"
    >
      <For each={items()}>
        {() => (
          <li class="min-w-0 list-none">
            <Show when={isGrid()} fallback={<PlaylistHorizontalCardSkeleton />}>
              <PlaylistGridCardSkeleton />
            </Show>
          </li>
        )}
      </For>
    </ul>
  );
};

export interface MusicSidebarListSkeletonProps {
  count?: number;
  class?: string;
}

/** 侧栏列表骨架（排行榜榜单 / 我的列表） */
export const MusicSidebarListSkeleton: Component<MusicSidebarListSkeletonProps> = (props) => {
  const rows = () => SIDEBAR_ROW_WIDTHS.slice(0, props.count ?? 10);
  return (
    <ul class={cn('space-y-0.5 px-1.5', props.class)} aria-busy="true" aria-label="加载列表">
      <For each={rows()}>
        {(width) => (
          <li class="flex h-9 items-center px-2.5" aria-hidden>
            <Pulse class="h-3.5" style={{ width: `${width}%` }} />
          </li>
        )}
      </For>
    </ul>
  );
};

export interface MusicSongListDetailSkeletonProps {
  onBack?: () => void;
}

/** 在线歌单详情页骨架（首次打开、尚无 detail） */
export const MusicSongListDetailSkeleton: Component<MusicSongListDetailSkeletonProps> = (props) => {
  return (
    <MusicHubPageShell
      section="songlist"
      leading={
        props.onBack ? <SettingsToolbarLeading onBack={props.onBack} /> : undefined
      }
      scrollClass="overflow-hidden"
    >
      <div
        class={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden',
          musicHubPageContentInsetClass,
        )}
        aria-busy="true"
        aria-label="加载歌单详情"
      >
        <div class="flex shrink-0 gap-3 border-b py-3">
          <Pulse class="h-20 w-20 shrink-0 rounded-md" />
          <div class="min-w-0 flex-1 space-y-2 pt-1">
            <Pulse class="h-4 w-[42%]" />
            <Pulse class="h-3 w-full" />
            <Pulse class="h-3 w-[88%]" />
            <Pulse class="h-3 w-[72%]" />
          </div>
        </div>
        <MusicTrackListSkeleton class="min-h-0 flex-1 overflow-hidden" />
      </div>
    </MusicHubPageShell>
  );
};

export interface MusicCommentListSkeletonProps {
  count?: number;
  class?: string;
}

/** 评论列表骨架 */
export const MusicCommentListSkeleton: Component<MusicCommentListSkeletonProps> = (props) => {
  const rows = () => COMMENT_ROW_WIDTHS.slice(0, props.count ?? 6);
  return (
    <ul class={cn('w-full pl-2.5', props.class)} aria-busy="true" aria-label="加载评论">
      <For each={rows()}>
        {(widths) => {
          const [user, line1, line2] = widths;
          return (
            <li class="flex gap-2.5 border-b border-dashed border-primary/20 py-3" aria-hidden>
              <Pulse class="h-10 w-10 shrink-0 rounded" />
              <div class="min-w-0 flex-1 space-y-2">
                <Pulse class="h-3.5" style={{ width: `${user}%` }} />
                <Pulse class="h-3" style={{ width: `${line1}%` }} />
                <Pulse class="h-3" style={{ width: `${line2}%` }} />
              </div>
            </li>
          );
        }}
      </For>
    </ul>
  );
};
