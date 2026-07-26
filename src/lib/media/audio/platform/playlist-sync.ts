/**
 * 平台账号歌单 / 收藏夹 →「我的列表」自定义列表同步
 * UX 参考 Kazumi：登录后可选自动同步 + 手动同步按钮。
 */

import type { PlatformId } from '@/lib/media/audio/platform/auth/session';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import {
  createPlaylist,
  renamePlaylist,
  setPlaylistTracks,
  upsertAudioTracks,
} from '@/lib/database/audio-library';
import { getMusicGroupByListId } from '@/lib/database/media-groups';
import {
  getRecommendedPlaylists,
  getUserPlaylists,
  type NeteasePlaylistSummary,
} from '@/lib/media/audio/platform/api/netease';
import { loadNeteasePlaylistWithCache } from '@/lib/media/audio/platform/netease-playlist-cache';

export type PlatformSyncedListKind = 'playlist' | 'favorite';

export type PlatformRemoteListSummary = {
  id: string;
  name: string;
  trackCount?: number;
  /** 远端原始 id（网易歌单 id / B 站 media_id / YTM browseId） */
  remoteId: string;
};

export type PlatformPlaylistSyncResult = {
  platform: PlatformId;
  created: number;
  updated: number;
  failed: number;
  total: number;
  errors: string[];
};

const PLATFORM_LABEL: Record<PlatformId, string> = {
  netease: '网易云',
  bili: 'B站',
  ytm: 'YTM',
};

/** 稳定 listId，重复同步覆盖同名自定义列表而非新建 */
export function buildPlatformSyncedListId(platform: PlatformId, remoteId: string): string {
  const safe = String(remoteId)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return `pl_${platform}_${safe || 'unknown'}`;
}

const PLATFORM_SYNC_PREFIXES: PlatformId[] = ['netease', 'bili', 'ytm'];

/** 从「我的列表」id 还原平台同步来源（账号同步 / NeriPlayer 对齐落库） */
export function parsePlatformSyncedListId(
  listId: string,
): { platform: PlatformId; remoteId: string } | null {
  const id = String(listId ?? '').trim();
  for (const platform of PLATFORM_SYNC_PREFIXES) {
    const prefix = `pl_${platform}_`;
    if (!id.startsWith(prefix)) continue;
    const remoteId = id.slice(prefix.length);
    if (!remoteId || remoteId === 'unknown') return null;
    return { platform, remoteId };
  }
  return null;
}

export function getPlatformSyncedListDetailUrl(listId: string): string | null {
  const parsed = parsePlatformSyncedListId(listId);
  if (!parsed) return null;
  const { platform, remoteId } = parsed;
  if (platform === 'netease') {
    return `https://music.163.com/#/playlist?id=${encodeURIComponent(remoteId)}`;
  }
  if (platform === 'bili') {
    return `https://www.bilibili.com/medialist/detail/ml${encodeURIComponent(remoteId)}`;
  }
  // YTM browseId 常带 VL 前缀；详情页用 playlist list= 参数
  const listParam = remoteId.startsWith('VL') ? remoteId.slice(2) : remoteId;
  return `https://music.youtube.com/playlist?list=${encodeURIComponent(listParam)}`;
}

/**
 * 右键「更新」：按远端 id 重新拉取并覆盖曲目（保留本地列表名，不改显示名）
 */
export async function refreshPlatformSyncedList(
  listId: string,
): Promise<{ trackCount: number }> {
  const parsed = parsePlatformSyncedListId(listId);
  if (!parsed) throw new Error('不是平台账号同步列表');
  const group = await getMusicGroupByListId(listId);
  if (!group) throw new Error('本地列表不存在');
  const tracks = await loadPlatformListTracks(parsed.platform, parsed.remoteId);
  await upsertAudioTracks(tracks);
  await setPlaylistTracks(
    listId,
    tracks.map((t) => t.id),
  );
  const { MUSIC_PLAYLISTS_CHANGED_EVENT } = await import('@/lib/database/audio-library');
  window.dispatchEvent(
    new CustomEvent(MUSIC_PLAYLISTS_CHANGED_EVENT, {
      detail: { listsChanged: false },
    }),
  );
  return { trackCount: tracks.length };
}

export async function fetchNeteaseRecommendPlaylists(): Promise<NeteasePlaylistSummary[]> {
  return getRecommendedPlaylists(30);
}

export async function fetchPlatformRemoteLists(
  platform: PlatformId,
): Promise<{ title: string; items: PlatformRemoteListSummary[] }> {
  if (platform === 'netease') {
    const list = await getUserPlaylists(50);
    return {
      title: '我的歌单',
      items: list.map((pl) => ({
        id: pl.id,
        remoteId: pl.id,
        name: pl.name,
        trackCount: pl.trackCount,
      })),
    };
  }
  if (platform === 'bili') {
    const { listBiliFavoriteFolders } = await import('@/lib/media/audio/platform/api/bili');
    const folders = await listBiliFavoriteFolders();
    return {
      title: '我的收藏',
      items: folders.map((f) => ({
        id: f.id,
        remoteId: f.id,
        name: f.title,
        trackCount: f.mediaCount,
      })),
    };
  }
  const { listYtmLibraryPlaylists } = await import('@/lib/media/audio/platform/api/ytm');
  const list = await listYtmLibraryPlaylists();
  return {
    title: '曲库歌单',
    items: list.map((pl) => ({
      id: pl.browseId,
      remoteId: pl.browseId,
      name: pl.name,
      trackCount: pl.trackCount,
    })),
  };
}

export async function loadNeteasePlaylistTracks(playlistId: string): Promise<AudioTrack[]> {
  const tracks = await loadNeteasePlaylistWithCache(playlistId);
  await upsertAudioTracks(tracks);
  return tracks;
}

