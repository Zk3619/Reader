/**
 * 音乐设置持久化（对齐 lx defaultSetting 键名子集）
 */

import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import { EQ_PRESETS } from '@/lib/media/audio/engine/web-audio-player';

const STORAGE_KEY = 'reader_music_settings';
const LEGACY_FALLBACK_STORAGE_KEY = 'reader_audio_fallback_enabled';
const ACTIVE_PLAYLIST_STORAGE_KEY = 'reader_music_active_playlist_id';
const LIST_SCROLL_STORAGE_KEY = 'reader_music_list_scroll_positions';
export const MUSIC_SETTINGS_SCHEMA_VERSION = 4;
const listeners = new Set<(settings: MusicSettings) => void>();

export type MusicSearchControlStyle = 'select' | 'tabs';
/** 音乐搜索页列表加载：滚动追加 / 分页切换 */
export type MusicSearchPaginationPreference = 'scroll' | 'pagination';
/** 在线歌单页：标签控件（lx 分组下拉 / 探索页徽标堆叠） */
export type MusicSongListTagControlStyle = 'grouped' | 'stacked';
export type MusicLyricAlign = 'left' | 'center' | 'right';
export type MusicListAddPosition = 'top' | 'bottom';
export type MusicLyricDirection = 'horizontal' | 'vertical';
export type MusicLyricScrollPosition = 'top' | 'center' | 'bottom';
export type MusicDownloadSourceStrategy = 'primary' | 'fallback';

export interface MusicSettings {
  schemaVersion: number;
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
  /** 自定义十段 EQ；非 null 时覆盖 eqPreset。 */
  eqCustomGains: number[] | null;
  audioOutputDeviceId: string;
  audioPauseOnDeviceRemoved: boolean;
  audioMaxChannels: number;
  /** 使用当前设备声明的最大输出声道数。 */
  audioUseMaxChannels: boolean;
  audioVisualizationEnabled: boolean;
  lyricOffset: number;
  lyricTrack: 'lyric' | 'tlyric' | 'rlyric' | 'lxlyric';
  lyricSecondaryOrder: 'translation-first' | 'roma-first';
  lyricUseLxLyric: boolean;
  lyricChineseConversion: 0 | 1 | 2;
  playDetailLyricAlign: MusicLyricAlign;
  playDetailLyricFontSize: number;
  playDetailZoomActiveLyric: boolean;
  playDetailAllowLyricSeek: boolean;
  playDetailLyricScrollDelayMs: number;
  allowProgressBarSeek: boolean;
  playQuality: import('@/lib/media/audio/lyric-types').MusicQuality;
  playQualityPreference:
    | import('@/lib/media/audio/lyric-types').MusicQuality
    | 'lowest'
    | 'highest';
  urlSourceMode: 'builtin' | 'userApi' | 'auto';
  fallbackUrl: boolean;
  fallbackLyric: boolean;
  fallbackPic: boolean;
  /** 应用启动并恢复上次歌曲后是否自动开始播放。 */
  startupAutoPlay: boolean;
  /** 用户选曲或自动切歌后是否自动开始播放。 */
  autoPlay: boolean;
  /** 播放期间阻止系统休眠。 */
  preventSleepWhilePlaying: boolean;
  rememberProgress: boolean;
  /** 在同一列表内手动切歌时清空随机播放历史。 */
  autoCleanPlayedList: boolean;
  /** 在桌面任务栏显示当前歌曲播放进度。 */
  showTaskbarProgress: boolean;
  listShowSource: boolean;
  listShowAlbum: boolean;
  listShowDuration: boolean;
  listActionButtonsVisible: boolean;
  listAddPosition: MusicListAddPosition;
  listSaveScrollPosition: boolean;
  listDoubleClickToPlay: boolean;
  listClearQueueOnSwitch: boolean;
  downloadConcurrent: number;
  downloadSkipExisting: boolean;
  downloadEnabled: boolean;
  downloadTargetDirectory: string;
  downloadGroupByPlaylist: boolean;
  downloadSaveLyricFile: boolean;
  downloadSourceStrategy: MusicDownloadSourceStrategy;
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
  desktopLyricLocked: boolean;
  desktopLyricAlwaysOnTop: boolean;
  desktopLyricHideWhenPaused: boolean;
  desktopLyricHideWhenFullscreen: boolean;
  desktopLyricDirection: MusicLyricDirection;
  desktopLyricScrollPosition: MusicLyricScrollPosition;
  desktopLyricFontFamily: string;
  desktopLyricLineHeight: number;
  desktopLyricShadow: boolean;
  desktopLyricBold: boolean;
  desktopLyricWrap: boolean;
  openApiPort: number;
  openApiBindAddress: string;
  openApiEnabled: boolean;
  openApiAutoStart: boolean;
  localSyncPort: number;
  localSyncEnabled: boolean;
  localSyncAutoStart: boolean;
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
  /** 音乐播放器音量（0-1） */
  musicVolume: number;
  /** 音乐播放器静音状态 */
  musicMuted: boolean;
}

