/**
 * Hand-written batch Q (qdance → qqmusic) — auto-rebuilt by port/rebuild-hand-q-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { QDanceIE } from './qdance';
import { QingTingIE } from './qingting';
import { QQMusicIE, QQMusicAlbumIE, QQMusicBaseIE, QQMusicPlaylistIE, QQMusicSingerIE, QQMusicToplistIE, QQMusicVideoIE, QQPlaylistBaseIE } from './qqmusic';

export type HandQEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_Q_IES: HandQEntry[] = [
  { ie_key: 'QDance', IE: QDanceIE },
  { ie_key: 'QingTing', IE: QingTingIE },
  { ie_key: 'QQMusic', IE: QQMusicIE },
  { ie_key: 'QQMusicAlbum', IE: QQMusicAlbumIE },
  { ie_key: 'QQMusicBase', IE: QQMusicBaseIE },
  { ie_key: 'QQMusicPlaylist', IE: QQMusicPlaylistIE },
  { ie_key: 'QQMusicSinger', IE: QQMusicSingerIE },
  { ie_key: 'QQMusicToplist', IE: QQMusicToplistIE },
  { ie_key: 'QQMusicVideo', IE: QQMusicVideoIE },
  { ie_key: 'QQPlaylistBase', IE: QQPlaylistBaseIE },
];

export {
  QDanceIE,
  QingTingIE,
  QQMusicIE,
  QQMusicAlbumIE,
  QQMusicBaseIE,
  QQMusicPlaylistIE,
  QQMusicSingerIE,
  QQMusicToplistIE,
  QQMusicVideoIE,
  QQPlaylistBaseIE,
};
