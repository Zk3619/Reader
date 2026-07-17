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
  ListPlus,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Rewind,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  SquareActivity,
  Volume2,
  VolumeX,
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
import { audioI18n } from '@/lib/media/audio/audio-i18n';
import { getMusicOfflineMode } from '@/lib/media/audio/online/user-api-settings';
import { playNextTrack, playPrevTrack, setMusicSection } from '@/stores/viewer/media/audio';
import { viewerStore } from '@/stores/viewer';
import {
  formatMusicTime,
  type useMusicHubPlayer,
} from '@/components/viewer/audio/music/hub/useMusicHubPlayer';
import { MusicAddToListDialog } from '@/components/viewer/audio/music/hub/MusicAddToListDialog';
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
import { isTauri } from '@/lib/platform/detect';
import { cn } from '@/lib/utils';

const PLAY_MODE_OPTIONS: MultiSwitchOption<AudioPlayMode>[] = [
  { value: AudioPlayMode.listEndStop, label: '列表结束停止', icon: Square },
  { value: AudioPlayMode.singleLoop, label: '单曲循环', icon: Repeat1 },
  { value: AudioPlayMode.random, label: '随机播放', icon: Shuffle },
  { value: AudioPlayMode.listLoop, label: '列表循环', icon: Repeat },
];

function currentLyricLine(lyric: string, positionSec: number): string {
  const timestamp = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  const lines: { time: number; text: string }[] = [];
  for (const rawLine of lyric.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(timestamp)];
    if (matches.length === 0) continue;
    const text = rawLine.replace(timestamp, '').replace(/<\d+,\d+>/g, '').trim();
    if (!text) continue;
    for (const match of matches) {
      const fraction = match[3]
        ? Number(match[3].padEnd(3, '0').slice(0, 3)) / 1000
        : 0;
      lines.push({
        time: Number(match[1]) * 60 + Number(match[2]) + fraction,
        text,
      });
    }
  }
  lines.sort((a, b) => a.time - b.time);
  let active = '';
  for (const line of lines) {
    if (line.time > positionSec) break;
    active = line.text;
  }
  return active;
}

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

  return (
    <Slider
      class={
        props.variant === 'full'
          ? 'group h-3 w-full cursor-pointer px-1.5'
          : 'group h-5 w-full cursor-pointer'
      }
      minValue={0}
      maxValue={Math.max(1, duration())}
      step={0.1}
      value={[currentTime()]}
      disabled={props.disabled || duration() <= 0}
      aria-label="播放进度"
      onChange={(value) => {
        const next = value[0];
        if (duration() > 0 && Number.isFinite(next)) props.onSeek(next);
      }}
    >
      <SliderTrack
        class={
          props.variant === 'full'
            ? 'h-0.5 rounded-none bg-muted-foreground/25'
            : 'h-1 bg-muted-foreground/25'
        }
      >
        <SliderFill class={props.variant === 'full' ? 'rounded-none' : undefined} />
        <SliderThumb class="top-[-4px] size-3 border-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" />
      </SliderTrack>
    </Slider>
  );
};

export const MusicHubPlayBar: Component<MusicHubPlayBarProps> = (props) => {
  const track = () => props.player.currentTrack();
  const offline = createMemo(() => getMusicOfflineMode());
  const [addOpen, setAddOpen] = createSignal(false);
  const [progressOpen, setProgressOpen] = createSignal(false);
  const [volumeOpen, setVolumeOpen] = createSignal(false);
  const [progressStyle, setProgressStyle] = createSignal(
    getMusicSettings().playBarProgressStyle,
  );
  const [allowProgressSeek, setAllowProgressSeek] = createSignal(
    getMusicSettings().allowProgressBarSeek,
  );
  const [desktopLyricOpen, setDesktopLyricOpen] = createSignal(false);
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
    const source = viewerStore.state.playerListName;
    const status = props.player.error() || props.player.playbackStatus();
    const lyric = lyricLine();
    const parts = [source ? `来自 ${source}` : null, status, lyric].filter(
      (value, index, values) => value && values.indexOf(value) === index,
    );
    if (offline()) parts.push('离线');
    return parts.join(' · ') || audioI18n.hubTitle();
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
    if (!volumeOpen()) return;
    volumeCloseTimer = setTimeout(() => setVolumeOpen(false), 300);
  };
  const keepVolumeOpen = () => {
    if (volumeCloseTimer) clearTimeout(volumeCloseTimer);
    volumeCloseTimer = undefined;
  };
  const unsubscribeSettings = subscribeMusicSettings((settings) => {
    setProgressStyle(settings.playBarProgressStyle);
    setAllowProgressSeek(settings.allowProgressBarSeek);
  });
  onCleanup(() => {
    clearProgressTimers();
    clearVolumeTimers();
    unsubscribeSettings();
  });

  const applyPlayMode = (mode: AudioPlayMode) => {
    setMusicPlayMode(mode);
    props.player.setMusicPlayMode(mode);
  };

  const toggleDesktopLyric = async (open: boolean) => {
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke(open ? 'open_desktop_lyric_window' : 'close_desktop_lyric_window');
    setDesktopLyricOpen(open);
  };

  return (
    <>
      <div
        class={cn(
          'relative flex min-h-16 shrink-0 items-center gap-3 bg-background/95 px-3 py-2 backdrop-blur sm:px-4',
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
                <img
                  src={String(track()?.meta.coverUrl)}
                  alt=""
                  class="h-full w-full object-cover"
                />
              </Show>
            </button>
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">进入播放详情</AppTooltipContent>
        </AppTooltip>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">
            {track()
              ? `${track()!.name} - ${track()!.artist || '未知歌手'}`
              : `未播放 - ${audioI18n.hubTitle()}`}
          </p>
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
                  <Popover open={progressOpen()} onOpenChange={setProgressOpen}>
                    <PopoverTrigger
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
                    </PopoverTrigger>
                    <PopoverContent
                      class="w-80 p-3"
                      onMouseEnter={keepProgressOpen}
                      onMouseLeave={scheduleProgressClose}
                    >
                      <div class="flex items-center gap-3">
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
                      </div>
                    </PopoverContent>
                  </Popover>
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
            <AppTooltipTrigger as="div" class="hidden md:inline-flex">
              <Toggle
                pressed={desktopLyricOpen()}
                onChange={(open) => void toggleDesktopLyric(open)}
                class="h-9 w-9 p-0 hover:bg-muted data-pressed:bg-accent"
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
          <div
            class="hidden md:inline-flex"
            onMouseEnter={scheduleVolumeOpen}
            onMouseLeave={scheduleVolumeClose}
          >
            <Popover open={volumeOpen()} onOpenChange={setVolumeOpen}>
              <PopoverTrigger
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
              </PopoverTrigger>
              <PopoverContent
                class="w-52 p-3"
                onMouseEnter={keepVolumeOpen}
                onMouseLeave={scheduleVolumeClose}
              >
                <div class="space-y-3">
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
                    <Slider
                      class="flex-1"
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
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <AppTooltip>
            <AppTooltipTrigger as="div" class="hidden md:inline-flex">
              <MultiSwitch
                options={PLAY_MODE_OPTIONS}
                value={props.player.musicPlayMode}
                onChange={applyPlayMode}
                sizeClass="h-9 w-9"
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
                onClick={() => void playPrevTrack()}
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
                onClick={() => props.player.player.togglePlay()}
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
                onClick={() => void playNextTrack()}
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
    </>
  );
};
