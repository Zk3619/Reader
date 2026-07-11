/**
 * 音乐搜索页 UI 偏好（来源/类型控件：下拉或标签 Tab）
 */

import { createStore } from 'solid-js/store';
import {
  getMusicSettings,
  setMusicSettings,
  type MusicSearchControlStyle,
} from '@/lib/media/audio/music-settings';

export type { MusicSearchControlStyle };

interface MusicSearchUiState {
  sourceControl: MusicSearchControlStyle;
  tabControl: MusicSearchControlStyle;
}

function loadUiState(): MusicSearchUiState {
  const settings = getMusicSettings();
  return {
    sourceControl: settings.musicSearchSourceControl ?? 'select',
    tabControl: settings.musicSearchTabControl ?? 'select',
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
