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
  setMusicPositionSec,
  updatePersistedPlayProgress,
} from '@/stores/viewer/media/audio';
import { useAudioPlayer } from '@/lib/media/audio/use-audio-player';
import { updatePlaybackOwnerHandlers } from '@/lib/media/playback-exclusivity';
import {
  getMusicPlayConfig,
  cycleMusicPlayMode,
  setMusicPlayMode as persistMusicPlayMode,
} from '@/lib/media/audio/music-play-config';
import { playableFromTrack } from '@/lib/media/audio/playable-item';
import { formatDurationSec } from '@/lib/media/audio/track-types';
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
import { currentLyricLine } from '@/lib/media/audio/current-lyric-line';
import {
  getMusicSettings,
  setMusicSettings,
  subscribeMusicSettings,
  type MusicPlayTimerAction,
} from '@/lib/media/audio/music-settings';
import { visualizerFrameIntervalMs } from '@/lib/media/audio/music-audio-visualizer-fps';
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
import { consumeMusicForceAutoPlay } from '@/lib/media/audio/music-play-intent';
import {
  bootstrapDesktopLyricWindow,
  setDesktopLyricEnabled,
  notifyDesktopLyricTrackAvailability,
} from '@/lib/media/audio/desktop-lyric-window';
import {
  bootstrapMusicMiniPlayerWindow,
  emitMusicMiniPlayerUpdate,
  notifyMusicMiniPlayerTrackAvailability,
} from '@/lib/media/audio/music-mini-player-window';
import { subscribeLinkLyric } from '@/lib/media/audio/link-lyric';

import {
  saveMusicTrackProgress,
} from '@/lib/media/audio/music-track-progress';

function saveTrackProgress(trackKey: string, positionSec: number): void {
  saveMusicTrackProgress(trackKey, positionSec);
}

function parseListedDurationSec(duration: string | undefined): number {
  if (!duration || duration === '00:00' || duration === '0:00' || duration === '--:--') {
    return 0;
  }
  const parts = duration.split(':').map((p) => Number.parseInt(p, 10));
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return 0;
  let sec = 0;
  let unit = 1;
  const copy = [...parts];
  while (copy.length) {
    sec += (copy.pop() ?? 0) * unit;
    unit *= 60;
  }
  return sec > 0 ? sec : 0;
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
  trackId?: string;
  trackSource?: string;
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
  playMode?: number;
}): Promise<void> {
  if (!isTauri()) return;
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit('desktop-lyric-update', payload);
  } catch {
    // ignore
  }
}

