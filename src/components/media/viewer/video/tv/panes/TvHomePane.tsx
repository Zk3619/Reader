/**
 * 影视首页：站点切换 / 分类 / 推荐列表
 */

import { Show, createEffect, createMemo, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationItems,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { TvVodGridSkeleton } from '@/components/media/viewer/video/tv/hub/TvHubSkeletons';
import {
  TvVodVirtualList,
  vodToListItem,
} from '@/components/media/viewer/video/tv/cards/TvVodVirtualList';
import {
  TvHomePaneBelow,
  TvHomePaneToolbar,
} from '@/components/media/viewer/video/tv/panes/TvHomePaneToolbar';
import { tvHubPageContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import { shouldShowBlockingLoading } from '@/lib/media/audio/music-loading-ui';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { scrollToTop } from '@/lib/ui/scroll-to-top';
import { settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';
import {
  getTvHomeState,
  goToCategoryPage,
  loadMoreCategory,
  TV_HOME_RECOMMEND_TID,
} from '@/stores/tv-hub/home';
import { getTvHomeUi } from '@/stores/tv-hub/tv-home-ui';
import { openTvVod } from '@/stores/tv-hub/detail';
import { setTvSection } from '@/stores/tv-hub/section';
import {
  tvCategoryHasNextPage,
  tvCategoryShowPager,
} from '@/lib/media/tv/tv-pagecount';

function TvHomeScrollFooter() {
  const ui = getTvHomeUi;
  const state = getTvHomeState;
  return (
    <Show when={ui().paginationPreference === 'scroll'}>
      <Show when={state().list.length > 0 && state().tid !== TV_HOME_RECOMMEND_TID}>
        <Show when={state().loadingMore}>
          <div class="py-4 text-center text-sm text-muted-foreground">加载中…</div>
        </Show>
        <Show when={!state().loadingMore && !state().hasMore}>
          <div class="py-4 text-center text-sm text-muted-foreground">没有更多了</div>
        </Show>
      </Show>
    </Show>
  );
}

function TvHomePaginationBar(props: { class?: string }) {
  const state = getTvHomeState;
  const ui = getTvHomeUi;

  const showBar = () =>
    ui().paginationPreference === 'pagination' &&
    state().tid !== TV_HOME_RECOMMEND_TID &&
    tvCategoryShowPager(state().page, state().pagecount, state().list.length);

  const canGoNext = () =>
    tvCategoryHasNextPage(state().page, state().pagecount, state().list.length);

  return (
    <Show when={showBar()}>
      <Show
        when={state().pagecount > 1}
        fallback={
          <div class={cn('flex items-center justify-center gap-2 py-3', props.class)}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={state().page <= 1 || state().loading || state().loadingMore}
              onClick={() => void goToCategoryPage(state().page - 1)}
            >
              上一页
            </Button>
            <span class="text-xs text-muted-foreground">第 {state().page} 页</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canGoNext() || state().loading || state().loadingMore}
              onClick={() => void goToCategoryPage(state().page + 1)}
            >
              下一页
            </Button>
          </div>
        }
      >
        <div class={cn('flex shrink-0 justify-center py-3', props.class)}>
          <Pagination
            count={state().pagecount}
            page={state().page}
            onPageChange={(page) => void goToCategoryPage(page)}
            disabled={state().loading || state().loadingMore}
            itemComponent={(itemProps) => (
              <PaginationItem page={itemProps.page}>{itemProps.page}</PaginationItem>
            )}
            ellipsisComponent={() => <PaginationEllipsis />}
          >
            <PaginationPrevious>上一页</PaginationPrevious>
            <PaginationItems />
            <PaginationNext>下一页</PaginationNext>
          </Pagination>
        </div>
      </Show>
    </Show>
  );
}

function TvHomeListFooter() {
  return (
    <>
      <TvHomeScrollFooter />
      <TvHomePaginationBar />
    </>
  );
}

function useTvHomeScrollLoad() {
  const ui = getTvHomeUi;
  const state = getTvHomeState;
  let lastScrollTop = 0;

  const handleScroll = (el: HTMLDivElement) => {
    const top = el.scrollTop;
    const moved = top !== lastScrollTop;
    lastScrollTop = top;
    if (ui().paginationPreference !== 'scroll') return;
    if (state().tid === TV_HOME_RECOMMEND_TID) return;
    if (!moved || state().loadingMore || !state().hasMore) return;
    const distanceToBottom = el.scrollHeight - top - el.clientHeight;
    if (distanceToBottom < 120) {
      void loadMoreCategory();
    }
  };

  return { handleScroll };
}

export function TvHomePane() {
  const state = getTvHomeState();
  const ui = getTvHomeUi;
  const { handleScroll } = useTvHomeScrollLoad();
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement | undefined>();

  const showBelow = () =>
    ui().siteControl === 'tabs' ||
    ui().classControl === 'stacked' ||
    ui().filterControl === 'stacked';

  const description = () => {
    if (state.preparing) return '正在准备…';
    if (!state.configUrl) return '请先在设置中导入配置';
    const site = state.sites.find((s) => s.key === state.siteKey);
    if (site?.name) return site.name;
    return state.configUrl;
  };

  const listItems = createMemo(() =>
    state.list.map((vod) =>
      vodToListItem(vod, state.siteKey, (v) =>
        void openTvVod(v, v.siteKey || state.siteKey),
      ),
    ),
  );

  const showList = () =>
    !!state.configUrl && !state.loading && state.list.length > 0;

  /** preparing（等 DB/配置）或首屏 Spider 加载：骨架；有旧列表时不挡 */
  const showListSkeleton = useSkeletonLoading(
    () =>
      state.preparing ||
      shouldShowBlockingLoading(state.loading, state.list.length) ||
      (!!state.configUrl && !state.homeLoaded && !state.error && state.list.length === 0),
  );

  /** 引导结束且确认无配置 */
  const showEmptyConfig = () =>
    !state.preparing && !state.loading && !state.configUrl && state.homeLoaded;

  createEffect(() => {
    const page = state.page;
    if (ui().paginationPreference !== 'pagination') return;
    const el = scrollEl();
    if (!el) return;
    void page;
    const reduceMotion = settingsStore.state.app.reduceMotion;
    requestAnimationFrame(() => {
      scrollToTop(el, { reduceMotion });
    });
  });

  return (
    <TvHubPageShell
      section="home"
      description={description()}
      toolbar={<TvHomePaneToolbar />}
      below={showBelow() ? <TvHomePaneBelow /> : undefined}
      belowHorizontalWheel={ui().siteControl === 'tabs'}
      scrollClass={showList() || showListSkeleton() ? 'overflow-hidden' : undefined}
    >
      <Show when={showEmptyConfig()}>
        <div
          class={cn(
            'flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-3 text-center',
            tvHubPageContentInsetClass,
          )}
        >
          <p class="text-sm text-muted-foreground">尚未导入 Vod 配置</p>
          <Button type="button" onClick={() => setTvSection('settings')}>
            去设置导入
          </Button>
        </div>
      </Show>

      <Show when={showListSkeleton()}>
        <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <TvVodGridSkeleton class="min-h-0 flex-1 overflow-y-auto" />
        </div>
      </Show>

      <Show when={!showListSkeleton() && !!state.configUrl && !showList()}>
        <div
          class={cn('flex min-h-0 flex-1 flex-col gap-3 py-3', tvHubPageContentInsetClass)}
        >
          <Show when={state.logoUrl || state.notice}>
            <div class="flex items-start gap-3 rounded-md bg-muted/50 px-3 py-2">
              <Show when={state.logoUrl}>
                <img
                  src={state.logoUrl}
                  alt=""
                  class="h-10 w-10 shrink-0 rounded object-contain"
                />
              </Show>
              <Show when={state.notice}>
                <p class="min-w-0 flex-1 text-sm text-muted-foreground">{state.notice}</p>
              </Show>
            </div>
          </Show>
          <Show when={state.error}>
            <p class="text-sm text-muted-foreground">{state.error}</p>
          </Show>
          <Show when={!state.loading && !state.list.length && !state.error}>
            <p class="text-sm text-muted-foreground">
              当前分类暂无内容，可切换站点或其它分类
            </p>
          </Show>
        </div>
      </Show>

      <Show when={showList()}>
        <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <Show when={state.notice || state.logoUrl || state.error}>
            <div class={cn('shrink-0 space-y-2 pt-2', tvHubPageContentInsetClass)}>
              <Show when={state.logoUrl || state.notice}>
                <div class="flex items-start gap-3 rounded-md bg-muted/50 px-3 py-2">
                  <Show when={state.logoUrl}>
                    <img
                      src={state.logoUrl}
                      alt=""
                      class="h-8 w-8 shrink-0 rounded object-contain"
                    />
                  </Show>
                  <Show when={state.notice}>
                    <p class="min-w-0 flex-1 text-sm text-muted-foreground">{state.notice}</p>
                  </Show>
                </div>
              </Show>
              <Show when={state.error}>
                <p class="text-sm text-muted-foreground">{state.error}</p>
              </Show>
            </div>
          </Show>
          <TvVodVirtualList
            class="min-h-0 flex-1 my-2"
            items={listItems}
            onScroll={handleScroll}
            onScrollContainer={setScrollEl}
            scrollFooter={<TvHomeListFooter />}
          />
        </div>
      </Show>
    </TvHubPageShell>
  );
}
