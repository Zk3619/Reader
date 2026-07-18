import { For, Show, createResource, createSignal, createEffect } from 'solid-js';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  mainShellPageScroll,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import * as LiveApi from '@/lib/media/tv/live-api';
import { setTvSection } from '@/stores/tv-hub/section';
import { createStore } from 'solid-js/store';
import {
  currentProgramme,
  formatProgramme,
  loadEpg,
  type EpgProgramme,
} from '@/lib/media/tv/live/epg';
import {
  catchupFromChannelAttrs,
  formatCatchupUrl,
} from '@/lib/media/tv/live/catchup';

const [livePlay, setLivePlay] = createStore({ url: '', name: '', epgText: '' });

export function getLivePlayState() {
  return livePlay;
}

export function setLivePlayState(partial: { url?: string; name?: string; epgText?: string }) {
  setLivePlay(partial);
}

export function TvLivePane() {
  const [data] = createResource(async () => LiveApi.loadLive());
  const [epg, setEpg] = createSignal<EpgProgramme[]>([]);
  const [nowPlaying, setNowPlaying] = createSignal('');

  createEffect(() => {
    const d = data();
    const url = d?.source?.epg;
    if (!url) return;
    void loadEpg(url).then(setEpg);
  });

  const playChannel = (ch: {
    name: string;
    urls: string[];
    tvgId?: string;
    catchup?: string;
    catchupSource?: string;
  }, useCatchup: boolean) => {
    const liveUrl = ch.urls[0] ?? '';
    const p = currentProgramme(epg(), ch.tvgId || ch.name);
    let url = liveUrl;
    if (useCatchup && p) {
      const spec = catchupFromChannelAttrs(ch.catchup, ch.catchupSource);
      if (spec?.source) {
        url = formatCatchupUrl(liveUrl, p, spec);
      }
    }
    const epgText = formatProgramme(p);
    setNowPlaying(`${ch.name} · ${epgText}${useCatchup ? '（回看）' : ''}`);
    setLivePlay({ name: ch.name, url, epgText });
    setTvSection('play');
  };

  return (
    <section class="flex min-h-0 flex-1 flex-col">
      <PageToolbar class={pageToolbarBottomBorder} title="直播" description="M3U / TXT / JSON · EPG · 回看" />
      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col gap-3 p-4')}>
        <Show when={nowPlaying()}>
          <p class="rounded-md bg-muted/40 px-3 py-2 text-sm">{nowPlaying()}</p>
        </Show>
        <Show when={data.loading}>
          <p class="text-sm text-muted-foreground">加载直播源…</p>
        </Show>
        <Show when={data.error}>
          <p class="text-sm text-destructive">加载失败（请先导入含 lives 的配置）</p>
        </Show>
        <Show when={data()}>
          {(d) => (
            <>
              <p class="text-xs text-muted-foreground">
                源：{d().source.name} · {d().channels.length} 频道
                {epg().length ? ` · EPG ${epg().length} 条` : ''}
              </p>
              <For each={d().groups}>
                {(g) => (
                  <div class="space-y-2">
                    <h3 class="text-sm font-semibold">{g.name}</h3>
                    <div class="flex flex-wrap gap-2">
                      <For each={g.channel}>
                        {(ch) => {
                          const prog = () =>
                            currentProgramme(epg(), ch.tvgId || ch.name);
                          const canCatchup = () =>
                            !!(ch.catchupSource || ch.catchup) && !!prog();
                          return (
                            <div class="flex flex-col gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                class="flex h-auto flex-col items-start gap-0.5 py-1.5"
                                onClick={() => playChannel(ch, false)}
                              >
                                <span>{ch.name}</span>
                                <Show when={prog()}>
                                  <span class="max-w-40 truncate text-[10px] font-normal text-muted-foreground">
                                    {formatProgramme(prog())}
                                  </span>
                                </Show>
                              </Button>
                              <Show when={canCatchup()}>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  class="h-7 text-xs"
                                  onClick={() => playChannel(ch, true)}
                                >
                                  回看
                                </Button>
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                )}
              </For>
            </>
          )}
        </Show>
      </div>
    </section>
  );
}
