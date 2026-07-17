/**
 * 播放详情页（对齐 LX Desktop/Mobile）
 * - 桌面双栏：封面信息 + 歌词，底部专属控制区
 * - 移动竖屏：封面/歌词分页切换
 * - 移动横屏：左封面控制 / 右歌词
 * - 可选独立全视口 / 隐藏顶栏
 */

import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
  type Component,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  ArrowLeft,
  AudioLines,
  Captions,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FastForward,
  Gauge,
  ListMusic,
  ListPlus,
  MessageSquare,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  Repeat1,
  Rewind,
  RotateCcw,
  Settings2,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Square,
  SquareActivity,
  Volume2,
  VolumeX,
  X,
} from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { MultiSwitch, type MultiSwitchOption } from '@/components/ui/multi-switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider, SliderFill, SliderThumb, SliderTrack } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
} from '@/components/shared/AppTooltip';
import { BookCoverPreviewDialog } from '@/components/books/BookCoverPreviewDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from '@/components/ui/resizable';
import { AudioLyricPanel } from '@/components/viewer/audio/AudioLyricPanel';
import { MusicQueuePane } from '@/components/viewer/audio/music/hub/MusicQueuePane';
import { MusicCommentPane } from '@/components/viewer/audio/music/hub/MusicCommentPane';
import { MusicAddToListDialog } from '@/components/viewer/audio/music/hub/MusicAddToListDialog';
import { MusicPlayDetailSettingsPopup } from '@/components/viewer/audio/music/hub/MusicPlayDetailSettingsPopup';
import { MusicPlayTimerDialog } from '@/components/viewer/audio/music/hub/MusicPlayTimerDialog';
import { MusicAudioVisualizer } from '@/components/viewer/audio/music/hub/MusicAudioVisualizer';
import { MusicPlaybackRateCombobox } from '@/components/viewer/audio/music/hub/MusicPlaybackRateCombobox';
import {
  MusicEqualizerEditor,
  MUSIC_EQ_PRESET_LABELS,
} from '@/components/viewer/audio/music/hub/MusicEqualizerEditor';
import { ThemeTargetHost } from '@/components/theme/ThemeTargetHost';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import {
  formatMusicTime,
  type useMusicHubPlayer,
} from '@/components/viewer/audio/music/hub/useMusicHubPlayer';
import {
  applyMusicTrack,
  getMusicSectionBeforeNowPlaying,
  playNextTrack,
  playPrevTrack,
  retryMusicTrackPlayback,
  setMusicSection,
} from '@/stores/viewer/media/audio';
import { setState } from '@/stores/viewer/media/state';
import { viewerStore } from '@/stores/viewer';
import { createMusicHubSession } from '@/lib/media/content-session';
import { AudioPlayMode } from '@/lib/media/audio/types';
import {
  playModeLabel,
  setMusicPlayMode,
} from '@/lib/media/audio/music-play-config';
import { EQ_PRESETS } from '@/lib/media/audio/engine/web-audio-player';
import {
  getMusicSettings,
  setMusicSettings,
  subscribeMusicSettings,
} from '@/lib/media/audio/music-settings';
import {
  QUALITY_PREFERENCE_LABELS,
  setPlayQuality,
  listPlayQualityPreferenceOptions,
  type MusicQualityPreference,
} from '@/lib/media/audio/music-quality';
import type { LyricTrackKind } from '@/lib/media/audio/lyric-types';
import { findMusic } from '@/lib/media/audio/music-sdk/find-music';
import {
  BUILTIN_SOURCE_LABELS,
  searchSourceLabel,
} from '@/lib/media/audio/online/source-router';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { trackAlbumName } from '@/lib/media/audio/music-search-result-ui';
import {
  copyTrackName,
  downloadTracks,
  openTrackSourceDetail,
  searchSimilarTrack,
} from '@/lib/media/audio/music-context-actions';
import { isTauri } from '@/lib/platform/detect';
import { SHELL_SIDEBAR_MIN_WIDTH } from '@/lib/shell/layout';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
  ViewerAppDrawer,
  ViewerAppDrawerBody,
  ViewerAppDrawerContent,
  ViewerAppDrawerHeader,
} from '@/components/viewer/viewer-app-overlay';

const LYRIC_TRACKS = ['lyric', 'tlyric', 'rlyric', 'lxlyric'] as const;
const LYRIC_TRACK_LABELS: Record<(typeof LYRIC_TRACKS)[number], string> = {
  lyric: '原文',
  tlyric: '翻译',
  rlyric: '罗马音',
  lxlyric: '逐字',
};
const PLAY_MODE_OPTIONS: MultiSwitchOption<AudioPlayMode>[] = [
  { value: AudioPlayMode.listEndStop, label: '列表结束停止', icon: Square },
  { value: AudioPlayMode.singleLoop, label: '单曲循环', icon: Repeat1 },
  { value: AudioPlayMode.random, label: '随机播放', icon: Shuffle },
  { value: AudioPlayMode.listLoop, label: '列表循环', icon: Repeat },
];
const EQ_PRESET_KEYS = Object.keys(EQ_PRESETS) as (keyof typeof EQ_PRESETS)[];

type DetailSidePane = 'comments' | 'queue' | null;

export interface MusicPlayDetailProps {
  player: ReturnType<typeof useMusicHubPlayer>;
}

