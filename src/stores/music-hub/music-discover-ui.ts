/**
 * 歌手 / 专辑发现页 UI 偏好（列表翻页方式）
 */

import { createStore } from 'solid-js/store';
import {
  getMusicSettings,
  setMusicSettings,
  subscribeMusicSettings,
  type MusicSearchPaginationPreference,
  type MusicSettings,
} from '@/lib/media/audio/music-settings';

export type MusicDiscoverKind = 'singer' | 'album';

interface MusicDiscoverUiState {
  singerPaginationPreference: MusicSearchPaginationPreference;
  albumPaginationPreference: MusicSearchPaginationPreference;
}

function prefsFromSettings(settings: MusicSettings): MusicDiscoverUiState {
  return {
    singerPaginationPreference:
      settings.musicSingerPaginationPreference === 'scroll' ? 'scroll' : 'pagination',
    albumPaginationPreference:
      settings.musicAlbumPaginationPreference === 'scroll' ? 'scroll' : 'pagination',
  };
}

const [musicDiscoverUi, setMusicDiscoverUi] =
  createStore<MusicDiscoverUiState>(prefsFromSettings(getMusicSettings()));

/** 配置 hydrate / 他窗同步后回填 UI store */
export function syncMusicDiscoverUiFromSettings(settings = getMusicSettings()): void {
  const next = prefsFromSettings(settings);
  setMusicDiscoverUi(next);
}

subscribeMusicSettings((settings) => {
  syncMusicDiscoverUiFromSettings(settings);
});

export function getMusicDiscoverUi(): MusicDiscoverUiState {
  return musicDiscoverUi;
}

export function getMusicDiscoverPaginationPreference(
  kind: MusicDiscoverKind,
): MusicSearchPaginationPreference {
  return kind === 'singer'
    ? musicDiscoverUi.singerPaginationPreference
    : musicDiscoverUi.albumPaginationPreference;
}

export function setMusicDiscoverPaginationPreference(
  kind: MusicDiscoverKind,
  preference: MusicSearchPaginationPreference,
): void {
  if (kind === 'singer') {
    setMusicDiscoverUi('singerPaginationPreference', preference);
    setMusicSettings({ musicSingerPaginationPreference: preference });
    return;
  }
  setMusicDiscoverUi('albumPaginationPreference', preference);
  setMusicSettings({ musicAlbumPaginationPreference: preference });
}
