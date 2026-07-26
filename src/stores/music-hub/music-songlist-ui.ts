/**
 * 在线歌单页 UI 偏好（控件风格 + 书架式布局）
 */

import { createStore } from 'solid-js/store';
import {
  getMusicSettings,
  setMusicSettings,
  subscribeMusicSettings,
  type MusicSearchControlStyle,
  type MusicSearchPaginationPreference,
  type MusicSongListTagControlStyle,
  type MusicSongListTagStackDensity,
  type MusicSettings,
} from '@/lib/media/audio/music-settings';
import {
  isGridViewMode,
  isListViewMode,
  type ViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import { isHubTagStackChipDensity } from '@/lib/ui/hub-tag-stack-styles';

export type {
  MusicSearchControlStyle,
  MusicSearchPaginationPreference,
  MusicSongListTagControlStyle,
  MusicSongListTagStackDensity,
};

const ALLOWED_VIEW_MODES = new Set<string>([
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
]);

export interface MusicSongListUiState {
  sourceControl: MusicSearchControlStyle;
  sortControl: MusicSearchControlStyle;
  tagControl: MusicSongListTagControlStyle;
  /** 仅 tagControl=stacked 时生效 */
  tagStackDensity: MusicSongListTagStackDensity;
  paginationPreference: MusicSearchPaginationPreference;
  viewMode: ViewMode;
  spacing: number;
}

function normalizeViewMode(v: unknown): ViewMode {
  if (typeof v === 'string' && ALLOWED_VIEW_MODES.has(v)) {
    if (isListViewMode(v) || isGridViewMode(v)) return v as ViewMode;
  }
  return 'list-2';
}

function normalizeSpacing(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 12;
  return Math.max(0, Math.min(24, Math.round(v)));
}

function loadUiState(settings = getMusicSettings()): MusicSongListUiState {
  return {
    sourceControl: settings.musicSongListSourceControl ?? 'select',
    sortControl: settings.musicSongListSortControl ?? 'select',
    tagControl: settings.musicSongListTagControl ?? 'grouped',
    tagStackDensity: isHubTagStackChipDensity(settings.musicSongListTagStackDensity)
      ? settings.musicSongListTagStackDensity
      : 'comfortable',
    paginationPreference:
      settings.musicSongListPaginationPreference === 'scroll' ? 'scroll' : 'pagination',
    viewMode: normalizeViewMode(settings.musicSongListViewMode),
    spacing: normalizeSpacing(settings.musicSongListSpacing),
  };
}

const [musicSongListUi, setMusicSongListUi] = createStore<MusicSongListUiState>(loadUiState());

/** 配置 hydrate / 他窗同步后回填 UI store */
export function syncMusicSongListUiFromSettings(settings: MusicSettings = getMusicSettings()): void {
  const next = loadUiState(settings);
  setMusicSongListUi(next);
}

subscribeMusicSettings((settings) => {
  syncMusicSongListUiFromSettings(settings);
});

export function getMusicSongListUi(): MusicSongListUiState {
  return musicSongListUi;
}

export function setMusicSongListSourceControl(style: MusicSearchControlStyle): void {
  setMusicSongListUi('sourceControl', style);
  setMusicSettings({ musicSongListSourceControl: style });
}

export function setMusicSongListSortControl(style: MusicSearchControlStyle): void {
  setMusicSongListUi('sortControl', style);
  setMusicSettings({ musicSongListSortControl: style });
}

export function setMusicSongListTagControl(style: MusicSongListTagControlStyle): void {
  setMusicSongListUi('tagControl', style);
  setMusicSettings({ musicSongListTagControl: style });
}

export function setMusicSongListTagStackDensity(density: MusicSongListTagStackDensity): void {
  setMusicSongListUi('tagStackDensity', density);
  setMusicSettings({ musicSongListTagStackDensity: density });
}

export function setMusicSongListPaginationPreference(
  preference: MusicSearchPaginationPreference,
): void {
  setMusicSongListUi('paginationPreference', preference);
  setMusicSettings({ musicSongListPaginationPreference: preference });
}

export function updateMusicSongListLayout(
  patch: Partial<Pick<MusicSongListUiState, 'viewMode' | 'spacing'>>,
): void {
  if (patch.viewMode != null) {
    const mode = normalizeViewMode(patch.viewMode);
    setMusicSongListUi('viewMode', mode);
    setMusicSettings({ musicSongListViewMode: mode });
  }
  if (patch.spacing != null) {
    const spacing = normalizeSpacing(patch.spacing);
    setMusicSongListUi('spacing', spacing);
    setMusicSettings({ musicSongListSpacing: spacing });
  }
}
