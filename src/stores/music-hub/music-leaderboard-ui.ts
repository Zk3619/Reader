/**
 * 音乐排行榜页 UI 偏好（列表翻页方式）
 */

import { createStore } from 'solid-js/store';
import {
  getMusicSettings,
  setMusicSettings,
  type MusicSearchPaginationPreference,
} from '@/lib/media/audio/music-settings';

export type { MusicSearchPaginationPreference as MusicLeaderboardPaginationPreference };

interface MusicLeaderboardUiState {
  paginationPreference: MusicSearchPaginationPreference;
}

function loadUiState(): MusicLeaderboardUiState {
  const settings = getMusicSettings();
  return {
    paginationPreference:
      settings.musicLeaderboardPaginationPreference === 'scroll' ? 'scroll' : 'pagination',
  };
}

const [musicLeaderboardUi, setMusicLeaderboardUi] =
  createStore<MusicLeaderboardUiState>(loadUiState());

export function getMusicLeaderboardUi(): MusicLeaderboardUiState {
  return musicLeaderboardUi;
}

export function setMusicLeaderboardPaginationPreference(
  preference: MusicSearchPaginationPreference,
): void {
  setMusicLeaderboardUi('paginationPreference', preference);
  setMusicSettings({ musicLeaderboardPaginationPreference: preference });
}
