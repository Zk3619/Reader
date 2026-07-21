/**
 * LX Music `.lxmc` 歌单分片（gzip JSON）与 TXT/CSV 导出
 */

import { gzipSync, gunzipSync } from 'fflate';
import {
  getPlaylistTracks,
  listUserMusicPlaylists,
} from '@/lib/database/audio-library';
import { getMusicGroupByListId } from '@/lib/database/media-groups';
import {
  type PlaylistSharePayload,
  parsePlaylistShareJson,
} from '@/lib/media/audio/list/playlist-share';
import {
  buildTrackId,
  BUILTIN_PLAYLIST_IDS,
  type AudioTrack,
} from '@/lib/media/audio/track-types';

export type LxPlaylistPartFile = {
  type: 'playListPart' | 'playListPart_v2';
  data: {
    id?: string;
    name?: string;
    list?: unknown[];
    tracks?: unknown[];
    source?: string;
    sourceListId?: string;
  };
};

function utf8Bom(text: string): Uint8Array {
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(3 + body.length);
  out[0] = 0xef;
  out[1] = 0xbb;
  out[2] = 0xbf;
  out.set(body, 3);
  return out;
}

function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], {
    type: mime,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'list';
}

/** Reader AudioTrack → LX 风格曲目（便于 playListPart_v2 互通） */
export function audioTrackToLxMusicInfo(track: AudioTrack): Record<string, unknown> {
  return {
    id: track.id,
    name: track.name,
    singer: track.artist,
    source: track.source,
    interval: track.duration,
    meta: {
      ...track.meta,
      albumName: track.meta.albumName ?? '',
      songId: track.meta.songId ?? track.meta.songmid,
      picUrl: track.meta.coverUrl,
    },
  };
}

/** LX / 宽松对象 → Reader AudioTrack */
export function lxMusicInfoToAudioTrack(raw: unknown): AudioTrack | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const metaRaw =
    m.meta && typeof m.meta === 'object'
      ? (m.meta as Record<string, unknown>)
      : {};
  const source = String(m.source ?? metaRaw.source ?? 'local');
  const name = String(m.name ?? '').trim();
  if (!name) return null;
  const singer = String(m.singer ?? m.artist ?? '').trim();
  const songId = String(
    metaRaw.songId ?? metaRaw.songmid ?? m.songmid ?? m.songId ?? '',
  );
  const id =
    typeof m.id === 'string' && m.id
      ? m.id
      : buildTrackId(source, songId || `${name}_${singer}`);
  return {
    id,
    name,
    artist: singer,
    source,
    duration: String(m.interval ?? m.duration ?? metaRaw.interval ?? '00:00'),
    meta: {
      ...metaRaw,
      songId: songId || undefined,
      songmid: (metaRaw.songmid != null ? String(metaRaw.songmid) : songId) || undefined,
      albumName:
        metaRaw.albumName != null
          ? String(metaRaw.albumName)
          : m.albumName != null
            ? String(m.albumName)
            : undefined,
      coverUrl:
        metaRaw.coverUrl != null
          ? String(metaRaw.coverUrl)
          : metaRaw.picUrl != null
            ? String(metaRaw.picUrl)
            : m.img != null
              ? String(m.img)
              : undefined,
    },
  };
}

export function playlistShareToLxPart(
  payload: PlaylistSharePayload,
): LxPlaylistPartFile {
  return {
    type: 'playListPart_v2',
    data: {
      id: payload.id,
      name: payload.name,
      list: payload.tracks.map(audioTrackToLxMusicInfo),
    },
  };
}

export function encodeLxmcBytes(part: LxPlaylistPartFile): Uint8Array {
  const json = JSON.stringify(part);
  return gzipSync(new TextEncoder().encode(json));
}

function parseLxPlaylistPartText(text: string): PlaylistSharePayload | null {
  try {
    const parsed = JSON.parse(text) as LxPlaylistPartFile | PlaylistSharePayload;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('type' in parsed) ||
      (parsed.type !== 'playListPart' && parsed.type !== 'playListPart_v2') ||
      !('data' in parsed) ||
      !parsed.data
    ) {
      return null;
    }
    const inner = (parsed as LxPlaylistPartFile).data;
    const rawList = inner.list ?? inner.tracks ?? [];
    const tracks = rawList
      .map(lxMusicInfoToAudioTrack)
      .filter((t): t is AudioTrack => t != null);
    if (tracks.length === 0) return null;
    return {
      v: 1,
      type: 'playListPart',
      id: inner.id || `pl_${Date.now()}`,
      name: inner.name || '导入歌单',
      tracks,
    };
  } catch {
    return null;
  }
}

