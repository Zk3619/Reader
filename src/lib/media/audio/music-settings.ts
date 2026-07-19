/**
 * 音乐设置持久化（对齐 lx defaultSetting 键名子集）
 */

import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import { EQ_PRESETS } from '@/lib/media/audio/engine/web-audio-player';
import {
  PLAY_DETAIL_LYRIC_FONT_REM_DEFAULT,
  clampPlayDetailLyricFontRem,
  migratePlayDetailLyricFontSizeToRem,
  type MusicFontSizeUnit,
} from '@/lib/media/audio/play-detail-lyric-font';
import {
  getMusicUiSnapshot,
  patchMusicUiSnapshot,
} from '@/lib/persistence/domains/music-ui';
import {
  bindMusicSettingsNormalizer,
  patchMusicConfig,
  peekMusicConfigSync,
} from '@/lib/media/audio/music-config-storage';
import { isTauri } from '@/lib/platform/detect';

const STORAGE_KEY = 'reader_music_settings';
const LEGACY_FALLBACK_STORAGE_KEY = 'reader_audio_fallback_enabled';
const ACTIVE_PLAYLIST_STORAGE_KEY = 'reader_music_active_playlist_id';
/** 跨 WebView 同步音乐设置（storage 事件不可靠） */
export const MUSIC_SETTINGS_CHANGED_EVENT = 'music-settings-changed';
export const MUSIC_SETTINGS_SCHEMA_VERSION = 12;
const listeners = new Set<(settings: MusicSettings) => void>();
let remoteListenStarted = false;
/** 避免本窗 emit → 本窗 listen → 再次 emit 的环 */
let applyingRemoteSettings = false;

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
/** 播放栏进度条布局，对齐 LX Music 的 mini / middle / full。 */
export type MusicPlayBarProgressStyle = 'mini' | 'middle' | 'full';
export type MusicPlayTimerAction =
  | 'pause'
  | 'stop-after-track'
  | 'exit-after-track'
  | 'shutdown-after-track';

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
  /** 在线歌单页：列表/网格视图（对齐书架 ViewMode 子集） */
  musicSongListViewMode?: string;
  /** 在线歌单页：列表/网格间距（0–24，×0.25rem） */
  musicSongListSpacing?: number;
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
  /** 音调倍率（对齐 lx pitchShifter.playbackRate），1 为原调，约 0.5～2 */
  pitchShifterRate: number;
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
  /** 播放详情歌词字号（rem） */
  playDetailLyricFontSize: number;
  /** 设置页字号输入单位（仅影响编辑显示，存储始终为 rem） */
  playDetailLyricFontSizeUnit: MusicFontSizeUnit;
  playDetailZoomActiveLyric: boolean;
  /** 播放详情当前行缩放倍率（1 = 不放大，建议 1.1–1.6） */
  playDetailZoomActiveScale: number;
  playDetailAllowLyricSeek: boolean;
  /** 拖拽歌词松手后自动跳转播放（依赖 playDetailAllowLyricSeek） */
  playDetailLyricSeekAutoPlayOnRelease: boolean;
  /** 双击歌词行跳转到对应进度 */
  playDetailLyricDoubleClickSeek: boolean;
  playDetailLyricScrollDelayMs: number;
  /** 播放详情以独立全视口覆盖层展示（覆盖主壳顶栏/侧栏） */
  playDetailStandalone: boolean;
  /** 隐藏播放详情顶栏，将返回/设置按钮分布到内容顶部 */
  playDetailHideHeader: boolean;
  /** 桌面端评论/播放队列使用右侧抽屉，而非可调整宽度的内嵌面板 */
  playDetailDesktopSidePaneDrawer: boolean;
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
  /** 播放栏进度条样式。 */
  playBarProgressStyle: MusicPlayBarProgressStyle;
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
  /** 将歌词嵌入到 MP3 ID3（USLT） */
  downloadEmbedLyric: boolean;
  /** 将封面嵌入到 MP3 ID3（APIC） */
  downloadEmbedCover: boolean;
  downloadSourceStrategy: MusicDownloadSourceStrategy;
  syncAutoUpdateLists: boolean;
  /** 桌面歌词窗口是否启用（对齐 LX desktopLyric.enable） */
  desktopLyricEnabled: boolean;
  /** 桌面歌词窗口几何（逻辑像素）；缺省时开窗使用默认尺寸并居中 */
  desktopLyricWidth?: number;
  desktopLyricHeight?: number;
  desktopLyricX?: number;
  desktopLyricY?: number;
  desktopLyricPenetrate?: boolean;
  /**
   * 穿透高级：无视顶栏热区。开启后整窗始终点穿，悬停不显示任何控制栏（含解锁）；
   * 关闭穿透或解锁请回设置页。
   */
  desktopLyricPenetrateIgnoreChrome?: boolean;
  desktopLyricTrack?: 'lyric' | 'tlyric' | 'rlyric' | 'lxlyric';
  desktopLyricFontSize?: number;
  desktopLyricOpacity?: number;
  /** 是否显示歌名与艺术家（关闭后移除该区域） */
  desktopLyricShowMeta: boolean;
  /** 歌名/艺术家字号（px） */
  desktopLyricMetaFontSize?: number;
  /** 歌名/艺术家不透明度 0–1 */
  desktopLyricMetaOpacity?: number;
  /** 歌名/艺术家加粗 */
  desktopLyricMetaBold: boolean;
  desktopLyricAlign: MusicLyricAlign;
  desktopLyricZoomActive: boolean;
  /** 桌面歌词当前行缩放倍率 */
  desktopLyricZoomActiveScale: number;
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
  /** 最近使用的定时时长（秒），作为下次打开定时弹窗的默认值。 */
  playTimeoutSec?: number;
  /** 兼容旧设置；新逻辑由 playTimerAction 决定。 */
  playTimeoutWaitForTrackEnd: boolean;
  /** 当前定时任务的绝对截止时间（Unix 毫秒）；0 表示未启用。 */
  playTimerTargetAt: number;
  playTimerAction: MusicPlayTimerAction;
  /** 取链/解码失败时自动下一首（仅 list 来源的系统/用户列表队列） */
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
  musicSongListViewMode: 'list-2',
  musicSongListSpacing: 12,
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
  pitchShifterRate: 1,
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
  playDetailLyricFontSize: PLAY_DETAIL_LYRIC_FONT_REM_DEFAULT,
  playDetailLyricFontSizeUnit: 'rem',
  playDetailZoomActiveLyric: true,
  playDetailZoomActiveScale: 1.28,
  playDetailAllowLyricSeek: false,
  playDetailLyricSeekAutoPlayOnRelease: false,
  playDetailLyricDoubleClickSeek: false,
  playDetailLyricScrollDelayMs: 0,
  playDetailStandalone: false,
  playDetailHideHeader: false,
  playDetailDesktopSidePaneDrawer: false,
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
  playBarProgressStyle: 'full',
  listShowSource: true,
  listShowAlbum: true,
  listShowDuration: true,
  listActionButtonsVisible: false,
  listAddPosition: 'top',
  listSaveScrollPosition: true,
  listDoubleClickToPlay: true,
  listClearQueueOnSwitch: false,
  downloadConcurrent: 2,
  downloadSkipExisting: true,
  downloadEnabled: true,
  downloadTargetDirectory: '',
  downloadGroupByPlaylist: false,
  downloadSaveLyricFile: false,
  downloadEmbedLyric: false,
  downloadEmbedCover: false,
  downloadSourceStrategy: 'fallback',
  syncAutoUpdateLists: true,
  desktopLyricEnabled: false,
  desktopLyricWidth: 600,
  desktopLyricHeight: 200,
  desktopLyricPenetrate: false,
  desktopLyricPenetrateIgnoreChrome: false,
  desktopLyricTrack: 'lxlyric',
  desktopLyricFontSize: 20,
  desktopLyricOpacity: 0.85,
  desktopLyricShowMeta: true,
  desktopLyricMetaFontSize: 14,
  desktopLyricMetaOpacity: 0.7,
  desktopLyricMetaBold: false,
  desktopLyricAlign: 'center',
  desktopLyricZoomActive: true,
  desktopLyricZoomActiveScale: 1.28,
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
  playTimerTargetAt: 0,
  playTimerAction: 'pause',
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
  musicSongListViewMode: [
    'list',
    'list-2',
    'list-3',
    'grid-2',
    'grid-3',
    'grid-4',
    'grid-5',
    'grid-6',
    'grid-7',
    'grid-8',
  ],
  musicLeaderboardPaginationPreference: ['scroll', 'pagination'],
  eqPreset: Object.keys(EQ_PRESETS),
  lyricTrack: ['lyric', 'tlyric', 'rlyric', 'lxlyric'],
  lyricSecondaryOrder: ['translation-first', 'roma-first'],
  lyricChineseConversion: [0, 1, 2],
  playDetailLyricAlign: ['left', 'center', 'right'],
  playDetailLyricFontSizeUnit: ['rem', 'px'],
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
  playBarProgressStyle: ['mini', 'middle', 'full'],
  playTimerAction: [
    'pause',
    'stop-after-track',
    'exit-after-track',
    'shutdown-after-track',
  ],
};

