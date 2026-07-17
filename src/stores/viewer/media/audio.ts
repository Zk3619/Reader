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
} from '@/stores/viewer/media/chapter';
import type { Book, BookChapter } from '@/types';
import { resolveNextChapterIndex } from '@/lib/media/audio/play-mode';
import { preloadTrackUrl } from '@/lib/media/audio/online/track-preload';
import { getMusicPlayConfig } from '@/lib/media/audio/music-play-config';
import { resolveOnlinePic } from '@/lib/media/audio/online/source-router';
import {
  getMusicActivePlaylistId,
  getMusicSettings,
  setMusicActivePlaylistId,
} from '@/lib/media/audio/music-settings';
import { AudioPlayMode } from '@/lib/media/audio/types';
import { globalMediaPlayerStore } from '@/stores/global-media-player';
import { MediaGroupId } from '@/types/book-group';
import { getMusicGroupByListId } from '@/lib/database/media-groups';
import type { MusicHubSection, MusicPlayerListKind } from '@/stores/viewer/base-state';

let playbackRevoke: (() => void) | null = null;
let restorePlaylistRequestId = 0;
let randomPlayedTrackKeys = new Set<string>();
let randomQueueSignature = '';
const TEMP_PLAYER_LIST_ID = 'temp';
const PLAYER_LIST_STATE_KEY = 'reader_music_player_list_state';

interface PlayerListSource {
  id: string | null;
  name: string | null;
  kind: MusicPlayerListKind | null;
}

function persistPlayerListState(listId: string | null, trackIndex: number): void {
  if (typeof localStorage === 'undefined') return;
  if (!listId || listId === TEMP_PLAYER_LIST_ID) {
    localStorage.removeItem(PLAYER_LIST_STATE_KEY);
    return;
  }
  localStorage.setItem(PLAYER_LIST_STATE_KEY, JSON.stringify({ listId, trackIndex }));
}

function readPersistedPlayerListState(): { listId: string; trackIndex: number } | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(PLAYER_LIST_STATE_KEY) ?? 'null') as {
      listId?: unknown;
      trackIndex?: unknown;
    } | null;
    if (!parsed || typeof parsed.listId !== 'string') return null;
    return {
      listId: parsed.listId,
      trackIndex:
        typeof parsed.trackIndex === 'number' && Number.isFinite(parsed.trackIndex)
          ? Math.max(0, Math.floor(parsed.trackIndex))
          : 0,
    };
  } catch {
    return null;
  }
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
    case 'settings':
    case 'nowPlaying':
      return section;
    case 'download':
      return 'settings';
    default:
      return 'search';
  }
}

export function isMusicPlaybackMode(): boolean {
  return state.playbackMode === 'music';
}

export function revokeAudioPlaybackUrls(): void {
  playbackRevoke?.();
  playbackRevoke = null;
  revokeAllWebTrackBlobs();
}

export async function restoreActiveMusicPlaylistSelection(): Promise<void> {
  const requestId = ++restorePlaylistRequestId;
  const rememberedPlaylistId = getMusicActivePlaylistId();
  let activePlaylistId = 'local';
  let activeMusicGroupId: number = MediaGroupId.MusicLocal;
  if (rememberedPlaylistId === 'love') {
    activePlaylistId = 'love';
    activeMusicGroupId = MediaGroupId.Favorite;
  } else {
    const rememberedGroup = await getMusicGroupByListId(rememberedPlaylistId);
    if (requestId !== restorePlaylistRequestId) return;
    if (rememberedGroup) {
      activePlaylistId = rememberedPlaylistId;
      activeMusicGroupId = rememberedGroup.groupId;
    }
  }
  if (requestId !== restorePlaylistRequestId) return;
  setState({ activePlaylistId, activeMusicGroupId });
}

