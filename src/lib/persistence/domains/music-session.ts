/**
 * music.session 持久化域：播放会话权威在 SQLite；hub 分区在 music.config
 */

import type { PersistDomain } from '@/lib/persistence/types';
import { registerPersistDomain } from '@/lib/persistence/registry';
import {
  getSessionDoc,
  removeSessionDoc,
} from '@/lib/persistence/backends/session-store';
import {
  loadMusicPlaybackState,
  saveMusicPlaybackState,
  type MusicPlaybackRow,
} from '@/lib/database/music-playback-state';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { BUILTIN_PLAYLIST_IDS } from '@/lib/media/audio/track-types';
import {
  getMusicActivePlaylistId,
  getMusicSettings,
  setMusicActivePlaylistId,
} from '@/lib/media/audio/music-settings';
import { getMusicPlayConfig } from '@/lib/media/audio/music-play-config';
import {
  patchMusicConfig,
  peekMusicConfigSync,
} from '@/lib/media/audio/music-config-storage';
import type { AudioPlayMode } from '@/lib/media/audio/types';
import { MediaGroupId } from '@/types/book-group';
import type {
  MusicHubSection,
  MusicPlayerListKind,
} from '@/stores/viewer/base-state';
import { state, setState } from '@/stores/viewer/media/state';
import {
  createMusicHubSession,
} from '@/lib/media/content-session';
import { getMusicGroupByListId } from '@/lib/database/media-groups';
import { getPlaylistTracks } from '@/lib/database/audio-library';

/** 冷启动恢复队列后，首次自动播放决策走 startupAutoPlay（而非选中后 autoPlay） */
let pendingStartupAutoPlayGate = false;

export function markMusicSessionRestoredForStartupAutoPlay(): void {
  pendingStartupAutoPlayGate = true;
}

/** @returns null=非恢复门闩；boolean=消费后的 startupAutoPlay 值 */
export function consumeMusicStartupAutoPlayGate(): boolean | null {
  if (!pendingStartupAutoPlayGate) return null;
  pendingStartupAutoPlayGate = false;
  return getMusicSettings().startupAutoPlay;
}
export const MUSIC_SESSION_DOMAIN_ID = 'music.session';
export const MUSIC_SESSION_DOC_KEY = 'music.session';
export const MUSIC_SESSION_VERSION = 1;

const LEGACY_PLAYER_LIST_KEY = 'reader_music_player_list_state';
const LEGACY_TRACK_PROGRESS_KEY = 'reader_music_track_progress';
const TEMP_PLAYER_LIST_ID = 'temp';
const PERSIST_THROTTLE_MS = 2000;

const BUILTIN_LIST_ID_TO_GROUP: Record<string, number> = {
  [BUILTIN_PLAYLIST_IDS.DEFAULT]: MediaGroupId.MusicDefault,
  [BUILTIN_PLAYLIST_IDS.TRIAL]: MediaGroupId.MusicTrial,
  [BUILTIN_PLAYLIST_IDS.RECENT]: MediaGroupId.MusicRecent,
  [BUILTIN_PLAYLIST_IDS.LOCAL]: MediaGroupId.MusicLocal,
  [BUILTIN_PLAYLIST_IDS.LOVE]: MediaGroupId.Favorite,
};

/** 内存/迁移快照；section 不落 SQLite，权威在 music.config */
export interface MusicSessionSnapshot {
  version: typeof MUSIC_SESSION_VERSION;
  section: MusicHubSection;
  activePlaylistId: string;
  listId: string | null;
  index: number;
  time: number;
  maxTime: number;
  tracks: AudioTrack[];
  playerListName: string | null;
  playerListKind: MusicPlayerListKind | null;
  playMode: AudioPlayMode;
  musicVolume: number;
}

let pendingSnapshot: MusicSessionSnapshot | null = null;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let hydratePromise: Promise<void> | null = null;

