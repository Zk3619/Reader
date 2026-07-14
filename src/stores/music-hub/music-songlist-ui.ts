/**
 * 在线歌单页 UI 偏好（来源/排序：下拉或 Tab；标签：分组下拉或徽标堆叠；翻页方式）
 */

import { createStore } from 'solid-js/store';
import {
  getMusicSettings,
  setMusicSettings,
  type MusicSearchControlStyle,
  type MusicSearchPaginationPreference,
  type MusicSongListTagControlStyle,
} from '@/lib/media/audio/music-settings';

export type { MusicSearchControlStyle, MusicSearchPaginationPreference, MusicSongListTagControlStyle };

interface MusicSongListUiState {
  sourceControl: MusicSearchControlStyle;
  sortControl: MusicSearchControlStyle;
  tagControl: MusicSongListTagControlStyle;
  paginationPreference: MusicSearchPaginationPreference;
}

function loadUiState(): MusicSongListUiState {
  const settings = getMusicSettings();
  return {
    sourceControl: settings.musicSongListSourceControl ?? 'select',
    sortControl: settings.musicSongListSortControl ?? 'select',
    tagControl: settings.musicSongListTagControl ?? 'grouped',
    paginationPreference:
      settings.musicSongListPaginationPreference === 'scroll' ? 'scroll' : 'pagination',
  };
}

const [musicSongListUi, setMusicSongListUi] = createStore<MusicSongListUiState>(loadUiState());

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

export function setMusicSongListPaginationPreference(
  preference: MusicSearchPaginationPreference,
): void {
  setMusicSongListUi('paginationPreference', preference);
  setMusicSettings({ musicSongListPaginationPreference: preference });
}
