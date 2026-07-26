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
import type { HubBrowseSource } from '@/lib/media/audio/music-sdk/types';
import type { MusicSdkSource } from '@/lib/media/audio/music-sdk';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { browseMfSheetDetail, browseMfTopListDetail } from '@/lib/media/audio/online/mf-plugin/browse';
import { isMfSourceKey, parseMfPluginId, type MfSheetItem } from '@/lib/media/audio/online/mf-plugin/types';

export interface SourceListBinding {
  playlistId: string;
  source: HubBrowseSource;
  type: 'songlist' | 'leaderboard';
  sourceId: string;
  lastSyncAt?: number;
  /** 是否参与自动更新 */
  isAutoUpdate?: boolean;
  mfSheetItem?: MfSheetItem;
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

export function getSourceBinding(playlistId: string): SourceListBinding | undefined {
  return loadBindings().find((b) => b.playlistId === playlistId);
}

export function bindPlaylistToSource(binding: Omit<SourceListBinding, 'lastSyncAt'>): void {
  const list = loadBindings().filter((b) => b.playlistId !== binding.playlistId);
  list.push({ ...binding, lastSyncAt: Date.now(), isAutoUpdate: binding.isAutoUpdate ?? true });
  saveBindings(list);
}

export function setBindingAutoUpdate(playlistId: string, isAutoUpdate: boolean): void {
  saveBindings(
    loadBindings().map((b) => (b.playlistId === playlistId ? { ...b, isAutoUpdate } : b)),
  );
}

export function removeSourceBinding(playlistId: string): void {
  saveBindings(loadBindings().filter((b) => b.playlistId !== playlistId));
}

export async function syncSourceList(playlistId: string): Promise<AudioTrack[]> {
  const binding = loadBindings().find((b) => b.playlistId === playlistId);
  if (!binding) return getPlaylistTracks(playlistId);

  let tracks: AudioTrack[] = [];
  if (binding.type === 'songlist') {
    if (isMfSourceKey(String(binding.source))) {
      const pluginId = parseMfPluginId(String(binding.source));
      if (pluginId) {
        const sheet =
          binding.mfSheetItem ??
          ({ id: binding.sourceId, platform: pluginId } as MfSheetItem);
        const result = await browseMfSheetDetail(pluginId, sheet, 1);
        tracks = result.tracks;
      }
    } else {
      const detail = await getSongListDetail(binding.source as MusicSdkSource, binding.sourceId);
      tracks = detail.tracks;
    }
  } else if (isMfSourceKey(String(binding.source))) {
    const pluginId = parseMfPluginId(String(binding.source));
    if (pluginId) {
      const sheet =
        binding.mfSheetItem ??
        ({ id: binding.sourceId, platform: pluginId } as MfSheetItem);
      const result = await browseMfTopListDetail(pluginId, sheet, 1);
      tracks = result.tracks;
    }
  } else {
    const detail = await browseLeaderboard(binding.source as MusicSdkSource, binding.sourceId);
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

export async function syncAllBoundLists(options?: { onlyAuto?: boolean }): Promise<void> {
  for (const binding of loadBindings()) {
    if (options?.onlyAuto && binding.isAutoUpdate === false) continue;
    try {
      await syncSourceList(binding.playlistId);
    } catch {
      /* skip */
    }
  }
}