function normalizeSection(section: unknown): MusicHubSection {
  switch (section) {
    case 'recommend':
    case 'search':
    case 'songlist':
    case 'leaderboard':
    case 'artist':
    case 'album':
    case 'list':
    case 'download':
    case 'settings':
    case 'nowPlaying':
      return section;
    default:
      // 无持久化记录时首次进入落在推荐页
      return 'recommend';
  }
}

function cloneTracks(tracks: readonly AudioTrack[]): AudioTrack[] {
  return tracks.map((track) => ({ ...track, meta: { ...track.meta } }));
}

function isAudioTrack(item: unknown): item is AudioTrack {
  return (
    !!item &&
    typeof item === 'object' &&
    typeof (item as AudioTrack).id === 'string' &&
    typeof (item as AudioTrack).name === 'string'
  );
}

function playbackRowToSnapshot(row: MusicPlaybackRow): MusicSessionSnapshot {
  // 侧栏浏览选中与播放队列相互独立：勿用 SQLite listId 冒充 activePlaylistId
  return {
    version: MUSIC_SESSION_VERSION,
    section: peekMusicConfigSync().hubSection,
    activePlaylistId: getMusicActivePlaylistId(),
    listId: row.listId,
    index: row.trackIndex,
    time: row.position,
    maxTime: row.maxTime,
    tracks: cloneTracks(row.tracks),
    playerListName: row.playerListName,
    playerListKind: row.playerListKind,
    playMode: row.playMode ?? getMusicPlayConfig().playMode,
    musicVolume: getMusicSettings().musicVolume,
  };
}

function isPlaybackEmpty(snap: Pick<MusicSessionSnapshot, 'tracks' | 'listId'>): boolean {
  return snap.tracks.length === 0 && !snap.listId;
}

export function captureMusicSessionSnapshot(
  overrides?: Partial<
    Pick<MusicSessionSnapshot, 'time' | 'maxTime' | 'index' | 'listId'>
  >,
): MusicSessionSnapshot {
  const tracks = state.trackQueue;
  const listId =
    overrides?.listId ??
    state.playerListId ??
    (tracks.length > 0 ? TEMP_PLAYER_LIST_ID : null);
  return {
    version: MUSIC_SESSION_VERSION,
    section: normalizeSection(state.musicSection),
    activePlaylistId: state.activePlaylistId ?? getMusicActivePlaylistId(),
    listId,
    index: overrides?.index ?? state.trackIndex,
    time: overrides?.time ?? state.musicPositionSec ?? 0,
    maxTime: overrides?.maxTime ?? pendingSnapshot?.maxTime ?? 0,
    tracks: cloneTracks(tracks),
    playerListName: state.playerListName,
    playerListKind:
      listId === TEMP_PLAYER_LIST_ID
        ? 'temporary'
        : state.playerListKind,
    playMode: getMusicPlayConfig().playMode,
    musicVolume: getMusicSettings().musicVolume,
  };
}

/** hub 分区权威：music.config peek */
export function getCachedMusicHubSection(): MusicHubSection {
  return normalizeSection(peekMusicConfigSync().hubSection);
}

export function setCachedMusicHubSection(section: MusicHubSection): void {
  const next = normalizeSection(section);
  if (peekMusicConfigSync().hubSection === next) return;
  patchMusicConfig({ hubSection: next });
}

function clearLegacyLocalStorageKeys(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(LEGACY_PLAYER_LIST_KEY);
  } catch {
    // ignore
  }
}

async function resolvePlaylistSelection(listId: string): Promise<{
  activePlaylistId: string;
  activeMusicGroupId: number;
}> {
  if (listId === 'love' || listId === BUILTIN_PLAYLIST_IDS.LOVE) {
    return { activePlaylistId: 'love', activeMusicGroupId: MediaGroupId.Favorite };
  }
  const group = await getMusicGroupByListId(listId);
  if (group) {
    return { activePlaylistId: listId, activeMusicGroupId: group.groupId };
  }
  const fallback = BUILTIN_LIST_ID_TO_GROUP[listId];
  if (fallback != null) {
    return { activePlaylistId: listId, activeMusicGroupId: fallback };
  }
  return {
    activePlaylistId: 'local',
    activeMusicGroupId: MediaGroupId.MusicLocal,
  };
}