const DEFAULTS: MusicSettings = {
  schemaVersion: MUSIC_SETTINGS_SCHEMA_VERSION,
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
  eqCustomGains: null,
  audioOutputDeviceId: '',
  audioPauseOnDeviceRemoved: false,
  audioMaxChannels: 2,
  audioUseMaxChannels: false,
  audioVisualizationEnabled: false,
  lyricOffset: 0,
  lyricTrack: 'lyric',
  lyricSecondaryOrder: 'roma-first',
  lyricUseLxLyric: true,
  lyricChineseConversion: 0,
  playDetailLyricAlign: 'center',
  playDetailLyricFontSize: 14,
  playDetailZoomActiveLyric: true,
  playDetailAllowLyricSeek: false,
  playDetailLyricScrollDelayMs: 0,
  allowProgressBarSeek: true,
  playQuality: '320k',
  playQualityPreference: '320k',
  urlSourceMode: 'auto',
  fallbackUrl: true,
  fallbackLyric: true,
  fallbackPic: true,
  startupAutoPlay: false,
  autoPlay: true,
  preventSleepWhilePlaying: true,
  rememberProgress: false,
  autoCleanPlayedList: false,
  showTaskbarProgress: true,
  listShowSource: true,
  listShowAlbum: true,
  listShowDuration: true,
  listActionButtonsVisible: false,
  listAddPosition: 'top',
  listSaveScrollPosition: true,
  listDoubleClickToPlay: false,
  listClearQueueOnSwitch: false,
  downloadConcurrent: 2,
  downloadSkipExisting: true,
  downloadEnabled: true,
  downloadTargetDirectory: '',
  downloadGroupByPlaylist: false,
  downloadSaveLyricFile: false,
  downloadSourceStrategy: 'fallback',
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
  desktopLyricLocked: false,
  desktopLyricAlwaysOnTop: true,
  desktopLyricHideWhenPaused: false,
  desktopLyricHideWhenFullscreen: true,
  desktopLyricDirection: 'horizontal',
  desktopLyricScrollPosition: 'center',
  desktopLyricFontFamily: '',
  desktopLyricLineHeight: 1.5,
  desktopLyricShadow: true,
  desktopLyricBold: false,
  desktopLyricWrap: true,
  openApiPort: 23330,
  openApiBindAddress: '127.0.0.1',
  openApiEnabled: false,
  openApiAutoStart: false,
  localSyncPort: 23332,
  localSyncEnabled: false,
  localSyncAutoStart: false,
  downloadQuality: '320k',
  downloadFileNameTemplate: '{artist}-{name}',
  playTimeoutSec: 0,
  playTimeoutWaitForTrackEnd: true,
  autoSkipOnError: true,
  showLyricTranslation: false,
  showLyricRoma: false,
  musicVolume: 1,
  musicMuted: false,
};

const ENUM_VALUES: Partial<Record<keyof MusicSettings, readonly unknown[]>> = {
  defaultSearchTab: ['song', 'playlist'],
  musicSearchSourceControl: ['select', 'tabs'],
  musicSearchTabControl: ['select', 'tabs'],
  musicSearchPaginationPreference: ['scroll', 'pagination'],
  musicSongListSourceControl: ['select', 'tabs'],
  musicSongListSortControl: ['select', 'tabs'],
  musicSongListTagControl: ['grouped', 'stacked'],
  musicSongListPaginationPreference: ['scroll', 'pagination'],
  musicLeaderboardPaginationPreference: ['scroll', 'pagination'],
  eqPreset: Object.keys(EQ_PRESETS),
  lyricTrack: ['lyric', 'tlyric', 'rlyric', 'lxlyric'],
  lyricSecondaryOrder: ['translation-first', 'roma-first'],
  lyricChineseConversion: [0, 1, 2],
  playDetailLyricAlign: ['left', 'center', 'right'],
  playQuality: ['128k', '192k', '320k', 'flac', 'flac24bit', 'ape', 'wav'],
  playQualityPreference: [
    'lowest',
    'highest',
    '128k',
    '192k',
    '320k',
    'flac',
    'flac24bit',
    'ape',
    'wav',
  ],
  urlSourceMode: ['builtin', 'userApi', 'auto'],
  listAddPosition: ['top', 'bottom'],
  desktopLyricTrack: ['lyric', 'tlyric', 'rlyric', 'lxlyric'],
  desktopLyricAlign: ['left', 'center', 'right'],
  desktopLyricDirection: ['horizontal', 'vertical'],
  desktopLyricScrollPosition: ['top', 'center', 'bottom'],
  downloadQuality: ['128k', '192k', '320k', 'flac', 'flac24bit', 'ape', 'wav'],
  downloadSourceStrategy: ['primary', 'fallback'],
};

