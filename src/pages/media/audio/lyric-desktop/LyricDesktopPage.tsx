/**
 * 桌面悬浮歌词页（Tauri 第二窗口加载 #lyric-desktop）
 * 对齐 LX：透明底、screen 坐标拖/缩、边缘缩放、开窗主动拉歌词
 */

import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type Component,
} from 'solid-js';
import { AudioLyricPanel } from '@/components/media/viewer/audio/AudioLyricPanel';
import {
  getMusicSettings,
  setMusicSettings,
  subscribeMusicSettings,
  applyRemoteMusicSettings,
} from '@/lib/media/audio/music-settings';
import {
  musicLyricOffsetTrackKey,
  resolveEffectiveLyricOffsetSec,
} from '@/lib/media/audio/music-lyric-offset';
import {
  notifyDesktopLyricWindowClosed,
  persistDesktopLyricGeometry,
  clampDesktopLyricToScreen,
} from '@/lib/media/audio/desktop-lyric-window';
import { buildLyricTextEffectStyle } from '@/lib/media/audio/lyric-text-shadow';
import { isTauri } from '@/lib/platform/detect';
import type { LyricBundle, LyricTrackKind } from '@/lib/media/audio/lyric-types';
import { resolveEffectiveLyricTrack } from '@/lib/media/audio/lyric-types';
import { getMusicPlayConfig } from '@/lib/media/audio/music-play-config';
import { AudioPlayMode } from '@/lib/media/audio/types';
import { ThemeTargetHost } from '@/components/theme/ThemeTargetHost';
import { LyricDesktopControlBar } from '@/pages/media/audio/lyric-desktop/LyricDesktopControlBar';
import { DESKTOP_LYRIC_MIN_WIDTH_PX } from '@/lib/media/audio/desktop-lyric-control-bar';
import { MusicAudioVisualizer } from '@/components/media/viewer/audio/music/hub/MusicAudioVisualizer';
import { settingsStore } from '@/stores/settings';

type ResizeOrigin =
  | 'left'
  | 'top'
  | 'right'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