const LX_DOTTED_KEY_MAP: Record<string, keyof MusicSettings> = {
  'search.isShowHistorySearch': 'searchHistoryEnabled',
  'search.isShowHotSearch': 'searchHotEnabled',
  'search.isFocusSearchBox': 'searchFocusOnEnter',
  'odc.isAutoClearSearchInput': 'searchClearInputOnLeave',
  'odc.isAutoClearSearchList': 'searchClearResultsOnLeave',
  'player.playbackRate': 'playSpeed',
  'player.preservesPitch': 'preservesPitch',
  'player.soundEffect.pitchShifter.playbackRate': 'pitchShifterRate',
  'player.playQuality': 'playQuality',
  'player.isPlayLxlrc': 'lyricUseLxLyric',
  'player.isShowLyricTranslation': 'showLyricTranslation',
  'player.isShowLyricRoma': 'showLyricRoma',
  'player.isSavePlayTime': 'rememberProgress',
  'player.startupAutoPlay': 'startupAutoPlay',
  'player.powerSaveBlocker': 'preventSleepWhilePlaying',
  'player.isAutoCleanPlayedList': 'autoCleanPlayedList',
  'player.isShowTaskProgess': 'showTaskbarProgress',
  'common.playBarProgressStyle': 'playBarProgressStyle',
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
  'desktopLyric.enable': 'desktopLyricEnabled',
  'desktopLyric.isLock': 'desktopLyricLocked',
  'desktopLyric.isAlwaysOnTop': 'desktopLyricAlwaysOnTop',
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
    // LX 使用百分比；先按默认 14px 折算为 px，再转为 rem
    const px = Math.max(
      12,
      Math.min(32, Math.round((raw['playDetail.style.fontSize'] / 100) * 14)),
    );
    mapped.playDetailLyricFontSize = migratePlayDetailLyricFontSizeToRem(px);
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
      return Math.max(0.25, Math.min(4, value));
    case 'pitchShifterRate':
      return Math.max(0.5, Math.min(2, Math.round(value * 100) / 100));
    case 'desktopLyricOpacity':
      return Math.max(0, Math.min(1, value));
    case 'desktopLyricMetaOpacity':
      return Math.max(0, Math.min(1, value));
    case 'desktopLyricMetaFontSize':
      return Math.max(10, Math.min(48, Math.round(value)));
    case 'desktopLyricWidth':
      return Math.max(240, Math.min(4000, Math.round(value)));
    case 'desktopLyricHeight':
      return Math.max(80, Math.min(2000, Math.round(value)));
    case 'desktopLyricFontSize':
      // 设置页单位为 px（默认 20）；防止异常大值把歌词撑满屏
      return Math.max(12, Math.min(80, Math.round(value)));
    case 'desktopLyricMaxLines':
      return Math.max(1, Math.round(value));
    case 'audioMaxChannels':
      return Math.max(1, Math.min(32, Math.round(value)));
    case 'playDetailLyricScrollDelayMs':
      return Math.max(0, Math.min(5000, Math.round(value)));
    case 'playDetailLyricFontSize':
      return clampPlayDetailLyricFontRem(value);
    case 'desktopLyricLineHeight':
      return Math.max(1, Math.min(3, value));
    case 'playDetailZoomActiveScale':
    case 'desktopLyricZoomActiveScale':
      return Math.max(1, Math.min(1.8, Math.round(value * 100) / 100));
    case 'playTimeoutSec':
      return Math.max(0, value);
    case 'playTimerTargetAt':
      return Math.max(0, Math.round(value));
    case 'musicSongListSpacing':
      return Math.max(0, Math.min(24, Math.round(value)));
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
  for (const key of ['desktopLyricX', 'desktopLyricY'] as const) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      normalized[key] = value;
    }
  }
  if (
    source.playQualityPreference === undefined &&
    typeof source.playQuality === 'string' &&
    ENUM_VALUES.playQuality?.includes(source.playQuality)
  ) {
    normalized.playQualityPreference = normalized.playQuality;
  }
  if (
    source.playTimerAction === undefined &&
    source.playTimeoutWaitForTrackEnd === true
  ) {
    normalized.playTimerAction = 'stop-after-track';
  }
  if (
    (normalized.playTimerTargetAt as number) <= 0 &&
    typeof source.playTimeoutSec === 'number' &&
    source.playTimeoutSec > 0 &&
    source.playTimerTargetAt === undefined
  ) {
    // 旧版仅保存时长：升级后不自动启动，仅保留为默认时长。
    normalized.playTimerTargetAt = 0;
  }
  // schema < 9 时 playDetailLyricFontSize 为 px，需迁到 rem
  if (
    typeof source.playDetailLyricFontSize === 'number' &&
    Number.isFinite(source.playDetailLyricFontSize)
  ) {
    const prevSchema =
      typeof source.schemaVersion === 'number' ? source.schemaVersion : 0;
    normalized.playDetailLyricFontSize =
      prevSchema < 9
        ? migratePlayDetailLyricFontSizeToRem(source.playDetailLyricFontSize)
        : clampPlayDetailLyricFontRem(source.playDetailLyricFontSize);
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
    // SSR / Node
  }
  patchMusicConfig({ settings: settings as unknown as Record<string, unknown> });
}

