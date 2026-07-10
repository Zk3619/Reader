/**
 * 在线源路由
 */

import type { AudioTrack, AudioTrackSource } from '@/lib/media/audio/track-types';
import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import * as kw from '@/lib/media/audio/online/sources/kw';
import * as wy from '@/lib/media/audio/online/sources/wy';
import * as kg from '@/lib/media/audio/online/sources/kg';
import * as tx from '@/lib/media/audio/online/sources/tx';
import * as mg from '@/lib/media/audio/online/sources/mg';
import { getOrFetchTrackUrl } from '@/lib/media/audio/online/url-cache';
import { resolvePlatformStreamUrl } from '@/lib/media/audio/platform/stream-resolver';
import {
  listUserApiSearchScripts,
  userApiSearch,
} from '@/lib/media/audio/online/user-api-engine';
import { userApiSourceKey } from '@/lib/media/audio/online/user-api-settings';
import {
  browseLeaderboard,
  browseSongLists,
  getLeaderboardBoards,
  getSongListDetail,
  hotSearchKeywords as sdkHotSearch,
  openListFromUrl,
  searchSongLists,
  tipSearchKeywords as sdkTipSearch,
  type MusicSdkSource,
} from '@/lib/media/audio/music-sdk';
import {
  resolveOnlineLyricBundle,
  resolveOnlineLyricText,
} from '@/lib/media/audio/online/lyric-resolver';
import { getPlayQuality } from '@/lib/media/audio/music-quality';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';

function inferQualitys(track: AudioTrack): MusicQuality[] {
  const existing = track.meta.qualitys;
  if (Array.isArray(existing) && existing.length > 0) {
    return existing as MusicQuality[];
  }
  const maxbr = Number(track.meta.maxbr ?? track.meta.maxBr ?? 0);
  const out: MusicQuality[] = ['128k'];
  if (maxbr >= 192000 || track.meta.hash320) out.push('192k');
  if (maxbr >= 320000 || track.meta.hash320) out.push('320k');
  if (track.meta.hashFlac || maxbr >= 1000000) out.push('flac');
  if (track.meta.hashFlac24bit) out.push('flac24bit');
  return [...new Set(out)];
}

function enrichTrackMeta(track: AudioTrack): AudioTrack {
  const qualitys = inferQualitys(track);
  if (qualitys.length === 0) return track;
  return { ...track, meta: { ...track.meta, qualitys } };
}

function enrichSearchResults(tracks: AudioTrack[]): AudioTrack[] {
  return tracks.map(enrichTrackMeta);
}

export { type MusicSdkSource } from '@/lib/media/audio/music-sdk';

export const BUILTIN_SOURCES: AudioTrackSource[] = ['kw', 'wy', 'kg', 'tx', 'mg'];

export const BUILTIN_SOURCE_LABELS: Record<string, string> = {
  kw: '酷我',
  wy: '网易',
  kg: '酷狗',
  tx: 'QQ音乐',
  mg: '咪咕',
};

export type SearchSource = AudioTrackSource | `userApi:${string}`;

export function listSearchSources(): SearchSource[] {
  const apis = listUserApiSearchScripts().map(
    (s) => userApiSourceKey(s.id) as SearchSource,
  );
  return [...BUILTIN_SOURCES, ...apis];
}

export async function searchOnline(source: SearchSource, keyword: string) {
  if (source.startsWith('userApi:')) {
    const scriptId = source.slice('userApi:'.length);
    const tracks = await userApiSearch(scriptId, keyword);
    return { tracks: enrichSearchResults(tracks), total: tracks.length };
  }
  let result: { tracks: AudioTrack[]; total: number };
  switch (source) {
    case 'kw':
      result = await kw.kwSearch(keyword);
      break;
    case 'wy':
      result = { tracks: await wy.wySearch(keyword), total: 0 };
      break;
    case 'kg':
      result = await kg.kgSearch(keyword);
      break;
    case 'tx':
      result = await tx.txSearch(keyword);
      break;
    case 'mg':
      result = await mg.mgSearch(keyword);
      break;
    case 'bili': {
      const { biliSearch } = await import('@/lib/media/audio/platform/api/bili-ytm');
      const tracks = await biliSearch(keyword);
      result = { tracks, total: tracks.length };
      break;
    }
    case 'ytm': {
      const { ytmSearch } = await import('@/lib/media/audio/platform/api/bili-ytm');
      const tracks = await ytmSearch(keyword);
      result = { tracks, total: tracks.length };
      break;
    }
    default:
      return { tracks: [], total: 0 };
  }
  return { tracks: enrichSearchResults(result.tracks), total: result.total };
}