const LX_DOTTED_KEY_MAP: Record<string, keyof MusicSettings> = {
  'search.isShowHistorySearch': 'searchHistoryEnabled',
  'search.isShowHotSearch': 'searchHotEnabled',
  'search.isFocusSearchBox': 'searchFocusOnEnter',
  'odc.isAutoClearSearchInput': 'searchClearInputOnLeave',
  'odc.isAutoClearSearchList': 'searchClearResultsOnLeave',
  'player.playbackRate': 'playSpeed',
  'player.preservesPitch': 'preservesPitch',
  'player.playQuality': 'playQuality',
  'player.isPlayLxlrc': 'lyricUseLxLyric',
  'player.isShowLyricTranslation': 'showLyricTranslation',
  'player.isShowLyricRoma': 'showLyricRoma',
  'player.isSavePlayTime': 'rememberProgress',
  'player.startupAutoPlay': 'startupAutoPlay',
  'player.powerSaveBlocker': 'preventSleepWhilePlaying',
  'player.isAutoCleanPlayedList': 'autoCleanPlayedList',
  'player.isShowTaskProgess': 'showTaskbarProgress',
  'player.isMaxOutputChannelCount': 'audioUseMaxChannels',
  'player.isMediaDeviceRemovedStopPlay': 'audioPauseOnDeviceRemoved',
  'player.autoSkipOnError': 'autoSkipOnError',
  'player.volume': 'musicVolume',
  'player.isMute': 'musicMuted',
  'playDetail.isZoomActiveLrc': 'playDetailZoomActiveLyric',
  'playDetail.isShowLyricProgressSetting': 'playDetailAllowLyricSeek',
  'playDetail.style.align': 'playDetailLyricAlign',
  'desktopLyric.style.align': 'desktopLyricAlign',
  'desktopLyric.style.fontSize': 'desktopLyricFontSize',
  'desktopLyric.style.isZoomActiveLrc': 'desktopLyricZoomActive',
  'desktopLyric.style.lyricPlayedColor': 'desktopLyricPlayedColor',
  'desktopLyric.style.lyricUnplayColor': 'desktopLyricUnplayedColor',
  'list.isShowSource': 'listShowSource',
  'list.isSaveScrollLocation': 'listSaveScrollPosition',
  'list.actionButtonsVisible': 'listActionButtonsVisible',
  'list.addMusicLocationType': 'listAddPosition',
  'download.maxDownloadNum': 'downloadConcurrent',
  'download.skipExistFile': 'downloadSkipExisting',
  'download.fileName': 'downloadFileNameTemplate',
};

function importLxDottedKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = { ...raw };
  for (const [lxKey, musicKey] of Object.entries(LX_DOTTED_KEY_MAP)) {
    if (mapped[musicKey] === undefined && raw[lxKey] !== undefined) {
      mapped[musicKey] = raw[lxKey];
    }
  }
  if (
    mapped.desktopLyricOpacity === undefined &&
    typeof raw['desktopLyric.style.opacity'] === 'number'
  ) {
    mapped.desktopLyricOpacity = raw['desktopLyric.style.opacity'] / 100;
  }
  if (
    mapped.playDetailLyricFontSize === undefined &&
    typeof raw['playDetail.style.fontSize'] === 'number'
  ) {
    // LX 使用百分比；Reader 使用 px，按默认 14px 折算并限制到 UI 范围。
    mapped.playDetailLyricFontSize = Math.max(
      12,
      Math.min(32, Math.round((raw['playDetail.style.fontSize'] / 100) * 14)),
    );
  }
  if (
    mapped.lyricSecondaryOrder === undefined &&
    typeof raw['player.isSwapLyricTranslationAndRoma'] === 'boolean'
  ) {
    mapped.lyricSecondaryOrder = raw['player.isSwapLyricTranslationAndRoma']
      ? 'translation-first'
      : 'roma-first';
  }
  if (
    mapped.lyricChineseConversion === undefined &&
    typeof raw['player.isS2t'] === 'boolean'
  ) {
    mapped.lyricChineseConversion = raw['player.isS2t'] ? 2 : 0;
  }
  return mapped;
}

