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
  setGroupItems,
  getNextMusicUserGroupId,
  insertGroup as insertMediaGroup,
} from '@/lib/database/media-groups';
import { MediaGroupId } from '@/types/book-group';
import type {
  AudioPlaylist,
  AudioTrack,
  AudioTrackMeta,
  AudioAuthSession,
  AudioSyncState,
} from '@/lib/media/audio/track-types';
import { BUILTIN_PLAYLIST_IDS } from '@/lib/media/audio/track-types';

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
}

export async function upsertAudioTracks(tracks: AudioTrack[]): Promise<void> {
  for (const track of tracks) {
    await upsertAudioTrack(track);
  }
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
  const rows = await db.select<Record<string, unknown>>(
    `SELECT t.* FROM audio_tracks t
     INNER JOIN media_group_items i ON i.item_id = t.id AND i.item_kind = 'track'
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

export async function addTrackToPlaylist(
  playlistId: string,
  trackId: string,
  order?: number,
): Promise<void> {
  const groupId = await groupIdForPlaylist(playlistId);
  if (groupId == null) return;
  await addGroupItem(groupId, 'track', trackId, order);
  const db = await getDatabase();
  await db.execute('UPDATE audio_playlists SET updated_at = ? WHERE id = ?', [
    Date.now(),
    playlistId,
  ]).catch(() => undefined);
}

export async function addTracksToPlaylist(
  playlistId: string,
  tracks: AudioTrack[],
): Promise<void> {
  await upsertAudioTracks(tracks);
  for (const track of tracks) {
    await addTrackToPlaylist(playlistId, track.id);
  }
}

export async function reorderPlaylistTracks(
  playlistId: string,
  trackIds: string[],
): Promise<void> {
  await setPlaylistTracks(playlistId, trackIds);
}

export async function setPlaylistTracks(
  playlistId: string,
  trackIds: string[],
): Promise<void> {
  const groupId = await groupIdForPlaylist(playlistId);
  if (groupId == null) return;
  await setGroupItems(groupId, 'track', trackIds);
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
  const db = await getDatabase();
  const now = Date.now();
  const pl: AudioPlaylist = {
    id,
    name,
    source,
    createdAt: now,
    updatedAt: now,
  };
  await db.execute(
    `INSERT OR IGNORE INTO audio_playlists (id, name, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [id, name, source, now, now],
  );
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
  return pl;
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  if (
    playlistId === BUILTIN_PLAYLIST_IDS.DEFAULT ||
    playlistId === BUILTIN_PLAYLIST_IDS.RECENT ||
    playlistId === BUILTIN_PLAYLIST_IDS.LOCAL ||
    playlistId === BUILTIN_PLAYLIST_IDS.LOVE
  ) {
    return;
  }
  const group = await getMusicGroupByListId(playlistId);
  const db = await getDatabase();
  if (group) {
    await db.execute('DELETE FROM media_group_items WHERE group_id = ? AND item_kind = ?', [
      group.groupId,
      'track',
    ]);
    const { deleteGroup } = await import('@/lib/database/media-groups');
    await deleteGroup(group.groupId);
  }
  await db.execute('DELETE FROM audio_playlists WHERE id = ?', [playlistId]);
}

export async function renamePlaylist(playlistId: string, name: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('UPDATE audio_playlists SET name = ?, updated_at = ? WHERE id = ?', [
    name,
    Date.now(),
    playlistId,
  ]);
  const group = await getMusicGroupByListId(playlistId);
  if (group) {
    const { updateGroup } = await import('@/lib/database/media-groups');
    await updateGroup({ ...group, groupName: name });
  }
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
  ttlMs = 30 * 60 * 1000,
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

const RECENT_MAX = 200;

/** 写入最近播放（去重，最新在前） */
export async function recordRecentPlay(trackId: string): Promise<void> {
  const groupId = await groupIdForPlaylist(BUILTIN_PLAYLIST_IDS.RECENT);
  if (groupId == null) return;
  const existing = await getGroupItemIds(groupId, 'track');
  const filtered = existing.filter((r) => r.itemId !== trackId);
  const ids = [trackId, ...filtered.map((r) => r.itemId)].slice(0, RECENT_MAX);
  await setPlaylistTracks(BUILTIN_PLAYLIST_IDS.RECENT, ids);
}

export async function addTrackToLove(trackId: string): Promise<void> {
  await addFavoriteTrack(trackId);
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
  const db = await getDatabase();
  for (const pl of playlists) {
    await db.execute(
      `INSERT INTO audio_playlists (id, name, source, description, cover_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, source=excluded.source, description=excluded.description,
         cover_url=excluded.cover_url, updated_at=excluded.updated_at`,
      [
        pl.id,
        pl.name,
        pl.source,
        pl.description ?? null,
        pl.coverUrl ?? null,
        pl.createdAt,
        pl.updatedAt,
      ],
    );
  }
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
