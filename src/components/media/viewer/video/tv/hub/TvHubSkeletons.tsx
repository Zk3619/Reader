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
import {
  BANGUMI_RESPONSIVE_GAP_PX,
  resolveBangumiResponsiveColumnCount,
  type TvVodColumnStrategy,
} from '@/lib/media/tv/tv-vod-list-layout';
import { tvHubContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import { getTvHomeUi } from '@/stores/tv-hub/tv-home-ui';
import { cn } from '@/lib/utils';
import type { Accessor } from 'solid-js';

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
  /** 不传则使用影视首页布局 */
  layoutUi?: { viewMode: string; spacing: number } | (() => { viewMode: string; spacing: number });
  /** 与 TvVodVirtualList.columnStrategy 对齐 */
  columnStrategy?: TvVodColumnStrategy;
  /** 覆盖列数（container-responsive 未量到宽度前可传） */
  colCount?: number | Accessor<number>;
}

/** 点播网格骨架（首页 / 搜索 / 收藏加载中） */
export const TvVodGridSkeleton: Component<TvVodGridSkeletonProps> = (props) => {
  const layout = () => {
    if (props.layoutUi == null) return getTvHomeUi();
    return typeof props.layoutUi === 'function' ? props.layoutUi() : props.layoutUi;
  };
  const [root, setRoot] = createSignal<HTMLUListElement | undefined>();
  const [measuredWidth, setMeasuredWidth] = createSignal(0);

  createEffect(() => {
    const el = root();
    if (!el || typeof ResizeObserver === 'undefined') return;
    const apply = () => {
      const next = el.clientWidth;
      if (next > 0) setMeasuredWidth((prev) => (prev === next ? prev : next));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  });

  const cols = () => {
    if (props.colCount != null) {
      return typeof props.colCount === 'function' ? props.colCount() : props.colCount;
    }
    if (props.columnStrategy === 'container-responsive') {
      return resolveBangumiResponsiveColumnCount(measuredWidth());
    }
    return getViewModeGridColumnCount(
      layout().viewMode as import('@/lib/bookshelf/bookshelf-layout-settings').ViewMode,
    );
  };
  const items = () => Array.from({ length: props.count ?? Math.max(cols() * 3, 12) }, (_, i) => i);

  createEffect(() => {
    const el = root();
    if (!el) return;
    const gap =
      props.columnStrategy === 'container-responsive'
        ? `${BANGUMI_RESPONSIVE_GAP_PX / 16}rem`
        : bookshelfLayoutGapToRem(layout().spacing);
    el.style.setProperty('--bookshelf-layout-gap', gap);
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

/** 番剧放送时间表横向骨架 */
export function TvBangumiCarouselSkeleton(props: { class?: string; count?: number }) {
  const items = () => Array.from({ length: props.count ?? 8 }, (_, i) => i);
  return (
    <div
      class={cn('flex gap-2 overflow-hidden px-10', props.class)}
      aria-busy="true"
      aria-label="加载放送时间表"
    >
      <For each={items()}>
        {() => (
          <div class="w-[28%] shrink-0 sm:w-[22%] md:w-[16%] lg:w-[12%]">
            <VodGridCardSkeleton />
          </div>
        )}
      </For>
    </div>
  );
}

/** 详情页骨架：封面 + 简介 + 线路/集数占位 */
export function TvDetailSkeleton(props: { class?: string }) {
  return (
    <div
      class={cn('flex flex-col gap-4', props.class)}
      aria-busy="true"
      aria-label="加载影视详情"
    >
      <div class="flex gap-4">
        <Pulse class="h-40 w-28 shrink-0 rounded-md" />
        <div class="min-w-0 flex-1 space-y-2">
          <Pulse class="h-3.5 w-full" />
          <Pulse class="h-3.5 w-[92%]" />
          <Pulse class="h-3.5 w-[80%]" />
          <Pulse class="mt-3 h-3 w-2/3" />
          <Pulse class="h-3 w-1/2" />
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <For each={[0, 1, 2]}>
          {() => <Pulse class="h-8 w-16 rounded-md" />}
        </For>
      </div>
      <div class="flex flex-wrap gap-2">
        <For each={Array.from({ length: 12 }, (_, i) => i)}>
          {() => <Pulse class="h-8 w-14 rounded-md" />}
        </For>
      </div>
    </div>
  );
}
