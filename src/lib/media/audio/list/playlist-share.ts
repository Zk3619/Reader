/**
 * 用户歌单分享码 / 文件 / 地址导入导出（对齐 lx playListPart）
 */

import {
  addTracksToPlaylist,
  createPlaylist,
  getPlaylistTracks,
  listUserMusicPlaylists,
  setPlaylistTracks,
  upsertAudioTracks,
} from '@/lib/database/audio-library';
import { getMusicGroupByListId } from '@/lib/database/media-groups';
import type { AudioTrack } from '@/lib/media/audio/track-types';

export const PLAYLIST_SHARE_SCHEME = 'reader-music-list:';

export interface PlaylistSharePayload {
  v: 1;
  type: 'playListPart';
  id: string;
  name: string;
  tracks: AudioTrack[];
  /** 旧版分享码仅含 id */
  trackIds?: string[];
}

export function encodePlaylistShareCode(data: PlaylistSharePayload): string {
  const json = JSON.stringify({
    v: data.v,
    type: data.type,
    id: data.id,
    name: data.name,
    tracks: data.tracks,
    trackIds: data.tracks.map((t) => t.id),
  });
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodePlaylistShareCode(code: string): PlaylistSharePayload {
  const trimmed = code.trim();
  const raw = trimmed.startsWith(PLAYLIST_SHARE_SCHEME)
    ? trimmed.slice(PLAYLIST_SHARE_SCHEME.length)
    : trimmed;
  const json = decodeURIComponent(escape(atob(raw)));
  const data = JSON.parse(json) as Partial<PlaylistSharePayload> & {
    trackIds?: string[];
  };
  if (!data || typeof data !== 'object') throw new Error('invalid');
  const tracks = Array.isArray(data.tracks) ? (data.tracks as AudioTrack[]) : [];
  const trackIds =
    Array.isArray(data.trackIds) && data.trackIds.length > 0
      ? data.trackIds
      : tracks.map((t) => t.id);
  if (tracks.length === 0 && trackIds.length === 0) throw new Error('empty');
  return {
    v: 1,
    type: 'playListPart',
    id: typeof data.id === 'string' ? data.id : `pl_${Date.now()}`,
    name: typeof data.name === 'string' && data.name ? data.name : '导入歌单',
    tracks,
    trackIds,
  };
}

export function toPlaylistShareAddress(code: string): string {
  return `${PLAYLIST_SHARE_SCHEME}${code}`;
}

export async function buildPlaylistSharePayload(
  playlistId: string,
): Promise<PlaylistSharePayload | null> {
  const group = await getMusicGroupByListId(playlistId);
  if (!group?.listId) return null;
  const tracks = await getPlaylistTracks(playlistId);
  return {
    v: 1,
    type: 'playListPart',
    id: playlistId,
    name: group.groupName,
    tracks,
  };
}

export async function importPlaylistSharePayload(
  payload: PlaylistSharePayload,
  options?: { targetPlaylistId?: string; position?: number; merge?: boolean },
): Promise<{ playlistId: string; count: number }> {
  const tracks = payload.tracks.filter((t) => t && typeof t.id === 'string');
  const ids =
    tracks.length > 0
      ? tracks.map((t) => t.id)
      : (payload.trackIds ?? []).filter((id) => typeof id === 'string');
  if (ids.length === 0) throw new Error('empty');

  if (tracks.length > 0) await upsertAudioTracks(tracks);

  if (options?.targetPlaylistId) {
    if (options.merge) {
      const existing = await getPlaylistTracks(options.targetPlaylistId);
      await setPlaylistTracks(options.targetPlaylistId, [
        ...existing.map((t) => t.id),
        ...ids,
      ]);
    } else {
      await setPlaylistTracks(options.targetPlaylistId, ids);
    }
    return { playlistId: options.targetPlaylistId, count: ids.length };
  }

  const users = await listUserMusicPlaylists();
  const same = users.find((u) => u.listId === payload.id);
  const playlistId = same ? `pl_${Date.now()}` : payload.id.startsWith('pl_') ? payload.id : `pl_${Date.now()}`;
  await createPlaylist(playlistId, payload.name, 'local', {
    position: options?.position ?? users.length,
  });
  if (tracks.length > 0) {
    await addTracksToPlaylist(playlistId, tracks);
  } else {
    await setPlaylistTracks(playlistId, ids);
  }
  return { playlistId, count: ids.length };
}

export function downloadPlaylistShareFile(payload: PlaylistSharePayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reader_list_${payload.name || payload.id}_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parsePlaylistShareJson(text: string): PlaylistSharePayload {
  const data = JSON.parse(text) as
    | PlaylistSharePayload
    | { type?: string; data?: { id?: string; name?: string; list?: AudioTrack[]; tracks?: AudioTrack[] } };

  if (data && typeof data === 'object' && 'data' in data && data.data) {
    const inner = data.data;
    const tracks = inner.list ?? inner.tracks ?? [];
    return {
      v: 1,
      type: 'playListPart',
      id: inner.id || `pl_${Date.now()}`,
      name: inner.name || '导入歌单',
      tracks,
    };
  }

  if (data && typeof data === 'object' && Array.isArray((data as PlaylistSharePayload).tracks)) {
    const p = data as PlaylistSharePayload;
    return {
      v: 1,
      type: 'playListPart',
      id: p.id || `pl_${Date.now()}`,
      name: p.name || '导入歌单',
      tracks: p.tracks,
    };
  }

  throw new Error('unsupported');
}

export async function dedupePlaylistTracks(playlistId: string): Promise<number> {
  const tracks = await getPlaylistTracks(playlistId);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const t of tracks) {
    const key = `${t.name}|${t.artist}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(t.id);
  }
  await setPlaylistTracks(playlistId, unique);
  return unique.length;
}

export type PlaylistSortField = 'name' | 'artist' | 'album' | 'duration' | 'source';
export type PlaylistSortType = 'up' | 'down' | 'random';

function parseListedDurationMs(duration: string | undefined): number {
  if (!duration) return 0;
  const parts = duration.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  let sec = 0;
  let unit = 1;
  for (let i = parts.length - 1; i >= 0; i--) {
    sec += (parts[i] ?? 0) * unit;
    unit *= 60;
  }
  return sec * 1000;
}

function trackSortKey(track: AudioTrack, field: PlaylistSortField): string | number {
  switch (field) {
    case 'name':
      return track.name.toLocaleLowerCase();
    case 'artist':
      return track.artist.toLocaleLowerCase();
    case 'album':
      return String(track.meta.albumName ?? '').toLocaleLowerCase();
    case 'duration':
      return parseListedDurationMs(track.duration);
    case 'source':
      return String(track.source ?? '').toLocaleLowerCase();
  }
}

/** 对齐 lx sortListMusicInfo：按字段升/降序或随机打乱 */
export async function sortPlaylistTracks(
  playlistId: string,
  sortType: PlaylistSortType,
  sortField: PlaylistSortField | '',
): Promise<number> {
  const tracks = await getPlaylistTracks(playlistId);
  if (tracks.length <= 1) return tracks.length;

  let next: AudioTrack[];
  if (sortType === 'random') {
    next = [...tracks];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = next[i]!;
      next[i] = next[j]!;
      next[j] = tmp;
    }
  } else {
    if (!sortField) return tracks.length;
    const dir = sortType === 'up' ? 1 : -1;
    next = [...tracks].sort((a, b) => {
      const ka = trackSortKey(a, sortField);
      const kb = trackSortKey(b, sortField);
      if (typeof ka === 'number' && typeof kb === 'number') return (ka - kb) * dir;
      return String(ka).localeCompare(String(kb), 'zh-CN') * dir;
    });
  }

  await setPlaylistTracks(
    playlistId,
    next.map((t) => t.id),
  );
  return next.length;
}

/** 找出重复曲目（保留首次出现，后续为重复项），对齐 lx filterDuplicateMusic */
export async function findDuplicatePlaylistTracks(
  playlistId: string,
): Promise<Array<{ track: AudioTrack; index: number }>> {
  const tracks = await getPlaylistTracks(playlistId);
  const seen = new Set<string>();
  const duplicates: Array<{ track: AudioTrack; index: number }> = [];
  tracks.forEach((track, index) => {
    const key = `${track.name}|${track.artist}`;
    if (seen.has(key)) {
      duplicates.push({ track, index });
      return;
    }
    seen.add(key);
  });
  return duplicates;
}
