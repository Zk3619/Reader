/**
 * 在线歌单卡片：正方形封面；桌面 lx 横向卡 / 移动书架网格竖卡
 */

import { For, Show, type Component } from 'solid-js';
import { Headphones, Music2 } from 'lucide-solid';
import { bookGroupCardPressHandlers } from '@/lib/bookshelf/book-group-card-press';
import {
  BOOK_GROUP_CARD_HOVER_ELEVATION,
  bookGroupGridCardClass,
  bookGroupGridCoverClass,
  bookGroupGridCoverZoomClass,
  bookGroupGridMetaClass,
  bookGroupGridSubtitleClass,
  bookGroupGridTitleClass,
  bookshelfRowSubtitleClass,
  formatBookshelfGridAuthor,
} from '@/lib/bookshelf/book-group-card-styles';
import { searchSourceShortLabel } from '@/lib/media/audio/online/source-router';
import { formatPlaylistStatCount } from '@/lib/media/audio/music-search-result-ui';
import type { OnlinePlaylistSummary } from '@/lib/media/audio/music-sdk/types';
import { cn } from '@/lib/utils';
import { MusicCoverImg } from '@/components/media/viewer/audio/music/MusicCoverImg';
import { MusicPlaylistContextMenu } from '@/components/media/viewer/audio/music/hub/MusicPlaylistContextMenu';
import { TruncatedTooltip } from '@/components/shared/TruncatedTooltip';

export type MusicPlaylistCardVariant = 'horizontal' | 'grid';

export interface MusicPlaylistListCardProps {
  playlist: OnlinePlaylistSummary;
  variant: MusicPlaylistCardVariant;
  showSource?: boolean;
  onOpen: () => void;
  class?: string;
}

const coverBadgeChipClass =
  'inline-flex max-w-full items-center gap-0.5 rounded bg-black/55 px-1 py-0.5 text-[10px] leading-none text-white';

function PlaylistCoverImage(props: {
  coverUrl?: string;
  playlistSource?: string;
  playlistId?: string;
  iconClass?: string;
}) {
  return (
    <Show
      when={props.coverUrl}
      fallback={
        <div class="flex h-full w-full items-center justify-center text-muted-foreground">
          <Music2 class={props.iconClass ?? 'h-8 w-8 opacity-40'} />
        </div>
      }
    >
      <MusicCoverImg
        src={props.coverUrl}
        playlistSource={props.playlistSource}
        playlistId={props.playlistId}
        alt=""
        class="h-full w-full object-cover"
        loading="lazy"
        draggable={false}
        fallback={
          <div class="flex h-full w-full items-center justify-center text-muted-foreground">
            <Music2 class={props.iconClass ?? 'h-8 w-8 opacity-40'} />
          </div>
        }
      />
    </Show>
  );
}

function PlaylistStats(props: {
  playlist: OnlinePlaylistSummary;
  showSource?: boolean;
  compact?: boolean;
}) {
  const trackCount = () => formatPlaylistStatCount(props.playlist.trackCount);
  const playCount = () => formatPlaylistStatCount(props.playlist.playCount);

  return (
    <div
      class={cn(
        'flex min-w-0 flex-nowrap items-center gap-x-2 overflow-hidden text-muted-foreground',
        props.compact ? 'text-[10px]' : 'text-xs',
      )}
    >
      <Show when={trackCount()}>
        <span class="inline-flex min-w-0 shrink items-center gap-0.5">
          <Music2 class="h-3 w-3 shrink-0" />
          <span class="truncate">{trackCount()}</span>
        </span>
      </Show>
      <Show when={playCount()}>
        <span class="inline-flex min-w-0 shrink items-center gap-0.5">
          <Headphones class="h-3 w-3 shrink-0" />
          <span class="truncate">{playCount()}</span>
        </span>
      </Show>
      <Show when={props.showSource}>
        <span class="shrink-0 truncate font-medium text-muted-foreground/90">
          {searchSourceShortLabel(props.playlist.source)}
        </span>
      </Show>
    </div>
  );
}

