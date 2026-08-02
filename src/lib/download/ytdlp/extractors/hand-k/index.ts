/**
 * Hand-written batch K (kakao → kuwo, skip Kaltura) — auto-rebuilt by port/rebuild-hand-k-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { KakaoIE } from './kakao';
import { KankaNewsIE } from './kankanews';
import { KaraoketvIE } from './karaoketv';
import { KelbyOneIE } from './kelbyone';
import { Kenh14PlaylistIE, Kenh14VideoIE } from './kenh14';
import { KhanAcademyIE, KhanAcademyBaseIE, KhanAcademyUnitIE } from './khanacademy';
import { KickIE, KickBaseIE, KickClipIE, KickVODIE } from './kick';
import { KickerIE } from './kicker';
import { KickStarterIE } from './kickstarter';
import { KikaIE, KikaPlaylistIE } from './kika';
import { KinoPoiskIE } from './kinopoisk';
import { KommunetvIE } from './kommunetv';
import { KompasVideoIE } from './kompas';
import { KrasViewIE } from './krasview';
import { KTHIE } from './kth';
import { Ku6IE } from './ku6';
import { KukuluLiveIE } from './kukululive';
import { KuwoIE, KuwoAlbumIE, KuwoBaseIE, KuwoCategoryIE, KuwoChartIE, KuwoMvIE, KuwoSingerIE } from './kuwo';

export type HandKEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_K_IES: HandKEntry[] = [
  { ie_key: 'Kakao', IE: KakaoIE },
  { ie_key: 'KankaNews', IE: KankaNewsIE },
  { ie_key: 'Karaoketv', IE: KaraoketvIE },
  { ie_key: 'KelbyOne', IE: KelbyOneIE },
  { ie_key: 'Kenh14Playlist', IE: Kenh14PlaylistIE },
  { ie_key: 'Kenh14Video', IE: Kenh14VideoIE },
  { ie_key: 'KhanAcademy', IE: KhanAcademyIE },
  { ie_key: 'KhanAcademyBase', IE: KhanAcademyBaseIE },
  { ie_key: 'KhanAcademyUnit', IE: KhanAcademyUnitIE },
  { ie_key: 'Kick', IE: KickIE },
  { ie_key: 'KickBase', IE: KickBaseIE },
  { ie_key: 'KickClip', IE: KickClipIE },
  { ie_key: 'Kicker', IE: KickerIE },
  { ie_key: 'KickStarter', IE: KickStarterIE },
  { ie_key: 'KickVOD', IE: KickVODIE },
  { ie_key: 'Kika', IE: KikaIE },
  { ie_key: 'KikaPlaylist', IE: KikaPlaylistIE },
  { ie_key: 'KinoPoisk', IE: KinoPoiskIE },
  { ie_key: 'Kommunetv', IE: KommunetvIE },
  { ie_key: 'KompasVideo', IE: KompasVideoIE },
  { ie_key: 'KrasView', IE: KrasViewIE },
  { ie_key: 'KTH', IE: KTHIE },
  { ie_key: 'Ku6', IE: Ku6IE },
  { ie_key: 'KukuluLive', IE: KukuluLiveIE },
  { ie_key: 'Kuwo', IE: KuwoIE },
  { ie_key: 'KuwoAlbum', IE: KuwoAlbumIE },
  { ie_key: 'KuwoBase', IE: KuwoBaseIE },
  { ie_key: 'KuwoCategory', IE: KuwoCategoryIE },
  { ie_key: 'KuwoChart', IE: KuwoChartIE },
  { ie_key: 'KuwoMv', IE: KuwoMvIE },
  { ie_key: 'KuwoSinger', IE: KuwoSingerIE },
];

export {
  KakaoIE,
  KankaNewsIE,
  KaraoketvIE,
  KelbyOneIE,
  Kenh14PlaylistIE,
  Kenh14VideoIE,
  KhanAcademyIE,
  KhanAcademyBaseIE,
  KhanAcademyUnitIE,
  KickIE,
  KickBaseIE,
  KickClipIE,
  KickerIE,
  KickStarterIE,
  KickVODIE,
  KikaIE,
  KikaPlaylistIE,
  KinoPoiskIE,
  KommunetvIE,
  KompasVideoIE,
  KrasViewIE,
  KTHIE,
  Ku6IE,
  KukuluLiveIE,
  KuwoIE,
  KuwoAlbumIE,
  KuwoBaseIE,
  KuwoCategoryIE,
  KuwoChartIE,
  KuwoMvIE,
  KuwoSingerIE,
};
