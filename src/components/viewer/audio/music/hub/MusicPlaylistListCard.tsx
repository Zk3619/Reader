/**
 * 在线歌单卡片：正方形封面；桌面 lx 横向卡 / 移动书架网格竖卡
 */

import { Show, type Component } from 'solid-js';
import { Headphones, Music2 } from 'lucide-solid';
import { Badge } from '@/components/ui/badge';
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
import { searchSourceLabel, type SearchSource } from '@/lib/media/audio/online/source-router';
import { formatPlaylistStatCount } from '@/lib/media/audio/music-search-result-ui';
import type { OnlinePlaylistSummary } from '@/lib/media/audio/music-sdk/types';
import { cn } from '@/lib/utils';

export type MusicPlaylistCardVariant = 'horizontal' | 'grid';

export interface MusicPlaylistListCardProps {
  playlist: OnlinePlaylistSummary;
  variant: MusicPlaylistCardVariant;
  showSource?: boolean;
  onOpen: () => void;
  class?: string;
}

function PlaylistCoverImage(props: {
  coverUrl?: string;
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
      <img
        src={props.coverUrl}
        alt=""
        class="h-full w-full object-cover"
        loading="lazy"
        draggable={false}
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
        'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground',
        props.compact ? 'text-[10px]' : 'text-xs',
      )}
    >
      <Show when={trackCount()}>
        <span class="inline-flex min-w-0 items-center gap-0.5">
          <Music2 class="h-3 w-3 shrink-0" />
          <span class="truncate">{trackCount()}</span>
        </span>
      </Show>
      <Show when={playCount()}>
        <span class="inline-flex min-w-0 items-center gap-0.5">
          <Headphones class="h-3 w-3 shrink-0" />
          <span class="truncate">{playCount()}</span>
        </span>
      </Show>
      <Show when={props.showSource}>
        <Show
          when={props.compact}
          fallback={
            <span class="truncate">{searchSourceLabel(props.playlist.source as SearchSource)}</span>
          }
        >
          <Badge variant="outline" class="shrink-0 px-1 py-0 text-[10px] font-normal leading-4">
            {searchSourceLabel(props.playlist.source as SearchSource)}
          </Badge>
        </Show>
      </Show>
    </div>
  );
}

const lxHorizontalCardClass = cn(
  'book-group-card-motion relative flex h-full w-full min-w-[240px] max-w-[360px] cursor-pointer items-center overflow-hidden rounded-xl border border-border/50 bg-card',
  'hover:border-primary/50 hover:bg-accent/50 focus-within:border-primary/50',
  BOOK_GROUP_CARD_HOVER_ELEVATION,
  'focus-visible:shadow-[0_6px_18px_-6px_rgb(0_0_0/0.1)] dark:focus-within:shadow-[0_6px_18px_-6px_rgb(255_255_255/0.12)]',
);

function MobilePlaylistGridCard(props: MusicPlaylistListCardProps) {
  const author = () => formatBookshelfGridAuthor(props.playlist.author);

  return (
    <button
      type="button"
      class={cn(
        bookGroupGridCardClass('h-full w-full min-w-0 cursor-pointer text-left'),
        props.class,
      )}
      onClick={props.onOpen}
      {...bookGroupCardPressHandlers}
    >
      <div class={bookGroupGridCoverClass('aspect-square')}>
        <div class={bookGroupGridCoverZoomClass()}>
          <PlaylistCoverImage coverUrl={props.playlist.coverUrl} iconClass="h-8 w-8 opacity-40" />
        </div>
        <Show when={props.showSource}>
          <span class="absolute right-1 top-1 z-1 rounded bg-black/55 px-1 py-0.5 text-[10px] text-white">
            {searchSourceLabel(props.playlist.source as SearchSource)}
          </span>
        </Show>
      </div>
      <div class={bookGroupGridMetaClass()}>
        <h3 class={bookGroupGridTitleClass()}>{props.playlist.name}</h3>
        <p class={bookGroupGridSubtitleClass()}>{author()}</p>
      </div>
    </button>
  );
}

export const MusicPlaylistListCard: Component<MusicPlaylistListCardProps> = (props) => {
  return (
    <Show
      when={props.variant === 'horizontal'}
      fallback={<MobilePlaylistGridCard {...props} />}
    >
      <button
        type="button"
        class={cn(lxHorizontalCardClass, 'gap-0 p-2', props.class)}
        onClick={props.onOpen}
        {...bookGroupCardPressHandlers}
      >
        <div class="relative aspect-square w-[40%] shrink-0 self-center overflow-hidden rounded bg-muted/50 shadow-sm">
          <PlaylistCoverImage coverUrl={props.playlist.coverUrl} />
        </div>
        <div class="min-w-0 flex-1 self-center overflow-hidden py-0.5 pl-2 pr-2 text-left">
          <h4 class="line-clamp-2 text-sm font-medium leading-snug">{props.playlist.name}</h4>
          <Show when={props.playlist.author?.trim()}>
            <p class={bookshelfRowSubtitleClass(true, 'mt-1.5')}>{props.playlist.author}</p>
          </Show>
          <div class="mt-2">
            <PlaylistStats playlist={props.playlist} showSource={props.showSource} />
          </div>
        </div>
      </button>
    </Show>
  );
};
