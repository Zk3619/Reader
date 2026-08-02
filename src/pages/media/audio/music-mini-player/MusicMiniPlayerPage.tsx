/**
 * 桌面迷你播放窗页面（#music-mini-player）
 *
 * 拖拽与滑动切歌手势由设置互斥启用（可都不选），避免同一套 pointer 事件互相抢占。
 * 拖拽使用 movementX/Y 累加 + set_bounds，避免 OS startDragging 触发 Windows Snap。
 * 双击（非播放按钮）唤起主程序并进入播放详情。
 *
 * 注意：本页勿从 useMusicHubPlayer 等重型模块静态导入，否则会把主窗依赖
 * （含 Node stream 等）打进迷你窗 bundle，导致手势逻辑异常。
 */

import {
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
  type Component,
} from 'solid-js';
import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { MusicCoverImg } from '@/components/media/viewer/audio/music/MusicCoverImg';
import {
  COMMAND_EVENT,
  UPDATE_EVENT,
  NATIVE_RESYNC_EVENT,
  clampMusicMiniPlayerToScreen,
  dismissMusicMiniPlayer,
  persistMusicMiniPlayerGeometry,
  setMusicMiniPlayerBounds,
  setMusicMiniPlayerBoundsForDrag,
  setMusicMiniPlayerEdgeCollapsed,
  finishMusicMiniPlayerDrag,
  setMusicMiniPlayerInteracting,
  syncMusicMiniPlayerNativeOptions,
  showMusicMiniPlayerWindowWhenReady,
  getMusicMiniPlayerPrepareShowEvent,
  notifyMusicMiniPlayerUiReady,
} from '@/lib/media/audio/music-mini-player-window';
import { currentLyricLine } from '@/lib/media/audio/current-lyric-line';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { formatMusicTime } from '@/lib/media/audio/track-types';
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
  lyric?: string;
  positionSec: number;
  durationSec: number;
  playing: boolean;
};

type EdgeSide = 'left' | 'right' | 'top' | 'bottom' | 'none';

type WinGeo = { x: number; y: number; w: number; h: number; scale: number };

const DRAG_SLOP_PX = 4;
const SWIPE_PX = 56;
/** 贴边收起/展开动画时长（与原生 EDGE_ANIM_MS 对齐，略加缓冲） */
const EDGE_ANIM_GUARD_MS = 320;

