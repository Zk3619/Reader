/**
 * LX Sync 六种合并模式（对齐 lx-music-sync-server sync.ts）
 */

import type { LxListData, LxMusicInfo, LxUserListInfo } from '@/lib/media/audio/sync/list-sync-data';

export type LxSyncMode =
  | 'merge_local_remote'
  | 'merge_remote_local'
  | 'overwrite_local_remote'
  | 'overwrite_remote_local'
  | 'overwrite_local_remote_full'
  | 'overwrite_remote_local_full'
  | 'cancel';

type AddMusicLocation = 'top' | 'bottom';

function mergeMusicLists(
  source: LxMusicInfo[],
  target: LxMusicInfo[],
  addAt: AddMusicLocation = 'bottom',
): LxMusicInfo[] {
  const combined = addAt === 'top' ? [...target, ...source] : [...source, ...target];
  const map = new Map<string, LxMusicInfo>();
  const ids: string[] = [];
  const iter = addAt === 'top' ? [...combined].reverse() : combined;
  for (const item of iter) {
    const key = String(item.id);
    if (map.has(key)) continue;
    map.set(key, item);
    if (addAt === 'top') ids.unshift(key);
    else ids.push(key);
  }
  return ids.map((id) => map.get(id)!);
}

function userListMap(data: LxListData): Map<string, LxUserListInfo> {
  return new Map(data.userList.map((l) => [l.id, l]));
}

function mergeListData(
  source: LxListData,
  target: LxListData,
  addAt: AddMusicLocation = 'bottom',
): LxListData {
  const result: LxListData = {
    defaultList: mergeMusicLists(source.defaultList, target.defaultList, addAt),
    loveList: mergeMusicLists(source.loveList, target.loveList, addAt),
    userList: [...source.userList],
  };
  const sourceMap = userListMap(source);
  target.userList.forEach((list, index) => {
    const existing = sourceMap.get(list.id);
    if (existing) {
      existing.list = mergeMusicLists(existing.list, list.list, addAt);
      const targetTime = list.locationUpdateTime ?? 0;
      const sourceTime = existing.locationUpdateTime ?? 0;
      if (targetTime > sourceTime) {
        const idx = result.userList.findIndex((l) => l.id === list.id);
        if (idx >= 0) {
          const [moved] = result.userList.splice(idx, 1);
          moved.locationUpdateTime = targetTime;
          result.userList.splice(index, 0, moved);
        }
      }
    } else if (list.locationUpdateTime) {
      result.userList.splice(index, 0, { ...list });
    } else {
      result.userList.push({ ...list });
    }
  });
  return result;
}

function overwriteListData(source: LxListData, target: LxListData): LxListData {
  const result: LxListData = {
    defaultList: [...source.defaultList],
    loveList: [...source.loveList],
    userList: [...source.userList],
  };
  const sourceMap = userListMap(source);
  target.userList.forEach((list, index) => {
    if (sourceMap.has(list.id)) return;
    if (list.locationUpdateTime) result.userList.splice(index, 0, { ...list });
    else result.userList.push({ ...list });
  });
  return result;
}

export function mergeLxListData(
  mode: LxSyncMode,
  local: LxListData,
  remote: LxListData,
  addAt: AddMusicLocation = 'bottom',
): { data: LxListData; updateLocal: boolean; updateRemote: boolean } | null {
  if (mode === 'cancel') return null;
  switch (mode) {
    case 'merge_local_remote':
      return { data: mergeListData(local, remote, addAt), updateLocal: true, updateRemote: true };
    case 'merge_remote_local':
      return { data: mergeListData(remote, local, addAt), updateLocal: true, updateRemote: true };
    case 'overwrite_local_remote':
      return { data: overwriteListData(local, remote), updateLocal: true, updateRemote: true };
    case 'overwrite_remote_local':
      return { data: overwriteListData(remote, local), updateLocal: true, updateRemote: true };
    case 'overwrite_local_remote_full':
      return { data: local, updateLocal: false, updateRemote: true };
    case 'overwrite_remote_local_full':
      return { data: remote, updateLocal: true, updateRemote: false };
    default:
      return null;
  }
}

/** 服务端视角与客户端视角的模式对调 */
export const TRANS_SYNC_MODE: Record<LxSyncMode, LxSyncMode> = {
  merge_local_remote: 'merge_remote_local',
  merge_remote_local: 'merge_local_remote',
  overwrite_local_remote: 'overwrite_remote_local',
  overwrite_remote_local: 'overwrite_local_remote',
  overwrite_local_remote_full: 'overwrite_remote_local_full',
  overwrite_remote_local_full: 'overwrite_local_remote_full',
  cancel: 'cancel',
};
