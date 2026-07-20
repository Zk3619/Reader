/**
 * 影视收藏横向标准列表卡：封面 + 标题 + 文本元数据
 */

import { Show, type Component, type JSX } from 'solid-js';
import { TvTabIcon } from '@/components/shared/icons';
import { bookGroupCardPressHandlers } from '@/lib/bookshelf/book-group-card-press';
import {
  BOOK_GROUP_CARD_HOVER_ELEVATION,
  bookshelfRowSubtitleClass,
  bookshelfRowTitleClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { buildTvKeepDisplayMeta } from '@/lib/media/tv/tv-keep-meta';
import type { TvKeepRow } from '@/lib/media/tv/types';
import { cn } from '@/lib/utils';

export interface TvKeepListCardProps {
  item: TvKeepRow;
  onOpen: () => void;
  class?: string;
  trailing?: JSX.Element;
}

const horizontalCardClass = cn(
  'book-group-card-motion relative flex h-full w-full min-w-0 max-w-full cursor-pointer items-center overflow-hidden rounded-xl border border-border/50 bg-card',
  'hover:border-primary/50 hover:bg-accent/50 focus-within:border-primary/50',
  BOOK_GROUP_CARD_HOVER_ELEVATION,
  'focus-visible:shadow-[0_6px_18px_-6px_rgb(0_0_0/0.1)] dark:focus-within:shadow-[0_6px_18px_-6px_rgb(255_255_255/0.12)]',
);

function Cover(props: { coverUrl?: string }) {
  return (
    <Show
      when={props.coverUrl?.trim()}
      fallback={
        <div class="flex h-full w-full items-center justify-center bg-muted/40 text-muted-foreground">
          <TvTabIcon class="h-7 w-7 opacity-40" />
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

export const TvKeepListCard: Component<TvKeepListCardProps> = (props) => {
  const meta = () => buildTvKeepDisplayMeta(props.item);

  return (
    <div class={cn('relative h-full w-full min-w-0', props.class)}>
      <button
        type="button"
        class={cn(horizontalCardClass, 'gap-3 p-2 text-left')}
        onClick={props.onOpen}
        {...bookGroupCardPressHandlers}
      >
        <div class="h-19 w-12.5 shrink-0 overflow-hidden rounded-lg bg-muted/30">
          <Cover coverUrl={props.item.vodPic} />
        </div>
        <div class="min-w-0 flex-1 py-0.5">
          <h3 class={bookshelfRowTitleClass(false)}>{props.item.vodName || '未命名'}</h3>
          <Show when={meta().subtitle}>
            <p class={bookshelfRowSubtitleClass(false)}>{meta().subtitle}</p>
          </Show>
          <Show when={!meta().subtitle && props.item.kind === 'live'}>
            <p class={bookshelfRowSubtitleClass(false)}>直播</p>
          </Show>
        </div>
      </button>
      <Show when={props.trailing}>
        <div class="absolute right-1 top-1 z-2">{props.trailing}</div>
      </Show>
    </div>
  );
};
