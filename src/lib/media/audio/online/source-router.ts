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
import { resolvePlatformStreamUrl } from '@/lib/media/audio/platform/stream-resolver';
import {
  listUserApiSearchScripts,
  userApiSearch,
} from '@/lib/media/audio/online/user-api-engine';
import { userApiSourceKey } from '@/lib/media/audio/online/user-api-settings';
import {
  isMfSourceKey,
  mfSourceKey,
  parseMfPluginId,
} from '@/lib/media/audio/online/mf-plugin/types';
import {
  listMfSearchPlugins,
  mfPluginDisplayLabel,
  mfSearch,
} from '@/lib/media/audio/online/mf-plugin';
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
import { decodeHtmlEntities } from '@/lib/media/text/decode-html-entities';
import {
  PLATFORM_SOURCES,
} from '@/lib/media/audio/platform/platform-sources';

/** 对齐 lx 搜索默认每页条数 */
export const MUSIC_SEARCH_PAGE_LIMIT = 30;

function inferQualitys(track: AudioTrack): MusicQuality[] {
  const existing = track.meta.qualitys;
  if (Array.isArray(existing) && existing.length > 0) {
    return existing as MusicQuality[];
  }
  const typed = track.meta._qualitys;
  if (typed && typeof typed === 'object' && !Array.isArray(typed)) {
    return Object.keys(typed as Record<string, unknown>) as MusicQuality[];
  }
  const maxbr = Number(track.meta.maxbr ?? track.meta.maxBr ?? 0);
  const out: MusicQuality[] = ['128k'];
  if (maxbr >= 192000 || track.meta.hash320 || track.meta.hash_320) out.push('192k');
  if (maxbr >= 320000 || track.meta.hash320 || track.meta.hash_320) out.push('320k');
  if (track.meta.hashFlac || track.meta.hash_flac || maxbr >= 1000000) out.push('flac');
  if (track.meta.hashFlac24bit || track.meta.hash_high) out.push('flac24bit');
  return [...new Set(out)];
}

function enrichTrackMeta(track: AudioTrack): AudioTrack {
  const qualitys = inferQualitys(track);
  const albumRaw = track.meta.albumName ?? track.meta.album;
  const albumName =
    typeof albumRaw === 'string' && albumRaw.length > 0
      ? decodeHtmlEntities(albumRaw)
      : typeof albumRaw === 'string'
        ? albumRaw
        : undefined;
  const existingTypes = track.meta._qualitys;
  const _qualitys =
    existingTypes && typeof existingTypes === 'object' && !Array.isArray(existingTypes)
      ? existingTypes
      : qualitys.length > 0
        ? Object.fromEntries(qualitys.map((q) => [q, {}]))
        : undefined;
  return {
    ...track,
    name: decodeHtmlEntities(track.name),
    artist: decodeHtmlEntities(track.artist),
    meta: {
      ...track.meta,
      ...(albumName !== undefined ? { albumName } : {}),
      ...(qualitys.length > 0 ? { qualitys } : {}),
      ...(_qualitys ? { _qualitys } : {}),
    },
  };
}

function enrichSearchResults(tracks: AudioTrack[]): AudioTrack[] {
  return tracks.map(enrichTrackMeta);
}

export { type MusicSdkSource } from '@/lib/media/audio/music-sdk';
export {
  PLATFORM_SOURCES,
  PLATFORM_SOURCE_LABELS,
  PLATFORM_SOURCE_SHORT_LABELS,
  isPlatformSource,
  type PlatformSourceId,
} from '@/lib/media/audio/platform/platform-sources';

export const BUILTIN_SOURCES: AudioTrackSource[] = ['kw', 'kg', 'tx', 'wy', 'mg'];

export const BUILTIN_SOURCE_LABELS: Record<string, string> = {
  local: '本地',
  kw: '酷我',
  wy: '网易',
  kg: '酷狗',
  tx: 'QQ音乐',
  mg: '咪咕',
  netease: '网易云音乐',
  bili: '哔哩哔哩',
  ytm: 'YouTube Music',
};

/** 聚合搜索结果行上来源短码（对齐 lx OnlineList source 徽章） */
export const BUILTIN_SOURCE_SHORT_LABELS: Record<string, string> = {
  local: '本地',
  kw: 'kw',
  wy: 'wy',
  kg: 'kg',
  tx: 'tx',
  mg: 'mg',
  netease: '网易云',
  bili: 'B站',
  ytm: 'YTM',
};

/** lx 歌单聚合搜索每源条数 listInfos.all.limit */
export const MUSIC_PLAYLIST_SEARCH_AGGREGATE_LIMIT = 15;
/** lx 单源歌单搜索条数 listInfos[source].limit */
export const MUSIC_PLAYLIST_SEARCH_SOURCE_LIMIT = 18;

export const AGGREGATE_SEARCH_SOURCE = 'all' as const;

export type SearchSource =
  | AudioTrackSource
  | `userApi:${string}`
  | `mf:${string}`
  | typeof AGGREGATE_SEARCH_SOURCE;

export function listSearchSources(): SearchSource[] {
  const apis = listUserApiSearchScripts().map(
    (s) => userApiSourceKey(s.id) as SearchSource,
  );
  const mfs = listMfSearchPlugins().map((p) => mfSourceKey(p.id) as SearchSource);
  // 五源 → 平台账号源 → UserApi → MF
  return [...BUILTIN_SOURCES, ...PLATFORM_SOURCES, ...apis, ...mfs];
}

