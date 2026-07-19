/**
 * 音乐播放会话态 DAO（SQLite）
 */

import { getDatabase } from '@/lib/database/database-core';
import { AudioTables } from '@/lib/database/table-names';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import type { AudioPlayMode } from '@/lib/media/audio/types';
import type { MusicPlayerListKind } from '@/stores/viewer/base-state';

export interface MusicPlaybackRow {
  listId: string | null;
  trackIndex: number;
  position: number;
  maxTime: number;
  playerListName: string | null;
  playerListKind: MusicPlayerListKind | null;
  playMode: AudioPlayMode | null;
  tracks: AudioTrack[];
  updatedAt: number;
}

function parseTracks(raw: string): AudioTrack[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t) => t && typeof t === 'object' && typeof (t as AudioTrack).id === 'string',
    ) as AudioTrack[];
  } catch {
    return [];
  }
}

export async function loadMusicPlaybackState(): Promise<MusicPlaybackRow | null> {
  const db = await getDatabase();
    const rows = (await db.select(
    `SELECT list_id, track_index, position, max_time, player_list_name, player_list_kind, play_mode, tracks_json, updated_at
     FROM ${AudioTables.playbackState} WHERE id = 1 LIMIT 1`,
  )) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return null;
  return {
    listId: row.list_id != null ? String(row.list_id) : null,
    trackIndex: Number(row.track_index ?? 0),
    position: Number(row.position ?? 0),
    maxTime: Number(row.max_time ?? 0),
    playerListName: row.player_list_name != null ? String(row.player_list_name) : null,
    playerListKind: (row.player_list_kind as MusicPlayerListKind) ?? null,
    playMode: (row.play_mode as AudioPlayMode) ?? null,
    tracks: parseTracks(String(row.tracks_json ?? '[]')),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

export async function saveMusicPlaybackState(state: {
  listId: string | null;
  trackIndex: number;
  position: number;
  maxTime: number;
  playerListName: string | null;
  playerListKind: MusicPlayerListKind | null;
  playMode: AudioPlayMode | null;
  tracks: AudioTrack[];
}): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.execute(
    `INSERT INTO ${AudioTables.playbackState} (
      id, list_id, track_index, position, max_time, player_list_name, player_list_kind, play_mode, tracks_json, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      list_id = excluded.list_id,
      track_index = excluded.track_index,
      position = excluded.position,
      max_time = excluded.max_time,
      player_list_name = excluded.player_list_name,
      player_list_kind = excluded.player_list_kind,
      play_mode = excluded.play_mode,
      tracks_json = excluded.tracks_json,
      updated_at = excluded.updated_at`,
    [
      state.listId,
      state.trackIndex,
      state.position,
      state.maxTime,
      state.playerListName,
      state.playerListKind,
      state.playMode,
      JSON.stringify(state.tracks),
      now,
    ],
  );
}
