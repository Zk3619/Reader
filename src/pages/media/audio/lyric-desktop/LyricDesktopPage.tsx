/**
 * 桌面悬浮歌词页（Tauri 第二窗口加载 #lyric-desktop）
 * 对齐 LX：透明底、原生拖动、边缘缩放、开窗主动拉歌词
 */

import {
  For,
  Show,
  createEffect,
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
import { MusicAudioVisualizer } from '@/components/media/viewer/audio/music/hub/MusicAudioVisualizer';

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
  /** 拖拽/缩放进行中，抑制 onMoved clamp 避免抖动 */
  let interacting = false;
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
    setShellHovered(true);
    const s = getMusicSettings();
    if (s.desktopLyricPenetrate && s.desktopLyricPenetrateIgnoreChrome) return;
    showChrome();
  };

  const onShellMouseLeave = () => {
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

  /** 最终是否显示顶栏：无视顶栏时恒为 false */
  const chromeBarVisible = () => {
    if (settings().desktopLyricPenetrate && settings().desktopLyricPenetrateIgnoreChrome) {
      return false;
    }
    return chromeVisible();
  };

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

  /**
   * 空白区拖动：一律用 OS startDragging（跟手）。
   * Windows 拖动期间暂关 resizable（对齐 LX #2244），在 mouseup 再打开。
   */
  const startDrag = (e: MouseEvent) => {
    if (!isTauri() || e.button !== 0 || settings().desktopLyricLocked) return;
    if (e.target !== e.currentTarget) return;
    e.preventDefault();

    const isWin = navigator.userAgent.toLowerCase().includes('windows');
    let finished = false;
    interacting = true;
    const finish = () => {
      if (finished) return;
      finished = true;
      interacting = false;
      window.removeEventListener('mouseup', finish);
      window.removeEventListener('blur', finish);
      if (isWin) void setWinResizable(true);
      if (getMusicSettings().desktopLyricLockScreen) {
        void clampDesktopLyricToScreen();
      }
      void persistDesktopLyricGeometry();
    };

    void (async () => {
      try {
        if (isWin) await setWinResizable(false);
        window.addEventListener('mouseup', finish);
        window.addEventListener('blur', finish);
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        await getCurrentWebviewWindow().startDragging();
      } catch {
        finish();
      }
    })();
  };

  /** 边缘缩放：物理像素 + rAF 合并，避免每帧 IPC 卡顿 */
  const startResize = (origin: ResizeOrigin, e: MouseEvent) => {
    if (!isTauri() || e.button !== 0 || settings().desktopLyricLocked) return;
    e.preventDefault();
    e.stopPropagation();
    interacting = true;

    const downClientX = e.clientX;
    const downClientY = e.clientY;
    let originX = 0;
    let originY = 0;
    let originW = window.innerWidth;
    let originH = window.innerHeight;
    let scale = 1;
    let ready = false;
    let raf = 0;
    let pending: { x: number; y: number; width: number; height: number } | null = null;

    void (async () => {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const win = getCurrentWebviewWindow();
        const [pos, size, factor] = await Promise.all([
          win.outerPosition(),
          win.innerSize(),
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

    const flush = () => {
      raf = 0;
      if (!pending) return;
      const next = pending;
      pending = null;
      void getInvoke().then((invoke) =>
        invoke('set_desktop_lyric_bounds', next).catch(() => undefined),
      );
    };

    const onMove = (ev: MouseEvent) => {
      if (!ready) return;
      const dx = Math.round((ev.clientX - downClientX) * scale);
      const dy = Math.round((ev.clientY - downClientY) * scale);
      let x = originX;
      let y = originY;
      let w = originW;
      let h = originH;
      const minW = Math.round(240 * scale);
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

      pending = { x, y, width: w, height: h };
      if (!raf) raf = window.requestAnimationFrame(flush);
    };

    const onUp = () => {
      interacting = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (raf) {
        cancelAnimationFrame(raf);
        flush();
      }
      if (getMusicSettings().desktopLyricLockScreen) {
        void clampDesktopLyricToScreen();
      }
      void persistDesktopLyricGeometry();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
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
    requestAnimationFrame(() => setLyricPanelReady(true));

    if (!isTauri()) return;

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
        if (!interacting && getMusicSettings().desktopLyricLockScreen) {
          void clampDesktopLyricToScreen();
        }
      }).catch(() => undefined);
    });

    const penetrate = getMusicSettings().desktopLyricPenetrate;
    if (penetrate) {
      window.setTimeout(() => applyPenetrateMode(true), 800);
    }
    let lastNativeSyncKey = '';
    const syncNativeFromSettings = (next: ReturnType<typeof getMusicSettings>) => {
      const key = [
        next.desktopLyricPenetrate ? 1 : 0,
        next.desktopLyricPenetrateIgnoreChrome ? 1 : 0,
        next.desktopLyricAlwaysOnTop ? 1 : 0,
        next.desktopLyricLocked ? 1 : 0,
        next.desktopLyricShowTaskbar ? 1 : 0,
        next.desktopLyricAlwaysOnTopLoop ? 1 : 0,
        next.desktopLyricLockScreen ? 1 : 0,
      ].join(':');
      if (key === lastNativeSyncKey) return;
      lastNativeSyncKey = key;
      void getInvoke().then((invoke) => {
        void invoke('set_desktop_lyric_window_options', {
          alwaysOnTop: next.desktopLyricAlwaysOnTop,
          locked: next.desktopLyricLocked,
          showTaskbar: next.desktopLyricShowTaskbar,
          alwaysOnTopLoop: next.desktopLyricAlwaysOnTopLoop,
          lockScreen: next.desktopLyricLockScreen,
        }).catch(() => undefined);
        void invoke('set_desktop_lyric_penetrate_mode', {
          enabled: !!next.desktopLyricPenetrate,
          ignoreChrome: next.desktopLyricPenetrateIgnoreChrome ?? false,
        }).catch(() => undefined);
      });
    };
    lastNativeSyncKey = [
      penetrate ? 1 : 0,
      getMusicSettings().desktopLyricPenetrateIgnoreChrome ? 1 : 0,
      getMusicSettings().desktopLyricAlwaysOnTop ? 1 : 0,
      getMusicSettings().desktopLyricLocked ? 1 : 0,
      getMusicSettings().desktopLyricShowTaskbar ? 1 : 0,
      getMusicSettings().desktopLyricAlwaysOnTopLoop ? 1 : 0,
      getMusicSettings().desktopLyricLockScreen ? 1 : 0,
    ].join(':');

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
    window.setTimeout(() => syncNativeFromSettings(getMusicSettings()), 600);

    onCleanup(() => {
      if (chromeLeaveTimer) clearTimeout(chromeLeaveTimer);
      unlistenUpdate?.();
      unlistenCmd?.();
      unlistenHover?.();
      unlistenClose?.();
      unlistenAnalyser?.();
      unsubscribeSettings();
      window.removeEventListener('storage', handleStorage);
    });
  });

  createEffect(() => {
    const base = settings().desktopLyricOpacity ?? 0.85;
    const pauseDim =
      settings().desktopLyricHideWhenPaused && !playing() ? 0.05 : 1;
    const hoverDim =
      settings().desktopLyricHoverHide && shellHovered() ? 0.05 : 1;
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
    return {
      'font-size': `${fontPx}px`,
      opacity: String(opacity),
      'font-weight': settings().desktopLyricMetaBold ? '700' : undefined,
      'line-height': '1.35',
      ...(buildLyricTextEffectStyle({
        enabled: settings().desktopLyricUnplayedShadow,
        shadowColor: settings().desktopLyricUnplayedShadowColor,
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

  const shellHeightPx = () => {
    const fontSize = settings().desktopLyricFontSize ?? 20;
    const layout = settings().desktopLyricLayout;
    if (layout === 'single') return Math.max(80, fontSize * 4);
    if (layout === 'dual') return Math.max(120, fontSize * 7);
    return null;
  };

  return (
    <div
      class="lyric-desktop-shell relative flex w-screen select-none flex-col overflow-hidden text-white"
      classList={{
        'h-screen': shellHeightPx() == null,
      }}
      style={{
        'font-family': settings().desktopLyricFontFamily || undefined,
        background: 'var(--desktop-lyric-bg, rgba(0,0,0,0.85))',
        opacity: 'var(--desktop-lyric-content-opacity, 1)',
        transition: 'opacity 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        ...(shellHeightPx() != null ? { height: `${shellHeightPx()}px` } : {}),
      }}
      onMouseEnter={onShellMouseEnter}
      onMouseLeave={onShellMouseLeave}
      onMouseDown={startDrag}
      onDblClick={handleRootDblClick}
    >
      <ThemeTargetHost target="music.desktopLyric" class="contents">
        <LyricDesktopControlBar
          visible={chromeBarVisible()}
          locked={settings().desktopLyricLocked === true}
          playing={playing()}
          alwaysOnTop={settings().desktopLyricAlwaysOnTop !== false}
          zoomActive={settings().desktopLyricZoomActive !== false}
          penetrate={settings().desktopLyricPenetrate === true}
          playMode={playMode()}
          onEmitCommand={(action, payload) => void emitCommand(action, payload)}
          onPlayModeCycled={setPlayMode}
          onBarDrag={startDrag}
          onRequestPenetrate={applyPenetrateMode}
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
