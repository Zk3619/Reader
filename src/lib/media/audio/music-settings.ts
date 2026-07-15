/**
 * 音乐设置持久化（对齐 lx defaultSetting 键名子集）
 */

import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import type { EQ_PRESETS } from '@/lib/media/audio/engine/web-audio-player';

const STORAGE_KEY = 'reader_music_settings';
const ACTIVE_PLAYLIST_STORAGE_KEY = 'reader_music_active_playlist_id';
const listeners = new Set<(settings: MusicSettings) => void>();

export type MusicSearchControlStyle = 'select' | 'tabs';
/** 音乐搜索页列表加载：滚动追加 / 分页切换 */
export type MusicSearchPaginationPreference = 'scroll' | 'pagination';
/** 在线歌单页：标签控件（lx 分组下拉 / 探索页徽标堆叠） */
export type MusicSongListTagControlStyle = 'grouped' | 'stacked';
export type MusicLyricAlign = 'left' | 'center' | 'right';
export type MusicListAddPosition = 'top' | 'bottom';

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
  /** 我的列表页：允许拖拽调整歌曲顺序 */
  musicListDragSortEnabled?: boolean;
  /** 我的列表页：上次选择的列表 ID */
  musicActivePlaylistId: string;
  searchHistoryEnabled: boolean;
  searchHotEnabled: boolean;
  searchFocusOnEnter: boolean;
  searchClearInputOnLeave: boolean;
  searchClearResultsOnLeave: boolean;
  playSpeed: number;
  preservesPitch: boolean;
  eqPreset: keyof typeof EQ_PRESETS;
  lyricOffset: number;
  lyricTrack: 'lyric' | 'tlyric' | 'rlyric' | 'lxlyric';
  lyricSecondaryOrder: 'translation-first' | 'roma-first';
  lyricUseLxLyric: boolean;
  lyricChineseConversion: 0 | 1 | 2;
  playDetailLyricAlign: MusicLyricAlign;
  playDetailLyricFontSize: number;
  playDetailZoomActiveLyric: boolean;
  playDetailAllowLyricSeek: boolean;
  allowProgressBarSeek: boolean;
  playQuality: import('@/lib/media/audio/lyric-types').MusicQuality;
  urlSourceMode: 'builtin' | 'userApi' | 'auto';
  fallbackUrl: boolean;
  fallbackLyric: boolean;
  fallbackPic: boolean;
  autoPlay: boolean;
  rememberProgress: boolean;
  listShowSource: boolean;
  listShowAlbum: boolean;
  listShowDuration: boolean;
  listActionButtonsVisible: boolean;
  listAddPosition: MusicListAddPosition;
  listSaveScrollPosition: boolean;
  downloadConcurrent: number;
  downloadSkipExisting: boolean;
  syncAutoUpdateLists: boolean;
  desktopLyricPenetrate?: boolean;
  desktopLyricTrack?: 'lyric' | 'tlyric' | 'rlyric' | 'lxlyric';
  desktopLyricFontSize?: number;
  desktopLyricOpacity?: number;
  desktopLyricAlign: MusicLyricAlign;
  desktopLyricZoomActive: boolean;
  desktopLyricSingleLine: boolean;
  desktopLyricMaxLines: number;
  desktopLyricPlayedColor: string;
  desktopLyricUnplayedColor: string;
  openApiPort: number;
  openApiBindAddress: string;
  localSyncPort: number;
  downloadQuality?: import('@/lib/media/audio/lyric-types').MusicQuality;
  downloadFileNameTemplate?: string;
  playTimeoutSec?: number;
  playTimeoutWaitForTrackEnd: boolean;
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
  musicListDragSortEnabled: true,
  musicActivePlaylistId: 'local',
  searchHistoryEnabled: true,
  searchHotEnabled: true,
  searchFocusOnEnter: false,
  searchClearInputOnLeave: false,
  searchClearResultsOnLeave: false,
  playSpeed: 1,
  preservesPitch: true,
  eqPreset: 'flat',
  lyricOffset: 0,
  lyricTrack: 'lyric',
  lyricSecondaryOrder: 'translation-first',
  lyricUseLxLyric: true,
  lyricChineseConversion: 0,
  playDetailLyricAlign: 'center',
  playDetailLyricFontSize: 14,
  playDetailZoomActiveLyric: true,
  playDetailAllowLyricSeek: false,
  allowProgressBarSeek: true,
  playQuality: '320k',
  urlSourceMode: 'auto',
  fallbackUrl: true,
  fallbackLyric: true,
  fallbackPic: true,
  autoPlay: true,
  rememberProgress: true,
  listShowSource: true,
  listShowAlbum: true,
  listShowDuration: true,
  listActionButtonsVisible: false,
  listAddPosition: 'top',
  listSaveScrollPosition: true,
  downloadConcurrent: 2,
  downloadSkipExisting: true,
  syncAutoUpdateLists: true,
  desktopLyricPenetrate: false,
  desktopLyricTrack: 'lxlyric',
  desktopLyricFontSize: 20,
  desktopLyricOpacity: 0.85,
  desktopLyricAlign: 'center',
  desktopLyricZoomActive: true,
  desktopLyricSingleLine: false,
  desktopLyricMaxLines: 5,
  desktopLyricPlayedColor: '#ffffff',
  desktopLyricUnplayedColor: 'rgba(255, 255, 255, 0.5)',
  openApiPort: 23330,
  openApiBindAddress: '127.0.0.1',
  localSyncPort: 23332,
  downloadQuality: '320k',
  downloadFileNameTemplate: '{artist}-{name}',
  playTimeoutSec: 0,
  playTimeoutWaitForTrackEnd: true,
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
  const settings = getMusicSettings();
  for (const listener of listeners) listener(settings);
}

export function subscribeMusicSettings(
  listener: (settings: MusicSettings) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMusicActivePlaylistId(): string {
  try {
    return (
      localStorage.getItem(ACTIVE_PLAYLIST_STORAGE_KEY)?.trim() ||
      getMusicSettings().musicActivePlaylistId ||
      'local'
    );
  } catch {
    return 'local';
  }
}

export function setMusicActivePlaylistId(playlistId: string): void {
  const value = playlistId.trim() || 'local';
  localStorage.setItem(ACTIVE_PLAYLIST_STORAGE_KEY, value);
  // 兼容已有设置导出，并作为旧版本回退值。
  setMusicSettings({ musicActivePlaylistId: value });
}

export function exportMusicSettings(): string {
  return JSON.stringify(getMusicSettings(), null, 2);
}

export function importMusicSettings(json: string): void {
  const parsed = JSON.parse(json) as Partial<MusicSettings>;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, ...parsed }));
  const settings = getMusicSettings();
  for (const listener of listeners) listener(settings);
}
