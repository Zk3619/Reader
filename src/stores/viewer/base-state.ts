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
  | 'album'
  | 'singer'
  | 'userApi'
  | 'list'
  | 'download'
  | 'settings'
  | 'nowPlaying';

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
