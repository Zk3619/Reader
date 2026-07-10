/**
 * WebDAV / GitHub 音频库快照同步
 */

import type { AudioPlaylist, AudioTrack } from '@/lib/media/audio/track-types';
import {
  listPlaylists,
  listAudioTracks,
  listPlaylistItems,
  upsertAudioTracks,
  upsertAudioPlaylists,
  setPlaylistTracks,
} from '@/lib/database/audio-library';
import { WebDavClient } from '@/lib/remote-book/webdav-client';
import { buildRootWebDavUrl, loadWebDavConfig } from '@/lib/remote-book/webdav-config-storage';

export interface AudioLibrarySnapshot {
  version: 1;
  exportedAt: number;
  playlists: AudioPlaylist[];
  tracks: AudioTrack[];
  playlistItems?: Array<{ playlistId: string; trackId: string; order: number }>;
}

const SNAPSHOT_PATH = 'music/sync/audio_library_snapshot.json';
const GITHUB_SNAPSHOT_KEY = 'reader_audio_github_snapshot_url';

export function getGithubSnapshotUrl(): string {
  try {
    return localStorage.getItem(GITHUB_SNAPSHOT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setGithubSnapshotUrl(url: string): void {
  try {
    if (url.trim()) localStorage.setItem(GITHUB_SNAPSHOT_KEY, url.trim());
    else localStorage.removeItem(GITHUB_SNAPSHOT_KEY);
  } catch {
    // ignore
  }
}

export async function exportAudioLibrarySnapshot(): Promise<AudioLibrarySnapshot> {
  const [playlists, tracks, playlistItems] = await Promise.all([
    listPlaylists(),
    listAudioTracks(),
    listPlaylistItems(),
  ]);
  return {
    version: 1,
    exportedAt: Date.now(),
    playlists,
    tracks,
    playlistItems,
  };
}

export function serializeSnapshot(snapshot: AudioLibrarySnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export function parseSnapshot(json: string): AudioLibrarySnapshot {
  const data = JSON.parse(json) as AudioLibrarySnapshot;
  if (data.version !== 1) throw new Error('不支持的快照版本');
  return data;
}

function buildPlaylistTrackMap(
  snapshot: AudioLibrarySnapshot,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (snapshot.playlistItems?.length) {
    const grouped = new Map<string, Array<{ trackId: string; order: number }>>();
    for (const item of snapshot.playlistItems) {
      const list = grouped.get(item.playlistId) ?? [];
      list.push({ trackId: item.trackId, order: item.order });
      grouped.set(item.playlistId, list);
    }
    for (const [plId, items] of grouped) {
      map.set(
        plId,
        items.sort((a, b) => a.order - b.order).map((i) => i.trackId),
      );
    }
    return map;
  }
  return map;
}

export async function importAudioLibrarySnapshot(
  snapshot: AudioLibrarySnapshot,
  options?: { merge?: boolean },
): Promise<void> {
  const merge = options?.merge !== false;
  if (merge) {
    const local = await exportAudioLibrarySnapshot();
    const trackMap = new Map<string, AudioTrack>();
    for (const t of local.tracks) trackMap.set(t.id, t);
    for (const t of snapshot.tracks) {
      const prev = trackMap.get(t.id);
      if (!prev || (t.meta && JSON.stringify(t.meta) > JSON.stringify(prev.meta))) {
        trackMap.set(t.id, t);
      }
    }
    await upsertAudioTracks([...trackMap.values()]);
    const plMap = new Map<string, AudioPlaylist>();
    for (const p of local.playlists) plMap.set(p.id, p);
    for (const p of snapshot.playlists) {
      const prev = plMap.get(p.id);
      if (!prev || p.updatedAt >= prev.updatedAt) plMap.set(p.id, p);
    }
    await upsertAudioPlaylists([...plMap.values()]);
  } else {
    await upsertAudioTracks(snapshot.tracks);
    await upsertAudioPlaylists(snapshot.playlists);
  }

  const trackMapByPlaylist = buildPlaylistTrackMap(snapshot);
  for (const pl of snapshot.playlists) {
    if (pl.source === 'builtin') continue;
    const trackIds = trackMapByPlaylist.get(pl.id);
    if (trackIds && trackIds.length > 0) {
      await setPlaylistTracks(pl.id, trackIds);
    }
  }
}

export async function uploadSnapshotToWebDav(snapshot?: AudioLibrarySnapshot): Promise<void> {
  const config = await loadWebDavConfig();
  if (!config?.url) throw new Error('未配置 WebDAV');
  const snap = snapshot ?? (await exportAudioLibrarySnapshot());
  const client = new WebDavClient(
    buildRootWebDavUrl(config),
    config.username ?? '',
    config.password ?? '',
  );
  await client.ensureDirectories(['music', 'music/sync']);
  const enc = new TextEncoder().encode(serializeSnapshot(snap));
  await client.uploadFile(SNAPSHOT_PATH, enc);
}

export async function downloadSnapshotFromWebDav(): Promise<AudioLibrarySnapshot | null> {
  const config = await loadWebDavConfig();
  if (!config?.url) throw new Error('未配置 WebDAV');
  const client = new WebDavClient(
    buildRootWebDavUrl(config),
    config.username ?? '',
    config.password ?? '',
  );
  try {
    const buf = await client.downloadFile(SNAPSHOT_PATH);
    const text = new TextDecoder().decode(buf);
    return parseSnapshot(text);
  } catch {
    return null;
  }
}

export async function syncAudioLibraryViaWebDav(
  direction: 'upload' | 'download' | 'merge' = 'merge',
): Promise<void> {
  if (direction === 'upload') {
    await uploadSnapshotToWebDav();
    return;
  }
  const remote = await downloadSnapshotFromWebDav();
  if (!remote) throw new Error('WebDAV 上无快照');
  if (direction === 'download') {
    await importAudioLibrarySnapshot(remote, { merge: false });
    return;
  }
  await importAudioLibrarySnapshot(remote, { merge: true });
}

export async function uploadSnapshotToGithub(snapshot?: AudioLibrarySnapshot): Promise<void> {
  const url = getGithubSnapshotUrl();
  if (!url) throw new Error('未配置 GitHub 快照 URL');
  const snap = snapshot ?? (await exportAudioLibrarySnapshot());
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: serializeSnapshot(snap),
  });
  if (!res.ok) throw new Error(`GitHub 上传失败: ${res.status}`);
}

export async function downloadSnapshotFromGithub(): Promise<AudioLibrarySnapshot | null> {
  const url = getGithubSnapshotUrl();
  if (!url) throw new Error('未配置 GitHub 快照 URL');
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return parseSnapshot(await res.text());
  } catch {
    return null;
  }
}

export async function syncAudioLibraryViaGithub(
  direction: 'upload' | 'download' | 'merge' = 'merge',
): Promise<void> {
  if (direction === 'upload') {
    await uploadSnapshotToGithub();
    return;
  }
  const remote = await downloadSnapshotFromGithub();
  if (!remote) throw new Error('GitHub 上无快照');
  if (direction === 'download') {
    await importAudioLibrarySnapshot(remote, { merge: false });
    return;
  }
  await importAudioLibrarySnapshot(remote, { merge: true });
}