const RESIZE_ORIGINS: ResizeOrigin[] = [
  'left',
  'top',
  'right',
  'bottom',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

// 尽早透明，避免首帧白底闪一下
if (typeof document !== 'undefined' && window.location.hash === '#lyric-desktop') {
  document.documentElement.classList.add('lyric-desktop');
  document.documentElement.style.background = 'transparent';
  if (document.body) document.body.style.background = 'transparent';
}

/** desktopLyricFontSize 存的是 px；AudioLyricPanel 按 rem 消费 */
function desktopLyricFontRem(px: number | undefined): number {
  return Math.max(0.75, (px ?? 20) / 16);
}

// 尽早缓存 invoke，避免拖拽/缩放时每帧动态 import
let cachedInvoke: typeof import('@tauri-apps/api/core').invoke | null = null;
async function getInvoke() {
  if (!cachedInvoke) {
    const mod = await import('@tauri-apps/api/core');
    cachedInvoke = mod.invoke;
  }
  return cachedInvoke;
}

export const LyricDesktopPage: Component = () => {
  const [title, setTitle] = createSignal('');
  const [artist, setArtist] = createSignal('');
  const [trackId, setTrackId] = createSignal<string | null>(null);
  const [trackSource, setTrackSource] = createSignal<string | null>(null);
  const [lyricBundle, setLyricBundle] = createSignal<LyricBundle | null>(null);
  const [positionSec, setPositionSec] = createSignal(0);
  const [settings, setSettings] = createSignal(getMusicSettings());
  const [playing, setPlaying] = createSignal(false);
  const [mainFullscreen, setMainFullscreen] = createSignal(false);
  const [playMode, setPlayMode] = createSignal<AudioPlayMode>(
    getMusicPlayConfig().playMode,
  );
  /** 顶栏显隐：显式 hover，避免 ThemeTargetHost/group-hover 在 WebView2 上失效 */
  const [chromeVisible, setChromeVisible] = createSignal(false);
  /** 鼠标是否在歌词窗内（用于 hoverHide 降透明度） */
  const [shellHovered, setShellHovered] = createSignal(false);
  /** 拖拽/缩放进行中：抑制 clamp、穿透轮询与 hover 透明度抖动 */
  const [interacting, setInteracting] = createSignal(false);
  /** 交互刚结束时短暂抑制 hoverHide，避免松手瞬间透明度闪烁 */
  const [hoverHideSuppressed, setHoverHideSuppressed] = createSignal(false);
  let hoverHideSuppressTimer: number | undefined;
  const [analyserData, setAnalyserData] = createSignal<Uint8Array | null>(null);
  /** 首帧后再挂歌词面板，避免开窗瞬间全量 DOM 阻塞 WebView */
  const [lyricPanelReady, setLyricPanelReady] = createSignal(false);
  let chromeLeaveTimer: ReturnType<typeof setTimeout> | undefined;

  const showChrome = () => {
    if (chromeLeaveTimer) {
      clearTimeout(chromeLeaveTimer);
      chromeLeaveTimer = undefined;
    }
    // 无视顶栏时禁止亮栏（含设置滞后/跨窗不同步）
    if (
      getMusicSettings().desktopLyricPenetrate &&
      getMusicSettings().desktopLyricPenetrateIgnoreChrome
    ) {
      setChromeVisible(false);
      return;
    }
    setChromeVisible(true);
  };
  const scheduleHideChrome = () => {
    // 穿透模式下由原生光标轮询驱动显隐，勿被 mouseleave 立刻藏掉
    if (getMusicSettings().desktopLyricPenetrate) return;
    if (chromeLeaveTimer) clearTimeout(chromeLeaveTimer);
    chromeLeaveTimer = setTimeout(() => {
      setChromeVisible(false);
      chromeLeaveTimer = undefined;
    }, 400);
  };

  const onShellMouseEnter = () => {
    if (interacting()) return;
    setShellHovered(true);
    const s = getMusicSettings();
    if (s.desktopLyricPenetrate && s.desktopLyricPenetrateIgnoreChrome) return;
    showChrome();
  };

  const onShellMouseLeave = () => {
    if (interacting()) return;
    setShellHovered(false);
    scheduleHideChrome();
  };

  const applyPenetrateMode = (enabled: boolean) => {
    if (!isTauri()) return;
    const ignoreChrome = getMusicSettings().desktopLyricPenetrateIgnoreChrome ?? false;
    if (enabled && ignoreChrome) setChromeVisible(false);
    void getInvoke().then((invoke) =>
      invoke('set_desktop_lyric_penetrate_mode', { enabled, ignoreChrome }),
    );
  };

  const reportChromeHeight = (heightPx: number) => {
    if (!isTauri()) return;
    void getInvoke().then((invoke) =>
      invoke('set_desktop_lyric_chrome_height', { heightPx }).catch(() => undefined),
    );
  };

  /**
   * 最终是否显示顶栏（memo）：仅在布尔结果变化时通知下游。
   * 若用普通函数经 props 传入，子组件 effect 会跟踪整个 settings()，
   * 顶栏改字号/透明度等也会重播入场动画，表现为闪烁。
   */
  const chromeBarVisible = createMemo(() => {
    if (settings().desktopLyricPenetrate && settings().desktopLyricPenetrateIgnoreChrome) {
      return false;
    }
    return chromeVisible();
  });

  const lyricTrack = (): LyricTrackKind =>
    resolveEffectiveLyricTrack(
      lyricBundle(),
      settings().desktopLyricTrack ?? settings().lyricTrack ?? 'lxlyric',
      settings().lyricUseLxLyric !== false,
    );

  const setWinResizable = async (resizable: boolean) => {
    if (!isTauri() || settings().desktopLyricLocked) return;
    try {
      const invoke = await getInvoke();
      await invoke('set_desktop_lyric_resizable', { resizable });
    } catch {
      /* ignore */
    }
  };

  const setNativeInteracting = (next: boolean) => {
    setInteracting(next);
    if (!isTauri()) return;
    void getInvoke().then((invoke) =>
      invoke('set_desktop_lyric_interacting', { interacting: next }).catch(() => undefined),
    );
  };

  const finishInteraction = (opts?: { clamp?: boolean }) => {
    setNativeInteracting(false);
    setHoverHideSuppressed(true);
    if (hoverHideSuppressTimer) clearTimeout(hoverHideSuppressTimer);
    hoverHideSuppressTimer = window.setTimeout(() => {
      setHoverHideSuppressed(false);
      hoverHideSuppressTimer = undefined;
    }, 220);
    const shouldClamp = opts?.clamp !== false && getMusicSettings().desktopLyricLockScreen;
    // 等最后一帧 set_bounds 落稳后再被动 clamp，避免互拉
    if (shouldClamp) {
      window.setTimeout(() => {
        if (interacting()) return;
        void clampDesktopLyricToScreen();
      }, 48);
    }
    void persistDesktopLyricGeometry();
  };

  /** 合并未完成的 set_bounds，避免异步 invoke 乱序导致边缘抖动 */
  const createBoundsController = () => {
    let raf = 0;
    let pending: { x: number; y: number; width: number; height: number } | null = null;
    let inFlight = false;
    let generation = 0;
    let invokeFn: Awaited<ReturnType<typeof getInvoke>> | null = null;

    const send = async (
      next: { x: number; y: number; width: number; height: number },
      gen: number,
    ) => {
      try {
        if (!invokeFn) invokeFn = await getInvoke();
        const invoke = invokeFn;
        if (!invoke || gen !== generation) return;
        await invoke('set_desktop_lyric_bounds', next);
      } catch {
        /* ignore */
      } finally {
        if (gen === generation) {
          inFlight = false;
          if (pending) {
            const again = pending;
            pending = null;
            inFlight = true;
            const nextGen = ++generation;
            void send(again, nextGen);
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
          const next = pending;
          pending = null;
          inFlight = true;
          const gen = ++generation;
          void send(next, gen);
        });
      },
      flushNow() {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        if (!pending) return;
        const next = pending;
        pending = null;
        generation += 1;
        const gen = generation;
        inFlight = true;
        void send(next, gen);
      },
      cancel() {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        pending = null;
        generation += 1;
        inFlight = false;
      },
    };
  };

  /**
   * 空白区拖动：用 screen 坐标 + set_bounds（对齐 LX），避免 OS startDragging
   * 在屏幕边缘与 lockScreen clamp 互拉导致样式抖动。
   * Windows 拖动期间暂关 resizable（对齐 LX #2244）。
   */
  const canStartWindowDrag = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    if (target.closest('button, a, input, textarea, select, [data-no-drag]')) return false;
    if (target.closest('.lyric-resize')) return false;
    return true;
  };

  const startDrag = (e: MouseEvent) => {
    if (!isTauri() || e.button !== 0 || settings().desktopLyricLocked) return;
    if (settings().desktopLyricPenetrate) return;
    if (!canStartWindowDrag(e.target)) return;
    e.preventDefault();

    const isWin = navigator.userAgent.toLowerCase().includes('windows');
    const downScreenX = e.screenX;
    const downScreenY = e.screenY;
    let originX = 0;
    let originY = 0;
    let originW = Math.round(window.innerWidth * (window.devicePixelRatio || 1));
    let originH = Math.round(window.innerHeight * (window.devicePixelRatio || 1));
    let scale = 1;
    let ready = false;
    const bounds = createBoundsController();

    setNativeInteracting(true);
    if (isWin) void setWinResizable(false);

    void (async () => {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const win = getCurrentWebviewWindow();
        const [pos, size, factor] = await Promise.all([
          win.outerPosition(),
          win.outerSize(),
          win.scaleFactor(),
        ]);
        originX = pos.x;
        originY = pos.y;
        originW = size.width;
        originH = size.height;
        scale = factor || 1;
        ready = true;
      } catch {
        ready = false;
      }
    })();

    const onMove = (ev: MouseEvent) => {
      if (!ready) return;
      const dx = Math.round((ev.screenX - downScreenX) * scale);
      const dy = Math.round((ev.screenY - downScreenY) * scale);
      bounds.queue({
        x: originX + dx,
        y: originY + dy,
        width: originW,
        height: originH,
      });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      window.removeEventListener('pointerup', onUp, true);
      bounds.flushNow();
      if (isWin) void setWinResizable(true);
      finishInteraction();
    };

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
    window.addEventListener('pointerup', onUp, true);
  };

  /** 边缘缩放：用 screen 坐标算位移，避免左/上缩窗时 clientX 随窗跳导致抖动 */
  const startResize = (origin: ResizeOrigin, e: MouseEvent) => {
    if (!isTauri() || e.button !== 0 || settings().desktopLyricLocked) return;
    e.preventDefault();
    e.stopPropagation();
    setNativeInteracting(true);

    const downScreenX = e.screenX;
    const downScreenY = e.screenY;
    let originX = 0;
    let originY = 0;
    let originW = window.innerWidth;
    let originH = window.innerHeight;
    let scale = 1;
    let ready = false;
    const bounds = createBoundsController();

    void (async () => {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const win = getCurrentWebviewWindow();
        const [pos, size, factor] = await Promise.all([
          win.outerPosition(),
          win.outerSize(),
          win.scaleFactor(),
        ]);
        originX = pos.x;
        originY = pos.y;
        originW = size.width;
        originH = size.height;
        scale = factor || 1;
        ready = true;
      } catch {
        ready = false;
      }
    })();

    const onMove = (ev: MouseEvent) => {
      if (!ready) return;
      const dx = Math.round((ev.screenX - downScreenX) * scale);
      const dy = Math.round((ev.screenY - downScreenY) * scale);
      let x = originX;
      let y = originY;
      let w = originW;
      let h = originH;
      const minW = Math.round(DESKTOP_LYRIC_MIN_WIDTH_PX * scale);
      const minH = Math.round(80 * scale);

      if (origin.includes('left')) {
        const nextW = Math.max(minW, originW - dx);
        x = originX + (originW - nextW);
        w = nextW;
      }
      if (origin.includes('right')) {
        w = Math.max(minW, originW + dx);
      }
      if (origin.includes('top')) {
        const nextH = Math.max(minH, originH - dy);
        y = originY + (originH - nextH);
        h = nextH;
      }
      if (origin.includes('bottom')) {
        h = Math.max(minH, originH + dy);
      }

      bounds.queue({ x, y, width: w, height: h });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      window.removeEventListener('pointerup', onUp, true);
      bounds.flushNow();
      finishInteraction();
    };
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
    window.addEventListener('pointerup', onUp, true);
  };

  const emitCommand = async (action: string, payload?: Record<string, unknown>) => {
    if (!isTauri()) return;
    try {
      const { emit } = await import('@tauri-apps/api/event');
      await emit('desktop-lyric-command', { action, ...payload });
    } catch {
      /* ignore */
    }
  };

  onMount(() => {
    document.documentElement.classList.add('lyric-desktop');
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    void getInvoke();
    void settingsStore.loadSettings();
    requestAnimationFrame(() => setLyricPanelReady(true));

    const refreshAppSettings = () => {
      void settingsStore.loadSettings();
    };
    window.addEventListener('focus', refreshAppSettings);

    if (!isTauri()) {
      onCleanup(() => {
        window.removeEventListener('focus', refreshAppSettings);
      });
      return;
    }

    let unlistenUpdate: (() => void) | undefined;
    let unlistenCmd: (() => void) | undefined;
    let unlistenHover: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;
    let unlistenAnalyser: (() => void) | undefined;
    let analyserBuf: Uint8Array | undefined;

    void import('@tauri-apps/api/event').then(({ listen, emit }) => {
      listen<{
        title?: string;
        artist?: string;
        trackId?: string;
        trackSource?: string;
        lyric?: string;
        lyricAll?: LyricBundle;
        positionSec?: number;
        playing?: boolean;
        fullscreen?: boolean;
        playMode?: number;
      }>('desktop-lyric-update', (e) => {
        if (e.payload.title != null) setTitle(e.payload.title);
        if (e.payload.artist != null) setArtist(e.payload.artist);
        if (e.payload.trackId != null) setTrackId(e.payload.trackId || null);
        if (e.payload.trackSource != null) setTrackSource(e.payload.trackSource || null);
        if (e.payload.lyricAll) {
          setLyricBundle(e.payload.lyricAll);
        } else if (e.payload.lyric != null) {
          setLyricBundle({ lyric: e.payload.lyric });
        }
        if (e.payload.positionSec != null) setPositionSec(e.payload.positionSec);
        if (e.payload.playing != null) setPlaying(e.payload.playing);
        if (e.payload.fullscreen != null) setMainFullscreen(e.payload.fullscreen);
        if (typeof e.payload.playMode === 'number') {
          setPlayMode(e.payload.playMode as AudioPlayMode);
        }
      }).then((fn) => {
        unlistenUpdate = fn;
      });

      listen<{ action?: string }>('desktop-lyric-command', async (e) => {
        const action = e.payload.action;
        if (action === 'toggle-penetrate') {
          const next = !getMusicSettings().desktopLyricPenetrate;
          const { setMusicSettings } = await import('@/lib/media/audio/music-settings');
          setMusicSettings({ desktopLyricPenetrate: next });
          applyPenetrateMode(next);
        }
      }).then((fn) => {
        unlistenCmd = fn;
      });

      // 穿透模式下：原生轮询光标进出 → 展示/隐藏顶栏（无视顶栏时强制隐藏）
      listen<boolean>('desktop-lyric-penetrate-hover', (e) => {
        if (!getMusicSettings().desktopLyricPenetrate) return;
        if (getMusicSettings().desktopLyricPenetrateIgnoreChrome) {
          setChromeVisible(false);
          return;
        }
        if (e.payload) showChrome();
        else setChromeVisible(false);
      }).then((fn) => {
        unlistenHover = fn;
      });


      listen<number[]>('desktop-lyric-analyser', (e) => {
        const payload = e.payload;
        if (!Array.isArray(payload) || payload.length === 0) {
          analyserBuf = undefined;
          setAnalyserData(null);
          return;
        }
        if (!analyserBuf || analyserBuf.length !== payload.length) {
          analyserBuf = new Uint8Array(payload.length);
          setAnalyserData(analyserBuf);
        }
        analyserBuf.set(payload);
      }).then((fn) => {
        unlistenAnalyser = fn;
      });

      void emit('desktop-lyric-command', { action: 'request-info' });
    });

    void import('@tauri-apps/api/webviewWindow').then(({ getCurrentWebviewWindow }) => {
      const win = getCurrentWebviewWindow();
      win.onCloseRequested((event) => {
        event.preventDefault();
        void win.hide();
        notifyDesktopLyricWindowClosed();
      }).then((fn) => {
        unlistenClose = fn;
      });
      win.onMoved(() => {
        if (!interacting() && getMusicSettings().desktopLyricLockScreen) {
          void clampDesktopLyricToScreen();
        }
      }).catch(() => undefined);
    });

    const penetrate = getMusicSettings().desktopLyricPenetrate;
    if (penetrate) {
      window.setTimeout(() => applyPenetrateMode(true), 800);
    }
    let lastNativeSyncKey = '';
    const syncNativeFromSettings = (
      next: ReturnType<typeof getMusicSettings>,
      force = false,
    ) => {
      const key = [
        next.desktopLyricPenetrate ? 1 : 0,
        next.desktopLyricPenetrateIgnoreChrome ? 1 : 0,
        next.desktopLyricAlwaysOnTop ? 1 : 0,
        next.desktopLyricLocked ? 1 : 0,
        next.desktopLyricShowTaskbar ? 1 : 0,
        next.desktopLyricAlwaysOnTopLoop ? 1 : 0,
        next.desktopLyricLockScreen ? 1 : 0,
        next.desktopLyricLockScreenBounds === 'screen' ? 1 : 0,
      ].join(':');
      if (!force && key === lastNativeSyncKey) return;
      lastNativeSyncKey = key;
      void getInvoke().then((invoke) => {
        void invoke('set_desktop_lyric_window_options', {
          alwaysOnTop: next.desktopLyricAlwaysOnTop,
          locked: next.desktopLyricLocked,
          showTaskbar: next.desktopLyricShowTaskbar,
          alwaysOnTopLoop: next.desktopLyricAlwaysOnTopLoop,
          lockScreen: next.desktopLyricLockScreen,
          lockScreenUseWorkArea: next.desktopLyricLockScreenBounds !== 'screen',
        }).catch(() => undefined);
        void invoke('set_desktop_lyric_penetrate_mode', {
          enabled: !!next.desktopLyricPenetrate,
          ignoreChrome: next.desktopLyricPenetrateIgnoreChrome ?? false,
        }).catch(() => undefined);
      });
    };

    const unsubscribeSettings = subscribeMusicSettings((next) => {
      setSettings(next);
      if (next.desktopLyricPenetrate && next.desktopLyricPenetrateIgnoreChrome) {
        setChromeVisible(false);
      }
      syncNativeFromSettings(next);
    });
    const handleStorage = (event: StorageEvent) => {
      // 回退：部分环境仍可能收到 storage；优先用 newValue，避免本窗缓存挡住
      if (event.key !== 'reader_music_settings' || !event.newValue) return;
      try {
        const next = applyRemoteMusicSettings(JSON.parse(event.newValue));
        setSettings(next);
        if (next.desktopLyricPenetrate && next.desktopLyricPenetrateIgnoreChrome) {
          setChromeVisible(false);
        }
        syncNativeFromSettings(next);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', handleStorage);
    // 勿预填 lastNativeSyncKey，否则首次 sync 会被当成「已同步」而跳过
    syncNativeFromSettings(getMusicSettings(), true);
    window.setTimeout(() => syncNativeFromSettings(getMusicSettings(), true), 600);

    let unlistenResync: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(({ listen }) => {
      void listen('desktop-lyric-native-resync', () => {
        const next = getMusicSettings();
        setSettings(next);
        if (next.desktopLyricPenetrate && next.desktopLyricPenetrateIgnoreChrome) {
          setChromeVisible(false);
        }
        syncNativeFromSettings(next, true);
      }).then((fn) => {
        unlistenResync = fn;
      });
    });

    onCleanup(() => {
      if (chromeLeaveTimer) clearTimeout(chromeLeaveTimer);
      if (hoverHideSuppressTimer) clearTimeout(hoverHideSuppressTimer);
      unlistenUpdate?.();
      unlistenCmd?.();
      unlistenHover?.();
      unlistenClose?.();
      unlistenAnalyser?.();
      unlistenResync?.();
      unsubscribeSettings();
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', refreshAppSettings);
    });
  });

  const reduceMotion = () => {
    if (settingsStore.state.app.reduceMotion) return true;
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  createEffect(() => {
    const base = settings().desktopLyricOpacity ?? 0.85;
    const pauseDim =
      settings().desktopLyricHideWhenPaused && !playing() ? 0.05 : 1;
    // 拖/缩过程中及结束后短暂忽略 hoverHide，避免贴边时透明度闪烁
    const hoverDim =
      !interacting() &&
      !hoverHideSuppressed() &&
      settings().desktopLyricHoverHide &&
      shellHovered()
        ? 0.05
        : 1;
    // 全屏隐藏仍用 visibility；暂停/悬停对齐 LX 用内容透明度
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.setProperty('--desktop-lyric-bg', `rgba(0,0,0,${base})`);
    document.body.style.setProperty(
      '--desktop-lyric-content-opacity',
      String(Math.min(pauseDim, hoverDim)),
    );
  });

  createEffect(() => {
    if (settings().desktopLyricPenetrate && settings().desktopLyricPenetrateIgnoreChrome) {
      setChromeVisible(false);
    }
  });

  createEffect(() => {
    const root = document.documentElement;
    const draggable =
      !settings().desktopLyricLocked && !settings().desktopLyricPenetrate;
    root.classList.toggle('lyric-desktop--draggable', draggable);
    root.classList.toggle('lyric-desktop--locked', settings().desktopLyricLocked === true);
    root.classList.toggle('lyric-desktop--penetrate', settings().desktopLyricPenetrate === true);
    if (reduceMotion()) root.setAttribute('data-reduce-motion', 'true');
    else root.removeAttribute('data-reduce-motion');
  });

  const fontRem = () => desktopLyricFontRem(settings().desktopLyricFontSize);
  const effectiveLyricOffset = () => {
    const id = trackId()?.trim();
    const source = trackSource()?.trim();
    // 标题不够；需 trackId + trackSource 才能对齐本曲偏移键
    const trackKey = id && source ? musicLyricOffsetTrackKey(source, id) : null;
    return resolveEffectiveLyricOffsetSec(settings().lyricOffset ?? 0, trackKey);
  };
  const fullscreenHidden = () =>
    settings().desktopLyricHideWhenFullscreen && mainFullscreen();
  const showResize = () => !settings().desktopLyricLocked;
  const metaLine = () => {
    const t = title().trim();
    const a = artist().trim();
    if (t && a) return `${t} - ${a}`;
    return t || a || '';
  };
  const showMeta = () =>
    settings().desktopLyricShowMeta !== false && Boolean(metaLine());
  const metaStyle = () => {
    const fontPx = settings().desktopLyricMetaFontSize ?? 14;
    const opacity = settings().desktopLyricMetaOpacity ?? 0.7;
    const mode = settings().desktopLyricMetaColorMode ?? 'system';
    let color: string | undefined;
    let shadowEnabled = false;
    let shadowColor: string | undefined;

    if (mode === 'followPlayed') {
      color = settings().desktopLyricPlayedColor?.trim() || undefined;
      shadowEnabled = settings().desktopLyricPlayedShadow === true;
      shadowColor = settings().desktopLyricPlayedShadowColor;
    } else if (mode === 'followUnplayed') {
      color = settings().desktopLyricUnplayedColor?.trim() || undefined;
      shadowEnabled = settings().desktopLyricUnplayedShadow === true;
      shadowColor = settings().desktopLyricUnplayedShadowColor;
    } else if (mode === 'custom') {
      color = settings().desktopLyricMetaColor?.trim() || '#ffffff';
      shadowEnabled = settings().desktopLyricMetaShadow === true;
      shadowColor = settings().desktopLyricMetaShadowColor;
    }

    return {
      'font-size': `${fontPx}px`,
      opacity: String(opacity),
      color,
      'font-weight': settings().desktopLyricMetaBold ? '700' : undefined,
      'line-height': '1.35',
      ...(buildLyricTextEffectStyle({
        enabled: shadowEnabled,
        shadowColor,
        transparentBackdrop: true,
        mode: 'line',
        direction: settings().desktopLyricDirection,
      }) ?? {}),
    } as Record<string, string | undefined>;
  };

  const handleRootDblClick = () => {
    if (!settings().desktopLyricLocked) return;
    setMusicSettings({ desktopLyricLocked: false });
    void import('@/lib/media/audio/desktop-lyric-window').then(({ syncDesktopLyricWindowOptions }) =>
      syncDesktopLyricWindowOptions({ locked: false }),
    );
  };

  // 交互结束强制重绘一帧，清掉 Win 透明 WebView 合成残影（双顶栏/歌词重影）
  createEffect(() => {
    if (interacting()) return;
    const root = document.documentElement;
    root.classList.add('lyric-desktop-repaint');
    requestAnimationFrame(() => {
      root.classList.remove('lyric-desktop-repaint');
    });
  });

  return (
    <div
      class="lyric-desktop-shell fixed inset-0 flex w-screen select-none flex-col overflow-hidden text-white"
      classList={{
        'lyric-desktop-shell--interacting': interacting(),
      }}
      style={{
        'font-family': settings().desktopLyricFontFamily || undefined,
        // 整窗铺底，避免透明空洞留下合成残影
        background: 'var(--desktop-lyric-bg, rgba(0,0,0,0.85))',
        opacity: interacting()
          ? '1'
          : 'var(--desktop-lyric-content-opacity, 1)',
        transition: interacting()
          ? 'none'
          : 'opacity 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onMouseEnter={onShellMouseEnter}
      onMouseLeave={onShellMouseLeave}
      onMouseDown={startDrag}
      onDblClick={handleRootDblClick}
    >
      <ThemeTargetHost target="music.desktopLyric" class="contents">
        <LyricDesktopControlBar
          visible={chromeBarVisible()}
          reduceMotion={reduceMotion()}
          locked={settings().desktopLyricLocked === true}
          playing={playing()}
          alwaysOnTop={settings().desktopLyricAlwaysOnTop !== false}
          zoomActive={settings().desktopLyricZoomActive !== false}
          penetrate={settings().desktopLyricPenetrate === true}
          penetrateIgnoreChrome={settings().desktopLyricPenetrateIgnoreChrome === true}
          audioVisualization={settings().desktopLyricAudioVisualization === true}
          playMode={playMode()}
          onEmitCommand={(action, payload) => void emitCommand(action, payload)}
          onPlayModeCycled={setPlayMode}
          onBarDrag={startDrag}
          onRequestPenetrate={applyPenetrateMode}
          onChromeHeightChange={reportChromeHeight}
        />

        <Show when={settings().desktopLyricAudioVisualization}>
          <Show keyed when={settings().desktopLyricLayout}>
            <MusicAudioVisualizer
              getFrequencyData={() => analyserData()}
              active={
                settings().desktopLyricAudioVisualization &&
                playing() &&
                !fullscreenHidden()
              }
              targetFps={() => settings().desktopLyricAudioVisualizerFps}
            />
          </Show>
        </Show>

        <div
          class="lyric-desktop-lyric-body pointer-events-none flex min-h-0 flex-1 flex-col items-center justify-center px-3 py-3 text-center"
          style={{
            visibility: fullscreenHidden() ? 'hidden' : 'visible',
          }}
        >
          <Show when={showMeta()}>
            <p class="mb-2 max-w-full truncate" style={metaStyle()}>
              {metaLine()}
            </p>
          </Show>
          <div class="min-h-0 w-full flex-1 overflow-hidden">
            <Show when={lyricPanelReady()}>
            <AudioLyricPanel
              class="h-full max-h-full bg-transparent"
              bundle={lyricBundle()}
              lyricTrack={lyricTrack()}
              positionSec={positionSec()}
              playing={playing()}
              lyricOffset={effectiveLyricOffset()}
              showTranslation={settings().showLyricTranslation}
              showRoma={settings().showLyricRoma}
              secondaryOrder={settings().lyricSecondaryOrder}
              align={settings().desktopLyricAlign}
              fontSize={fontRem()}
              zoomActiveLyric={settings().desktopLyricZoomActive !== false}
              zoomActiveScale={settings().desktopLyricZoomActiveScale ?? 1.28}
              layout={settings().desktopLyricLayout}
              singleLine={settings().desktopLyricLayout === 'single'}
              maxLines={settings().desktopLyricMaxLines}
              playedColor={settings().desktopLyricPlayedColor || undefined}
              unplayedColor={settings().desktopLyricUnplayedColor || undefined}
              unplayedShadowEnabled={settings().desktopLyricUnplayedShadow}
              unplayedShadowColor={settings().desktopLyricUnplayedShadowColor}
              playedShadowEnabled={settings().desktopLyricPlayedShadow}
              playedShadowColor={settings().desktopLyricPlayedShadowColor}
              scrollDelayMs={settings().desktopLyricDelayScroll ? 600 : 0}
              scrollPosition={settings().desktopLyricScrollPosition}
              fontFamily={settings().desktopLyricFontFamily}
              lineHeight={settings().desktopLyricLineHeight}
              lineGap={settings().desktopLyricLineGap}
              textShadow={settings().desktopLyricUnplayedShadow}
              shadowColor={settings().desktopLyricUnplayedShadowColor}
              bold={settings().desktopLyricBold}
              boldFont={settings().desktopLyricBoldFont}
              boldLine={settings().desktopLyricBoldLine}
              boldExtended={settings().desktopLyricBoldExtended}
              wrap={settings().desktopLyricWrap}
              direction={settings().desktopLyricDirection}
              transparentBackdrop
              karaokeMode={settings().lyricUseLxLyric !== false}
            />
            </Show>
          </div>
        </div>

        <Show when={showResize()}>
          <For each={RESIZE_ORIGINS}>
            {(origin) => (
              <div
                class={`lyric-resize lyric-resize-${origin}`}
                onMouseDown={(e) => startResize(origin, e)}
              />
            )}
          </For>
        </Show>
      </ThemeTargetHost>
    </div>
  );
};
