/**
 * Audio Viewer：章节 raw → 解析 URL → 代理/可播放地址
 * music 模式：曲目队列 → resolveTrackPlaybackUrls
 */

import * as sourcesDb from '@/lib/database/sources';
import { MediaKind } from '@/lib/book-source/book-type';
import {
  buildAudioChapterCacheKey,
  getCachedAudioChapterPlayback,
  invalidateAudioChapterCacheKey,
  setCachedAudioChapterPlayback,
} from '@/lib/media/audio/audio-chapter-cache';
import { parseParsedAudioUrls } from '@/lib/media/audio/parsed-audio-url';
import { resolveAudioPlaybackList } from '@/lib/media/audio/resolve-audio-playback';
import { resolveTrackPlaybackUrls, consumeLastUserApiError } from '@/lib/media/audio/online/online-resolver';
import {
  MusicPlaybackStatusText,
  formatMusicUrlError,
} from '@/lib/media/audio/music-playback-status';
import { getActiveUserApiDisplayName } from '@/lib/media/audio/online/user-api-engine';
import { invalidateTrackUrlCache } from '@/lib/media/audio/online/url-cache';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  addTracksToPlaylist,
  getPlaylistTracks,
  recordRecentPlay,
} from '@/lib/database/audio-library';
import { isTrackDisliked } from '@/lib/media/audio/library/dislike-filter';
import { revokeAllWebTrackBlobs } from '@/lib/media/audio/library/local-resolver';
import {
  createAudiobookSession,
  createMusicHubSession,
  AUDIO_HUB_BOOK_URL,
} from '@/lib/media/content-session';
import {
  BUILTIN_PLAYLIST_IDS,
  type AudioTrack,
  type AudioTrackSource,
} from '@/lib/media/audio/track-types';
import {
  dispatchMediaTextFallback,
  ReaderMediaMessages,
} from '@/lib/media/text/reader-media-messages';
import { state, setState } from '@/stores/viewer/media/state';
import {
  loadChapterRaw,
  loadMediaChapterWithApply,
  openMediaBookWithKind,
  setMediaBookInitialState,
  createMediaApplyGuard,
} from '@/stores/viewer/media/chapter';
import type { Book, BookChapter } from '@/types';
import { resolveNextChapterIndex } from '@/lib/media/audio/play-mode';
import { preloadTrackUrl } from '@/lib/media/audio/online/track-preload';
import { getMusicPlayConfig } from '@/lib/media/audio/music-play-config';
import { resolveOnlinePic } from '@/lib/media/audio/online/source-router';
import { attachToggleMusicInfo } from '@/lib/media/audio/track-toggle';
import {
  getMusicSettings,
  setMusicActivePlaylistId,
} from '@/lib/media/audio/music-settings';
import {
  clearMusicTrackProgress,
  musicTrackProgressKey,
  resolveMusicTrackStartPositionSec,
} from '@/lib/media/audio/music-track-progress';
import {
  cancelScheduledMusicAutoSkip,
  scheduleMusicAutoSkip,
  consumeMusicAutoSkipSlot,
} from '@/lib/media/audio/music-auto-skip-guard';
import { requestMusicAutoPlayOnce } from '@/lib/media/audio/music-play-intent';
import { AudioPlayMode } from '@/lib/media/audio/types';
import { globalMediaPlayerStore } from '@/stores/global-media-player';
import { MediaGroupId } from '@/types/book-group';
import { getMusicGroupByListId } from '@/lib/database/media-groups';
import type { MusicHubSection, MusicPlayerListKind } from '@/stores/viewer/base-state';
import {
  ensureMusicSessionHydrated,
  getCachedMusicHubSection,
  scheduleMusicSessionPersist,
  setCachedMusicHubSection,
} from '@/lib/persistence/domains/music-session';
import { getSessionDoc } from '@/lib/persistence/backends/session-store';
import {
  MUSIC_SESSION_DOC_KEY,
  type MusicSessionSnapshot,
} from '@/lib/persistence/domains/music-session';

let playbackRevoke: (() => void) | null = null;
/** 音乐切歌世代：丢弃过期的 applyMusicTrack 结果，防止双音频 */
let musicApplyGeneration = 0;
/** 自动切歌进行中（含下一首取链）：阻止 ended 重入再次 playNext */
let musicTrackAdvanceInFlight = false;
let restorePlaylistRequestId = 0;
let randomPlayedTrackKeys = new Set<string>();
let randomQueueSignature = '';
const TEMP_PLAYER_LIST_ID = 'temp';

const BUILTIN_LIST_ID_TO_GROUP: Record<string, number> = {
  [BUILTIN_PLAYLIST_IDS.DEFAULT]: MediaGroupId.MusicDefault,
  [BUILTIN_PLAYLIST_IDS.TRIAL]: MediaGroupId.MusicTrial,
  [BUILTIN_PLAYLIST_IDS.RECENT]: MediaGroupId.MusicRecent,
  [BUILTIN_PLAYLIST_IDS.LOCAL]: MediaGroupId.MusicLocal,
  [BUILTIN_PLAYLIST_IDS.LOVE]: MediaGroupId.Favorite,
};

interface PlayerListSource {
  id: string | null;
  name: string | null;
  kind: MusicPlayerListKind | null;
}

export function getPersistedMusicHubSection(): MusicHubSection {
  return getCachedMusicHubSection();
}

/** 经统一 music.session 域落盘 */
function persistPlayerListState(
  listId: string | null,
  trackIndex: number,
  options?: { time?: number; maxTime?: number; immediate?: boolean; clear?: boolean },
): void {
  if (options?.clear) {
    scheduleMusicSessionPersist({ clear: true, immediate: true });
    return;
  }
  const resolvedListId =
    (listId && listId.length > 0
      ? listId
      : state.playerListId && state.playerListId.length > 0
        ? state.playerListId
        : TEMP_PLAYER_LIST_ID) || TEMP_PLAYER_LIST_ID;
  scheduleMusicSessionPersist({
    listId: resolvedListId,
    index: trackIndex,
    time: options?.time,
    maxTime: options?.maxTime,
    immediate: options?.immediate,
  });
}

