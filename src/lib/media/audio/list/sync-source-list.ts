/**
 * 源绑定列表自动更新（对标 lx syncSourceList）
 */

import { getMusicGroupByListId } from '@/lib/database/media-groups';
import {
  getPlaylistTracks,
  upsertAudioTracks,
  setPlaylistTracks,
} from '@/lib/database/audio-library';
import { browseLeaderboard, getSongListDetail } from '@/lib/media/audio/music-sdk';
import type { MusicSdkSource } from '@/lib/media/audio/music-sdk';
import type { AudioTrack } from '@/lib/media/audio/track-types';

export interface SourceListBinding {
  playlistId: string;
  source: MusicSdkSource;
  type: 'songlist' | 'leaderboard';
  sourceId: string;
  lastSyncAt?: number;
}

const BINDINGS_KEY = 'reader_music_source_bindings';

function loadBindings(): SourceListBinding[] {
  try {
    const raw = localStorage.getItem(BINDINGS_KEY);
    return raw ? (JSON.parse(raw) as SourceListBinding[]) : [];
  } catch {
    return [];
  }
}

function saveBindings(bindings: SourceListBinding[]): void {
  localStorage.setItem(BINDINGS_KEY, JSON.stringify(bindings));
}

export function listSourceBindings(): SourceListBinding[] {
  return loadBindings();
}

export function bindPlaylistToSource(binding: Omit<SourceListBinding, 'lastSyncAt'>): void {
  const list = loadBindings().filter((b) => b.playlistId !== binding.playlistId);
  list.push({ ...binding, lastSyncAt: Date.now() });
  saveBindings(list);
}

export async function syncSourceList(playlistId: string): Promise<AudioTrack[]> {
  const binding = loadBindings().find((b) => b.playlistId === playlistId);
  if (!binding) return getPlaylistTracks(playlistId);

  let tracks: AudioTrack[] = [];
  if (binding.type === 'songlist') {
    const detail = await getSongListDetail(binding.source, binding.sourceId);
    tracks = detail.tracks;
  } else {
    const detail = await browseLeaderboard(binding.source, binding.sourceId);
    tracks = detail.tracks;
  }

  const group = await getMusicGroupByListId(playlistId);
  if (group) {
    await upsertAudioTracks(tracks);
    await setPlaylistTracks(
      playlistId,
      tracks.map((t) => t.id),
    );
  }

  saveBindings(
    loadBindings().map((b) =>
      b.playlistId === playlistId ? { ...b, lastSyncAt: Date.now() } : b,
    ),
  );
  return tracks;
}

export async function syncAllBoundLists(): Promise<void> {
  for (const binding of loadBindings()) {
    try {
      await syncSourceList(binding.playlistId);
    } catch {
      /* skip */
    }
  }
}
