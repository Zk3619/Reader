/**
 * LX sync list/dislike action → 本地 DB 映射（13+3 action）
 */

import {
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylistTracks,
  removeTrackFromPlaylist,
  renamePlaylist,
  saveDislikeRule,
  deleteDislikeRule,
  setPlaylistTracks,
  upsertAudioTrack,
  upsertAudioTracks,
  listDislikeRules,
} from '@/lib/database/audio-library';
import { invalidateDislikeRulesCache } from '@/lib/media/audio/library/dislike-filter';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { buildTrackId } from '@/lib/media/audio/track-types';
import {
  getLocalLxListData,
  setLocalLxListData,
  type LxMusicInfo,
} from '@/lib/media/audio/sync/list-sync-data';

function lxMusicToTrack(info: LxMusicInfo): AudioTrack {
  const source = String(info.source ?? 'kw');
  return {
    id: buildTrackId(source, info.id),
    name: info.name ?? '',
    artist: info.singer ?? '',
    source,
    duration: info.interval ?? '00:00',
    meta: { songId: info.id, ...(info.meta ?? {}) },
  };
}

export async function handleLxListAction(action: string, data: unknown): Promise<void> {
  const payload = data as Record<string, unknown>;
  switch (action) {
    case 'list_data_overwrite': {
      await setLocalLxListData(payload as Parameters<typeof setLocalLxListData>[0]);
      break;
    }
    case 'list_create': {
      const listInfos = (payload.listInfos ?? []) as Array<{ id: string; name: string }>;
      for (const info of listInfos) {
        await createPlaylist(info.id, info.name, 'sync');
      }
      break;
    }
    case 'list_remove': {
      const ids = (payload.ids ?? []) as string[];
      for (const id of ids) await deletePlaylist(id);
      break;
    }
    case 'list_update': {
      const listInfos = (payload.listInfos ?? []) as Array<{ id: string; name: string }>;
      for (const info of listInfos) {
        await renamePlaylist(info.id, info.name);
      }
      break;
    }
    case 'list_music_add': {
      const listId = String(payload.id ?? '');
      const musicInfos = (payload.musicInfos ?? []) as LxMusicInfo[];
      const tracks = musicInfos.map(lxMusicToTrack);
      await upsertAudioTracks(tracks);
      for (const t of tracks) await addTrackToPlaylist(listId, t.id);
      break;
    }
    case 'list_music_remove': {
      const listId = String(payload.id ?? '');
      const ids = (payload.ids ?? []) as string[];
      for (const rawId of ids) {
        const trackId = rawId.includes('__') ? rawId : buildTrackId('kw', rawId);
        await removeTrackFromPlaylist(listId, trackId);
      }
      break;
    }
    case 'list_music_overwrite': {
      const listId = String(payload.id ?? '');
      const musicInfos = (payload.musicInfos ?? []) as LxMusicInfo[];
      const tracks = musicInfos.map(lxMusicToTrack);
      await upsertAudioTracks(tracks);
      await setPlaylistTracks(
        listId,
        tracks.map((t) => t.id),
      );
      break;
    }
    case 'list_music_clear': {
      const ids = (payload.ids ?? []) as string[];
      for (const listId of ids) await setPlaylistTracks(listId, []);
      break;
    }
    case 'list_music_update': {
      const musicInfos = (payload.musicInfos ?? []) as LxMusicInfo[];
      for (const info of musicInfos) await upsertAudioTrack(lxMusicToTrack(info));
      break;
    }
    case 'list_music_update_position': {
      const listId = String(payload.listId ?? payload.id ?? '');
      const ids = (payload.ids ?? []) as string[];
      const trackIds = ids.map((id) => (id.includes('__') ? id : buildTrackId('kw', id)));
      await setPlaylistTracks(listId, trackIds);
      break;
    }
    case 'list_update_position': {
      const ids = (payload.ids ?? []) as string[];
      const position = Number(payload.position ?? 0);
      const playlists = await import('@/lib/database/audio-library').then((m) => m.listPlaylists());
      const ordered = (await playlists).filter((p) => p.source !== 'builtin' || ids.includes(p.id));
      const idSet = new Set(ids);
      const rest = ordered.filter((p) => !idSet.has(p.id));
      const moved = ids.map((id) => ordered.find((p) => p.id === id)).filter(Boolean);
      const reordered = [...rest.slice(0, position), ...moved, ...rest.slice(position)] as typeof ordered;
      for (let i = 0; i < reordered.length; i++) {
        await renamePlaylist(reordered[i].id, reordered[i].name);
      }
      break;
    }
    case 'list_music_move': {
      const fromId = String(payload.fromId ?? '');
      const toId = String(payload.toId ?? '');
      const musicInfos = (payload.musicInfos ?? []) as LxMusicInfo[];
      const tracks = musicInfos.map(lxMusicToTrack);
      await upsertAudioTracks(tracks);
      for (const t of tracks) await removeTrackFromPlaylist(fromId, t.id);
      for (const t of tracks) await addTrackToPlaylist(toId, t.id);
      break;
    }
    default:
      break;
  }
}