/**
 * 由播放器上报进度（对齐 lx nowPlayTime / maxPlayTime 变化）。
 * 有队列即写入（含临时队列快照）；权威在 music.session。
 */
export function updatePersistedPlayProgress(timeSec: number, maxTimeSec: number): void {
  if (state.trackQueue.length === 0) return;
  const listId = state.playerListId || TEMP_PLAYER_LIST_ID;
  const saveTime = getMusicSettings().rememberProgress;
  persistPlayerListState(listId, state.trackIndex, {
    time: saveTime ? Math.max(0, timeSec) : 0,
    maxTime: Math.max(0, maxTimeSec),
  });
}

const musicTrackKey = (track: AudioTrack): string => `${track.source}:${track.id}`;

function getQueueSignature(tracks: readonly AudioTrack[]): string {
  return tracks.map(musicTrackKey).join('\n');
}

function resolveRandomUnplayedIndex(queue: readonly AudioTrack[], current: number): number | null {
  if (queue.length <= 1) return queue.length === 1 ? 0 : null;
  let candidates = queue
    .map((track, index) => ({ index, key: musicTrackKey(track) }))
    .filter(({ index, key }) => index !== current && !randomPlayedTrackKeys.has(key));
  if (candidates.length === 0) {
    randomPlayedTrackKeys = new Set([musicTrackKey(queue[current]!)]);
    candidates = queue
      .map((track, index) => ({ index, key: musicTrackKey(track) }))
      .filter(({ index }) => index !== current);
  }
  return candidates[Math.floor(Math.random() * candidates.length)]?.index ?? null;
}

export function normalizeMusicHubSection(section: unknown): MusicHubSection {
  switch (section) {
    case 'search':
    case 'songlist':
    case 'leaderboard':
    case 'list':
    case 'download':
    case 'settings':
    case 'nowPlaying':
      return section;
    default:
      return 'search';
  }
}

export function isMusicPlaybackMode(): boolean {
  return state.playbackMode === 'music';
}

/** 是否有应保留的后台音乐播放会话（阅读漫画/听书等时切歌不得冲掉） */
export function shouldPreserveMusicPlayback(): boolean {
  return (
    state.playbackMode === 'music' &&
    (state.trackQueue.length > 0 || !!state.musicPrimaryUrl || state.musicMediaUrls.length > 0)
  );
}

export type MusicPlaybackSnapshot = {
  playbackMode: 'music';
  contentSession: typeof state.contentSession;
  trackQueue: typeof state.trackQueue;
  trackIndex: number;
  musicQueueOrigin: typeof state.musicQueueOrigin;
  playerListId: typeof state.playerListId;
  playerListName: typeof state.playerListName;
  playerListKind: typeof state.playerListKind;
  activePlaylistId: typeof state.activePlaylistId;
  activeMusicGroupId: typeof state.activeMusicGroupId;
  activeSource: typeof state.activeSource;
  musicMediaUrls: string[];
  musicPrimaryUrl: string | null;
  musicPositionSec: number;
  musicLoading: boolean;
  musicError: string | null;
  playbackStatus: string | null;
  musicSection: typeof state.musicSection;
};

/** 优先读 Hub <audio> 实时进度，避免与文本 chapterPos 串味 */
export function readLiveMusicPositionSec(): number {
  if (typeof document !== 'undefined') {
    const el = document.querySelector<HTMLAudioElement>('audio[data-music-hub-player]');
    if (el && Number.isFinite(el.currentTime) && el.currentTime > 0) {
      return Math.max(0, el.currentTime);
    }
  }
  return Math.max(0, state.musicPositionSec || 0);
}

export function setMusicPositionSec(pos: number): void {
  const next = Math.max(0, Number.isFinite(pos) ? pos : 0);
  if (state.musicPositionSec === next) return;
  setState({ musicPositionSec: next });
}

export function snapshotMusicPlayback(): MusicPlaybackSnapshot | null {
  if (!shouldPreserveMusicPlayback()) return null;
  return {
    playbackMode: 'music',
    contentSession: state.contentSession,
    trackQueue: state.trackQueue,
    trackIndex: state.trackIndex,
    musicQueueOrigin: state.musicQueueOrigin,
    playerListId: state.playerListId,
    playerListName: state.playerListName,
    playerListKind: state.playerListKind,
    activePlaylistId: state.activePlaylistId,
    activeMusicGroupId: state.activeMusicGroupId,
    activeSource: state.activeSource,
    musicMediaUrls: [...state.musicMediaUrls],
    musicPrimaryUrl: state.musicPrimaryUrl,
    musicPositionSec: readLiveMusicPositionSec(),
    musicLoading: state.musicLoading,
    musicError: state.musicError,
    playbackStatus: state.playbackStatus,
    musicSection: state.musicSection,
  };
}

export function restoreMusicPlayback(snapshot: MusicPlaybackSnapshot): void {
  setState({
    ...snapshot,
    // 关闭漫画等非音乐阅读器后不强制 kind=audio，避免误开音频阅读层；MusicPage keep-alive 仍可读 music* 字段
  });
}

export function revokeAudioPlaybackUrls(): void {
  playbackRevoke?.();
  playbackRevoke = null;
  revokeAllWebTrackBlobs();
}

/** 同步停掉 Hub <audio>，须在 revoke blob 之前调用，避免旧缓冲继续出声 */
export function stopMusicHubAudioElement(): void {
  if (typeof document === 'undefined') return;
  const el = document.querySelector<HTMLAudioElement>('audio[data-music-hub-player]');
  if (!el) return;
  try {
    el.pause();
    el.removeAttribute('src');
    el.load();
  } catch {
    // ignore
  }
}

/** 仅在无后台音乐会话时撤销播放 URL（关闭漫画不应打断正在播的歌） */
export function revokeAudioPlaybackUrlsUnlessMusic(): void {
  if (shouldPreserveMusicPlayback()) return;
  revokeAudioPlaybackUrls();
}

/** 幂等恢复选中列表（兼容旧调用；权威路径走 music.session hydrate） */
export async function restoreActiveMusicPlaylistSelection(): Promise<void> {
  await ensureMusicSessionHydrated();
}

