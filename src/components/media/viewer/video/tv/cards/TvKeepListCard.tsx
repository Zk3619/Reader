/**
 * 影视收藏横向标准列表卡：封面 + 标题 + 文本元数据
 */

import { Show, type Component, type JSX } from 'solid-js';
import { TvListCover } from '@/components/media/viewer/video/tv/cards/TvListCover';
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
        <TvListCover coverUrl={props.item.vodPic} />
        <div class="min-w-0 flex-1 py-0.5">
          <h3 class={bookshelfRowTitleClass(false)}>{props.item.vodName || '未命名'}</h3>
          <Show when={meta().sourceLine}>
            <p class={bookshelfRowSubtitleClass(false)}>{meta().sourceLine}</p>
          </Show>
          <Show when={meta().playLine}>
            <p class={bookshelfRowSubtitleClass(false)}>{meta().playLine}</p>
          </Show>
        </div>
      </button>
      <Show when={props.trailing}>
        <div class="absolute right-1 top-1 z-2">{props.trailing}</div>
      </Show>
    </div>
  );
};
