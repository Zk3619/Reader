/**
 * lx 式底栏 PlayBar
 */

import {
  Show,
  createMemo,
  createSignal,
  onCleanup,
  type Component,
} from 'solid-js';
import {
  FastForward,
  ListMusic,
  ListOrdered,
  ListPlus,
  Music2,
  Ban,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Rewind,
  Shuffle,
  SkipBack,
  SkipForward,
  SquareActivity,
  PictureInPicture2,
  Volume2,
  VolumeX,
} from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { MultiSwitch, type MultiSwitchOption } from '@/components/shared/MultiSwitch';
import { AppSlider } from '@/components/shared/AppSlider';
import { Toggle } from '@/components/ui/toggle';
import { MusicCoverImg } from '@/components/media/viewer/audio/music/MusicCoverImg';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
} from '@/components/shared/AppTooltip';
import {
  AppMenuPanel,
  AppMenuPanelTrigger,
} from '@/components/shared/AppMenuPanel';
import { audioI18n } from '@/lib/media/audio/audio-i18n';
import { getMusicOfflineMode } from '@/lib/media/audio/online/user-api-settings';
import { playNextTrack, playPrevTrack, setMusicSection } from '@/stores/viewer/media/audio';
import { viewerStore } from '@/stores/viewer';
import {
  type useMusicHubPlayer,
} from '@/components/media/viewer/audio/music/hub/useMusicHubPlayer';
import { formatMusicTime } from '@/lib/media/audio/track-types';
import { MusicAddToListDialog } from '@/components/media/viewer/audio/music/hub/MusicAddToListDialog';
import { MusicQueuePane } from '@/components/media/viewer/audio/music/hub/MusicQueuePane';
import {
  ViewerAppDrawer,
  ViewerAppDrawerBody,
  ViewerAppDrawerContent,
  ViewerAppDrawerHeader,
  ViewerAppDropdownMenuContent,
  ViewerAppMenuPanelContent,
} from '@/components/media/viewer/viewer-app-overlay';
import { AudioPlayMode } from '@/lib/media/audio/types';
import {
  playModeLabel,
  setMusicPlayMode,
} from '@/lib/media/audio/music-play-config';
import {
  getMusicSettings,
  subscribeMusicSettings,
  type MusicPlayBarProgressStyle,
} from '@/lib/media/audio/music-settings';
import { isAndroid, isMobile, isTauri } from '@/lib/platform/detect';
import { supportsMobileOverlayLyric } from '@/lib/media/audio/mobile-desktop-lyric';
import { cn } from '@/lib/utils';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { currentLyricLine } from '@/lib/media/audio/current-lyric-line';

const PLAY_MODE_OPTIONS: MultiSwitchOption<AudioPlayMode>[] = [
  { value: AudioPlayMode.listEndStop, label: '顺序播放', icon: ListOrdered },
  { value: AudioPlayMode.singleLoop, label: '单曲循环', icon: Repeat1 },
  { value: AudioPlayMode.random, label: '列表随机播放', icon: Shuffle },
  { value: AudioPlayMode.listLoop, label: '列表循环', icon: Repeat },
  { value: AudioPlayMode.none, label: '禁止切换', icon: Ban },
];

export interface MusicHubPlayBarProps {
  player: ReturnType<typeof useMusicHubPlayer>;
}

interface MusicProgressSliderProps {
  currentTime: number;
  duration: number;
  disabled: boolean;
  variant: MusicPlayBarProgressStyle;
  onSeek: (seconds: number) => void;
}

