/**
 * 音乐搜索页 UI 偏好（来源/类型控件：下拉或标签 Tab；列表翻页方式）
 */

import { createStore } from 'solid-js/store';
import {
  getMusicSettings,
  setMusicSettings,
  type MusicSearchControlStyle,
  type MusicSearchPaginationPreference,
} from '@/lib/media/audio/music-settings';

export type { MusicSearchControlStyle, MusicSearchPaginationPreference };

interface MusicSearchUiState {
  sourceControl: MusicSearchControlStyle;
  tabControl: MusicSearchControlStyle;
  paginationPreference: MusicSearchPaginationPreference;
}

function loadUiState(): MusicSearchUiState {
  const settings = getMusicSettings();
  return {
    sourceControl: settings.musicSearchSourceControl ?? 'select',
    tabControl: settings.musicSearchTabControl ?? 'select',
    paginationPreference:
      settings.musicSearchPaginationPreference === 'scroll' ? 'scroll' : 'pagination',
  };
}

const [musicSearchUi, setMusicSearchUi] = createStore<MusicSearchUiState>(loadUiState());

export function getMusicSearchUi(): MusicSearchUiState {
  return musicSearchUi;
}

export function setMusicSearchSourceControl(style: MusicSearchControlStyle): void {
  setMusicSearchUi('sourceControl', style);
  setMusicSettings({ musicSearchSourceControl: style });
}

export function setMusicSearchTabControl(style: MusicSearchControlStyle): void {
  setMusicSearchUi('tabControl', style);
  setMusicSettings({ musicSearchTabControl: style });
}

export function setMusicSearchPaginationPreference(
  preference: MusicSearchPaginationPreference,
): void {
  setMusicSearchUi('paginationPreference', preference);
  setMusicSettings({ musicSearchPaginationPreference: preference });
}
