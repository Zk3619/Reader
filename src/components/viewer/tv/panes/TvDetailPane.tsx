import { For, Show, createSignal, createEffect } from 'solid-js';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  mainShellPageScroll,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import {
  getTvDetailState,
  playCurrentEpisode,
  selectEpisode,
  selectFlag,
  toggleKeepCurrent,
  switchSourceAndPlay,
} from '@/stores/tv-hub/detail';
import { getTvHubState, setTvSection } from '@/stores/tv-hub/section';
import * as TvDao from '@/lib/media/tv/db/tv-dao';

export function TvDetailPane() {
  const state = getTvDetailState();
  const hub = getTvHubState();
  const flag = () => state.flags[state.flagIndex];
  const [kept, setKept] = createSignal(false);

  createEffect(() => {
    const vod = state.vod;
    const siteKey = hub.siteKey;
    if (!vod || !siteKey) {
      setKept(false);
      return;
    }
    const key = `${siteKey}$${vod.vod_id}`;
    void TvDao.listKeep().then((list) => setKept(list.some((k) => k.key === key)));
  });

  return (
    <section class="flex min-h-0 flex-1 flex-col">
      <PageToolbar
        class={pageToolbarBottomBorder}
        title={state.vod?.vod_name || '详情'}
        description={state.vod?.type_name || ''}
        leading={
          <Button type="button" variant="ghost" size="sm" onClick={() => setTvSection('home')}>
            返回
          </Button>
        }
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void switchSourceAndPlay()}
        >
          换源
        </Button>
        <Button
          type="button"
          variant={kept() ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            void toggleKeepCurrent().then(async () => {
              const vod = state.vod;
              const siteKey = hub.siteKey;
              if (!vod || !siteKey) return;
              const key = `${siteKey}$${vod.vod_id}`;
              const list = await TvDao.listKeep();
              setKept(list.some((k) => k.key === key));
            });
          }}
        >
          {kept() ? '已收藏' : '收藏'}
        </Button>
      </PageToolbar>
      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col gap-4 p-4')}>
        <Show when={state.loading}>
          <p class="text-sm text-muted-foreground">加载详情…</p>
        </Show>
        <Show when={state.error}>
          <p class="text-sm text-muted-foreground">{state.error}</p>
        </Show>
        <Show when={state.vod}>
          {(vod) => (
            <div class="flex gap-4">
              <div class="h-40 w-28 shrink-0 overflow-hidden rounded-md bg-muted">
                <Show when={vod().vod_pic}>
                  <img src={vod().vod_pic} alt="" class="h-full w-full object-cover" />
                </Show>
              </div>
              <div class="min-w-0 flex-1 space-y-2 text-sm">
                <p class="text-muted-foreground line-clamp-4">{vod().vod_content}</p>
                <Show when={vod().vod_actor}>
                  <p>演员：{vod().vod_actor}</p>
                </Show>
                <Show when={vod().vod_director}>
                  <p>导演：{vod().vod_director}</p>
                </Show>
              </div>
            </div>
          )}
        </Show>
        <div class="flex flex-wrap gap-2">
          <For each={state.flags}>
            {(f, i) => (
              <Button
                type="button"
                size="sm"
                variant={state.flagIndex === i() ? 'default' : 'outline'}
                onClick={() => selectFlag(i())}
              >
                {f.flag}
              </Button>
            )}
          </For>
        </div>
        <div class="flex flex-wrap gap-2">
          <For each={flag()?.episodes ?? []}>
            {(ep, i) => (
              <Button
                type="button"
                size="sm"
                variant={state.episodeIndex === i() ? 'secondary' : 'ghost'}
                onClick={() => {
                  selectEpisode(i());
                  void playCurrentEpisode();
                }}
              >
                {ep.name}
              </Button>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
