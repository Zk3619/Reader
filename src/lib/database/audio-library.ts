/**
 * 音频曲库数据库访问层
 */

import { getDatabase } from '@/lib/database/database-core';
import {
  addFavoriteTrack,
  addGroupItem,
  getGroupItemIds,
  getMusicGroupByListId,
  getMusicGroups,
  isTrackFavorite,
  removeFavoriteTrack,
  removeGroupItem,
  reorderGroupItems,
  setGroupItems,
  getNextMusicUserGroupId,
  insertGroup as insertMediaGroup,
} from '@/lib/database/media-groups';
import { AudioTables, ShellTables } from '@/lib/database/table-names';
import { MediaGroupId } from '@/types/book-group';
import type {
  AudioPlaylist,
  AudioTrack,
  AudioTrackMeta,
  AudioAuthSession,
  AudioSyncState,
} from '@/lib/media/audio/track-types';
import { BUILTIN_PLAYLIST_IDS } from '@/lib/media/audio/track-types';

export const MUSIC_PLAYLISTS_CHANGED_EVENT = 'reader:music-playlists-changed';

const RECENT_MAX = 200;

function notifyMusicPlaylistsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(MUSIC_PLAYLISTS_CHANGED_EVENT));
  }
}

function isDatabaseBusy(error: unknown): boolean {
  return /database is locked|database is busy|SQLITE_BUSY/i.test(String(error));
}

async function withDatabaseBusyRetry<T>(operation: () => Promise<T>, retries = 4): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isDatabaseBusy(error) || attempt >= retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * 2 ** attempt));
    }
  }
}

function parseMeta(json: string): AudioTrackMeta {
  try {
    const v = JSON.parse(json);
    return typeof v === 'object' && v ? (v as AudioTrackMeta) : {};
  } catch {
    return {};
  }
}

function rowToTrack(row: Record<string, unknown>): AudioTrack {
  return {
    id: String(row.id),
    name: String(row.name),
    artist: String(row.artist ?? ''),
    source: String(row.source ?? 'local'),
    duration: String(row.duration ?? '00:00'),
    meta: parseMeta(String(row.meta_json ?? '{}')),
  };
}

export async function upsertAudioTrack(track: AudioTrack): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.execute(
    `INSERT INTO audio_tracks (id, name, artist, source, duration, meta_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, artist=excluded.artist, source=excluded.source,
       duration=excluded.duration, meta_json=excluded.meta_json, updated_at=excluded.updated_at`,
    [
      track.id,
      track.name,
      track.artist,
      track.source,
      track.duration,
      JSON.stringify(track.meta),
      now,
      now,
    ],
  );
  // 播放缓存常先于入库完成：冲刷暂存的 cache meta
  void import('@/lib/media/audio/audio-disk-cache')
    .then(({ flushPendingTrackCacheMeta }) => flushPendingTrackCacheMeta(track.id))
    .catch(() => undefined);
}

export async function upsertAudioTracks(tracks: AudioTrack[]): Promise<void> {
  for (const track of tracks) {
    await upsertAudioTrack(track);
  }
}

export async function updateAudioTrackCacheMeta(
  trackId: string,
  meta: {
    cachePath: string | null;
    cacheTier: string | null;
    cachedAt: number | null;
    cacheBytes: number | null;
    cacheMime: string | null;
    cacheQuality?: string | null;
  },
): Promise<boolean> {
  const db = await getDatabase();
  // 曲目可能尚未入库：仅更新已存在行（调用方应暂存并在 upsert 后重试）
  const existing = await db.select<{ id: string }>(
    'SELECT id FROM audio_tracks WHERE id = ? LIMIT 1',
    [trackId],
  );
  if (!existing[0]) return false;
  await db.execute(
    `UPDATE audio_tracks SET
      cache_path = ?,
      cache_tier = ?,
      cached_at = ?,
      cache_bytes = ?,
      cache_mime = ?,
      cache_quality = ?,
      updated_at = ?
     WHERE id = ?`,
    [
      meta.cachePath,
      meta.cacheTier,
      meta.cachedAt,
      meta.cacheBytes,
      meta.cacheMime,
      meta.cacheQuality ?? null,
      Date.now(),
      trackId,
    ],
  );
  return true;
}