async function resolvePlayerListSource(listId: string): Promise<PlayerListSource | null> {
  if (listId === TEMP_PLAYER_LIST_ID) {
    return { id: listId, name: '临时播放队列', kind: 'temporary' };
  }
  if (listId === BUILTIN_PLAYLIST_IDS.LOVE || listId === 'love') {
    return { id: BUILTIN_PLAYLIST_IDS.LOVE, name: '我的收藏', kind: 'builtin' };
  }
  const group = await getMusicGroupByListId(listId);
  if (group) {
    return {
      id: listId,
      name: group.groupName,
      kind: listId.startsWith('pl_') ? 'user' : 'builtin',
    };
  }
  const fallbackGroupId = BUILTIN_LIST_ID_TO_GROUP[listId];
  if (fallbackGroupId == null) return null;
  const names: Record<string, string> = {
    [BUILTIN_PLAYLIST_IDS.DEFAULT]: '播放列表',
    [BUILTIN_PLAYLIST_IDS.TRIAL]: '试听列表',
    [BUILTIN_PLAYLIST_IDS.RECENT]: '最近播放',
    [BUILTIN_PLAYLIST_IDS.LOCAL]: '本地音乐',
  };
  return {
    id: listId,
    name: names[listId] ?? listId,
    kind: 'builtin',
  };
}

export function setAudioBookInitialState(book: Book): void {
  setMediaBookInitialState(book, MediaKind.audio);
  setState({
    playbackMode: 'audiobook',
    contentSession: createAudiobookSession(book, state.catalog, state.chapterIndex, state.chapterPos),
    trackQueue: [],
    trackIndex: 0,
    musicQueueOrigin: 'other',
    playerListId: null,
    playerListName: null,
    playerListKind: null,
    activePlaylistId: null,
    activeSource: null,
  });
}

export async function openMusicHub(options?: {
  panel?: 'search' | 'library' | 'playlist' | 'sync';
  section?: MusicHubSection;
}): Promise<void> {
  // 已在播时不要 revoke，否则从漫画回到音乐页会切断当前曲目
  if (!shouldPreserveMusicPlayback()) {
    revokeAudioPlaybackUrls();
  }
  const section: MusicHubSection =
    options?.section ??
    (options?.panel === 'search'
      ? 'search'
      : options?.panel === 'library' || options?.panel === 'playlist'
        ? 'list'
        : options?.panel === 'sync'
          ? 'settings'
          : getPersistedMusicHubSection());
  setCachedMusicHubSection(section);
  // 同步挂载壳层；会话恢复后台补齐，不阻塞 Hub 首帧
  setState({
    kind: MediaKind.audio,
    book: null,
    catalog: [],
    chapterIndex: 0,
    chapterPos: state.chapterPos,
    guestReading: false,
    playbackMode: 'music',
    trackQueue: state.trackQueue.length > 0 ? state.trackQueue : [],
    trackIndex: state.trackIndex,
    activePlaylistId: state.activePlaylistId ?? 'local',
    activeMusicGroupId: state.activeMusicGroupId ?? MediaGroupId.MusicLocal,
    activeSource: state.activeSource ?? 'local',
    contentSession: createMusicHubSession(state.trackQueue, state.trackIndex),
    rawContent: '',
    // 内容层 mediaUrls 留给听书/漫画/视频；音乐只用 music* 字段
    mediaUrls: [],
    primaryUrl: null,
    loading: false,
    error: null,
    musicMediaUrls: state.musicMediaUrls,
    musicPrimaryUrl: state.musicPrimaryUrl,
    musicPositionSec: readLiveMusicPositionSec(),
    musicLoading: false,
    musicError: null,
    playbackStatus: state.playbackStatus,
    contentBootstrapping: false,
    showContent: true,
    musicSection: section,
    musicLibraryOpen: false,
    musicSearchOpen: false,
    musicAccountOpen: false,
    musicSyncOpen: false,
    musicPlaylistOpen: false,
    musicSourceOpen: false,
  });
  void ensureMusicSessionHydrated({ prepareTrack: false });
  scheduleMusicSessionPersist({ immediate: true });
  if (import.meta.env.DEV) {
    const { writeHmrData } = await import('@/lib/dev/hmr-state');
    writeHmrData('musicHubShellActive', true);
  }
}

/** 进入播放详情前的分区，用于详情页返回 */
let musicSectionBeforeNowPlaying: MusicHubSection = 'list';

export function getMusicSectionBeforeNowPlaying(): MusicHubSection {
  return musicSectionBeforeNowPlaying === 'nowPlaying'
    ? 'list'
    : musicSectionBeforeNowPlaying;
}

export function setMusicSection(section: MusicHubSection): void {
  const next = normalizeMusicHubSection(section);
  if (state.musicSection !== 'nowPlaying' && next === 'nowPlaying') {
    musicSectionBeforeNowPlaying = state.musicSection;
  }
  setCachedMusicHubSection(next);
  setState({
    musicSection: next,
    musicLibraryOpen: false,
    musicSearchOpen: false,
    musicAccountOpen: false,
    musicSyncOpen: false,
    musicPlaylistOpen: false,
    musicSourceOpen: false,
  });
  scheduleMusicSessionPersist({ immediate: true });
}

export function setActiveMusicGroupId(
  groupId: number | null,
  playlistId?: string | null,
): void {
  restorePlaylistRequestId += 1;
  const clearQueue =
    getMusicSettings().listClearQueueOnSwitch &&
    state.activeMusicGroupId != null &&
    state.activeMusicGroupId !== groupId;
  if (playlistId !== undefined) {
    setMusicActivePlaylistId(playlistId ?? 'local');
  }
  if (clearQueue) persistPlayerListState(null, 0, { immediate: true, clear: true });
  setState({
    activeMusicGroupId: groupId,
    ...(clearQueue
      ? {
          trackQueue: [],
          trackIndex: 0,
          musicMediaUrls: [],
          musicPrimaryUrl: null,
          musicLoading: false,
          musicError: null,
          playbackStatus: null,
          musicQueueOrigin: 'other' as const,
          playerListId: null,
          playerListName: null,
          playerListKind: null,
        }
      : {}),
    ...(playlistId !== undefined ? { activePlaylistId: playlistId } : {}),
  });
  scheduleMusicSessionPersist({ immediate: true });
}