async function loadBiliFavoriteAllTracks(folderId: string): Promise<AudioTrack[]> {
  const { getBiliFavoriteTracks } = await import('@/lib/media/audio/platform/api/bili');
  const pageSize = 40;
  const all: AudioTrack[] = [];
  let page = 1;
  for (;;) {
    const { tracks, hasMore } = await getBiliFavoriteTracks(folderId, page, pageSize);
    all.push(...tracks);
    if (!hasMore || tracks.length === 0 || page >= 40) break;
    page += 1;
  }
  return all;
}

async function loadPlatformListTracks(
  platform: PlatformId,
  remoteId: string,
): Promise<AudioTrack[]> {
  if (platform === 'netease') {
    return loadNeteasePlaylistTracks(remoteId);
  }
  if (platform === 'bili') {
    const tracks = await loadBiliFavoriteAllTracks(remoteId);
    await upsertAudioTracks(tracks);
    return tracks;
  }
  const { getYtmPlaylistTracks } = await import('@/lib/media/audio/platform/api/ytm');
  const tracks = await getYtmPlaylistTracks(remoteId);
  await upsertAudioTracks(tracks);
  return tracks;
}

function displayListName(platform: PlatformId, remoteName: string): string {
  const name = remoteName.trim() || '未命名';
  const label = PLATFORM_LABEL[platform];
  // 已带平台前缀则不再重复
  if (name.startsWith(`[${label}]`)) return name;
  return `[${label}] ${name}`;
}

async function upsertSyncedLocalList(
  listId: string,
  name: string,
  tracks: AudioTrack[],
): Promise<'created' | 'updated'> {
  await upsertAudioTracks(tracks);
  const existing = await getMusicGroupByListId(listId);
  if (existing) {
    if (existing.groupName !== name) {
      await renamePlaylist(listId, name);
    }
    await setPlaylistTracks(
      listId,
      tracks.map((t) => t.id),
    );
    return 'updated';
  }
  // source=local：与「新建列表」一致，出现在 Hub「我的列表」侧栏（pl_*）
  await createPlaylist(listId, name, 'local');
  await setPlaylistTracks(
    listId,
    tracks.map((t) => t.id),
  );
  return 'created';
}

async function notifyMyListsChanged(): Promise<void> {
  const { MUSIC_PLAYLISTS_CHANGED_EVENT } = await import('@/lib/database/audio-library');
  window.dispatchEvent(new CustomEvent(MUSIC_PLAYLISTS_CHANGED_EVENT));
}

async function upsertOneRemoteList(
  platform: PlatformId,
  item: Pick<PlatformRemoteListSummary, 'remoteId' | 'name'>,
): Promise<{ listId: string; kind: 'created' | 'updated'; trackCount: number }> {
  const tracks = await loadPlatformListTracks(platform, item.remoteId);
  const listId = buildPlatformSyncedListId(platform, item.remoteId);
  const name = displayListName(platform, item.name);
  const kind = await upsertSyncedLocalList(listId, name, tracks);
  return { listId, kind, trackCount: tracks.length };
}

/** 同步单个远端歌单/收藏夹到「我的列表」 */
export async function syncPlatformPlaylistItemToMyList(
  platform: PlatformId,
  item: Pick<PlatformRemoteListSummary, 'remoteId' | 'name'>,
): Promise<{ listId: string; kind: 'created' | 'updated'; trackCount: number }> {
  const result = await upsertOneRemoteList(platform, item);
  await notifyMyListsChanged();
  return result;
}

/** 将当前平台远端歌单/收藏夹同步为「我的列表」自定义列表（同 id 覆盖） */
export async function syncPlatformPlaylistsToMyLists(
  platform: PlatformId,
  options?: { onProgress?: (done: number, total: number, name: string) => void },
): Promise<PlatformPlaylistSyncResult> {
  const { items } = await fetchPlatformRemoteLists(platform);
  const result: PlatformPlaylistSyncResult = {
    platform,
    created: 0,
    updated: 0,
    failed: 0,
    total: items.length,
    errors: [],
  };
  if (items.length === 0) return result;

  let done = 0;
  for (const item of items) {
    options?.onProgress?.(done, items.length, item.name);
    try {
      const { kind } = await upsertOneRemoteList(platform, item);
      if (kind === 'created') result.created += 1;
      else result.updated += 1;
    } catch (e) {
      result.failed += 1;
      result.errors.push(
        `${item.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    done += 1;
    options?.onProgress?.(done, items.length, item.name);
  }
  if (result.created + result.updated > 0) {
    await notifyMyListsChanged();
  }
  return result;
}

/** 登录成功后若开启配置则自动同步一次 */
export async function maybeSyncPlatformPlaylistsAfterLogin(
  platform: PlatformId,
): Promise<PlatformPlaylistSyncResult | null> {
  const { getMusicSettings } = await import('@/lib/media/audio/music-settings');
  if (!getMusicSettings().platformPlaylistSyncAfterLogin) return null;
  return syncPlatformPlaylistsToMyLists(platform);
}

/** 将网易歌单曲目保存为新的本地歌单（单次手动落地） */
export async function saveNeteasePlaylistAsLocal(
  neteasePlaylistId: string,
  localName?: string,
): Promise<string> {
  const tracks = await loadNeteasePlaylistTracks(neteasePlaylistId);
  const id = buildPlatformSyncedListId('netease', neteasePlaylistId);
  const name = localName?.trim() || displayListName('netease', `歌单 ${neteasePlaylistId}`);
  await upsertSyncedLocalList(id, name, tracks);
  return id;
}
