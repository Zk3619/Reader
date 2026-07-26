/**
 * 影视全局迷你播放窗（主壳浮层）
 * 承接 TvPlayPane 离开后的同一 Artplayer 舞台，底栏三键 + 返回/关闭。
 * 控件：纯图标、无按钮底；仅悬停小窗时显示；可按住拖拽改位置。
 */

import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { Maximize2, Pause, Play, X } from 'lucide-solid';
import { cn } from '@/lib/utils';
import { APP_GLOBAL_MEDIA_PLAYER_OVER_VIEWER_Z } from '@/lib/ui/overlay-z';
import { attachTvPlayerStage } from '@/lib/media/tv/play/tv-player-runtime';
import {
  controlTvPlayer,
  subscribeTvPlayerPlaying,
  tvPlayerIsPlaying,
} from '@/lib/media/tv/play/player-bridge';
import {
  clampTvMiniPlayerPos,
  loadTvMiniPlayerPos,
  saveTvMiniPlayerPos,
  type TvMiniPlayerPos,
} from '@/lib/media/tv/play/tv-mini-player-pos';
import { lucideIconHtml } from '@/lib/media/video/artplayer/lucide-icons';
import {
  getTvDetailState,
  getCurrentEpisodeInfo,
  hasNextEpisode,
  hasPrevEpisode,
} from '@/stores/tv-hub/detail';
import { getLivePlayState } from '@/stores/tv-hub/live';
import { tvMiniPlayerState, tvMiniPlayerStore } from '@/stores/tv-mini-player';

const iconBtnClass =
  'reader-tv-mini-icon-btn inline-flex h-8 w-8 shrink-0 items-center justify-center bg-transparent p-0 text-white/85 shadow-none ring-0 outline-none transition-colors hover:bg-transparent hover:text-white focus-visible:bg-transparent focus-visible:text-white disabled:bg-transparent disabled:opacity-35';

const DRAG_THRESHOLD_PX = 5;

function stopArtplayerClick(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
  if ('stopImmediatePropagation' in e) {
    (e as Event & { stopImmediatePropagation: () => void }).stopImmediatePropagation();
  }
}

function canStartDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('button, a, input, textarea, select, [data-no-drag]')) {
    return false;
  }
  return true;
}