async function resolvePlayerListSource(
  listId: string,
  name: string | null,
  kind: MusicPlayerListKind | null,
): Promise<{
  id: string;
  name: string | null;
  kind: MusicPlayerListKind | null;
}> {
  if (listId === TEMP_PLAYER_LIST_ID) {
    return {
      id: listId,
      name: name?.trim() || '临时播放队列',
      kind: 'temporary',
    };
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
  const names: Record<string, string> = {
    [BUILTIN_PLAYLIST_IDS.DEFAULT]: '播放列表',
    [BUILTIN_PLAYLIST_IDS.TRIAL]: '试听列表',
    [BUILTIN_PLAYLIST_IDS.RECENT]: '最近播放',
    [BUILTIN_PLAYLIST_IDS.LOCAL]: '本地音乐',
  };
  if (BUILTIN_LIST_ID_TO_GROUP[listId] != null) {
    return { id: listId, name: names[listId] ?? name ?? listId, kind: 'builtin' };
  }
  return {
    id: listId,
    name: name ?? listId,
    kind: kind ?? (listId.startsWith('pl_') ? 'user' : 'builtin'),
  };
}

async function applyMusicSessionSnapshot(
  snap: MusicSessionSnapshot,
  options?: { prepareTrack?: boolean },
): Promise<void> {
  const section = getCachedMusicHubSection();
  const playlist = await resolvePlaylistSelection(snap.activePlaylistId);
  setMusicActivePlaylistId(playlist.activePlaylistId);

  let tracks = snap.tracks?.length ? cloneTracks(snap.tracks) : [];
  let listId = snap.listId;
  let playerListName = snap.playerListName;
  let playerListKind = snap.playerListKind;

  if (tracks.length === 0 && listId && listId !== TEMP_PLAYER_LIST_ID) {
    const source = await resolvePlayerListSource(listId, playerListName, playerListKind);
    tracks = await getPlaylistTracks(listId);
    listId = source.id;
    playerListName = source.name;
    playerListKind = source.kind;
  } else if (tracks.length > 0 && listId) {
    const source = await resolvePlayerListSource(
      listId,
      playerListName,
      playerListKind,
    );
    listId = source.id;
    playerListName = source.name;
    playerListKind = source.kind;
  }

  const trackIndex =
    tracks.length > 0 ? Math.min(Math.max(0, snap.index), tracks.length - 1) : 0;
  const saveTime = getMusicSettings().rememberProgress;
  const musicPositionSec = saveTime ? Math.max(0, snap.time) : 0;

  // 先写 per-track LS，再 setState，避免 Hub createEffect 读到空进度
  if (saveTime && musicPositionSec > 0 && tracks[trackIndex]) {
    const track = tracks[trackIndex]!;
    try {
      const raw = localStorage.getItem(LEGACY_TRACK_PROGRESS_KEY);
      const progress = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      progress[`${track.source}:${track.id}`] = musicPositionSec;
      localStorage.setItem(LEGACY_TRACK_PROGRESS_KEY, JSON.stringify(progress));
    } catch {
      // ignore
    }
  }

  setState({
    musicSection: section,
    activePlaylistId: playlist.activePlaylistId,
    activeMusicGroupId: playlist.activeMusicGroupId,
    ...(tracks.length > 0
      ? {
          trackQueue: tracks,
          trackIndex,
          musicPositionSec,
          playerListId: listId,
          playerListName,
          playerListKind,
          musicQueueOrigin:
            playerListKind === 'temporary' || playerListKind === 'single'
              ? 'other'
              : 'list',
          activeSource: tracks[trackIndex]?.source ?? null,
          contentSession: createMusicHubSession(tracks, trackIndex),
          playbackMode: 'music' as const,
        }
      : {}),
  });

  if (tracks.length > 0) {
    markMusicSessionRestoredForStartupAutoPlay();
  }

  if (options?.prepareTrack !== false && tracks.length > 0) {
    const { applyMusicTrack } = await import('@/stores/viewer/media/audio');
    await applyMusicTrack(trackIndex);
  }
}
async function writeSnapshot(snap: MusicSessionSnapshot): Promise<void> {
  await saveMusicPlaybackState({
    listId: snap.listId,
    trackIndex: snap.index,
    position: snap.time,
    maxTime: snap.maxTime,
    playerListName: snap.playerListName,
    playerListKind: snap.playerListKind,
    playMode: snap.playMode,
    tracks: snap.tracks,
  });
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(
        'reader_music_active_playlist_id',
        snap.activePlaylistId || 'local',
      );
    } catch {
      // ignore
    }
  }
}

