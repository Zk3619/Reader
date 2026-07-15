/**
 * 完整播放页（封面、歌词、倍速、EQ、队列）
 */

import {
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Component,
} from 'solid-js';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  Shuffle,
  Heart,
  ListMusic,
} from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import { playNextTrack, playPrevTrack } from '@/stores/viewer/media/audio';
import { cycleMusicPlayMode, playModeLabel } from '@/lib/media/audio/music-play-config';
import { AudioPlayMode } from '@/lib/media/audio/types';
import { AudioLyricPanel } from '@/components/viewer/audio/AudioLyricPanel';
import { MusicQueuePanel } from '@/components/viewer/audio/music/hub/MusicQueuePanel';
import { MusicCommentPane } from '@/components/viewer/audio/music/hub/MusicCommentPane';
import {
  formatMusicTime,
  type useMusicHubPlayer,
} from '@/components/viewer/audio/music/hub/useMusicHubPlayer';
import { EQ_PRESETS } from '@/lib/media/audio/engine/web-audio-player';
import { addTrackToLove, removeTrackFromLove } from '@/lib/database/audio-library';
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
import { cn } from '@/lib/utils';
import { findMusic } from '@/lib/media/audio/music-sdk/find-music';
import { BUILTIN_SOURCE_LABELS } from '@/lib/media/audio/online/source-router';
import { applyMusicTrack } from '@/stores/viewer/media/audio';
import { viewerStore } from '@/stores/viewer';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import { MusicHubPageShell } from '@/components/viewer/audio/music/hub/MusicHubPageShell';
import { ThemeTargetHost } from '@/components/theme/ThemeTargetHost';
import { MusicAudioVisualizer } from '@/components/viewer/audio/music/hub/MusicAudioVisualizer';

const LYRIC_TRACKS = ['lyric', 'tlyric', 'rlyric', 'lxlyric'] as const;
const LYRIC_TRACK_LABELS: Record<(typeof LYRIC_TRACKS)[number], string> = {
  lyric: '原文',
  tlyric: '翻译',
  rlyric: '罗马音',
  lxlyric: '逐字',
};

const PLAY_SPEEDS = ['0.5', '0.75', '1', '1.25', '1.5', '2'] as const;

export interface MusicPlayDetailProps {
  player: ReturnType<typeof useMusicHubPlayer>;
}