export function TvMiniPlayer() {
  const detail = getTvDetailState();
  const live = getLivePlayState();
  const [stageHost, setStageHost] = createSignal<HTMLDivElement>();
  const [shellEl, setShellEl] = createSignal<HTMLDivElement>();
  const [playing, setPlaying] = createSignal(tvPlayerIsPlaying());
  const [pos, setPos] = createSignal<TvMiniPlayerPos | null>(loadTvMiniPlayerPos());
  const [dragging, setDragging] = createSignal(false);

  const isLive = () => !!live.url && !detail.playUrl;
  const title = () => {
    if (isLive()) return live.name || '播放中';
    const name = (detail.vod?.vod_name || '').trim();
    const ep = (getCurrentEpisodeInfo().episode?.name || '').trim();
    if (name && ep) return `${name} · ${ep}`;
    return name || ep || '播放中';
  };
  const showEpisodeNav = () => !isLive() && (hasPrevEpisode() || hasNextEpisode());

  const reclampPos = () => {
    const el = shellEl();
    const cur = pos();
    if (!el || !cur) return;
    const next = clampTvMiniPlayerPos(
      cur.left,
      cur.top,
      el.offsetWidth || 320,
      el.offsetHeight || 180,
    );
    if (next.left !== cur.left || next.top !== cur.top) {
      setPos(next);
      saveTvMiniPlayerPos(next);
    }
  };

  createEffect(() => {
    if (!tvMiniPlayerState.active) return;
    const unsub = subscribeTvPlayerPlaying(() => setPlaying(tvPlayerIsPlaying()));
    setPlaying(tvPlayerIsPlaying());
    onCleanup(unsub);
  });

  createEffect(() => {
    if (!tvMiniPlayerState.active) return;
    const host = stageHost();
    if (!host) return;
    attachTvPlayerStage(host);
  });

  createEffect(() => {
    if (!tvMiniPlayerState.active) return;
    const el = shellEl();
    if (!el) return;
    reclampPos();
    const onResize = () => reclampPos();
    window.addEventListener('resize', onResize);
    onCleanup(() => window.removeEventListener('resize', onResize));
  });

  const onShellPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (!canStartDrag(e.target)) return;
    const el = shellEl();
    if (!el) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const rect = el.getBoundingClientRect();
    const originLeft = rect.left;
    const originTop = rect.top;
    let moved = false;
    let active = true;

    const onMove = (ev: PointerEvent) => {
      if (!active) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) {
          return;
        }
        moved = true;
        setDragging(true);
        try {
          el.setPointerCapture(ev.pointerId);
        } catch {
          /* */
        }
      }
      ev.preventDefault();
      ev.stopPropagation();
      const next = clampTvMiniPlayerPos(
        originLeft + dx,
        originTop + dy,
        el.offsetWidth || rect.width,
        el.offsetHeight || rect.height,
      );
      setPos(next);
    };

    const onUp = (ev: PointerEvent) => {
      if (!active) return;
      active = false;
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      try {
        if (el.hasPointerCapture(ev.pointerId)) {
          el.releasePointerCapture(ev.pointerId);
        }
      } catch {
        /* */
      }
      if (moved) {
        const cur = pos();
        if (cur) saveTvMiniPlayerPos(cur);
        // 拖拽结束：吞掉随后的 click，避免误触 Artplayer 播停
        const swallow = (ce: Event) => {
          ce.preventDefault();
          ce.stopPropagation();
        };
        el.addEventListener('click', swallow, { capture: true, once: true });
        window.setTimeout(() => {
          el.removeEventListener('click', swallow, true);
        }, 0);
      }
      setDragging(false);
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  };

  const shellStyle = (): Record<string, string> | undefined => {
    const p = pos();
    if (!p) return undefined;
    return {
      left: `${Math.round(p.left)}px`,
      top: `${Math.round(p.top)}px`,
      right: 'auto',
      bottom: 'auto',
    };
  };

  return (
    <Show when={tvMiniPlayerState.active}>
      <div
        ref={setShellEl}
        class={cn(
          'reader-tv-mini-player fixed flex w-[min(320px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-white/15',
          !pos() && 'bottom-4 right-4',
          dragging() ? 'cursor-grabbing is-dragging' : 'cursor-grab',
          APP_GLOBAL_MEDIA_PLAYER_OVER_VIEWER_Z,
        )}
        style={shellStyle()}
        role="complementary"
        aria-label="影视迷你播放器"
        onPointerDown={onShellPointerDown}
      >
        <div class="relative aspect-video w-full bg-black">
          <div
            ref={setStageHost}
            class="reader-tv-mini-stage absolute inset-0 overflow-hidden"
          />

          <div class="reader-tv-mini-ui absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-1 p-1.5">
            <button
              type="button"
              data-no-drag
              class={iconBtnClass}
              aria-label="返回播放页"
              title="返回播放页"
              onPointerDown={stopArtplayerClick}
              onClick={(e) => {
                stopArtplayerClick(e);
                tvMiniPlayerStore.backToPlayPage();
              }}
            >
              <Maximize2 class="h-4 w-4" />
            </button>
            <span
              class="min-w-0 flex-1 truncate px-1 pt-1.5 text-center text-[11px] font-medium leading-tight text-white/85"
              title={title()}
            >
              {title()}
            </span>
            <button
              type="button"
              data-no-drag
              class={iconBtnClass}
              aria-label="关闭"
              title="关闭"
              onPointerDown={stopArtplayerClick}
              onClick={(e) => {
                stopArtplayerClick(e);
                tvMiniPlayerStore.closeMini();
              }}
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <div class="reader-tv-mini-ui absolute inset-x-0 bottom-0 z-10 flex justify-center pb-2 pt-6">
            <div class="flex items-center gap-1 bg-transparent p-0" data-no-drag>
              <Show when={showEpisodeNav()}>
                <button
                  type="button"
                  data-no-drag
                  class={cn(iconBtnClass, 'h-9 w-9')}
                  aria-label="上一集"
                  title="上一集"
                  disabled={!hasPrevEpisode()}
                  onPointerDown={stopArtplayerClick}
                  onClick={(e) => {
                    stopArtplayerClick(e);
                    controlTvPlayer('prev');
                  }}
                  innerHTML={lucideIconHtml('skip-back', { size: 18, filled: true })}
                />
              </Show>
              <button
                type="button"
                data-no-drag
                class={cn(iconBtnClass, 'h-10 w-10')}
                aria-label={playing() ? '暂停' : '播放'}
                title={playing() ? '暂停' : '播放'}
                onPointerDown={stopArtplayerClick}
                onClick={(e) => {
                  stopArtplayerClick(e);
                  controlTvPlayer('toggle');
                }}
              >
                <Show when={playing()} fallback={<Play class="h-5 w-5" fill="currentColor" />}>
                  <Pause class="h-5 w-5" fill="currentColor" />
                </Show>
              </button>
              <Show when={showEpisodeNav()}>
                <button
                  type="button"
                  data-no-drag
                  class={cn(iconBtnClass, 'h-9 w-9')}
                  aria-label="下一集"
                  title="下一集"
                  disabled={!hasNextEpisode()}
                  onPointerDown={stopArtplayerClick}
                  onClick={(e) => {
                    stopArtplayerClick(e);
                    controlTvPlayer('next');
                  }}
                  innerHTML={lucideIconHtml('skip-forward', { size: 18, filled: true })}
                />
              </Show>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}