async function resolvePlayerListSource(listId: string): Promise<PlayerListSource | null> {
  if (listId === BUILTIN_PLAYLIST_IDS.LOVE) {
    return { id: listId, name: '我的收藏', kind: 'builtin' };
  }
  const group = await getMusicGroupByListId(listId);
  if (!group) return null;
  return {
    id: listId,
    name: group.groupName,
    kind: listId.startsWith('pl_') ? 'user' : 'builtin',
  };
}

/** 按持久列表指针恢复队列快照；只恢复上下文，不自动开始播放。 */
async function restorePlayerListSelection(): Promise<void> {
  if (state.trackQueue.length > 0 || state.playerListId) return;
  const remembered = readPersistedPlayerListState();
  if (!remembered) return;
  const source = await resolvePlayerListSource(remembered.listId);
  if (!source) {
    persistPlayerListState(null, 0);
    return;
  }
  const tracks = await getPlaylistTracks(remembered.listId);
  if (tracks.length === 0) return;
  const trackIndex = Math.min(remembered.trackIndex, tracks.length - 1);
  setState({
    trackQueue: tracks,
    trackIndex,
    playerListId: source.id,
    playerListName: source.name,
    playerListKind: source.kind,
    musicQueueOrigin: 'list',
    activeSource: tracks[trackIndex]?.source ?? null,
    contentSession: createMusicHubSession(tracks, trackIndex),
  });
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
  revokeAudioPlaybackUrls();
  await restoreActiveMusicPlaylistSelection();
  await restorePlayerListSelection();
  const section: MusicHubSection =
    options?.section ??
    (options?.panel === 'search'
      ? 'search'
      : options?.panel === 'library' || options?.panel === 'playlist'
        ? 'list'
        : options?.panel === 'sync'
          ? 'settings'
          : normalizeMusicHubSection(state.musicSection));
  setState({
    kind: MediaKind.audio,
    book: null,
    catalog: [],
    chapterIndex: 0,
    chapterPos: 0,
    guestReading: false,
    playbackMode: 'music',
    trackQueue: state.trackQueue.length > 0 ? state.trackQueue : [],
    trackIndex: state.trackIndex,
    activePlaylistId: state.activePlaylistId ?? 'local',
    activeMusicGroupId: state.activeMusicGroupId ?? MediaGroupId.MusicLocal,
    activeSource: state.activeSource ?? 'local',
    contentSession: createMusicHubSession(state.trackQueue, state.trackIndex),
    rawContent: '',
    mediaUrls: state.mediaUrls,
    primaryUrl: state.primaryUrl,
    loading: false,
    error: null,
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
  setState({
    musicSection: next,
    musicLibraryOpen: false,
    musicSearchOpen: false,
    musicAccountOpen: false,
    musicSyncOpen: false,
    musicPlaylistOpen: false,
    musicSourceOpen: false,
  });
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
  if (clearQueue) persistPlayerListState(null, 0);
  setState({
    activeMusicGroupId: groupId,
    ...(clearQueue
      ? {
          trackQueue: [],
          trackIndex: 0,
          mediaUrls: [],
          primaryUrl: null,
          musicQueueOrigin: 'other' as const,
          playerListId: null,
          playerListName: null,
          playerListKind: null,
        }
      : {}),
    ...(playlistId !== undefined ? { activePlaylistId: playlistId } : {}),
  });
}

export function setActivePlaylistId(playlistId: string | null): void {
  restorePlaylistRequestId += 1;
  if (!playlistId) {
    setMusicActivePlaylistId('local');
    setState({ activePlaylistId: null, activeMusicGroupId: null });
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
    return;
  }
  void getMusicGroupByListId(playlistId).then((group) => {
    if (group) {
      setMusicActivePlaylistId(playlistId);
      setState({
        activePlaylistId: playlistId,
        activeMusicGroupId: group.groupId,
      });
    }
  });
}

export async function applyMusicTrack(
  index: number,
  options?: { forceRefreshUrl?: boolean },
): Promise<void> {
  const queue = state.trackQueue;
  const track = queue[index];
  if (!track) {
    setState({
      trackIndex: index,
      mediaUrls: [],
      primaryUrl: null,
      error: '队列中无此曲目',
    });
    return;
  }
  randomPlayedTrackKeys.add(musicTrackKey(track));
  if (await isTrackDisliked(track)) {
    setState({
      loading: false,
      trackIndex: index,
      mediaUrls: [],
      primaryUrl: null,
      error: '该曲目已被 dislike 规则过滤',
    });
    return;
  }
  setState({
    loading: true,
    error: null,
    playbackStatus: (() => {
      const name = getActiveUserApiDisplayName();
      return name
        ? `${MusicPlaybackStatusText.gettingUrl}（${name}）`
        : MusicPlaybackStatusText.gettingUrl;
    })(),
    trackIndex: index,
  });
  persistPlayerListState(
    state.playerListKind === 'temporary' ? null : state.playerListId,
    index,
  );
  try {
    if (options?.forceRefreshUrl) {
      await invalidateTrackUrlCache(track.id);
    }
    revokeAudioPlaybackUrls();
    const { urls, revokeAll, toggled, track: resolvedTrack } = await resolveTrackPlaybackUrls(
      track,
      {
        skipCache: options?.forceRefreshUrl,
        activeSource: state.activeSource,
        onStatus: (message) => setState({ playbackStatus: message }),
        onToggleSource: (alt) => {
          console.info('[music] toggle source:', alt.source, alt.name, alt.artist);
        },
      },
    );
    playbackRevoke = revokeAll;
    if (urls.length === 0) {
      const apiErr = consumeLastUserApiError();
      const detail = apiErr ? formatMusicUrlError(apiErr) : null;
      const failMsg = toggled
        ? MusicPlaybackStatusText.toggleFailed
        : detail ?? '无法解析播放地址';
      setState({
        loading: false,
        playbackStatus: null,
        mediaUrls: [],
        primaryUrl: null,
        error: failMsg,
        contentSession: createMusicHubSession(queue, index),
      });
      if (shouldAutoSkipOnError(queue.length)) {
        console.warn('[music] autoSkipOnError after resolve fail');
        setTimeout(() => void playNextTrackAfterError(), 0);
      }
      return;
    }

    // 换源成功：回写队列曲目，避免 UI 仍显示原源
    let nextQueue = queue;
    const playTrack = resolvedTrack ?? track;
    if (toggled && resolvedTrack && resolvedTrack.id !== track.id) {
      nextQueue = [...queue];
      nextQueue[index] = resolvedTrack;
    }

    setState({
      loading: false,
      playbackStatus: null,
      rawContent: '',
      trackQueue: nextQueue,
      mediaUrls: urls,
      primaryUrl: urls[0] ?? null,
      error: null,
      activeSource: playTrack.source,
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
          if (!resolvedCover) return;
          const current = state.trackQueue[index];
          if (!current || musicTrackKey(current) !== musicTrackKey(playTrack)) return;
          const queueWithCover = [...state.trackQueue];
          queueWithCover[index] = {
            ...current,
            meta: { ...current.meta, coverUrl: resolvedCover },
          };
          setState({
            trackQueue: queueWithCover,
            contentSession: createMusicHubSession(queueWithCover, index),
          });
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
    const message = formatMusicUrlError(err);
    console.warn('[music] applyMusicTrack failed', err);
    setState({
      loading: false,
      playbackStatus: null,
      mediaUrls: [],
      primaryUrl: null,
      error: message,
      contentSession: createMusicHubSession(queue, index),
    });
    if (shouldAutoSkipOnError(queue.length)) {
      console.warn('[music] autoSkipOnError after exception');
      setTimeout(() => void playNextTrackAfterError(), 0);
    }
  }
}

/** 播放失败时刷新 URL 并重试（最多 1 次） */
export async function retryMusicTrackPlayback(): Promise<void> {
  await applyMusicTrack(state.trackIndex, { forceRefreshUrl: true });
}

/** 队列来源：决定失败自动切歌等行为。 */
export type MusicQueueOrigin = 'search' | 'list' | 'other';

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
  persistPlayerListState(null, state.trackIndex);
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
  persistPlayerListState(
    listPatch.playerListKind === 'temporary' ? null : listPatch.playerListId,
    startIndex,
  );
  setState({
    trackQueue: tracks,
    trackIndex: startIndex,
    activeSource: source ?? tracks[0]?.source ?? null,
    ...(options.origin !== undefined ? { musicQueueOrigin: options.origin } : {}),
    ...listPatch,
    contentSession: createMusicHubSession(tracks, startIndex),
  });
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
  persistPlayerListState(null, nextIndex);
  setState({
    trackQueue: queue,
    trackIndex: nextIndex,
    contentSession: createMusicHubSession(queue, nextIndex),
  });
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

export async function playNextTrack(): Promise<void> {
  const queue = state.trackQueue;
  if (queue.length === 0) return;
  const cfg = getMusicPlayConfig();
  const cur = state.trackIndex;
  if (cfg.playMode === AudioPlayMode.singleLoop) {
    await applyMusicTrack(cur);
    return;
  }
  const next =
    cfg.playMode === AudioPlayMode.random
      ? resolveRandomUnplayedIndex(queue, cur)
      : resolveNextChapterIndex(cur, queue.length, cfg.playMode);
  if (next == null) return;
  await applyMusicTrack(next);
}

/** 错误恢复必须切换到其它歌曲，不受“单曲循环”限制。 */
export async function playNextTrackAfterError(): Promise<void> {
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

export async function playPrevTrack(): Promise<void> {
  const queue = state.trackQueue;
  if (queue.length === 0) return;
  const cfg = getMusicPlayConfig();
  const cur = state.trackIndex;
  if (cfg.playMode === AudioPlayMode.random) {
    const next = resolveRandomUnplayedIndex(queue, cur);
    if (next != null) await applyMusicTrack(next);
    return;
  }
  const prev = cur - 1;
  if (prev >= 0) await applyMusicTrack(prev);
  else if (cfg.playMode === AudioPlayMode.listLoop) {
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
  const parsed = parseParsedAudioUrls(raw);

  if (parsed.length === 0) {
    revokeAudioPlaybackUrls();
    if (import.meta.env.DEV && raw.trim()) {
      console.warn('[audio] 正文未解析出 URL，前 200 字:', raw.trim().slice(0, 200));
    }
    if (!raw.trim()) {
      setState({
        rawContent: raw,
        mediaUrls: [],
        primaryUrl: null,
        error: ReaderMediaMessages.emptyContent,
      });
      return;
    }
    setState({
      rawContent: raw,
      mediaUrls: [],
      primaryUrl: null,
      error: raw.trim().startsWith('@js:')
        ? '音频地址需由书源规则解析，当前未得到有效播放链接'
        : '未识别到可播放的音频地址',
    });
    if (allowTextFallback && state.book) {
      dispatchMediaTextFallback({
        bookUrl: state.book.bookUrl,
        chapterIndex,
        fromKind: MediaKind.audio,
      });
    }
    return;
  }

  const book = state.book;

  revokeAudioPlaybackUrls();

  if (book && chapter && !forceRefresh) {
    const key = buildAudioChapterCacheKey(book, chapter);
    const cached = getCachedAudioChapterPlayback(key);
    if (cached) {
      setState({
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
    ({ urls, revokeAll } = await resolveAudioPlaybackFromRaw(
      effectiveRaw,
      chapterIndex,
      chapter,
    ));
  }

  playbackRevoke = revokeAll;

  if (urls.length === 0) {
    setState({
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

  setState({
    rawContent: effectiveRaw,
    mediaUrls: urls,
    primaryUrl: urls[0] ?? null,
    error: null,
  });
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
