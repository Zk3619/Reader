/**
 * musicSdk 统一入口（对齐 lx-music musicSdk/index.js）
 */

import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import type {
  LeaderboardBoard,
  LeaderboardDetail,
  MusicSdkSource,
  OnlinePlaylistDetail,
  PaginatedPlaylists,
  SongListSearchResult,
  SongListSort,
  SongListTag,
  SongListTagGroup,
} from '@/lib/media/audio/music-sdk/types';

import * as kwSongList from '@/lib/media/audio/music-sdk/sources/kw/song-list';
import * as kwLeaderboard from '@/lib/media/audio/music-sdk/sources/kw/leaderboard';
import * as wySongList from '@/lib/media/audio/music-sdk/sources/wy/song-list';
import * as wyLeaderboard from '@/lib/media/audio/music-sdk/sources/wy/leaderboard';
import * as kgSongList from '@/lib/media/audio/music-sdk/sources/kg/song-list';
import * as kgLeaderboard from '@/lib/media/audio/music-sdk/sources/kg/leaderboard';
import * as txSongList from '@/lib/media/audio/music-sdk/sources/tx/song-list';
import * as txLeaderboard from '@/lib/media/audio/music-sdk/sources/tx/leaderboard';
import * as mgSongList from '@/lib/media/audio/music-sdk/sources/mg/song-list';
import * as mgLeaderboard from '@/lib/media/audio/music-sdk/sources/mg/leaderboard';
import {
  hotSearchForSource,
  tipSearchForSource,
} from '@/lib/media/audio/music-sdk/discovery';

export const MUSIC_SDK_SOURCES: MusicSdkSource[] = ['kw', 'kg', 'tx', 'wy', 'mg'];

export const MUSIC_SDK_SOURCE_LABELS: Record<MusicSdkSource, string> = {
  kw: '酷我',
  wy: '网易',
  kg: '酷狗',
  tx: 'QQ音乐',
  mg: '咪咕',
};

type SongListModule = {
  getSortList: () => SongListSort[];
  getTags: () => Promise<SongListTagGroup[]>;
  getHotTags?: () => Promise<SongListTag[]>;
  getList: (sortId: string, tagId: string | null, page?: number) => Promise<PaginatedPlaylists>;
  getListDetail: (id: string, page?: number) => Promise<OnlinePlaylistDetail>;
  parseListIdFromUrl?: (url: string) => string | null;
  searchPlaylists?: (
    keyword: string,
    page?: number,
    limit?: number,
  ) => Promise<SongListSearchResult>;
};

type LeaderboardModule = {
  getBoards: () => Promise<LeaderboardBoard[]>;
  getBoardList: (bangId: string, page?: number) => Promise<LeaderboardDetail>;
};

const SONG_LIST: Record<MusicSdkSource, SongListModule> = {
  kw: kwSongList,
  wy: wySongList,
  kg: kgSongList,
  tx: txSongList,
  mg: mgSongList,
};

const LEADERBOARD: Record<MusicSdkSource, LeaderboardModule> = {
  kw: kwLeaderboard,
  wy: wyLeaderboard,
  kg: kgLeaderboard,
  tx: txLeaderboard,
  mg: mgLeaderboard,
};

export function assertMusicSdkSource(source: string): MusicSdkSource {
  if (!MUSIC_SDK_SOURCES.includes(source as MusicSdkSource)) {
    throw new Error(`不支持的 musicSdk 源: ${source}`);
  }
  return source as MusicSdkSource;
}

export function getSongListSorts(source: MusicSdkSource | string): SongListSort[] {
  const mod = SONG_LIST[source as MusicSdkSource];
  // Hub 歌单源含平台源 / MF，这些没有 LX sortList
  return mod?.getSortList?.() ?? [];
}

export async function getSongListTags(source: MusicSdkSource): Promise<SongListTagGroup[]> {
  return SONG_LIST[source].getTags();
}

export async function getSongListHotTags(source: MusicSdkSource): Promise<SongListTag[]> {
  const mod = SONG_LIST[source];
  if (mod.getHotTags) return mod.getHotTags();
  const groups = await mod.getTags();
  return groups.flatMap((g) => g.list).slice(0, 12);
}

export async function browseSongLists(
  source: MusicSdkSource,
  sortId: string,
  tagId: string | null,
  page = 1,
): Promise<PaginatedPlaylists> {
  return SONG_LIST[source].getList(sortId, tagId, page);
}

