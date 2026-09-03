/**
 * 音乐 / 影视 Hub 子页：纳入系统返回栈（播放详情、浏览叠层、歌单详情等）。
 */

import type { BackLayerDefinition } from '@/components/shell/AppBackNavigationBridge';
import { closeMusicBrowse, getMusicBrowseState } from '@/stores/music-hub/browse';
import { closeSongListDetail, getSongListState } from '@/stores/music-hub/songList';
import {
  getTvHubState,
  getTvPlayReturnSection,
  setTvSection,
} from '@/stores/tv-hub/section';
import {
  getMusicSectionBeforeNowPlaying,
  setMusicSection,
} from '@/stores/viewer/media/audio';
import { viewerStore } from '@/stores/viewer';

export function collectMediaHubBackLayers(input: {
  musicShell: boolean;
  tvShell: boolean;
}): BackLayerDefinition[] {
  const layers: BackLayerDefinition[] = [];

  if (input.musicShell) {
    const musicSection = viewerStore.state.musicSection;
    if (musicSection === 'nowPlaying') {
      layers.push({
        id: 'music-now-playing',
        close: () => setMusicSection(getMusicSectionBeforeNowPlaying()),
      });
    }
    if (musicSection === 'songlist' && getSongListState().detail != null) {
      layers.push({
        id: 'music-songlist-detail',
        close: () => closeSongListDetail(),
      });
    }
    if (getMusicBrowseState().open) {
      layers.push({
        id: 'music-browse',
        close: () => closeMusicBrowse(),
      });
    }
  }

  if (input.tvShell) {
    const tv = getTvHubState();
    if (tv.section === 'detail') {
      layers.push({
        id: 'tv-detail',
        close: () => setTvSection(tv.navSection || 'home'),
      });
    }
    if (tv.section === 'play') {
      layers.push({
        id: 'tv-play',
        close: () => setTvSection(getTvPlayReturnSection()),
      });
    }
  }

  return layers;
}