const MusicProgressSlider: Component<MusicProgressSliderProps> = (props) => {
  const duration = () =>
    Number.isFinite(props.duration) && props.duration > 0 ? props.duration : 0;
  const currentTime = () =>
    Math.max(0, Math.min(duration(), Number.isFinite(props.currentTime) ? props.currentTime : 0));
  const isFull = () => props.variant === 'full';

  return (
    <AppSlider
      class={cn('group w-full cursor-pointer', isFull() && 'px-1.5')}
      min={0}
      max={Math.max(1, duration())}
      step={0.1}
      value={currentTime()}
      disabled={props.disabled || duration() <= 0}
      aria-label="播放进度"
      trackClass={cn(
        // 加高命中区；细轨用 before 绘制，避免只能点中 2–4px 轨道
        'relative h-5 bg-transparent before:pointer-events-none before:absolute before:inset-x-0 before:top-1/2 before:-translate-y-1/2 before:bg-muted-foreground/25',
        isFull() ? 'before:h-0.5 before:rounded-none' : 'before:h-1 before:rounded-full',
      )}
      fillClass={cn(
        'top-1/2 -translate-y-1/2',
        isFull() ? 'h-0.5 rounded-none' : 'h-1',
      )}
      thumbClass="top-1/2 size-3 -translate-y-1/2 border-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      onChange={(next) => {
        if (duration() > 0 && Number.isFinite(next)) props.onSeek(next);
      }}
    />
  );
};

