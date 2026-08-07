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
  type Accessor,
  type Component,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  ArrowLeft,
  AudioLines,
  AudioWaveform,
  Ban,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  FastForward,
  Gauge,
  Link2,
  ListMusic,
  ListOrdered,
  ListPlus,
  MessageSquare,
  Music2,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  Repeat,
  Repeat1,
  Rewind,
  RotateCcw,
  Search,
  Settings2,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  SquareActivity,
  Volume2,
  VolumeX,
  Waves,
  X,
} from 'lucide-solid';
import { AppTextInputContextMenu } from '@/components/shared/AppTextInputContextMenu';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { MultiSwitch, type MultiSwitchOption } from '@/components/shared/MultiSwitch';
import { AppSlider } from '@/components/shared/AppSlider';
import { Toggle } from '@/components/ui/toggle';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
} from '@/components/shared/AppTooltip';
import {
  AppDropdownMenu,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  AppMenuPanel,
  AppMenuPanelTrigger,
} from '@/components/shared/AppMenuPanel';
import { showAppToast } from '@/components/shared/AppToasts';
import { AspectFitBox } from '@/components/shared/AspectFitBox';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import { BookCoverPreviewDialog } from '@/components/media/reader/books/BookCoverPreviewDialog';
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from '@/components/ui/resizable';
import { AudioLyricPanel } from '@/components/media/viewer/audio/AudioLyricPanel';
import { MusicQueuePane } from '@/components/media/viewer/audio/music/hub/MusicQueuePane';
import { MusicCommentPane } from '@/components/media/viewer/audio/music/hub/MusicCommentPane';
import { MusicAddToListDialog } from '@/components/media/viewer/audio/music/hub/MusicAddToListDialog';
import { MusicDownloadQualityDialog } from '@/components/media/viewer/audio/music/hub/MusicDownloadQualityDialog';
import { MusicPlayDetailSettingsPopup } from '@/components/media/viewer/audio/music/hub/MusicPlayDetailSettingsPopup';
import { MusicPlayTimerDialog } from '@/components/media/viewer/audio/music/hub/MusicPlayTimerDialog';
import { MusicSoundEffectDialog } from '@/components/media/viewer/audio/music/hub/MusicSoundEffectDialog';
import { MusicLinkLyricDialog } from '@/components/media/viewer/audio/music/hub/MusicLinkLyricDialog';
import { MusicAudioVisualizer } from '@/components/media/viewer/audio/music/hub/MusicAudioVisualizer';
import {
  MUSIC_PLAYBACK_RATE_PRESETS,
  MUSIC_PITCH_RATE_PRESETS,
  MUSIC_PLAY_SPEED_MAX,
  MUSIC_PLAY_SPEED_MIN,
  MUSIC_PITCH_RATE_MAX,
  MUSIC_PITCH_RATE_MIN,
} from '@/components/media/viewer/audio/music/hub/MusicPlaybackRateCombobox';
import { MusicHubPageShell } from '@/components/media/viewer/audio/music/hub/MusicHubPageShell';
import { SettingsToolbarLeading } from '@/components/shell/SettingsPageToolbar';
import { ViewerToolbarWindowControls } from '@/components/media/viewer/ViewerToolbarChromeParts';
import {
  MusicEqualizerEditor,
  MUSIC_EQ_PRESET_LABELS,
} from '@/components/media/viewer/audio/music/hub/MusicEqualizerEditor';
import { ThemeTargetHost } from '@/components/theme/ThemeTargetHost';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import {
  type useMusicHubPlayer,
} from '@/components/media/viewer/audio/music/hub/useMusicHubPlayer';
import { formatMusicTime } from '@/lib/media/audio/track-types';
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
  type MusicSettings,
} from '@/lib/media/audio/music-settings';
import {
  musicLyricOffsetTrackKey,
  resolveEffectiveLyricOffsetSec,
  subscribeTrackLyricOffset,
} from '@/lib/media/audio/music-lyric-offset';
import {
  QUALITY_PREFERENCE_LABELS,
  setPlayQuality,
  listPlayQualityPreferenceOptions,
  type MusicQualityPreference,
} from '@/lib/media/audio/music-quality';
import { findMusic } from '@/lib/media/audio/music-sdk/find-music';
import {
  BUILTIN_SOURCE_LABELS,
  searchSourceLabel,
} from '@/lib/media/audio/online/source-router';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { trackAlbumName } from '@/lib/media/audio/music-search-result-ui';
import {
  copyTrackName,
  openTrackSourceDetail,
  searchSimilarTrack,
} from '@/lib/media/audio/music-context-actions';
import { isAndroid, isTauri } from '@/lib/platform/detect';
import { SHELL_SIDEBAR_MIN_WIDTH } from '@/lib/shell/layout';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import { getEffectiveDark, onDocumentColorModeChange } from '@/lib/theme/runtime';
import { MusicCoverImg } from '@/components/media/viewer/audio/music/MusicCoverImg';
import { loadMusicCoverBlob } from '@/lib/media/audio/music-cover-loader';
import {
  applyPlayDetailAdaptivePalette,
  clearPlayDetailAdaptivePalette,
  extractPlayDetailAdaptivePalette,
  type PlayDetailAdaptivePalette,
} from '@/lib/media/audio/play-detail-adaptive-foreground';
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
  ViewerAppDropdownMenuContent,
  ViewerAppMenuPanelContent,
} from '@/components/media/viewer/viewer-app-overlay';

const PLAY_MODE_OPTIONS: MultiSwitchOption<AudioPlayMode>[] = [
  { value: AudioPlayMode.listEndStop, label: '顺序播放', icon: ListOrdered },
  { value: AudioPlayMode.singleLoop, label: '单曲循环', icon: Repeat1 },
  { value: AudioPlayMode.random, label: '列表随机播放', icon: Shuffle },
  { value: AudioPlayMode.listLoop, label: '列表循环', icon: Repeat },
  { value: AudioPlayMode.none, label: '禁止切换', icon: Ban },
];
const EQ_PRESET_KEYS = Object.keys(EQ_PRESETS) as (keyof typeof EQ_PRESETS)[];

function applyHubElementVolume(volume01: number, unmute: boolean): void {
  const el = document.querySelector<HTMLAudioElement>('audio[data-music-hub-player]');
  if (!el) return;
  el.volume = Math.max(0, Math.min(1, volume01));
  if (unmute && volume01 > 0) el.muted = false;
}

