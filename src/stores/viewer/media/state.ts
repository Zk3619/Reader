/**
 * 统一 Viewer 状态（text / image / audio / video / file 共用）
 */

import { createStore } from 'solid-js/store';
import type { ViewerState } from '@/stores/viewer/base-state';
import {
  defaultTextViewerUiConfig,
  type TextViewerUiConfig,
} from '@/lib/media/text/reader-ui-config';
import { peekReaderUiConfigSync } from '@/lib/media/text/read-config-storage';
import { normalizeReaderThemeId } from '@/lib/media/text/reader-theme-classes';
import { normalizeTextViewerPageAnim } from '@/lib/media/text/text-viewer-page-anim';
import { peekMusicConfigSync } from '@/lib/media/audio/music-config-storage';

/** 首帧即从 localStorage 恢复主题等，避免进入阅读器时闪默认配色 */
function buildInitialReaderConfig(): TextViewerUiConfig {
  const saved = peekReaderUiConfigSync();
  if (!saved) return { ...defaultTextViewerUiConfig };
  return {
    ...defaultTextViewerUiConfig,
    theme: normalizeReaderThemeId(saved.theme),
    pageAnim: normalizeTextViewerPageAnim(saved.pageAnim as string | undefined),
  };
}

function normalizeHubSection(raw: unknown): ViewerState['musicSection'] | null {
  switch (raw) {
    case 'recommend':
    case 'search':
    case 'songlist':
    case 'leaderboard':
    case 'artist':
    case 'album':
    case 'list':
    case 'download':
    case 'settings':
    case 'nowPlaying':
      return raw;
    default:
      return null;
  }
}

function readInitialMusicSection(): ViewerState['musicSection'] {
  // 优先 music.config（含 session mirror），避免 warm 前/后 LS 与权威 hubSection 分叉
  const fromConfig = normalizeHubSection(peekMusicConfigSync().hubSection);
  if (fromConfig) return fromConfig;
  if (typeof localStorage === 'undefined') return 'recommend';
  try {
    return normalizeHubSection(localStorage.getItem('reader_music_hub_section')) ?? 'recommend';
  } catch {
    return 'recommend';
  }
}

export const initialViewerState: ViewerState = {
  kind: null,
  book: null,
  catalog: [],
  chapterIndex: 0,
  chapterPos: 0,
  guestReading: false,
  content: '',
  contentLoading: false,
  contentFetching: false,
  contentBootstrapping: false,
  showContent: false,
  config: buildInitialReaderConfig(),
  popCataVisible: false,
  readSettingsVisible: false,
  miniInterface: false,
  rawContent: '',
  mediaUrls: [],
  primaryUrl: null,
  loading: false,
  musicMediaUrls: [],
  musicPrimaryUrl: null,
  musicPositionSec: 0,
  musicLoading: false,
  musicError: null,
  playbackStatus: null,
  error: null,
  effectiveReplaceRules: [],
  playbackMode: 'audiobook',
  contentSession: null,
  trackQueue: [],
  trackIndex: 0,
  musicQueueOrigin: 'other',
  playerListId: null,
  playerListName: null,
  playerListKind: null,
  activePlaylistId: null,
  activeMusicGroupId: null,
  activeSource: null,
  musicLibraryOpen: false,
  musicSearchOpen: false,
  musicAccountOpen: false,
  musicSyncOpen: false,
  musicPlaylistOpen: false,
  musicSourceOpen: false,
  musicSection: readInitialMusicSection(),
};

export const [state, setState] = createStore<ViewerState>({ ...initialViewerState });

export function resetViewerState(): void {
  setState({ ...initialViewerState, config: buildInitialReaderConfig() });
}

/**
 * 关闭文本/漫画等阅读器时：一次 setState 清掉阅读会话并写回音乐快照，
 * 避免 musicMediaUrls 先被清空再 restore，导致 Hub <audio> 清 src、进度被写成 0。
 */
export function resetViewerStatePreservingMusic(
  music: Pick<
    ViewerState,
    | 'playbackMode'
    | 'contentSession'
    | 'trackQueue'
    | 'trackIndex'
    | 'musicQueueOrigin'
    | 'playerListId'
    | 'playerListName'
    | 'playerListKind'
    | 'activePlaylistId'
    | 'activeMusicGroupId'
    | 'activeSource'
    | 'musicMediaUrls'
    | 'musicPrimaryUrl'
    | 'musicPositionSec'
    | 'musicLoading'
    | 'musicError'
    | 'playbackStatus'
    | 'musicSection'
  >,
): void {
  setState({
    ...initialViewerState,
    config: buildInitialReaderConfig(),
    playbackMode: music.playbackMode,
    contentSession: music.contentSession,
    trackQueue: music.trackQueue,
    trackIndex: music.trackIndex,
    musicQueueOrigin: music.musicQueueOrigin,
    playerListId: music.playerListId,
    playerListName: music.playerListName,
    playerListKind: music.playerListKind,
    activePlaylistId: music.activePlaylistId,
    activeMusicGroupId: music.activeMusicGroupId,
    activeSource: music.activeSource,
    musicMediaUrls: music.musicMediaUrls,
    musicPrimaryUrl: music.musicPrimaryUrl,
    musicPositionSec: music.musicPositionSec,
    musicLoading: music.musicLoading,
    musicError: music.musicError,
    playbackStatus: music.playbackStatus,
    musicSection: music.musicSection,
  });
}
