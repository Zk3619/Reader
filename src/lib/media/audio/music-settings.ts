/**
 * 音乐设置持久化（对齐 lx defaultSetting 键名子集）
 */

import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import {
  EQ_PRESETS,
  SOUND_CONVOLUTION_PRESETS,
  type SoundConvolutionPreset,
} from '@/lib/media/audio/engine/web-audio-player';
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
import { clampVisualizerFps } from '@/lib/media/audio/music-audio-visualizer-fps';
import {
  normalizeMusicLyricCustomPresets,
  type MusicLyricCustomPreset,
} from '@/lib/media/audio/music-lyric-color-presets';

const STORAGE_KEY = 'reader_music_settings';
const LEGACY_FALLBACK_STORAGE_KEY = 'reader_audio_fallback_enabled';
const ACTIVE_PLAYLIST_STORAGE_KEY = 'reader_music_active_playlist_id';
/** 跨 WebView 同步音乐设置（storage 事件不可靠） */
export const MUSIC_SETTINGS_CHANGED_EVENT = 'music-settings-changed';
export const MUSIC_SETTINGS_SCHEMA_VERSION = 33;
const listeners = new Set<(settings: MusicSettings) => void>();
let remoteListenStarted = false;
/** 避免本窗 emit → 本窗 listen → 再次 emit 的环 */
let applyingRemoteSettings = false;
/**
 * 内存态设置（对齐 textViewerStore.config）：
 * setMusicSettings 先更新此处并通知订阅方，持久化/跨窗广播防抖，避免滑块拖动时同步写盘卡顿。
 */
let memorySettings: MusicSettings | null = null;
let persistTimer: number | null = null;
const PERSIST_DEBOUNCE_MS = 300;
/** warmMusicConfigCache 完成前禁止写入 settings.json，避免 DEFAULTS 冲掉真实配置 */
let musicConfigPersistEnabled = false;
/** hydrate 前用户已改过内存设置 */
let musicSettingsDirtyBeforeWarm = false;

export type MusicSearchControlStyle = 'select' | 'tabs';
/** 音乐搜索页列表加载：滚动追加 / 分页切换 */
export type MusicSearchPaginationPreference = 'scroll' | 'pagination';
/** 音乐搜索类型（与 stores/music-hub/search SearchTab 对齐） */
export type MusicSearchTab =
  | 'song'
  | 'album'
  | 'artist'
  | 'sheet'
  | 'lyric'
  | 'playlist';
/** 在线歌单页：标签控件（lx 分组下拉 / 探索页徽标堆叠） */
export type MusicSongListTagControlStyle = 'grouped' | 'stacked';
/** 徽标堆叠时芯片密度：标准（探索页）/ 紧凑（原矮芯片） */
export type MusicSongListTagStackDensity = 'comfortable' | 'compact';
export type MusicLyricAlign = 'left' | 'center' | 'right' | 'justify';
export type MusicListAddPosition = 'top' | 'bottom';
export type MusicLyricDirection = 'horizontal' | 'vertical';
export type MusicLyricLayout = 'default' | 'single' | 'dual';
export type MusicLyricScrollPosition = 'top' | 'center' | 'bottom';
/** 桌面歌词翻译/罗马音相对主歌词的位置 */
export type MusicLyricSecondaryPlacement =
  | 'both-below'
  | 'both-above'
  | 'roma-above-trans-below'
  | 'trans-above-roma-below';
