/**
 * 影视点播卡片：竖版海报网格（桌面/移动同款）
 */

import { Show, createSignal, createEffect, type Component, type JSX } from 'solid-js';
import { TvTabIcon } from '@/components/shared/icons';
import { bookGroupCardPressHandlers } from '@/lib/bookshelf/book-group-card-press';
import {
  bookGroupGridCardClass,
  bookGroupGridCoverClass,
  bookGroupGridCoverZoomClass,
  bookGroupGridTitleClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { cn } from '@/lib/utils';

export interface TvVodCardProps {
  title: string;
  coverUrl?: string;
  /** 封面角标（如更新集数）；无数据不显示 */
  badge?: string;
  onOpen: () => void;
  class?: string;
  /** 叠在卡片上的额外操作（如取消收藏） */
  trailing?: JSX.Element;
}

function VodCoverFallback(props: { iconClass?: string }) {
  return (
    <div class="flex h-full w-full items-center justify-center bg-muted/40 text-muted-foreground">
      <TvTabIcon class={props.iconClass ?? 'h-8 w-8 opacity-40'} />
    </div>
  );
}

function VodCoverImage(props: { coverUrl?: string; iconClass?: string }) {
  const [failed, setFailed] = createSignal(false);

  createEffect(() => {
    props.coverUrl;
    setFailed(false);
  });

  const showImage = () => !!props.coverUrl?.trim() && !failed();

  return (
    <Show when={showImage()} fallback={<VodCoverFallback iconClass={props.iconClass} />}>
      <img
        src={props.coverUrl}
        alt=""
        class="h-full w-full object-cover"
        loading="lazy"
        draggable={false}
        onError={() => setFailed(true)}
      />
    </Show>
  );
}

export const TvVodCard: Component<TvVodCardProps> = (props) => {
  return (
    <div class={cn('relative h-full w-full min-w-0', props.class)}>
      <button
        type="button"
        class={bookGroupGridCardClass('h-full w-full min-w-0 cursor-pointer overflow-hidden text-left')}
        onClick={props.onOpen}
        {...bookGroupCardPressHandlers}
      >
        <div class={bookGroupGridCoverClass('aspect-2/3')}>
          <div class={bookGroupGridCoverZoomClass()}>
            <VodCoverImage coverUrl={props.coverUrl} />
          </div>
          <Show when={props.badge?.trim()}>
            <span class="absolute right-1 top-1 z-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-black/55 px-1 py-0.5 text-[10px] text-white">
              {props.badge}
            </span>
          </Show>
        </div>
        <div class="flex w-full flex-col items-center pt-0.5">
          <h3 class={bookGroupGridTitleClass()}>{props.title}</h3>
        </div>
      </button>
      <Show when={props.trailing}>
        <div class="absolute left-0.5 top-0.5 z-2">{props.trailing}</div>
      </Show>
    </div>
  );
};
