/**
 * MusicFree 多类型搜索（Hub 消费）
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import type { OnlinePlaylistSummary } from '@/lib/media/audio/music-sdk/types';
import {
  listMfSearchPlugins,
  mfSearch,
  type MfPluginRecord,
} from '@/lib/media/audio/online/mf-plugin';
import { mfSheetToSummary } from '@/lib/media/audio/online/mf-plugin/media-adapter';
import {
  isMfSourceKey,
  mfSourceKey,
  parseMfPluginId,
  type MfAlbumItem,
  type MfArtistItem,
  type MfSheetItem,
  type MfSupportMediaType,
} from '@/lib/media/audio/online/mf-plugin/types';
import type { SearchSource } from '@/lib/media/audio/online/source-router';
import { AGGREGATE_SEARCH_SOURCE } from '@/lib/media/audio/online/source-router';

export type MfAlbumSearchHit = {
  id: string;
  name: string;
  artist?: string;
  coverUrl?: string;
  source: string;
  mfPluginId: string;
  mfAlbumItem: MfAlbumItem;
};

export type MfArtistSearchHit = {
  id: string;
  name: string;
  coverUrl?: string;
  source: string;
  mfPluginId: string;
  mfArtistItem: MfArtistItem;
};

export type MfSearchPageResult = {
  tracks: AudioTrack[];
  albums: MfAlbumSearchHit[];
  artists: MfArtistSearchHit[];
  sheets: OnlinePlaylistSummary[];
  total: number;
  isEnd: boolean;
};

function pluginSupportsType(plugin: MfPluginRecord, type: MfSupportMediaType): boolean {
  const supported = plugin.supportedSearchType;
  if (!supported?.length) return type === 'music';
  return supported.includes(type);
}

function mapAlbumHit(item: MfAlbumItem, pluginId: string): MfAlbumSearchHit {
  return {
    id: String(item.id),
    name: String(item.title ?? item.id),
    artist: typeof item.artist === 'string' ? item.artist : undefined,
    coverUrl: typeof item.artwork === 'string' ? item.artwork : undefined,
    source: mfSourceKey(pluginId),
    mfPluginId: pluginId,
    mfAlbumItem: item,
  };
}

function mapArtistHit(item: MfArtistItem, pluginId: string): MfArtistSearchHit {
  return {
    id: String(item.id),
    name: String(item.name ?? item.id),
    coverUrl: typeof item.avatar === 'string' ? item.avatar : undefined,
    source: mfSourceKey(pluginId),
    mfPluginId: pluginId,
    mfArtistItem: item,
  };
}

export async function searchMfTyped(
  pluginId: string,
  keyword: string,
  page: number,
  type: MfSupportMediaType,
): Promise<MfSearchPageResult> {
  const result = await mfSearch(pluginId, keyword, page, type);
  if (type === 'music' || type === 'lyric') {
    return {
      tracks: result.tracks,
      albums: [],
      artists: [],
      sheets: [],
      total: result.total,
      isEnd: result.isEnd,
    };
  }
  const raw = (result as { raw?: unknown[] }).raw ?? [];
  if (type === 'album') {
    return {
      tracks: [],
      albums: (raw as MfAlbumItem[]).map((a) => mapAlbumHit(a, pluginId)),
      artists: [],
      sheets: [],
      total: raw.length,
      isEnd: result.isEnd,
    };
  }
  if (type === 'artist') {
    return {
      tracks: [],
      albums: [],
      artists: (raw as MfArtistItem[]).map((a) => mapArtistHit(a, pluginId)),
      sheets: [],
      total: raw.length,
      isEnd: result.isEnd,
    };
  }
  return {
    tracks: [],
    albums: [],
    artists: [],
    sheets: (raw as MfSheetItem[]).map((s) => ({
      ...mfSheetToSummary(s, pluginId),
      source: mfSourceKey(pluginId) as import('@/lib/media/audio/music-sdk/types').HubBrowseSource,
    })),
    total: raw.length,
    isEnd: result.isEnd,
  };
}

export async function searchMfSourceTyped(
  source: SearchSource,
  keyword: string,
  page: number,
  type: MfSupportMediaType,
): Promise<MfSearchPageResult> {
  const plugins =
    source === AGGREGATE_SEARCH_SOURCE
      ? listMfSearchPlugins().filter((p) => pluginSupportsType(p, type))
      : isMfSourceKey(String(source))
        ? (() => {
            const id = parseMfPluginId(String(source));
            const p = id ? listMfSearchPlugins().find((x) => x.id === id) : null;
            return p && pluginSupportsType(p, type) ? [p] : [];
          })()
        : [];

  const merged: MfSearchPageResult = {
    tracks: [],
    albums: [],
    artists: [],
    sheets: [],
    total: 0,
    isEnd: true,
  };
  for (const p of plugins) {
    const hit = await searchMfTyped(p.id, keyword, page, type);
    merged.tracks.push(...hit.tracks);
    merged.albums.push(...hit.albums);
    merged.artists.push(...hit.artists);
    merged.sheets.push(...hit.sheets);
    merged.total += hit.total;
    merged.isEnd = merged.isEnd && hit.isEnd;
  }
  return merged;
}

export function hubTabToMfType(tab: string): MfSupportMediaType | null {
  switch (tab) {
    case 'song':
    case 'lyric':
      return tab === 'lyric' ? 'lyric' : 'music';
    case 'album':
      return 'album';
    case 'artist':
      return 'artist';
    case 'sheet':
      return 'sheet';
    default:
      return null;
  }
}

export function isMfOnlySearchTab(tab: string): boolean {
  return tab === 'album' || tab === 'artist' || tab === 'lyric' || tab === 'sheet';
}
