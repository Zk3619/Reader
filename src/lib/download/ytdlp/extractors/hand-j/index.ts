/**
 * Hand-written batch J (jamendo → jwplatform) — auto-rebuilt by port/rebuild-hand-j-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { JamendoIE, JamendoAlbumIE } from './jamendo';
import { SangiinIE, SangiinInstructionIE, ShugiinItvBaseIE, ShugiinItvLiveIE, ShugiinItvLiveRoomIE, ShugiinItvVodIE } from './japandiet';
import { JeuxVideoIE } from './jeuxvideo';
import { JioSaavnAlbumIE, JioSaavnArtistIE, JioSaavnBaseIE, JioSaavnPlaylistIE, JioSaavnShowIE, JioSaavnShowPlaylistIE, JioSaavnSongIE } from './jiosaavn';
import { JixieBaseIE } from './jixie';
import { JojIE } from './joj';
import { JoveIE } from './jove';
import { JStreamIE } from './jstream';
import { JTBCIE, JTBCProgramIE } from './jtbc';
import { JWPlatformIE } from './jwplatform';

export type HandJEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_J_IES: HandJEntry[] = [
  { ie_key: 'Jamendo', IE: JamendoIE },
  { ie_key: 'JamendoAlbum', IE: JamendoAlbumIE },
  { ie_key: 'JeuxVideo', IE: JeuxVideoIE },
  { ie_key: 'JioSaavnAlbum', IE: JioSaavnAlbumIE },
  { ie_key: 'JioSaavnArtist', IE: JioSaavnArtistIE },
  { ie_key: 'JioSaavnBase', IE: JioSaavnBaseIE },
  { ie_key: 'JioSaavnPlaylist', IE: JioSaavnPlaylistIE },
  { ie_key: 'JioSaavnShow', IE: JioSaavnShowIE },
  { ie_key: 'JioSaavnShowPlaylist', IE: JioSaavnShowPlaylistIE },
  { ie_key: 'JioSaavnSong', IE: JioSaavnSongIE },
  { ie_key: 'JixieBase', IE: JixieBaseIE },
  { ie_key: 'Joj', IE: JojIE },
  { ie_key: 'Jove', IE: JoveIE },
  { ie_key: 'JStream', IE: JStreamIE },
  { ie_key: 'JTBC', IE: JTBCIE },
  { ie_key: 'JTBCProgram', IE: JTBCProgramIE },
  { ie_key: 'JWPlatform', IE: JWPlatformIE },
  { ie_key: 'Sangiin', IE: SangiinIE },
  { ie_key: 'SangiinInstruction', IE: SangiinInstructionIE },
  { ie_key: 'ShugiinItvBase', IE: ShugiinItvBaseIE },
  { ie_key: 'ShugiinItvLive', IE: ShugiinItvLiveIE },
  { ie_key: 'ShugiinItvLiveRoom', IE: ShugiinItvLiveRoomIE },
  { ie_key: 'ShugiinItvVod', IE: ShugiinItvVodIE },
];

export {
  JamendoIE,
  JamendoAlbumIE,
  JeuxVideoIE,
  JioSaavnAlbumIE,
  JioSaavnArtistIE,
  JioSaavnBaseIE,
  JioSaavnPlaylistIE,
  JioSaavnShowIE,
  JioSaavnShowPlaylistIE,
  JioSaavnSongIE,
  JixieBaseIE,
  JojIE,
  JoveIE,
  JStreamIE,
  JTBCIE,
  JTBCProgramIE,
  JWPlatformIE,
  SangiinIE,
  SangiinInstructionIE,
  ShugiinItvBaseIE,
  ShugiinItvLiveIE,
  ShugiinItvLiveRoomIE,
  ShugiinItvVodIE,
};
