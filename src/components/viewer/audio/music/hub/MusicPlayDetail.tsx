/**
 * 完整播放页（封面、歌词、倍速、EQ、队列）
 */

import { createSignal, For, Show, type Component } from 'solid-js';
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
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { QUALITY_LABELS, setPlayQuality, getPlayQuality } from '@/lib/media/audio/music-quality';
import type { LyricTrackKind } from '@/lib/media/audio/lyric-types';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import { cn } from '@/lib/utils';
import { findMusic } from '@/lib/media/audio/music-sdk/find-music';
import { BUILTIN_SOURCE_LABELS } from '@/lib/media/audio/online/source-router';
import { applyMusicTrack } from '@/stores/viewer/media/audio';
import { viewerStore } from '@/stores/viewer';
import type { AudioTrack } from '@/lib/media/audio/track-types';

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
  const [altSources, setAltSources] = createSignal<AudioTrack[]>([]);
  const [altLoading, setAltLoading] = createSignal(false);

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
    import('@/lib/media/audio/music-play-config').then(({ getMusicPlayConfig }) => {
      const cfg = getMusicPlayConfig();
      localStorage.setItem(
        'reader_music_play_config',
        JSON.stringify({ ...cfg, playSpeed: speed }),
      );
    });
  };

  const applyEq = (preset: keyof typeof EQ_PRESETS) => {
    setEqPreset(preset);
    setMusicSettings({ eqPreset: preset });
    props.player.getWebAudio()?.applyEqPreset(preset);
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-6">
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
          <p class="text-sm text-muted-foreground">加载中…</p>
        </Show>
        <Show when={props.player.error()}>
          <p class="text-sm text-destructive">{props.player.error()}</p>
        </Show>
        <audio ref={props.player.bindAudio} class="hidden" />
        <Show when={props.player.url()}>
          <div class="flex w-full max-w-lg flex-col gap-4">
            <AudioLyricPanel
              lyric={props.player.fetchedLyric()}
              bundle={props.player.fetchedLyricBundle()}
              lyricTrack={props.player.lyricTrack()}
              positionSec={props.player.player.currentTime()}
              lyricOffset={getMusicSettings().lyricOffset ?? 0}
            />
            <div class="flex flex-wrap items-center justify-center gap-2">
              <select
                class="rounded-md border bg-background px-2 py-1 text-xs"
                value={props.player.lyricTrack()}
                onChange={(e) => {
                  const kind = e.currentTarget.value as LyricTrackKind;
                  props.player.setLyricTrack(kind);
                  setMusicSettings({ lyricTrack: kind });
                }}
              >
                <option value="lyric">原文</option>
                <option value="tlyric">翻译</option>
                <option value="rlyric">罗马音</option>
                <option value="lxlyric">逐字</option>
              </select>
              <select
                class="rounded-md border bg-background px-2 py-1 text-xs"
                value={getPlayQuality()}
                onChange={(e) => setPlayQuality(e.currentTarget.value as MusicQuality)}
              >
                {Object.entries(QUALITY_LABELS).map(([k, label]) => (
                  <option value={k}>{label}</option>
                ))}
              </select>
              <Button size="sm" variant="outline" class="text-xs" onClick={() => void loadAltSources()}>
                {altLoading() ? '匹配中…' : '换源'}
              </Button>
            </div>
            <Show when={altSources().length > 0}>
              <div class="flex flex-wrap justify-center gap-1">
                <For each={altSources()}>
                  {(alt) => (
                    <button
                      type="button"
                      class="rounded border px-2 py-0.5 text-xs hover:bg-muted"
                      onClick={() => void switchToAlt(alt)}
                    >
                      {BUILTIN_SOURCE_LABELS[alt.source] ?? alt.source}
                    </button>
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
              <select
                class="rounded-md border bg-background px-2 py-1 text-xs"
                value={playSpeed()}
                onChange={(e) => applySpeed(parseFloat(e.currentTarget.value))}
              >
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                  <option value={s}>{s}x</option>
                ))}
              </select>
              <select
                class="rounded-md border bg-background px-2 py-1 text-xs"
                value={eqPreset()}
                onChange={(e) =>
                  applyEq(e.currentTarget.value as keyof typeof EQ_PRESETS)
                }
              >
                {Object.keys(EQ_PRESETS).map((k) => (
                  <option value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div class="flex items-center justify-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => void toggleLove()}>
                <Heart class={cn('h-5 w-5', loved() && 'fill-red-500 text-red-500')} />
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
    </div>
  );
};
