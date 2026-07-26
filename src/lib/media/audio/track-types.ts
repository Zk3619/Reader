/**
 * 音乐曲目与歌单类型（独立于 Legado Book 模型）
 */

export type AudioTrackSource =
  | 'local'
  | 'kw'
  | 'kg'
  | 'tx'
  | 'wy'
  | 'mg'
  | 'netease'
  | 'bili'
  | 'ytm'
  | 'userApi'
  | string;

export interface AudioTrack {
  id: string;
  name: string;
  artist: string;
  source: AudioTrackSource;
  /** 时长显示，如 03:45 */
  duration: string;
  meta: AudioTrackMeta;
}

export interface AudioTrackMeta {
  filePath?: string;
  ext?: string;
  albumName?: string;
  songId?: string;
  coverUrl?: string;
  lyricPath?: string;
  lyricText?: string;
  bitrate?: string;
  [key: string]: unknown;
}

export type AudioPlaybackMode = 'audiobook' | 'music';

export const BUILTIN_PLAYLIST_IDS = {
  /** 播放列表：承接搜索/单曲「加入并播放」；不再被歌单/排行榜整表覆盖 */
  DEFAULT: 'default',
  /** 试听列表：播放过且未加入其它收藏/用户/本地列表的歌曲 */
  TRIAL: 'trial',
  LOVE: 'love',
  RECENT: 'recent',
  LOCAL: 'local',
} as const;

export interface AudioPlaylist {
  id: string;
  name: string;
  source: 'builtin' | 'local' | 'remote' | 'sync';
  description?: string;
  coverUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AudioPlaylistItem {
  playlistId: string;
  trackId: string;
  order: number;
}

export interface AudioUrlCacheEntry {
  trackId: string;
  url: string;
  expiresAt: number;
}

export interface AudioAuthSession {
  platform: 'netease' | 'bili' | 'ytm' | string;
  cookies: string;
  updatedAt: number;
  healthy: boolean;
}

export interface AudioSyncState {
  serverUrl: string;
  serverId: string;
  syncMode: string;
  lastSyncAt: number;
  connected: boolean;
}

export function formatDurationSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** 播放栏 / 迷你窗用：分:秒，分钟不补零 */
export function formatMusicTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function buildTrackId(source: AudioTrackSource, key: string): string {
  return `${source}__${key}`;
}