type DetailPlayer = ReturnType<typeof useMusicHubPlayer>;

/** 调节面板：AppMenuPanel + Tooltip 触发器 */
const DetailAdjustMenu: Component<{
  tooltip: JSX.Element;
  ariaLabel: string;
  disabled?: boolean;
  triggerClass?: string;
  contentClass?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: JSX.Element;
  children: JSX.Element;
}> = (props) => (
  <AppMenuPanel open={props.open} onOpenChange={props.onOpenChange}>
    <AppTooltip>
      <AppTooltipTrigger as="div">
        <AppMenuPanelTrigger
          as={Button}
          variant="ghost"
          size="icon"
          class={cn('text-foreground', props.triggerClass ?? 'h-9 w-9')}
          aria-label={props.ariaLabel}
          disabled={props.disabled}
        >
          {props.icon}
        </AppMenuPanelTrigger>
      </AppTooltipTrigger>
      <AppTooltipContent layer="viewer">{props.tooltip}</AppTooltipContent>
    </AppTooltip>
    <ViewerAppMenuPanelContent class={props.contentClass}>
      {props.children}
    </ViewerAppMenuPanelContent>
  </AppMenuPanel>
);

/** 音量：拖动只改本地 draft，松手再写 settings */
const DetailVolumeMenu: Component<{
  player: DetailPlayer;
  disabled?: boolean;
}> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [draft, setDraft] = createSignal(Math.round(props.player.musicVolume() * 100));

  createEffect(() => {
    if (!open()) return;
    setDraft(Math.round(props.player.musicVolume() * 100));
  });

  const commit = () => {
    const v = draft() / 100;
    props.player.setMusicVolume(v);
    if (v > 0) props.player.setMusicMuted(false);
  };

  return (
    <DetailAdjustMenu
      open={open()}
      onOpenChange={setOpen}
      tooltip="音量"
      ariaLabel="音量"
      disabled={props.disabled}
      triggerClass="h-10 w-10"
      contentClass="w-52"
      icon={
        <Show
          when={!props.player.musicMuted() && props.player.musicVolume() > 0}
          fallback={<VolumeX class="h-5 w-5" />}
        >
          <Volume2 class="h-5 w-5" />
        </Show>
      }
    >
      <div class="flex items-center justify-between gap-3 text-sm">
        <span class="tabular-nums">{draft()}%</span>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-detail-muted-input"
            checked={props.player.musicMuted()}
            onChange={props.player.setMusicMuted}
          />
          <Label for="music-detail-muted-input">静音</Label>
        </div>
      </div>
      <AppSlider
        min={0}
        max={100}
        step={1}
        value={draft()}
        aria-label="音量"
        onChange={(n) => {
          setDraft(n);
          applyHubElementVolume(n / 100, true);
        }}
        onChangeEnd={commit}
      />
    </DetailAdjustMenu>
  );
};

/** 倍率预设：快捷 8 档两行四列；下方数字输入可在更大范围内自定义 */
const DetailRatePresets: Component<{
  presets: readonly string[];
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
}> = (props) => {
  const near = (preset: string) => Math.abs(props.value - Number(preset)) < 0.001;
  const step = () => props.step ?? 0.05;
  return (
    <div class="space-y-2">
      <div class="grid grid-cols-4 gap-1">
        <For each={[...props.presets]}>
          {(preset) => (
            <Button
              type="button"
              variant={near(preset) ? 'secondary' : 'ghost'}
              size="sm"
              class="h-8 px-1 text-xs tabular-nums"
              disabled={Number(preset) < props.min || Number(preset) > props.max}
              onClick={() => props.onCommit(Number(preset))}
            >
              {preset}x
            </Button>
          )}
        </For>
      </div>
      <div class="flex items-center gap-2">
        <AppTextInputContextMenu>
          <input
            type="number"
            class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-ring"
            min={props.min}
            max={props.max}
            step={step()}
            value={props.value.toFixed(2)}
            onKeyDown={(event) => event.stopPropagation()}
            onChange={(event) => {
              const n = Number(event.currentTarget.value);
              if (!Number.isFinite(n)) return;
              props.onCommit(
                Math.max(props.min, Math.min(props.max, Math.round(n * 100) / 100)),
              );
            }}
          />
        </AppTextInputContextMenu>
        <span class="shrink-0 text-sm text-muted-foreground">x</span>
      </div>
    </div>
  );
};

/** 倍速：拖动 live 改 playbackRate，松手再持久化 */
const DetailSpeedMenu: Component<{
  player: DetailPlayer;
  preservesPitch: boolean;
  onPreservesPitchChange: (checked: boolean) => void;
}> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [draft, setDraft] = createSignal(getMusicSettings().playSpeed ?? 1);

  createEffect(() => {
    if (!open()) return;
    setDraft(getMusicSettings().playSpeed ?? 1);
  });

  const clamp = (speed: number) =>
    Math.max(MUSIC_PLAY_SPEED_MIN, Math.min(MUSIC_PLAY_SPEED_MAX, speed));

  const live = (speed: number) => {
    const next = clamp(speed);
    setDraft(next);
    props.player.player.setPlaybackRate(next);
  };

  const persist = (speed: number) => {
    const next = clamp(speed);
    setDraft(next);
    setMusicSettings({ playSpeed: next });
    props.player.player.setPlaybackRate(next);
  };

  return (
    <DetailAdjustMenu
      open={open()}
      onOpenChange={setOpen}
      tooltip={`倍速 · ${draft().toFixed(2)}x`}
      ariaLabel={`播放倍速 ${draft()} 倍`}
      contentClass="w-56"
      icon={<Gauge class="h-4 w-4" />}
    >
      <div class="flex items-center justify-between gap-2 text-sm">
        <span class="tabular-nums">{draft().toFixed(2)}x</span>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-detail-preserves-pitch-input"
            checked={props.preservesPitch}
            onChange={props.onPreservesPitchChange}
          />
          <Label for="music-detail-preserves-pitch-input">音调补偿</Label>
        </div>
      </div>
      <AppSlider
        min={MUSIC_PLAY_SPEED_MIN}
        max={MUSIC_PLAY_SPEED_MAX}
        step={0.05}
        value={draft()}
        aria-label="播放倍速"
        onChange={(n) => live(n)}
        onChangeEnd={() => persist(draft())}
      />
      <DetailRatePresets
        presets={MUSIC_PLAYBACK_RATE_PRESETS}
        value={draft()}
        min={MUSIC_PLAY_SPEED_MIN}
        max={MUSIC_PLAY_SPEED_MAX}
        onCommit={persist}
      />
      <p class="text-xs text-muted-foreground">
        可调 {MUSIC_PLAY_SPEED_MIN}x–{MUSIC_PLAY_SPEED_MAX}x
      </p>
    </DetailAdjustMenu>
  );
};