async function writeEmptyPlayback(): Promise<void> {
  await saveMusicPlaybackState({
    listId: null,
    trackIndex: 0,
    position: 0,
    maxTime: 0,
    playerListName: null,
    playerListKind: null,
    playMode: getMusicPlayConfig().playMode,
    tracks: [],
  });
}

async function flushPending(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  if (!pendingSnapshot) {
    const current = captureMusicSessionSnapshot();
    if (isPlaybackEmpty(current)) {
      return;
    }
    await writeSnapshot(current);
    return;
  }
  const snap = pendingSnapshot;
  pendingSnapshot = null;
  await writeSnapshot(snap);
}

/**
 * 调度写入会话。immediate 或 clear 时立刻落盘（SQLite）。
 */
export function scheduleMusicSessionPersist(options?: {
  immediate?: boolean;
  clear?: boolean;
  time?: number;
  maxTime?: number;
  index?: number;
  listId?: string | null;
}): void {
  if (options?.clear) {
    pendingSnapshot = null;
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = undefined;
    }
    void writeEmptyPlayback();
    clearLegacyLocalStorageKeys();
    return;
  }

  const snap = captureMusicSessionSnapshot({
    time: options?.time,
    maxTime: options?.maxTime,
    index: options?.index,
    listId: options?.listId === undefined ? undefined : options.listId,
  });
  if (isPlaybackEmpty(snap)) {
    scheduleMusicSessionPersist({ clear: true, immediate: true });
    return;
  }
  pendingSnapshot = snap;
  if (options?.immediate) {
    void flushPending();
    return;
  }
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    void flushPending();
  }, PERSIST_THROTTLE_MS);
}

export async function flushMusicSessionPersist(): Promise<void> {
  await flushPending();
}

function normalizeMigratedSessionDoc(
  raw: MusicSessionSnapshot,
): MusicSessionSnapshot | null {
  if (!raw || raw.version !== MUSIC_SESSION_VERSION) return null;
  const tracks = Array.isArray(raw.tracks)
    ? raw.tracks.filter(isAudioTrack)
    : [];
  return {
    version: MUSIC_SESSION_VERSION,
    section: normalizeSection(raw.section),
    activePlaylistId:
      typeof raw.activePlaylistId === 'string' && raw.activePlaylistId.trim()
        ? raw.activePlaylistId
        : getMusicActivePlaylistId(),
    listId: typeof raw.listId === 'string' ? raw.listId : null,
    index:
      typeof raw.index === 'number' && Number.isFinite(raw.index)
        ? Math.max(0, Math.floor(raw.index))
        : 0,
    time:
      typeof raw.time === 'number' && Number.isFinite(raw.time)
        ? Math.max(0, raw.time)
        : 0,
    maxTime:
      typeof raw.maxTime === 'number' && Number.isFinite(raw.maxTime)
        ? Math.max(0, raw.maxTime)
        : 0,
    tracks,
    playerListName:
      typeof raw.playerListName === 'string' ? raw.playerListName : null,
    playerListKind:
      typeof raw.playerListKind === 'string'
        ? (raw.playerListKind as MusicPlayerListKind)
        : null,
    playMode: raw.playMode ?? getMusicPlayConfig().playMode,
    musicVolume: getMusicSettings().musicVolume,
  };
}