export async function handleLxDislikeAction(action: string, data: unknown): Promise<void> {
  const payload = data as Record<string, unknown>;
  if (action === 'dislike_add') {
    const rules = (payload.rules ?? []) as Array<{ id: string; pattern: string; field: string }>;
    for (const r of rules) {
      await saveDislikeRule({
        id: r.id,
        pattern: r.pattern,
        field: (r.field as 'name' | 'artist' | 'source' | 'any') ?? 'any',
      });
    }
    invalidateDislikeRulesCache();
  } else if (action === 'dislike_remove') {
    const ids = (payload.ids ?? []) as string[];
    for (const id of ids) await deleteDislikeRule(id);
    invalidateDislikeRulesCache();
  } else if (action === 'dislike_data_overwrite' || action === 'dislike_overwrite') {
    const rules = (payload.rules ?? []) as Array<{ id: string; pattern: string; field: string }>;
    const existing = await listDislikeRules();
    for (const r of existing) await deleteDislikeRule(r.id);
    for (const r of rules) {
      await saveDislikeRule({
        id: r.id,
        pattern: r.pattern,
        field: (r.field as 'name' | 'artist' | 'source' | 'any') ?? 'any',
      });
    }
    invalidateDislikeRulesCache();
  } else if (action === 'dislike_music_add') {
    const items = (payload.rules ?? payload.musicInfos ?? []) as Array<{ id: string; pattern?: string; field?: string; name?: string }>;
    for (const r of items) {
      await saveDislikeRule({
        id: r.id,
        pattern: r.pattern ?? r.name ?? '',
        field: (r.field as 'name' | 'artist' | 'source' | 'any') ?? 'any',
      });
    }
    invalidateDislikeRulesCache();
  } else if (action === 'dislike_music_clear') {
    const existing = await listDislikeRules();
    for (const r of existing) await deleteDislikeRule(r.id);
    invalidateDislikeRulesCache();
  }
}

/** 将本地歌单推送到 LX sync server */
export async function pushLocalPlaylistsToLx(
  lxSyncListAction: (action: string, data: Record<string, unknown>) => Promise<unknown>,
): Promise<void> {
  const data = await getLocalLxListData();
  await lxSyncListAction('list_data_overwrite', data);
}

/** 从 LX sync server 拉取歌单（v4 连接后数据已合并，此函数刷新本地缓存） */
export async function pullPlaylistsFromLx(): Promise<void> {
  await getLocalLxListData();
}

/** 推送本地歌单（v4 全量覆盖远端需重连并选 overwrite 模式；此处导出本地快照供手动同步） */
export async function pushLocalPlaylistsSnapshot(): Promise<LxMusicInfo[]> {
  const data = await getLocalLxListData();
  return [...data.defaultList, ...data.loveList, ...data.userList.flatMap((l) => l.list)];
}

export async function exportLocalPlaylistTrackIds(playlistId: string): Promise<string[]> {
  const tracks = await getPlaylistTracks(playlistId);
  return tracks.map((t) => t.id);
}