/** 音调：拖动 live 改 pitch shifter，松手再持久化 */
const DetailPitchMenu: Component<{
  player: DetailPlayer;
  preservesPitch: boolean;
  onPreservesPitchChange: (checked: boolean) => void;
}> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [draft, setDraft] = createSignal(getMusicSettings().pitchShifterRate ?? 1);

  createEffect(() => {
    if (!open()) return;
    setDraft(getMusicSettings().pitchShifterRate ?? 1);
  });

  const clamp = (rate: number) =>
    Math.max(
      MUSIC_PITCH_RATE_MIN,
      Math.min(MUSIC_PITCH_RATE_MAX, Math.round(rate * 100) / 100),
    );

  const live = (rate: number) => {
    const next = clamp(rate);
    setDraft(next);
    props.player.getWebAudio()?.setPitchShifter(next);
  };

  const persist = (rate: number) => {
    const next = clamp(rate);
    setDraft(next);
    setMusicSettings({ pitchShifterRate: next });
    props.player.getWebAudio()?.setPitchShifter(next);
  };

  return (
    <DetailAdjustMenu
      open={open()}
      onOpenChange={setOpen}
      tooltip={`音调 · ${draft().toFixed(2)}x`}
      ariaLabel={`音调 ${draft().toFixed(2)}x`}
      contentClass="w-56"
      icon={<AudioWaveform class="h-4 w-4" />}
    >
      <div class="flex items-center justify-between gap-2 text-sm">
        <span class="tabular-nums">{draft().toFixed(2)}x</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-7 px-2 text-xs"
          onClick={() => persist(1)}
        >
          重置
        </Button>
      </div>
      <AppSlider
        min={Math.round(MUSIC_PITCH_RATE_MIN * 100)}
        max={Math.round(MUSIC_PITCH_RATE_MAX * 100)}
        step={1}
        value={Math.round(draft() * 100)}
        aria-label="音调"
        onChange={(n) => live(n / 100)}
        onChangeEnd={() => persist(draft())}
      />
      <DetailRatePresets
        presets={MUSIC_PITCH_RATE_PRESETS}
        value={draft()}
        min={MUSIC_PITCH_RATE_MIN}
        max={MUSIC_PITCH_RATE_MAX}
        onCommit={persist}
      />
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-detail-pitch-preserves-input"
          checked={props.preservesPitch}
          onChange={props.onPreservesPitchChange}
        />
        <Label for="music-detail-pitch-preserves-input">音调补偿</Label>
      </div>
      <p class="text-[11px] leading-snug text-muted-foreground">
        可调 {MUSIC_PITCH_RATE_MIN}x–{MUSIC_PITCH_RATE_MAX}x；升降调不改变播放速度
      </p>
    </DetailAdjustMenu>
  );
};

type DetailSidePane = 'comments' | 'queue' | null;

export interface MusicPlayDetailProps {
  player: ReturnType<typeof useMusicHubPlayer>;
}

