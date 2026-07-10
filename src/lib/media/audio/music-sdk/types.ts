/**
 * musicSdk 类型（对齐 lx-music 在线浏览模型）
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';

export type MusicSdkSource = 'kw' | 'wy' | 'kg' | 'tx' | 'mg';

export interface SongListTagGroup {
  name: string;
  list: SongListTag[];
}

export interface SongListTag {
  id: string;
  name: string;
  source: MusicSdkSource;
  parentId?: string;
  parentName?: string;
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
  source: MusicSdkSource;
}

export interface OnlinePlaylistDetail {
  info: {
    id: string;
    name: string;
    author?: string;
    coverUrl?: string;
    desc?: string;
    playCount?: string;
    source: MusicSdkSource;
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
  source: MusicSdkSource;
}

export interface LeaderboardBoard {
  id: string;
  name: string;
  bangId: string;
  source: MusicSdkSource;
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
