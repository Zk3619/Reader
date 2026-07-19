/**
 * 各类 Viewer（text / image / audio / video / file）共享的会话状态与类型
 */

import type { MediaKind } from '@/lib/book-source/book-type';
import type { ContentSession } from '@/lib/media/content-session';
import type {
  AudioPlaybackMode,
  AudioTrack,
  AudioTrackSource,
} from '@/lib/media/audio/track-types';
import type { Book, BookChapter, ReplaceRule } from '@/types';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';

/** lx 式音乐中心主导航分区 */
export type MusicHubSection =
  | 'search'
  | 'songlist'
  | 'leaderboard'
  | 'list'
  | 'download'
  | 'settings'
  | 'nowPlaying';

export type MusicPlayerListKind =
  | 'builtin'
  | 'user'
  | 'online-playlist'
  | 'leaderboard'
  | 'search'
  | 'temporary'
  | 'single';

/** 所有 Viewer 共享的基础状态 */
export interface BaseViewerState {
  book: Book | null;
  catalog: BookChapter[];
  chapterIndex: number;
  chapterPos: number;
  guestReading: boolean;
}

/** 统一 Viewer 状态（text + 非 text 媒体共用同一 store） */
export interface ViewerState extends BaseViewerState {
  kind: MediaKind | null;
  content: string;
  contentLoading: boolean;
  contentFetching: boolean;
  contentBootstrapping: boolean;
  showContent: boolean;
  config: TextViewerUiConfig;
  popCataVisible: boolean;
  readSettingsVisible: boolean;
  miniInterface: boolean;
  rawContent: string;
  mediaUrls: string[];
  primaryUrl: string | null;
  loading: boolean;
  /**
   * 音乐后台播放专用地址（与 mediaUrls 隔离）。
   * 漫画/听书/视频阅读时切歌不得改写 mediaUrls/rawContent/loading，否则会把正文冲成单条音频 URL。
   */
  musicMediaUrls: string[];
  musicPrimaryUrl: string | null;
  /**
   * 音乐播放进度（秒）。与 chapterPos 隔离：文本/漫画阅读进度为 0–1，
   * 后台播歌时进阅读器不得冲掉音乐进度。
   */
  musicPositionSec: number;
  musicLoading: boolean;
  musicError: string | null;
  /** music 模式：获取链接 / 换源过程中的状态提示（对齐 lx setAllStatus） */
  playbackStatus: string | null;
  error: string | null;
  /** 当前章实际命中的替换规则（Legado effectiveReplaceRules） */
  effectiveReplaceRules: ReplaceRule[];
  /** 音频双模式：听书 / 音乐 */
  playbackMode: AudioPlaybackMode;
  /** 平台化统一会话（music 模式必填；audiobook 可由 book 适配） */
  contentSession: ContentSession | null;
  /** music 模式播放队列 */
  trackQueue: AudioTrack[];
  trackIndex: number;
  /**
   * 队列来源：决定失败自动切歌等行为。
   * list = 歌单 / 「我的列表」；search = 搜索结果；other = 榜单/专辑/单曲等。
   */
  musicQueueOrigin: 'search' | 'list' | 'download' | 'other';
  /** 当前播放队列绑定的列表；与侧栏浏览中的 activePlaylistId 相互独立。 */
  playerListId: string | null;
  /** 播放来源列表名快照，用于播放条和队列面板展示。 */
  playerListName: string | null;
  /** 当前队列的来源类型；temporary 表示在线歌单/排行榜或已分离的编辑队列。 */
  playerListKind: MusicPlayerListKind | null;
  activePlaylistId: string | null;
  /** music 模式当前 media_groups 分组 ID */
  activeMusicGroupId: number | null;
  activeSource: AudioTrackSource | null;
  /** music 模式侧栏/面板 */
  musicLibraryOpen: boolean;
  musicSearchOpen: boolean;
  musicAccountOpen: boolean;
  musicSyncOpen: boolean;
  musicPlaylistOpen: boolean;
  musicSourceOpen: boolean;
  /** music 模式 lx 壳层当前分区（媒体页内嵌时使用） */
  musicSection: MusicHubSection;
}

/** 共享 Store 能力 */
export interface BaseViewerStoreApi {
  saveProgress(): Promise<void>;
  closeBook(): Promise<void>;
  isGuestReading(): boolean;
}
