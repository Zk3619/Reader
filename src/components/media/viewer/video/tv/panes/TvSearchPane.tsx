import { Show, createMemo, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { TvVodGridSkeleton } from '@/components/media/viewer/video/tv/hub/TvHubSkeletons';
import {
  TvVodVirtualList,
  type TvVodListItem,
} from '@/components/media/viewer/video/tv/cards/TvVodVirtualList';
import { tvHubPageContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import { shouldShowBlockingLoading } from '@/lib/media/audio/music-loading-ui';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { cn } from '@/lib/utils';
import { getTvSearchState, submitTvSearch, loadTvDetail } from '@/stores/tv-hub/detail';

export function TvSearchPane() {
  const state = getTvSearchState();
  const [q, setQ] = createSignal(state.keyword);

  const listItems = createMemo((): TvVodListItem[] =>
    state.list.map((vod) => ({
      key: `${vod.siteKey ?? ''}|${vod.vod_id}`,
      title: vod.vod_name,
      coverUrl: vod.vod_pic?.trim() || undefined,
      badge: vod.vod_remarks?.trim() || undefined,
      onOpen: () => void loadTvDetail(vod.siteKey || '', vod.vod_id),
    })),
  );

  const showList = () => !state.loading && state.list.length > 0;
  const showListSkeleton = useSkeletonLoading(() =>
    shouldShowBlockingLoading(state.loading, state.list.length),
  );

  return (
    <TvHubPageShell
      section="search"
      scrollClass={showList() || showListSkeleton() ? 'overflow-hidden' : undefined}
    >
      <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <form
          class={cn('flex shrink-0 gap-2 py-3', tvHubPageContentInsetClass)}
          onSubmit={(e) => {
            e.preventDefault();
            void submitTvSearch(q());
          }}
        >
          <input
            value={q()}
            onInput={(e) => setQ(e.currentTarget.value)}
            placeholder="输入片名"
            class="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
          />
          <Button type="submit" disabled={state.loading}>
            搜索
          </Button>
        </form>
        <Show when={state.error}>
          <p class={cn('shrink-0 text-sm text-muted-foreground', tvHubPageContentInsetClass)}>
            {state.error}
          </p>
        </Show>
        <Show when={showListSkeleton()}>
          <TvVodGridSkeleton class="min-h-0 flex-1 overflow-y-auto" />
        </Show>
        <Show when={showList()}>
          <TvVodVirtualList class="min-h-0 flex-1" items={listItems} />
        </Show>
      </div>
    </TvHubPageShell>
  );
}
