/**
 * Reader 歌单 ↔ LX Sync ListData 互转
 */

import {
  getPlaylistTracks,
  listDislikeRules,
  listPlaylists,
  saveDislikeRule,
  deleteDislikeRule,
  setPlaylistTracks,
  upsertAudioTracks,
  createPlaylist,
  deletePlaylist,
  renamePlaylist,
} from '@/lib/database/audio-library';
import { BUILTIN_PLAYLIST_IDS } from '@/lib/media/audio/track-types';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { buildTrackId } from '@/lib/media/audio/track-types';
import { md5Hex } from '@/lib/media/audio/sync/sync-crypto';

export type LxMusicInfo = {
  id: string;
  name: string;
  singer: string;
  source: string;
  interval?: string;
  meta?: Record<string, unknown>;
};

export type LxUserListInfo = {
  id: string;
  name: string;
  source?: string | null;
  sourceListId?: string | null;
  locationUpdateTime?: number;
  list: LxMusicInfo[];
};

export type LxListData = {
  defaultList: LxMusicInfo[];
  loveList: LxMusicInfo[];
  userList: LxUserListInfo[];
};

export type LxDislikeRules = string;

function trackToLxMusic(track: AudioTrack): LxMusicInfo {
  const songId = String(track.meta.songId ?? track.id.split('__').pop() ?? track.id);
  return {
    id: songId,
    name: track.name,
    singer: track.artist,
    source: track.source,
    interval: track.duration,
    meta: track.meta,
  };
}

function lxMusicToTrack(info: LxMusicInfo): AudioTrack {
  const source = String(info.source ?? 'kw');
  return {
    id: buildTrackId(source, String(info.id)),
    name: info.name ?? '',
    artist: info.singer ?? '',
    source,
    duration: info.interval ?? '00:00',
    meta: { songId: info.id, ...(info.meta ?? {}) },
  };
}

export async function getLocalLxListData(): Promise<LxListData> {
  const playlists = await listPlaylists();
  const data: LxListData = {
    defaultList: [],
    loveList: (await getPlaylistTracks(BUILTIN_PLAYLIST_IDS.LOVE)).map(trackToLxMusic),
    userList: [],
  };

  for (const pl of playlists) {
    const tracks = await getPlaylistTracks(pl.id);
    const musicList = tracks.map(trackToLxMusic);
    if (pl.id === BUILTIN_PLAYLIST_IDS.DEFAULT) {
      data.defaultList = musicList;
    } else if (pl.id === BUILTIN_PLAYLIST_IDS.LOVE) {
      data.loveList = musicList;
    } else if (pl.source !== 'builtin' || ![BUILTIN_PLAYLIST_IDS.RECENT, BUILTIN_PLAYLIST_IDS.LOCAL].includes(pl.id as 'recent' | 'local')) {
      data.userList.push({
        id: pl.id,
        name: pl.name,
        source: pl.source === 'remote' ? 'user' : null,
        sourceListId: null,
        locationUpdateTime: pl.updatedAt,
        list: musicList,
      });
    }
  }
  return data;
}

export function getLxListDataMd5(data: LxListData): string {
  return md5Hex(JSON.stringify(data));
}

export async function setLocalLxListData(data: LxListData): Promise<void> {
  const applyList = async (listId: string, name: string, musicList: LxMusicInfo[]) => {
    const playlists = await listPlaylists();
    if (
      listId !== BUILTIN_PLAYLIST_IDS.LOVE &&
      !playlists.some((p) => p.id === listId)
    ) {
      await createPlaylist(
        listId,
        name,
        listId === BUILTIN_PLAYLIST_IDS.DEFAULT ? 'builtin' : 'sync',
      );
    }
    const tracks = musicList.map(lxMusicToTrack);
    await upsertAudioTracks(tracks);
    await setPlaylistTracks(listId, tracks.map((t) => t.id));
  };

  await applyList(BUILTIN_PLAYLIST_IDS.DEFAULT, '试听列表', data.defaultList);
  await applyList(BUILTIN_PLAYLIST_IDS.LOVE, '我的收藏', data.loveList);

  const existing = await listPlaylists();
  const incomingIds = new Set(data.userList.map((l) => l.id));
  for (const pl of existing) {
    if (
      pl.source !== 'builtin' &&
      pl.id !== BUILTIN_PLAYLIST_IDS.DEFAULT &&
      pl.id !== BUILTIN_PLAYLIST_IDS.LOVE &&
      !incomingIds.has(pl.id)
    ) {
      await deletePlaylist(pl.id);
    }
  }

  for (const list of data.userList) {
    const playlists = await listPlaylists();
    if (!playlists.some((p) => p.id === list.id)) {
      await createPlaylist(list.id, list.name, 'sync');
    } else {
      await renamePlaylist(list.id, list.name);
    }
    const tracks = list.list.map(lxMusicToTrack);
    await upsertAudioTracks(tracks);
    await setPlaylistTracks(list.id, tracks.map((t) => t.id));
  }
}

export async function getLocalLxDislikeData(): Promise<LxDislikeRules> {
  const rules = await listDislikeRules();
  return JSON.stringify(rules);
}

export async function setLocalLxDislikeData(raw: LxDislikeRules): Promise<void> {
  let rules: Array<{ id: string; pattern: string; field: string }> = [];
  try {
    rules = JSON.parse(raw) as Array<{ id: string; pattern: string; field: string }>;
  } catch {
    return;
  }
  const existing = await listDislikeRules();
  for (const r of existing) await deleteDislikeRule(r.id);
  for (const r of rules) {
    await saveDislikeRule({
      id: r.id,
      pattern: r.pattern,
      field: (r.field as 'name' | 'artist' | 'source' | 'any') ?? 'any',
    });
  }
}

export function getLxDislikeMd5(data: LxDislikeRules): string {
  return md5Hex(data.trim());
}
