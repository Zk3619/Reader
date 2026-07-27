/**
 * 影视点播卡片：竖版海报网格（桌面/移动同款）
 */

import { For, Show, createSignal, createEffect, type Component, type JSX } from 'solid-js';
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
  /** 封面角标（单条，如首页 remarks）；与 badges 同时存在时优先 badges */
  badge?: string;
  /** 多条角标（按信息拆分，如站点 / 线路 / 集数） */
  badges?: string[];
  onOpen: () => void;
  class?: string;
  /** 叠在卡片上的额外操作（如取消收藏） */
  trailing?: JSX.Element;
  /** 叠在封面容器底部的操作按钮 */
  coverActions?: JSX.Element;
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

const badgeChipClass =
  'max-w-full truncate rounded bg-black/55 px-1 py-0.5 text-[10px] leading-tight text-white';

export const TvVodCard: Component<TvVodCardProps> = (props) => {
  const badgeList = () => {
    const multi = (props.badges ?? []).map((b) => b.trim()).filter(Boolean);
    if (multi.length) return multi;
    const single = props.badge?.trim();
    return single ? [single] : [];
  };

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
          <Show when={badgeList().length > 0}>
            <div class="absolute right-1 top-1 z-1 flex max-w-[calc(100%-0.5rem)] flex-col items-end gap-0.5">
              <For each={badgeList()}>{(text) => <span class={badgeChipClass}>{text}</span>}</For>
            </div>
          </Show>
        </div>
        <div class="flex w-full flex-col items-center pt-0.5">
          <h3 class={bookGroupGridTitleClass()}>{props.title}</h3>
        </div>
      </button>
      {/* 与封面同宽同比例定位，避免操作按钮嵌套在 card button 内 */}
      <Show when={props.coverActions}>
        <div class="pointer-events-none absolute inset-x-1 top-1 z-2">
          <div class="relative aspect-2/3 w-full overflow-hidden rounded-lg">
            <div class="pointer-events-auto absolute inset-x-0 bottom-0 flex w-full items-center justify-center bg-linear-to-t from-black/75 via-black/40 to-transparent px-0.5 pb-1 pt-5">
              {props.coverActions}
            </div>
          </div>
        </div>
      </Show>
      <Show when={props.trailing}>
        <div class="absolute left-0.5 top-0.5 z-2">{props.trailing}</div>
      </Show>
    </div>
  );
};
