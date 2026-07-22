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
const BASE_SNAPSHOT_KEY = 'reader_audio_library_sync_base_v1';

function loadBaseSnapshot(): AudioLibrarySnapshot | null {
  try {
    const raw = localStorage.getItem(BASE_SNAPSHOT_KEY);
    if (!raw) return null;
    return parseSnapshot(raw);
  } catch {
    return null;
  }
}

function saveBaseSnapshot(snapshot: AudioLibrarySnapshot): void {
  try {
    localStorage.setItem(BASE_SNAPSHOT_KEY, serializeSnapshot(snapshot));
  } catch {
    // ignore
  }
}

function trackStamp(t: AudioTrack): number {
  const meta = t.meta as Record<string, unknown>;
  const u = meta.updatedAt;
  if (typeof u === 'number' && Number.isFinite(u)) return u;
  return 0;
}

function trackSig(t: AudioTrack): string {
  return JSON.stringify({
    name: t.name,
    artist: t.artist,
    duration: t.duration,
    source: t.source,
    meta: t.meta,
  });
}

/** 三路合并：base / local / remote；两侧同改时取较新 stamp，平手取 remote */
function threeWayMergeTracks(
  base: AudioTrack[] | undefined,
  local: AudioTrack[],
  remote: AudioTrack[],
): AudioTrack[] {
  const baseMap = new Map((base ?? []).map((t) => [t.id, t]));
  const localMap = new Map(local.map((t) => [t.id, t]));
  const remoteMap = new Map(remote.map((t) => [t.id, t]));
  const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  const out: AudioTrack[] = [];
  for (const id of ids) {
    const b = baseMap.get(id);
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    if (l && r) {
      const lChanged = !b || trackSig(l) !== trackSig(b);
      const rChanged = !b || trackSig(r) !== trackSig(b);
      if (lChanged && rChanged) {
        out.push(trackStamp(r) >= trackStamp(l) ? r : l);
      } else if (rChanged) out.push(r);
      else out.push(l);
    } else if (l && !r) {
      // 远程删除：若本地相对 base 未改，则删；否则保留本地
      if (b && trackSig(l) === trackSig(b)) continue;
      out.push(l);
    } else if (!l && r) {
      out.push(r);
    }
  }
  return out;
}

function threeWayMergePlaylists(
  base: AudioPlaylist[] | undefined,
  local: AudioPlaylist[],
  remote: AudioPlaylist[],
): AudioPlaylist[] {
  const baseMap = new Map((base ?? []).map((p) => [p.id, p]));
  const localMap = new Map(local.map((p) => [p.id, p]));
  const remoteMap = new Map(remote.map((p) => [p.id, p]));
  const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  const out: AudioPlaylist[] = [];
  for (const id of ids) {
    const b = baseMap.get(id);
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    if (l && r) {
      const lChanged = !b || l.updatedAt !== b.updatedAt || l.name !== b.name;
      const rChanged = !b || r.updatedAt !== b.updatedAt || r.name !== b.name;
      if (lChanged && rChanged) out.push(r.updatedAt >= l.updatedAt ? r : l);
      else if (rChanged) out.push(r);
      else out.push(l);
    } else if (l && !r) {
      if (b && l.updatedAt === b.updatedAt && l.name === b.name) continue;
      out.push(l);
    } else if (!l && r) {
      out.push(r);
    }
  }
  return out;
}