export function tryParseLxmcOrPlaylistJson(
  input: Uint8Array | string,
): PlaylistSharePayload {
  let text: string;
  if (typeof input === 'string') {
    text = input;
  } else if (input.length >= 2 && input[0] === 0x1f && input[1] === 0x8b) {
    // gzip magic 1f 8b
    text = new TextDecoder().decode(gunzipSync(input));
  } else {
    text = new TextDecoder().decode(input);
  }
  // 优先 LX 包装；失败再走 Reader 分享 JSON
  const lx = parseLxPlaylistPartText(text);
  if (lx) return lx;
  return parsePlaylistShareJson(text);
}

export function downloadPlaylistAsLxmc(payload: PlaylistSharePayload): void {
  const part = playlistShareToLxPart(payload);
  const bytes = encodeLxmcBytes(part);
  downloadBytes(
    bytes,
    `lx_list_part_${safeFileName(payload.name)}_${Date.now()}.lxmc`,
    'application/gzip',
  );
}

export type PlaylistExportBundle = {
  id: string;
  name: string;
  tracks: AudioTrack[];
};

export async function collectExportablePlaylists(): Promise<PlaylistExportBundle[]> {
  const builtins: Array<{ id: string; name: string }> = [
    { id: BUILTIN_PLAYLIST_IDS.DEFAULT, name: '播放列表' },
    { id: BUILTIN_PLAYLIST_IDS.LOVE, name: '我的收藏' },
    { id: BUILTIN_PLAYLIST_IDS.TRIAL, name: '试听列表' },
    { id: BUILTIN_PLAYLIST_IDS.RECENT, name: '最近播放' },
    { id: BUILTIN_PLAYLIST_IDS.LOCAL, name: '本地音乐' },
  ];
  const users = await listUserMusicPlaylists();
  const all = [
    ...builtins,
    ...users.map((u) => ({ id: u.listId, name: u.name })),
  ];
  const out: PlaylistExportBundle[] = [];
  for (const item of all) {
    const group = await getMusicGroupByListId(item.id);
    const tracks = await getPlaylistTracks(item.id);
    if (tracks.length === 0) continue;
    out.push({
      id: item.id,
      name: group?.groupName || item.name,
      tracks,
    });
  }
  return out;
}

function formatTxtLine(track: AudioTrack): string {
  const album = track.meta.albumName ? String(track.meta.albumName) : '';
  return `${track.name}  ${track.artist}  ${album}`.trimEnd();
}

function csvEscape(value: string): string {
  let str = value || '';
  str = str.replace(/"/g, '""');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    str = `"${str}"`;
  }
  return str;
}

function formatCsvLine(track: AudioTrack): string {
  const album = track.meta.albumName ? String(track.meta.albumName) : '';
  return `${csvEscape(track.name)},${csvEscape(track.artist)},${csvEscape(album)}`;
}

/** 合并导出全部列表为单个 TXT（UTF-8 BOM，对齐 LX） */
export function downloadPlaylistsAsTxt(
  lists: PlaylistExportBundle[],
  filename = `reader_list_all_${Date.now()}.txt`,
): void {
  const body = lists
    .map((l) => l.tracks.map(formatTxtLine).join('\n'))
    .join('\n\n');
  downloadBytes(utf8Bom(body), filename, 'text/plain;charset=utf-8');
}

/** 合并导出全部列表为单个 CSV（UTF-8 BOM） */
export function downloadPlaylistsAsCsv(
  lists: PlaylistExportBundle[],
  filename = `reader_list_all_${Date.now()}.csv`,
): void {
  const header = '歌曲名,歌手,专辑\n';
  const body = lists
    .map((l) => l.tracks.map(formatCsvLine).join('\n'))
    .join('\n');
  downloadBytes(utf8Bom(header + body), filename, 'text/csv;charset=utf-8');
}
