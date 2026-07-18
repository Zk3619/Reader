/**
 * 音乐 Hub 共享播放器逻辑（桌面/移动布局复用）
 */

import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  untrack,
} from 'solid-js';
import { viewerStore } from '@/stores/viewer';
import {
  playNextTrack,
  playNextTrackAfterError,
  playPrevTrack,
  retryMusicTrackPlayback,
  setMusicSection,
  updatePersistedPlayProgress,
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
import { pickLyricText, resolveEffectiveLyricTrack } from '@/lib/media/audio/lyric-types';
import {
  getMusicSettings,
  setMusicSettings,
  subscribeMusicSettings,
  type MusicPlayTimerAction,
} from '@/lib/media/audio/music-settings';
import { executeMusicPlayTimerSystemAction } from '@/lib/media/audio/music-play-timer';
import { isTauri } from '@/lib/platform/detect';
import { startMusicOpenApiStateSync } from '@/lib/media/audio/platform/music-openapi-state';
import {
  setMusicPlaybackSleepBlocked,
  setMusicTaskbarProgress,
} from '@/lib/media/audio/platform/music-playback-platform';
import { convertChineseText } from '@/lib/replace-rules/chinese-converter';
import { isTrackInLove } from '@/lib/database/audio-library';
import { consumeMusicStartupAutoPlayGate } from '@/lib/persistence/domains/music-session';

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
  playing: boolean;
  fullscreen: boolean;
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
  const initialSettings = getMusicSettings();
  const [settings, setSettings] = createSignal(initialSettings);
  const [fetchedLyricBundle, setFetchedLyricBundle] = createSignal<LyricBundle | null>(null);
  const [lyricTrack, setLyricTrack] = createSignal<LyricTrackKind>(initialSettings.lyricTrack);
  const [musicVolume, setMusicVolumeSignal] = createSignal(initialSettings.musicVolume);
  const [musicMuted, setMusicMutedSignal] = createSignal(initialSettings.musicMuted);
  const [musicCollected, setMusicCollected] = createSignal(false);
  const [musicPlayMode, setMusicPlayMode] = createSignal(getMusicPlayConfig().playMode);
  const setMusicVolume = (value: number) => {
    const normalized = Math.max(0, Math.min(1, value));
    if (normalized === musicVolume()) return;
    setMusicVolumeSignal(normalized);
    setMusicSettings({ musicVolume: normalized });
  };
  const setMusicMuted = (value: boolean) => {
    if (value === musicMuted()) return;
    setMusicMutedSignal(value);
    setMusicSettings({ musicMuted: value });
  };

  const effectiveLyricTrack = createMemo(() =>
    resolveEffectiveLyricTrack(
      fetchedLyricBundle(),
      lyricTrack(),
      settings().lyricUseLxLyric !== false,
    ),
  );

  const fetchedLyric = createMemo(() =>
    pickLyricText(fetchedLyricBundle(), effectiveLyricTrack()) ?? '',
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

  const shouldAutoPlay = () => {
    // 冷启动恢复队列：尊重「启动软件后自动播放」；其余走「选中/切歌后播放」
    const startup = consumeMusicStartupAutoPlayGate();
    if (startup != null) return startup;
    return settings().autoPlay;
  };

  let playTimeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let configuredPlayTimerTargetAt = 0;
  let pendingTimerEndAction: Exclude<MusicPlayTimerAction, 'pause'> | null = null;
  const playTimerTargetAt = createMemo(() => settings().playTimerTargetAt ?? 0);

  const handleEnded = async () => {
    const timerAction = pendingTimerEndAction;
    if (timerAction) {
      pendingTimerEndAction = null;
      if (timerAction === 'exit-after-track' || timerAction === 'shutdown-after-track') {
        await executeMusicPlayTimerSystemAction(timerAction);
      }
      return;
    }
    await playNextTrack();
  };


  // 会话恢复后可能只有队列无 URL：挂载时补一次取链（是否自动播放由 shouldAutoPlay/startup 门闩决定）
  onMount(() => {
    void (async () => {
      const st = viewerStore.state;
      if (st.trackQueue.length === 0) return;
      if (st.musicPrimaryUrl || (st.musicMediaUrls?.length ?? 0) > 0) return;
      const { applyMusicTrack } = await import('@/stores/viewer/media/audio');
      await applyMusicTrack(st.trackIndex);
    })();
  });

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
    autoPlay: shouldAutoPlay,
    onChapterPosChange: (pos) => {
      // 切歌取链中勿回写进度，否则会冲掉新曲的记忆进度 / 把旧曲进度写成 0
      if (loading()) return;
      viewerStore.setChapterPos(pos);
      const track = currentTrack();
      if (track && settings().rememberProgress) {
        saveTrackProgress(`${track.source}:${track.id}`, pos);
      }
      // 对齐 lx：节流写入 playInfo.time / maxTime（music.session / SQLite）
      updatePersistedPlayProgress(pos, player.duration());
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
        const kind = viewerStore.state.playerListKind;
        const canAutoSkip =
          getMusicSettings().autoSkipOnError !== false &&
          trackQueue().length > 1 &&
          (origin === 'list' ||
            kind === 'online-playlist' ||
            kind === 'leaderboard' ||
            kind === 'temporary' ||
            kind === 'builtin' ||
            kind === 'user');
        if (canAutoSkip) {
          console.warn('[music] autoSkipOnError after decode/playback error');
          await playNextTrackAfterError();
          return;
        }
        await retryMusicTrackPlayback();
      })();
    },
  });

  createEffect(() => {
    const track = currentTrack();
    const targetAt = playTimerTargetAt();
    if (targetAt !== configuredPlayTimerTargetAt) {
      if (playTimeoutTimer) clearTimeout(playTimeoutTimer);
      playTimeoutTimer = undefined;
      configuredPlayTimerTargetAt = targetAt;
      if (targetAt > 0) pendingTimerEndAction = null;
    }
    if (!track || targetAt <= 0 || playTimeoutTimer) return;
    playTimeoutTimer = setTimeout(() => {
      playTimeoutTimer = undefined;
      const action = getMusicSettings().playTimerAction;
      if (action === 'pause') {
        if (player.playing()) player.togglePlay();
      } else {
        pendingTimerEndAction = action;
      }
      setMusicSettings({ playTimerTargetAt: 0 });
    }, Math.max(0, targetAt - Date.now()));
  });
  onCleanup(() => {
    if (playTimeoutTimer) clearTimeout(playTimeoutTimer);
  });

  createEffect(() => {
    const track = currentTrack();
    if (!track) return;
    if (!settings().rememberProgress) {
      viewerStore.setChapterPos(0);
      return;
    }
    const fromLs = readTrackProgress(`${track.source}:${track.id}`);
    // hydrate 可能已写入 chapterPos；LS 尚未就绪时不要用 0 覆盖
    if (fromLs > 0) {
      viewerStore.setChapterPos(fromLs);
      return;
    }
    const existing = viewerStore.state.chapterPos;
    if (!(existing > 0)) {
      viewerStore.setChapterPos(0);
    }
  });

  createEffect(() => {
    const t = currentTrack();
    const bundle = fetchedLyricBundle();
    // 仅在曲目/歌词包变化时重建同步；进度由 interval 内 untrack 读取
    void t?.id;
    void t?.source;
    void bundle;
    const stopSync = startMusicOpenApiStateSync(() =>
      untrack(() => ({
        playing: player.playing(),
        position: player.currentTime(),
        duration: player.duration(),
        volume: musicVolume(),
        muted: musicMuted(),
        collected: musicCollected(),
        trackName: currentTrack()?.name,
        trackArtist: currentTrack()?.artist,
        trackSource: currentTrack()?.source,
        lyric: fetchedLyric(),
        lyricAll: fetchedLyricBundle()
          ? {
              lyric: pickLyricText(fetchedLyricBundle(), 'lyric') ?? '',
              tlyric: pickLyricText(fetchedLyricBundle(), 'tlyric') ?? '',
              rlyric: pickLyricText(fetchedLyricBundle(), 'rlyric') ?? '',
              lxlyric: pickLyricText(fetchedLyricBundle(), 'lxlyric') ?? '',
            }
          : undefined,
      })),
    );
    onCleanup(stopSync);
  });

  createEffect(() => {
    notifyAudioShellPlayingChanged();
    const t = currentTrack();
    const playing = player.playing();
    const pushSession = () => {
      void syncAndroidMediaSession({
        playing: untrack(() => player.playing()),
        title: t?.name ?? '音乐',
        artist: t?.artist,
        coverUrl: typeof t?.meta.coverUrl === 'string' ? t.meta.coverUrl : undefined,
        positionSec: untrack(() => player.currentTime()),
        durationSec: untrack(() => player.duration()),
      });
    };
    pushSession();
    if (t) {
      globalMediaPlayerStore.updateMeta({
        title: t.name,
        subtitle: t.artist,
        preview: t.artist,
        coverUrl: typeof t.meta.coverUrl === 'string' ? t.meta.coverUrl : undefined,
      });
    }
    if (!playing) return;
    const timer = window.setInterval(pushSession, 1000);
    onCleanup(() => clearInterval(timer));
  });

  createEffect(() => {
    void setMusicPlaybackSleepBlocked(
      settings().preventSleepWhilePlaying && player.playing(),
    );
  });

  createEffect(() => {
    const enabled = settings().showTaskbarProgress;
    const playing = player.playing();
    const hasError = Boolean(error());
    // 曲目切换时推一次；播放中由定时器刷新进度
    void currentTrack()?.id;
    void setMusicTaskbarProgress({
      enabled,
      playing,
      hasError,
      position: untrack(() => player.currentTime()),
      duration: untrack(() => player.duration()),
    });
    if (!enabled) return;
    const timer = window.setInterval(() => {
      void setMusicTaskbarProgress({
        enabled: true,
        playing: untrack(() => player.playing()),
        hasError: Boolean(untrack(() => error())),
        position: untrack(() => player.currentTime()),
        duration: untrack(() => player.duration()),
      });
    }, 1000);
    onCleanup(() => clearInterval(timer));
  });

  createEffect(() => {
    const track = currentTrack();
    if (!track) {
      setMusicCollected(false);
      return;
    }
    let cancelled = false;
    void isTrackInLove(track.id).then((collected) => {
      if (!cancelled) setMusicCollected(collected);
    });
    onCleanup(() => {
      cancelled = true;
    });
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
    const playing = player.playing();
    const push = () => {
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
        positionSec: untrack(() => player.currentTime()),
        playing: untrack(() => player.playing()),
        fullscreen: document.fullscreenElement != null,
      });
    };
    push();
    if (!playing) return;
    const timer = window.setInterval(push, 500);
    onCleanup(() => clearInterval(timer));
  });

  let webAudio: WebAudioPlayerEngine | undefined;
  let unlistenAndroid: (() => void) | undefined;

  onMount(() => {
    // 以 label 作为“当前设备身份”，对齐 LX：设备拔插后 label 变化才算切换
    let prevDeviceLabel: string | undefined;
    const applyResolvedOutput = async (savedId: string) => {
      const resolved = await WebAudioPlayerEngine.resolveOutputDevice(savedId);
      if (resolved.missing) {
        // 保存的设备已不存在：回退到默认并持久化
        setMusicSettings({
          audioOutputDeviceId: resolved.deviceId === 'default' ? '' : resolved.deviceId,
        });
      }
      await webAudio?.setOutputDevice(
        resolved.deviceId === 'default' ? '' : resolved.deviceId,
      );
      return resolved;
    };
    void applyResolvedOutput(settings().audioOutputDeviceId).then((resolved) => {
      prevDeviceLabel = resolved.label;
    });
    const unsubscribeSettings = subscribeMusicSettings((next) => {
      setSettings(next);
      setLyricTrack(next.lyricTrack);
      setMusicVolumeSignal(next.musicVolume);
      setMusicMutedSignal(next.musicMuted);
      const el = document.querySelector<HTMLAudioElement>('audio[data-music-hub-player]');
      if (el) el.preservesPitch = next.preservesPitch;
      if (next.eqCustomGains) webAudio?.applyCustomEq(next.eqCustomGains);
      else webAudio?.applyEqPreset(next.eqPreset);
      webAudio?.setMaxChannels(next.audioUseMaxChannels ? 32 : next.audioMaxChannels);
      void applyResolvedOutput(next.audioOutputDeviceId).then((resolved) => {
        prevDeviceLabel = resolved.label;
      });
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
    const handleDeviceChange = async () => {
      const resolved = await applyResolvedOutput(settings().audioOutputDeviceId);
      const changed =
        prevDeviceLabel !== undefined && prevDeviceLabel !== resolved.label;
      prevDeviceLabel = resolved.label;
      // 对齐 LX：当前声音输出设备被改变时暂停播放
      if (changed && settings().audioPauseOnDeviceRemoved && player.playing()) {
        player.togglePlay();
      }
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    onCleanup(() =>
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange),
    );
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
    void setMusicPlaybackSleepBlocked(false);
    void setMusicTaskbarProgress({
      enabled: false,
      playing: false,
      hasError: false,
      position: 0,
      duration: 0,
    });
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
      gain: 1,
      eqPreset: currentSettings.eqPreset,
      eqCustomGains: currentSettings.eqCustomGains,
      outputDeviceId: currentSettings.audioOutputDeviceId,
      maxChannels: currentSettings.audioUseMaxChannels
        ? 32
        : currentSettings.audioMaxChannels,
    });
    // 绑定后再次解析：若保存设备已失效则回退并持久化
    void WebAudioPlayerEngine.resolveOutputDevice(currentSettings.audioOutputDeviceId).then(
      async (resolved) => {
        if (resolved.missing) {
          setMusicSettings({
            audioOutputDeviceId: resolved.deviceId === 'default' ? '' : resolved.deviceId,
          });
        }
        await webAudio?.setOutputDevice(
          resolved.deviceId === 'default' ? '' : resolved.deviceId,
        );
      },
    );
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
    effectiveLyricTrack,
    setLyricTrack,
    musicPlayMode,
    setMusicPlayMode,
    musicVolume,
    setMusicVolume,
    musicMuted,
    setMusicMuted,
    musicCollected,
    setMusicCollected,
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