export function setActivePlaylistId(playlistId: string | null): void {
  restorePlaylistRequestId += 1;
  if (!playlistId) {
    setMusicActivePlaylistId('local');
    setState({ activePlaylistId: null, activeMusicGroupId: null });
    scheduleMusicSessionPersist({ immediate: true });
    return;
  }
  if (
    playlistId === 'love' ||
    playlistId === 'favorite' ||
    playlistId === String(MediaGroupId.Favorite)
  ) {
    setMusicActivePlaylistId('love');
    setState({
      activePlaylistId: 'love',
      activeMusicGroupId: MediaGroupId.Favorite,
    });
    scheduleMusicSessionPersist({ immediate: true });
    return;
  }
  void getMusicGroupByListId(playlistId).then((group) => {
    if (group) {
      setMusicActivePlaylistId(playlistId);
      setState({
        activePlaylistId: playlistId,
        activeMusicGroupId: group.groupId,
      });
      scheduleMusicSessionPersist({ immediate: true });
    }
  });
}

function notifyMusicPlaybackFailure(
  message: string,
  options?: { toggled?: boolean },
): void {
  showAppToast({
    title: options?.toggled ? '换源失败' : '播放失败',
    description: message,
    variant: 'destructive',
  });
}

export async function applyMusicTrack(
  index: number,
  options?: { forceRefreshUrl?: boolean },
): Promise<void> {
  const gen = ++musicApplyGeneration;
  cancelScheduledMusicAutoSkip();
  const queue = state.trackQueue;
  const track = queue[index];
  if (!track) {
    setState({
      trackIndex: index,
      musicMediaUrls: [],
      musicPrimaryUrl: null,
      musicLoading: false,
      musicError: '队列中无此曲目',
      playbackStatus: null,
    });
    notifyMusicPlaybackFailure('队列中无此曲目');
    return;
  }
  randomPlayedTrackKeys.add(musicTrackKey(track));
  if (await isTrackDisliked(track)) {
    if (gen !== musicApplyGeneration) return;
    setState({
      trackIndex: index,
      musicMediaUrls: [],
      musicPrimaryUrl: null,
      musicLoading: false,
      musicError: '该曲目已被 dislike 规则过滤',
      playbackStatus: null,
    });
    notifyMusicPlaybackFailure('该曲目已被 dislike 规则过滤');
    return;
  }
  if (gen !== musicApplyGeneration) return;
  const prevTrack = state.trackQueue[state.trackIndex];
  const hasPlayableUrl =
    !!state.musicPrimaryUrl || (state.musicMediaUrls?.length ?? 0) > 0;
  const sameTrack =
    state.trackIndex === index &&
    !!prevTrack &&
    musicTrackKey(prevTrack) === musicTrackKey(track) &&
    // 队列刚整体替换时 urls 已清空，不能当成「同曲重取链」而沿用旧进度
    hasPlayableUrl;
  // 切歌时与 trackIndex 同步清进度，避免 loadSegment 读到上一曲曲末秒数
  const musicPositionSec = resolveMusicTrackStartPositionSec({
    sameTrack,
    rememberProgress: getMusicSettings().rememberProgress,
    trackKey: musicTrackKey(track),
    currentPositionSec: state.musicPositionSec,
  });
  setState({
    musicLoading: true,
    musicError: null,
    musicMediaUrls: [],
    musicPrimaryUrl: null,
    musicPositionSec,
    playbackStatus: (() => {
      const name = getActiveUserApiDisplayName();
      return name
        ? `${MusicPlaybackStatusText.gettingUrl}（${name}）`
        : MusicPlaybackStatusText.gettingUrl;
    })(),
    trackIndex: index,
  });
  const persistListId =
    state.playerListKind === 'temporary' || !state.playerListId
      ? TEMP_PLAYER_LIST_ID
      : state.playerListId;
  const prevPlayInfo = await getSessionDoc<MusicSessionSnapshot>(MUSIC_SESSION_DOC_KEY);
  const samePersistedTrack =
    !!persistListId &&
    prevPlayInfo?.listId === persistListId &&
    prevPlayInfo.index === index;
  persistPlayerListState(persistListId, index, {
    // 切到新曲重置进度；恢复同一曲时保留已存 time（对齐 lx handleRestorePlay）
    ...(samePersistedTrack ? {} : { time: 0, maxTime: 0 }),
    immediate: true,
  });
  // 先停播再 revoke，避免旧 blob 在 effect 到达前继续出声
  stopMusicHubAudioElement();
  revokeAudioPlaybackUrls();
  try {
    if (options?.forceRefreshUrl) {
      await invalidateTrackUrlCache(track.id);
    }
    if (gen !== musicApplyGeneration) return;
    const { urls, revokeAll, toggled, track: resolvedTrack } = await resolveTrackPlaybackUrls(
      track,
      {
        skipCache: options?.forceRefreshUrl,
        activeSource: state.activeSource,
        preferDownloadedFile: state.musicQueueOrigin === 'download',
        onStatus: (message) => {
          if (gen !== musicApplyGeneration) return;
          setState({ playbackStatus: message });
        },
        onToggleSource: (alt) => {
          console.info('[music] toggle source:', alt.source, alt.name, alt.artist);
        },
      },
    );
    if (gen !== musicApplyGeneration) {
      revokeAll();
      return;
    }
    playbackRevoke = revokeAll;
    if (urls.length === 0) {
      const apiErr = consumeLastUserApiError();
      const detail = apiErr ? formatMusicUrlError(apiErr) : null;
      const failMsg = toggled
        ? MusicPlaybackStatusText.toggleFailed
        : detail ?? '无法解析播放地址';
      setState({
        musicLoading: false,
        playbackStatus: null,
        musicMediaUrls: [],
        musicPrimaryUrl: null,
        musicError: failMsg,
        contentSession: createMusicHubSession(queue, index),
      });
      notifyMusicPlaybackFailure(failMsg, { toggled });
      if (shouldAutoSkipOnError(queue.length)) {
        console.warn('[music] autoSkipOnError after resolve fail');
        const failGen = gen;
        scheduleMusicAutoSkip(() => {
          if (failGen !== musicApplyGeneration) return;
          void playNextTrackAfterError({ slotConsumed: true });
        });
      }
      return;
    }

    // 换源成功：对齐 lx——保留列表曲目身份，仅挂 toggleMusicInfo 供取链
    let nextQueue = queue;
    let playTrack = track;
    if (toggled && resolvedTrack && resolvedTrack.id !== track.id) {
      playTrack = attachToggleMusicInfo(track, resolvedTrack);
      nextQueue = [...queue];
      nextQueue[index] = playTrack;
    } else if (resolvedTrack) {
      playTrack = resolvedTrack;
    }

    setState({
      musicLoading: false,
      playbackStatus: null,
      trackQueue: nextQueue,
      musicMediaUrls: urls,
      musicPrimaryUrl: urls[0] ?? null,
      musicError: null,
      activeSource: resolvedTrack?.source ?? playTrack.source,
      contentSession: createMusicHubSession(nextQueue, index),
    });
    void recordRecentPlay(playTrack).catch((error) => {
      console.warn('[music] failed to persist recent play:', error);
    });
    const coverUrl =
      typeof playTrack.meta.coverUrl === 'string' ? playTrack.meta.coverUrl : undefined;
    globalMediaPlayerStore.activate(
      'audio',
      {
        title: playTrack.name,
        subtitle: playTrack.artist,
        preview: playTrack.artist,
        coverUrl,
      },
      AUDIO_HUB_BOOK_URL,
    );
    if (!coverUrl && getMusicSettings().fallbackPic) {
      void resolveOnlinePic(playTrack)
        .then((resolvedCover) => {
          if (!resolvedCover || gen !== musicApplyGeneration) return;
          const current = state.trackQueue[index];
          if (!current || musicTrackKey(current) !== musicTrackKey(playTrack)) return;
          if (typeof current.meta.coverUrl === 'string' && current.meta.coverUrl.trim()) return;
          // 路径更新，避免整表替换打断歌词 effect
          setState('trackQueue', index, 'meta', 'coverUrl', resolvedCover);
          globalMediaPlayerStore.updateMeta({ coverUrl: resolvedCover });
        })
        .catch(() => undefined);
    }

    const cfg = getMusicPlayConfig();
    const nextIdx = resolveNextChapterIndex(index, nextQueue.length, cfg.playMode);
    if (nextIdx != null && nextIdx !== index) {
      const nextTrack = nextQueue[nextIdx];
      if (nextTrack) {
        void preloadTrackUrl(nextTrack, { activeSource: state.activeSource });
      }
    }
  } catch (err) {
    if (gen !== musicApplyGeneration) return;
    const message = formatMusicUrlError(err);
    console.warn('[music] applyMusicTrack failed', err);
    setState({
      musicLoading: false,
      playbackStatus: null,
      musicMediaUrls: [],
      musicPrimaryUrl: null,
      musicError: message,
      contentSession: createMusicHubSession(queue, index),
    });
    notifyMusicPlaybackFailure(message);
    if (shouldAutoSkipOnError(queue.length)) {
      console.warn('[music] autoSkipOnError after exception');
      const failGen = gen;
      scheduleMusicAutoSkip(() => {
        if (failGen !== musicApplyGeneration) return;
        void playNextTrackAfterError({ slotConsumed: true });
      });
    }
  }
}