/** 锁定屏幕时可用区域：工作区（任务栏之上）或完整屏幕 */
export type MusicDesktopLyricLockScreenBounds = 'workArea' | 'screen';
/** 桌面歌词标题配色：系统默认 / 跟随已播 / 跟随未播 / 自定义 */
export type MusicDesktopLyricMetaColorMode =
  | 'system'
  | 'followPlayed'
  | 'followUnplayed'
  | 'custom';
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
  defaultSearchTab: MusicSearchTab;
  /** 音乐搜索页：来源选择控件风格 */
  musicSearchSourceControl?: MusicSearchControlStyle;
  /** 音乐搜索页：歌曲/歌单切换控件风格 */
  musicSearchTabControl?: MusicSearchControlStyle;
  /** 音乐搜索页：翻页方式（对齐探索页：滚动加载 / 分页） */
  musicSearchPaginationPreference?: MusicSearchPaginationPreference;
  /** 在线歌单页：来源选择控件风格 */
  musicSongListSourceControl?: MusicSearchControlStyle;
  /** 在线歌单页：上次选中的浏览来源（LX / MF / 平台） */
  musicSongListBrowseSource?: string;
  /** 推荐页：上次选中的来源（LX / netease / MF） */
  musicRecommendSource?: string;
  /** 在线歌单页：排序选择控件风格 */
  musicSongListSortControl?: MusicSearchControlStyle;
  /** 在线歌单页：标签选择控件风格 */
  musicSongListTagControl?: MusicSongListTagControlStyle;
  /** 在线歌单页：徽标堆叠芯片密度 */
  musicSongListTagStackDensity?: MusicSongListTagStackDensity;
  /** 在线歌单页：列表翻页方式（滚动加载 / 分页） */
  musicSongListPaginationPreference?: MusicSearchPaginationPreference;
  /** 在线歌单页：列表/网格视图（对齐书架 ViewMode 子集） */
  musicSongListViewMode?: string;
  /** 在线歌单页：列表/网格间距（0–24，×0.25rem） */
  musicSongListSpacing?: number;
  /** 排行榜页：列表翻页方式（滚动加载 / 分页） */
  musicLeaderboardPaginationPreference?: MusicSearchPaginationPreference;
  /** 歌手页：列表翻页方式（滚动加载 / 分页） */
  musicSingerPaginationPreference?: MusicSearchPaginationPreference;
  /** 专辑页：列表翻页方式（滚动加载 / 分页） */
  musicAlbumPaginationPreference?: MusicSearchPaginationPreference;
  /** 歌手页：发现列表音源（wy / kg） */
  musicSingerListSource?: 'wy' | 'kg';
  /** 专辑页：发现列表音源（wy / kg） */
  musicAlbumListSource?: 'wy' | 'kg';
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
  /** 播放详情频谱可视化帧率（fps） */
  playDetailAudioVisualizerFps: number;
  /** 环境卷积混响预设（对齐 LX player.soundEffect.convolution） */
  soundConvolutionPreset: SoundConvolutionPreset;
  /** 原始音频增益（对齐 LX convolution.mainGain / 10） */
  soundConvolutionMainGain: number;
  /** 环境音效增益（对齐 LX convolution.sendGain / 10） */
  soundConvolutionSendGain: number;
  /** 环绕声像开关（对齐 LX player.soundEffect.panner.enable） */
  soundPannerEnabled: boolean;
  /** 环绕声像速度 0.5–2（对齐 LX panner.speed 语义简化） */
  soundPannerSpeed: number;
  /**
   * Android：把当前歌词行推到通知/车机 metadata（蓝牙歌词通道的轻量对齐）。
   * 开启后 title 优先显示歌词行，artist 保留歌名·歌手。
   */
  bluetoothLyricEnabled: boolean;
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
  /** 播放详情：切行后延迟再滚动（毫秒；0=立即；默认 600 对齐桌面歌词） */
  playDetailLyricScrollDelayMs: number;
  /** @deprecated 播放详情固定默认布局，保留字段仅供旧配置迁移 */
  playDetailLyricLayout: MusicLyricLayout;
  /** 播放详情：正在播放歌词滚动位置 */
  playDetailLyricScrollPosition: MusicLyricScrollPosition;
  /** 播放详情：逐字加粗 */
  playDetailBoldFont: boolean;
  /** 播放详情：逐行加粗 */
  playDetailBoldLine: boolean;
  /** 播放详情：翻译/罗马音加粗 */
  playDetailBoldExtended: boolean;
  /** 播放详情：翻译/罗马音相对主歌词位置 */
  playDetailSecondaryPlacement: MusicLyricSecondaryPlacement;
  /** 播放详情：同侧时翻译/罗马音顺序 */
  playDetailSecondaryOrder: 'translation-first' | 'roma-first';
  /** 播放详情已播放字色（空=主题色） */
  playDetailLyricPlayedColor: string;
  /** 播放详情未播放字色（空=主题色） */
  playDetailLyricUnplayedColor: string;
  playDetailLyricColorPreset: string;
  playDetailLyricUnplayedShadow: boolean;
  playDetailLyricUnplayedShadowColor: string;
  playDetailLyricPlayedShadow: boolean;
  playDetailLyricPlayedShadowColor: string;
  /** 播放详情以独立全视口覆盖层展示（覆盖主壳顶栏/侧栏） */
  playDetailStandalone: boolean;
  /** 隐藏播放详情顶栏，将返回/设置按钮分布到内容顶部 */
  playDetailHideHeader: boolean;
  /** 桌面端评论/播放队列使用右侧抽屉，而非可调整宽度的内嵌面板 */
  playDetailDesktopSidePaneDrawer: boolean;
  /** 播放详情以模糊封面作为背景 */
  playDetailBlurCoverBackground: boolean;
  /** 模糊封面背景的模糊半径（px） */
  playDetailBlurCoverPx: number;
  /** 模糊封面背景不透明度（0–100，越大封面越清晰） */
  playDetailBlurCoverOpacity: number;
  /**
   * 模糊封面背景下：字体/图标等前景色跟随封面主色（单色自适应）
   * 仅在 playDetailBlurCoverBackground 开启时生效
   */
  playDetailAdaptiveForeground: boolean;
  allowProgressBarSeek: boolean;
  playQuality: import('@/lib/media/audio/lyric-types').MusicQuality;
  playQualityPreference:
    | import('@/lib/media/audio/lyric-types').MusicQuality
    | 'lowest'
    | 'highest';
  /**
   * 遗留字段：生产固定为 userApi（对齐 LX，无内置取链入口）。
   * 写入 auto/builtin 会被 normalize 强制回落。
   */
  urlSourceMode: 'userApi';
  fallbackUrl: boolean;
  fallbackLyric: boolean;
  fallbackPic: boolean;
  /**
   * findMusic / 跨源换源：多级打分排序（关则用旧版固定过滤顺序）
   */
  findMusicScoredMatch: boolean;
  /** 本地曲播放时自动 findMusic 补封面/歌词挂载（播放仍走本地文件） */
  autoMatchLocalOnline: boolean;
  /** 批量本地曲在线匹配上限 */
  localOnlineMatchBatchLimit: number;
  /** 播放中用当前歌词行覆盖窗口标题 */
  showTitleLyric: boolean;
  /** macOS：托盘/状态栏显示当前歌词行 */
  showStatusBarLyric: boolean;
  /** 邻曲交叉淡入淡出（非编解码级 gapless） */
  crossfadeEnabled: boolean;
  /** crossfade 时长 ms（0–5000；0 且开启时仍预载下一首后硬切） */
  crossfadeMs: number;
  /** WebDAV 远程曲库：播放时落盘缓存 */
  webdavRemoteCacheEnabled: boolean;
  /** WebDAV 远程曲库：目录递归深度 */
  webdavRemoteMaxDepth: number;
  /** WebDAV 曲库相对根路径（相对 webDavDir） */
  webdavRemoteMusicPath: string;
  /** 应用启动并恢复上次歌曲后是否自动开始播放。 */
  startupAutoPlay: boolean;
  /**
   * 是否为音乐模块启用主壳全局播放窗（离开音乐页后显示控制条）。
   * 不影响阅读模块朗读后台条 / 听书。
   */
  enableGlobalMediaPlayer: boolean;
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
  /**
   * 对齐 LX `list.isClickPlayList`：列表歌曲触发时切换到当前列表播放。
   * 开启：搜索整页 / 歌单 / 排行榜以临时队列播放；关闭：搜索结果加入「播放列表」。
   * 手势：桌面双击、移动壳层单击（与 LX desktop / mobile 一致）。
   */
  listDoubleClickToPlay: boolean;
  listClearQueueOnSwitch: boolean;
  downloadConcurrent: number;
  downloadSkipExisting: boolean;
  downloadEnabled: boolean;
  downloadTargetDirectory: string;
  downloadGroupByPlaylist: boolean;
  downloadSaveLyricFile: boolean;
  /** 旁路 .lrc 写入 LX 扩展轨 awlrc（对齐 download.isDownloadLxLrc） */
  downloadSaveLxLyric: boolean;
  /** 旁路 .lrc 追加翻译明文 */
  downloadSaveTLyric: boolean;
  /** 旁路 .lrc 追加罗马音明文 */
  downloadSaveRLyric: boolean;
  /** 旁路 .lrc 编码：utf8（带 BOM）| gbk（仅 Tauri） */
  downloadLrcFormat: 'utf8' | 'gbk';
  /** 将歌词嵌入到 MP3 ID3（USLT） */
  downloadEmbedLyric: boolean;
  /** 嵌入时包含 LX 扩展轨 awlrc */
  downloadEmbedLxLyric: boolean;
  downloadEmbedTLyric: boolean;
  downloadEmbedRLyric: boolean;
  /** 将封面嵌入到 MP3 ID3（APIC） */
  downloadEmbedCover: boolean;
  downloadSourceStrategy: MusicDownloadSourceStrategy;
  /** 取链失败时使用播放缓存按原格式写出（默认关闭） */
  downloadUseCacheFallback: boolean;
  syncAutoUpdateLists: boolean;
  /** 平台账号（网易/B站/YTM）：登录后自动同步一次我的歌单/收藏到「我的列表」（Kazumi 式开关） */
  platformPlaylistSyncAfterLogin: boolean;
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
  /** 设置页字号/间距输入单位（存储仍为 px） */
  desktopLyricFontSizeUnit?: MusicFontSizeUnit;
  desktopLyricLineGapUnit?: MusicFontSizeUnit;
  desktopLyricMetaFontSizeUnit?: MusicFontSizeUnit;
  /** 是否显示歌名与艺术家（关闭后移除该区域） */
  desktopLyricShowMeta: boolean;
  /** 歌名/艺术家字号（px） */
  desktopLyricMetaFontSize?: number;
  /** 歌名/艺术家不透明度 0–1 */
  desktopLyricMetaOpacity?: number;
  /** 歌名/艺术家加粗 */
  desktopLyricMetaBold: boolean;
  /** 标题配色风格 */
  desktopLyricMetaColorMode: MusicDesktopLyricMetaColorMode;
  /** 自定义标题颜色（mode=custom） */
  desktopLyricMetaColor: string;
  /** 自定义标题描边 */
  desktopLyricMetaShadow: boolean;
  desktopLyricMetaShadowColor: string;
  /** 自定义标题配色预设 id（builtin / custom / system） */
  desktopLyricMetaColorPreset: string;
  desktopLyricAlign: MusicLyricAlign;
  desktopLyricZoomActive: boolean;
  /** 桌面歌词当前行缩放倍率 */
  desktopLyricZoomActiveScale: number;
  /** 歌词布局：默认多行 / 单行 / 双行 */
  desktopLyricLayout: MusicLyricLayout;
  /** @deprecated 由 desktopLyricLayout === 'single' 推导 */
  desktopLyricSingleLine: boolean;
  /** 切到单行/双行时把歌词窗收缩到刚好容纳内容的高度，切回默认布局还原 */
  desktopLyricCompactAutoShrink: boolean;
  /** 桌面歌词是否显示翻译（独立于播放详情 showLyricTranslation） */
  desktopLyricShowTranslation: boolean;
  /** 桌面歌词是否显示罗马音（独立于播放详情 showLyricRoma） */
  desktopLyricShowRoma: boolean;
  /**
   * 翻译/罗马音相对主歌词的位置：
   * both-below / both-above 时由 desktopLyricSecondaryOrder 决定二者先后；
   * roma-above-trans-below / trans-above-roma-below 为分侧固定。
   */
  desktopLyricSecondaryPlacement: MusicLyricSecondaryPlacement;
  /** 都在主歌词同侧时的上下顺序：翻译优先 / 罗马音优先 */
  desktopLyricSecondaryOrder: 'translation-first' | 'roma-first';
  desktopLyricMaxLines: number;
  desktopLyricColorPreset: string;
  desktopLyricPlayedColor: string;
  desktopLyricUnplayedColor: string;
  desktopLyricLocked: boolean;
  desktopLyricAlwaysOnTop: boolean;
  /** 暂停时降低歌词不透明度（对齐 LX desktopLyric.pauseHide） */
  desktopLyricHideWhenPaused: boolean;
  desktopLyricHideWhenFullscreen: boolean;
  /** 桌面歌词窗口内音频可视化（对齐 LX desktopLyric.audioVisualization） */
  desktopLyricAudioVisualization: boolean;
  /** 桌面歌词频谱 IPC 帧率（fps） */
  desktopLyricAudioVisualizerFps: number;
  /** 延迟歌词滚动（对齐 LX desktopLyric.isDelayScroll） */
  desktopLyricDelayScroll: boolean;
  /** 桌面歌词延迟滚动毫秒（开启时生效；默认 600） */
  desktopLyricScrollDelayMs: number;
  /** 在任务栏显示歌词进程（对齐 LX desktopLyric.isShowTaskbar） */
  desktopLyricShowTaskbar: boolean;
  /** 自动刷新歌词置顶（对齐 LX desktopLyric.isAlwaysOnTopLoop） */
  desktopLyricAlwaysOnTopLoop: boolean;
  /** 不允许歌词窗口拖出主屏幕（对齐 LX desktopLyric.isLockScreen） */
  desktopLyricLockScreen: boolean;
  /** 锁定屏幕时的下边界：工作区（任务栏之上）或真实屏幕边缘 */
  desktopLyricLockScreenBounds: MusicDesktopLyricLockScreenBounds;
  /** 鼠标移入时降低歌词不透明度（对齐 LX desktopLyric.isHoverHide） */
  desktopLyricHoverHide: boolean;
  desktopLyricDirection: MusicLyricDirection;
  desktopLyricScrollPosition: MusicLyricScrollPosition;
  desktopLyricFontFamily: string;
  /** 行间距（px，对齐 LX desktopLyric.style.lineGap） */
  desktopLyricLineGap: number;
  desktopLyricLineHeight: number;
  /** 未播放描边/外发光 */
  desktopLyricUnplayedShadow: boolean;
  desktopLyricUnplayedShadowColor: string;
  /** 已播放描边/外发光 */
  desktopLyricPlayedShadow: boolean;
  desktopLyricPlayedShadowColor: string;
  /** @deprecated 使用 desktopLyricUnplayedShadow */
  desktopLyricShadow: boolean;
  /** @deprecated 使用 desktopLyricUnplayedShadowColor */
  desktopLyricShadowColor: string;
  /** @deprecated 使用 desktopLyricBoldFont/Line/Extended */
  desktopLyricBold: boolean;
  desktopLyricBoldFont: boolean;
  desktopLyricBoldLine: boolean;
  desktopLyricBoldExtended: boolean;
  desktopLyricWrap: boolean;
  /** 桌面迷你播放窗（对齐 MusicFree MiniMode） */
  miniModeEnabled: boolean;
  miniModeWidth?: number;
  miniModeHeight?: number;
  miniModeX?: number;
  miniModeY?: number;
  miniModeAlwaysOnTop: boolean;
  /** 不允许迷你窗拖出主屏幕（对齐桌面歌词 lockScreen） */
  miniModeLockScreen: boolean;
  /** 锁定屏幕时的下边界：工作区（任务栏之上）或真实屏幕边缘 */
  miniModeLockScreenBounds: MusicDesktopLyricLockScreenBounds;
  /** 贴边自动收起为一侧细条（左/右/顶/底），悬停展开（自定义拖拽，避免触发 Windows Snap） */
  miniModeEdgeAutoHide: boolean;
  /** 上次贴边收起侧：重启后恢复隐藏态；none 表示展开 */
  miniModeEdgeSide: 'none' | 'left' | 'right' | 'top' | 'bottom';
  /**
   * 启用迷你窗拖拽（与 miniModeGestureEnabled 互斥，可都不选）。
   * 贴边收起依赖拖拽。
   */
  miniModeDragEnabled: boolean;
  /** 启用迷你窗左右滑动切歌手势（与 miniModeDragEnabled 互斥，可都不选） */
  miniModeGestureEnabled: boolean;
  /** 允许移动网络播放在线音源（对齐 MF basic.useCelluarNetworkPlay） */
  useCellularNetworkPlay: boolean;
  /** 允许移动网络下载（对齐 MF basic.useCelluarNetworkDownload） */
  useCellularNetworkDownload: boolean;
  /**
   * 蜂窝网络下强制最低音质（与拦截正交：允许播放时仍可降质省流量）
   */
  cellularForceLowestQuality: boolean;
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
  /** 用户自定义歌词颜色预设（播放详情 / 桌面歌词共用） */
  customLyricColorPresets: MusicLyricCustomPreset[];
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
  musicSongListBrowseSource: 'wy',
  musicRecommendSource: 'wy',
  musicSongListSortControl: 'select',
  musicSongListTagControl: 'grouped',
  musicSongListTagStackDensity: 'comfortable',
  /** 对齐 lx 歌单默认用分页条 */
  musicSongListPaginationPreference: 'pagination',
  musicSongListViewMode: 'list-2',
  musicSongListSpacing: 12,
  /** 对齐 lx 排行榜默认用分页条 */
  musicLeaderboardPaginationPreference: 'pagination',
  musicSingerPaginationPreference: 'pagination',
  musicAlbumPaginationPreference: 'pagination',
  musicSingerListSource: 'wy',
  musicAlbumListSource: 'wy',
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
  playDetailAudioVisualizerFps: 60,
  soundConvolutionPreset: 'off',
  soundConvolutionMainGain: 0.75,
  soundConvolutionSendGain: 0.35,
  soundPannerEnabled: false,
  soundPannerSpeed: 1,
  bluetoothLyricEnabled: false,
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
  playDetailLyricScrollDelayMs: 600,
  playDetailLyricLayout: 'default',
  playDetailLyricScrollPosition: 'center',
  playDetailBoldFont: true,
  playDetailBoldLine: true,
  playDetailBoldExtended: true,
  playDetailSecondaryPlacement: 'both-below',
  playDetailSecondaryOrder: 'roma-first',
  playDetailLyricPlayedColor: '',
  playDetailLyricUnplayedColor: '',
  playDetailLyricColorPreset: 'system',
  playDetailLyricUnplayedShadow: false,
  playDetailLyricUnplayedShadowColor: 'rgba(0, 0, 0, 0.18)',
  playDetailLyricPlayedShadow: false,
  playDetailLyricPlayedShadowColor: 'rgba(0, 0, 0, 0.28)',
  playDetailStandalone: false,
  playDetailHideHeader: false,
  playDetailDesktopSidePaneDrawer: false,
  playDetailBlurCoverBackground: true,
  playDetailBlurCoverPx: 40,
  playDetailBlurCoverOpacity: 45,
  playDetailAdaptiveForeground: false,
  allowProgressBarSeek: true,
  playQuality: '320k',
  playQualityPreference: '320k',
  /** 遗留：恒为 userApi，见 schema≥21 */
  urlSourceMode: 'userApi',
  fallbackUrl: true,
  fallbackLyric: true,
  fallbackPic: true,
  findMusicScoredMatch: true,
  autoMatchLocalOnline: true,
  localOnlineMatchBatchLimit: 200,
  showTitleLyric: false,
  showStatusBarLyric: false,
  crossfadeEnabled: false,
  /** 开启后默认约 1.2s 缓入缓出（对照 Neri 听感微调） */
  crossfadeMs: 1200,
  webdavRemoteCacheEnabled: false,
  webdavRemoteMaxDepth: 5,
  webdavRemoteMusicPath: 'music',
  startupAutoPlay: false,
  enableGlobalMediaPlayer: true,
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
  downloadSaveLxLyric: true,
  downloadSaveTLyric: false,
  downloadSaveRLyric: false,
  downloadLrcFormat: 'utf8',
  downloadEmbedLyric: false,
  downloadEmbedLxLyric: true,
  downloadEmbedTLyric: false,
  downloadEmbedRLyric: false,
  downloadEmbedCover: false,
  downloadSourceStrategy: 'fallback',
  downloadUseCacheFallback: false,
  syncAutoUpdateLists: true,
  platformPlaylistSyncAfterLogin: false,
  desktopLyricEnabled: false,
  desktopLyricWidth: 600,
  desktopLyricHeight: 200,
  desktopLyricPenetrate: false,
  desktopLyricPenetrateIgnoreChrome: false,
  desktopLyricTrack: 'lxlyric',
  desktopLyricFontSize: 20,
  desktopLyricFontSizeUnit: 'px',
  desktopLyricLineGapUnit: 'px',
  desktopLyricMetaFontSizeUnit: 'px',
  desktopLyricOpacity: 0.85,
  desktopLyricShowMeta: true,
  desktopLyricMetaFontSize: 14,
  desktopLyricMetaOpacity: 0.7,
  desktopLyricMetaBold: false,
  desktopLyricMetaColorMode: 'system',
  desktopLyricMetaColor: '#ffffff',
  desktopLyricMetaShadow: false,
  desktopLyricMetaShadowColor: 'rgba(0, 0, 0, 0.35)',
  desktopLyricMetaColorPreset: 'system',
  desktopLyricAlign: 'center',
  desktopLyricZoomActive: true,
  desktopLyricZoomActiveScale: 1.28,
  desktopLyricLayout: 'default',
  desktopLyricSingleLine: false,
  desktopLyricCompactAutoShrink: false,
  desktopLyricShowTranslation: false,
  desktopLyricShowRoma: false,
  desktopLyricSecondaryPlacement: 'both-below',
  desktopLyricSecondaryOrder: 'roma-first',
  desktopLyricMaxLines: 5,
  desktopLyricColorPreset: 'system',
  desktopLyricPlayedColor: '',
  desktopLyricUnplayedColor: '',
  desktopLyricLocked: false,
  desktopLyricAlwaysOnTop: true,
  desktopLyricHideWhenPaused: true,
  desktopLyricHideWhenFullscreen: true,
  desktopLyricAudioVisualization: false,
  desktopLyricAudioVisualizerFps: 60,
  desktopLyricDelayScroll: true,
  desktopLyricScrollDelayMs: 600,
  desktopLyricShowTaskbar: false,
  desktopLyricAlwaysOnTopLoop: false,
  desktopLyricLockScreen:
    typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent),
  desktopLyricLockScreenBounds: 'workArea',
  desktopLyricHoverHide: false,
  desktopLyricDirection: 'horizontal',
  desktopLyricScrollPosition: 'center',
  desktopLyricFontFamily: '',
  desktopLyricLineGap: 15,
  desktopLyricLineHeight: 1.5,
  desktopLyricUnplayedShadow: false,
  desktopLyricUnplayedShadowColor: 'rgba(0, 0, 0, 0.18)',
  desktopLyricPlayedShadow: false,
  desktopLyricPlayedShadowColor: 'rgba(0, 0, 0, 0.28)',
  desktopLyricShadow: true,
  desktopLyricShadowColor: 'rgba(0, 0, 0, 0.18)',
  desktopLyricBold: false,
  desktopLyricBoldFont: true,
  desktopLyricBoldLine: true,
  desktopLyricBoldExtended: true,
  desktopLyricWrap: true,
  miniModeEnabled: false,
  miniModeWidth: 380,
  miniModeHeight: 88,
  miniModeAlwaysOnTop: true,
  miniModeLockScreen:
    typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent),
  miniModeLockScreenBounds: 'workArea',
  miniModeEdgeAutoHide: true,
  miniModeEdgeSide: 'none',
  miniModeDragEnabled: true,
  miniModeGestureEnabled: false,
  useCellularNetworkPlay: false,
  useCellularNetworkDownload: false,
  cellularForceLowestQuality: true,
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
  customLyricColorPresets: [],
  musicVolume: 1,
  musicMuted: false,
};

