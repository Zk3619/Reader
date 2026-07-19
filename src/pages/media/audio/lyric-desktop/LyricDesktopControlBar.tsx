/**
 * 桌面歌词悬停顶栏（对齐 LX ControlBar）
 * 右→左排列；关闭始终右上；锁定时仅解锁按钮带背景
 */

import { type Component, type JSX, Show, createSignal, createEffect } from 'solid-js';
import {
  ALargeSmall,
  Ban,
  FastForward,
  ListOrdered,
  Lock,
  MousePointer2,
  MousePointerClick,
  Pause,
  Pin,
  Play,
  Repeat,
  Repeat1,
  Rewind,
  Shuffle,
  SkipBack,
  SkipForward,
  Sun,
  SunDim,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-solid';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
} from '@/components/shared/AppTooltip';
import {
  getMusicSettings,
  setMusicSettings,
} from '@/lib/media/audio/music-settings';
import { setDesktopLyricEnabled } from '@/lib/media/audio/desktop-lyric-window';
import { playModeLabel } from '@/lib/media/audio/music-play-config';
import { AudioPlayMode } from '@/lib/media/audio/types';
import { isTauri } from '@/lib/platform/detect';
import { cn } from '@/lib/utils';

/** 桌面歌词窗专用暗色 Tooltip，不跟随主程序主题 */
const DESKTOP_LYRIC_TOOLTIP_CLASS =
  'border-neutral-700 bg-neutral-900 text-neutral-100 shadow-lg';

export type LyricDesktopControlBarProps = {
  /** 由外壳 mouseenter/leave 驱动，不依赖 CSS group-hover */
  visible: boolean;
  locked: boolean;
  playing: boolean;
  alwaysOnTop: boolean;
  zoomActive: boolean;
  penetrate: boolean;
  playMode: AudioPlayMode;
  onEmitCommand: (action: string, payload?: Record<string, unknown>) => void;
  onBarDrag: (e: MouseEvent) => void;
  onPlayModeCycled?: (mode: AudioPlayMode) => void;
  /** 即将开启穿透：等鼠标离开窗口后再 ignore，避免当场卡死无法关穿透 */
  onRequestPenetrate?: (enabled: boolean) => void;
};

function ControlBtn(props: {
  label: string;
  onClick: (e: MouseEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
  children: JSX.Element;
  active?: boolean;
  /** 顶栏隐藏时强制关掉 Portal tooltip，避免残留 */
  barVisible?: boolean;
}) {
  const [tooltipOpen, setTooltipOpen] = createSignal(false);
  createEffect(() => {
    if (props.barVisible === false) setTooltipOpen(false);
  });
  return (
    <AppTooltip
      open={props.barVisible === false ? false : tooltipOpen()}
      onOpenChange={(open) => {
        if (props.barVisible === false) {
          setTooltipOpen(false);
          return;
        }
        setTooltipOpen(open);
      }}
    >
      <AppTooltipTrigger as="div" class="inline-flex shrink-0">
        <button
          type="button"
          aria-label={props.label}
          class={cn(
            // 默认略淡，悬停全亮（与原先相反）
            'inline-flex h-9 w-9 shrink-0 items-center justify-center text-white/70 transition-colors hover:text-white',
            props.active && 'text-sky-300 hover:text-sky-200',
          )}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            props.onClick(e);
          }}
          onContextMenu={(e) => {
            if (!props.onContextMenu) return;
            e.preventDefault();
            e.stopPropagation();
            props.onContextMenu(e);
          }}
        >
          <span class="inline-flex h-4 w-4 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
            {props.children}
          </span>
        </button>
      </AppTooltipTrigger>
      <AppTooltipContent class={DESKTOP_LYRIC_TOOLTIP_CLASS}>{props.label}</AppTooltipContent>
    </AppTooltip>
  );
}

function PlayModeIcon(props: { mode: AudioPlayMode }) {
  const cls = 'h-4 w-4';
  switch (props.mode) {
    case AudioPlayMode.listEndStop:
      return <ListOrdered class={cls} />;
    case AudioPlayMode.singleLoop:
      return <Repeat1 class={cls} />;
    case AudioPlayMode.random:
      return <Shuffle class={cls} />;
    case AudioPlayMode.none:
      return <Ban class={cls} />;
    case AudioPlayMode.listLoop:
    default:
      return <Repeat class={cls} />;
  }
}

async function applyWindowOptions(): Promise<void> {
  if (!isTauri()) return;
  const next = getMusicSettings();
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_desktop_lyric_window_options', {
      alwaysOnTop: next.desktopLyricAlwaysOnTop,
      locked: next.desktopLyricLocked,
    });
  } catch {
    /* ignore */
  }
}