function useLandscape(): () => boolean {
  const [landscape, setLandscape] = createSignal(
    typeof window !== 'undefined'
      ? window.matchMedia('(orientation: landscape) and (max-height: 720px)').matches ||
          window.innerWidth / Math.max(window.innerHeight, 1) > 1.2
      : false,
  );
  onMount(() => {
    let raf = 0;
    const update = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const ratio = window.innerWidth / Math.max(window.innerHeight, 1);
        const next =
          window.matchMedia('(orientation: landscape)').matches && ratio > 1.15;
        setLandscape((prev) => (prev === next ? prev : next));
      });
    };
    update();
    window.addEventListener('resize', update);
    onCleanup(() => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
    });
  });
  return landscape;
}

export const MusicPlayDetail: Component<MusicPlayDetailProps> = (props) => {
  const shell = useShellLayout();
  const isMobile = () => shell().useMobileShell;
  const landscape = useLandscape();

  const [addOpen, setAddOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [eqEditorOpen, setEqEditorOpen] = createSignal(false);
  const [coverPreviewOpen, setCoverPreviewOpen] = createSignal(false);
  const [playTimerOpen, setPlayTimerOpen] = createSignal(false);
  const [sidePane, setSidePane] = createSignal<DetailSidePane>(null);
  const [pageIndex, setPageIndex] = createSignal(0);
  const [eqPreset, setEqPreset] = createSignal<keyof typeof EQ_PRESETS>(
    getMusicSettings().eqPreset ?? 'flat',
  );
  const [playSpeed, setPlaySpeed] = createSignal(getMusicSettings().playSpeed ?? 1);
  const [musicSettings, setMusicSettingsSignal] = createSignal(getMusicSettings());
  const [altSources, setAltSources] = createSignal<AudioTrack[]>([]);
  const [altLoading, setAltLoading] = createSignal(false);
  const [altError, setAltError] = createSignal<string | null>(null);
  const [desktopLyricOpen, setDesktopLyricOpen] = createSignal(false);
  const [coverBroken, setCoverBroken] = createSignal(false);
  let altRequestId = 0;
  let touchStartX = 0;

  onMount(() => {
    const unsubscribe = subscribeMusicSettings((settings) => {
      setPlaySpeed(settings.playSpeed);
      setEqPreset(settings.eqPreset);
      setMusicSettingsSignal(settings);
    });
    onCleanup(unsubscribe);
  });

  const track = () => props.player.currentTrack();
  const coverUrl = createMemo(() => {
    const url = track()?.meta?.coverUrl;
    return typeof url === 'string' && url.trim() ? url : '';
  });
  const standalone = () => musicSettings().playDetailStandalone === true;
  const hideHeader = () => musicSettings().playDetailHideHeader === true;
  const desktopSidePaneDrawer = () =>
    !isMobile() && musicSettings().playDetailDesktopSidePaneDrawer === true;
  const embeddedSidePaneOpen = () =>
    !isMobile() && !desktopSidePaneDrawer() && sidePane() != null;
  /** 桌面播放详情统一使用 md（768）断点：底部按钮单/双行、封面歌词横/竖布局。 */
  const isDesktopMdUp = () => !isMobile() && shell().windowWidth >= SHELL_SIDEBAR_MIN_WIDTH;
  const compactDesktopLayout = () => !isMobile() && !isDesktopMdUp();
  const drawerSide = () =>
    (!isMobile() || isDesktopMdUp() ? 'right' : 'bottom') as 'bottom' | 'right';
  const customEqGains = () =>
    musicSettings().eqCustomGains ?? EQ_PRESETS[musicSettings().eqPreset] ?? EQ_PRESETS.flat;

  createEffect(() => {
    void coverUrl();
    setCoverBroken(false);
    setAltSources([]);
    setAltError(null);
  });

  const statusText = createMemo(() => {
    if (props.player.error()) return props.player.error();
    if (props.player.loading()) return props.player.playbackStatus() || '加载中…';
    return props.player.playbackStatus();
  });

  const bufferedRatio = createMemo(() => {
    const duration = props.player.player.duration();
    const buffered = props.player.player.bufferedEnd();
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    return Math.max(0, Math.min(1, buffered / duration));
  });

  const lyricTrackOptions = createMemo(() =>
    LYRIC_TRACKS.filter((kind) => {
      const s = musicSettings();
      if (kind === 'tlyric' && s.showLyricTranslation === false) return false;
      if (kind === 'rlyric' && s.showLyricRoma === false) return false;
      if (kind === 'lxlyric' && s.lyricUseLxLyric === false) return false;
      return true;
    }),
  );

  const loadAltSources = async () => {
    const t = track();
    if (!t) return;
    const requestId = ++altRequestId;
    setAltLoading(true);
    setAltError(null);
    try {
      const list = await findMusic(t);
      if (requestId !== altRequestId || track()?.id !== t.id) return;
      setAltSources(list);
      if (list.length === 0) setAltError('未匹配到可用音源');
    } catch (error) {
      if (requestId !== altRequestId) return;
      setAltError(error instanceof Error ? error.message : '换源匹配失败');
    } finally {
      if (requestId === altRequestId) setAltLoading(false);
    }
  };

  const switchToAlt = async (alt: AudioTrack) => {
    const queue = [...viewerStore.state.trackQueue];
    const idx = viewerStore.state.trackIndex;
    if (idx < 0 || idx >= queue.length) return;
    queue[idx] = alt;
    setState({
      trackQueue: queue,
      trackIndex: idx,
      activeSource: alt.source,
      contentSession: createMusicHubSession(queue, idx),
    });
    await applyMusicTrack(idx, { forceRefreshUrl: true });
    setAltSources([]);
  };

  const applySpeed = (speed: number) => {
    const next = Math.max(0.5, Math.min(3, speed));
    if (next === playSpeed()) {
      props.player.player.setPlaybackRate(next);
      return;
    }
    setPlaySpeed(next);
    setMusicSettings({ playSpeed: next });
    props.player.player.setPlaybackRate(next);
  };

  const applyEq = (preset: keyof typeof EQ_PRESETS) => {
    setEqPreset(preset);
    setMusicSettings({ eqPreset: preset, eqCustomGains: null });
    props.player.getWebAudio()?.applyEqPreset(preset);
  };

  const updateEqBand = (index: number, value: number) => {
    const next = [...customEqGains()];
    next[index] = value;
    setMusicSettings({ eqCustomGains: next });
    props.player.getWebAudio()?.applyCustomEq(next);
  };

  const openEqEditor = () => {
    if (!musicSettings().eqCustomGains) {
      const gains = [...(EQ_PRESETS[eqPreset()] ?? EQ_PRESETS.flat)];
      setMusicSettings({ eqCustomGains: gains });
      props.player.getWebAudio()?.applyCustomEq(gains);
    }
    setEqEditorOpen(true);
  };

  const applyPlayMode = (mode: AudioPlayMode) => {
    setMusicPlayMode(mode);
    props.player.setMusicPlayMode(mode);
  };

  const changeQuality = async (value: MusicQualityPreference) => {
    setPlayQuality(value);
    setMusicSettingsSignal(getMusicSettings());
    if (track()) await applyMusicTrack(viewerStore.state.trackIndex, { forceRefreshUrl: true });
  };

  const toggleDesktopLyric = async (open: boolean) => {
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke(open ? 'open_desktop_lyric_window' : 'close_desktop_lyric_window');
    setDesktopLyricOpen(open);
  };

  const leaveDetail = () => {
    setSidePane(null);
    setMusicSection(getMusicSectionBeforeNowPlaying());
  };

  const toggleSidePane = (pane: Exclude<DetailSidePane, null>) => {
    setSidePane((current) => (current === pane ? null : pane));
  };

  const onTouchStart = (event: TouchEvent) => {
    touchStartX = event.changedTouches[0]?.clientX ?? 0;
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (!isMobile() || landscape()) return;
    const endX = event.changedTouches[0]?.clientX ?? 0;
    const delta = endX - touchStartX;
    if (Math.abs(delta) < 48) return;
    if (delta < 0) setPageIndex(1);
    else setPageIndex(0);
  };

  const metaLine = createMemo(() => {
    const t = track();
    if (!t) return '';
    const parts = [
      searchSourceLabel(t.source as never),
      typeof t.meta.bitrate === 'string' ? t.meta.bitrate : '',
    ].filter(Boolean);
    return parts.join(' · ');
  });

  const iconGhostBtn = (opts: {
    label: string;
    disabled?: boolean;
    onClick?: () => void;
    children: JSX.Element;
    class?: string;
    pressed?: boolean;
  }): JSX.Element => (
    <AppTooltip>
      <AppTooltipTrigger as="div">
        <Button
          variant="ghost"
          size="icon"
          class={cn('h-9 w-9', opts.pressed && 'bg-accent', opts.class)}
          aria-label={opts.label}
          disabled={opts.disabled}
          onClick={opts.onClick}
        >
          {opts.children}
        </Button>
      </AppTooltipTrigger>
      <AppTooltipContent layer="viewer">{opts.label}</AppTooltipContent>
    </AppTooltip>
  );

  const optionList = <T extends string>(opts: {
    values: readonly T[];
    value: T;
    label: (value: T) => string;
    onSelect: (value: T) => void;
  }): JSX.Element => (
    <div class="flex max-h-64 flex-col gap-0.5 overflow-y-auto p-1">
      <For each={[...opts.values]}>
        {(value) => (
          <Button
            type="button"
            variant={opts.value === value ? 'secondary' : 'ghost'}
            size="sm"
            class="h-8 justify-start px-2 text-xs"
            onClick={() => opts.onSelect(value)}
          >
            {opts.label(value)}
          </Button>
        )}
      </For>
    </div>
  );

  const moreMenu = (): JSX.Element => (
    <DropdownMenu>
      <AppTooltip>
        <AppTooltipTrigger as="div">
          <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9">
            <MoreHorizontal class="h-4 w-4" />
            <span class="sr-only">更多操作</span>
          </DropdownMenuTrigger>
        </AppTooltipTrigger>
        <AppTooltipContent layer="viewer">更多</AppTooltipContent>
      </AppTooltip>
      <DropdownMenuContent class="z-135">
        <DropdownMenuItem
          disabled={!track() || track()?.source === 'local'}
          onSelect={() => track() && void downloadTracks([track()!])}
        >
          下载
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!track()}
          onSelect={() => track() && void copyTrackName(track()!)}
        >
          复制歌曲名
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!track()}
          onSelect={() => track() && void openTrackSourceDetail(track()!)}
        >
          歌曲详情页
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!track()}
          onSelect={() => track() && searchSimilarTrack(track()!)}
        >
          搜索相似
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const headerActions = (): JSX.Element => (
    <div class="flex items-center gap-0.5">
      {iconGhostBtn({
        label:
          musicSettings().playTimerTargetAt > Date.now() ? '播放定时已启用' : '播放定时',
        pressed: musicSettings().playTimerTargetAt > Date.now(),
        onClick: () => setPlayTimerOpen(true),
        children: <Clock3 class="h-4 w-4" />,
      })}
      {iconGhostBtn({
        label: '评论',
        pressed: sidePane() === 'comments',
        onClick: () => toggleSidePane('comments'),
        children: <MessageSquare class="h-4 w-4" />,
      })}
      {iconGhostBtn({
        label: '播放队列',
        pressed: sidePane() === 'queue',
        onClick: () => toggleSidePane('queue'),
        children: <ListMusic class="h-4 w-4" />,
      })}
      {iconGhostBtn({
        label: '播放详情设置',
        onClick: () => setSettingsOpen(true),
        children: <Settings2 class="h-4 w-4" />,
      })}
      {moreMenu()}
    </div>
  );

  const lyricPanel = (className?: string): JSX.Element => (
    <AudioLyricPanel
      class={cn('min-h-0 flex-1', className)}
      lyric={props.player.fetchedLyric()}
      bundle={props.player.fetchedLyricBundle()}
      lyricTrack={props.player.lyricTrack()}
      positionSec={props.player.player.currentTime()}
      lyricOffset={musicSettings().lyricOffset ?? 0}
      showTranslation={musicSettings().showLyricTranslation !== false}
      showRoma={musicSettings().showLyricRoma !== false}
      secondaryOrder={musicSettings().lyricSecondaryOrder}
      align={musicSettings().playDetailLyricAlign}
      fontSize={musicSettings().playDetailLyricFontSize}
      zoomActiveLyric={musicSettings().playDetailZoomActiveLyric}
      scrollDelayMs={musicSettings().playDetailLyricScrollDelayMs}
      allowProgressPreview={musicSettings().playDetailAllowLyricSeek}
      onSeek={
        musicSettings().playDetailAllowLyricSeek
          ? (positionSec) =>
              props.player.player.seekTo(positionSec, props.player.player.playing())
          : undefined
      }
      active={viewerStore.state.musicSection === 'nowPlaying'}
    />
  );

  const sidePaneContent = (): JSX.Element => (
    <Show when={sidePane() === 'comments'} fallback={<MusicQueuePane />}>
      <MusicCommentPane track={track()} />
    </Show>
  );

  const sidePaneTitle = () => {
    if (sidePane() === 'comments') return '歌曲评论';
    const source = viewerStore.state.playerListName;
    const count = viewerStore.state.trackQueue.length;
    return source ? `播放队列 · ${source}（${count}）` : `播放队列 · ${count}`;
  };

  const sidePanePanel = (): JSX.Element => (
    <aside class="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-background/80 shadow-sm backdrop-blur">
      <div class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3">
        <div class="flex min-w-0 items-center gap-2">
          <Show
            when={sidePane() === 'comments'}
            fallback={<ListMusic class="h-4 w-4 shrink-0 text-primary" />}
          >
            <MessageSquare class="h-4 w-4 shrink-0 text-primary" />
          </Show>
          <p class="truncate text-sm font-semibold">{sidePaneTitle()}</p>
        </div>
        {iconGhostBtn({
          label: '关闭面板',
          onClick: () => setSidePane(null),
          class: 'h-8 w-8 shrink-0',
          children: <X class="h-4 w-4" />,
        })}
      </div>
      <div class="flex min-h-0 flex-1 flex-col p-3">{sidePaneContent()}</div>
    </aside>
  );

  const coverBlock = (sizeClass: string): JSX.Element => (
    <button
      type="button"
      class={cn(
        'relative overflow-hidden rounded-xl bg-muted shadow-lg outline-none transition-shadow disabled:cursor-default',
        coverUrl() &&
          !coverBroken() &&
          'cursor-zoom-in hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring',
        sizeClass,
      )}
      disabled={!coverUrl() || coverBroken()}
      aria-label={coverUrl() && !coverBroken() ? '预览专辑封面' : '暂无专辑封面'}
      onClick={() => {
        if (!coverUrl() || coverBroken()) return;
        setCoverPreviewOpen(true);
      }}
    >
      <Show
        when={coverUrl() && !coverBroken()}
        fallback={
          <div class="flex h-full w-full items-center justify-center text-muted-foreground">
            <Music2 class="h-16 w-16 opacity-50" />
          </div>
        }
      >
        <img
          src={coverUrl()}
          alt=""
          class="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.02]"
          onError={() => setCoverBroken(true)}
        />
      </Show>
    </button>
  );

  const infoBlock = (centered = true, className?: string): JSX.Element => (
    <div
      class={cn(
        'min-w-0 space-y-1',
        centered ? 'text-center' : 'text-left',
        className,
      )}
    >
      <p class="truncate text-lg font-semibold">{track()?.name ?? '选择音乐开始播放'}</p>
      <p class="truncate text-sm text-muted-foreground">{track()?.artist || '未知艺术家'}</p>
      <Show when={track() && trackAlbumName(track()!)}>
        <p class="truncate text-xs text-muted-foreground">专辑：{trackAlbumName(track()!)}</p>
      </Show>
      <Show when={metaLine()}>
        <p class="truncate text-xs text-muted-foreground/80">{metaLine()}</p>
      </Show>
      <Show when={statusText()}>
        <p
          class={cn(
            'text-xs',
            props.player.error() ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {statusText()}
        </p>
      </Show>
    </div>
  );

  const progressBlock = (): JSX.Element => (
    <div class="w-full space-y-1">
      <div class="relative">
        <div class="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
          <div
            class="h-full bg-muted-foreground/25"
            style={{ width: `${bufferedRatio() * 100}%` }}
          />
        </div>
        <Slider
          class="group relative"
          disabled={!track() || !musicSettings().allowProgressBarSeek}
          minValue={0}
          maxValue={Math.max(props.player.player.duration(), 1)}
          step={0.1}
          value={[props.player.player.currentTime()]}
          onChange={(v) =>
            props.player.player.seekTo(v[0] ?? 0, props.player.player.playing())
          }
        >
          <SliderTrack class="h-1 bg-transparent">
            <SliderFill />
            <SliderThumb class="size-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" />
          </SliderTrack>
        </Slider>
      </div>
      <div class="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
        <span>{formatMusicTime(props.player.player.currentTime())}</span>
        <span>{formatMusicTime(props.player.player.duration())}</span>
      </div>
    </div>
  );

  const transportBlock = (): JSX.Element => (
    <div class="flex items-center justify-center gap-2">
      <AppTooltip>
        <AppTooltipTrigger as="div">
          <MultiSwitch
            options={PLAY_MODE_OPTIONS}
            value={props.player.musicPlayMode}
            onChange={applyPlayMode}
          >
            {(option) => {
              const Icon = option.icon ?? ListMusic;
              return <Icon class="h-4 w-4" aria-label={playModeLabel(option.value)} />;
            }}
          </MultiSwitch>
        </AppTooltipTrigger>
        <AppTooltipContent layer="viewer">
          {playModeLabel(props.player.musicPlayMode())}
        </AppTooltipContent>
      </AppTooltip>

      <Button
        variant="ghost"
        size="icon"
        class="h-11 w-11"
        aria-label="上一首"
        disabled={!track()}
        onClick={() => void playPrevTrack()}
      >
        <SkipBack class="h-5 w-5" />
      </Button>
      {iconGhostBtn({
        label: '快退 5 秒',
        disabled: !track(),
        onClick: () =>
          props.player.player.seekTo(
            Math.max(0, props.player.player.currentTime() - 5),
            props.player.player.playing(),
          ),
        class: 'h-10 w-10',
        children: <Rewind class="h-4 w-4" />,
      })}
      <Button
        size="icon"
        class="h-14 w-14"
        aria-label={props.player.player.playing() ? '暂停' : '播放'}
        disabled={!track() && !props.player.url()}
        onClick={() => {
          void props.player.getWebAudio()?.resume();
          props.player.player.togglePlay();
        }}
      >
        <Show when={props.player.player.playing()} fallback={<Play class="h-7 w-7" />}>
          <Pause class="h-7 w-7" />
        </Show>
      </Button>
      {iconGhostBtn({
        label: '快进 5 秒',
        disabled: !track(),
        onClick: () =>
          props.player.player.seekTo(
            props.player.player.currentTime() + 5,
            props.player.player.playing(),
          ),
        class: 'h-10 w-10',
        children: <FastForward class="h-4 w-4" />,
      })}
      <Button
        variant="ghost"
        size="icon"
        class="h-11 w-11"
        aria-label="下一首"
        disabled={!track()}
        onClick={() => void playNextTrack()}
      >
        <SkipForward class="h-5 w-5" />
      </Button>

      {iconGhostBtn({
        label: '添加到歌单',
        disabled: !track(),
        onClick: () => setAddOpen(true),
        class: 'h-10 w-10',
        children: <ListPlus class="h-5 w-5" />,
      })}
    </div>
  );

  const leftToolGroup = (): JSX.Element => (
    <>
      <Popover>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <PopoverTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9" aria-label="播放音质">
              <Music2 class="h-4 w-4" />
            </PopoverTrigger>
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">
            音质 · {QUALITY_PREFERENCE_LABELS[musicSettings().playQualityPreference]}
          </AppTooltipContent>
        </AppTooltip>
        <PopoverContent class="z-135 w-40 p-1">
          {optionList({
            values: listPlayQualityPreferenceOptions(),
            value: musicSettings().playQualityPreference,
            label: (v) => QUALITY_PREFERENCE_LABELS[v],
            onSelect: (v) => void changeQuality(v),
          })}
        </PopoverContent>
      </Popover>

      <Popover>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <PopoverTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-9 w-9"
              aria-label={`播放倍速 ${playSpeed()} 倍`}
            >
              <Gauge class="h-4 w-4" />
            </PopoverTrigger>
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">倍速 · {playSpeed()}x</AppTooltipContent>
        </AppTooltip>
        <PopoverContent class="z-135 w-56 p-3">
          <div class="space-y-3">
            <div class="flex items-center gap-3">
              <Slider
                class="flex-1"
                minValue={0.5}
                maxValue={3}
                step={0.05}
                value={[playSpeed()]}
                onChange={(value) => applySpeed(value[0] ?? 1)}
              >
                <SliderTrack>
                  <SliderFill />
                  <SliderThumb />
                </SliderTrack>
              </Slider>
              <span class="w-12 text-right text-sm tabular-nums">{playSpeed().toFixed(2)}x</span>
            </div>
            <MusicPlaybackRateCombobox
              value={playSpeed()}
              onChange={applySpeed}
              contentClass="z-135"
            />
            <p class="text-xs text-muted-foreground">范围 0.5x–3x，可选预设或自定义</p>
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <PopoverTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9" aria-label="均衡器">
              <SlidersHorizontal class="h-4 w-4" />
            </PopoverTrigger>
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">
            均衡器 ·{' '}
            {musicSettings().eqCustomGains
              ? '自定义'
              : (MUSIC_EQ_PRESET_LABELS[eqPreset()] ?? eqPreset())}
          </AppTooltipContent>
        </AppTooltip>
        <PopoverContent class="z-135 w-56 p-1">
          <div class="flex max-h-64 flex-col gap-0.5 overflow-y-auto p-1">
            <For each={EQ_PRESET_KEYS}>
              {(preset) => (
                <Button
                  type="button"
                  variant={
                    !musicSettings().eqCustomGains && eqPreset() === preset
                      ? 'secondary'
                      : 'ghost'
                  }
                  size="sm"
                  class="h-8 justify-start px-2 text-xs"
                  onClick={() => applyEq(preset)}
                >
                  {MUSIC_EQ_PRESET_LABELS[preset] ?? String(preset)}
                </Button>
              )}
            </For>
          </div>
          <div class="border-t p-1">
            <Button
              type="button"
              variant={musicSettings().eqCustomGains ? 'secondary' : 'ghost'}
              size="sm"
              class="h-8 w-full justify-start px-2 text-xs"
              onClick={openEqEditor}
            >
              自定义频率增益…
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <PopoverTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9" aria-label="音量">
              <Show
                when={!props.player.musicMuted() && props.player.musicVolume() > 0}
                fallback={<VolumeX class="h-4 w-4" />}
              >
                <Volume2 class="h-4 w-4" />
              </Show>
            </PopoverTrigger>
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">音量</AppTooltipContent>
        </AppTooltip>
        <PopoverContent class="z-135 w-52 p-3">
          <div class="space-y-3">
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="tabular-nums">{Math.round(props.player.musicVolume() * 100)}%</span>
              <div class="flex items-center gap-2">
                <Checkbox
                  id="music-detail-muted"
                  checked={props.player.musicMuted()}
                  onChange={props.player.setMusicMuted}
                />
                <Label for="music-detail-muted">静音</Label>
              </div>
            </div>
            <Slider
              minValue={0}
              maxValue={100}
              step={1}
              value={[Math.round(props.player.musicVolume() * 100)]}
              onChange={(value) => {
                props.player.setMusicVolume((value[0] ?? 0) / 100);
                if ((value[0] ?? 0) > 0) props.player.setMusicMuted(false);
              }}
            >
              <SliderTrack>
                <SliderFill />
                <SliderThumb />
              </SliderTrack>
            </Slider>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );

  const rightToolGroup = (): JSX.Element => (
    <>
      <Popover>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <PopoverTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-9 w-9"
              aria-label="歌词轨"
            >
              <Captions class="h-4 w-4" />
            </PopoverTrigger>
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">
            歌词轨 ·{' '}
            {LYRIC_TRACK_LABELS[
              props.player.lyricTrack() as keyof typeof LYRIC_TRACK_LABELS
            ] ?? props.player.lyricTrack()}
          </AppTooltipContent>
        </AppTooltip>
        <PopoverContent class="z-135 w-36 p-1">
          {optionList({
            values: lyricTrackOptions(),
            value: props.player.lyricTrack() as (typeof LYRIC_TRACKS)[number],
            label: (value) => LYRIC_TRACK_LABELS[value],
            onSelect: (kind) => {
              props.player.setLyricTrack(kind as LyricTrackKind);
              setMusicSettings({ lyricTrack: kind as LyricTrackKind });
            },
          })}
        </PopoverContent>
      </Popover>

      {iconGhostBtn({
        label: altLoading() ? '匹配中…' : '换源',
        disabled: !track() || altLoading(),
        onClick: () => void loadAltSources(),
        children: <RefreshCw class={cn('h-4 w-4', altLoading() && 'animate-spin')} />,
      })}

      <Show when={props.player.error()}>
        {iconGhostBtn({
          label: '重试',
          onClick: () => void retryMusicTrackPlayback(),
          children: <RotateCcw class="h-4 w-4" />,
        })}
      </Show>

      <AppTooltip>
        <AppTooltipTrigger as="div">
          <Toggle
            pressed={desktopLyricOpen()}
            onChange={(open) => void toggleDesktopLyric(open)}
            class="h-9 w-9 p-0 data-pressed:bg-accent"
            aria-label={desktopLyricOpen() ? '关闭桌面歌词' : '打开桌面歌词'}
            disabled={!track() || !isTauri()}
          >
            <SquareActivity class="h-4 w-4" />
          </Toggle>
        </AppTooltipTrigger>
        <AppTooltipContent layer="viewer">
          {isTauri()
            ? desktopLyricOpen()
              ? '关闭桌面歌词'
              : '打开桌面歌词'
            : '桌面歌词仅客户端可用'}
        </AppTooltipContent>
      </AppTooltip>

      <AppTooltip>
        <AppTooltipTrigger as="div">
          <Toggle
            pressed={musicSettings().audioVisualizationEnabled}
            onChange={(enabled) => setMusicSettings({ audioVisualizationEnabled: enabled })}
            class="h-9 w-9 p-0 data-pressed:bg-accent"
            aria-label={
              musicSettings().audioVisualizationEnabled ? '关闭音频可视化' : '打开音频可视化'
            }
          >
            <AudioLines class="h-4 w-4" />
          </Toggle>
        </AppTooltipTrigger>
        <AppTooltipContent layer="viewer">
          {musicSettings().audioVisualizationEnabled ? '关闭音频可视化' : '打开音频可视化'}
        </AppTooltipContent>
      </AppTooltip>
    </>
  );

  /** <md 双行：第一行播放控制（播放键居中），第二行工具；md+ 单行：左工具 | 播放 | 右工具 */
  const controlsBlock = (): JSX.Element => (
    <div class="flex flex-col items-center gap-2 md:flex-row md:items-center">
      <div class="flex w-full items-center justify-center md:hidden">{transportBlock()}</div>
      <div class="flex w-full flex-wrap items-center justify-center gap-0.5 md:contents">
        <div class="flex flex-wrap items-center justify-center gap-0.5 md:min-w-0 md:flex-1 md:justify-start">
          {leftToolGroup()}
        </div>
        <div class="hidden shrink-0 px-3 md:flex md:items-center md:justify-center">
          {transportBlock()}
        </div>
        <div class="flex flex-wrap items-center justify-center gap-0.5 md:min-w-0 md:flex-1 md:justify-end">
          {rightToolGroup()}
        </div>
      </div>
    </div>
  );

  const altSourceRow = (): JSX.Element => (
    <Show when={altSources().length > 0 || altError()}>
      <div class="flex flex-wrap justify-center gap-1">
        <Show when={altError()}>
          <p class="w-full text-center text-xs text-destructive">{altError()}</p>
        </Show>
        <For each={altSources()}>
          {(alt) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-auto px-2 py-0.5 text-xs"
              onClick={() => void switchToAlt(alt)}
            >
              {BUILTIN_SOURCE_LABELS[alt.source] ?? alt.source}
            </Button>
          )}
        </For>
      </div>
    </Show>
  );

  const controlFooter = (): JSX.Element => (
    <div class="shrink-0 space-y-3 border-t bg-background/95 px-4 py-3 backdrop-blur">
      {progressBlock()}
      {controlsBlock()}
      {altSourceRow()}
      <Show when={musicSettings().audioVisualizationEnabled}>
        <MusicAudioVisualizer
          engine={props.player.getWebAudio}
          active={viewerStore.state.musicSection === 'nowPlaying'}
        />
      </Show>
    </div>
  );

  const floatingHeaderControls = (): JSX.Element => (
    <div class="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-3 pt-3">
      <div class="pointer-events-auto">
        {iconGhostBtn({
          label: '返回',
          onClick: leaveDetail,
          children: <ArrowLeft class="h-5 w-5" />,
        })}
      </div>
      <div class="pointer-events-auto">{headerActions()}</div>
    </div>
  );

  const desktopPrimaryContent = (): JSX.Element => (
    <div
      class={cn(
        'flex h-full min-h-0 min-w-0 flex-1 overflow-hidden',
        compactDesktopLayout() ? 'flex-col gap-3' : 'gap-6',
      )}
    >
      <div
        class={cn(
          'flex shrink-0 items-center gap-4 transition-[width] duration-200',
          compactDesktopLayout()
            ? 'w-full justify-center'
            : embeddedSidePaneOpen()
              ? 'w-[28%] min-w-44 max-w-60 flex-col justify-center'
              : 'w-[34%] min-w-48 max-w-sm flex-col justify-center',
        )}
      >
        {coverBlock(
          compactDesktopLayout()
            ? 'aspect-square h-28 w-28 shrink-0'
            : embeddedSidePaneOpen()
              ? 'aspect-square mx-auto w-full max-w-60'
              : 'aspect-square mx-auto w-full max-w-xs',
        )}
        {infoBlock(
          !compactDesktopLayout(),
          compactDesktopLayout() ? 'max-w-[min(18rem,52%)] shrink' : undefined,
        )}
      </div>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">{lyricPanel()}</div>
    </div>
  );

  const desktopContent = (): JSX.Element => (
    <Switch>
      <Match when={embeddedSidePaneOpen()}>
        <Resizable class="min-h-0 min-w-0 flex-1 gap-2 overflow-hidden">
          <ResizablePanel
            initialSize={0.72}
            minSize={0.55}
            class="min-h-0 min-w-0 overflow-hidden"
          >
            <div class="h-full min-h-0 pr-1">{desktopPrimaryContent()}</div>
          </ResizablePanel>
          <ResizableHandle withHandle class="bg-border/60" />
          <ResizablePanel
            initialSize={0.28}
            minSize={0.22}
            class="min-h-0 min-w-68 overflow-hidden"
          >
            {sidePanePanel()}
          </ResizablePanel>
        </Resizable>
      </Match>
      <Match when={true}>{desktopPrimaryContent()}</Match>
    </Switch>
  );

  const desktopLayout = (): JSX.Element => (
    <div class="flex min-h-0 flex-1 flex-col">
      <div
        class={cn(
          'flex min-h-0 flex-1 overflow-hidden px-6',
          hideHeader() ? 'pb-4 pt-14' : 'py-4',
        )}
      >
        {desktopContent()}
      </div>
      {controlFooter()}
    </div>
  );

  const mobilePortraitLayout = (): JSX.Element => (
    <div class="flex min-h-0 flex-1 flex-col">
      <div
        class={cn('relative min-h-0 flex-1 overflow-hidden', hideHeader() && 'pt-12')}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          class="flex h-full w-[200%] transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${pageIndex() * 50}%)` }}
        >
          <div class="flex h-full w-1/2 flex-col items-center justify-center gap-4 px-6">
            {coverBlock('aspect-square mx-auto w-[min(72vw,20rem)]')}
            {infoBlock(true)}
            <Button
              variant="ghost"
              size="sm"
              class="gap-1 text-xs text-muted-foreground"
              onClick={() => setPageIndex(1)}
            >
              查看歌词
              <ChevronRight class="h-3.5 w-3.5" />
            </Button>
          </div>
          <div class="flex h-full w-1/2 flex-col px-2">
            <Button
              variant="ghost"
              size="sm"
              class="mx-auto mb-1 w-fit gap-1 text-xs text-muted-foreground"
              onClick={() => setPageIndex(0)}
            >
              <ChevronLeft class="h-3.5 w-3.5" />
              返回封面
            </Button>
            {lyricPanel()}
          </div>
        </div>
      </div>
      {controlFooter()}
    </div>
  );

  const mobileLandscapeLayout = (): JSX.Element => (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class={cn('flex min-h-0 flex-1 overflow-hidden', hideHeader() && 'pt-10')}>
        <div class="flex w-[42%] min-w-0 flex-col justify-center gap-3 px-4 py-2">
          {coverBlock('aspect-square mx-auto w-full max-w-[12rem]')}
          {infoBlock(true)}
          {progressBlock()}
        </div>
        <div class="flex min-h-0 min-w-0 flex-1 flex-col border-l px-2 py-2">
          {lyricPanel()}
        </div>
      </div>
      <div class="shrink-0 space-y-2 border-t px-3 py-2">
        {controlsBlock()}
        {altSourceRow()}
        <Show when={musicSettings().audioVisualizationEnabled}>
          <MusicAudioVisualizer
            engine={props.player.getWebAudio}
            active={viewerStore.state.musicSection === 'nowPlaying'}
          />
        </Show>
      </div>
    </div>
  );

  const detailBody = (): JSX.Element => (
    <ThemeTargetHost target="music.playDetail">
      <section
        class={cn(
          'relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background',
          standalone() && 'h-full w-full',
        )}
      >
        <Show when={coverUrl() && !coverBroken()}>
          <div
            class="pointer-events-none absolute inset-0 opacity-25"
            style={{
              'background-image': `url(${coverUrl()})`,
              'background-size': 'cover',
              'background-position': 'center',
              filter: 'blur(40px) saturate(1.1)',
              transform: 'scale(1.1)',
            }}
          />
          <div class="pointer-events-none absolute inset-0 bg-background/75" />
        </Show>

        <Show when={!hideHeader()}>
          <header class="relative z-10 flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-9 w-9"
              aria-label="返回"
              onClick={leaveDetail}
            >
              <ArrowLeft class="h-5 w-5" />
            </Button>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">正在播放</p>
              <p class="truncate text-xs text-muted-foreground">
                {track()?.name ?? '当前曲目与播放控制'}
              </p>
            </div>
            {headerActions()}
          </header>
        </Show>
        <Show when={hideHeader()}>{floatingHeaderControls()}</Show>

        <div class="relative z-10 flex min-h-0 flex-1 flex-col">
          <Show when={isMobile()} fallback={desktopLayout()}>
            <Show when={landscape()} fallback={mobilePortraitLayout()}>
              {mobileLandscapeLayout()}
            </Show>
          </Show>
        </div>

        <Show when={isMobile() || desktopSidePaneDrawer()}>
          <ViewerAppDrawer
            open={sidePane() != null}
            onOpenChange={(open) => {
              if (!open) setSidePane(null);
            }}
            side={drawerSide()}
            snapPoints={[0, 1]}
            defaultSnapPoint={1}
          >
            <ViewerAppDrawerContent
              class={
                drawerSide() === 'right'
                  ? 'flex h-full w-[min(85dvw,32rem)] max-w-none flex-col'
                  : cn('flex flex-col', hDrawerPanel, 'max-h-[75dvh]')
              }
              showNativeDragHandle={false}
            >
              <ViewerAppDrawerHeader
                title={sidePane() != null ? sidePaneTitle() : ''}
              />
              <ViewerAppDrawerBody disableDragClose>
                <Show when={sidePane() != null}>{sidePaneContent()}</Show>
              </ViewerAppDrawerBody>
            </ViewerAppDrawerContent>
          </ViewerAppDrawer>
        </Show>

        <MusicAddToListDialog
          open={addOpen()}
          tracks={track() ? [track()!] : []}
          mode="add"
          onOpenChange={setAddOpen}
        />
        <MusicPlayDetailSettingsPopup
          open={settingsOpen()}
          onOpenChange={setSettingsOpen}
          player={props.player}
        />
        <MusicPlayTimerDialog open={playTimerOpen()} onOpenChange={setPlayTimerOpen} />
        <ViewerAppDialog open={eqEditorOpen()} onOpenChange={setEqEditorOpen}>
          <ViewerAppDialogContent class="sm:max-w-3xl" layout="app">
            <ViewerAppDialogHeader
              actions={
                <AppTooltip>
                  <AppTooltipTrigger as="div">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="重置为平直"
                      onClick={() => {
                        const gains = [...EQ_PRESETS.flat];
                        setMusicSettings({ eqCustomGains: gains });
                        props.player.getWebAudio()?.applyCustomEq(gains);
                      }}
                    >
                      <RotateCcw class="h-4 w-4" />
                    </Button>
                  </AppTooltipTrigger>
                  <AppTooltipContent layer="viewer">重置为平直</AppTooltipContent>
                </AppTooltip>
              }
            >
              <ViewerAppDialogTitle>自定义均衡器</ViewerAppDialogTitle>
              <ViewerAppDialogDescription>
                调整十段频率增益（-12～12 dB）。修改后将自动切换为自定义模式。
              </ViewerAppDialogDescription>
            </ViewerAppDialogHeader>
            <div class="space-y-4 px-6 pb-6">
              <MusicEqualizerEditor gains={customEqGains()} onChange={updateEqBand} />
            </div>
          </ViewerAppDialogContent>
        </ViewerAppDialog>
        <BookCoverPreviewDialog
          open={coverPreviewOpen()}
          onOpenChange={setCoverPreviewOpen}
          coverUrl={coverUrl()}
          bookUrl={coverUrl()}
          name={track()?.name ?? '专辑封面'}
        />
      </section>
    </ThemeTargetHost>
  );

  return (
    <Show
      when={
        standalone() &&
        viewerStore.state.musicSection === 'nowPlaying'
      }
      fallback={detailBody()}
    >
      <Portal>
        <div class="fixed inset-0 z-110 flex flex-col bg-background">
          {detailBody()}
        </div>
      </Portal>
      <div class="min-h-0 flex-1" aria-hidden="true" />
    </Show>
  );
};