const ENUM_VALUES: Partial<Record<keyof MusicSettings, readonly unknown[]>> = {
  defaultSearchTab: ['song', 'album', 'artist', 'sheet', 'lyric', 'playlist'],
  musicSearchSourceControl: ['select', 'tabs'],
  musicSearchTabControl: ['select', 'tabs'],
  musicSearchPaginationPreference: ['scroll', 'pagination'],
  musicSongListSourceControl: ['select', 'tabs'],
  musicSongListSortControl: ['select', 'tabs'],
  musicSongListTagControl: ['grouped', 'stacked'],
  musicSongListTagStackDensity: ['comfortable', 'compact'],
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
  musicSingerPaginationPreference: ['scroll', 'pagination'],
  musicAlbumPaginationPreference: ['scroll', 'pagination'],
  musicSingerListSource: ['wy', 'kg'],
  musicAlbumListSource: ['wy', 'kg'],
  eqPreset: Object.keys(EQ_PRESETS),
  soundConvolutionPreset: SOUND_CONVOLUTION_PRESETS,
  lyricTrack: ['lyric', 'tlyric', 'rlyric', 'lxlyric'],
  lyricSecondaryOrder: ['translation-first', 'roma-first'],
  desktopLyricSecondaryOrder: ['translation-first', 'roma-first'],
  desktopLyricSecondaryPlacement: [
    'both-below',
    'both-above',
    'roma-above-trans-below',
    'trans-above-roma-below',
  ],
  lyricChineseConversion: [0, 1, 2],
  playDetailLyricAlign: ['left', 'center', 'right'],
  playDetailLyricLayout: ['default', 'single', 'dual'],
  playDetailLyricScrollPosition: ['top', 'center', 'bottom'],
  playDetailSecondaryPlacement: [
    'both-below',
    'both-above',
    'roma-above-trans-below',
    'trans-above-roma-below',
  ],
  playDetailSecondaryOrder: ['translation-first', 'roma-first'],
  desktopLyricLayout: ['default', 'single', 'dual'],
  playDetailLyricFontSizeUnit: ['rem', 'px'],
  desktopLyricFontSizeUnit: ['rem', 'px'],
  desktopLyricLineGapUnit: ['rem', 'px'],
  desktopLyricMetaFontSizeUnit: ['rem', 'px'],
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
  urlSourceMode: ['userApi'],
  listAddPosition: ['top', 'bottom'],
  desktopLyricTrack: ['lyric', 'tlyric', 'rlyric', 'lxlyric'],
  desktopLyricAlign: ['left', 'center', 'right', 'justify'],
  desktopLyricDirection: ['horizontal', 'vertical'],
  desktopLyricLockScreenBounds: ['workArea', 'screen'],
  miniModeLockScreenBounds: ['workArea', 'screen'],
  desktopLyricMetaColorMode: ['system', 'followPlayed', 'followUnplayed', 'custom'],
  desktopLyricScrollPosition: ['top', 'center', 'bottom'],
  downloadQuality: ['128k', '192k', '320k', 'flac', 'flac24bit', 'ape', 'wav'],
  downloadSourceStrategy: ['primary', 'fallback'],
  downloadUseCacheFallback: [true, false],
  downloadLrcFormat: ['utf8', 'gbk'],
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
  'player.soundEffect.panner.enable': 'soundPannerEnabled',
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
  'desktopLyric.style.lyricShadowColor': 'desktopLyricShadowColor',
  'desktopLyric.style.font': 'desktopLyricFontFamily',
  'desktopLyric.style.lineGap': 'desktopLyricLineGap',
  'desktopLyric.style.isFontWeightFont': 'desktopLyricBoldFont',
  'desktopLyric.style.isFontWeightLine': 'desktopLyricBoldLine',
  'desktopLyric.style.isFontWeightExtended': 'desktopLyricBoldExtended',
  'desktopLyric.enable': 'desktopLyricEnabled',
  'desktopLyric.isLock': 'desktopLyricLocked',
  'desktopLyric.isAlwaysOnTop': 'desktopLyricAlwaysOnTop',
  'desktopLyric.isAlwaysOnTopLoop': 'desktopLyricAlwaysOnTopLoop',
  'desktopLyric.isShowTaskbar': 'desktopLyricShowTaskbar',
  'desktopLyric.pauseHide': 'desktopLyricHideWhenPaused',
  'desktopLyric.fullscreenHide': 'desktopLyricHideWhenFullscreen',
  'desktopLyric.audioVisualization': 'desktopLyricAudioVisualization',
  'desktopLyric.isDelayScroll': 'desktopLyricDelayScroll',
  'desktopLyric.isLockScreen': 'desktopLyricLockScreen',
  'desktopLyric.isHoverHide': 'desktopLyricHoverHide',
  'desktopLyric.direction': 'desktopLyricDirection',
  'desktopLyric.scrollAlign': 'desktopLyricScrollPosition',
  'basic.useCelluarNetworkPlay': 'useCellularNetworkPlay',
  'basic.useCelluarNetworkDownload': 'useCellularNetworkDownload',
  'basic.cellularForceLowestQuality': 'cellularForceLowestQuality',
  'list.isShowSource': 'listShowSource',
  'list.isSaveScrollLocation': 'listSaveScrollPosition',
  'list.actionButtonsVisible': 'listActionButtonsVisible',
  'list.addMusicLocationType': 'listAddPosition',
  'download.maxDownloadNum': 'downloadConcurrent',
  'download.skipExistFile': 'downloadSkipExisting',
  'download.fileName': 'downloadFileNameTemplate',
  'download.isDownloadLrc': 'downloadSaveLyricFile',
  'download.isDownloadLxLrc': 'downloadSaveLxLyric',
  'download.isDownloadTLrc': 'downloadSaveTLyric',
  'download.isDownloadRLrc': 'downloadSaveRLyric',
  'download.lrcFormat': 'downloadLrcFormat',
  'download.isEmbedLyric': 'downloadEmbedLyric',
  'download.isEmbedLyricLx': 'downloadEmbedLxLyric',
  'download.isEmbedLyricT': 'downloadEmbedTLyric',
  'download.isEmbedLyricR': 'downloadEmbedRLyric',
  'download.isEmbedPic': 'downloadEmbedCover',
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
    mapped.desktopLyricWrap === undefined &&
    typeof raw['desktopLyric.style.ellipsis'] === 'boolean'
  ) {
    mapped.desktopLyricWrap = !raw['desktopLyric.style.ellipsis'];
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
  if (
    mapped.soundConvolutionPreset === undefined &&
    typeof raw['player.soundEffect.convolution.fileName'] === 'string'
  ) {
    const name = raw['player.soundEffect.convolution.fileName'].toLowerCase();
    if (!name.trim()) mapped.soundConvolutionPreset = 'off';
    else if (name.includes('telephone')) mapped.soundConvolutionPreset = 'telephone';
    else if (name.includes('cinema')) mapped.soundConvolutionPreset = 'cinema';
    else if (name.includes('dining') || name.includes('dining_living')) {
      mapped.soundConvolutionPreset = 'dining';
    } else if (name.includes('bedroom') || name.includes('living_bedroom')) {
      mapped.soundConvolutionPreset = 'bathroom';
    } else if (name.includes('spring')) mapped.soundConvolutionPreset = 'spring';
    else if (name.includes('matrix_2') || name.includes('matrix-2') || name.includes('matrix2')) {
      mapped.soundConvolutionPreset = 'matrix2';
    } else if (name.includes('matrix')) mapped.soundConvolutionPreset = 'matrix1';
    else if (name.includes('s2_r4') || name.includes('church')) {
      mapped.soundConvolutionPreset = 'church';
    } else if (name.includes('s3_r1') || name.includes('stereo')) {
      mapped.soundConvolutionPreset = 'stereo';
    } else if (name.includes('cardiod') || name.includes('heart')) {
      mapped.soundConvolutionPreset = 'cardiod';
    } else if (name.includes('magnetic') || name.includes('omni')) {
      mapped.soundConvolutionPreset = 'magnetic';
    } else if (name.includes('hall') || name.includes('bright')) {
      mapped.soundConvolutionPreset = 'hall';
    } else if (name.includes('spreader') || name.includes('room') || name.includes('indoor')) {
      mapped.soundConvolutionPreset = 'room';
    } else mapped.soundConvolutionPreset = 'room';
  }
  if (
    mapped.soundConvolutionMainGain === undefined &&
    typeof raw['player.soundEffect.convolution.mainGain'] === 'number'
  ) {
    mapped.soundConvolutionMainGain = Math.max(
      0,
      Math.min(5, raw['player.soundEffect.convolution.mainGain'] / 10),
    );
  }
  if (
    mapped.soundConvolutionSendGain === undefined &&
    typeof raw['player.soundEffect.convolution.sendGain'] === 'number'
  ) {
    mapped.soundConvolutionSendGain = Math.max(
      0,
      Math.min(5, raw['player.soundEffect.convolution.sendGain'] / 10),
    );
  }
  if (
    mapped.soundPannerSpeed === undefined &&
    typeof raw['player.soundEffect.panner.speed'] === 'number'
  ) {
    // LX 默认 25；折算到本项目 0.5–2（默认 1）
    mapped.soundPannerSpeed = Math.max(
      0.5,
      Math.min(2, raw['player.soundEffect.panner.speed'] / 25),
    );
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
    case 'soundPannerSpeed':
      return Math.max(0.5, Math.min(2, Math.round(value * 100) / 100));
    case 'soundConvolutionMainGain':
    case 'soundConvolutionSendGain':
      return Math.max(0, Math.min(5, value));
    case 'desktopLyricOpacity':
      return Math.max(0, Math.min(1, value));
    case 'desktopLyricMetaOpacity':
      return Math.max(0, Math.min(1, value));
    case 'desktopLyricMetaFontSize':
      return Math.max(10, Math.min(48, Math.round(value)));
    case 'desktopLyricWidth':
      return Math.max(180, Math.min(4000, Math.round(value)));
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
    case 'desktopLyricScrollDelayMs':
      return Math.max(0, Math.min(5000, Math.round(value)));
    case 'playDetailLyricFontSize':
      return clampPlayDetailLyricFontRem(value);
    case 'desktopLyricLineHeight':
      return Math.max(1, Math.min(3, value));
    case 'desktopLyricLineGap':
      return Math.max(0, Math.min(25, Math.round(value)));
    case 'playDetailZoomActiveScale':
    case 'desktopLyricZoomActiveScale':
      return Math.max(1, Math.min(1.8, Math.round(value * 100) / 100));
    case 'playTimeoutSec':
      return Math.max(0, value);
    case 'playTimerTargetAt':
      return Math.max(0, Math.round(value));
    case 'musicSongListSpacing':
      return Math.max(0, Math.min(24, Math.round(value)));
    case 'playDetailAudioVisualizerFps':
    case 'desktopLyricAudioVisualizerFps':
      return clampVisualizerFps(value);
    case 'playDetailBlurCoverPx':
    case 'playDetailBlurCoverOpacity':
      return Math.max(0, Math.min(100, Math.round(value)));
    case 'localOnlineMatchBatchLimit':
      return Math.max(1, Math.min(2000, Math.round(value)));
    case 'crossfadeMs':
      return Math.max(0, Math.min(5000, Math.round(value)));
    case 'webdavRemoteMaxDepth':
      return Math.max(1, Math.min(10, Math.round(value)));
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
  normalized.customLyricColorPresets = normalizeMusicLyricCustomPresets(
    source.customLyricColorPresets,
  );
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
  for (const key of ['miniModeX', 'miniModeY', 'miniModeWidth', 'miniModeHeight'] as const) {
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
  // 阴影字段迁移
  if (source.desktopLyricShadow !== undefined && source.desktopLyricUnplayedShadow === undefined) {
    normalized.desktopLyricUnplayedShadow = source.desktopLyricShadow as boolean;
  }
  if (
    typeof source.desktopLyricShadowColor === 'string' &&
    source.desktopLyricUnplayedShadowColor === undefined
  ) {
    normalized.desktopLyricUnplayedShadowColor = source.desktopLyricShadowColor;
  }
  normalized.desktopLyricShadow = normalized.desktopLyricUnplayedShadow;
  normalized.desktopLyricShadowColor = normalized.desktopLyricUnplayedShadowColor;
  // 布局迁移
  if (source.desktopLyricLayout === undefined) {
    normalized.desktopLyricLayout = source.desktopLyricSingleLine ? 'single' : 'default';
  }
  normalized.desktopLyricSingleLine = normalized.desktopLyricLayout === 'single';
  normalized.playDetailLyricLayout = 'default';
  if (
    normalized.desktopLyricLayout !== 'dual' &&
    normalized.desktopLyricAlign === 'justify'
  ) {
    normalized.desktopLyricAlign = 'center';
  }
  if (source.playDetailLyricLayout === undefined && source.playDetailLyricSingleLine === true) {
    normalized.playDetailLyricLayout = 'default';
  }
  if (normalized.desktopLyricLockScreenBounds === undefined) {
    normalized.desktopLyricLockScreenBounds = 'workArea';
  }
  if (normalized.miniModeLockScreenBounds === undefined) {
    normalized.miniModeLockScreenBounds = 'workArea';
  }
  if (normalized.miniModeLockScreen === undefined) {
    normalized.miniModeLockScreen =
      typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent);
  }
  if (normalized.miniModeEdgeAutoHide === undefined) {
    normalized.miniModeEdgeAutoHide = true;
  }
  {
    const side = normalized.miniModeEdgeSide;
    if (
      side !== 'none' &&
      side !== 'left' &&
      side !== 'right' &&
      side !== 'top' &&
      side !== 'bottom'
    ) {
      normalized.miniModeEdgeSide = 'none';
    }
  }
  if (normalized.miniModeDragEnabled === undefined) {
    normalized.miniModeDragEnabled = true;
  }
  if (normalized.miniModeGestureEnabled === undefined) {
    normalized.miniModeGestureEnabled = false;
  }
  // 拖拽与手势互斥：若历史数据两端皆为 true，保留拖拽
  if (normalized.miniModeDragEnabled && normalized.miniModeGestureEnabled) {
    normalized.miniModeGestureEnabled = false;
  }
  if (normalized.desktopLyricMetaColorMode === undefined) {
    normalized.desktopLyricMetaColorMode = 'system';
  }
  if (typeof normalized.desktopLyricMetaColor !== 'string') {
    normalized.desktopLyricMetaColor = '#ffffff';
  }
  if (normalized.desktopLyricMetaShadow === undefined) {
    normalized.desktopLyricMetaShadow = false;
  }
  if (typeof normalized.desktopLyricMetaShadowColor !== 'string') {
    normalized.desktopLyricMetaShadowColor = 'rgba(0, 0, 0, 0.35)';
  }
  if (typeof normalized.desktopLyricMetaColorPreset !== 'string') {
    normalized.desktopLyricMetaColorPreset = 'system';
  }
  // schema < 15：system 预设统一为主题语义（播放详情 / 桌面歌词）
  if ((source.schemaVersion as number | undefined) === undefined || (source.schemaVersion as number) < 15) {
    if (normalized.desktopLyricColorPreset === 'system') {
      normalized.desktopLyricPlayedColor = '';
      normalized.desktopLyricUnplayedColor = '';
      normalized.desktopLyricUnplayedShadow = false;
      normalized.desktopLyricPlayedShadow = false;
      normalized.desktopLyricShadow = normalized.desktopLyricUnplayedShadow;
      normalized.desktopLyricShadowColor = normalized.desktopLyricUnplayedShadowColor;
    }
    if (normalized.playDetailLyricColorPreset === 'system') {
      normalized.playDetailLyricPlayedColor = '';
      normalized.playDetailLyricUnplayedColor = '';
      normalized.playDetailLyricUnplayedShadow = false;
      normalized.playDetailLyricPlayedShadow = false;
    }
  }
  // schema < 20：曾将默认 auto 迁为 userApi
  // schema ≥ 21：生产无内置取链入口，任意遗留 auto/builtin 一律强制 userApi
  normalized.urlSourceMode = 'userApi';
  // schema < 26：播放详情延迟滚动旧默认 0 → 600（对齐桌面歌词）
  {
    const prevSchema =
      typeof source.schemaVersion === 'number' ? source.schemaVersion : 0;
    if (
      prevSchema < 26 &&
      (normalized.playDetailLyricScrollDelayMs === 0 ||
        source.playDetailLyricScrollDelayMs === undefined)
    ) {
      normalized.playDetailLyricScrollDelayMs = 600;
    }
    // schema < 27：补齐桌面歌词可调延迟（开启时默认 600）
    if (prevSchema < 27 && source.desktopLyricScrollDelayMs === undefined) {
      normalized.desktopLyricScrollDelayMs = 600;
    }
    // schema < 28：桌面歌词翻译/罗马音从播放器全局开关迁出（保留原值）
    if (prevSchema < 28) {
      if (source.desktopLyricShowTranslation === undefined) {
        normalized.desktopLyricShowTranslation = source.showLyricTranslation === true;
      }
      if (source.desktopLyricShowRoma === undefined) {
        normalized.desktopLyricShowRoma = source.showLyricRoma === true;
      }
      if (source.desktopLyricSecondaryOrder === undefined) {
        normalized.desktopLyricSecondaryOrder =
          source.lyricSecondaryOrder === 'translation-first'
            ? 'translation-first'
            : 'roma-first';
      }
    }
    // schema < 29：补齐副歌词位置（默认都在主歌词之下）
    if (
      prevSchema < 29 &&
      source.desktopLyricSecondaryPlacement === undefined
    ) {
      normalized.desktopLyricSecondaryPlacement = 'both-below';
    }
    // schema < 30：播放详情加粗 / 滚动位 / 副歌词位置
    if (prevSchema < 30) {
      if (source.playDetailSecondaryOrder === undefined) {
        normalized.playDetailSecondaryOrder =
          source.lyricSecondaryOrder === 'translation-first'
            ? 'translation-first'
            : 'roma-first';
      }
      if (source.playDetailSecondaryPlacement === undefined) {
        normalized.playDetailSecondaryPlacement = 'both-below';
      }
      if (source.playDetailLyricScrollPosition === undefined) {
        normalized.playDetailLyricScrollPosition = 'center';
      }
      if (source.playDetailBoldFont === undefined) {
        normalized.playDetailBoldFont = true;
      }
      if (source.playDetailBoldLine === undefined) {
        normalized.playDetailBoldLine = true;
      }
      if (source.playDetailBoldExtended === undefined) {
        normalized.playDetailBoldExtended = true;
      }
    }
    const desktopDelayMs = normalized.desktopLyricScrollDelayMs;
    if (
      normalized.desktopLyricDelayScroll &&
      (typeof desktopDelayMs !== 'number' || desktopDelayMs < 100)
    ) {
      normalized.desktopLyricScrollDelayMs = 600;
    }
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
  if (!musicConfigPersistEnabled) {
    musicSettingsDirtyBeforeWarm = true;
    return;
  }
  patchMusicConfig({ settings: settings as unknown as Record<string, unknown> });
}

function loadSettingsFromStorage(): MusicSettings {
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
  // 仅当本地已有可识别设置时才立刻回写 schema；空态留给 warmMusicConfigCache
  // 之后的 reloadMusicSettingsFromConfig，避免异步 hydrate 前用 DEFAULTS 冲掉 settings.json。
  if (
    Object.keys(raw).length > 0 &&
    raw.schemaVersion !== MUSIC_SETTINGS_SCHEMA_VERSION
  ) {
    writeSettings(settings);
  }
  return settings;
}

/** 对齐阅读器 schedulePersistReaderConfig：拖动期间合并落盘，松手后短暂防抖再写 */
function schedulePersistMusicSettings(settings: MusicSettings): void {
  if (typeof window === 'undefined') {
    writeSettings(settings);
    broadcastMusicSettingsChanged(settings);
    return;
  }
  if (persistTimer != null) clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    // 以当前内存态为准（防抖窗口内可能又有更新）
    const latest = memorySettings ?? settings;
    writeSettings(latest);
    broadcastMusicSettingsChanged(latest);
  }, PERSIST_DEBOUNCE_MS);
}