/** 独立组件，避免父级 settings 更新时以函数返回 JSX 导致歌词面板重挂载 */
const DetailLyricPanel: Component<{
  player: ReturnType<typeof useMusicHubPlayer>;
  settings: Accessor<MusicSettings>;
  class?: string;
}> = (props) => {
  const [trackOffsetRev, setTrackOffsetRev] = createSignal(0);
  onMount(() => {
    const unsub = subscribeTrackLyricOffset(() => setTrackOffsetRev((n) => n + 1));
    onCleanup(unsub);
  });
  const effectiveLyricOffset = createMemo(() => {
    trackOffsetRev();
    const t = props.player.currentTrack();
    return resolveEffectiveLyricOffsetSec(
      props.settings().lyricOffset ?? 0,
      t ? musicLyricOffsetTrackKey(String(t.source), t.id) : null,
    );
  });
  return (
    <AudioLyricPanel
      class={cn('min-h-0 flex-1', props.class)}
      lyric={props.player.fetchedLyric()}
      bundle={props.player.fetchedLyricBundle()}
      lyricTrack={props.player.effectiveLyricTrack()}
      positionSec={props.player.player.currentTime()}
      playing={props.player.player.playing()}
      lyricOffset={effectiveLyricOffset()}
      showTranslation={props.settings().showLyricTranslation !== false}
      showRoma={props.settings().showLyricRoma !== false}
      secondaryOrder={props.settings().playDetailSecondaryOrder}
      secondaryPlacement={props.settings().playDetailSecondaryPlacement}
      align={props.settings().playDetailLyricAlign}
      fontSize={props.settings().playDetailLyricFontSize}
      playedColor={props.settings().playDetailLyricPlayedColor || undefined}
      unplayedColor={props.settings().playDetailLyricUnplayedColor || undefined}
      unplayedShadowEnabled={props.settings().playDetailLyricUnplayedShadow}
      unplayedShadowColor={props.settings().playDetailLyricUnplayedShadowColor}
      playedShadowEnabled={props.settings().playDetailLyricPlayedShadow}
      playedShadowColor={props.settings().playDetailLyricPlayedShadowColor}
      zoomActiveLyric={props.settings().playDetailZoomActiveLyric}
      zoomActiveScale={props.settings().playDetailZoomActiveScale ?? 1.28}
      layout={props.settings().playDetailLyricLayout}
      scrollDelayMs={props.settings().playDetailLyricScrollDelayMs}
      scrollPosition={props.settings().playDetailLyricScrollPosition}
      boldFont={props.settings().playDetailBoldFont}
      boldLine={props.settings().playDetailBoldLine}
      boldExtended={props.settings().playDetailBoldExtended}
      allowProgressPreview={props.settings().playDetailAllowLyricSeek}
      autoPlayOnRelease={props.settings().playDetailLyricSeekAutoPlayOnRelease}
      doubleClickSeek={props.settings().playDetailLyricDoubleClickSeek}
      durationSec={props.player.player.duration()}
      onSeek={
        props.settings().playDetailAllowLyricSeek ||
          props.settings().playDetailLyricDoubleClickSeek
          ? (positionSec) => {
            props.player.player.seekTo(positionSec, true);
          }
          : undefined
      }
      active={viewerStore.state.musicSection === 'nowPlaying'}
      karaokeMode={props.settings().lyricUseLxLyric !== false}
    />
  );
};

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
  const [downloadOpen, setDownloadOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [eqEditorOpen, setEqEditorOpen] = createSignal(false);
  const [coverPreviewOpen, setCoverPreviewOpen] = createSignal(false);
  const [playTimerOpen, setPlayTimerOpen] = createSignal(false);
  const [soundEffectOpen, setSoundEffectOpen] = createSignal(false);
  const [linkLyricOpen, setLinkLyricOpen] = createSignal(false);
  const [searchLyricOpen, setSearchLyricOpen] = createSignal(false);
  const [sidePane, setSidePane] = createSignal<DetailSidePane>(null);
  const [pageIndex, setPageIndex] = createSignal(0);
  const [eqPreset, setEqPreset] = createSignal<keyof typeof EQ_PRESETS>(
    getMusicSettings().eqPreset ?? 'flat',
  );
  const [musicSettings, setMusicSettingsSignal] = createSignal(getMusicSettings());
  const [miniDismissed, setMiniDismissed] = createSignal(false);
  const [altSources, setAltSources] = createSignal<AudioTrack[]>([]);
  const [altLoading, setAltLoading] = createSignal(false);
  const [coverBroken, setCoverBroken] = createSignal(false);
  const [coverBlobUrl, setCoverBlobUrl] = createSignal<string | null>(null);
  const [detailRoot, setDetailRoot] = createSignal<HTMLElement | null>(null);
  const [adaptivePalette, setAdaptivePalette] =
    createSignal<PlayDetailAdaptivePalette | null>(null);
  let altRequestId = 0;
  let touchStartX = 0;

  const [isDark, setIsDark] = createSignal(getEffectiveDark());

  onMount(() => {
    const unsubscribe = subscribeMusicSettings((settings) => {
      setEqPreset(settings.eqPreset);
      setMusicSettingsSignal(settings);
    });
    const unsubscribeMode = onDocumentColorModeChange(setIsDark);
    let unsubDismissed: (() => void) | undefined;
    void import('@/lib/media/audio/music-mini-player-window').then((m) => {
      setMiniDismissed(m.isMusicMiniPlayerDismissed());
      unsubDismissed = m.subscribeMusicMiniPlayerDismissed(() => {
        setMiniDismissed(m.isMusicMiniPlayerDismissed());
      });
    });
    onCleanup(() => {
      unsubscribe();
      unsubscribeMode();
      unsubDismissed?.();
    });
  });

  const track = () => props.player.currentTrack();
  const coverUrl = createMemo(() => {
    const url = track()?.meta?.coverUrl;
    return typeof url === 'string' && url.trim() ? url : '';
  });
  /** 模糊封面背景模糊半径（px，0–100），随设置变化 */
  const blurCoverPx = () => musicSettings().playDetailBlurCoverPx ?? 40;
  /** 模糊封面背景不透明度（0–1），越大封面越清晰 */
  const blurCoverOpacity = () =>
    Math.max(0, Math.min(100, musicSettings().playDetailBlurCoverOpacity ?? 45)) / 100;
  /** 模糊越强，放大越多以遮住模糊后的透明边缘 */
  const blurCoverScale = () => 1.12 + Math.min(blurCoverPx(), 100) / 350;
  /** 优先 blob；回退原 coverUrl，避免加载竞态导致背景空白 */
  const blurCoverSrc = () => coverBlobUrl() || coverUrl() || '';
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
  });

  createEffect(() => {
    const url = coverUrl();
    const id = track()?.id;
    setCoverBlobUrl(null);
    if (!url) return;
    let cancelled = false;
    void loadMusicCoverBlob({ coverUrl: url, trackId: id }).then((blob) => {
      if (cancelled) return;
      if (blob) setCoverBlobUrl(blob);
      else setCoverBroken(true);
    });
    onCleanup(() => {
      cancelled = true;
    });
  });

  /** 模糊封面 + 跟随前景：从封面采样主色并写到详情根节点 CSS 变量 */
  createEffect(() => {
    const enabled =
      musicSettings().playDetailBlurCoverBackground &&
      musicSettings().playDetailAdaptiveForeground;
    const src = blurCoverSrc();
    const dark = isDark();
    const broken = coverBroken();

    if (!enabled || !src || broken) {
      setAdaptivePalette(null);
      return;
    }

    let cancelled = false;
    void extractPlayDetailAdaptivePalette(src, dark).then((palette) => {
      if (cancelled) return;
      setAdaptivePalette(palette);
    });
    onCleanup(() => {
      cancelled = true;
    });
  });

  createEffect(() => {
    const el = detailRoot();
    const palette = adaptivePalette();
    if (!el) return;
    if (palette) applyPlayDetailAdaptivePalette(el, palette);
    else clearPlayDetailAdaptivePalette(el);
    onCleanup(() => {
      clearPlayDetailAdaptivePalette(el);
    });
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

  const applyPreservesPitch = (checked: boolean) => {
    setMusicSettings({ preservesPitch: checked });
    const el = document.querySelector<HTMLAudioElement>('audio[data-music-hub-player]');
    if (el) el.preservesPitch = checked;
  };

  const loadAltSources = async () => {
    const t = track();
    if (!t) return;
    const requestId = ++altRequestId;
    setAltLoading(true);
    try {
      const list = await findMusic(t);
      if (requestId !== altRequestId || track()?.id !== t.id) return;
      setAltSources(list);
      if (list.length === 0) {
        showAppToast({
          title: '换源失败',
          description: '未匹配到可用音源',
          variant: 'destructive',
        });
      }
    } catch (error) {
      if (requestId !== altRequestId) return;
      showAppToast({
        title: '换源失败',
        description: toUserFacingMusicError(error, '换源匹配失败'),
        variant: 'destructive',
      });
    } finally {
      if (requestId === altRequestId) setAltLoading(false);
    }
  };

  const switchToAlt = async (alt: AudioTrack) => {
    const queue = [...viewerStore.state.trackQueue];
    const idx = viewerStore.state.trackIndex;
    if (idx < 0 || idx >= queue.length) return;
    // 手动换源：对齐 lx「替换列表项」——直接切到目标源曲目
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
    const { setDesktopLyricEnabled } = await import('@/lib/media/audio/desktop-lyric-window');
    await setDesktopLyricEnabled(open);
  };

  const toggleMiniMode = async (open: boolean) => {
    if (!isTauri() || isAndroid()) return;
    const { setMiniModeEnabled } = await import(
      '@/lib/media/audio/music-mini-player-window'
    );
    await setMiniModeEnabled(open);
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
    const displaySource = viewerStore.state.activeSource ?? t.source;
    const parts = [
      searchSourceLabel(displaySource as never),
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
          class={cn(
            'h-9 w-9 text-foreground',
            opts.pressed && 'bg-accent',
            opts.class,
          )}
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

  const moreMenu = (): JSX.Element => (
    <AppDropdownMenu>
      <AppTooltip>
        <AppTooltipTrigger as="div">
          <AppDropdownMenuTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class="h-9 w-9 text-foreground"
          >
            <Ellipsis class="h-4 w-4" />
            <span class="sr-only">更多操作</span>
          </AppDropdownMenuTrigger>
        </AppTooltipTrigger>
        <AppTooltipContent layer="viewer">更多</AppTooltipContent>
      </AppTooltip>
      <ViewerAppDropdownMenuContent layout="min">
        <AppDropdownMenuItem
          disabled={!track() || altLoading()}
          onSelect={() => void loadAltSources()}
        >
          <RefreshCw class={cn('h-4 w-4', altLoading() && 'animate-spin')} />
          {altLoading() ? '匹配中…' : '换源'}
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={!track() || track()?.source === 'local'}
          onSelect={() => setDownloadOpen(true)}
        >
          <Download class="h-4 w-4" />
          下载
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={!track()}
          onSelect={() => track() && void copyTrackName(track()!)}
        >
          <Copy class="h-4 w-4" />
          复制歌曲名
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={!track()}
          onSelect={() => track() && void openTrackSourceDetail(track()!)}
        >
          <ExternalLink class="h-4 w-4" />
          歌曲详情页
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={!track()}
          onSelect={() => track() && searchSimilarTrack(track()!)}
        >
          <Search class="h-4 w-4" />
          搜索相似
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={!track() || track()?.source === 'local'}
          onSelect={() => setLinkLyricOpen(true)}
        >
          <Link2 class="h-4 w-4" />
          关联歌词
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={!track() || track()?.source === 'local'}
          onSelect={() => setSearchLyricOpen(true)}
        >
          <Search class="h-4 w-4" />
          搜索歌词
        </AppDropdownMenuItem>
        <AppDropdownMenuItem onSelect={() => setSoundEffectOpen(true)}>
          <Waves class="h-4 w-4" />
          环境音 / 环绕
        </AppDropdownMenuItem>
        <AppDropdownMenuItem onSelect={() => setSettingsOpen(true)}>
          <Settings2 class="h-4 w-4" />
          播放详情设置
        </AppDropdownMenuItem>
      </ViewerAppDropdownMenuContent>
    </AppDropdownMenu>
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
      {moreMenu()}
      <Show when={standalone() && !isMobile()}>
        <ViewerToolbarWindowControls inline showLeadingSeparator />
      </Show>
    </div>
  );

  const sidePaneContent = (): JSX.Element => (
    <Show when={sidePane() === 'comments'} fallback={<MusicQueuePane />}>
      <MusicCommentPane track={track()} />
    </Show>
  );

  const sidePaneTitle = () => {
    if (sidePane() === 'comments') return '歌曲评论';
    const count = viewerStore.state.trackQueue.length;
    return count ? `播放队列 (${count})` : '播放队列';
  };

  const queueSourceLabel = () =>
    sidePane() === 'comments' ? null : viewerStore.state.playerListName;

  const sidePanePanel = (): JSX.Element => (
    <aside class="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-background/80 shadow-sm backdrop-blur">
      <div class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <Show
            when={sidePane() === 'comments'}
            fallback={<ListMusic class="h-4 w-4 shrink-0 text-primary" />}
          >
            <MessageSquare class="h-4 w-4 shrink-0 text-primary" />
          </Show>
          <p class="min-w-0 truncate text-sm font-semibold">{sidePaneTitle()}</p>
          <Show when={queueSourceLabel()}>
            {(name) => (
              <span class="max-w-36 shrink-0 truncate text-xs text-muted-foreground">
                来自 {name()}
              </span>
            )}
          </Show>
        </div>
        {iconGhostBtn({
          label: '关闭面板',
          onClick: () => setSidePane(null),
          class: 'h-8 w-8 shrink-0',
          children: <X class="h-4 w-4" />,
        })}
      </div>
      <div class="flex min-h-0 flex-1 flex-col">{sidePaneContent()}</div>
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
        <MusicCoverImg
          src={coverUrl()}
          trackId={track()?.id}
          alt=""
          class="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.02]"
          loading="eager"
          onError={() => setCoverBroken(true)}
          fallback={
            <div class="flex h-full w-full items-center justify-center text-muted-foreground">
              <Music2 class="h-16 w-16 opacity-50" />
            </div>
          }
        />
      </Show>
    </button>
  );

  const infoBlock = (centered = true, className?: string): JSX.Element => (
    <div
      class={cn(
        'w-full min-w-0 max-w-full space-y-1 overflow-hidden',
        centered ? 'text-center' : 'text-left',
        className,
      )}
    >
      <p class="line-clamp-2 wrap-break-word text-lg font-semibold text-foreground">
        {track()?.name ?? '选择音乐开始播放'}
      </p>
      <p class="truncate text-sm text-muted-foreground">{track()?.artist || '未知艺术家'}</p>
      <Show when={track() && trackAlbumName(track()!)}>
        <p class="truncate text-xs text-muted-foreground">专辑：{trackAlbumName(track()!)}</p>
      </Show>
      <Show when={metaLine()}>
        <p class="truncate text-xs text-muted-foreground/80">{metaLine()}</p>
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
        <AppSlider
          class="group relative"
          disabled={!track() || !musicSettings().allowProgressBarSeek}
          min={0}
          max={Math.max(props.player.player.duration(), 1)}
          step={0.1}
          value={props.player.player.currentTime()}
          aria-label="播放进度"
          trackClass="h-5 cursor-pointer bg-transparent"
          fillClass="top-1/2 h-1 -translate-y-1/2"
          thumbClass={cn(
            'top-1/2 size-3 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
            adaptivePalette() && 'opacity-100',
          )}
          onChange={(v) =>
            props.player.player.seekTo(v, props.player.player.playing())
          }
        />
      </div>
      {/* 状态提示叠在两端时间中间，绝对定位不挤动布局 */}
      <div class="relative flex items-center justify-between gap-2 text-xs tabular-nums text-muted-foreground">
        <span class="relative z-10 shrink-0">
          {formatMusicTime(props.player.player.currentTime())}
        </span>
        <span
          class={cn(
            'pointer-events-none absolute inset-x-12 truncate text-center font-sans normal-nums',
            props.player.error() ? 'text-destructive' : 'text-muted-foreground',
            !statusText() && 'invisible',
          )}
          aria-live="polite"
        >
          {statusText() || '\u00a0'}
        </span>
        <span class="relative z-10 shrink-0">
          {formatMusicTime(props.player.player.duration())}
        </span>
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
            sizeClass="h-9 w-9"
            inheritChromeColors={adaptivePalette() != null}
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

      <Button
        variant="ghost"
        size="icon"
        class="h-11 w-11 text-foreground"
        aria-label="上一首"
        disabled={!track()}
        onClick={() => void playPrevTrack({ manual: true })}
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
          void props.player.playOrFetch();
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
        class="h-11 w-11 text-foreground"
        aria-label="下一首"
        disabled={!track()}
        onClick={() => void playNextTrack({ manual: true })}
      >
        <SkipForward class="h-5 w-5" />
      </Button>

      <DetailVolumeMenu player={props.player} disabled={!track()} />
    </div>
  );

  const leftToolGroup = (): JSX.Element => (
    <>
      <AppDropdownMenu>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-9 w-9 text-foreground"
              aria-label="播放音质"
            >
              <Music2 class="h-4 w-4" />
            </AppDropdownMenuTrigger>
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">
            音质 · {QUALITY_PREFERENCE_LABELS[musicSettings().playQualityPreference]}
          </AppTooltipContent>
        </AppTooltip>
        <ViewerAppDropdownMenuContent layout="min" class="min-w-40">
          <For each={[...listPlayQualityPreferenceOptions()]}>
            {(value) => (
              <AppDropdownMenuItem
                class={
                  musicSettings().playQualityPreference === value ? 'bg-accent/50' : undefined
                }
                onSelect={() => void changeQuality(value)}
              >
                {QUALITY_PREFERENCE_LABELS[value]}
              </AppDropdownMenuItem>
            )}
          </For>
        </ViewerAppDropdownMenuContent>
      </AppDropdownMenu>

      <DetailSpeedMenu
        player={props.player}
        preservesPitch={musicSettings().preservesPitch}
        onPreservesPitchChange={applyPreservesPitch}
      />

      <DetailPitchMenu
        player={props.player}
        preservesPitch={musicSettings().preservesPitch}
        onPreservesPitchChange={applyPreservesPitch}
      />

      <AppDropdownMenu>
        <AppTooltip>
          <AppTooltipTrigger as="div">
            <AppDropdownMenuTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-9 w-9 text-foreground"
              aria-label="均衡器"
            >
              <SlidersHorizontal class="h-4 w-4" />
            </AppDropdownMenuTrigger>
          </AppTooltipTrigger>
          <AppTooltipContent layer="viewer">
            均衡器 ·{' '}
            {musicSettings().eqCustomGains
              ? '自定义'
              : (MUSIC_EQ_PRESET_LABELS[eqPreset()] ?? eqPreset())}
          </AppTooltipContent>
        </AppTooltip>
        <ViewerAppDropdownMenuContent layout="min" class="min-w-56">
          <For each={EQ_PRESET_KEYS}>
            {(preset) => (
              <AppDropdownMenuItem
                class={
                  !musicSettings().eqCustomGains && eqPreset() === preset
                    ? 'bg-accent/50'
                    : undefined
                }
                onSelect={() => applyEq(preset)}
              >
                {MUSIC_EQ_PRESET_LABELS[preset] ?? String(preset)}
              </AppDropdownMenuItem>
            )}
          </For>
          <AppDropdownMenuItem
            class={musicSettings().eqCustomGains ? 'bg-accent/50' : undefined}
            onSelect={openEqEditor}
          >
            自定义频率增益…
          </AppDropdownMenuItem>
        </ViewerAppDropdownMenuContent>
      </AppDropdownMenu>
    </>
  );

  const rightToolGroup = (): JSX.Element => (
    <>
      {iconGhostBtn({
        label: '添加到歌单',
        disabled: !track(),
        onClick: () => setAddOpen(true),
        children: <ListPlus class="h-4 w-4" />,
      })}

      <AppTooltip>
        <AppTooltipTrigger as="div">
          <Toggle
            pressed={musicSettings().miniModeEnabled === true && !miniDismissed()}
            onChange={(open) => void toggleMiniMode(open)}
            class="h-9 w-9 p-0 data-pressed:bg-accent"
            aria-label={
              musicSettings().miniModeEnabled && !miniDismissed()
                ? '关闭迷你播放窗'
                : '打开迷你播放窗'
            }
            disabled={!track() || !isTauri() || isAndroid()}
          >
            <PictureInPicture2 class="h-4 w-4" />
          </Toggle>
        </AppTooltipTrigger>
        <AppTooltipContent layer="viewer">
          {isTauri() && !isAndroid()
            ? musicSettings().miniModeEnabled && !miniDismissed()
              ? '关闭迷你播放窗'
              : '打开迷你播放窗'
            : '迷你播放窗仅桌面客户端可用'}
        </AppTooltipContent>
      </AppTooltip>

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
            pressed={musicSettings().desktopLyricEnabled === true}
            onChange={(open) => void toggleDesktopLyric(open)}
            class="h-9 w-9 p-0 data-pressed:bg-accent"
            aria-label={
              musicSettings().desktopLyricEnabled ? '关闭桌面歌词' : '打开桌面歌词'
            }
            disabled={!track() || !isTauri()}
          >
            <SquareActivity class="h-4 w-4" />
          </Toggle>
        </AppTooltipTrigger>
        <AppTooltipContent layer="viewer">
          {isTauri()
            ? musicSettings().desktopLyricEnabled
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

  /** <md 双行：播放在上、工具在下；md+ 单行：左工具 | 播放 | 右工具。transport 只挂一份，避免受控 Popover 双开（隐藏锚点会漂到视口左上角）。 */
  const controlsBlock = (): JSX.Element => (
    <div class="flex w-full flex-col items-center gap-2 md:flex-row md:items-center">
      <div class="order-1 flex w-full items-center justify-center md:order-2 md:w-auto md:shrink-0 md:px-3">
        {transportBlock()}
      </div>
      <div class="order-2 flex w-full flex-wrap items-center justify-center gap-0.5 md:contents">
        <div class="flex flex-wrap items-center justify-center gap-0.5 md:order-1 md:min-w-0 md:flex-1 md:justify-start">
          {leftToolGroup()}
        </div>
        <div class="flex flex-wrap items-center justify-center gap-0.5 md:order-3 md:min-w-0 md:flex-1 md:justify-end">
          {rightToolGroup()}
        </div>
      </div>
    </div>
  );

  const altSourceRow = (): JSX.Element => (
    <Show when={altSources().length > 0}>
      <div class="flex flex-wrap justify-center gap-1">
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
    <div
      class={cn(
        'relative z-10 shrink-0 space-y-3 bg-transparent px-4 pt-3',
        // 独立全屏盖住系统手势条：在原有 pb 上叠加底部安全距
        standalone()
          ? 'pb-[calc(0.75rem+var(--safe-area-bottom-effective)+var(--keyboard-inset-bottom))]'
          : 'pb-3',
      )}
    >
      {progressBlock()}
      {controlsBlock()}
      {altSourceRow()}
    </div>
  );

  const floatingHeaderControls = (): JSX.Element => (
    <div
      class={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-3',
        // 独立全屏从视口顶边起算；嵌入 Hub 时内容区已在壳层安全区之下
        standalone()
          ? 'pt-[calc(var(--safe-area-top-effective)+0.75rem)]'
          : 'pt-3',
      )}
    >
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
          'flex min-h-0 min-w-0 shrink-0 items-center gap-4 transition-[width] duration-200',
          compactDesktopLayout()
            ? 'w-full justify-center'
            : embeddedSidePaneOpen()
              ? 'w-[28%] min-w-0 max-w-60 flex-col justify-center'
              : 'w-[34%] min-w-0 max-w-sm flex-col justify-center',
        )}
      >
        {compactDesktopLayout()
          ? coverBlock('aspect-square h-28 w-28 shrink-0')
          : (
            <AspectFitBox max={embeddedSidePaneOpen() ? '15rem' : '20rem'}>
              {coverBlock('h-full w-full')}
            </AspectFitBox>
          )}
        {infoBlock(
          !compactDesktopLayout(),
          compactDesktopLayout()
            ? 'max-w-[min(18rem,52%)] shrink'
            : 'w-full',
        )}
      </div>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <DetailLyricPanel player={props.player} settings={musicSettings} />
      </div>
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
          hideHeader()
            ? standalone()
              ? 'pb-4 pt-[calc(3.5rem+var(--safe-area-top-effective))]'
              : 'pb-4 pt-14'
            : 'py-4',
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
        class={cn(
          'relative min-h-0 flex-1 overflow-hidden',
          hideHeader() &&
            (standalone()
              ? 'pt-[calc(3rem+var(--safe-area-top-effective))]'
              : 'pt-12'),
        )}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          class="flex h-full w-[200%] transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${pageIndex() * 50}%)` }}
        >
          <div class="flex h-full w-1/2 min-h-0 flex-col items-center justify-center gap-4 px-6">
            <AspectFitBox max={['72vw', '20rem']}>
              {coverBlock('h-full w-full')}
            </AspectFitBox>
            {infoBlock(true, 'w-full max-w-sm')}
            <Button
              variant="ghost"
              size="sm"
              class="shrink-0 gap-1 text-xs text-muted-foreground"
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
            <DetailLyricPanel player={props.player} settings={musicSettings} />
          </div>
        </div>
      </div>
      {controlFooter()}
    </div>
  );

  const mobileLandscapeLayout = (): JSX.Element => (
    <div class="flex min-h-0 flex-1 flex-col">
      <div
        class={cn(
          'flex min-h-0 flex-1 overflow-hidden',
          hideHeader() &&
            (standalone()
              ? 'pt-[calc(2.5rem+var(--safe-area-top-effective))]'
              : 'pt-10'),
        )}
      >
        <div class="flex w-[42%] min-h-0 min-w-0 flex-col justify-center gap-3 px-4 py-2">
          <AspectFitBox max="12rem">{coverBlock('h-full w-full')}</AspectFitBox>
          {infoBlock(true, 'w-full')}
          <div class="shrink-0">{progressBlock()}</div>
        </div>
        <div class="flex min-h-0 min-w-0 flex-1 flex-col border-l px-2 py-2">
          <DetailLyricPanel player={props.player} settings={musicSettings} />
        </div>
      </div>
      <div
        class={cn(
          'relative z-10 shrink-0 space-y-2 bg-transparent px-3 pt-2',
          standalone()
            ? 'pb-[calc(0.5rem+var(--safe-area-bottom-effective)+var(--keyboard-inset-bottom))]'
            : 'pb-2',
        )}
      >
        {controlsBlock()}
        {altSourceRow()}
      </div>
    </div>
  );

  const detailBody = (): JSX.Element => (
    <ThemeTargetHost target="music.playDetail">
      <section
        ref={setDetailRoot}
        class={cn(
          'relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background',
          standalone() && 'h-full w-full',
        )}
      >
        <Show
          when={
            musicSettings().playDetailBlurCoverBackground &&
            blurCoverSrc() &&
            !coverBroken()
          }
        >
          <div
            class="pointer-events-none absolute inset-0"
            style={{
              'background-image': `url(${blurCoverSrc()})`,
              // 封面以较大边为基准等比缩放铺满整个背景
              'background-size': 'cover',
              'background-position': 'center',
              filter: `blur(${blurCoverPx()}px) saturate(1.15)`,
              // 放大以吃掉模糊边缘的透明像素，模糊越强放大越多
              transform: `scale(${blurCoverScale()})`,
              // 透明度可配置：越大封面越清晰
              opacity: String(blurCoverOpacity()),
            }}
          />
          {/* 明暗主题蒙层；自适应前景开启时改用封面同色相浅洗蒙层 */}
          <div
            class={cn(
              'pointer-events-none absolute inset-0',
              !adaptivePalette() && (isDark() ? 'bg-background/30' : 'bg-background/25'),
            )}
            style={
              adaptivePalette()
                ? { 'background-color': adaptivePalette()!.overlay }
                : undefined
            }
          />
        </Show>

        {/* 对齐 lx：全屏叠加在内容下层，自底部生长，不占独立布局高度 */}
        <Show when={musicSettings().audioVisualizationEnabled}>
          <MusicAudioVisualizer
            engine={props.player.getWebAudio}
            active={viewerStore.state.musicSection === 'nowPlaying'}
            targetFps={() => musicSettings().playDetailAudioVisualizerFps}
          />
        </Show>

        {/* 独立全屏页才用内嵌页头；嵌入 Hub 时走 MusicHubPageShell / PageToolbar */}
        <Show when={standalone() && !hideHeader()}>
          <header class="relative z-10 flex shrink-0 items-center gap-2 border-b px-3 py-2 safe-area-inset-top">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-9 w-9 text-foreground"
              aria-label="返回"
              onClick={leaveDetail}
            >
              <ArrowLeft class="h-5 w-5" />
            </Button>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-foreground">正在播放</p>
              <p class="truncate text-xs text-muted-foreground">
                {track()?.name ?? '当前曲目与播放控制'}
              </p>
            </div>
            {headerActions()}
          </header>
        </Show>
        <Show when={hideHeader()}>{floatingHeaderControls()}</Show>

        <div class="relative z-10 flex min-h-0 flex-1 flex-col">
          {/*
            Show 的 fallback/children 须为 Component，不能调用会读 musicSettings 的工厂函数；
            否则写设置后布局重建，音量/倍速/音调菜单 open 丢失。
          */}
          <Show when={isMobile()} fallback={<DetailDesktopLayout />}>
            <Show when={landscape()} fallback={<DetailMobilePortraitLayout />}>
              <DetailMobileLandscapeLayout />
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
                actions={
                  <Show when={queueSourceLabel()}>
                    {(name) => (
                      <span class="max-w-36 truncate text-xs text-muted-foreground">
                        来自 {name()}
                      </span>
                    )}
                  </Show>
                }
              />
              <ViewerAppDrawerBody disableDragClose>
                <Show when={sidePane() != null}>{sidePaneContent()}</Show>
              </ViewerAppDrawerBody>
            </ViewerAppDrawerContent>
          </ViewerAppDrawer>
        </Show>

      </section>
    </ThemeTargetHost>
  );

  /**
   * 弹窗集群：挂在组件根部（而非 detailBody 内），
   * 避免切换「独立展示 / 隐藏顶栏」导致 detailBody 重建时弹窗被卸载关闭。
   */
  const detailDialogs = (): JSX.Element => (
    <>
      <MusicAddToListDialog
        open={addOpen()}
        tracks={track() ? [track()!] : []}
        mode="add"
        onOpenChange={setAddOpen}
      />
      <MusicDownloadQualityDialog
        open={downloadOpen()}
        tracks={track() ? [track()!] : []}
        onOpenChange={setDownloadOpen}
      />
      <MusicPlayDetailSettingsPopup
        open={settingsOpen()}
        onOpenChange={setSettingsOpen}
        player={props.player}
      />
      <MusicPlayTimerDialog open={playTimerOpen()} onOpenChange={setPlayTimerOpen} />
      <MusicSoundEffectDialog open={soundEffectOpen()} onOpenChange={setSoundEffectOpen} />
      <MusicLinkLyricDialog
        open={linkLyricOpen()}
        track={track() ?? null}
        onOpenChange={setLinkLyricOpen}
      />
      <MusicLinkLyricDialog
        open={searchLyricOpen()}
        track={track() ?? null}
        searchMode="lyric"
        onOpenChange={setSearchLyricOpen}
      />
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
        coverUrl={coverBlobUrl() || coverUrl()}
        bookUrl={coverUrl()}
        name={track()?.name ?? '专辑封面'}
      />
    </>
  );

  const adaptiveChromeStyle = createMemo((): JSX.CSSProperties | undefined => {
    const palette = adaptivePalette();
    if (!palette) return undefined;
    return {
      color: `hsl(${palette.foreground})`,
      '--foreground': palette.foreground,
      '--muted-foreground': palette.mutedForeground,
      '--primary': palette.primary,
      '--accent-foreground': palette.foreground,
      '--color-foreground': `hsl(${palette.foreground})`,
      '--color-muted-foreground': `hsl(${palette.mutedForeground})`,
      '--color-primary': `hsl(${palette.primary})`,
      '--color-accent-foreground': `hsl(${palette.foreground})`,
    };
  });

  /**
   * 布局必须是 Component（而非 fallback={factory()}）：
   * Show 求值 fallback 时若直接调用工厂并读到 musicSettings，会把依赖挂到 Show memo 上，
   * 写音量/倍速/音调后整棵控制树重建，下拉 open 状态丢失。
   */
  const DetailDesktopLayout: Component = () => desktopLayout();
  const DetailMobilePortraitLayout: Component = () => mobilePortraitLayout();
  const DetailMobileLandscapeLayout: Component = () => mobileLandscapeLayout();
  const DetailBodyView: Component = () => detailBody();
  const HubEmbeddedWithToolbar: Component = () => (
    <div class="flex min-h-0 flex-1 flex-col" style={adaptiveChromeStyle()}>
      <MusicHubPageShell
        section="nowPlaying"
        leading={<SettingsToolbarLeading onBack={leaveDetail} />}
        toolbar={headerActions()}
        scrollClass="overflow-hidden"
      >
        <DetailBodyView />
      </MusicHubPageShell>
    </div>
  );
  const HubEmbeddedBare: Component = () => (
    <div class="flex min-h-0 flex-1 flex-col" style={adaptiveChromeStyle()}>
      <DetailBodyView />
    </div>
  );
  /** 独立 Component，避免外层 Show 在创建 fallback 时读到 hideHeader/musicSettings */
  const MusicPlayDetailEmbedded: Component = () => (
    <Show when={hideHeader()} fallback={<HubEmbeddedWithToolbar />}>
      <HubEmbeddedBare />
    </Show>
  );

  return (
    <>
      <Show
        when={
          standalone() &&
          viewerStore.state.musicSection === 'nowPlaying'
        }
        fallback={<MusicPlayDetailEmbedded />}
      >
        <Portal>
          <div
            class="fixed inset-0 z-110 flex flex-col bg-background"
            style={adaptiveChromeStyle()}
          >
            <DetailBodyView />
          </div>
        </Portal>
        <div class="min-h-0 flex-1" aria-hidden="true" />
      </Show>
      {detailDialogs()}
    </>
  );
};
