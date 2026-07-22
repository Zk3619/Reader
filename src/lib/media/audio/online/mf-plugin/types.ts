/**
 * MusicFree 插件协议类型（对齐 MusicFree IPluginDefine 子集，独立于 LX UserApi）
 */

export type MfSupportMediaType = 'music' | 'album' | 'artist' | 'sheet' | 'lyric';

export type MfQualityKey = 'low' | 'standard' | 'high' | 'super';

export type MfCacheControl = 'cache' | 'no-cache' | 'no-store';

export interface MfUserVariable {
  key: string;
  name?: string;
  hint?: string;
}

export interface MfMediaBase {
  id: string;
  platform: string;
  $?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MfMediaSource {
  headers?: Record<string, string>;
  url?: string;
  userAgent?: string;
  quality?: MfQualityKey;
  size?: number;
}

export interface MfMusicItem extends MfMediaBase {
  artist: string;
  title: string;
  alias?: string;
  duration?: number;
  album?: string;
  artwork?: string;
  url?: string;
  source?: Partial<Record<MfQualityKey, MfMediaSource>>;
  qualities?: Partial<
    Record<
      MfQualityKey,
      {
        url?: string;
        size?: string | number;
      }
    >
  >;
  lyric?: MfLyricSource;
  lrc?: string;
  rawLrc?: string;
}

export interface MfLyricSource {
  rawLrc?: string;
  lrc?: string;
  translation?: string;
}

export interface MfMediaSourceResult {
  headers?: Record<string, string>;
  url?: string;
  userAgent?: string;
  quality?: MfQualityKey;
}

export interface MfSearchResult<T = MfMediaBase> {
  isEnd?: boolean;
  data: T[];
}

export interface MfAlbumItem extends MfMediaBase {
  title?: string;
  artist?: string;
  artwork?: string;
  description?: string;
  worksNum?: number;
}

export interface MfArtistItem extends MfMediaBase {
  name?: string;
  avatar?: string;
  description?: string;
  worksNum?: number;
}

export interface MfSheetItem extends MfMediaBase {
  title?: string;
  artist?: string;
  artwork?: string;
  description?: string;
  worksNum?: number;
  createUser?: string;
}

export interface MfAlbumInfoResult {
  isEnd?: boolean;
  albumItem?: MfAlbumItem;
  musicList?: MfMusicItem[];
}

export interface MfSheetInfoResult {
  isEnd?: boolean;
  sheetItem?: MfSheetItem;
  musicList?: MfMusicItem[];
}

export interface MfTopListInfoResult {
  isEnd?: boolean;
  topListItem?: MfSheetItem;
  musicList?: MfMusicItem[];
}

export interface MfSheetGroupItem {
  title?: string;
  data: MfSheetItem[];
}

export interface MfRecommendSheetTagsResult {
  pinned?: MfSheetItem[];
  data?: MfSheetGroupItem[];
}

export interface MfPaginationResponse<T> {
  isEnd?: boolean;
  data?: T[];
}

export interface MfComment {
  id?: string;
  nickName?: string;
  avatar?: string;
  comment?: string;
  like?: number;
  createAt?: number;
  location?: string;
  replies?: MfComment[];
}

export type MfPluginMethodName =
  | 'search'
  | 'getMediaSource'
  | 'getMusicInfo'
  | 'getLyric'
  | 'getAlbumInfo'
  | 'getMusicSheetInfo'
  | 'getArtistWorks'
  | 'importMusicSheet'
  | 'importMusicItem'
  | 'getTopLists'
  | 'getTopListDetail'
  | 'getRecommendSheetTags'
  | 'getRecommendSheetsByTag'
  | 'getMusicComments';

export interface MfPluginDefine {
  platform: string;
  appVersion?: string;
  version?: string;
  srcUrl?: string;
  primaryKey?: string[];
  defaultSearchType?: MfSupportMediaType;
  supportedSearchType?: MfSupportMediaType[];
  cacheControl?: MfCacheControl;
  author?: string;
  description?: string;
  userVariables?: MfUserVariable[];
  hints?: Record<string, string[]>;
  search?: (
    query: string,
    page: number,
    type: MfSupportMediaType,
  ) => Promise<MfSearchResult | null>;
  getMediaSource?: (
    musicItem: MfMusicItem,
    quality: MfQualityKey,
  ) => Promise<MfMediaSourceResult | null>;
  getMusicInfo?: (musicBase: MfMediaBase) => Promise<Partial<MfMusicItem> | null>;
  getLyric?: (musicItem: MfMusicItem) => Promise<MfLyricSource | null>;
  getAlbumInfo?: (
    albumItem: MfAlbumItem,
    page: number,
  ) => Promise<MfAlbumInfoResult | null>;
  getMusicSheetInfo?: (
    sheetItem: MfSheetItem,
    page: number,
  ) => Promise<MfSheetInfoResult | null>;
  getArtistWorks?: (
    artistItem: MfArtistItem,
    page: number,
    type: MfSupportMediaType,
  ) => Promise<MfSearchResult | null>;
  importMusicSheet?: (urlLike: string) => Promise<MfMusicItem[] | null>;
  importMusicItem?: (urlLike: string) => Promise<MfMusicItem | null>;
  getTopLists?: () => Promise<MfSheetGroupItem[]>;
  getTopListDetail?: (
    topListItem: MfSheetItem,
    page: number,
  ) => Promise<MfTopListInfoResult>;
  getRecommendSheetTags?: () => Promise<MfRecommendSheetTagsResult>;
  getRecommendSheetsByTag?: (
    tag: { id: string; [key: string]: unknown },
    page?: number,
  ) => Promise<MfPaginationResponse<MfSheetItem>>;
  getMusicComments?: (
    musicItem: MfMusicItem,
    page?: number,
  ) => Promise<MfPaginationResponse<MfComment>>;
}

export const MF_PLUGIN_METHODS: MfPluginMethodName[] = [
  'search',
  'getMediaSource',
  'getMusicInfo',
  'getLyric',
  'getAlbumInfo',
  'getMusicSheetInfo',
  'getArtistWorks',
  'importMusicSheet',
  'importMusicItem',
  'getTopLists',
  'getTopListDetail',
  'getRecommendSheetTags',
  'getRecommendSheetsByTag',
  'getMusicComments',
];

export const MF_SOURCE_PREFIX = 'mf:' as const;

export function mfSourceKey(pluginId: string): string {
  return `${MF_SOURCE_PREFIX}${pluginId}`;
}

export function isMfSourceKey(source: string): boolean {
  return source.startsWith(MF_SOURCE_PREFIX);
}

export function parseMfPluginId(source: string): string | null {
  if (!isMfSourceKey(source)) return null;
  const id = source.slice(MF_SOURCE_PREFIX.length).trim();
  return id || null;
}
