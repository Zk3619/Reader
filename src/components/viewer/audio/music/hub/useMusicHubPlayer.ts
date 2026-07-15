/**
 * 音乐 Hub 共享播放器逻辑（桌面/移动布局复用）
 */

import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
import { viewerStore } from '@/stores/viewer';
import {
  playNextTrack,
  playPrevTrack,
  retryMusicTrackPlayback,
  setMusicSection,
} from '@/stores/viewer/media/audio';
import { useAudioPlayer } from '@/lib/media/audio/use-audio-player';
import { getMusicPlayConfig } from '@/lib/media/audio/music-play-config';
import { playableFromTrack } from '@/lib/media/audio/playable-item';
import { syncAndroidMediaSession, listenAndroidMediaActions } from '@/lib/media/audio/platform/android-media-session';
import {
  registerAudioShellHandlers,
  notifyAudioShellPlayingChanged,
} from '@/lib/media/audio/audio-shell-controls';
import { resolveOnlineLyricFull } from '@/lib/media/audio/online/source-router';
import { globalMediaPlayerStore } from '@/stores/global-media-player';
import { WebAudioPlayerEngine } from '@/lib/media/audio/engine/web-audio-player';
import type { LyricBundle, LyricTrackKind } from '@/lib/media/audio/lyric-types';
import { pickLyricText } from '@/lib/media/audio/lyric-types';
import {
  getMusicSettings,
  subscribeMusicSettings,
} from '@/lib/media/audio/music-settings';
import { isTauri } from '@/lib/platform/detect';
import { startMusicOpenApiStateSync } from '@/lib/media/audio/platform/music-openapi-state';
import { convertChineseText } from '@/lib/replace-rules/chinese-converter';

const MUSIC_PROGRESS_STORAGE_KEY = 'reader_music_track_progress';