/** 曲目是否已入库且缺少 cache_path（用于磁盘命中后回填） */
export async function audioTrackNeedsCacheIndexBackfill(
  trackId: string,
): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<{ id: string; cache_path: string | null }>(
    'SELECT id, cache_path FROM audio_tracks WHERE id = ? LIMIT 1',
    [trackId],
  );
  const row = rows[0];
  if (!row) return false;
  return !row.cache_path?.trim();
}

/** 缺少 cache_path 的已入库曲目（含 meta，便于按 toggleMusicInfo 关联磁盘） */
export async function listAudioTracksMissingCacheIndex(): Promise<
  Array<{ id: string; meta: AudioTrackMeta }>
> {
  const db = await getDatabase();
  const rows = await db.select<{ id: string; meta_json: string }>(
    `SELECT id, meta_json FROM ${AudioTables.tracks}
     WHERE cache_path IS NULL OR trim(cache_path) = ''`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    meta: parseMeta(String(row.meta_json ?? '{}')),
  }));
}

export async function getAudioTrackCacheTier(
  trackId: string,
): Promise<'auto' | 'manual' | null> {
  const db = await getDatabase();
  const rows = await db.select<{ cache_tier: string | null }>(
    'SELECT cache_tier FROM audio_tracks WHERE id = ? LIMIT 1',
    [trackId],
  );
  const tier = rows[0]?.cache_tier;
  if (tier === 'manual' || tier === 'auto') return tier;
  return null;
}

export async function getAudioTrack(id: string): Promise<AudioTrack | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM audio_tracks WHERE id = ? LIMIT 1',
    [id],
  );
  return rows[0] ? rowToTrack(rows[0]) : null;
}

export async function listAudioTracks(source?: string): Promise<AudioTrack[]> {
  const db = await getDatabase();
  const rows = source
    ? await db.select<Record<string, unknown>>(
        'SELECT * FROM audio_tracks WHERE source = ? ORDER BY updated_at DESC',
        [source],
      )
    : await db.select<Record<string, unknown>>(
        'SELECT * FROM audio_tracks ORDER BY updated_at DESC',
      );
  return rows.map(rowToTrack);
}

export async function listPlaylists(): Promise<AudioPlaylist[]> {
  const groups = await getMusicGroups();
  return groups
    .filter((g) => g.listId && g.listId !== 'love')
    .map((g) => ({
      id: g.listId!,
      name: g.groupName,
      source: (g.source ?? 'builtin') as AudioPlaylist['source'],
      description: g.description,
      coverUrl: g.cover,
      createdAt: 0,
      updatedAt: 0,
    }));
}

async function groupIdForPlaylist(playlistId: string): Promise<number | null> {
  if (playlistId === 'love') return MediaGroupId.Favorite;
  const group = await getMusicGroupByListId(playlistId);
  return group?.groupId ?? null;
}

export async function getTracksForGroupId(groupId: number): Promise<AudioTrack[]> {
  const db = await getDatabase();
  if (groupId === MediaGroupId.Favorite) {
    const rows = await db.select<Record<string, unknown>>(
      `SELECT t.* FROM ${AudioTables.tracks} t
       INNER JOIN ${ShellTables.favorites} f
         ON f.item_id = t.id AND f.item_kind = 'track'
       ORDER BY f.sort_order ASC`,
    );
    return rows.map(rowToTrack);
  }
  const rows = await db.select<Record<string, unknown>>(
    `SELECT t.* FROM ${AudioTables.tracks} t
     INNER JOIN ${AudioTables.groupItems} i ON i.item_id = t.id
     WHERE i.group_id = ?
     ORDER BY i.sort_order ASC`,
    [groupId],
  );
  return rows.map(rowToTrack);
}

export async function getPlaylistTracks(playlistId: string): Promise<AudioTrack[]> {
  const groupId = await groupIdForPlaylist(playlistId);
  if (groupId == null) return [];
  return getTracksForGroupId(groupId);
}

