/**
 * 影视 Hub 骨架屏：竖版海报网格（对齐固定列数列表）
 */

import { For, createEffect, createSignal, onCleanup, type Component } from 'solid-js';
import {
  bookGroupGridCardClass,
  bookGroupGridCoverClass,
  exploreSkeletonPulseClass,
} from '@/lib/bookshelf/book-group-card-styles';
import {
  BOOKSHELF_LAYOUT_GAP_CLASS,
  bookshelfLayoutGapToRem,
} from '@/lib/bookshelf/bookshelf-layout-gap';
import { getViewModeGridColumnCount } from '@/lib/bookshelf/bookshelf-layout-settings';
import { tvHubContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import { getTvHomeUi } from '@/stores/tv-hub/tv-home-ui';
import { cn } from '@/lib/utils';

function Pulse(props: { class?: string; style?: Record<string, string> }) {
  return (
    <div class={cn(exploreSkeletonPulseClass, props.class)} style={props.style} aria-hidden />
  );
}

function VodGridCardSkeleton() {
  return (
    <div
      class={cn(bookGroupGridCardClass('overflow-hidden'), 'pointer-events-none w-full min-w-0')}
      aria-hidden
    >
      <Pulse class={bookGroupGridCoverClass('aspect-2/3')} />
      <div class="flex w-full flex-col items-center pt-0.5">
        <Pulse class="h-3.5 w-[85%]" />
      </div>
    </div>
  );
}

export interface TvVodGridSkeletonProps {
  count?: number;
  class?: string;
  listInnerClass?: string;
}

/** 点播网格骨架（首页 / 搜索 / 收藏加载中） */
export const TvVodGridSkeleton: Component<TvVodGridSkeletonProps> = (props) => {
  const ui = getTvHomeUi;
  const cols = () => getViewModeGridColumnCount(ui().viewMode);
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
        tvHubContentInsetClass,
        'grid px-2 pb-4 pt-1',
        BOOKSHELF_LAYOUT_GAP_CLASS,
        props.listInnerClass,
        props.class,
      )}
      style={{ 'grid-template-columns': `repeat(${cols()}, minmax(0, 1fr))` }}
      aria-busy="true"
      aria-label="加载影视列表"
    >
      <For each={items()}>
        {() => (
          <li class="min-w-0 list-none">
            <VodGridCardSkeleton />
          </li>
        )}
      </For>
    </ul>
  );
};
