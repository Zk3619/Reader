/**
 * 聚合播放：播放器上的线路 / 解析 / 选集弹层
 * 样式对齐 Artplayer `.art-settings`（--art-widget-background 等）；宽屏右侧边栏
 */

import { For, Show, createEffect, onCleanup, type Accessor } from 'solid-js';
import { cn } from '@/lib/utils';
import * as VodConfig from '@/lib/media/tv/config/vod-config';
import { BANGUMI_SITE_KEY } from '@/lib/media/tv/types';
import {
  getTvDetailState,
  playCurrentEpisode,
  selectEpisode,
  selectFlagAndPlay,
  selectParseAndReplay,
} from '@/stores/tv-hub/detail';
import { getArtplayerIdleChrome } from '@/lib/media/video/artplayer/attach-idle-chrome';
export type TvPlayPlayerPanelKind = 'flag' | 'parse' | 'episode' | null;

const chipClass = (selected: boolean) =>
  cn(
    'rounded-[3px] px-2.5 py-1.5 text-xs font-medium transition-colors',
    selected
      ? 'bg-[var(--art-theme,#00a1d6)] text-white'
      : 'text-white/90 hover:bg-[var(--art-hover-color,rgba(255,255,255,0.25))]',
  );

export function TvPlayPlayerPanels(props: {
  panel: Accessor<TvPlayPlayerPanelKind>;
  onClose: () => void;
}) {
  const state = getTvDetailState();
  const isBangumi = () => state.vod?.siteKey === BANGUMI_SITE_KEY;
  const flag = () => state.flags[state.flagIndex];
  const parses = () => VodConfig.getParses();
  const kind = () => props.panel();
  const title = () =>
    kind() === 'flag' ? '线路' : kind() === 'parse' ? '解析' : '选集';

  createEffect(() => {
    if (!kind()) return;
    const idle = getArtplayerIdleChrome();
    if (!idle) return;
    idle.pin();
    idle.bump();
    onCleanup(() => idle.unpin());
  });

  return (
    <Show when={kind()}>
      <div
        class="reader-tv-play-player-panel-mask absolute inset-0 z-[80]"
        onClick={() => props.onClose()}
      >
        <div
          class={cn(
            'reader-tv-play-player-panel',
            // 窄屏：底部；宽屏：右侧（对齐 art-settings 的 right 停靠）
            'absolute flex flex-col overflow-hidden',
            'inset-x-[10px] bottom-[calc(var(--art-control-height,46px)+10px)] max-h-[min(52vh,var(--art-settings-max-height,300px))]',
            'md:inset-x-auto md:inset-y-[10px] md:right-[10px] md:bottom-[calc(var(--art-control-height,46px)+10px)] md:top-[52px]',
            'md:w-[min(320px,42vw)] md:max-h-none',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
            <p class="text-sm font-medium text-white">{title()}</p>
            <button
              type="button"
              class="rounded-[3px] px-2 py-1 text-xs text-white/80 hover:bg-[var(--art-hover-color,rgba(255,255,255,0.25))] hover:text-white"
              onClick={() => props.onClose()}
            >
              关闭
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
            <Show when={kind() === 'flag'}>
              <div class="flex flex-wrap gap-1.5">
                <For each={state.flags}>
                  {(f, i) => (
                    <button
                      type="button"
                      class={chipClass(state.flagIndex === i())}
                      onClick={() => {
                        void selectFlagAndPlay(i());
                        props.onClose();
                      }}
                    >
                      {f.flag}
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <Show when={kind() === 'parse' && !isBangumi()}>
              <div class="flex flex-wrap gap-1.5">
                <For each={parses()}>
                  {(p) => (
                    <button
                      type="button"
                      class={chipClass(state.parseName === p.name)}
                      onClick={() => {
                        void selectParseAndReplay(p.name);
                        props.onClose();
                      }}
                    >
                      {p.name}
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <Show when={kind() === 'episode'}>
              <div class="flex flex-wrap gap-1.5">
                <For each={flag()?.episodes ?? []}>
                  {(ep, i) => (
                    <button
                      type="button"
                      class={chipClass(state.episodeIndex === i())}
                      onClick={() => {
                        selectEpisode(i());
                        void playCurrentEpisode();
                        props.onClose();
                      }}
                    >
                      {ep.name}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