export async function isTrackInPlaylist(
  playlistId: string,
  trackId: string,
): Promise<boolean> {
  const groupId = await groupIdForPlaylist(playlistId);
  if (groupId == null) return false;
  const items = await getGroupItemIds(groupId, 'track');
  return items.some((item) => item.itemId === trackId);
}

export async function addTrackToPlaylist(
  playlistId: string,
  trackId: string,
  order?: number,
): Promise<void> {
  const groupId = await groupIdForPlaylist(playlistId);
  if (groupId == null) return;
  await addGroupItem(groupId, 'track', trackId, order);
}

function isCuratedPlaylistId(playlistId: string): boolean {
  return (
    playlistId === BUILTIN_PLAYLIST_IDS.LOVE ||
    playlistId === BUILTIN_PLAYLIST_IDS.LOCAL ||
    playlistId.startsWith('pl_')
  );
}

/** 歌曲是否已加入收藏 / 本地 / 用户列表（不含播放列表、最近播放、试听列表） */
export async function isTrackInCuratedList(trackId: string): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<{ ok: number }>(
    `SELECT 1 AS ok
     FROM (
       SELECT item_id FROM ${ShellTables.favorites}
       WHERE item_kind = 'track' AND item_id = ?
       UNION ALL
       SELECT o.item_id FROM ${AudioTables.groupItems} o
       INNER JOIN ${AudioTables.groups} g ON g.groupId = o.group_id
       WHERE o.item_id = ?
         AND (g.listId = ? OR g.listId LIKE 'pl_%')
     )
     LIMIT 1`,
    [trackId, trackId, BUILTIN_PLAYLIST_IDS.LOCAL],
  );
  return rows.length > 0;
}

/** 维护试听列表：未加入其它列表则写入，已加入则移出 */
export async function syncTrialListMembership(track: AudioTrack): Promise<void> {
  if (await isTrackInCuratedList(track.id)) {
    await removeTrackFromPlaylist(BUILTIN_PLAYLIST_IDS.TRIAL, track.id);
    return;
  }
  await upsertAudioTrack(track);
  const groupId = await groupIdForPlaylist(BUILTIN_PLAYLIST_IDS.TRIAL);
  if (groupId == null) return;
  const db = await getDatabase();
  await withDatabaseBusyRetry(() =>
    db.execute(
      `UPDATE ${AudioTables.groupItems}
       SET sort_order = sort_order + 1
       WHERE group_id = ? AND item_id <> ?`,
      [groupId, track.id],
    ),
  );
  await withDatabaseBusyRetry(() =>
    db.execute(
      `INSERT OR REPLACE INTO ${AudioTables.groupItems}
       (group_id, item_id, sort_order, created_at)
       VALUES (?, ?, 0, ?)`,
      [groupId, track.id, Date.now()],
    ),
  );
  await withDatabaseBusyRetry(() =>
    db.execute(
      `DELETE FROM ${AudioTables.groupItems}
       WHERE group_id = ? AND sort_order >= ?`,
      [groupId, RECENT_MAX],
    ),
  );
}

/** 用给定曲目整体替换「播放列表」（显式收藏/导入场景；在线整表播放请用临时队列） */
export async function replaceDefaultPlayList(tracks: AudioTrack[]): Promise<void> {
  await upsertAudioTracks(tracks);
  await setPlaylistTracks(
    BUILTIN_PLAYLIST_IDS.DEFAULT,
    tracks.map((track) => track.id),
  );
  notifyMusicPlaylistsChanged();
}