function flushPersistMusicSettings(settings: MusicSettings): void {
  if (persistTimer != null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  writeSettings(settings);
  broadcastMusicSettingsChanged(settings);
}

function commitMemorySettings(next: MusicSettings): void {
  memorySettings = next;
  for (const listener of listeners) listener(next);
}

export function getMusicSettings(): MusicSettings {
  ensureMusicSettingsRemoteSync();
  if (!memorySettings) {
    memorySettings = loadSettingsFromStorage();
  }
  return memorySettings;
}

/**
 * music.config hydrate 完成后：从已 warm 的配置快照重载内存设置并通知订阅方。
 * 解决「模块初始化早于异步 getStorage」时 UI store / memorySettings 卡在 DEFAULTS 的问题。
 */
export function reloadMusicSettingsFromConfig(): MusicSettings {
  ensureMusicSettingsRemoteSync();
  const warmed = normalizeMusicSettings(peekMusicConfigSync().settings);
  if (persistTimer != null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }

  // hydrate 前用户已改过：只保留相对 DEFAULTS 的差异，合并到 warm 后的真实配置上，
  // 避免把整份 DEFAULTS 写回 settings.json。
  if (musicSettingsDirtyBeforeWarm && memorySettings) {
    const early = memorySettings;
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(DEFAULTS) as (keyof MusicSettings)[]) {
      if (key === 'schemaVersion') continue;
      if (JSON.stringify(early[key]) !== JSON.stringify(DEFAULTS[key])) {
        patch[key as string] = early[key];
      }
    }
    const merged = normalizeMusicSettings({ ...warmed, ...patch });
    musicConfigPersistEnabled = true;
    musicSettingsDirtyBeforeWarm = false;
    memorySettings = merged;
    writeSettings(merged);
    for (const listener of listeners) listener(merged);
    return merged;
  }

  const current = memorySettings;
  musicConfigPersistEnabled = true;
  musicSettingsDirtyBeforeWarm = false;
  if (current && JSON.stringify(current) === JSON.stringify(warmed)) {
    return current;
  }
  memorySettings = warmed;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(warmed));
  } catch {
    /* */
  }
  for (const listener of listeners) listener(warmed);
  return warmed;
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
 * 与当前内存态内容一致时跳过（自广播/storage 回环会把同一份设置再推回来，
 * 若照常通知会让订阅方拿到新对象引用而重跑副作用，如桌面歌词顶栏重播入场动画）。
 */