/** 播放失败时刷新 URL 并重试（最多 1 次） */
export async function retryMusicTrackPlayback(): Promise<void> {
  await applyMusicTrack(state.trackIndex, { forceRefreshUrl: true });
}

/** 队列来源：决定失败自动切歌等行为。 */
export type MusicQueueOrigin = 'search' | 'list' | 'download' | 'other';

export interface PlayQueueSourceOptions {
  origin?: MusicQueueOrigin;
  listId?: string | null;
  listName?: string | null;
  listKind?: MusicPlayerListKind | null;
}

function shouldAutoSkipOnError(queueLength: number): boolean {
  return (
    getMusicSettings().autoSkipOnError !== false &&
    (state.musicQueueOrigin === 'list' ||
      state.playerListKind === 'online-playlist' ||
      state.playerListKind === 'leaderboard' ||
      state.playerListKind === 'temporary' ||
      state.playerListKind === 'builtin' ||
      state.playerListKind === 'user') &&
    queueLength > 1
  );
}

function playerListPatch(source?: PlayQueueSourceOptions | null) {
  if (!source) {
    return {
      playerListId: null as string | null,
      playerListName: null as string | null,
      playerListKind: null as MusicPlayerListKind | null,
    };
  }
  return {
    playerListId: source.listId ?? null,
    playerListName: source.listName ?? null,
    playerListKind: source.listKind ?? null,
  };
}

function markQueueTemporary(reasonName?: string | null): void {
  if (state.playerListKind === 'temporary' || state.playerListKind === 'single') return;
  setState({
    playerListId: TEMP_PLAYER_LIST_ID,
    playerListName: reasonName?.trim() || state.playerListName || '临时播放队列',
    playerListKind: 'temporary',
  });
  persistPlayerListState(TEMP_PLAYER_LIST_ID, state.trackIndex, { immediate: true });
}

export function setMusicTrackQueue(
  tracks: AudioTrack[],
  startIndex = 0,
  source?: AudioTrackSource,
  originOrOptions?: MusicQueueOrigin | PlayQueueSourceOptions,
): void {
  const options: PlayQueueSourceOptions =
    typeof originOrOptions === 'string'
      ? { origin: originOrOptions }
      : (originOrOptions ?? {});
  const nextSignature = getQueueSignature(tracks);
  if (
    nextSignature !== randomQueueSignature ||
    getMusicSettings().autoCleanPlayedList
  ) {
    randomPlayedTrackKeys.clear();
  }
  randomQueueSignature = nextSignature;
  const listPatch = playerListPatch(options);
  const persistListId =
    listPatch.playerListKind === 'temporary' || !listPatch.playerListId
      ? TEMP_PLAYER_LIST_ID
      : listPatch.playerListId;
  // 先写入队列状态再落盘，确保快照含 tracks
  const startTrack = tracks[startIndex];
  const musicPositionSec = startTrack
    ? resolveMusicTrackStartPositionSec({
        sameTrack: false,
        rememberProgress: getMusicSettings().rememberProgress,
        trackKey: musicTrackKey(startTrack),
        currentPositionSec: 0,
      })
    : 0;
  setState({
    trackQueue: tracks,
    trackIndex: startIndex,
    musicPositionSec,
    activeSource: source ?? tracks[0]?.source ?? null,
    musicLoading: true,
    musicMediaUrls: [],
    musicPrimaryUrl: null,
    musicError: null,
    playbackStatus: null,
    ...(options.origin !== undefined ? { musicQueueOrigin: options.origin } : {}),
    ...listPatch,
    contentSession: createMusicHubSession(tracks, startIndex),
  });
  persistPlayerListState(persistListId, startIndex, {
    time: 0,
    immediate: true,
  });
  stopMusicHubAudioElement();
  if (getMusicSettings().autoPlay) {
    requestMusicAutoPlayOnce();
  }
  void applyMusicTrack(startIndex);
}