export async function addTracksToPlaylist(
  playlistId: string,
  tracks: AudioTrack[],
  options?: { position?: 'top' | 'bottom' },
): Promise<void> {
  const previousIds =
    options?.position === 'top'
      ? (await getPlaylistTracks(playlistId)).map((track) => track.id)
      : [];
  await upsertAudioTracks(tracks);
  for (const track of tracks) {
    await addTrackToPlaylist(playlistId, track.id);
  }
  if (options?.position === 'top') {
    const addedIds = tracks.map((track) => track.id);
    await setPlaylistTracks(
      playlistId,
      [...addedIds, ...previousIds.filter((id) => !addedIds.includes(id))],
    );
  }
  if (isCuratedPlaylistId(playlistId) && tracks.length > 0) {
    for (const track of tracks) {
      await removeTrackFromPlaylist(BUILTIN_PLAYLIST_IDS.TRIAL, track.id);
    }
  }
  if (tracks.length > 0) {
    notifyMusicPlaylistsChanged();
  }
}

export async function reorderPlaylistTracks(
  playlistId: string,
  trackIds: string[],
): Promise<void> {
  await setPlaylistTracks(playlistId, trackIds);
}

export async function reorderGroupTracks(
  groupId: number,
  trackIds: string[],
): Promise<void> {
  await reorderGroupItems(groupId, 'track', trackIds);
}

export async function replaceTrackInPlaylist(
  playlistId: string,
  oldTrackId: string,
  replacement: AudioTrack,
): Promise<void> {
  await upsertAudioTrack(replacement);
  const tracks = await getPlaylistTracks(playlistId);
  if (!tracks.some((track) => track.id === oldTrackId)) {
    throw new Error('原歌曲已不在当前列表中');
  }
  const nextIds = tracks.map((track) =>
    track.id === oldTrackId ? replacement.id : track.id,
  );
  await setPlaylistTracks(playlistId, nextIds);
}

export async function setPlaylistTracks(
  playlistId: string,
  trackIds: string[],
): Promise<void> {
  const groupId = await groupIdForPlaylist(playlistId);
  if (groupId == null) return;
  await setGroupItems(groupId, 'track', trackIds);
  if (isCuratedPlaylistId(playlistId) && trackIds.length > 0) {
    for (const trackId of trackIds) {
      await removeTrackFromPlaylist(BUILTIN_PLAYLIST_IDS.TRIAL, trackId);
    }
  }
}

export async function listPlaylistItems(): Promise<
  Array<{ playlistId: string; trackId: string; order: number }>
> {
  const groups = await getMusicGroups();
  const result: Array<{ playlistId: string; trackId: string; order: number }> = [];
  for (const g of groups) {
    if (!g.listId) continue;
    const items = await getGroupItemIds(g.groupId, 'track');
    for (const item of items) {
      result.push({ playlistId: g.listId, trackId: item.itemId, order: item.sortOrder });
    }
  }
  return result;
}

/** 用户可排序歌单（`pl_` 前缀） */
export async function listUserMusicPlaylists(): Promise<
  Array<{ groupId: number; listId: string; name: string; order: number }>
> {
  const groups = await getMusicGroups();
  return groups
    .filter((g) => !!g.listId?.startsWith('pl_'))
    .map((g) => ({
      groupId: g.groupId,
      listId: g.listId!,
      name: g.groupName,
      order: g.order,
    }))
    .sort((a, b) => a.order - b.order || a.groupId - b.groupId);
}

/** 按给定顺序重排用户歌单（编号从 0 起） */
export async function reorderUserMusicPlaylists(orderedGroupIds: number[]): Promise<void> {
  const { updateGroupsOrder } = await import('@/lib/database/media-groups');
  await updateGroupsOrder(orderedGroupIds.map((groupId, order) => ({ groupId, order })));
}