function normalizeNumber(key: keyof MusicSettings, value: number): number {
  switch (key) {
    case 'musicVolume':
      return Math.max(0, Math.min(1, value));
    case 'openApiPort':
    case 'localSyncPort':
      return Math.max(1, Math.min(65535, Math.round(value)));
    case 'downloadConcurrent':
      return Math.max(1, Math.min(20, Math.round(value)));
    case 'playSpeed':
      return Math.max(0.5, Math.min(3, value));
    case 'desktopLyricOpacity':
      return Math.max(0, Math.min(1, value));
    case 'desktopLyricMaxLines':
      return Math.max(1, Math.round(value));
    case 'audioMaxChannels':
      return Math.max(1, Math.min(32, Math.round(value)));
    case 'playDetailLyricScrollDelayMs':
      return Math.max(0, Math.min(5000, Math.round(value)));
    case 'desktopLyricLineHeight':
      return Math.max(1, Math.min(3, value));
    case 'playTimeoutSec':
      return Math.max(0, value);
    default:
      return value;
  }
}

/** 将旧版、本项目导出及 LX 点号键设置归一为当前 schema。 */
export function normalizeMusicSettings(input: unknown): MusicSettings {
  const source =
    input && typeof input === 'object'
      ? importLxDottedKeys(input as Record<string, unknown>)
      : {};
  const normalized = { ...DEFAULTS } as Record<keyof MusicSettings, MusicSettings[keyof MusicSettings]>;
  for (const key of Object.keys(DEFAULTS) as (keyof MusicSettings)[]) {
    if (key === 'schemaVersion') continue;
    const value = source[key];
    if (value === undefined) continue;
    const allowed = ENUM_VALUES[key];
    if (allowed) {
      if (allowed.includes(value)) normalized[key] = value as never;
      continue;
    }
    const defaultValue = DEFAULTS[key];
    if (typeof defaultValue === 'boolean' && typeof value === 'boolean') {
      normalized[key] = value as never;
    } else if (typeof defaultValue === 'string' && typeof value === 'string') {
      normalized[key] = value as never;
    } else if (typeof defaultValue === 'number' && typeof value === 'number' && Number.isFinite(value)) {
      normalized[key] = normalizeNumber(key, value) as never;
    }
  }
  normalized.schemaVersion = MUSIC_SETTINGS_SCHEMA_VERSION;
  const customEq = source.eqCustomGains;
  normalized.eqCustomGains =
    Array.isArray(customEq) &&
    customEq.length === 10 &&
    customEq.every((value) => typeof value === 'number' && Number.isFinite(value))
      ? customEq.map((value) => Math.max(-12, Math.min(12, value)))
      : null;
  if (normalized.lyricUseLxLyric === false && normalized.lyricTrack === 'lxlyric') {
    normalized.lyricTrack = 'lyric';
  }
  if (normalized.lyricUseLxLyric === false && normalized.desktopLyricTrack === 'lxlyric') {
    normalized.desktopLyricTrack = 'lyric';
  }
  if (
    source.playQualityPreference === undefined &&
    typeof source.playQuality === 'string' &&
    ENUM_VALUES.playQuality?.includes(source.playQuality)
  ) {
    normalized.playQualityPreference = normalized.playQuality;
  }
  return normalized as MusicSettings;
}

function readRaw(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function writeSettings(settings: MusicSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // SSR / Node 测试环境或存储不可用时仍返回归一化默认值。
  }
}

export function getMusicSettings(): MusicSettings {
  const raw = readRaw();
  if (raw.fallbackUrl === undefined) {
    try {
      const legacyFallback = localStorage.getItem(LEGACY_FALLBACK_STORAGE_KEY);
      if (legacyFallback != null) raw.fallbackUrl = legacyFallback !== '0';
    } catch {
      // ignore
    }
  }
  const settings = normalizeMusicSettings(raw);
  if (raw.schemaVersion !== MUSIC_SETTINGS_SCHEMA_VERSION) {
    writeSettings(settings);
  }
  return settings;
}

export function setMusicSettings(patch: Partial<MusicSettings>): void {
  const next = normalizeMusicSettings({ ...readRaw(), ...patch });
  writeSettings(next);
  for (const listener of listeners) listener(next);
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
  const settings = normalizeMusicSettings(JSON.parse(json));
  writeSettings(settings);
  for (const listener of listeners) listener(settings);
}

function readListScrollPositions(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIST_SCROLL_STORAGE_KEY) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= 0,
      ),
    );
  } catch {
    return {};
  }
}

export function getMusicListScrollPosition(listId: string): number {
  return readListScrollPositions()[listId] ?? 0;
}

export function setMusicListScrollPosition(listId: string, position: number): void {
  if (!getMusicSettings().listSaveScrollPosition) return;
  const positions = readListScrollPositions();
  positions[listId] = Math.max(0, Number.isFinite(position) ? position : 0);
  localStorage.setItem(LIST_SCROLL_STORAGE_KEY, JSON.stringify(positions));
}