/** 我的列表指针播放：加载列表内容作为工作队列，不写入 default。 */
export async function playByListId(
  listId: string,
  startIndex = 0,
  options?: { listName?: string | null; listKind?: MusicPlayerListKind | null },
): Promise<void> {
  const tracks = await getPlaylistTracks(listId);
  if (tracks.length === 0) return;
  const source =
    (await resolvePlayerListSource(listId)) ??
    ({
      id: listId,
      name: options?.listName ?? listId,
      kind: options?.listKind ?? (listId.startsWith('pl_') ? 'user' : 'builtin'),
    } satisfies PlayerListSource);
  const safeIndex = Math.min(Math.max(0, startIndex), tracks.length - 1);
  setMusicTrackQueue(tracks, safeIndex, tracks[safeIndex]?.source, {
    origin: 'list',
    listId: source.id,
    listName: options?.listName ?? source.name,
    listKind: options?.listKind ?? source.kind,
  });
}

/** 在线歌单/排行榜：写入临时队列，不覆盖播放列表。 */
export async function playAsTemp(
  tracks: AudioTrack[],
  startIndex = 0,
  options?: {
    listName?: string | null;
    listKind?: Extract<MusicPlayerListKind, 'online-playlist' | 'leaderboard' | 'temporary'> | null;
  },
): Promise<void> {
  if (tracks.length === 0) return;
  setMusicTrackQueue(tracks, startIndex, tracks[startIndex]?.source, {
    origin: 'list',
    listId: TEMP_PLAYER_LIST_ID,
    listName: options?.listName?.trim() || '临时播放队列',
    listKind: options?.listKind ?? 'temporary',
  });
}

/** 搜索/在线单曲：追加到播放列表后按指针播放。 */
export async function playIntoDefault(
  tracks: AudioTrack[],
  startIndex = 0,
  options?: { listName?: string | null; replace?: boolean },
): Promise<void> {
  if (tracks.length === 0) return;
  if (options?.replace) {
    const { replaceDefaultPlayList } = await import('@/lib/database/audio-library');
    await replaceDefaultPlayList(tracks);
  } else {
    await addTracksToPlaylist(BUILTIN_PLAYLIST_IDS.DEFAULT, tracks, { position: 'top' });
  }
  await playByListId(BUILTIN_PLAYLIST_IDS.DEFAULT, startIndex, {
    listName: options?.listName ?? '播放列表',
    listKind: 'builtin',
  });
}

export async function playTrack(track: AudioTrack): Promise<void> {
  await playIntoDefault([track], 0, { listName: '播放列表' });
}

export async function playPlaylist(
  tracks: AudioTrack[],
  startIndex = 0,
  options?: PlayQueueSourceOptions & {
    /** @deprecated 在线整表播放已改为 temp；保留兼容旧调用点 */
    replacePlayList?: boolean;
  },
): Promise<void> {
  if (tracks.length === 0) return;
  if (options?.listId && options.listId !== TEMP_PLAYER_LIST_ID) {
    await playByListId(options.listId, startIndex, {
      listName: options.listName,
      listKind: options.listKind,
    });
    return;
  }
  if (
    options?.replacePlayList ||
    options?.listKind === 'online-playlist' ||
    options?.listKind === 'leaderboard' ||
    options?.listKind === 'temporary'
  ) {
    await playAsTemp(tracks, startIndex, {
      listName: options.listName,
      listKind:
        options.listKind === 'online-playlist' || options.listKind === 'leaderboard'
          ? options.listKind
          : 'temporary',
    });
    return;
  }
  if (options?.origin === 'search' || options?.listKind === 'search') {
    if (getMusicSettings().listDoubleClickToPlay) {
      await playAsTemp(tracks, startIndex, {
        listName: options.listName ?? '搜索结果',
        listKind: 'temporary',
      });
      return;
    }
    const track = tracks[startIndex] ?? tracks[0];
    if (!track) return;
    await playIntoDefault([track], 0, {
      listName: options.listName ?? '播放列表',
    });
    return;
  }
  setMusicTrackQueue(tracks, startIndex, tracks[startIndex]?.source, {
    origin: options?.origin ?? 'other',
    listId: options?.listId ?? null,
    listName: options?.listName ?? null,
    listKind: options?.listKind ?? 'single',
  });
}

export function removeFromQueue(index: number): void {
  const queue = [...state.trackQueue];
  if (index < 0 || index >= queue.length) return;
  const wasCurrent = index === state.trackIndex;
  queue.splice(index, 1);
  let nextIndex = state.trackIndex;
  if (wasCurrent) {
    nextIndex = Math.min(index, Math.max(0, queue.length - 1));
  } else if (index < state.trackIndex) {
    nextIndex = state.trackIndex - 1;
  }
  markQueueTemporary(state.playerListName ? `${state.playerListName}（已编辑）` : '临时播放队列');
  setState({
    trackQueue: queue,
    trackIndex: nextIndex,
    contentSession: createMusicHubSession(queue, nextIndex),
  });
  persistPlayerListState(TEMP_PLAYER_LIST_ID, nextIndex, { immediate: true });
  if (wasCurrent && queue.length > 0) void applyMusicTrack(nextIndex);
}

