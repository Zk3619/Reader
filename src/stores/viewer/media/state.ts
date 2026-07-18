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

function readInitialMusicSection(): ViewerState['musicSection'] {
  if (typeof localStorage === 'undefined') return 'search';
  try {
    const raw = localStorage.getItem('reader_music_hub_section');
    switch (raw) {
      case 'search':
      case 'songlist':
      case 'leaderboard':
      case 'list':
      case 'settings':
      case 'nowPlaying':
        return raw;
      case 'download':
        return 'settings';
      default:
        return 'search';
    }
  } catch {
    return 'search';
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