async function emitDesktopLyricAnalyser(data: Uint8Array): Promise<void> {
  if (!isTauri()) return;
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit('desktop-lyric-analyser', Array.from(data));
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
  const [linkLyricRev, setLinkLyricRev] = createSignal(0);
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

  onMount(() => {
    const unsubLinkLyric = subscribeLinkLyric(() => setLinkLyricRev((v) => v + 1));
    onCleanup(unsubLinkLyric);
  });

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
  // 音乐后台地址与听书/漫画 mediaUrls 隔离（见 applyMusicTrack → music*）
  const url = () => state().musicPrimaryUrl;
  const mediaUrls = () => state().musicMediaUrls;
  const loading = () => state().musicLoading;
  const playbackStatus = () => state().playbackStatus;
  const error = () => state().musicError;

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
    if (consumeMusicForceAutoPlay()) return true;
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
    // 取链中不得切歌；曲终事件本身已在播放器侧去重
    if (viewerStore.state.musicLoading) return;
    const timerAction = pendingTimerEndAction;
    if (timerAction) {
      pendingTimerEndAction = null;
      if (timerAction === 'exit-after-track' || timerAction === 'shutdown-after-track') {
        await executeMusicPlayTimerSystemAction(timerAction);
      }
      return;
    }
    setMusicPositionSec(0);
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
    chapterPos: () => state().musicPositionSec,
    book: () => null,
    audioConfig,
    loading,
    autoPlay: shouldAutoPlay,
    playbackOwner: 'music',
    onChapterPosChange: (pos) => {
      // 切歌取链中勿回写进度，否则会冲掉新曲的记忆进度 / 把旧曲进度写成 0
      if (loading()) return;
      // 曲终切歌瞬间 loading 可能尚未置位，禁止把曲末秒数写回
      if (viewerStore.state.musicLoading) return;
      setMusicPositionSec(pos);
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
        // 取链中进度/时长为 0：此时的 media error 多为清 src 噪声，不得跳过
        if (viewerStore.state.musicLoading) return;
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

  // MF 等源常缺 duration：播放器拿到真实时长后回写 DB / 列表 / 队列
  let lastDurationBackfillKey = '';
  createEffect(() => {
    const track = currentTrack();
    const durSec = player.duration();
    if (!track || loading()) return;
    if (!Number.isFinite(durSec) || durSec < 1) return;
    const key = `${track.id}:${Math.floor(durSec)}`;
    if (key === lastDurationBackfillKey) return;
    const existing = parseListedDurationSec(track.duration);
    if (existing >= 1) return;
    lastDurationBackfillKey = key;
    const nextDuration = formatDurationSec(durSec);
    void (async () => {
      try {
        const { updateAudioTrackDuration } = await import('@/lib/database/audio-library');
        await updateAudioTrackDuration(track.id, nextDuration);
      } catch {
        /* ignore */
      }
      const { setState, state } = await import('@/stores/viewer/media/state');
      const queue = state.trackQueue;
      const idx = queue.findIndex((t) => t.id === track.id);
      if (idx >= 0 && parseListedDurationSec(queue[idx]?.duration) < 1) {
        const nextQueue = queue.slice();
        nextQueue[idx] = { ...nextQueue[idx]!, duration: nextDuration };
        setState({ trackQueue: nextQueue });
      }
    })();
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

  // 仅在「曲目身份」变化时归零；首挂载保留 session hydrate 写入的位置。
  // 切歌不得读 per-track localStorage 续播（与 resolveMusicTrackStartPositionSec 一致），
  // 否则列表循环/随机/手动切回已播过的歌会 seek 到旧进度。
  let lastProgressTrackKey: string | null = null;
  createEffect(() => {
    const track = currentTrack();
    if (!track) return;
    const key = `${track.source}:${track.id}`;
    const trackChanged = lastProgressTrackKey != null && lastProgressTrackKey !== key;
    lastProgressTrackKey = key;
    if (trackChanged) setMusicPositionSec(0);
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
    const lyric = fetchedLyric();
    const pushSession = () => {
      const line = currentLyricLine(
        lyric ?? '',
        untrack(() => player.currentTime()),
      ).trim();
      const useBtLyric =
        getMusicSettings().bluetoothLyricEnabled === true && line.length > 0;
      void syncAndroidMediaSession({
        playing: untrack(() => player.playing()),
        title: useBtLyric ? line : (t?.name ?? '音乐'),
        artist: useBtLyric
          ? [t?.name, t?.artist].filter(Boolean).join(' · ')
          : t?.artist,
        coverUrl: typeof t?.meta.coverUrl === 'string' ? t.meta.coverUrl : undefined,
        positionSec: untrack(() => player.currentTime()),
        durationSec: untrack(() => player.duration()),
      });
    };
    const pushShellMeta = () => {
      if (!t) return;
      const line = currentLyricLine(lyric, untrack(() => player.currentTime())).trim();
      globalMediaPlayerStore.updateMeta({
        title: t.name,
        subtitle: t.artist,
        preview: line || '…',
        coverUrl: typeof t.meta.coverUrl === 'string' ? t.meta.coverUrl : undefined,
      });
      void import('@/lib/media/audio/platform/title-lyric').then(({ syncMusicTitleLyric }) =>
        syncMusicTitleLyric({
          playing: untrack(() => player.playing()),
          trackName: t.name,
          trackArtist: t.artist,
          lyricLine: line,
        }),
      );
      void import('@/lib/media/audio/platform/music-tray').then(({ syncMusicStatusBarLyric }) => {
        void syncMusicStatusBarLyric(line);
      });
    };
    pushSession();
    pushShellMeta();
    if (!playing) return;
    const timer = window.setInterval(() => {
      pushSession();
      pushShellMeta();
    }, 500);
    onCleanup(() => clearInterval(timer));
  });

  createEffect(() => {
    void currentTrack()?.id;
    void player.playing();
    void musicCollected();
    void settings().desktopLyricEnabled;
    void settings().desktopLyricLocked;
    void settings().desktopLyricAlwaysOnTop;
    void settings().showStatusBarLyric;
    void import('@/lib/media/audio/platform/music-tray').then(({ refreshMusicTrayMenu }) => {
      void refreshMusicTrayMenu();
    });
  });

  createEffect(() => {
    void setMusicPlaybackSleepBlocked(
      settings().preventSleepWhilePlaying && player.playing(),
    );
  });

  createEffect(() => {
    const playing = player.playing();
    const pos = player.currentTime();
    const dur = player.duration();
    void currentTrack()?.id;
    if (!playing) return;
    const timer = window.setInterval(() => {
      void (async () => {
        const queue = trackQueue();
        const idx = trackIndex();
        if (queue.length < 2) return;
        const { getMusicPlayConfig } = await import('@/lib/media/audio/music-play-config');
        const { AudioPlayMode } = await import('@/lib/media/audio/types');
        const mode = getMusicPlayConfig().playMode;
        if (mode === AudioPlayMode.none || mode === AudioPlayMode.singleLoop) return;
        let nextIdx = idx + 1;
        if (mode === AudioPlayMode.random) {
          nextIdx = Math.floor(Math.random() * queue.length);
          if (nextIdx === idx && queue.length > 1) nextIdx = (idx + 1) % queue.length;
        } else if (nextIdx >= queue.length) {
          if (mode === AudioPlayMode.listEndStop) return;
          nextIdx = 0;
        }
        const next = queue[nextIdx];
        if (!next) return;
        const el = document.querySelector<HTMLAudioElement>('audio[data-music-hub-player]');
        const { tickMusicCrossfade } = await import(
          '@/lib/media/audio/engine/music-crossfade'
        );
        await tickMusicCrossfade({
          primary: el,
          playing: untrack(() => player.playing()),
          positionSec: untrack(() => player.currentTime()),
          durationSec: untrack(() => player.duration()),
          nextTrack: next,
          activeSource: viewerStore.state.activeSource,
          userVolume: musicVolume(),
          onAdvance: async () => {
            await playNextTrack();
          },
        });
      })();
    }, 500);
    onCleanup(() => {
      clearInterval(timer);
      void import('@/lib/media/audio/engine/music-crossfade').then(({ cancelMusicCrossfade }) =>
        cancelMusicCrossfade(),
      );
    });
    void playing;
    void pos;
    void dur;
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

  // 只订阅简繁转换：整份 settings 对象在改音量/倍速/音调时也会换引用，
  // 若在歌词 effect 里直接读 settings() 会误触发重拉并清空歌词。
  const lyricChineseConversion = createMemo(() => settings().lyricChineseConversion);

  createEffect(() => {
    const t = currentTrack();
    const conversion = lyricChineseConversion();
    void linkLyricRev();
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
    const mode = musicPlayMode();
    // 无歌词文本也要推送元信息，避免桌面歌词窗空白
    if (!t) return;
    const playing = player.playing();
    const push = () => {
      void emitDesktopLyric({
        title: t.name,
        artist: t.artist,
        trackId: t.id,
        trackSource: String(t.source),
        lyric: lyric ?? '',
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
        playMode: mode,
      });
    };
    push();
    if (!playing) return;
    const timer = window.setInterval(push, 500);
    onCleanup(() => clearInterval(timer));
  });

  createEffect(() => {
    const t = currentTrack();
    if (!t) return;
    const playing = player.playing();
    const lyric = fetchedLyric();
    const push = () => {
      void emitMusicMiniPlayerUpdate({
        title: t.name,
        artist: t.artist,
        coverUrl: typeof t.meta?.coverUrl === 'string' ? t.meta.coverUrl : undefined,
        lyric: lyric ?? '',
        positionSec: untrack(() => player.currentTime()),
        durationSec: untrack(() => player.duration()),
        playing: untrack(() => player.playing()),
      });
    };
    push();
    if (!playing) return;
    const timer = window.setInterval(push, 500);
    onCleanup(() => clearInterval(timer));
  });

  let webAudio: WebAudioPlayerEngine | undefined;
  let unlistenAndroid: (() => void) | undefined;
  let analyserRaf = 0;

  const stopAnalyserPush = () => {
    if (!analyserRaf) return;
    cancelAnimationFrame(analyserRaf);
    analyserRaf = 0;
  };

  const syncAnalyserPush = () => {
    stopAnalyserPush();
    const s = getMusicSettings();
    if (!s.desktopLyricEnabled || !s.desktopLyricAudioVisualization) return;
    let lastPushMs = 0;
    const tick = () => {
      const next = getMusicSettings();
      if (!next.desktopLyricEnabled || !next.desktopLyricAudioVisualization) {
        stopAnalyserPush();
        return;
      }
      const data = webAudio?.getFrequencyData();
      const now = performance.now();
      const pushIntervalMs = visualizerFrameIntervalMs(next.desktopLyricAudioVisualizerFps);
      if (data && now - lastPushMs >= pushIntervalMs) {
        lastPushMs = now;
        void emitDesktopLyricAnalyser(data);
      }
      analyserRaf = requestAnimationFrame(tick);
    };
    analyserRaf = requestAnimationFrame(tick);
  };

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
      syncAnalyserPush();
      const el = document.querySelector<HTMLAudioElement>('audio[data-music-hub-player]');
      if (el) el.preservesPitch = next.preservesPitch;
      if (next.eqCustomGains) webAudio?.applyCustomEq(next.eqCustomGains);
      else webAudio?.applyEqPreset(next.eqPreset);
      webAudio?.setMaxChannels(next.audioUseMaxChannels ? 32 : next.audioMaxChannels);
      webAudio?.setConvolution(
        next.soundConvolutionPreset ?? 'off',
        next.soundConvolutionMainGain,
        next.soundConvolutionSendGain,
      );
      webAudio?.setPanner(
        next.soundPannerEnabled === true,
        next.soundPannerSpeed ?? 1,
      );
      void applyResolvedOutput(next.audioOutputDeviceId).then((resolved) => {
        prevDeviceLabel = resolved.label;
      });
    });
    onCleanup(unsubscribeSettings);

    void listenAndroidMediaActions((event) => {
      switch (event.action) {
        case 'play':
          void playOrFetch();
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
        case 'seek_forward':
          player.seekTo(player.currentTime() + 10);
          break;
        case 'seek_back':
          player.seekTo(Math.max(0, player.currentTime() - 10));
          break;
        case 'seek': {
          const sec = event.positionSec;
          if (typeof sec === 'number' && Number.isFinite(sec)) {
            player.seekTo(Math.max(0, sec));
          }
          break;
        }
      }
    }).then((fn) => {
      unlistenAndroid = fn;
    });

    if (isTauri()) {
      // bootstrap 内部已 idle 延迟开窗；无曲目时延后恢复，保留 enable 按钮状态
      bootstrapDesktopLyricWindow(!!currentTrack());
      bootstrapMusicMiniPlayerWindow(!!currentTrack());
      syncAnalyserPush();
      void import('@tauri-apps/api/event').then(({ listen }) =>
        listen<{ action?: string; mode?: number }>('desktop-lyric-command', (e) => {
          const action = e.payload.action;
          switch (action) {
            case 'play':
              void playOrFetch();
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
            case 'seek_forward':
              player.seekTo(player.currentTime() + 10);
              break;
            case 'seek_back':
              player.seekTo(Math.max(0, player.currentTime() - 10));
              break;
            case 'set_play_mode': {
              const mode = e.payload.mode;
              if (typeof mode === 'number') {
                persistMusicPlayMode(mode as import('@/lib/media/audio/types').AudioPlayMode);
                setMusicPlayMode(mode as import('@/lib/media/audio/types').AudioPlayMode);
              }
              break;
            }
            case 'cycle_play_mode': {
              const next = cycleMusicPlayMode();
              setMusicPlayMode(next);
              break;
            }
            case 'close':
              void setDesktopLyricEnabled(false);
              break;
            case 'request-info': {
              const t = currentTrack();
              if (!t) break;
              const bundle = fetchedLyricBundle();
              const lyric = fetchedLyric() ?? '';
              void emitDesktopLyric({
                title: t.name,
                artist: t.artist,
                trackId: t.id,
                trackSource: String(t.source),
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
                playing: player.playing(),
                fullscreen: document.fullscreenElement != null,
                playMode: musicPlayMode(),
              });
              break;
            }
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
      togglePlay: () => void playOrFetch(),
      // 对齐桌面歌词：play 可取链起播；pause 只停，绝不误入 playOrFetch
      play: () => void playOrFetch(),
      pause: () => {
        if (player.playing()) player.togglePlay();
      },
      skipPrev: () => void playPrevTrack(),
      skipNext: () => void playNextTrack(),
      stop: () => globalMediaPlayerStore.deactivate(),
      openViewer: () => setMusicSection('nowPlaying'),
      isPlaying: () => player.playing(),
    });
    if (currentTrack()) {
      const t = currentTrack()!;
      const line = currentLyricLine(fetchedLyric(), player.currentTime()).trim();
      globalMediaPlayerStore.activate(
        'audio',
        {
          title: t.name ?? '音乐',
          subtitle: t.artist,
          preview: line || '…',
          coverUrl: typeof t.meta.coverUrl === 'string' ? t.meta.coverUrl : undefined,
        },
        'shell-music-hub',
      );
    }
  });

  onCleanup(() => {
    stopAnalyserPush();
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

  // 会话 hydrate 出曲目后，补开此前因无曲目而延后的桌面歌词窗 / 迷你播放窗
  createEffect(() => {
    if (!isTauri()) return;
    const hasTrack = !!currentTrack();
    notifyDesktopLyricTrackAvailability(hasTrack);
    notifyMusicMiniPlayerTrackAvailability(hasTrack);
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
    webAudio.setConvolution(
      currentSettings.soundConvolutionPreset ?? 'off',
      currentSettings.soundConvolutionMainGain,
      currentSettings.soundConvolutionSendGain,
    );
    webAudio.setPanner(
      currentSettings.soundPannerEnabled === true,
      currentSettings.soundPannerSpeed ?? 1,
    );
    updatePlaybackOwnerHandlers('music', {
      setDuckGain: (factor) => {
        webAudio?.setDuckGain(factor);
      },
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
    syncAnalyserPush();
  };
  onCleanup(() => {
    updatePlaybackOwnerHandlers('music', { setDuckGain: undefined });
    webAudio?.dispose();
  });

  /** 详情/底栏播放键：无链、取链中、或 <audio> 未挂 src 时强制取链并起播 */
  const playOrFetch = async () => {
    await webAudio?.resume();
    const st = viewerStore.state;
    if (st.trackQueue.length === 0) return;

    const hasUrl =
      !!st.musicPrimaryUrl && (st.musicMediaUrls?.length ?? 0) > 0;
    const audioEl =
      typeof document !== 'undefined'
        ? document.querySelector<HTMLAudioElement>('audio[data-music-hub-player]')
        : null;
    const liveSrc = (audioEl?.currentSrc || audioEl?.getAttribute('src') || '').trim();
    // 取链中也允许再次点击：applyMusicTrack 会 bump generation 取消旧请求
    const needFetch =
      st.musicLoading || !hasUrl || !!st.musicError || !liveSrc;

    if (needFetch) {
      const { requestMusicAutoPlayOnce } = await import(
        '@/lib/media/audio/music-play-intent'
      );
      const { applyMusicTrack } = await import('@/stores/viewer/media/audio');
      requestMusicAutoPlayOnce();
      await applyMusicTrack(st.trackIndex);
      const after = viewerStore.state;
      if (!after.musicPrimaryUrl || after.musicError || after.musicLoading) return;
      // 等 Solid deferred effect 跑完 loadSegment；勿用 togglePlay（playing 信号滞后时会误暂停）
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      const el = document.querySelector<HTMLAudioElement>('audio[data-music-hub-player]');
      const primary = viewerStore.state.musicPrimaryUrl;
      if (!el || !primary) return;
      const mounted = (el.currentSrc || el.getAttribute('src') || '').trim();
      if (!mounted) {
        el.src = primary;
        el.preload = 'auto';
      }
      if (el.paused) {
        player.seekTo(Number.isFinite(el.currentTime) ? el.currentTime : 0, true);
      }
      return;
    }

    player.togglePlay();
  };

  return {
    player,
    playOrFetch,
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

export { formatMusicTime } from '@/lib/media/audio/track-types';
