/**
 * 音乐排行榜页 UI 偏好（列表翻页方式）
 */

import { createStore } from 'solid-js/store';
import {
  getMusicSettings,
  setMusicSettings,
  subscribeMusicSettings,
  type MusicSearchPaginationPreference,
  type MusicSettings,
} from '@/lib/media/audio/music-settings';

export type { MusicSearchPaginationPreference as MusicLeaderboardPaginationPreference };

interface MusicLeaderboardUiState {
  paginationPreference: MusicSearchPaginationPreference;
}

function prefsFromSettings(settings: MusicSettings): MusicLeaderboardUiState {
  return {
    paginationPreference:
      settings.musicLeaderboardPaginationPreference === 'scroll' ? 'scroll' : 'pagination',
  };
}

const [musicLeaderboardUi, setMusicLeaderboardUi] = createStore<MusicLeaderboardUiState>(
  prefsFromSettings(getMusicSettings()),
);

/** 配置 hydrate / 他窗同步后回填 UI store */
export function syncMusicLeaderboardUiFromSettings(
  settings = getMusicSettings(),
): void {
  setMusicLeaderboardUi(prefsFromSettings(settings));
}

subscribeMusicSettings((settings) => {
  syncMusicLeaderboardUiFromSettings(settings);
});

export function getMusicLeaderboardUi(): MusicLeaderboardUiState {
  return musicLeaderboardUi;
}

export function setMusicLeaderboardPaginationPreference(
  preference: MusicSearchPaginationPreference,
): void {
  setMusicLeaderboardUi('paginationPreference', preference);
  setMusicSettings({ musicLeaderboardPaginationPreference: preference });
}