function readTrackProgress(trackKey: string): number {
  try {
    const raw = localStorage.getItem(MUSIC_PROGRESS_STORAGE_KEY);
    const value = raw
      ? Number((JSON.parse(raw) as Record<string, number>)[trackKey])
      : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function saveTrackProgress(trackKey: string, positionSec: number): void {
  try {
    const raw = localStorage.getItem(MUSIC_PROGRESS_STORAGE_KEY);
    const progress = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    progress[trackKey] = Math.max(0, positionSec);
    localStorage.setItem(MUSIC_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // ignore
  }
}

async function convertLyricBundle(
  bundle: LyricBundle,
  type: 0 | 1 | 2,
): Promise<LyricBundle> {
  if (type === 0) return bundle;
  const entries = await Promise.all(
    Object.entries(bundle).map(async ([key, value]) => [
      key,
      typeof value === 'string' ? await convertChineseText(value, type) : value,
    ]),
  );
  return Object.fromEntries(entries) as LyricBundle;
}

async function emitDesktopLyric(payload: {
  title: string;
  artist: string;
  lyric: string;
  lyricAll?: {
    lyric: string;
    tlyric: string;
    rlyric: string;
    lxlyric: string;
  };
  positionSec: number;
}): Promise<void> {
  if (!isTauri()) return;
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit('desktop-lyric-update', payload);
  } catch {
    // ignore
  }
}

export function useMusicHubPlayer() {
  const [settings, setSettings] = createSignal(getMusicSettings());
  const [fetchedLyricBundle, setFetchedLyricBundle] = createSignal<LyricBundle | null>(null);
  const [lyricTrack, setLyricTrack] = createSignal<LyricTrackKind>(settings().lyricTrack);
  const [musicVolume, setMusicVolume] = createSignal(1);
  const [musicMuted, setMusicMuted] = createSignal(false);
  const [musicPlayMode, setMusicPlayMode] = createSignal(getMusicPlayConfig().playMode);

  const fetchedLyric = createMemo(() =>
    pickLyricText(fetchedLyricBundle(), lyricTrack()) ?? '',
  );

  const state = () => viewerStore.state;
  const trackQueue = () => state().trackQueue;
  const trackIndex = () => state().trackIndex;
  const currentTrack = createMemo(() => trackQueue()[trackIndex()]);
  const url = () => state().primaryUrl;
  const mediaUrls = () => state().mediaUrls;
  const loading = () => state().loading;
  const playbackStatus = () => state().playbackStatus;
  const error = () => state().error;

  const audioConfig = createMemo(() => ({
    ...getMusicPlayConfig(),
    playSpeed: settings().playSpeed,
    playMode: musicPlayMode(),
  }));

  const playableItem = createMemo(() => {
    const track = currentTrack();
    const urls = mediaUrls();
    if (!track || urls.length === 0) return null;
    const item = playableFromTrack(track, urls);
    const lyric = fetchedLyric();
    if (lyric) item.lyric = lyric;
    return item;
  });

  let stopAfterCurrentTrack = false;
  let playTimeoutTimer: ReturnType<typeof setTimeout> | undefined;

  const handleEnded = async () => {
    if (stopAfterCurrentTrack) {
      stopAfterCurrentTrack = false;
      return;
    }
    await playNextTrack();
  };

  const player = useAudioPlayer({
    src: url,
    mediaUrls,
    playableItem,
    chapterIndex: trackIndex,
    catalog: () => [],
    chapterPos: () => state().chapterPos,
    book: () => null,
    audioConfig,
    loading,
    autoPlay: () => settings().autoPlay,
    onChapterPosChange: (pos) => {
      viewerStore.setChapterPos(pos);
      const track = currentTrack();
      if (track && settings().rememberProgress) {
        saveTrackProgress(`${track.source}:${track.id}`, pos);
      }
    },
    onEndedChapter: handleEnded,
    onSaveProgress: async () => {},
    onSkipVolumeChapter: async (index) => {
      const { applyMusicTrack } = await import('@/stores/viewer/media/audio');
      await applyMusicTrack(index);
    },
    onPlaybackError: () => {
      void (async () => {
        const { getMusicSettings } = await import('@/lib/media/audio/music-settings');
        const origin = viewerStore.state.musicQueueOrigin;
        if (
          getMusicSettings().autoSkipOnError !== false &&
          origin === 'list' &&
          trackQueue().length > 1
        ) {
          console.warn('[music] autoSkipOnError after decode/playback error');
          await playNextTrack();
          return;
        }
        await retryMusicTrackPlayback();
      })();
    },
  });

  createEffect(() => {
    const track = currentTrack();
    const timeoutSec = settings().playTimeoutSec ?? 0;
    const waitForTrackEnd = settings().playTimeoutWaitForTrackEnd;
    if (playTimeoutTimer) clearTimeout(playTimeoutTimer);
    stopAfterCurrentTrack = false;
    if (!track || timeoutSec <= 0) return;
    playTimeoutTimer = setTimeout(() => {
      playTimeoutTimer = undefined;
      if (waitForTrackEnd) {
        stopAfterCurrentTrack = true;
      } else if (player.playing()) {
        player.togglePlay();
      }
    }, timeoutSec * 1000);
  });
  onCleanup(() => {
    if (playTimeoutTimer) clearTimeout(playTimeoutTimer);
  });

  createEffect(() => {
    const track = currentTrack();
    if (!track) return;
    const position = settings().rememberProgress
      ? readTrackProgress(`${track.source}:${track.id}`)
      : 0;
    viewerStore.setChapterPos(position);
  });

  createEffect(() => {
    const t = currentTrack();
    const bundle = fetchedLyricBundle();
    const stopSync = startMusicOpenApiStateSync(() => ({
      playing: player.playing(),
      position: player.currentTime(),
      duration: player.duration(),
      volume: musicVolume(),
      muted: musicMuted(),
      collected: false,
      trackName: t?.name,
      trackArtist: t?.artist,
      trackSource: t?.source,
      lyric: fetchedLyric(),
      lyricAll: bundle
        ? {
            lyric: pickLyricText(bundle, 'lyric') ?? '',
            tlyric: pickLyricText(bundle, 'tlyric') ?? '',
            rlyric: pickLyricText(bundle, 'rlyric') ?? '',
            lxlyric: pickLyricText(bundle, 'lxlyric') ?? '',
          }
        : undefined,
    }));
    onCleanup(stopSync);
  });

  createEffect(() => {
    notifyAudioShellPlayingChanged();
    const t = currentTrack();
    void syncAndroidMediaSession({
      playing: player.playing(),
      title: t?.name ?? '音乐',
      artist: t?.artist,
      coverUrl: typeof t?.meta.coverUrl === 'string' ? t.meta.coverUrl : undefined,
      positionSec: player.currentTime(),
      durationSec: player.duration(),
    });
    if (t) {
      globalMediaPlayerStore.updateMeta({
        title: t.name,
        subtitle: t.artist,
        preview: t.artist,
        coverUrl: typeof t.meta.coverUrl === 'string' ? t.meta.coverUrl : undefined,
      });
    }
  });

  createEffect(() => {
    const t = currentTrack();
    const conversion = settings().lyricChineseConversion;
    // 依赖换源后的 id/source，确保换源成功会重拉歌词
    void t?.id;
    void t?.source;
    if (!t) {
      setFetchedLyricBundle(null);
      return;
    }
    setFetchedLyricBundle(null);
    let cancelled = false;
    if (typeof t.meta.lyricText === 'string' && t.meta.lyricText.trim()) {
      void convertLyricBundle({ lyric: t.meta.lyricText }, conversion).then(
        (bundle) => {
          if (!cancelled) setFetchedLyricBundle(bundle);
        },
      );
    } else {
      void resolveOnlineLyricFull(t).then(async (bundle) => {
        if (!bundle || cancelled) return;
        const converted = await convertLyricBundle(bundle, conversion);
        if (!cancelled) setFetchedLyricBundle(converted);
      });
    }
    onCleanup(() => {
      cancelled = true;
    });
  });

  createEffect(() => {
    const t = currentTrack();
    const lyric = fetchedLyric();
    const bundle = fetchedLyricBundle();
    if (!t || !lyric) return;
    void emitDesktopLyric({
      title: t.name,
      artist: t.artist,
      lyric,
      lyricAll: bundle
        ? {
            lyric: pickLyricText(bundle, 'lyric') ?? '',
            tlyric: pickLyricText(bundle, 'tlyric') ?? '',
            rlyric: pickLyricText(bundle, 'rlyric') ?? '',
            lxlyric: pickLyricText(bundle, 'lxlyric') ?? '',
          }
        : undefined,
      positionSec: player.currentTime(),
    });
  });

  let webAudio: WebAudioPlayerEngine | undefined;
  let unlistenAndroid: (() => void) | undefined;

  onMount(() => {
    const unsubscribeSettings = subscribeMusicSettings((next) => {
      setSettings(next);
      const el = document.querySelector<HTMLAudioElement>('audio[data-music-hub-player]');
      if (el) el.preservesPitch = next.preservesPitch;
      webAudio?.applyEqPreset(next.eqPreset);
    });
    onCleanup(unsubscribeSettings);

    void listenAndroidMediaActions((action) => {
      switch (action) {
        case 'play':
          if (!player.playing()) player.togglePlay();
          break;
        case 'pause':
          if (player.playing()) player.togglePlay();
          break;
        case 'next':
          void playNextTrack();
          break;
        case 'prev':
          void playPrevTrack();
          break;
      }
    }).then((fn) => {
      unlistenAndroid = fn;
    });

    if (isTauri()) {
      void import('@tauri-apps/api/event').then(({ listen }) =>
        listen<{ action?: string }>('desktop-lyric-command', (e) => {
          const action = e.payload.action;
          switch (action) {
            case 'play':
              if (!player.playing()) player.togglePlay();
              break;
            case 'pause':
              if (player.playing()) player.togglePlay();
              break;
            case 'next':
              void playNextTrack();
              break;
            case 'prev':
              void playPrevTrack();
              break;
            case 'close':
              void import('@tauri-apps/api/core').then(({ invoke }) =>
                invoke('close_desktop_lyric_window'),
              );
              break;
            default:
              break;
          }
        }),
      );
    }
    registerAudioShellHandlers({
      togglePlay: () => player.togglePlay(),
      skipPrev: () => void playPrevTrack(),
      skipNext: () => void playNextTrack(),
      stop: () => globalMediaPlayerStore.deactivate(),
      openViewer: () => setMusicSection('nowPlaying'),
      isPlaying: () => player.playing(),
    });
    if (currentTrack()) {
      globalMediaPlayerStore.activate(
        'audio',
        {
          title: currentTrack()?.name ?? '音乐',
          subtitle: currentTrack()?.artist,
          coverUrl:
            typeof currentTrack()?.meta.coverUrl === 'string'
              ? currentTrack()!.meta.coverUrl
              : undefined,
        },
        'shell-music-hub',
      );
    }
  });

  onCleanup(() => {
    unlistenAndroid?.();
    registerAudioShellHandlers(null);
  });

  createEffect(() => {
    const vol = musicVolume();
    const muted = musicMuted();
    const el = document.querySelector<HTMLAudioElement>('audio[data-music-hub-player]');
    if (el) {
      el.volume = vol;
      el.muted = muted;
    }
  });

  const bindAudio = (el: HTMLAudioElement) => {
    const currentSettings = settings();
    el.setAttribute('data-music-hub-player', '1');
    el.volume = musicVolume();
    el.muted = musicMuted();
    el.preservesPitch = currentSettings.preservesPitch;
    player.audioRef(el);
    webAudio?.dispose();
    webAudio = new WebAudioPlayerEngine({
      audioElement: el,
      eqPreset: currentSettings.eqPreset,
    });
    void webAudio.resume();
  };
  onCleanup(() => webAudio?.dispose());

  return {
    player,
    currentTrack,
    url,
    loading,
    playbackStatus,
    error,
    fetchedLyric,
    fetchedLyricBundle,
    lyricTrack,
    setLyricTrack,
    musicPlayMode,
    setMusicPlayMode,
    musicVolume,
    setMusicVolume,
    musicMuted,
    setMusicMuted,
    bindAudio,
    getWebAudio: () => webAudio,
  };
}

export function formatMusicTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