export const LyricDesktopControlBar: Component<LyricDesktopControlBarProps> = (props) => {
  const bumpFont = (delta: number) => {
    const cur = getMusicSettings().desktopLyricFontSize ?? 20;
    const next = Math.max(12, Math.min(80, cur + delta));
    if (next === cur) return;
    setMusicSettings({ desktopLyricFontSize: next });
  };

  const bumpOpacity = (delta: number) => {
    const cur = getMusicSettings().desktopLyricOpacity ?? 0.85;
    const next = Math.max(0, Math.min(1, Math.round((cur + delta) * 100) / 100));
    if (next === cur) return;
    setMusicSettings({ desktopLyricOpacity: next });
  };

  const toggleAlwaysOnTop = () => {
    const next = !getMusicSettings().desktopLyricAlwaysOnTop;
    setMusicSettings({ desktopLyricAlwaysOnTop: next });
    void applyWindowOptions();
  };

  const togglePenetrate = () => {
    const next = !getMusicSettings().desktopLyricPenetrate;
    setMusicSettings({ desktopLyricPenetrate: next });
    if (props.onRequestPenetrate) {
      props.onRequestPenetrate(next);
      return;
    }
    if (!isTauri()) return;
    const ignoreChrome = getMusicSettings().desktopLyricPenetrateIgnoreChrome ?? false;
    void import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke('set_desktop_lyric_penetrate_mode', { enabled: next, ignoreChrome }),
    );
  };

  const lockWindow = () => {
    setMusicSettings({ desktopLyricLocked: true });
    void applyWindowOptions();
  };

  const unlockWindow = () => {
    setMusicSettings({ desktopLyricLocked: false });
    void applyWindowOptions();
  };

  const toggleZoom = () => {
    setMusicSettings({
      desktopLyricZoomActive: !getMusicSettings().desktopLyricZoomActive,
    });
  };

  const closeWindow = () => {
    void setDesktopLyricEnabled(false);
  };

  const cyclePlayMode = async () => {
    const { cycleMusicPlayMode } = await import('@/lib/media/audio/music-play-config');
    const next = cycleMusicPlayMode();
    props.onPlayModeCycled?.(next);
    // 通知主窗同步 signal（勿在主窗再次 cycle，避免跳两档）
    props.onEmitCommand('set_play_mode', { mode: next });
  };

  const Btn = (
    p: Omit<Parameters<typeof ControlBtn>[0], 'barVisible'>,
  ) => <ControlBtn {...p} barVisible={props.visible} />;

  return (
    <div
      class={cn(
        'lyric-desktop-control-bar absolute inset-x-0 top-0 z-30 flex flex-row-reverse flex-wrap items-center justify-start transition-opacity duration-150',
        props.visible
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0',
        // 锁定时整栏透明，仅解锁按钮自带背景
        props.locked ? 'bg-transparent' : 'bg-black/70',
      )}
      onMouseDown={(e) => {
        if (props.locked) return;
        props.onBarDrag(e);
      }}
    >
      <Show
        when={!props.locked}
        fallback={
          <div class="rounded-bl-md bg-black/70">
            <Btn label="解锁歌词" onClick={unlockWindow}>
              <Unlock />
            </Btn>
          </div>
        }
      >
        {/* DOM 顺序 = 右→左：关闭 | 锁定 | 置顶 | 穿透 | … */}
        <Btn label="关闭桌面歌词" onClick={closeWindow}>
          <X />
        </Btn>
        <Btn label="锁定歌词" onClick={lockWindow}>
          <Lock />
        </Btn>
        <Btn
          label={props.alwaysOnTop ? '取消窗口置顶' : '窗口置顶'}
          active={props.alwaysOnTop}
          onClick={toggleAlwaysOnTop}
        >
          <Pin />
        </Btn>
        <Btn
          label={props.penetrate ? '关闭鼠标穿透' : '开启鼠标穿透'}
          active={props.penetrate}
          onClick={togglePenetrate}
        >
          {props.penetrate ? <MousePointerClick /> : <MousePointer2 />}
        </Btn>
        <Btn label="增大字号" onClick={() => bumpFont(2)}>
          <span class="relative inline-flex h-4 w-4 items-center justify-center">
            <ALargeSmall class="h-4 w-4" />
            <span class="absolute -right-0.5 -top-0.5 text-[8px] leading-none">+</span>
          </span>
        </Btn>
        <Btn label="减小字号" onClick={() => bumpFont(-2)}>
          <span class="relative inline-flex h-4 w-4 items-center justify-center">
            <ALargeSmall class="h-4 w-4" />
            <span class="absolute -right-0.5 -top-0.5 text-[8px] leading-none">−</span>
          </span>
        </Btn>
        <Btn
          label="增加不透明度（右键微调）"
          onClick={() => bumpOpacity(0.1)}
          onContextMenu={() => bumpOpacity(0.02)}
        >
          <Sun />
        </Btn>
        <Btn
          label="降低不透明度（右键微调）"
          onClick={() => bumpOpacity(-0.1)}
          onContextMenu={() => bumpOpacity(-0.02)}
        >
          <SunDim />
        </Btn>
        <Btn
          label={props.zoomActive ? '关闭当前行缩放' : '开启当前行缩放'}
          active={props.zoomActive}
          onClick={toggleZoom}
        >
          {props.zoomActive ? <ZoomOut /> : <ZoomIn />}
        </Btn>

        <span class="mx-1 h-4 w-px shrink-0 bg-white/20" aria-hidden="true" />

        <Btn
          label={`播放模式：${playModeLabel(props.playMode)}（点击切换）`}
          onClick={() => void cyclePlayMode()}
        >
          <PlayModeIcon mode={props.playMode} />
        </Btn>
        <Btn label="下一首" onClick={() => props.onEmitCommand('next')}>
          <SkipForward />
        </Btn>
        <Btn label="快进 10 秒" onClick={() => props.onEmitCommand('seek_forward')}>
          <FastForward />
        </Btn>
        <Btn
          label={props.playing ? '暂停' : '播放'}
          onClick={() => props.onEmitCommand(props.playing ? 'pause' : 'play')}
        >
          {props.playing ? <Pause /> : <Play />}
        </Btn>
        <Btn label="快退 10 秒" onClick={() => props.onEmitCommand('seek_back')}>
          <Rewind />
        </Btn>
        <Btn label="上一首" onClick={() => props.onEmitCommand('prev')}>
          <SkipBack />
        </Btn>
      </Show>
    </div>
  );
};