export const MusicPlayDetail: Component<MusicPlayDetailProps> = (props) => {
  const [queueOpen, setQueueOpen] = createSignal(false);
  const [commentOpen, setCommentOpen] = createSignal(false);
  const [loved, setLoved] = createSignal(false);
  const [eqPreset, setEqPreset] = createSignal<keyof typeof EQ_PRESETS>(
    getMusicSettings().eqPreset ?? 'flat',
  );
  const [playSpeed, setPlaySpeed] = createSignal(getMusicSettings().playSpeed ?? 1);
  const [musicSettings, setMusicSettingsSignal] = createSignal(getMusicSettings());
  const [altSources, setAltSources] = createSignal<AudioTrack[]>([]);
  const [altLoading, setAltLoading] = createSignal(false);

  onMount(() => {
    const unsubscribe = subscribeMusicSettings((settings) => {
      setPlaySpeed(settings.playSpeed);
      setEqPreset(settings.eqPreset);
      setMusicSettingsSignal(settings);
    });
    onCleanup(unsubscribe);
  });

  const track = () => props.player.currentTrack();

  const loadAltSources = async () => {
    const t = track();
    if (!t) return;
    setAltLoading(true);
    try {
      const list = await findMusic(t);
      setAltSources(list);
    } finally {
      setAltLoading(false);
    }
  };

  const switchToAlt = async (alt: AudioTrack) => {
    const queue = [...viewerStore.state.trackQueue];
    const idx = viewerStore.state.trackIndex;
    if (idx < 0 || idx >= queue.length) return;
    queue[idx] = alt;
    const { setMusicTrackQueue } = await import('@/stores/viewer/media/audio');
    setMusicTrackQueue(queue, idx, alt.source);
    await applyMusicTrack(idx, { forceRefreshUrl: true });
    setAltSources([]);
  };

  const toggleLove = async () => {
    const t = track();
    if (!t) return;
    if (loved()) {
      await removeTrackFromLove(t.id);
      setLoved(false);
    } else {
      await addTrackToLove(t.id);
      setLoved(true);
    }
  };

  const applySpeed = (speed: number) => {
    setPlaySpeed(speed);
    setMusicSettings({ playSpeed: speed });
  };

  const applyEq = (preset: keyof typeof EQ_PRESETS) => {
    setEqPreset(preset);
    setMusicSettings({ eqPreset: preset, eqCustomGains: null });
    props.player.getWebAudio()?.applyEqPreset(preset);
  };

  return (
    <ThemeTargetHost target="music.playDetail">
      <MusicHubPageShell
        section="nowPlaying"
        title={track()?.name ?? '正在播放'}
        description={track()?.artist ?? '当前曲目与播放控制'}
      >
      <div class="flex min-h-0 w-full flex-1 flex-col items-center gap-4 pb-4">
        <Show when={track()?.meta?.coverUrl}>
          <img
            src={String(track()?.meta.coverUrl)}
            alt=""
            class="h-48 w-48 rounded-lg object-cover shadow-lg md:h-56 md:w-56"
          />
        </Show>
        <div class="max-w-md text-center">
          <p class="truncate text-lg font-medium">{track()?.name ?? '选择音乐开始播放'}</p>
          <p class="truncate text-sm text-muted-foreground">{track()?.artist ?? ''}</p>
        </div>
        <Show when={props.player.loading()}>
          <p class="text-sm text-muted-foreground">
            {props.player.playbackStatus() || '加载中…'}
          </p>
        </Show>
        <Show when={props.player.error()}>
          <p class="text-sm text-destructive">{props.player.error()}</p>
        </Show>
        <Show when={props.player.url()}>
          <div class="flex w-full max-w-lg flex-col gap-4">
            <AudioLyricPanel
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
              onSeek={
                musicSettings().playDetailAllowLyricSeek
                  ? (positionSec) =>
                      props.player.player.seekTo(positionSec, props.player.player.playing())
                  : undefined
              }
            />
            <Show when={musicSettings().audioVisualizationEnabled}>
              <MusicAudioVisualizer engine={props.player.getWebAudio} />
            </Show>
            <div class="flex flex-wrap items-center justify-center gap-2">
              <MusicAppSelect
                value={props.player.lyricTrack()}
                onChange={(kind) => {
                  props.player.setLyricTrack(kind as LyricTrackKind);
                  setMusicSettings({ lyricTrack: kind as LyricTrackKind });
                }}
                options={LYRIC_TRACKS.filter((k) => {
                  const s = musicSettings();
                  if (k === 'tlyric' && s.showLyricTranslation === false) return false;
                  if (k === 'rlyric' && s.showLyricRoma === false) return false;
                  if (k === 'lxlyric' && s.lyricUseLxLyric === false) return false;
                  return true;
                })}
                optionLabel={(v) => LYRIC_TRACK_LABELS[v]}
                layout="compact"
                triggerClass="h-8 w-24 text-xs"
                aria-label="歌词轨"
              />
              <MusicAppSelect
                value={musicSettings().playQualityPreference}
                onChange={(v) => setPlayQuality(v as MusicQualityPreference)}
                options={listPlayQualityPreferenceOptions()}
                optionLabel={(v) => QUALITY_PREFERENCE_LABELS[v]}
                layout="compact"
                triggerClass="h-8 w-24 text-xs"
                aria-label="播放音质"
              />
              <Button size="sm" variant="outline" class="text-xs" onClick={() => void loadAltSources()}>
                {altLoading() ? '匹配中…' : '换源'}
              </Button>
            </div>
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
            <div class="flex items-center gap-2">
              <span class="w-10 text-xs tabular-nums text-muted-foreground">
                {formatMusicTime(props.player.player.currentTime())}
              </span>
              <Slider
                class="flex-1"
                disabled={!musicSettings().allowProgressBarSeek}
                minValue={0}
                maxValue={Math.max(props.player.player.duration(), 1)}
                step={0.1}
                value={[props.player.player.currentTime()]}
                onChange={(v) =>
                  props.player.player.seekTo(v[0] ?? 0, props.player.player.playing())
                }
              >
                <SliderTrack>
                  <SliderFill />
                  <SliderThumb />
                </SliderTrack>
              </Slider>
              <span class="w-10 text-right text-xs tabular-nums text-muted-foreground">
                {formatMusicTime(props.player.player.duration())}
              </span>
            </div>
            <div class="flex flex-wrap items-center justify-center gap-2">
              <MusicAppSelect
                value={String(playSpeed())}
                onChange={(v) => applySpeed(parseFloat(v))}
                options={PLAY_SPEEDS}
                optionLabel={(v) => `${v}x`}
                layout="compact"
                triggerClass="h-8 w-20 text-xs"
                aria-label="播放倍速"
              />
              <MusicAppSelect
                value={eqPreset()}
                onChange={(v) => applyEq(v as keyof typeof EQ_PRESETS)}
                options={Object.keys(EQ_PRESETS) as (keyof typeof EQ_PRESETS)[]}
                layout="compact"
                triggerClass="h-8 w-24 text-xs"
                aria-label="均衡器预设"
              />
            </div>
            <div class="flex items-center justify-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => void toggleLove()}>
                <Heart class={cn('h-5 w-5', loved() && 'fill-destructive text-destructive')} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={playModeLabel(props.player.musicPlayMode())}
                onClick={() => props.player.setMusicPlayMode(cycleMusicPlayMode())}
              >
                <Show
                  when={props.player.musicPlayMode() === AudioPlayMode.singleLoop}
                  fallback={
                    <Show
                      when={props.player.musicPlayMode() === AudioPlayMode.random}
                      fallback={<Repeat class="h-5 w-5" />}
                    >
                      <Shuffle class="h-5 w-5" />
                    </Show>
                  }
                >
                  <Repeat1 class="h-5 w-5" />
                </Show>
              </Button>
              <Button variant="ghost" size="icon" onClick={() => void playPrevTrack()}>
                <SkipBack class="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                class="h-12 w-12"
                onClick={() => props.player.player.togglePlay()}
              >
                <Show when={props.player.player.playing()} fallback={<Play class="h-6 w-6" />}>
                  <Pause class="h-6 w-6" />
                </Show>
              </Button>
              <Button variant="ghost" size="icon" onClick={() => void playNextTrack()}>
                <SkipForward class="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setCommentOpen((v) => !v)}>
                <span class="text-xs font-medium">评</span>
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setQueueOpen(true)}>
                <ListMusic class="h-5 w-5" />
              </Button>
            </div>
            <Show when={commentOpen()}>
              <MusicCommentPane track={track()} />
            </Show>
          </div>
        </Show>
      </div>
      <MusicQueuePanel open={queueOpen()} onOpenChange={setQueueOpen} />
      </MusicHubPageShell>
    </ThemeTargetHost>
  );
};