export async function getSongListDetail(
  source: MusicSdkSource,
  id: string,
  page = 1,
): Promise<OnlinePlaylistDetail> {
  return SONG_LIST[source].getListDetail(id, page);
}

export async function searchSongLists(
  source: MusicSdkSource,
  keyword: string,
  page = 1,
  limit?: number,
): Promise<SongListSearchResult> {
  const mod = SONG_LIST[source];
  if (mod.searchPlaylists) {
    const result = await mod.searchPlaylists(keyword, page, limit);
    return { ...result, source };
  }
  return { list: [], total: 0, page, limit: limit ?? 30, source };
}

export async function getLeaderboardBoards(source: MusicSdkSource): Promise<LeaderboardBoard[]> {
  return LEADERBOARD[source].getBoards();
}

export async function browseLeaderboard(
  source: MusicSdkSource,
  bangId: string,
  page = 1,
): Promise<LeaderboardDetail> {
  return LEADERBOARD[source].getBoardList(bangId, page);
}

/** 根据歌单链接域名识别平台（纯数字 ID 无法判断时返回 null） */
export function detectSongListSourceFromUrl(url: string): MusicSdkSource | null {
  const u = url.trim().toLowerCase();
  if (!u || /^\d+$/.test(u)) return null;
  if (/music\.163\.com|163cn\.tv|y\.music\.163\.com|music\.126\.net/.test(u)) return 'wy';
  if (/(?:^|[\./])(?:y\.qq\.com|i\.y\.qq\.com)|c\.y\.qq\.com/.test(u)) return 'tx';
  if (/kugou\.com/.test(u)) return 'kg';
  if (/kuwo\.cn/.test(u)) return 'kw';
  if (/migu\.cn/.test(u)) return 'mg';
  return null;
}

function parseIdForSource(source: MusicSdkSource, trimmed: string): string | null {
  const parser = SONG_LIST[source].parseListIdFromUrl;
  const fromParser = parser?.(trimmed);
  if (fromParser) return fromParser;
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * 解析歌单 URL/ID。
 * - 指定 preferredSource：只走该平台（纯数字 ID 直接作为该平台歌单 ID）
 * - 未指定（自动）：有域名则只走对应平台；否则遍历各平台解析器；纯数字 ID 返回 null（由上层遍历拉取）
 */
export async function openListFromUrl(
  url: string,
  preferredSource?: MusicSdkSource,
): Promise<{ source: MusicSdkSource; id: string } | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (preferredSource) {
    const id = parseIdForSource(preferredSource, trimmed);
    return id ? { source: preferredSource, id } : null;
  }

  const detected = detectSongListSourceFromUrl(trimmed);
  if (detected) {
    const id =
      parseIdForSource(detected, trimmed) ??
      trimmed.match(/(?:[?&#](?:playlist)?id=|\/playlist\/)(\d+)/i)?.[1] ??
      trimmed.match(/id=(\d+)/i)?.[1] ??
      null;
    return id ? { source: detected, id } : null;
  }

  for (const source of MUSIC_SDK_SOURCES) {
    const parser = SONG_LIST[source].parseListIdFromUrl;
    if (!parser) continue;
    const id = parser(trimmed);
    if (id) return { source, id };
  }
  return null;
}

/** 纯数字 ID 在自动模式下依次尝试各平台详情，返回第一个有效结果 */
export async function resolveBareListIdByTraverse(
  id: string,
): Promise<{ source: MusicSdkSource; detail: OnlinePlaylistDetail } | null> {
  const trimmed = id.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  for (const source of MUSIC_SDK_SOURCES) {
    try {
      const detail = await SONG_LIST[source].getListDetail(trimmed, 1);
      if (detail.info?.name || detail.tracks.length > 0 || detail.total > 0) {
        return { source, detail };
      }
    } catch {
      // 继续尝试下一平台
    }
  }
  return null;
}

export async function hotSearchKeywords(source: AudioTrackSource): Promise<string[]> {
  return hotSearchForSource(source);
}

export async function tipSearchKeywords(
  source: MusicSdkSource | AudioTrackSource,
  keyword: string,
): Promise<string[]> {
  return tipSearchForSource(source, keyword);
}

export type { MusicSdkSource } from '@/lib/media/audio/music-sdk/types';
