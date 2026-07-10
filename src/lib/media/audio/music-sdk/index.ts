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

export const MUSIC_SDK_SOURCES: MusicSdkSource[] = ['kw', 'wy', 'kg', 'tx', 'mg'];

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
  searchPlaylists?: (keyword: string, page?: number) => Promise<SongListSearchResult>;
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

export function getSongListSorts(source: MusicSdkSource): SongListSort[] {
  return SONG_LIST[source].getSortList();
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
): Promise<SongListSearchResult> {
  const mod = SONG_LIST[source];
  if (mod.searchPlaylists) {
    const result = await mod.searchPlaylists(keyword, page);
    return { ...result, source };
  }
  return { list: [], total: 0, page, limit: 30, source };
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

export async function openListFromUrl(
  url: string,
  preferredSource?: MusicSdkSource,
): Promise<{ source: MusicSdkSource; id: string } | null> {
  const sources = preferredSource ? [preferredSource] : MUSIC_SDK_SOURCES;
  for (const source of sources) {
    const parser = SONG_LIST[source].parseListIdFromUrl;
    if (!parser) continue;
    const id = parser(url);
    if (id) return { source, id };
  }
  if (/^\d+$/.test(url.trim())) {
    return { source: preferredSource ?? 'wy', id: url.trim() };
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
