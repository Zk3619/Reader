/**
 * 桌面迷你播放窗页面（#music-mini-player）
 */

import {
  createSignal,
  onCleanup,
  onMount,
  Show,
  type Component,
} from 'solid-js';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { MusicCoverImg } from '@/components/media/viewer/audio/music/MusicCoverImg';
import {
  COMMAND_EVENT,
  UPDATE_EVENT,
  NATIVE_RESYNC_EVENT,
  persistMusicMiniPlayerGeometry,
  syncMusicMiniPlayerNativeOptions,
} from '@/lib/media/audio/music-mini-player-window';
import { formatMusicTime } from '@/components/media/viewer/audio/music/hub/useMusicHubPlayer';
import { mediaViewerChromeFloatingControlClass } from '@/components/media/viewer/viewer-chrome';
import { cn } from '@/lib/utils';

if (typeof document !== 'undefined' && window.location.hash === '#music-mini-player') {
  document.documentElement.classList.add('music-mini-player');
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
}

type MiniPayload = {
  title: string;
  artist: string;
  coverUrl?: string;
  positionSec: number;
  durationSec: number;
  playing: boolean;
};

export const MusicMiniPlayerPage: Component = () => {
  const [payload, setPayload] = createSignal<MiniPayload | null>(null);
  let swipeStartX = 0;
  let swipeTracking = false;

  const send = async (action: string) => {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(COMMAND_EVENT, { action });
  };

  const onSwipePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    swipeStartX = e.clientX;
    swipeTracking = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onSwipePointerUp = (e: PointerEvent) => {
    if (!swipeTracking) return;
    swipeTracking = false;
    const dx = e.clientX - swipeStartX;
    if (Math.abs(dx) < 56) return;
    // 左滑下一首，右滑上一首
    void send(dx < 0 ? 'next' : 'prev');
  };

  onMount(() => {
    document.documentElement.classList.add('music-mini-player');
    void syncMusicMiniPlayerNativeOptions();
    let unlistenUpdate: (() => void) | undefined;
    let unlistenResync: (() => void) | undefined;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;
    let persistTimer: ReturnType<typeof setTimeout> | undefined;
    const schedulePersist = () => {
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        void persistMusicMiniPlayerGeometry();
      }, 200);
    };
    void import('@tauri-apps/api/event').then(({ listen }) => {
      void listen<MiniPayload>(UPDATE_EVENT, (e) => {
        if (e.payload) setPayload(e.payload);
      }).then((fn) => {
        unlistenUpdate = fn;
      });
      void listen(NATIVE_RESYNC_EVENT, () => {
        void syncMusicMiniPlayerNativeOptions();
      }).then((fn) => {
        unlistenResync = fn;
      });
    });
    void import('@tauri-apps/api/webviewWindow').then(({ getCurrentWebviewWindow }) => {
      const win = getCurrentWebviewWindow();
      void win.onMoved(() => schedulePersist()).then((fn) => {
        unlistenMoved = fn;
      });
      void win.onResized(() => schedulePersist()).then((fn) => {
        unlistenResized = fn;
      });
    });
    onCleanup(() => {
      unlistenUpdate?.();
      unlistenResync?.();
      unlistenMoved?.();
      unlistenResized?.();
      if (persistTimer) clearTimeout(persistTimer);
      void persistMusicMiniPlayerGeometry();
    });
  });

  const progress = () => {
    const p = payload();
    if (!p || p.durationSec <= 0) return 0;
    return Math.min(1, Math.max(0, p.positionSec / p.durationSec));
  };

  return (
    <div
      class="music-mini-player-shell fixed inset-0 flex select-none items-stretch overflow-hidden p-1"
      data-tauri-drag-region
    >
      <div
        class={cn(
          mediaViewerChromeFloatingControlClass,
          'flex w-full items-center gap-2 px-2 py-1.5 shadow-lg',
        )}
      >
        <Show when={payload()} fallback={<span class="text-xs text-muted-foreground">等待播放…</span>}>
          {(p) => (
            <>
              <button
                type="button"
                class="h-10 w-10 shrink-0 overflow-hidden rounded-md"
                onClick={() => void send('open')}
              >
                <MusicCoverImg
                  src={p().coverUrl}
                  alt={p().title}
                  class="h-full w-full object-cover"
                />
              </button>
              <button
                type="button"
                class="min-w-0 flex-1 touch-pan-y text-left"
                onClick={() => void send('open')}
                onPointerDown={onSwipePointerDown}
                onPointerUp={onSwipePointerUp}
                onPointerCancel={() => {
                  swipeTracking = false;
                }}
              >
                <p class="truncate text-sm font-medium">{p().title}</p>
                <p class="truncate text-xs text-muted-foreground">{p().artist}</p>
              </button>
              <div class="flex shrink-0 items-center gap-0.5">
                <Button size="icon" variant="ghost" class="h-8 w-8" onClick={() => void send('prev')}>
                  <SkipBack class="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  class="h-8 w-8"
                  onClick={() => void send(p().playing ? 'pause' : 'play')}
                >
                  <Show when={p().playing} fallback={<Play class="h-4 w-4" />}>
                    <Pause class="h-4 w-4" />
                  </Show>
                </Button>
                <Button size="icon" variant="ghost" class="h-8 w-8" onClick={() => void send('next')}>
                  <SkipForward class="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </Show>
        <div class="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 overflow-hidden rounded-full bg-muted/40">
          <div
            class="h-full bg-primary transition-[width]"
            style={{ width: `${progress() * 100}%` }}
          />
        </div>
      </div>
      <Show when={payload()}>
        {(p) => (
          <span class="sr-only">
            {formatMusicTime(p().positionSec)} / {formatMusicTime(p().durationSec)}
          </span>
        )}
      </Show>
    </div>
  );
};
