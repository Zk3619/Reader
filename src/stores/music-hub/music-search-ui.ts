/**
 * 音乐搜索页 UI 偏好（来源/类型控件：下拉或标签 Tab；列表翻页方式）
 */

import { createStore } from 'solid-js/store';
import {
  getMusicSettings,
  setMusicSettings,
  subscribeMusicSettings,
  type MusicSearchControlStyle,
  type MusicSearchPaginationPreference,
  type MusicSettings,
} from '@/lib/media/audio/music-settings';

export type { MusicSearchControlStyle, MusicSearchPaginationPreference };

interface MusicSearchUiState {
  sourceControl: MusicSearchControlStyle;
  tabControl: MusicSearchControlStyle;
  paginationPreference: MusicSearchPaginationPreference;
}

function prefsFromSettings(settings: MusicSettings): MusicSearchUiState {
  return {
    sourceControl: settings.musicSearchSourceControl ?? 'select',
    tabControl: settings.musicSearchTabControl ?? 'select',
    paginationPreference:
      settings.musicSearchPaginationPreference === 'scroll' ? 'scroll' : 'pagination',
  };
}

const [musicSearchUi, setMusicSearchUi] = createStore<MusicSearchUiState>(
  prefsFromSettings(getMusicSettings()),
);

/** 配置 hydrate / 他窗同步后回填 UI store */
export function syncMusicSearchUiFromSettings(settings = getMusicSettings()): void {
  setMusicSearchUi(prefsFromSettings(settings));
}

subscribeMusicSettings((settings) => {
  syncMusicSearchUiFromSettings(settings);
});

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