export async function createPlaylist(
  id: string,
  name: string,
  source: AudioPlaylist['source'] = 'local',
  options?: { position?: number },
): Promise<AudioPlaylist> {
  const now = Date.now();
  const pl: AudioPlaylist = {
    id,
    name,
    source,
    createdAt: now,
    updatedAt: now,
  };
  const groupId = await getNextMusicUserGroupId();
  const existing = await listUserMusicPlaylists();
  const pos =
    options?.position == null
      ? existing.length
      : Math.max(0, Math.min(Math.floor(options.position), existing.length));
  await insertMediaGroup({
    groupId,
    groupName: name,
    order: pos,
    enableRefresh: false,
    show: true,
    bookSort: -1,
    onlyUpdateRead: false,
    domain: 'music',
    listId: id,
    source,
  });
  const nextIds = [
    ...existing.slice(0, pos).map((g) => g.groupId),
    groupId,
    ...existing.slice(pos).map((g) => g.groupId),
  ];
  await reorderUserMusicPlaylists(nextIds);
  notifyMusicPlaylistsChanged();
  return pl;
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  if (
    playlistId === BUILTIN_PLAYLIST_IDS.DEFAULT ||
    playlistId === BUILTIN_PLAYLIST_IDS.TRIAL ||
    playlistId === BUILTIN_PLAYLIST_IDS.RECENT ||
    playlistId === BUILTIN_PLAYLIST_IDS.LOCAL ||
    playlistId === BUILTIN_PLAYLIST_IDS.LOVE
  ) {
    return;
  }
  const group = await getMusicGroupByListId(playlistId);
  if (group) {
    const db = await getDatabase();
    await db.execute(`DELETE FROM ${AudioTables.groupItems} WHERE group_id = ?`, [
      group.groupId,
    ]);
    const { deleteGroup } = await import('@/lib/database/media-groups');
    await deleteGroup(group.groupId);
  }
  notifyMusicPlaylistsChanged();
}

export async function renamePlaylist(playlistId: string, name: string): Promise<void> {
  const group = await getMusicGroupByListId(playlistId);
  if (group) {
    const { updateGroup } = await import('@/lib/database/media-groups');
    await updateGroup({ ...group, groupName: name });
  }
  notifyMusicPlaylistsChanged();
}

export async function removeTrackFromPlaylist(
  playlistId: string,
  trackId: string,
): Promise<void> {
  const groupId = await groupIdForPlaylist(playlistId);
  if (groupId == null) return;
  await removeGroupItem(groupId, 'track', trackId);
}

export async function cacheTrackUrl(
  trackId: string,
  url: string,
  ttlMs = 7 * 24 * 60 * 60 * 1000,
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO audio_url_cache (track_id, url, expires_at) VALUES (?, ?, ?)`,
    [trackId, url, Date.now() + ttlMs],
  );
}

export async function getCachedTrackUrl(trackId: string): Promise<string | null> {
  const db = await getDatabase();
  const rows = await db.select<{ url: string; expires_at: number }>(
    'SELECT url, expires_at FROM audio_url_cache WHERE track_id = ?',
    [trackId],
  );
  const row = rows[0];
  if (!row || row.expires_at < Date.now()) return null;
  return row.url;
}

export async function clearTrackUrlCache(trackId: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM audio_url_cache WHERE track_id = ?', [trackId]);
}

let recentPlayWriteQueue = Promise.resolve();

/** 写入最近播放（任意来源，去重，最新在前） */
export function recordRecentPlay(track: AudioTrack): Promise<void> {
  const persist = async () => {
    await withDatabaseBusyRetry(() => upsertAudioTrack(track));
    const groupId = await groupIdForPlaylist(BUILTIN_PLAYLIST_IDS.RECENT);
    if (groupId == null) return;
    const db = await getDatabase();
    await withDatabaseBusyRetry(() =>
      db.execute(
        `UPDATE ${AudioTables.groupItems}
         SET sort_order = sort_order + 1
         WHERE group_id = ? AND item_id <> ?`,
        [groupId, track.id],
      ),
    );
    await withDatabaseBusyRetry(() =>
      db.execute(
        `INSERT OR REPLACE INTO ${AudioTables.groupItems}
         (group_id, item_id, sort_order, created_at)
         VALUES (?, ?, 0, ?)`,
        [groupId, track.id, Date.now()],
      ),
    );
    await withDatabaseBusyRetry(() =>
      db.execute(
        `DELETE FROM ${AudioTables.groupItems}
         WHERE group_id = ? AND sort_order >= ?`,
        [groupId, RECENT_MAX],
      ),
    );
    await syncTrialListMembership(track);
    notifyMusicPlaylistsChanged();
  };
  const result = recentPlayWriteQueue.then(persist, persist);
  recentPlayWriteQueue = result.catch(() => undefined);
  return result;
}

export async function addTrackToLove(trackId: string): Promise<void> {
  await addFavoriteTrack(trackId);
  await removeTrackFromPlaylist(BUILTIN_PLAYLIST_IDS.TRIAL, trackId);
  notifyMusicPlaylistsChanged();
}

export async function removeTrackFromLove(trackId: string): Promise<void> {
  await removeFavoriteTrack(trackId);
}

export async function isTrackInLove(trackId: string): Promise<boolean> {
  return isTrackFavorite(trackId);
}

export interface AudioDislikeRule {
  id: string;
  /** 匹配 name / artist / source 等 */
  pattern: string;
  field: 'name' | 'artist' | 'source' | 'any';
}

export async function listDislikeRules(): Promise<AudioDislikeRule[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM audio_dislike_rules ORDER BY created_at DESC',
  );
  return rows.map((row) => {
    try {
      const parsed = JSON.parse(String(row.rule_json ?? '{}')) as AudioDislikeRule;
      return { ...parsed, id: String(row.id) };
    } catch {
      return { id: String(row.id), pattern: '', field: 'any' as const };
    }
  });
}

export async function saveDislikeRule(rule: AudioDislikeRule): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO audio_dislike_rules (id, rule_json, created_at) VALUES (?, ?, ?)`,
    [rule.id, JSON.stringify(rule), Date.now()],
  );
}

