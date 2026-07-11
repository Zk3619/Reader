/**
 * 音乐本地列表搜索：在各歌单/收藏中匹配歌曲（输入时即时过滤，不发起网络请求）
 */

import { getTracksForGroupId } from '@/lib/database/audio-library';
import { getGroupById, getMusicGroups } from '@/lib/database/media-groups';
import { MediaGroupId } from '@/types/book-group';
import type { AudioTrack } from '@/lib/media/audio/track-types';

export interface LocalMusicSearchGroup {
  groupId: number;
  groupName: string;
  tracks: AudioTrack[];
}

export interface LocalMusicSearchCache {
  groups: Array<{ groupId: number; groupName: string }>;
  tracksByGroupId: Map<number, AudioTrack[]>;
}

function trackMatchesKeyword(track: AudioTrack, keyword: string): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return false;
  const album = String(track.meta.albumName ?? track.meta.album ?? '');
  const haystack = [track.name, track.artist, album].map((s) => s.toLowerCase());
  return haystack.some((s) => s.includes(q));
}

async function loadSearchableGroups() {
  const [favorite, music] = await Promise.all([
    getGroupById(MediaGroupId.Favorite),
    getMusicGroups(),
  ]);
  const lists = music.filter((g) => g.listId !== 'love');
  return favorite ? [favorite, ...lists] : lists;
}

let cache: LocalMusicSearchCache | null = null;
let cachePromise: Promise<LocalMusicSearchCache> | null = null;

async function buildCache(): Promise<LocalMusicSearchCache> {
  const groups = await loadSearchableGroups();
  const tracksByGroupId = new Map<number, AudioTrack[]>();
  await Promise.all(
    groups.map(async (group) => {
      tracksByGroupId.set(group.groupId, await getTracksForGroupId(group.groupId));
    }),
  );
  const next: LocalMusicSearchCache = {
    groups: groups.map((group) => ({
      groupId: group.groupId,
      groupName: group.groupName,
    })),
    tracksByGroupId,
  };
  cache = next;
  return next;
}

export function invalidateLocalMusicSearchCache(): void {
  cache = null;
  cachePromise = null;
}

export async function ensureLocalMusicSearchCache(): Promise<LocalMusicSearchCache> {
  if (cache) return cache;
  if (!cachePromise) {
    cachePromise = buildCache().finally(() => {
      cachePromise = null;
    });
  }
  return cachePromise;
}

export function filterLocalMusicLists(
  keyword: string,
  data: LocalMusicSearchCache,
): LocalMusicSearchGroup[] {
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const hits: LocalMusicSearchGroup[] = [];
  for (const group of data.groups) {
    const tracks = data.tracksByGroupId.get(group.groupId) ?? [];
    const matched = tracks.filter((track) => trackMatchesKeyword(track, trimmed));
    if (matched.length > 0) {
      hits.push({
        groupId: group.groupId,
        groupName: group.groupName,
        tracks: matched,
      });
    }
  }
  return hits;
}

export async function searchLocalMusicLists(keyword: string): Promise<LocalMusicSearchGroup[]> {
  const data = await ensureLocalMusicSearchCache();
  return filterLocalMusicLists(keyword, data);
}