/** 下一首播放：插入当前曲目之后（对齐 lx playLater） */
export function playTracksLater(tracks: AudioTrack[]): void {
  if (tracks.length === 0) return;
  const queue = [...state.trackQueue];
  if (queue.length === 0) {
    setMusicTrackQueue(tracks, 0, tracks[0]?.source, {
      origin: 'other',
      listId: TEMP_PLAYER_LIST_ID,
      listName: '稍后播放',
      listKind: 'temporary',
    });
    return;
  }
  const insertAt = Math.min(state.trackIndex + 1, queue.length);
  queue.splice(insertAt, 0, ...tracks);
  markQueueTemporary(state.playerListName ? `${state.playerListName}（含稍后播放）` : '临时播放队列');
  setState({
    trackQueue: queue,
    contentSession: createMusicHubSession(queue, state.trackIndex),
  });
}

export function replaceTrackInQueue(oldTrack: AudioTrack, replacement: AudioTrack): void {
  const queue = state.trackQueue.map((track) =>
    track.id === oldTrack.id && track.source === oldTrack.source ? replacement : track,
  );
  setState({
    trackQueue: queue,
    activeSource:
      queue[state.trackIndex]?.source ?? state.activeSource,
    contentSession: createMusicHubSession(queue, state.trackIndex),
  });
}

/** 曲终切歌前清掉当前曲进度，避免列表循环回到该曲时 seek 到曲末再 ended */
function clearCurrentTrackProgressForAdvance(): void {
  const track = state.trackQueue[state.trackIndex];
  setMusicPositionSec(0);
  if (track) clearMusicTrackProgress(musicTrackProgressKey(track.source, track.id));
  const listId =
    state.playerListKind === 'temporary' || !state.playerListId
      ? TEMP_PLAYER_LIST_ID
      : state.playerListId;
  if (listId) {
    persistPlayerListState(listId, state.trackIndex, {
      time: 0,
      immediate: true,
    });
  }
}

export async function playNextTrack(options?: { manual?: boolean }): Promise<void> {
  const queue = state.trackQueue;
  if (queue.length === 0) return;
  const cfg = getMusicPlayConfig();
  const cur = state.trackIndex;
  const manual = options?.manual === true;
  // 自动切歌重入：两首歌列表下第二次 playNext 会切回上一首，且常携带曲末进度
  if (!manual && (musicTrackAdvanceInFlight || state.musicLoading)) {
    return;
  }
  // 禁止切换：曲终不切歌；手动下一首对齐 lx，按列表循环切
  if (cfg.playMode === AudioPlayMode.none && !manual) return;
  const playMode =
    cfg.playMode === AudioPlayMode.none && manual
      ? AudioPlayMode.listLoop
      : cfg.playMode;

  if (!manual) musicTrackAdvanceInFlight = true;
  try {
    clearCurrentTrackProgressForAdvance();
    // 曲终/自动切歌后必须起播，不受「选中后播放」关闭或 startup 门闩影响
    requestMusicAutoPlayOnce();
    if (playMode === AudioPlayMode.singleLoop) {
      // 单曲循环：重新 apply 以清 ended 闩并按 autoPlay 起播（勿直接 el.play 绕过播放器状态）
      setState({ musicPositionSec: 0 });
      await applyMusicTrack(cur);
      return;
    }
    const next =
      playMode === AudioPlayMode.random
        ? resolveRandomUnplayedIndex(queue, cur)
        : resolveNextChapterIndex(cur, queue.length, playMode);
    if (next == null) return;
    await applyMusicTrack(next);
  } finally {
    if (!manual) musicTrackAdvanceInFlight = false;
  }
}

/** 错误恢复必须切换到其它歌曲，不受“单曲循环 / 禁止切换”限制。 */
export async function playNextTrackAfterError(options?: {
  /** scheduleMusicAutoSkip 已占用名额时传 true，避免二次冷却拦截 */
  slotConsumed?: boolean;
}): Promise<void> {
  // 取链尚未结束时禁止跳过，否则清 src 触发的伪 error 会连环切歌
  if (state.musicLoading) return;
  if (!options?.slotConsumed && !consumeMusicAutoSkipSlot()) {
    console.warn('[music] autoSkip suppressed (cooldown/burst)');
    return;
  }
  const queue = state.trackQueue;
  if (queue.length <= 1) return;
  const cur = state.trackIndex;
  const cfg = getMusicPlayConfig();
  const next =
    cfg.playMode === AudioPlayMode.random
      ? resolveRandomUnplayedIndex(queue, cur)
      : (cur + 1) % queue.length;
  if (next != null && next !== cur) await applyMusicTrack(next);
}

export async function playPrevTrack(options?: { manual?: boolean }): Promise<void> {
  const queue = state.trackQueue;
  if (queue.length === 0) return;
  const cfg = getMusicPlayConfig();
  const cur = state.trackIndex;
  const manual = options?.manual !== false;
  // 禁止切换时手动上一首按列表循环；自动场景一般不会走 prev
  const playMode =
    cfg.playMode === AudioPlayMode.none && manual
      ? AudioPlayMode.listLoop
      : cfg.playMode;
  if (playMode === AudioPlayMode.none) return;
  if (playMode === AudioPlayMode.random) {
    const next = resolveRandomUnplayedIndex(queue, cur);
    if (next != null) await applyMusicTrack(next);
    return;
  }
  const prev = cur - 1;
  if (prev >= 0) await applyMusicTrack(prev);
  else if (playMode === AudioPlayMode.listLoop) {
    await applyMusicTrack(queue.length - 1);
  }
}

export function setMusicPanelOpen(
  panel: 'library' | 'search' | 'account' | 'sync' | 'playlist' | 'source',
  open: boolean,
): void {
  if (!open) {
    const key =
      panel === 'library'
        ? 'musicLibraryOpen'
        : panel === 'search'
          ? 'musicSearchOpen'
          : panel === 'account'
            ? 'musicAccountOpen'
            : panel === 'sync'
              ? 'musicSyncOpen'
              : panel === 'playlist'
                ? 'musicPlaylistOpen'
                : 'musicSourceOpen';
    setState({ [key]: false } as Partial<typeof state>);
    return;
  }
  const section: MusicHubSection =
    panel === 'search'
      ? 'search'
      : panel === 'library' || panel === 'playlist'
        ? 'list'
        : panel === 'sync' || panel === 'source' || panel === 'account'
          ? 'settings'
          : 'search';
  setMusicSection(section);
}

