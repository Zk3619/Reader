/**
 * musicSdk 类型（对齐 lx-music 在线浏览模型）
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import type { MfSheetItem } from '@/lib/media/audio/online/mf-plugin/types';

export type MusicSdkSource = 'kw' | 'wy' | 'kg' | 'tx' | 'mg';

/** Hub 浏览分区源（五源 + 平台源 + mf:插件） */
export type HubBrowseSource =
  | MusicSdkSource
  | 'netease'
  | 'bili'
  | 'ytm'
  | `mf:${string}`;

export interface SongListTagGroup {
  name: string;
  list: SongListTag[];
}

export interface SongListTag {
  id: string;
  name: string;
  source: HubBrowseSource;
  parentId?: string;
  parentName?: string;
  /**
   * MusicFree 原始 tag（须保留 digest 等插件私有字段）。
   * 元力 KW 等依赖 digest === "10000" 选择推荐歌单 API。
   */
  mfTag?: Record<string, unknown>;
}

export interface SongListSort {
  id: string;
  name: string;
}

export interface OnlinePlaylistSummary {
  id: string;
  name: string;
  author?: string;
  coverUrl?: string;
  playCount?: string;
  trackCount?: number;
  desc?: string;
  source: HubBrowseSource;
  /** MusicFree 插件歌单元数据 */
  mfPluginId?: string;
  mfSheetItem?: MfSheetItem;
}

export interface OnlinePlaylistDetail {
  info: {
    id: string;
    name: string;
    author?: string;
    coverUrl?: string;
    desc?: string;
    playCount?: string;
    source: HubBrowseSource;
    mfPluginId?: string;
    mfSheetItem?: MfSheetItem;
  };
  tracks: AudioTrack[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedPlaylists {
  list: OnlinePlaylistSummary[];
  total: number;
  page: number;
  limit: number;
  source: HubBrowseSource;
  /** 空列表时的可读原因（限流、接口失败等），与「真的没内容」区分 */
  emptyHint?: string;
}

export interface LeaderboardBoard {
  id: string;
  name: string;
  bangId: string;
  source: HubBrowseSource;
  group?: string;
  mfPluginId?: string;
  mfSheetItem?: MfSheetItem;
}

export interface LeaderboardDetail {
  board: LeaderboardBoard;
  tracks: AudioTrack[];
  total: number;
  page: number;
  limit: number;
}

export interface SongListSearchResult {
  list: OnlinePlaylistSummary[];
  total: number;
  page: number;
  limit: number;
  source: MusicSdkSource;
}

export interface MusicSearchSongResult {
  tracks: AudioTrack[];
  total: number;
  page: number;
  limit: number;
}