export const MusicMiniPlayerPage: Component = () => {
  const [payload, setPayload] = createSignal<MiniPayload | null>(null);
  const [edgeSide, setEdgeSide] = createSignal<EdgeSide>('none');
  const [dragging, setDragging] = createSignal(false);
  let shellEl: HTMLDivElement | undefined;
  let edgeCollapseTimer: ReturnType<typeof setTimeout> | undefined;
  let expandHover = false;
  let dockedSide: EdgeSide = 'none';
  let gestureActive = false;
  /** 收起/展开改尺寸时会误触发 mouseleave/enter，期间忽略悬停逻辑 */
  let edgeTransitioning = false;
  /** 预缓存窗口几何，避免 pointerdown 时异步未就绪导致拖不动 */
  let cachedGeo: WinGeo = {
    x: 0,
    y: 0,
    w: 380,
    h: 88,
    scale: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  };

  const send = async (action: string, extra?: Record<string, unknown>) => {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(COMMAND_EVENT, { action, ...extra });
  };

  const refreshGeo = async (): Promise<WinGeo> => {
    try {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const win = getCurrentWebviewWindow();
      const [pos, size, factor] = await Promise.all([
        win.outerPosition(),
        win.outerSize(),
        win.scaleFactor(),
      ]);
      cachedGeo = {
        x: pos.x,
        y: pos.y,
        w: size.width,
        h: size.height,
        scale: factor || 1,
      };
    } catch {
      /* keep cache */
    }
    return cachedGeo;
  };

  const metaLine = createMemo(() => {
    const p = payload();
    if (!p) return '';
    const title = p.title.trim() || '未知曲目';
    const artist = p.artist.trim();
    return artist ? `${title} - ${artist}` : title;
  });

  const lyricLine = createMemo(() => {
    const p = payload();
    if (!p) return '';
    return currentLyricLine(p.lyric ?? '', p.positionSec).trim();
  });

  const clearEdgeCollapseTimer = () => {
    if (!edgeCollapseTimer) return;
    clearTimeout(edgeCollapseTimer);
    edgeCollapseTimer = undefined;
  };

  const collapseToEdge = async (side: Exclude<EdgeSide, 'none'>) => {
    if (!getMusicSettings().miniModeEdgeAutoHide) return;
    edgeTransitioning = true;
    clearEdgeCollapseTimer();
    try {
      const ok = await setMusicMiniPlayerEdgeCollapsed(side);
      if (!ok) return;
      dockedSide = side;
      setEdgeSide(side);
      await refreshGeo();
    } finally {
      window.setTimeout(() => {
        edgeTransitioning = false;
      }, EDGE_ANIM_GUARD_MS);
    }
  };

  const expandFromEdge = async () => {
    if (edgeSide() === 'none') return;
    edgeTransitioning = true;
    clearEdgeCollapseTimer();
    try {
      const ok = await setMusicMiniPlayerEdgeCollapsed('none');
      if (!ok) return;
      // 等原生展开动画接近结束再切回完整 UI，避免细条里挤满控件
      await new Promise<void>((r) => window.setTimeout(r, EDGE_ANIM_GUARD_MS - 40));
      setEdgeSide('none');
      await refreshGeo();
    } finally {
      window.setTimeout(() => {
        edgeTransitioning = false;
      }, 80);
    }
  };

  const scheduleRedockIfNeeded = () => {
    clearEdgeCollapseTimer();
    if (!getMusicSettings().miniModeEdgeAutoHide) return;
    if (dockedSide === 'none') return;
    // 延时加长，避免 expand 改窗尺寸引发的瞬时 leave/enter 立刻再收起
    edgeCollapseTimer = setTimeout(() => {
      edgeCollapseTimer = undefined;
      if (edgeTransitioning || expandHover || dragging()) return;
      if (edgeSide() !== 'none') return;
      if (dockedSide !== 'none') {
        void collapseToEdge(dockedSide);
      }
    }, 900);
  };

  const createDragBoundsController = () => {
    let raf = 0;
    let pending: { x: number; y: number; width: number; height: number } | null = null;
    let inFlight = false;
    let generation = 0;
    let lastOutward = { left: 0, right: 0, pressLeft: false, pressRight: false };

    const noteOutwardFromApplied = (
      requestedX: number,
      appliedX: number,
    ) => {
      // 请求位置被夹在内侧时，差值即外推量
      lastOutward = {
        ...lastOutward,
        left: Math.max(lastOutward.left, Math.max(0, appliedX - requestedX)),
        right: Math.max(lastOutward.right, Math.max(0, requestedX - appliedX)),
      };
    };

    const sendBounds = async (
      next: { x: number; y: number; width: number; height: number },
      gen: number,
    ) => {
      try {
        if (gen !== generation) return;
        const result = await setMusicMiniPlayerBoundsForDrag(next);
        if (gen !== generation) return;
        if (result) {
          cachedGeo = {
            x: result.x,
            y: result.y,
            w: result.width,
            h: result.height,
            scale: cachedGeo.scale,
          };
          lastOutward = {
            left: Math.max(lastOutward.left, result.outwardLeft ?? 0),
            right: Math.max(lastOutward.right, result.outwardRight ?? 0),
            pressLeft: lastOutward.pressLeft || result.pressLeft === true,
            pressRight: lastOutward.pressRight || result.pressRight === true,
          };
          return;
        }
        // 回退：普通 set_bounds + 用实际落点推算外推量（贴边收起依赖此值）
        await setMusicMiniPlayerBounds(next);
        if (gen !== generation) return;
        const geo = await refreshGeo();
        if (gen !== generation) return;
        noteOutwardFromApplied(next.x, geo.x);
      } finally {
        if (gen === generation) {
          inFlight = false;
          if (pending) {
            const again = pending;
            pending = null;
            inFlight = true;
            void sendBounds(again, ++generation);
          }
        }
      }
    };

    return {
      queue(next: { x: number; y: number; width: number; height: number }) {
        pending = next;
        if (raf) return;
        raf = window.requestAnimationFrame(() => {
          raf = 0;
          if (!pending || inFlight) return;
          const nextFrame = pending;
          pending = null;
          inFlight = true;
          void sendBounds(nextFrame, ++generation);
        });
      },
      async flushNow() {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        if (pending) {
          const next = pending;
          pending = null;
          generation += 1;
          inFlight = true;
          await sendBounds(next, generation);
        }
        for (let i = 0; i < 30 && inFlight; i++) {
          await new Promise((r) => window.setTimeout(r, 8));
        }
        return lastOutward;
      },
    };
  };

  /** 仅播放控制钮排除手势；封面/标题区可拖 / 双击 */
  const isTransportControl = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return !!target.closest('[data-mini-transport]');
  };

  let lastEmptyUpAt = 0;

  let lastOpenAt = 0;
  const openMainPlayDetail = () => {
    const now = performance.now();
    // 拖拽模式 mouseup 双击检测与原生 dblclick 可能各发一次，合并
    if (now - lastOpenAt < 500) return;
    lastOpenAt = now;
    // 等待播放：只开主窗进音乐模块；有曲目再进播放详情
    void send('open', { idle: !payload() });
  };

  const tryOpenOnDoubleUp = () => {
    const now = performance.now();
    if (now - lastEmptyUpAt < 380) {
      lastEmptyUpAt = 0;
      openMainPlayDetail();
      return;
    }
    lastEmptyUpAt = now;
  };

  const onShellPointerDown = (e: MouseEvent) => {
    if (e.button !== 0 || gestureActive) return;
    if (isTransportControl(e.target)) return;

    const settings = getMusicSettings();
    const dragEnabled = settings.miniModeDragEnabled !== false;
    const gestureEnabled = settings.miniModeGestureEnabled === true;
    // 设置层已互斥；若异常同时为 true，优先拖拽
    const useDrag = dragEnabled;
    const useGesture = !dragEnabled && gestureEnabled;

    if (!useDrag && !useGesture) return;

    // 勿在此处 preventDefault：会打掉原生 dblclick，导致「双击打开详情」失效。
    // 禁选已由 select-none 处理；拖拽阈值后再进入 windowDrag。
    gestureActive = true;
    const isWin = navigator.userAgent.toLowerCase().includes('windows');
    const downClientX = e.clientX;
    const downClientY = e.clientY;
    const t0 = performance.now();
    let movedX = 0;
    let movedY = 0;
    let windowDrag = false;

    clearEdgeCollapseTimer();

    if (useGesture) {
      const onMove = (ev: MouseEvent) => {
        movedX += ev.movementX;
        movedY += ev.movementY;
      };
      const onUp = (ev: MouseEvent | PointerEvent) => {
        window.removeEventListener('mousemove', onMove, true);
        window.removeEventListener('mouseup', onUp, true);
        window.removeEventListener('pointerup', onUp, true);
        gestureActive = false;
        const clientDx = ev.clientX - downClientX;
        const clientDy = ev.clientY - downClientY;
        const dt = performance.now() - t0;
        const isFlick =
          edgeSide() === 'none' &&
          dt < 320 &&
          Math.abs(clientDx) >= SWIPE_PX &&
          Math.abs(clientDx) > Math.abs(clientDy) * 1.5;
        if (isFlick) {
          lastEmptyUpAt = 0;
          void send(clientDx < 0 ? 'next' : 'prev');
          return;
        }
        if (Math.hypot(movedX, movedY) < DRAG_SLOP_PX) {
          tryOpenOnDoubleUp();
        }
      };
      window.addEventListener('mousemove', onMove, true);
      window.addEventListener('mouseup', onUp, true);
      window.addEventListener('pointerup', onUp, true);
      return;
    }

    // —— 拖拽模式（不含滑动切歌）——
    let originX = cachedGeo.x;
    let originY = cachedGeo.y;
    let originW = cachedGeo.w || Math.round(window.innerWidth * (window.devicePixelRatio || 1));
    let originH = cachedGeo.h || Math.round(window.innerHeight * (window.devicePixelRatio || 1));
    let scale = cachedGeo.scale || window.devicePixelRatio || 1;
    let geoReady = false;
    const bounds = createDragBoundsController();
    // 尽早标记 interacting，重置原生外推累计，避免首帧后才 reset 把外推清掉
    void setMusicMiniPlayerInteracting(true);

    void (async () => {
      try {
        if (edgeSide() !== 'none') {
          await expandFromEdge();
        }
        const geo = await refreshGeo();
        originX = geo.x;
        originY = geo.y;
        originW = geo.w;
        originH = geo.h;
        scale = geo.scale;
        geoReady = true;
        if (windowDrag || movedX !== 0 || movedY !== 0) {
          bounds.queue({
            x: originX + Math.round(movedX * scale),
            y: originY + Math.round(movedY * scale),
            width: originW,
            height: originH,
          });
        }
        if (isWin) {
          try {
            const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            await getCurrentWebviewWindow().setResizable(false);
          } catch {
            /* ignore */
          }
        }
      } catch {
        geoReady = true;
      }
    })();

    const onMove = (ev: MouseEvent) => {
      movedX += ev.movementX;
      movedY += ev.movementY;
      if (!windowDrag) {
        if (Math.hypot(movedX, movedY) < DRAG_SLOP_PX) return;
        windowDrag = true;
        setDragging(true);
      }
      if (!geoReady) return;
      bounds.queue({
        x: originX + Math.round(movedX * scale),
        y: originY + Math.round(movedY * scale),
        width: originW,
        height: originH,
      });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      window.removeEventListener('pointerup', onUp, true);
      gestureActive = false;
      const wasWindowDrag = windowDrag;
      setDragging(false);

      if (!wasWindowDrag) {
        void setMusicMiniPlayerInteracting(false);
        tryOpenOnDoubleUp();
        return;
      }
      lastEmptyUpAt = 0;

      void (async () => {
        await bounds.flushNow();
        // 先用最终请求位移再补一帧，确保外推写入原生累计
        if (geoReady) {
          await setMusicMiniPlayerBoundsForDrag({
            x: originX + Math.round(movedX * scale),
            y: originY + Math.round(movedY * scale),
            width: originW,
            height: originH,
          });
        }
        if (isWin) {
          try {
            const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            await getCurrentWebviewWindow().setResizable(true);
          } catch {
            /* ignore */
          }
        }
        await setMusicMiniPlayerInteracting(false);

        // 统一由原生判定（内部已按 edgeAutoHide 门控 + 光标兜底）
        const side = await finishMusicMiniPlayerDrag();
        if (side === 'left' || side === 'right' || side === 'top' || side === 'bottom') {
          dockedSide = side;
          setEdgeSide(side);
          edgeTransitioning = true;
          window.setTimeout(() => {
            edgeTransitioning = false;
          }, EDGE_ANIM_GUARD_MS);
          void refreshGeo();
          return;
        }

        if (getMusicSettings().miniModeLockScreen) {
          await new Promise((r) => window.setTimeout(r, 48));
          if (dragging()) return;
          await clampMusicMiniPlayerToScreen();
        }
        dockedSide = 'none';
        await persistMusicMiniPlayerGeometry();
        void refreshGeo();
      })();
    };

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
    window.addEventListener('pointerup', onUp, true);
  };

  const onShellDblClick = (e: MouseEvent) => {
    if (isTransportControl(e.target)) return;
    e.preventDefault();
    openMainPlayDetail();
  };

  onMount(() => {
    document.documentElement.classList.add('music-mini-player');
    void syncMusicMiniPlayerNativeOptions();
    void refreshGeo();

    // 与设置中的贴边侧同步 UI（启动恢复后原生已收起，页面需显示细条）
    const savedSide = getMusicSettings().miniModeEdgeSide;
    if (
      getMusicSettings().miniModeEdgeAutoHide !== false &&
      (savedSide === 'left' ||
        savedSide === 'right' ||
        savedSide === 'top' ||
        savedSide === 'bottom')
    ) {
      dockedSide = savedSide;
      setEdgeSide(savedSide);
    }

    // 原生监听，避免 Solid 委托 / 子元素抢事件导致拖不动
    const el = shellEl;
    if (el) {
      el.addEventListener('mousedown', onShellPointerDown);
    }

    let unlistenUpdate: (() => void) | undefined;
    let unlistenResync: (() => void) | undefined;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;
    let unlistenPrepareShow: (() => void) | undefined;
    let persistTimer: ReturnType<typeof setTimeout> | undefined;
    const schedulePersist = () => {
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        if (edgeSide() !== 'none') return;
        void persistMusicMiniPlayerGeometry();
        void refreshGeo();
      }, 200);
    };
    void import('@tauri-apps/api/event').then(({ listen }) => {
      void listen(getMusicMiniPlayerPrepareShowEvent(), () => {
        void showMusicMiniPlayerWindowWhenReady().catch(() => undefined);
      }).then((fn) => {
        unlistenPrepareShow = fn;
        void notifyMusicMiniPlayerUiReady();
      });
      void listen<MiniPayload>(UPDATE_EVENT, (ev) => {
        if (ev.payload) setPayload(ev.payload);
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
      void win.onMoved(() => {
        if (dragging()) return;
        schedulePersist();
      }).then((fn) => {
        unlistenMoved = fn;
      });
      void win.onResized(() => schedulePersist()).then((fn) => {
        unlistenResized = fn;
      });
    });
    onCleanup(() => {
      el?.removeEventListener('mousedown', onShellPointerDown);
      unlistenUpdate?.();
      unlistenResync?.();
      unlistenMoved?.();
      unlistenResized?.();
      unlistenPrepareShow?.();
      if (persistTimer) clearTimeout(persistTimer);
      clearEdgeCollapseTimer();
      if (edgeSide() === 'none') void persistMusicMiniPlayerGeometry();
    });
  });

  const progress = () => {
    const p = payload();
    if (!p || p.durationSec <= 0) return 0;
    return Math.min(1, Math.max(0, p.positionSec / p.durationSec));
  };

  return (
    <div
      ref={(el) => {
        shellEl = el;
      }}
      class={cn(
        'music-mini-player-shell fixed inset-0 flex select-none items-stretch overflow-hidden touch-none',
        edgeSide() !== 'none' && 'music-mini-player-shell--edge',
        dragging()
          ? 'music-mini-player-shell--dragging cursor-grabbing'
          : getMusicSettings().miniModeDragEnabled !== false
            ? 'cursor-grab'
            : 'cursor-default',
      )}
      onDblClick={onShellDblClick}
      onMouseEnter={() => {
        if (edgeTransitioning) return;
        expandHover = true;
        clearEdgeCollapseTimer();
        if (edgeSide() !== 'none') void expandFromEdge();
      }}
      onMouseLeave={() => {
        if (edgeTransitioning) return;
        expandHover = false;
        if (!dragging()) scheduleRedockIfNeeded();
      }}
    >
      <Show
        when={edgeSide() === 'none'}
        fallback={
          /* 收起：仅主题色圆角条，无图标/进度等组件；高度随窗体 100% */
          <div
            class={cn(
              'music-mini-player-edge-tab h-full w-full',
              edgeSide() === 'left' && 'music-mini-player-edge-tab--left',
              edgeSide() === 'right' && 'music-mini-player-edge-tab--right',
              edgeSide() === 'top' && 'music-mini-player-edge-tab--top',
              edgeSide() === 'bottom' && 'music-mini-player-edge-tab--bottom',
            )}
            title="移入展开"
          />
        }
      >
        <div
          class={cn(
            mediaViewerChromeFloatingControlClass,
            'relative flex w-full items-center gap-2 rounded-xl px-2 py-1.5 shadow-lg',
          )}
        >
          <Show when={payload()} fallback={<span class="min-w-0 flex-1 text-xs text-muted-foreground">等待播放…</span>}>
            {(p) => (
              <>
                <div class="h-10 w-10 shrink-0 overflow-hidden rounded-md pointer-events-none">
                  <MusicCoverImg
                    src={p().coverUrl}
                    alt={p().title}
                    class="h-full w-full object-cover"
                  />
                </div>
                <div class="min-w-0 flex-1 text-left pointer-events-none">
                  <p class="truncate text-sm font-medium">{metaLine()}</p>
                  <p class="truncate text-xs text-muted-foreground">
                    {lyricLine() || '暂无歌词'}
                  </p>
                </div>
                <div
                  class="flex shrink-0 items-center gap-0.5"
                  data-mini-transport
                  onMouseDown={(e: MouseEvent) => e.stopPropagation()}
                >
                  <Button
                    size="icon"
                    variant="ghost"
                    class="h-8 w-8"
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      void send('prev');
                    }}
                  >
                    <SkipBack class="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="h-8 w-8"
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      void send(p().playing ? 'pause' : 'play');
                    }}
                  >
                    <Show when={p().playing} fallback={<Play class="h-4 w-4" />}>
                      <Pause class="h-4 w-4" />
                    </Show>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="h-8 w-8"
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      void send('next');
                    }}
                  >
                    <SkipForward class="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </Show>
          <Button
            size="icon"
            variant="ghost"
            class="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="关闭"
            data-mini-transport
            onMouseDown={(e: MouseEvent) => e.stopPropagation()}
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              // 临时关窗并停播，不改设置开关（对齐影视小窗关闭）
              void dismissMusicMiniPlayer();
            }}
          >
            <X class="h-3.5 w-3.5" />
          </Button>
          <div class="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 overflow-hidden rounded-full bg-muted/40">
            <div
              class="h-full bg-primary transition-[width]"
              style={{ width: `${progress() * 100}%` }}
            />
          </div>
        </div>
      </Show>
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
