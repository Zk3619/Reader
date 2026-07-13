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
import { resolveTrackPlaybackUrls } from '@/lib/media/audio/online/online-resolver';
import { MusicPlaybackStatusText } from '@/lib/media/audio/music-playback-status';
import { invalidateTrackUrlCache } from '@/lib/media/audio/online/url-cache';
import { recordRecentPlay } from '@/lib/database/audio-library';
import { isTrackDisliked } from '@/lib/media/audio/library/dislike-filter';
import { revokeAllWebTrackBlobs } from '@/lib/media/audio/library/local-resolver';
import {
  createAudiobookSession,
  createMusicHubSession,
  AUDIO_HUB_BOOK_URL,
} from '@/lib/media/content-session';
import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
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
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { AudioPlayMode } from '@/lib/media/audio/types';
import { globalMediaPlayerStore } from '@/stores/global-media-player';
import { MediaGroupId } from '@/types/book-group';
import { getMusicGroupByListId } from '@/lib/database/media-groups';
import type { MusicHubSection } from '@/stores/viewer/base-state';

let playbackRevoke: (() => void) | null = null;
let playTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

function clearPlayTimeout(): void {
  if (playTimeoutTimer != null) {
    clearTimeout(playTimeoutTimer);
    playTimeoutTimer = null;
  }
}

function schedulePlayTimeout(): void {
  clearPlayTimeout();
  const sec = getMusicSettings().playTimeoutSec ?? 0;
  if (sec <= 0) return;
  playTimeoutTimer = setTimeout(() => {
    void playNextTrack();
  }, sec * 1000);
}

export function isMusicPlaybackMode(): boolean {
  return state.playbackMode === 'music';
}

export function revokeAudioPlaybackUrls(): void {
  playbackRevoke?.();
  playbackRevoke = null;
  revokeAllWebTrackBlobs();
}

export function setAudioBookInitialState(book: Book): void {
  setMediaBookInitialState(book, MediaKind.audio);
  setState({
    playbackMode: 'audiobook',
    contentSession: createAudiobookSession(book, state.catalog, state.chapterIndex, state.chapterPos),
    trackQueue: [],
    trackIndex: 0,
    activePlaylistId: null,
    activeSource: null,
  });
}

export async function openMusicHub(options?: {
  panel?: 'search' | 'library' | 'playlist' | 'sync';
  section?: MusicHubSection;
}): Promise<void> {
  revokeAudioPlaybackUrls();
  const section: MusicHubSection =
    options?.section ??
    (options?.panel === 'search'
      ? 'search'
      : options?.panel === 'library' || options?.panel === 'playlist'
        ? 'list'
        : options?.panel === 'sync'
          ? 'settings'
          : state.musicSection || 'search');
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

export function setMusicSection(section: MusicHubSection): void {
  setState({
    musicSection: section,
    musicLibraryOpen: false,
    musicSearchOpen: false,
    musicAccountOpen: false,
    musicSyncOpen: false,
    musicPlaylistOpen: false,
    musicSourceOpen: false,
  });
}

export function setActiveMusicGroupId(groupId: number | null): void {
  setState({ activeMusicGroupId: groupId });
}

export function setActivePlaylistId(playlistId: string | null): void {
  if (!playlistId) {
    setState({ activePlaylistId: null, activeMusicGroupId: null });
    return;
  }
  if (playlistId === 'favorite' || playlistId === String(MediaGroupId.Favorite)) {
    setState({
      activePlaylistId: null,
      activeMusicGroupId: MediaGroupId.Favorite,
    });
    return;
  }
  void getMusicGroupByListId(playlistId).then((group) => {
    if (group) {
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
    playbackStatus: MusicPlaybackStatusText.gettingUrl,
    trackIndex: index,
  });
  clearPlayTimeout();
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
      setState({
        loading: false,
        playbackStatus: null,
        mediaUrls: [],
        primaryUrl: null,
        error: toggled
          ? MusicPlaybackStatusText.toggleFailed
          : '无法解析播放地址',
        contentSession: createMusicHubSession(queue, index),
      });
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
    void recordRecentPlay(playTrack.id);
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

    const cfg = getMusicPlayConfig();
    const nextIdx = resolveNextChapterIndex(index, nextQueue.length, cfg.playMode);
    if (nextIdx != null && nextIdx !== index) {
      const nextTrack = nextQueue[nextIdx];
      if (nextTrack) {
        void preloadTrackUrl(nextTrack, { activeSource: state.activeSource });
      }
    }
    schedulePlayTimeout();
  } catch (err) {
    const message = err instanceof Error ? err.message : '播放地址解析失败';
    console.warn('[music] applyMusicTrack failed', err);
    setState({
      loading: false,
      playbackStatus: null,
      mediaUrls: [],
      primaryUrl: null,
      error: message,
      contentSession: createMusicHubSession(queue, index),
    });
  }
}

/** 播放失败时刷新 URL 并重试（最多 1 次） */
export async function retryMusicTrackPlayback(): Promise<void> {
  await applyMusicTrack(state.trackIndex, { forceRefreshUrl: true });
}

export function setMusicTrackQueue(
  tracks: AudioTrack[],
  startIndex = 0,
  source?: AudioTrackSource,
): void {
  setState({
    trackQueue: tracks,
    trackIndex: startIndex,
    activeSource: source ?? tracks[0]?.source ?? null,
    contentSession: createMusicHubSession(tracks, startIndex),
  });
  void applyMusicTrack(startIndex);
}

export async function playTrack(track: AudioTrack): Promise<void> {
  setMusicTrackQueue([track], 0, track.source);
}

export async function playPlaylist(tracks: AudioTrack[], startIndex = 0): Promise<void> {
  if (tracks.length === 0) return;
  setMusicTrackQueue(tracks, startIndex, tracks[startIndex]?.source);
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
  setState({
    trackQueue: queue,
    trackIndex: nextIndex,
    contentSession: createMusicHubSession(queue, nextIndex),
  });
  if (wasCurrent && queue.length > 0) void applyMusicTrack(nextIndex);
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
  const next = resolveNextChapterIndex(cur, queue.length, cfg.playMode);
  if (next == null) return;
  await applyMusicTrack(next);
}

export async function playPrevTrack(): Promise<void> {
  const queue = state.trackQueue;
  if (queue.length === 0) return;
  const cfg = getMusicPlayConfig();
  const cur = state.trackIndex;
  if (cfg.playMode === AudioPlayMode.random) {
    const next = resolveNextChapterIndex(cur, queue.length, AudioPlayMode.random);
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
