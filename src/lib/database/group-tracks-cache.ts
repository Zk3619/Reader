/**
 * 歌单曲目内存缓存：切换列表时命中，避免重复 SQL。
 * 用 generation / epoch 防止在途查询把已失效或已重排的结果写回。
 */

import { createStore } from 'solid-js/store';
import type { AudioTrack } from '@/lib/media/audio/track-types';

const groupTracksCache = new Map<number, AudioTrack[]>();
const generationByGroup = new Map<number, number>();
let cacheEpoch = 0;

const [groupTracksCacheState, setGroupTracksCacheState] = createStore({ revision: 0 });

function bumpGroupTracksCacheRevision(): void {
  setGroupTracksCacheState('revision', (value) => value + 1);
}

function bumpGroupGeneration(groupId: number): void {
  generationByGroup.set(groupId, (generationByGroup.get(groupId) ?? 0) + 1);
}

/** 订阅缓存变更（如工具栏「播放全部」禁用态） */
export function getGroupTracksCacheRevision(): number {
  return groupTracksCacheState.revision;
}

export function peekGroupTracksCache(groupId: number): AudioTrack[] | undefined {
  return groupTracksCache.get(groupId);
}

export function setGroupTracksCache(groupId: number, tracks: AudioTrack[]): void {
  groupTracksCache.set(groupId, tracks);
  bumpGroupGeneration(groupId);
  bumpGroupTracksCacheRevision();
}

export function invalidateGroupTracksCache(groupId?: number): void {
  if (groupId == null) {
    groupTracksCache.clear();
    generationByGroup.clear();
    cacheEpoch += 1;
  } else {
    groupTracksCache.delete(groupId);
    bumpGroupGeneration(groupId);
  }
  bumpGroupTracksCacheRevision();
}

/** 将曲目置顶；无缓存则仅失效该 group，避免脏数据 */
export function prependTrackInGroupTracksCache(
  groupId: number,
  track: AudioTrack,
  maxItems: number,
): void {
  const prev = groupTracksCache.get(groupId);
  if (!prev) {
    invalidateGroupTracksCache(groupId);
    return;
  }
  const next = [track, ...prev.filter((item) => item.id !== track.id)].slice(
    0,
    Math.max(0, maxItems),
  );
  setGroupTracksCache(groupId, next);
}

/** 从缓存移除曲目；无缓存则仅失效该 group */
export function removeTrackFromGroupTracksCache(groupId: number, trackId: string): void {
  const prev = groupTracksCache.get(groupId);
  if (!prev) {
    invalidateGroupTracksCache(groupId);
    return;
  }
  if (!prev.some((item) => item.id === trackId)) return;
  setGroupTracksCache(
    groupId,
    prev.filter((item) => item.id !== trackId),
  );
}

/**
 * 缓存未命中时查询；若期间被 invalidate / set 打断，丢弃在途结果并重试或改用新缓存。
 */
export async function loadGroupTracksThroughCache(
  groupId: number,
  query: () => Promise<AudioTrack[]>,
): Promise<AudioTrack[]> {
  const cached = groupTracksCache.get(groupId);
  if (cached) return cached;

  const startedGeneration = generationByGroup.get(groupId) ?? 0;
  const startedEpoch = cacheEpoch;
  const tracks = await query();

  if (cacheEpoch !== startedEpoch) {
    const again = groupTracksCache.get(groupId);
    if (again) return again;
    return loadGroupTracksThroughCache(groupId, query);
  }

  if ((generationByGroup.get(groupId) ?? 0) !== startedGeneration) {
    const again = groupTracksCache.get(groupId);
    if (again) return again;
    return loadGroupTracksThroughCache(groupId, query);
  }

  groupTracksCache.set(groupId, tracks);
  bumpGroupTracksCacheRevision();
  return tracks;
}

/** 测试用：清空缓存与代数 */
export function resetGroupTracksCacheForTests(): void {
  groupTracksCache.clear();
  generationByGroup.clear();
  cacheEpoch += 1;
  bumpGroupTracksCacheRevision();
}
