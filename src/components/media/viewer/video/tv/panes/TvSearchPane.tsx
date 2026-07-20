import { Show, createMemo } from 'solid-js';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { TvVodGridSkeleton } from '@/components/media/viewer/video/tv/hub/TvHubSkeletons';
import {
  TvVodVirtualList,
  type TvVodListItem,
} from '@/components/media/viewer/video/tv/cards/TvVodVirtualList';
import { TvSearchPaneToolbar } from '@/components/media/viewer/video/tv/panes/TvSearchPaneToolbar';
import { tvHubPageContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import { shouldShowBlockingLoading } from '@/lib/media/audio/music-loading-ui';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { cn } from '@/lib/utils';
import { getTvSearchState, openTvVod } from '@/stores/tv-hub/detail';

export function TvSearchPane() {
  const state = getTvSearchState();

  const listItems = createMemo((): TvVodListItem[] =>
    state.list.map((vod) => ({
      key: `${vod.siteKey ?? ''}|${vod.vod_id}`,
      title: vod.vod_name,
      coverUrl: vod.vod_pic?.trim() || undefined,
      badge: vod.vod_remarks?.trim() || undefined,
      onOpen: () => void openTvVod(vod, vod.siteKey || ''),
    })),
  );

  const showList = () => !state.loading && state.list.length > 0;
  const showListSkeleton = useSkeletonLoading(() =>
    shouldShowBlockingLoading(state.loading, state.list.length),
  );
  const showEmptyFilter = () =>
    !state.loading && !state.error && state.rawList.length > 0 && state.list.length === 0;
  const showWelcome = () =>
    !state.loading && !state.error && state.rawList.length === 0 && !state.keyword.trim();

  return (
    <TvHubPageShell
      section="search"
      toolbar={<TvSearchPaneToolbar />}
      scrollClass={showList() || showListSkeleton() ? 'overflow-hidden' : undefined}
    >
      <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <Show when={state.error}>
          <p class={cn('shrink-0 py-3 text-sm text-muted-foreground', tvHubPageContentInsetClass)}>
            {state.error}
          </p>
        </Show>
        <Show when={showWelcome()}>
          <div class="flex flex-1 items-center justify-center py-16">
            <p class="text-center text-2xl text-muted-foreground">搜我所想~~</p>
          </div>
        </Show>
        <Show when={showListSkeleton()}>
          <TvVodGridSkeleton class="min-h-0 flex-1 overflow-y-auto" />
        </Show>
        <Show when={showList()}>
          <TvVodVirtualList class="min-h-0 flex-1" items={listItems} />
        </Show>
        <Show when={showEmptyFilter()}>
          <p class={cn('shrink-0 py-6 text-sm text-muted-foreground', tvHubPageContentInsetClass)}>
            当前过滤模式下无匹配结果，可切换为「常规搜索」查看全部
          </p>
        </Show>
      </div>
    </TvHubPageShell>
  );
}