async function resolveAudioPlaybackFromRaw(
  raw: string,
  chapterIndex: number,
  chapter?: BookChapter,
): Promise<{ urls: string[]; revokeAll: () => void }> {
  const book = state.book;
  const source =
    book?.origin && book.origin !== 'local'
      ? await sourcesDb.getSource(book.origin)
      : undefined;
  const parsed = parseParsedAudioUrls(raw);
  return resolveAudioPlaybackList(parsed, {
    source: source ?? undefined,
    chapter,
    book: book ?? undefined,
    chapterIndex,
  });
}

export async function applyAudioFromRaw(
  raw: string,
  chapterIndex: number,
  chapter?: BookChapter,
  options?: { allowTextFallback?: boolean; forceRefresh?: boolean },
): Promise<void> {
  const allowTextFallback = options?.allowTextFallback === true;
  const forceRefresh = options?.forceRefresh === true;
  const bookUrl = state.book?.bookUrl ?? '';
  const stillCurrent = createMediaApplyGuard({
    kind: MediaKind.audio,
    bookUrl,
    chapterIndex,
  });
  const commitAudioState = (patch: Partial<typeof state>) => {
    if (!stillCurrent()) return false;
    setState(patch);
    return true;
  };

  const parsed = parseParsedAudioUrls(raw);

  if (parsed.length === 0) {
    if (!stillCurrent()) return;
    revokeAudioPlaybackUrls();
    if (import.meta.env.DEV && raw.trim()) {
      console.warn('[audio] 正文未解析出 URL，前 200 字:', raw.trim().slice(0, 200));
    }
    if (!raw.trim()) {
      commitAudioState({
        rawContent: raw,
        mediaUrls: [],
        primaryUrl: null,
        error: ReaderMediaMessages.emptyContent,
      });
      return;
    }
    commitAudioState({
      rawContent: raw,
      mediaUrls: [],
      primaryUrl: null,
      error: raw.trim().startsWith('@js:')
        ? '音频地址需由书源规则解析，当前未得到有效播放链接'
        : '未识别到可播放的音频地址',
    });
    if (allowTextFallback && stillCurrent() && state.book) {
      dispatchMediaTextFallback({
        bookUrl: state.book.bookUrl,
        chapterIndex,
        fromKind: MediaKind.audio,
      });
    }
    return;
  }

  const book = state.book;

  if (!stillCurrent()) return;
  revokeAudioPlaybackUrls();

  if (book && chapter && !forceRefresh) {
    const key = buildAudioChapterCacheKey(book, chapter);
    const cached = getCachedAudioChapterPlayback(key);
    if (cached) {
      commitAudioState({
        rawContent: raw,
        mediaUrls: cached.urls,
        primaryUrl: cached.primaryUrl,
        error: null,
      });
      return;
    }
  }

  let effectiveRaw = raw;
  let { urls, revokeAll } = await resolveAudioPlaybackFromRaw(
    effectiveRaw,
    chapterIndex,
    chapter,
  );

  if (!stillCurrent()) {
    revokeAll();
    return;
  }

  if (
    urls.length === 0 &&
    !forceRefresh &&
    book &&
    chapter &&
    state.catalog.length > 0
  ) {
    if (import.meta.env.DEV) {
      console.warn('[audio] 拉流失败，强制刷新本章正文后重试', {
        chapterIndex,
        title: chapter.title,
      });
    }
    invalidateAudioChapterCacheKey(buildAudioChapterCacheKey(book, chapter));
    effectiveRaw = await loadChapterRaw(
      book,
      chapter,
      state.catalog,
      chapterIndex,
      true,
    );
    if (!stillCurrent()) return;
    ({ urls, revokeAll } = await resolveAudioPlaybackFromRaw(
      effectiveRaw,
      chapterIndex,
      chapter,
    ));
    if (!stillCurrent()) {
      revokeAll();
      return;
    }
  }

  if (!stillCurrent()) {
    revokeAll();
    return;
  }

  playbackRevoke = revokeAll;

  if (urls.length === 0) {
    commitAudioState({
      rawContent: effectiveRaw,
      mediaUrls: [],
      primaryUrl: null,
      error: '音频已解析但拉流失败（CDN 403 或网络错误），请刷新或重新登录书源',
    });
    return;
  }

  if (book && chapter && !urls.some((u) => u.startsWith('blob:'))) {
    setCachedAudioChapterPlayback(buildAudioChapterCacheKey(book, chapter), {
      urls,
      primaryUrl: urls[0] ?? '',
    });
  }

  if (import.meta.env.DEV) {
    console.log('[audio] 可播放地址', {
      count: urls.length,
      first: urls[0]?.slice(0, 48),
      blob: urls[0]?.startsWith('blob:'),
      proxy: urls[0]?.includes('__reader_http'),
    });
  }

  if (
    !commitAudioState({
      rawContent: effectiveRaw,
      mediaUrls: urls,
      primaryUrl: urls[0] ?? null,
      error: null,
    })
  ) {
    revokeAll();
    playbackRevoke = null;
  }
}

export function invalidateCurrentAudioChapterCache(): void {
  const book = state.book;
  const chapter = state.catalog[state.chapterIndex];
  if (!book || !chapter) return;
  invalidateAudioChapterCacheKey(buildAudioChapterCacheKey(book, chapter));
}

export async function loadAudioChapter(
  index: number,
  options?: { forceRefresh?: boolean },
  saveProgressFn?: () => Promise<void>,
): Promise<void> {
  await loadMediaChapterWithApply(
    (raw, chapterIndex, chapter, opts) =>
      applyAudioFromRaw(raw, chapterIndex, chapter, {
        allowTextFallback: opts.allowTextFallback,
        forceRefresh: options?.forceRefresh,
      }),
    index,
    options,
    saveProgressFn,
  );
}

export async function openAudioBook(
  book: Book,
  options?: { initialCatalog?: BookChapter[] },
): Promise<void> {
  await openMediaBookWithKind(MediaKind.audio, book, options, (index) =>
    loadAudioChapter(index),
  );
}