export async function resolveOnlineTrackUrl(
  track: AudioTrack,
  cookies?: string,
  options?: { skipCache?: boolean; quality?: import('@/lib/media/audio/lyric-types').MusicQuality },
): Promise<string | null> {
  const quality = options?.quality ?? getPlayQuality();
  if (track.source === 'netease' || track.source === 'bili' || track.source === 'ytm') {
    return resolvePlatformStreamUrl(track, cookies, options);
  }
  return getOrFetchTrackUrl(
    track.id,
    async () => {
      switch (track.source) {
        case 'kw':
          return kw.kwGetMusicUrl(track, quality);
        case 'wy':
          return wy.wyGetMusicUrl(track, cookies, quality);
        case 'kg':
          return kg.kgGetMusicUrl(track, quality);
        case 'tx':
          return tx.txGetMusicUrl(track, quality);
        case 'mg':
          return mg.mgGetMusicUrl(track, quality);
        default:
          return null;
      }
    },
    undefined,
    { skipCache: options?.skipCache },
  );
}

export async function resolveOnlineLyric(track: AudioTrack): Promise<string | null> {
  return resolveOnlineLyricText(track);
}

export async function resolveOnlineLyricFull(track: AudioTrack): Promise<LyricBundle | null> {
  return resolveOnlineLyricBundle(track);
}

export async function resolveOnlinePic(track: AudioTrack): Promise<string | null> {
  const cover = track.meta.coverUrl;
  if (typeof cover === 'string' && cover.trim()) return cover;

  let pic: string | null = null;
  switch (track.source) {
    case 'wy': {
      const { wyGetPic } = await import('@/lib/media/audio/music-sdk/sources/wy/music-info');
      pic = await wyGetPic(track);
      break;
    }
    case 'kw': {
      const { kwGetPic } = await import('@/lib/media/audio/music-sdk/sources/kw/music-info');
      pic = await kwGetPic(track);
      break;
    }
    case 'kg': {
      const { kgGetPic } = await import('@/lib/media/audio/music-sdk/sources/kg/music-info');
      pic = await kgGetPic(track);
      break;
    }
    case 'tx': {
      const { txGetPic } = await import('@/lib/media/audio/music-sdk/sources/tx/music-info');
      pic = await txGetPic(track);
      break;
    }
    case 'mg': {
      const { mgGetPic } = await import('@/lib/media/audio/music-sdk/sources/mg/pic');
      pic = await mgGetPic(track);
      break;
    }
    default:
      break;
  }
  if (pic) return pic;

  if (!getMusicSettings().fallbackPic) return null;
  const { findMusic } = await import('@/lib/media/audio/music-sdk/find-music');
  const others = await findMusic(track);
  for (const alt of others) {
    const altCover = alt.meta.coverUrl;
    if (typeof altCover === 'string' && altCover.trim()) return altCover;
    const altPic = await resolveOnlinePic(alt);
    if (altPic) return altPic;
  }
  return null;
}

export async function hotSearchKeywords(source: AudioTrackSource): Promise<string[]> {
  return sdkHotSearch(source);
}

export async function tipSearchKeywords(
  source: AudioTrackSource,
  keyword: string,
): Promise<string[]> {
  return sdkTipSearch(source, keyword);
}

export async function browseSongList(
  source: MusicSdkSource,
  sortId: string,
  tagId: string | null,
  page = 1,
) {
  return browseSongLists(source, sortId, tagId, page);
}

export async function browseLeaderboardList(
  source: MusicSdkSource,
  bangId: string,
  page = 1,
) {
  return browseLeaderboard(source, bangId, page);
}

export async function getOnlinePlaylistDetail(
  source: MusicSdkSource,
  id: string,
  page = 1,
) {
  return getSongListDetail(source, id, page);
}

export async function searchOnlinePlaylists(
  source: MusicSdkSource,
  keyword: string,
  page = 1,
) {
  return searchSongLists(source, keyword, page);
}

export async function parsePlaylistUrl(
  url: string,
  preferredSource?: MusicSdkSource,
) {
  return openListFromUrl(url, preferredSource);
}

export async function listLeaderboardBoards(source: MusicSdkSource) {
  return getLeaderboardBoards(source);
}