function mergePlaylistItemsThreeWay(
  base: AudioLibrarySnapshot['playlistItems'],
  local: AudioLibrarySnapshot['playlistItems'],
  remote: AudioLibrarySnapshot['playlistItems'],
  playlists: AudioPlaylist[],
): Map<string, string[]> {
  const plIds = new Set(playlists.map((p) => p.id));
  const baseMap = buildPlaylistTrackMap({
    version: 1,
    exportedAt: 0,
    playlists: [],
    tracks: [],
    playlistItems: base,
  });
  const localMap = buildPlaylistTrackMap({
    version: 1,
    exportedAt: 0,
    playlists: [],
    tracks: [],
    playlistItems: local,
  });
  const remoteMap = buildPlaylistTrackMap({
    version: 1,
    exportedAt: 0,
    playlists: [],
    tracks: [],
    playlistItems: remote,
  });
  const result = new Map<string, string[]>();
  for (const id of plIds) {
    const b = JSON.stringify(baseMap.get(id) ?? []);
    const l = localMap.get(id) ?? [];
    const r = remoteMap.get(id) ?? [];
    const lChanged = JSON.stringify(l) !== b;
    const rChanged = JSON.stringify(r) !== b;
    if (lChanged && rChanged) {
      // 冲突：并集保序（remote 优先）
      const seen = new Set<string>();
      const merged: string[] = [];
      for (const tid of [...r, ...l]) {
        if (seen.has(tid)) continue;
        seen.add(tid);
        merged.push(tid);
      }
      result.set(id, merged);
    } else if (rChanged) result.set(id, r);
    else result.set(id, l);
  }
  return result;
}

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
  let mergedPlaylistTrackMap: Map<string, string[]> | null = null;
  if (merge) {
    const local = await exportAudioLibrarySnapshot();
    const base = loadBaseSnapshot();
    const tracks = threeWayMergeTracks(base?.tracks, local.tracks, snapshot.tracks);
    const playlists = threeWayMergePlaylists(
      base?.playlists,
      local.playlists,
      snapshot.playlists,
    );
    await upsertAudioTracks(tracks);
    await upsertAudioPlaylists(playlists);
    mergedPlaylistTrackMap = mergePlaylistItemsThreeWay(
      base?.playlistItems,
      local.playlistItems,
      snapshot.playlistItems,
      playlists,
    );
  } else {
    await upsertAudioTracks(snapshot.tracks);
    await upsertAudioPlaylists(snapshot.playlists);
  }

  const trackMapByPlaylist =
    mergedPlaylistTrackMap ?? buildPlaylistTrackMap(snapshot);
  const playlistsForItems = merge
    ? [...trackMapByPlaylist.keys()]
    : snapshot.playlists.map((p) => p.id);
  for (const plId of playlistsForItems) {
    const pl = snapshot.playlists.find((p) => p.id === plId);
    if (pl?.source === 'builtin') continue;
    const trackIds = trackMapByPlaylist.get(plId);
    if (trackIds && trackIds.length > 0) {
      await setPlaylistTracks(plId, trackIds);
    }
  }

  // 合并后写 base，供下次三路
  const nextBase = await exportAudioLibrarySnapshot();
  saveBaseSnapshot(nextBase);
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
  saveBaseSnapshot(snap);
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
  saveBaseSnapshot(snap);
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

type SyncTarget = 'webdav' | 'github';

const debounceTimers: Partial<Record<SyncTarget, ReturnType<typeof setTimeout>>> = {};
const debounceWaiters: Partial<
  Record<SyncTarget, Array<{ resolve: () => void; reject: (e: unknown) => void }>>
> = {};

/** 防抖自动三路合并（默认 2.5s） */
export function scheduleDebouncedLibrarySync(
  target: SyncTarget,
  delayMs = 2500,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const list = debounceWaiters[target] ?? [];
    list.push({ resolve, reject });
    debounceWaiters[target] = list;
    if (debounceTimers[target]) clearTimeout(debounceTimers[target]);
    debounceTimers[target] = setTimeout(() => {
      debounceTimers[target] = undefined;
      const waiters = debounceWaiters[target] ?? [];
      debounceWaiters[target] = [];
      const run =
        target === 'webdav'
          ? syncAudioLibraryViaWebDav('merge')
          : syncAudioLibraryViaGithub('merge');
      void run.then(
        () => waiters.forEach((w) => w.resolve()),
        (e) => waiters.forEach((w) => w.reject(e)),
      );
    }, delayMs);
  });
}