export const MusicHubPlayBar: Component<MusicHubPlayBarProps> = (props) => {
  const shell = useShellLayout();
  const isMobileLayout = () => shell().useMobileShell;
  const track = () => props.player.currentTrack();
  const offline = createMemo(() => getMusicOfflineMode());
  const [addOpen, setAddOpen] = createSignal(false);
  const [queueOpen, setQueueOpen] = createSignal(false);
  const [progressOpen, setProgressOpen] = createSignal(false);
  const [volumeOpen, setVolumeOpen] = createSignal(false);
  const [volumeInteracting, setVolumeInteracting] = createSignal(false);
  const [progressStyle, setProgressStyle] = createSignal(
    getMusicSettings().playBarProgressStyle,
  );
  const [allowProgressSeek, setAllowProgressSeek] = createSignal(
    getMusicSettings().allowProgressBarSeek,
  );
  const [desktopLyricEnabled, setDesktopLyricEnabled] = createSignal(
    getMusicSettings().desktopLyricEnabled === true,
  );
  const [miniModeEnabled, setMiniModeEnabled] = createSignal(
    getMusicSettings().miniModeEnabled === true,
  );
  const [miniDismissed, setMiniDismissed] = createSignal(false);
  let volumeOpenTimer: ReturnType<typeof setTimeout> | undefined;
  let volumeCloseTimer: ReturnType<typeof setTimeout> | undefined;
  let progressOpenTimer: ReturnType<typeof setTimeout> | undefined;
  let progressCloseTimer: ReturnType<typeof setTimeout> | undefined;

  const lyricLine = createMemo(() =>
    currentLyricLine(
      props.player.fetchedLyric(),
      props.player.player.currentTime(),
    ),
  );
  const statusLine = createMemo(() => {
    const status = props.player.error() || props.player.playbackStatus();
    const lyric = lyricLine();
    const parts = [status, lyric].filter(
      (value, index, values) => value && values.indexOf(value) === index,
    );
    if (offline()) parts.push('离线');
    return parts.join(' · ') || audioI18n.hubTitle();
  });
  const titleLine = createMemo(() => {
    const t = track();
    if (!t) return `未播放 - ${audioI18n.hubTitle()}`;
    return `${t.name} - ${t.artist || '未知歌手'}`;
  });
  const progressRatio = createMemo(() => {
    const duration = props.player.player.duration();
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    return Math.max(0, Math.min(1, props.player.player.currentTime() / duration));
  });

  const clearProgressTimers = () => {
    if (progressOpenTimer) clearTimeout(progressOpenTimer);
    if (progressCloseTimer) clearTimeout(progressCloseTimer);
    progressOpenTimer = undefined;
    progressCloseTimer = undefined;
  };
  const scheduleProgressOpen = () => {
    if (progressOpen()) return;
    clearProgressTimers();
    progressOpenTimer = setTimeout(() => setProgressOpen(true), 350);
  };
  const scheduleProgressClose = () => {
    if (progressOpenTimer) clearTimeout(progressOpenTimer);
    progressOpenTimer = undefined;
    if (!progressOpen()) return;
    progressCloseTimer = setTimeout(() => setProgressOpen(false), 300);
  };
  const keepProgressOpen = () => {
    if (progressCloseTimer) clearTimeout(progressCloseTimer);
    progressCloseTimer = undefined;
  };
  const clearVolumeTimers = () => {
    if (volumeOpenTimer) clearTimeout(volumeOpenTimer);
    if (volumeCloseTimer) clearTimeout(volumeCloseTimer);
    volumeOpenTimer = undefined;
    volumeCloseTimer = undefined;
  };
  const scheduleVolumeOpen = () => {
    if (volumeOpen()) return;
    clearVolumeTimers();
    volumeOpenTimer = setTimeout(() => setVolumeOpen(true), 350);
  };
  const scheduleVolumeClose = () => {
    if (volumeOpenTimer) clearTimeout(volumeOpenTimer);
    volumeOpenTimer = undefined;
    if (!volumeOpen() || volumeInteracting()) return;
    volumeCloseTimer = setTimeout(() => setVolumeOpen(false), 300);
  };
  const keepVolumeOpen = () => {
    if (volumeCloseTimer) clearTimeout(volumeCloseTimer);
    volumeCloseTimer = undefined;
  };
  const unsubscribeSettings = subscribeMusicSettings((settings) => {
    setProgressStyle(settings.playBarProgressStyle);
    setAllowProgressSeek(settings.allowProgressBarSeek);
    setDesktopLyricEnabled(settings.desktopLyricEnabled === true);
    setMiniModeEnabled(settings.miniModeEnabled === true);
  });
  let unsubMiniDismissed: (() => void) | undefined;
  void import('@/lib/media/audio/music-mini-player-window').then((m) => {
    setMiniDismissed(m.isMusicMiniPlayerDismissed());
    unsubMiniDismissed = m.subscribeMusicMiniPlayerDismissed(() => {
      setMiniDismissed(m.isMusicMiniPlayerDismissed());
    });
  });
  onCleanup(() => {
    clearProgressTimers();
    clearVolumeTimers();
    unsubscribeSettings();
    unsubMiniDismissed?.();
  });

  const applyPlayMode = (mode: AudioPlayMode) => {
    setMusicPlayMode(mode);
    props.player.setMusicPlayMode(mode);
  };

  const toggleDesktopLyric = async (open: boolean) => {
    if (!isTauri()) return;
    const { setDesktopLyricEnabled: setEnabled } = await import(
      '@/lib/media/audio/desktop-lyric-window'
    );
    await setEnabled(open);
  };

  const toggleMiniMode = async (open: boolean) => {
    if (!isTauri() || isAndroid() || isMobile()) return;
    const { setMiniModeEnabled: setEnabled } = await import(
      '@/lib/media/audio/music-mini-player-window'
    );
    await setEnabled(open);
  };

  return (
    <>
      <div
        class={cn(
          'music-bar-container relative flex min-h-16 shrink-0 items-center gap-3 bg-background/95 px-3 py-2 backdrop-blur sm:px-4',
          progressStyle() !== 'full' && 'border-t',
        )}
      >
        <Show when={progressStyle() === 'full'}>
          <div class="absolute inset-x-0 top-0 z-10 -translate-y-1/2">
            <MusicProgressSlider
              currentTime={props.player.player.currentTime()}
              duration={props.player.player.duration()}
              disabled={!track() || !allowProgressSeek()}
              variant="full"
              onSeek={(seconds) => props.player.player.seekTo(seconds)}
            />
          </div>
        </Show>
        <AppTooltip>
          <AppTooltipTrigger as="div" class="shrink-0">
            <button
              type="button"
              class="flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded bg-muted text-muted-foreground transition-opacity hover:opacity-80"
              aria-label="进入播放详情"
              onClick={() => setMusicSection('nowPlaying')}
            >
              <Show
                when={track()?.meta?.coverUrl}
                fallback={<Music2 class="h-5 w-5" />}
              >
                <MusicCoverImg
                  src={String(track()?.meta.coverUrl)}
                  trackId={track()?.id}
                  alt=""
                  class="h-full w-full object-cover"
                  fallback={<Music2 class="h-5 w-5" />}
                />
              </Show>
            </button>
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">进入播放详情</AppTooltipContent>
        </AppTooltip>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{titleLine()}</p>
          <p class="truncate text-xs text-muted-foreground">{statusLine()}</p>
        </div>
        <div
          class="flex shrink-0 items-center gap-0.5 sm:gap-1"
          onClick={(event) => event.stopPropagation()}
        >
          <Show
            when={progressStyle() === 'middle'}
            fallback={
              <Show
                when={progressStyle() === 'mini'}
                fallback={
                  <span class="hidden whitespace-nowrap text-xs tabular-nums text-muted-foreground lg:inline">
                    {formatMusicTime(props.player.player.currentTime())} /{' '}
                    {formatMusicTime(props.player.player.duration())}
                  </span>
                }
              >
                <div
                  class="hidden lg:inline-flex"
                  onMouseEnter={scheduleProgressOpen}
                  onMouseLeave={scheduleProgressClose}
                >
                  <AppMenuPanel open={progressOpen()} onOpenChange={setProgressOpen}>
                    <AppMenuPanelTrigger
                      as={Button}
                      variant="ghost"
                      class="flex h-9 w-28 flex-col gap-1 px-2 py-1"
                      aria-label="播放进度"
                    >
                      <span class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                        {formatMusicTime(props.player.player.currentTime())} /{' '}
                        {formatMusicTime(props.player.player.duration())}
                      </span>
                      <span class="h-0.5 w-full overflow-hidden rounded-full bg-muted-foreground/25">
                        <span
                          class="block h-full w-full origin-left rounded-full bg-primary"
                          style={{ transform: `scaleX(${progressRatio()})` }}
                        />
                      </span>
                    </AppMenuPanelTrigger>
                    <ViewerAppMenuPanelContent
                      class="w-80"
                      bodyClass="flex items-center gap-3 space-y-0 p-3"
                      onMouseEnter={keepProgressOpen}
                      onMouseLeave={scheduleProgressClose}
                    >
                      <span class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                        {formatMusicTime(props.player.player.currentTime())}
                      </span>
                      <MusicProgressSlider
                        currentTime={props.player.player.currentTime()}
                        duration={props.player.player.duration()}
                        disabled={!track() || !allowProgressSeek()}
                        variant="mini"
                        onSeek={(seconds) => props.player.player.seekTo(seconds)}
                      />
                      <span class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                        {formatMusicTime(props.player.player.duration())}
                      </span>
                    </ViewerAppMenuPanelContent>
                  </AppMenuPanel>
                </div>
              </Show>
            }
          >
            <div class="hidden w-[clamp(12rem,24vw,28rem)] items-center gap-2 lg:flex">
              <span class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {formatMusicTime(props.player.player.currentTime())}
              </span>
              <MusicProgressSlider
                currentTime={props.player.player.currentTime()}
                duration={props.player.player.duration()}
                disabled={!track() || !allowProgressSeek()}
                variant="middle"
                onSeek={(seconds) => props.player.player.seekTo(seconds)}
              />
              <span class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {formatMusicTime(props.player.player.duration())}
              </span>
            </div>
          </Show>
          <AppTooltip>
            <AppTooltipTrigger as="div" class="hidden md:inline-flex">
              <Button
                variant="ghost"
                size="icon"
                class="h-9 w-9"
                aria-label="添加到"
                disabled={!track()}
                onClick={() => setAddOpen(true)}
              >
                <ListPlus class="h-4 w-4" />
              </Button>
            </AppTooltipTrigger>
            <AppTooltipContent layer="viewer">添加到</AppTooltipContent>
          </AppTooltip>
          <AppTooltip>
            <AppTooltipTrigger as="div" class="inline-flex">
              <Button
                variant="ghost"
                size="icon"
                class="h-9 w-9"
                aria-label="播放队列"
                onClick={() => setQueueOpen(true)}
              >
                <ListMusic class="h-4 w-4" />
              </Button>
            </AppTooltipTrigger>
            <AppTooltipContent layer="viewer">播放队列</AppTooltipContent>
          </AppTooltip>
          <AppTooltip>
            <AppTooltipTrigger
              as="div"
              class={supportsMobileOverlayLyric() ? 'inline-flex' : 'hidden md:inline-flex'}
            >
              <Toggle
                pressed={desktopLyricEnabled()}
                onChange={(open) => void toggleDesktopLyric(open)}
                class="h-9 w-9 p-0 hover:bg-muted data-pressed:bg-accent"
                aria-label={
                  desktopLyricEnabled()
                    ? supportsMobileOverlayLyric()
                      ? '关闭悬浮歌词'
                      : '关闭桌面歌词'
                    : supportsMobileOverlayLyric()
                      ? '打开悬浮歌词'
                      : '打开桌面歌词'
                }
                disabled={!track() || !isTauri()}
              >
                <SquareActivity class="h-4 w-4" />
              </Toggle>
            </AppTooltipTrigger>
            <AppTooltipContent layer="viewer">
              {isTauri()
                ? desktopLyricEnabled()
                  ? supportsMobileOverlayLyric()
                    ? '关闭悬浮歌词'
                    : '关闭桌面歌词'
                  : supportsMobileOverlayLyric()
                    ? '打开悬浮歌词'
                    : '打开桌面歌词'
                : '桌面歌词仅客户端可用'}
            </AppTooltipContent>
          </AppTooltip>
          <Show when={isTauri() && !isAndroid() && !isMobile()}>
            <AppTooltip>
              <AppTooltipTrigger as="div" class="hidden md:inline-flex">
                <Toggle
                  pressed={miniModeEnabled() && !miniDismissed()}
                  onChange={(open) => void toggleMiniMode(open)}
                  class="h-9 w-9 p-0 hover:bg-muted data-pressed:bg-accent"
                  aria-label={
                    miniModeEnabled() && !miniDismissed()
                      ? '关闭迷你播放窗'
                      : '打开迷你播放窗'
                  }
                  disabled={!track()}
                >
                  <PictureInPicture2 class="h-4 w-4" />
                </Toggle>
              </AppTooltipTrigger>
              <AppTooltipContent layer="viewer">
                {miniModeEnabled() && !miniDismissed()
                  ? '关闭迷你播放窗'
                  : '打开迷你播放窗'}
              </AppTooltipContent>
            </AppTooltip>
          </Show>
          <div
            class="hidden md:inline-flex"
            onMouseEnter={scheduleVolumeOpen}
            onMouseLeave={scheduleVolumeClose}
          >
            <AppMenuPanel
              open={volumeOpen()}
              onOpenChange={(open) => {
                if (!open && volumeInteracting()) return;
                setVolumeOpen(open);
              }}
            >
              <AppMenuPanelTrigger
                as={Button}
                variant="ghost"
                size="icon"
                class="h-9 w-9"
              >
                <Show
                  when={!props.player.musicMuted() && props.player.musicVolume() > 0}
                  fallback={<VolumeX class="h-4 w-4" />}
                >
                  <Volume2 class="h-4 w-4" />
                </Show>
              </AppMenuPanelTrigger>
              <ViewerAppMenuPanelContent
                class="w-52"
                onMouseEnter={keepVolumeOpen}
                onMouseLeave={scheduleVolumeClose}
              >
                <div class="flex items-center justify-between gap-4 text-sm">
                  <span class="tabular-nums">
                    {Math.round(props.player.musicVolume() * 100)}%
                  </span>
                  <div class="flex items-center gap-2">
                    <Checkbox
                      id="music-hub-muted-input"
                      checked={props.player.musicMuted()}
                      onChange={props.player.setMusicMuted}
                    />
                    <Label for="music-hub-muted-input">静音</Label>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <Show
                    when={!props.player.musicMuted() && props.player.musicVolume() > 0}
                    fallback={<VolumeX class="h-4 w-4 shrink-0" />}
                  >
                    <Volume2 class="h-4 w-4 shrink-0" />
                  </Show>
                  <AppSlider
                    class="flex-1"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(props.player.musicVolume() * 100)}
                    aria-label="音量"
                    onChange={(n) => {
                      setVolumeInteracting(true);
                      keepVolumeOpen();
                      props.player.setMusicVolume(n / 100);
                      if (n > 0) props.player.setMusicMuted(false);
                    }}
                    onChangeEnd={() => setVolumeInteracting(false)}
                  />
                </div>
              </ViewerAppMenuPanelContent>
            </AppMenuPanel>
          </div>
          <AppTooltip>
            <AppTooltipTrigger as="div" class="hidden md:inline-flex">
              <MultiSwitch
                options={PLAY_MODE_OPTIONS}
                value={props.player.musicPlayMode}
                onChange={applyPlayMode}
                sizeClass="h-9 w-9"
                DropdownMenuContent={ViewerAppDropdownMenuContent}
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
          <AppTooltip>
            <AppTooltipTrigger as="div" class="inline-flex">
              <Button
                variant="ghost"
                size="icon"
                class="h-9 w-9"
                aria-label="快退 5 秒"
                disabled={!track()}
                onClick={() => props.player.player.skipBy(-5)}
              >
                <Rewind class="h-4 w-4" />
              </Button>
            </AppTooltipTrigger>
            <AppTooltipContent layer="viewer">快退 5 秒</AppTooltipContent>
          </AppTooltip>
          <AppTooltip>
            <AppTooltipTrigger as="div" class="inline-flex">
              <Button
                variant="ghost"
                size="icon"
                class="h-9 w-9"
                aria-label="上一首"
                disabled={!track()}
                onClick={() => void playPrevTrack({ manual: true })}
              >
                <SkipBack class="h-4 w-4" />
              </Button>
            </AppTooltipTrigger>
            <AppTooltipContent layer="viewer">上一首</AppTooltipContent>
          </AppTooltip>
          <AppTooltip>
            <AppTooltipTrigger as="div" class="inline-flex">
              <Button
                variant="ghost"
                size="icon"
                class="h-10 w-10 rounded-full bg-foreground text-background hover:bg-foreground/85 hover:text-background"
                aria-label={props.player.player.playing() ? '暂停' : '播放'}
                disabled={!track()}
                onClick={() => void props.player.playOrFetch()}
              >
                <Show
                  when={props.player.player.playing()}
                  fallback={<Play class="h-4 w-4 fill-current" />}
                >
                  <Pause class="h-4 w-4 fill-current" />
                </Show>
              </Button>
            </AppTooltipTrigger>
            <AppTooltipContent layer="viewer">
              {props.player.player.playing() ? '暂停' : '播放'}
            </AppTooltipContent>
          </AppTooltip>
          <AppTooltip>
            <AppTooltipTrigger as="div" class="inline-flex">
              <Button
                variant="ghost"
                size="icon"
                class="h-9 w-9"
                aria-label="下一首"
                disabled={!track()}
                onClick={() => void playNextTrack({ manual: true })}
              >
                <SkipForward class="h-4 w-4" />
              </Button>
            </AppTooltipTrigger>
            <AppTooltipContent layer="viewer">下一首</AppTooltipContent>
          </AppTooltip>
          <AppTooltip>
            <AppTooltipTrigger as="div" class="inline-flex">
              <Button
                variant="ghost"
                size="icon"
                class="h-9 w-9"
                aria-label="快进 5 秒"
                disabled={!track()}
                onClick={() => props.player.player.skipBy(5)}
              >
                <FastForward class="h-4 w-4" />
              </Button>
            </AppTooltipTrigger>
            <AppTooltipContent layer="viewer">快进 5 秒</AppTooltipContent>
          </AppTooltip>
        </div>
      </div>
      <MusicAddToListDialog
        open={addOpen()}
        track={track()}
        onOpenChange={setAddOpen}
      />
      <ViewerAppDrawer
        open={queueOpen()}
        onOpenChange={setQueueOpen}
        side={isMobileLayout() ? 'bottom' : 'right'}
        snapPoints={[0, 1]}
        defaultSnapPoint={1}
      >
        <ViewerAppDrawerContent
          class={
            isMobileLayout()
              ? 'flex max-h-[75dvh] flex-col'
              : 'flex h-full w-[min(85dvw,24rem)] max-w-none flex-col'
          }
          showNativeDragHandle={false}
        >
          <ViewerAppDrawerHeader
            title={`播放队列${viewerStore.state.trackQueue.length
                ? ` (${viewerStore.state.trackQueue.length})`
                : ''
              }`}
            actions={
              <Show when={viewerStore.state.playerListName}>
                {(name) => (
                  <span class="max-w-36 truncate text-xs text-muted-foreground">
                    来自 {name()}
                  </span>
                )}
              </Show>
            }
          />
          <ViewerAppDrawerBody disableDragClose class="min-h-0 flex-1">
            <MusicQueuePane />
          </ViewerAppDrawerBody>
        </ViewerAppDrawerContent>
      </ViewerAppDrawer>
    </>
  );
};
