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
  untrack,
  type Component,
} from 'solid-js';
import { AudioLyricPanel } from '@/components/media/viewer/audio/AudioLyricPanel';
import {
  getMusicSettings,
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
  showDesktopLyricWindowWhenReady,
  getDesktopLyricPrepareShowEvent,
  notifyDesktopLyricUiReady,
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
  /** 用户刚手动改过高度：禁止自动收缩把高度弹回，直到布局相关配置变化 */
  let userHeightOverride = false;
  /** 歌词主体区（用于实测紧凑布局最小高度） */
  let lyricBodyEl: HTMLDivElement | undefined;
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
    // 自动收缩期间勿把收缩高度写回设置，留住切回默认布局时的还原高度
    void persistDesktopLyricGeometry({ skipHeight: isAutoShrunkNow() });
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

  /** 桌面歌词窗最小内容高度（逻辑 px）：含副歌词；垂直书写时抬高以免压扁 */
  const desktopLyricMinContentHeightCssPx = () => {
    const s = getMusicSettings();
    const font = Math.max(12, s.desktopLyricFontSize ?? 20);
    const chrome = 44;
    const bodyPad = 24; // py-3 上下合计兜底
    const meta =
      s.desktopLyricShowMeta !== false
        ? (s.desktopLyricMetaFontSize ?? 14) * 1.35 + 10
        : 0;
    if (s.desktopLyricDirection === 'vertical') {
      // 垂直书写：窗口高度≈字沿行进方向的可用长度，过矮会把字形压扁
      return Math.ceil(Math.max(280, font * 12 + chrome + meta + bodyPad));
    }
    // 默认布局仍允许缩到原生下限；单/双行按槽位+副歌词估算（偏宽松，真值靠 DOM 测量）
    if (s.desktopLyricLayout !== 'single' && s.desktopLyricLayout !== 'dual') {
      return 80;
    }
    const lineH = Math.max(1, s.desktopLyricLineHeight ?? 1.5);
    const gap = Math.max(0, s.desktopLyricLineGap ?? 8);
    const secondaryCount =
      (s.desktopLyricShowTranslation ? 1 : 0) + (s.desktopLyricShowRoma ? 1 : 0);
    const slots = s.desktopLyricLayout === 'dual' ? 2 : 1;
    const primaryH = font * lineH;
    // 与 AudioLyricPanel extendedLineClass 字号/行高大致对齐，并留出 mt 间隙
    const secondaryEm = s.desktopLyricLayout === 'dual' ? 0.78 : 0.9;
    const secondaryH = secondaryCount * (font * secondaryEm * 1.4 + 6);
    const zoomPad =
      s.desktopLyricZoomActive !== false
        ? font * Math.max(0, (s.desktopLyricZoomActiveScale ?? 1.28) - 1)
        : 0;
    const perSlot = primaryH + secondaryH + gap + zoomPad;
    return Math.ceil(Math.max(80, slots * perSlot + meta + chrome + bodyPad));
  };

  /**
   * 用 DOM 实测紧凑布局所需窗高（逻辑 px）。
   * 必须用 scrollHeight：矮窗时 flex 压扁后 getBoundingClientRect 会低估。
   */
  const measureCompactMinWindowHeightCssPx = (): number | null => {
    const body = lyricBodyEl;
    if (!body) return null;
    const panel = body.querySelector<HTMLElement>('[data-lyric-container]');
    if (!panel) return null;
    const bodyStyle = getComputedStyle(body);
    let contentH =
      parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
    const meta = body.querySelector<HTMLElement>('[data-desktop-lyric-meta]');
    if (meta) {
      const metaStyle = getComputedStyle(meta);
      contentH +=
        meta.scrollHeight +
        parseFloat(metaStyle.marginTop) +
        parseFloat(metaStyle.marginBottom);
    }
    const panelStyle = getComputedStyle(panel);
    contentH +=
      panel.scrollHeight +
      parseFloat(panelStyle.marginTop) +
      parseFloat(panelStyle.marginBottom);
    if (contentH < 8) return null;
    const bodyH = body.getBoundingClientRect().height;
    const chromeOutside = Math.max(0, window.innerHeight - bodyH);
    return Math.ceil(chromeOutside + contentH + 4);
  };

  /** 紧凑布局下限：测量值与估算值取大，避免副歌词未入 DOM 时测矮、或 flex 压扁测矮 */
  const resolveDesktopLyricMinHeightCssPx = () => {
    const estimated = desktopLyricMinContentHeightCssPx();
    const layout = getMusicSettings().desktopLyricLayout;
    if (layout !== 'single' && layout !== 'dual') return estimated;
    const measured = measureCompactMinWindowHeightCssPx();
    if (measured == null) return estimated;
    return Math.max(estimated, measured);
  };

  /** 把计算下限同步到原生（setMinSize + Rust clamp），使缩放无法低于该值 */
  const syncNativeMinHeight = (minCssPx: number) => {
    if (!isTauri()) return;
    const heightPx = Math.max(80, Math.ceil(minCssPx));
    void (async () => {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const { LogicalSize } = await import('@tauri-apps/api/dpi');
        await getCurrentWebviewWindow().setMinSize(
          new LogicalSize(DESKTOP_LYRIC_MIN_WIDTH_PX, heightPx),
        );
      } catch {
        /* ignore */
      }
      try {
        const invoke = await getInvoke();
        await invoke('set_desktop_lyric_min_height', { heightPx });
      } catch {
        /* ignore：旧二进制无此命令时仍有 setMinSize */
      }
    })();
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
      // 保持 OS resizable=false，仅自定义手柄改尺寸
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
    // 缩放期间关掉 OS 边框缩放，避免与自定义手柄互抢且落到固定 80
    void setWinResizable(false);

    const downScreenX = e.screenX;
    const downScreenY = e.screenY;
    let originX = 0;
    let originY = 0;
    let originW = window.innerWidth;
    let originH = window.innerHeight;
    let scale = 1;
    let ready = false;
    // 拖拽全程冻结下限：优先用设置估算（必含翻译/罗马音开关），再与 DOM 实测取大
    // 先按 devicePixelRatio 估物理下限，避免等 async 期间 ready 前无法钳制
    const dprGuess = window.devicePixelRatio || 1;
    let minW = Math.round(DESKTOP_LYRIC_MIN_WIDTH_PX * dprGuess);
    let minH = Math.round(
      Math.max(80, desktopLyricMinContentHeightCssPx()) * dprGuess,
    );
    const bounds = createBoundsController();

    void (async () => {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const { LogicalSize } = await import('@tauri-apps/api/dpi');
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
        minW = Math.round(DESKTOP_LYRIC_MIN_WIDTH_PX * scale);
        // 估算（含副歌词开关）与实测取大，避免开关开着但 DOM 尚未量到时落到 80
        const minCss = Math.max(
          desktopLyricMinContentHeightCssPx(),
          resolveDesktopLyricMinHeightCssPx(),
        );
        minH = Math.round(Math.max(80, minCss) * scale);
        try {
          await win.setMinSize(
            new LogicalSize(DESKTOP_LYRIC_MIN_WIDTH_PX, Math.max(80, Math.ceil(minCss))),
          );
        } catch {
          /* ignore */
        }
        syncNativeMinHeight(minCss);
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
      // 手动改过高度：禁止随后的自动收缩把高度弹回内容最小
      userHeightOverride = true;
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
    void settingsStore.loadSettings().then(() => {
      // 关闭 OS 边框缩放，并把含副歌词的下限写入原生
      void setWinResizable(false);
      syncNativeMinHeight(resolveDesktopLyricMinHeightCssPx());
    });
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

    let revealGen = 0;
    const revealWhenReady = () => {
      const gen = ++revealGen;
      void showDesktopLyricWindowWhenReady().catch(() => undefined);
      // 若期间又来一次 prepare-show，旧任务可被 gen 覆盖（show 幂等）
      void gen;
    };

    let unlistenUpdate: (() => void) | undefined;
    let unlistenCmd: (() => void) | undefined;
    let unlistenHover: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;
    let unlistenAnalyser: (() => void) | undefined;
    let unlistenPrepareShow: (() => void) | undefined;
    let analyserBuf: Uint8Array | undefined;

    void import('@tauri-apps/api/event').then(({ listen, emit }) => {
      void listen(getDesktopLyricPrepareShowEvent(), () => {
        revealWhenReady();
      }).then((fn) => {
        unlistenPrepareShow = fn;
        // 监听挂上后再告知主窗，避免冷启动错过 prepare-show
        void notifyDesktopLyricUiReady();
      });
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
      unlistenPrepareShow?.();
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
  const isCompactLyricLayout = () => {
    const layout = settings().desktopLyricLayout;
    return layout === 'single' || layout === 'dual';
  };
  const metaLine = () => {
    const t = title().trim();
    const a = artist().trim();
    if (t && a) return `${t} - ${a}`;
    return t || a || '';
  };
  const showMeta = () =>
    settings().desktopLyricShowMeta !== false && Boolean(metaLine());
  /** 单/双行且无作品信息：勿 flex-1 撑满，否则歌词贴顶并留下异常顶距 */
  const compactCentered = () => isCompactLyricLayout() && !showMeta();

  // ---- 单/双行自动收缩窗口至最小高度 ----
  /** 自动收缩后的窗口内高（CSS px）；null 表示未处于收缩态 */
  let autoShrunkInnerHeight: number | null = null;
  let shrinkTimer: number | undefined;

  /** 歌词主体区当前高度与内容自然高度之差（CSS px）；无法测量时返回 null */
  const measureLyricBodySlackPx = (): number | null => {
    const body = lyricBodyEl;
    if (!body) return null;
    const bodyRect = body.getBoundingClientRect();
    if (bodyRect.height <= 0) return null;
    const bodyStyle = getComputedStyle(body);
    let natural =
      parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
    const meta = body.querySelector<HTMLElement>('[data-desktop-lyric-meta]');
    if (meta) {
      const metaStyle = getComputedStyle(meta);
      // scrollHeight：即使被压扁也能反映真实内容高度
      natural +=
        meta.scrollHeight +
        parseFloat(metaStyle.marginTop) +
        parseFloat(metaStyle.marginBottom);
    }
    const panel = body.querySelector<HTMLElement>('[data-lyric-container]');
    if (!panel) return null;
    const panelStyle = getComputedStyle(panel);
    natural +=
      panel.scrollHeight +
      parseFloat(panelStyle.marginTop) +
      parseFloat(panelStyle.marginBottom);
    return bodyRect.height - natural;
  };

  const applyWindowHeightDelta = async (slackCssPx: number) => {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const win = getCurrentWebviewWindow();
    const [pos, size, factor] = await Promise.all([
      win.outerPosition(),
      win.outerSize(),
      win.scaleFactor(),
    ]);
    const minH = Math.round(
      Math.max(80, resolveDesktopLyricMinHeightCssPx()) * factor,
    );
    const nextH = Math.max(minH, Math.round(size.height - slackCssPx * factor));
    if (Math.abs(nextH - size.height) < 2) return;
    const invoke = await getInvoke();
    await invoke('set_desktop_lyric_bounds', {
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: nextH,
    });
  };

  const shrinkToCompactHeight = () => {
    if (shrinkTimer) window.clearTimeout(shrinkTimer);
    // 等布局/字体落定再测量，避免首帧测出偏大高度
    shrinkTimer = window.setTimeout(() => {
      shrinkTimer = undefined;
      if (interacting()) return;
      if (!isCompactLyricLayout() || !settings().desktopLyricCompactAutoShrink) return;
      // slack 为 null 时仍用 0 走一遍，以抬高到含副歌词的最小高度
      const slack = measureLyricBodySlackPx() ?? 0;
      // 手动加高后禁止自动收缩；但过矮（slack<0）仍必须抬高，避免裁切
      if (userHeightOverride && slack > 2) return;
      void applyWindowHeightDelta(slack)
        .then(() => {
          requestAnimationFrame(() => {
            autoShrunkInnerHeight = window.innerHeight;
          });
        })
        .catch(() => undefined);
    }, 120);
  };

  const restoreExpandedHeight = () => {
    if (autoShrunkInnerHeight == null) return;
    autoShrunkInnerHeight = null;
    const expanded = getMusicSettings().desktopLyricHeight ?? 200;
    void (async () => {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const win = getCurrentWebviewWindow();
      const [pos, size, factor] = await Promise.all([
        win.outerPosition(),
        win.outerSize(),
        win.scaleFactor(),
      ]);
      const nextH = Math.round(expanded * factor);
      if (Math.abs(nextH - size.height) < 2) return;
      const invoke = await getInvoke();
      await invoke('set_desktop_lyric_bounds', {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: nextH,
      });
    })().catch(() => undefined);
  };

  /** 交互结束后判断是否仍处于自动收缩高度（阈值容差缩放取整误差） */
  const isAutoShrunkNow = () => {
    if (autoShrunkInnerHeight == null) return false;
    if (Math.abs(window.innerHeight - autoShrunkInnerHeight) > 2) {
      // 用户手动改过高度：交还控制权，之后正常持久化
      autoShrunkInnerHeight = null;
      return false;
    }
    return true;
  };

  /** 仅内容高度相关字段；避免锁定等无关设置变更误触发窗口缩放 */
  const compactShrinkKey = createMemo(() =>
    [
      settings().desktopLyricCompactAutoShrink ? 1 : 0,
      settings().desktopLyricLayout,
      settings().desktopLyricFontSize ?? 0,
      settings().desktopLyricLineGap ?? 0,
      settings().desktopLyricLineHeight ?? 0,
      settings().desktopLyricZoomActive ? 1 : 0,
      settings().desktopLyricZoomActiveScale ?? 0,
      settings().desktopLyricMetaFontSize ?? 0,
      settings().desktopLyricShowMeta !== false ? 1 : 0,
      settings().desktopLyricShowTranslation ? 1 : 0,
      settings().desktopLyricShowRoma ? 1 : 0,
      settings().desktopLyricSecondaryOrder,
      settings().desktopLyricSecondaryPlacement,
      settings().desktopLyricDirection,
      lyricPanelReady() ? 1 : 0,
      showMeta() ? 1 : 0,
      title(),
      artist(),
      // 换歌时歌词行数/字号包络可能变
      trackId() ?? '',
    ].join('|'),
  );

  createEffect(() => {
    if (!isTauri()) return;
    // 只依赖高度相关 key；用 untrack 读开关，避免锁定等无关设置改动触发缩放
    compactShrinkKey();
    const auto = untrack(() => settings().desktopLyricCompactAutoShrink === true);
    const compact = untrack(() => isCompactLyricLayout());
    if (auto && compact) {
      shrinkToCompactHeight();
    } else {
      restoreExpandedHeight();
    }
  });

  /** 仅内容最小高度相关字段：切换方向/字号/布局/副歌词/歌词内容时用于抬高窗口 */
  const minHeightGuardKey = createMemo(() =>
    [
      settings().desktopLyricDirection,
      settings().desktopLyricShowTranslation ? 1 : 0,
      settings().desktopLyricShowRoma ? 1 : 0,
      settings().desktopLyricFontSize ?? 0,
      settings().desktopLyricLayout,
      settings().desktopLyricLineHeight ?? 0,
      settings().desktopLyricLineGap ?? 0,
      settings().desktopLyricShowMeta !== false ? 1 : 0,
      settings().desktopLyricMetaFontSize ?? 0,
      settings().desktopLyricZoomActive !== false ? 1 : 0,
      settings().desktopLyricZoomActiveScale ?? 0,
      lyricPanelReady() ? 1 : 0,
      // 换歌后副歌词可用性变化，需重新实测下限
      trackId() ?? '',
    ].join('|'),
  );

  let minGuardTimer: number | undefined;
  /**
   * 切到垂直书写或副歌词变化后，若当前窗高低于下限则抬高。
   * 只依赖配置键（不依赖 interacting），避免手动拖拽结束时 interacting 翻转
   * 重新触发本效果、把刚调好的高度又弹回去造成抖动。
   */
  createEffect(() => {
    if (!isTauri()) return;
    minHeightGuardKey();
    // 布局相关配置变了：允许重新自动收缩，并同步原生最小高度
    userHeightOverride = false;
    if (minGuardTimer) window.clearTimeout(minGuardTimer);
    minGuardTimer = window.setTimeout(() => {
      minGuardTimer = undefined;
      if (untrack(() => interacting())) return;
      const minCss = resolveDesktopLyricMinHeightCssPx();
      syncNativeMinHeight(minCss);
      // 自动收缩开启时：过矮仍抬高；偏高交给 shrink 收
      if (
        untrack(
          () =>
            settings().desktopLyricCompactAutoShrink === true &&
            isCompactLyricLayout(),
        )
      ) {
        if (window.innerHeight + 6 >= minCss) return;
        void applyWindowHeightDelta(window.innerHeight - minCss).catch(
          () => undefined,
        );
        return;
      }
      // 容差以吸收缩放取整误差，避免边界处来回抖动
      if (window.innerHeight + 6 >= minCss) return;
      void applyWindowHeightDelta(window.innerHeight - minCss).catch(
        () => undefined,
      );
    }, 160);
  });

  onCleanup(() => {
    if (shrinkTimer) window.clearTimeout(shrinkTimer);
    if (minGuardTimer) window.clearTimeout(minGuardTimer);
  });
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
    void import('@/lib/media/audio/desktop-lyric-window').then(({ setDesktopLyricLocked }) =>
      setDesktopLyricLocked(false),
    );
  };

  const isLyricLocked = createMemo(() => settings().desktopLyricLocked === true);

  createEffect(() => {
    const locked = isLyricLocked();
    // 锁定后顶栏切到「仅解锁」：保持可见一帧并强制重绘，避免透明 WebView 残影仍显示完整工具栏
    if (locked) {
      const s = untrack(() => getMusicSettings());
      if (!(s.desktopLyricPenetrate && s.desktopLyricPenetrateIgnoreChrome)) {
        setChromeVisible(true);
      }
    }
    const root = document.documentElement;
    root.classList.add('lyric-desktop-repaint');
    requestAnimationFrame(() => {
      root.classList.remove('lyric-desktop-repaint');
    });
  });

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
          ref={lyricBodyEl}
          class="lyric-desktop-lyric-body pointer-events-none flex min-h-0 flex-1 flex-col items-center px-3 text-center"
          classList={{
            'justify-center py-1': compactCentered(),
            'justify-center py-3': !compactCentered(),
          }}
          style={{
            visibility: fullscreenHidden() ? 'hidden' : 'visible',
          }}
        >
          <Show when={showMeta()}>
            <p data-desktop-lyric-meta class="mb-2 max-w-full truncate" style={metaStyle()}>
              {metaLine()}
            </p>
          </Show>
          <div
            class="min-h-0 w-full"
            classList={{
              // 单/双行：overflow-visible + 勿被 flex 压扁，保证副歌词可见且 scrollHeight 可测
              'flex-1 overflow-hidden': !isCompactLyricLayout(),
              'shrink-0 overflow-visible': isCompactLyricLayout(),
            }}
          >
            <Show when={lyricPanelReady()}>
            <AudioLyricPanel
              class={
                compactCentered()
                  ? 'max-h-full w-full bg-transparent'
                  : 'h-full max-h-full bg-transparent'
              }
              bundle={lyricBundle()}
              lyricTrack={lyricTrack()}
              positionSec={positionSec()}
              playing={playing()}
              lyricOffset={effectiveLyricOffset()}
              showTranslation={settings().desktopLyricShowTranslation}
              showRoma={settings().desktopLyricShowRoma}
              secondaryOrder={settings().desktopLyricSecondaryOrder}
              secondaryPlacement={settings().desktopLyricSecondaryPlacement}
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
              scrollDelayMs={
                settings().desktopLyricDelayScroll
                  ? Math.max(100, settings().desktopLyricScrollDelayMs || 600)
                  : 0
              }
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
