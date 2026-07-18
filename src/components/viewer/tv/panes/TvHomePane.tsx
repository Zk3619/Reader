/**
 * 影视首页：站点切换 / 分类 / 推荐列表
 */

import { For, Show, createEffect } from 'solid-js';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  mainShellPageScroll,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import {
  getTvHomeState,
  loadCategory,
  loadHome,
  switchSite,
  setFilterValue,
} from '@/stores/tv-hub/home';
import { loadTvDetail } from '@/stores/tv-hub/detail';
import { setTvSection } from '@/stores/tv-hub/section';

export function TvHomePane() {
  const state = getTvHomeState();

  createEffect(() => {
    // 仅兜底：有配置、尚未完成过首页拉取、且当前不在加载中
    // 不可用「list 为空」作条件，否则 JAR 空首页 / 失败后会无限重载
    if (state.configUrl && !state.homeLoaded && !state.loading) {
      void loadHome();
    }
  });

  return (
    <section class="flex min-h-0 flex-1 flex-col">
      <PageToolbar
        class={pageToolbarBottomBorder}
        title="影视"
        description={state.configUrl || '请先在设置中导入配置'}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setTvSection('settings')}
        >
          设置
        </Button>
      </PageToolbar>
      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col gap-3 p-4')}>
        <Show when={state.notice}>
          <p class="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {state.notice}
          </p>
        </Show>
        <Show when={state.error}>
          <p class="text-sm text-destructive">{state.error}</p>
        </Show>
        <Show when={!state.configUrl}>
          <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p class="text-sm text-muted-foreground">尚未导入 Vod 配置</p>
            <Button type="button" onClick={() => setTvSection('settings')}>
              去设置导入
            </Button>
          </div>
        </Show>
        <Show when={state.configUrl}>
          <div class="flex flex-wrap gap-2">
            <For each={state.sites}>
              {(site) => (
                <Button
                  type="button"
                  size="sm"
                  variant={state.siteKey === site.key ? 'default' : 'outline'}
                  onClick={() => switchSite(site.key)}
                >
                  {site.name}
                </Button>
              )}
            </For>
          </div>
          <div class="flex flex-wrap gap-2">
            <For each={state.classes}>
              {(c) => (
                <Button
                  type="button"
                  size="sm"
                  variant={state.tid === c.type_id ? 'secondary' : 'ghost'}
                  onClick={() => void loadCategory(c.type_id, 1)}
                >
                  {c.type_name}
                </Button>
              )}
            </For>
          </div>
          <Show when={Object.keys(state.filters).length}>
            <div class="flex flex-col gap-2">
              <For each={Object.entries(state.filters)}>
                {([fkey, opts]) => (
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-xs text-muted-foreground w-16 shrink-0">{fkey}</span>
                    <For each={opts}>
                      {(opt) => (
                        <Button
                          type="button"
                          size="sm"
                          variant={state.extend[fkey] === opt.v ? 'default' : 'outline'}
                          onClick={() =>
                            setFilterValue(
                              fkey,
                              state.extend[fkey] === opt.v ? '' : opt.v,
                            )
                          }
                        >
                          {opt.n}
                        </Button>
                      )}
                    </For>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <Show when={state.loading}>
            <p class="text-sm text-muted-foreground">加载中…</p>
          </Show>
          <Show when={!state.loading && !state.list.length && !state.error}>
            <p class="text-sm text-muted-foreground">
              当前站点暂无推荐内容，可切换站点或打开分类浏览
            </p>
          </Show>
          <Show when={!state.loading && state.error}>
            <div class="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void loadHome()}>
                重试加载
              </Button>
            </div>
          </Show>
          <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            <For each={state.list}>
              {(vod) => (
                <button
                  type="button"
                  class="group flex flex-col gap-1 text-left"
                  onClick={() =>
                    void loadTvDetail(vod.siteKey || state.siteKey, vod.vod_id)
                  }
                >
                  <div class="aspect-2/3 overflow-hidden rounded-md bg-muted">
                    <Show when={vod.vod_pic} fallback={<div class="h-full w-full" />}>
                      <img
                        src={vod.vod_pic}
                        alt=""
                        class="h-full w-full object-cover transition group-hover:scale-105"
                        loading="lazy"
                      />
                    </Show>
                  </div>
                  <span class="line-clamp-2 text-xs font-medium">{vod.vod_name}</span>
                  <Show when={vod.vod_remarks}>
                    <span class="text-[10px] text-muted-foreground">{vod.vod_remarks}</span>
                  </Show>
                </button>
              )}
            </For>
          </div>
          <Show when={state.pagecount > 1}>
            <div class="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={state.page <= 1}
                onClick={() => void loadCategory(state.tid, state.page - 1)}
              >
                上一页
              </Button>
              <span class="text-xs text-muted-foreground">
                {state.page} / {state.pagecount}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={state.page >= state.pagecount}
                onClick={() => void loadCategory(state.tid, state.page + 1)}
              >
                下一页
              </Button>
            </div>
          </Show>
        </Show>
      </div>
    </section>
  );
}