/** 网格封面右上角徽标：歌曲数 / 播放量（有数据时）+ 可选来源 */
function PlaylistCoverBadges(props: {
  playlist: OnlinePlaylistSummary;
  showSource?: boolean;
}) {
  const trackCount = () => formatPlaylistStatCount(props.playlist.trackCount);
  const playCount = () => formatPlaylistStatCount(props.playlist.playCount);
  const badges = () => {
    const list: Array<{ key: string; icon: 'track' | 'play' | 'source'; label: string }> = [];
    const tracks = trackCount();
    if (tracks) list.push({ key: 'track', icon: 'track', label: tracks });
    const plays = playCount();
    if (plays) list.push({ key: 'play', icon: 'play', label: plays });
    if (props.showSource) {
      list.push({
        key: 'source',
        icon: 'source',
        label: searchSourceShortLabel(props.playlist.source),
      });
    }
    return list;
  };

  return (
    <Show when={badges().length > 0}>
      <div class="absolute right-1 top-1 z-1 flex max-w-[calc(100%-0.5rem)] flex-col items-end gap-0.5">
        <For each={badges()}>
          {(b) => (
            <span class={coverBadgeChipClass}>
              <Show when={b.icon === 'track'}>
                <Music2 class="h-2.5 w-2.5 shrink-0 opacity-90" />
              </Show>
              <Show when={b.icon === 'play'}>
                <Headphones class="h-2.5 w-2.5 shrink-0 opacity-90" />
              </Show>
              <span class="min-w-0 truncate leading-none">{b.label}</span>
            </span>
          )}
        </For>
      </div>
    </Show>
  );
}

const lxHorizontalCardClass = cn(
  'book-group-card-motion relative flex h-full w-full min-w-0 max-w-full cursor-pointer items-center overflow-hidden rounded-xl border border-border/50 bg-card',
  'hover:border-primary/50 hover:bg-accent/50 focus-within:border-primary/50',
  BOOK_GROUP_CARD_HOVER_ELEVATION,
  'focus-visible:shadow-[0_6px_18px_-6px_rgb(0_0_0/0.1)] dark:focus-within:shadow-[0_6px_18px_-6px_rgb(255_255_255/0.12)]',
);

function MobilePlaylistGridCard(props: MusicPlaylistListCardProps) {
  const authorText = () => props.playlist.author?.trim() ?? '';
  const authorDisplay = () => formatBookshelfGridAuthor(props.playlist.author);

  return (
    <MusicPlaylistContextMenu playlist={props.playlist} onOpen={props.onOpen}>
      <button
        type="button"
        class={cn(
          bookGroupGridCardClass('h-full w-full min-w-0 cursor-pointer overflow-hidden text-left'),
          props.class,
        )}
        onClick={props.onOpen}
        {...bookGroupCardPressHandlers}
      >
        <div class={bookGroupGridCoverClass('aspect-square')}>
          <div class={bookGroupGridCoverZoomClass()}>
            <PlaylistCoverImage
              coverUrl={props.playlist.coverUrl}
              playlistSource={props.playlist.source}
              playlistId={props.playlist.id}
              iconClass="h-8 w-8 opacity-40"
            />
          </div>
          <PlaylistCoverBadges playlist={props.playlist} showSource={props.showSource} />
        </div>
        <div class={bookGroupGridMetaClass()}>
          <TruncatedTooltip text={props.playlist.name} class={bookGroupGridTitleClass()} />
          <Show
            when={authorText()}
            fallback={<p class={bookGroupGridSubtitleClass()}>{authorDisplay()}</p>}
          >
            <TruncatedTooltip text={authorText()} class={bookGroupGridSubtitleClass()} />
          </Show>
        </div>
      </button>
    </MusicPlaylistContextMenu>
  );
}

export const MusicPlaylistListCard: Component<MusicPlaylistListCardProps> = (props) => {
  const authorText = () => props.playlist.author?.trim() ?? '';

  return (
    <Show
      when={props.variant === 'horizontal'}
      fallback={<MobilePlaylistGridCard {...props} />}
    >
      <MusicPlaylistContextMenu playlist={props.playlist} onOpen={props.onOpen}>
        <button
          type="button"
          class={cn(lxHorizontalCardClass, 'gap-0 p-2', props.class)}
          onClick={props.onOpen}
          {...bookGroupCardPressHandlers}
        >
          <div class="relative aspect-square w-[40%] shrink-0 self-center overflow-hidden rounded bg-muted/50 shadow-sm">
            <PlaylistCoverImage
              coverUrl={props.playlist.coverUrl}
              playlistSource={props.playlist.source}
              playlistId={props.playlist.id}
            />
          </div>
          <div class="flex min-h-0 min-w-0 flex-1 flex-col justify-center overflow-hidden py-0.5 pl-2 pr-2 text-left">
            <TruncatedTooltip
              text={props.playlist.name}
              class="block w-full text-sm font-medium leading-snug"
            />
            <Show when={authorText()}>
              <TruncatedTooltip
                text={authorText()}
                class={bookshelfRowSubtitleClass(true, 'mt-1')}
              />
            </Show>
            <div class="mt-1.5 min-w-0">
              <PlaylistStats playlist={props.playlist} showSource={props.showSource} />
            </div>
          </div>
        </button>
      </MusicPlaylistContextMenu>
    </Show>
  );
};