export function getMusicSettings(): MusicSettings {
  ensureMusicSettingsRemoteSync();
  const fromConfig = peekMusicConfigSync().settings;
  if (fromConfig && Object.keys(fromConfig).length > 0) {
    return normalizeMusicSettings(fromConfig);
  }
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

function broadcastMusicSettingsChanged(next: MusicSettings): void {
  if (applyingRemoteSettings) return;
  if (!isTauri()) return;
  void import('@tauri-apps/api/event')
    .then(({ emit }) => emit(MUSIC_SETTINGS_CHANGED_EVENT, next))
    .catch(() => undefined);
}

/**
 * 他窗推送的设置：写入本窗缓存并通知本地 listeners，不再二次广播。
 */
export function applyRemoteMusicSettings(input: unknown): MusicSettings {
  const next = normalizeMusicSettings(input);
  applyingRemoteSettings = true;
  try {
    writeSettings(next);
    for (const listener of listeners) listener(next);
  } finally {
    applyingRemoteSettings = false;
  }
  return next;
}

function ensureMusicSettingsRemoteSync(): void {
  if (remoteListenStarted) return;
  remoteListenStarted = true;
  if (!isTauri()) return;
  void import('@tauri-apps/api/event')
    .then(({ listen }) =>
      listen<unknown>(MUSIC_SETTINGS_CHANGED_EVENT, (e) => {
        applyRemoteMusicSettings(e.payload);
      }),
    )
    .catch(() => undefined);
}

export function setMusicSettings(patch: Partial<MusicSettings>): void {
  const next = normalizeMusicSettings({ ...getMusicSettings(), ...patch });
  writeSettings(next);
  for (const listener of listeners) listener(next);
  broadcastMusicSettingsChanged(next);
}
export function subscribeMusicSettings(
  listener: (settings: MusicSettings) => void,
): () => void {
  ensureMusicSettingsRemoteSync();
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
  broadcastMusicSettingsChanged(settings);
}

export function getMusicListScrollPosition(listId: string): number {
  return getMusicUiSnapshot().listScrollPositions[listId] ?? 0;
}

export function setMusicListScrollPosition(listId: string, position: number): void {
  if (!getMusicSettings().listSaveScrollPosition) return;
  const positions = { ...getMusicUiSnapshot().listScrollPositions };
  positions[listId] = Math.max(0, Number.isFinite(position) ? position : 0);
  patchMusicUiSnapshot({ listScrollPositions: positions });
}

/** 供 music-config-storage 归一化 settings 字段（副作用：模块加载即绑定） */
bindMusicSettingsNormalizer((input) =>
  normalizeMusicSettings(input) as unknown as Record<string, unknown>,
);