export function applyRemoteMusicSettings(input: unknown): MusicSettings {
  const next = normalizeMusicSettings(input);
  const current = memorySettings;
  if (current && JSON.stringify(current) === JSON.stringify(next)) {
    return current;
  }
  applyingRemoteSettings = true;
  try {
    if (persistTimer != null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    musicConfigPersistEnabled = true;
    musicSettingsDirtyBeforeWarm = false;
    memorySettings = next;
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

export function setMusicSettings(
  patch: Partial<MusicSettings>,
  options?: { persistImmediate?: boolean },
): void {
  const next = normalizeMusicSettings({ ...getMusicSettings(), ...patch });
  commitMemorySettings(next);
  // 对齐阅读器：内存即时生效；默认防抖落盘/广播，避免拖动滑块时同步写盘导致抖动
  if (options?.persistImmediate) {
    flushPersistMusicSettings(next);
  } else {
    schedulePersistMusicSettings(next);
  }
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

/** 音乐模块是否启用主壳全局播放窗（默认开；不影响阅读朗读后台） */
export function isMusicGlobalMediaPlayerEnabled(): boolean {
  return getMusicSettings().enableGlobalMediaPlayer !== false;
}

export function exportMusicSettings(): string {
  return JSON.stringify(getMusicSettings(), null, 2);
}

export function importMusicSettings(json: string): void {
  const settings = normalizeMusicSettings(JSON.parse(json));
  if (persistTimer != null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  musicConfigPersistEnabled = true;
  musicSettingsDirtyBeforeWarm = false;
  commitMemorySettings(settings);
  flushPersistMusicSettings(settings);
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