async function loadSnapshotPreferSqlite(): Promise<MusicSessionSnapshot | null> {
  const row = await loadMusicPlaybackState();
  if (row && (row.tracks.length > 0 || row.listId)) {
    return playbackRowToSnapshot(row);
  }

  // 一次性从旧 session.json 迁移
  const legacyDoc = await getSessionDoc<MusicSessionSnapshot>(MUSIC_SESSION_DOC_KEY);
  const migrated = legacyDoc ? normalizeMigratedSessionDoc(legacyDoc) : null;
  if (migrated && !isPlaybackEmpty(migrated)) {
    await writeSnapshot(migrated);
    try {
      await removeSessionDoc(MUSIC_SESSION_DOC_KEY);
    } catch {
      // ignore
    }
    clearLegacyLocalStorageKeys();
    return {
      ...migrated,
      section: getCachedMusicHubSection(),
    };
  }

  return null;
}

async function restoreBrowsePlaylistSelection(): Promise<void> {
  const playlist = await resolvePlaylistSelection(getMusicActivePlaylistId());
  setMusicActivePlaylistId(playlist.activePlaylistId);
  setState({
    activePlaylistId: playlist.activePlaylistId,
    activeMusicGroupId: playlist.activeMusicGroupId,
  });
}

export async function ensureMusicSessionHydrated(options?: {
  prepareTrack?: boolean;
}): Promise<void> {
  if (hydratePromise) return hydratePromise;
  const prepareTrack = options?.prepareTrack !== false;
  hydratePromise = (async () => {
    const snap = await loadSnapshotPreferSqlite();
    const section = getCachedMusicHubSection();

    if (snap) {
      // 已有内存队列则只恢复分区/列表，不冲掉正在播的会话
      if (state.trackQueue.length > 0) {
        setState({ musicSection: section });
        await restoreBrowsePlaylistSelection();
        return;
      }
      await applyMusicSessionSnapshot(
        { ...snap, section },
        { prepareTrack },
      );
    } else {
      setState({ musicSection: section });
      await restoreBrowsePlaylistSelection();
    }
  })();
  try {
    await hydratePromise;
  } catch (error) {
    hydratePromise = null;
    throw error;
  }
}

async function hydrateDomain(): Promise<void> {
  // 启动 hydrate 默认不取链，避免未开启「启动自动播放」时也出声
  await ensureMusicSessionHydrated({ prepareTrack: false });
  if (
    getMusicSettings().startupAutoPlay &&
    state.trackQueue.length > 0
  ) {
    markMusicSessionRestoredForStartupAutoPlay();
    const { applyMusicTrack } = await import('@/stores/viewer/media/audio');
    await applyMusicTrack(state.trackIndex);
  }
}

async function persistDomain(
  reason: 'change' | 'flush',
): Promise<void> {
  if (reason === 'flush') {
    await flushPending();
    return;
  }
  scheduleMusicSessionPersist({ immediate: false });
}

export function createMusicSessionPersistDomain(): PersistDomain {
  return {
    id: MUSIC_SESSION_DOMAIN_ID,
    version: MUSIC_SESSION_VERSION,
    priority: 'deferred',
    hydrate: hydrateDomain,
    persist: persistDomain,
    flush: flushMusicSessionPersist,
    exportSnapshot: async () => {
      const row = await loadMusicPlaybackState();
      if (row && (row.tracks.length > 0 || row.listId)) {
        return playbackRowToSnapshot(row);
      }
      return captureMusicSessionSnapshot();
    },
    importSnapshot: async (data: unknown) => {
      if (!data || typeof data !== 'object') return;
      const snap = normalizeMigratedSessionDoc(data as MusicSessionSnapshot);
      if (!snap) return;
      if (snap.section) {
        patchMusicConfig({ hubSection: normalizeSection(snap.section) });
      }
      await writeSnapshot(snap);
      hydratePromise = null;
      await ensureMusicSessionHydrated();
    },
  };
}

export function registerMusicSessionPersistDomain(): void {
  registerPersistDomain(createMusicSessionPersistDomain());
}