/** Hub 搜索页来源选项（含聚合） */
export function listHubSearchSources(): SearchSource[] {
  return [AGGREGATE_SEARCH_SOURCE, ...listSearchSources()];
}

export function searchSourceLabel(source: SearchSource): string {
  if (source === AGGREGATE_SEARCH_SOURCE) return '聚合';
  if (source.startsWith('userApi:')) return '自定义源';
  if (isMfSourceKey(source)) {
    const id = parseMfPluginId(source);
    return id ? mfPluginDisplayLabel(id) : source;
  }
  return BUILTIN_SOURCE_LABELS[source] ?? source;
}

/** 列表行短来源标签（聚合结果用，避免「网易」等中文换行撑高卡片） */
export function searchSourceShortLabel(source: string): string {
  if (isMfSourceKey(source)) {
    const id = parseMfPluginId(source);
    return id ? mfPluginDisplayLabel(id) : source;
  }
  return BUILTIN_SOURCE_SHORT_LABELS[source] ?? source;
}

export async function searchOnline(
  source: SearchSource,
  keyword: string,
  page = 1,
  limit = MUSIC_SEARCH_PAGE_LIMIT,
) {
  if (source.startsWith('userApi:')) {
    const scriptId = source.slice('userApi:'.length);
    const tracks = await userApiSearch(scriptId, keyword);
    return { tracks: enrichSearchResults(tracks), total: tracks.length };
  }
  if (isMfSourceKey(source)) {
    const pluginId = parseMfPluginId(source);
    if (!pluginId) return { tracks: [], total: 0 };
    const result = await mfSearch(pluginId, keyword, page, 'music');
    const tracks = enrichSearchResults(result.tracks).slice(0, limit);
    const total = result.isEnd
      ? (page - 1) * limit + tracks.length
      : page * limit + 1;
    return { tracks, total };
  }
  let result: { tracks: AudioTrack[]; total: number };
  switch (source) {
    case 'kw':
      result = await kw.kwSearch(keyword, page, limit);
      break;
    case 'wy': {
      const tracks = await wy.wySearch(keyword, page, limit);
      // 网易部分接口不回 total：页满则按「还有下一页」估算（对齐 lx）
      const total =
        tracks.length >= limit ? page * limit + 1 : (page - 1) * limit + tracks.length;
      result = { tracks, total };
      break;
    }
    case 'kg':
      result = await kg.kgSearch(keyword, page, limit);
      break;
    case 'tx':
      result = await tx.txSearch(keyword, page, limit);
      break;
    case 'mg':
      result = await mg.mgSearch(keyword, page, limit);
      break;
    case 'netease': {
      const { neteaseSearch } = await import('@/lib/media/audio/platform/api/netease');
      const tracks = await neteaseSearch(keyword, page, limit);
      const total =
        tracks.length >= limit ? page * limit + 1 : (page - 1) * limit + tracks.length;
      result = { tracks, total };
      break;
    }
    case 'bili': {
      const { biliSearch } = await import('@/lib/media/audio/platform/api/bili/client');
      const { tracks, total } = await biliSearch(keyword, page, limit);
      result = { tracks, total };
      break;
    }
    case 'ytm': {
      const { ytmSearch } = await import('@/lib/media/audio/platform/api/ytm/search');
      const { tracks, total } = await ytmSearch(keyword, page, limit);
      result = { tracks, total };
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
  const quality = options?.quality ?? getPlayQuality(track);
  if (track.source === 'netease' || track.source === 'bili' || track.source === 'ytm') {
    return resolvePlatformStreamUrl(track, cookies, options);
  }
  // MusicFree / 平台账号流：保留。五源内置 musicUrl：对齐 LX，生产无启用路径。
  if (isMfSourceKey(String(track.source))) {
    const pluginId =
      parseMfPluginId(String(track.source)) ||
      (typeof track.meta.mfPluginId === 'string' ? track.meta.mfPluginId : null);
    if (!pluginId) return null;
    const { mfGetMediaSource } = await import('@/lib/media/audio/online/mf-plugin');
    const result = await mfGetMediaSource(pluginId, track, quality);
    return result?.url?.trim() || null;
  }
  switch (track.source) {
    case 'kw':
    case 'wy':
    case 'kg':
    case 'tx':
    case 'mg':
      return null;
    default:
      return null;
  }
}

export async function resolveOnlineLyric(track: AudioTrack): Promise<string | null> {
  return resolveOnlineLyricText(track);
}

export async function resolveOnlineLyricFull(track: AudioTrack): Promise<LyricBundle | null> {
  return resolveOnlineLyricBundle(track);
}

async function resolveTrackSourcePic(track: AudioTrack): Promise<string | null> {
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
  return pic;
}

export async function resolveOnlinePic(track: AudioTrack): Promise<string | null> {
  const pic = await resolveTrackSourcePic(track);
  if (pic) return pic;
  if (!getMusicSettings().fallbackPic) return null;
  try {
    const { fetchQqEnrichPic } = await import('@/lib/media/audio/online/meta-enrich');
    const qq = await fetchQqEnrichPic(track);
    if (qq) return qq;
  } catch {
    // ignore
  }
  const { findMusic } = await import('@/lib/media/audio/music-sdk/find-music');
  const others = await findMusic(track);
  for (const alt of others) {
    const altPic = await resolveTrackSourcePic(alt);
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
