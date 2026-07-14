/**
 * 音乐设置持久化（对齐 lx defaultSetting 键名子集）
 */

import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import type { AudioPlayMode } from '@/lib/media/audio/types';
import type { EQ_PRESETS } from '@/lib/media/audio/engine/web-audio-player';

const STORAGE_KEY = 'reader_music_settings';

export type MusicSearchControlStyle = 'select' | 'tabs';
/** 音乐搜索页列表加载：滚动追加 / 分页切换 */
export type MusicSearchPaginationPreference = 'scroll' | 'pagination';
/** 在线歌单页：标签控件（lx 分组下拉 / 探索页徽标堆叠） */
export type MusicSongListTagControlStyle = 'grouped' | 'stacked';

export interface MusicSettings {
  defaultSource: AudioTrackSource;
  defaultSearchTab: 'song' | 'playlist';
  /** 音乐搜索页：来源选择控件风格 */
  musicSearchSourceControl?: MusicSearchControlStyle;
  /** 音乐搜索页：歌曲/歌单切换控件风格 */
  musicSearchTabControl?: MusicSearchControlStyle;
  /** 音乐搜索页：翻页方式（对齐探索页：滚动加载 / 分页） */
  musicSearchPaginationPreference?: MusicSearchPaginationPreference;
  /** 在线歌单页：来源选择控件风格 */
  musicSongListSourceControl?: MusicSearchControlStyle;
  /** 在线歌单页：排序选择控件风格 */
  musicSongListSortControl?: MusicSearchControlStyle;
  /** 在线歌单页：标签选择控件风格 */
  musicSongListTagControl?: MusicSongListTagControlStyle;
  /** 在线歌单页：列表翻页方式（滚动加载 / 分页） */
  musicSongListPaginationPreference?: MusicSearchPaginationPreference;
  /** 排行榜页：列表翻页方式（滚动加载 / 分页） */
  musicLeaderboardPaginationPreference?: MusicSearchPaginationPreference;
  searchHistoryEnabled: boolean;
  playSpeed: number;
  eqPreset: keyof typeof EQ_PRESETS;
  lyricOffset: number;
  lyricTrack: 'lyric' | 'tlyric' | 'rlyric' | 'lxlyric';
  playQuality: import('@/lib/media/audio/lyric-types').MusicQuality;
  urlSourceMode: 'builtin' | 'userApi' | 'auto';
  fallbackUrl: boolean;
  fallbackLyric: boolean;
  fallbackPic: boolean;
  autoPlay: boolean;
  rememberProgress: boolean;
  defaultPlayMode: AudioPlayMode;
  downloadPath: string;
  downloadConcurrent: number;
  syncAutoUpdateLists: boolean;
  desktopLyricPenetrate?: boolean;
  desktopLyricTrack?: 'lyric' | 'tlyric' | 'rlyric' | 'lxlyric';
  desktopLyricFontSize?: number;
  desktopLyricOpacity?: number;
  downloadQuality?: import('@/lib/media/audio/lyric-types').MusicQuality;
  downloadFileNameTemplate?: string;
  playTimeoutSec?: number;
  /** 取链/解码失败时自动下一首 */
  autoSkipOnError?: boolean;
  /** 歌词是否显示翻译 */
  showLyricTranslation?: boolean;
  /** 歌词是否显示罗马音 */
  showLyricRoma?: boolean;
}

const DEFAULTS: MusicSettings = {
  defaultSource: 'wy',
  defaultSearchTab: 'song',
  musicSearchSourceControl: 'select',
  musicSearchTabControl: 'select',
  /** 对齐 lx 搜索默认用分页条；仍可通过「更多」切换为滚动加载 */
  musicSearchPaginationPreference: 'pagination',
  musicSongListSourceControl: 'select',
  musicSongListSortControl: 'select',
  musicSongListTagControl: 'grouped',
  /** 对齐 lx 歌单默认用分页条 */
  musicSongListPaginationPreference: 'pagination',
  /** 对齐 lx 排行榜默认用分页条 */
  musicLeaderboardPaginationPreference: 'pagination',
  searchHistoryEnabled: true,
  playSpeed: 1,
  eqPreset: 'flat',
  lyricOffset: 0,
  lyricTrack: 'lyric',
  playQuality: '320k',
  urlSourceMode: 'auto',
  fallbackUrl: true,
  fallbackLyric: true,
  fallbackPic: true,
  autoPlay: true,
  rememberProgress: true,
  defaultPlayMode: 3 as AudioPlayMode,
  downloadPath: '',
  downloadConcurrent: 2,
  syncAutoUpdateLists: true,
  desktopLyricPenetrate: false,
  desktopLyricTrack: 'lxlyric',
  desktopLyricFontSize: 20,
  desktopLyricOpacity: 0.85,
  downloadQuality: '320k',
  downloadFileNameTemplate: '{artist}-{name}',
  playTimeoutSec: 0,
  autoSkipOnError: true,
  showLyricTranslation: true,
  showLyricRoma: true,
};

function readRaw(): Partial<MusicSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<MusicSettings>) : {};
  } catch {
    return {};
  }
}

export function getMusicSettings(): MusicSettings {
  return { ...DEFAULTS, ...readRaw() };
}

export function setMusicSettings(patch: Partial<MusicSettings>): void {
  const next = { ...readRaw(), ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function exportMusicSettings(): string {
  return JSON.stringify(getMusicSettings(), null, 2);
}

export function importMusicSettings(json: string): void {
  const parsed = JSON.parse(json) as Partial<MusicSettings>;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, ...parsed }));
}