export async function deleteDislikeRule(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM audio_dislike_rules WHERE id = ?', [id]);
}

export async function upsertAudioPlaylists(playlists: AudioPlaylist[]): Promise<void> {
  for (const pl of playlists) {
    const existing = await getMusicGroupByListId(pl.id);
    if (existing) {
      const { updateGroup } = await import('@/lib/database/media-groups');
      await updateGroup({
        ...existing,
        groupName: pl.name,
        source: pl.source,
        cover: pl.coverUrl ?? existing.cover,
        description: pl.description ?? existing.description,
      });
      continue;
    }
    const groupId = await getNextMusicUserGroupId();
    await insertMediaGroup({
      groupId,
      groupName: pl.name,
      order: 0,
      enableRefresh: false,
      show: true,
      bookSort: -1,
      onlyUpdateRead: false,
      domain: 'music',
      listId: pl.id,
      source: pl.source,
      cover: pl.coverUrl,
      description: pl.description,
    });
  }
  notifyMusicPlaylistsChanged();
}

export async function saveAuthSession(session: AudioAuthSession): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO audio_auth_sessions (platform, cookies, updated_at, healthy)
     VALUES (?, ?, ?, ?)`,
    [session.platform, session.cookies, session.updatedAt, session.healthy ? 1 : 0],
  );
}

export async function getAuthSession(platform: string): Promise<AudioAuthSession | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM audio_auth_sessions WHERE platform = ?',
    [platform],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    platform: String(row.platform),
    cookies: String(row.cookies),
    updatedAt: Number(row.updated_at),
    healthy: Number(row.healthy) === 1,
  };
}

export async function getSyncState(): Promise<AudioSyncState> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    "SELECT * FROM audio_sync_state WHERE id = 'default' LIMIT 1",
  );
  const row = rows[0];
  if (!row) {
    return {
      serverUrl: '',
      serverId: '',
      syncMode: 'merge_local_remote',
      lastSyncAt: 0,
      connected: false,
    };
  }
  return {
    serverUrl: String(row.server_url ?? ''),
    serverId: String(row.server_id ?? ''),
    syncMode: String(row.sync_mode ?? 'merge_local_remote'),
    lastSyncAt: Number(row.last_sync_at ?? 0),
    connected: Number(row.connected) === 1,
  };
}

export async function saveSyncState(state: AudioSyncState): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO audio_sync_state (id, server_url, server_id, sync_mode, last_sync_at, connected)
     VALUES ('default', ?, ?, ?, ?, ?)`,
    [
      state.serverUrl,
      state.serverId,
      state.syncMode,
      state.lastSyncAt,
      state.connected ? 1 : 0,
    ],
  );
}
