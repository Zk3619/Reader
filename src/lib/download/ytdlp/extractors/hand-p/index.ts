/**
 * Hand-written batch P (packtpub → pyvideo, skip PornHub) — auto-rebuilt by port/rebuild-hand-p-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { PacktPubIE, PacktPubBaseIE, PacktPubCourseIE } from './packtpub';
import { PalcoMP3IE, PalcoMP3ArtistIE, PalcoMP3BaseIE, PalcoMP3VideoIE } from './palcomp3';
import { PandaTvIE } from './pandatv';
import { PanoptoIE, PanoptoBaseIE, PanoptoListIE, PanoptoPlaylistIE } from './panopto';
import { ParlerIE } from './parler';
import { ParlviewIE } from './parlview';
import { PartiBaseIE, PartiLivestreamIE, PartiVideoIE } from './parti';
import { PatreonIE, PatreonBaseIE, PatreonCampaignIE } from './patreon';
import { PBSIE, PBSKidsIE } from './pbs';
import { PearVideoIE } from './pearvideo';
import { PeekVidsIE, PeekVidsBaseIE, PlayVidsIE } from './peekvids';
import { PeerTubeIE, PeerTubePlaylistIE } from './peertube';
import { PeerTVIE } from './peertv';
import { PelotonIE, PelotonLiveIE } from './peloton';
import { PerformGroupIE } from './performgroup';
import { PeriscopeIE, PeriscopeBaseIE, PeriscopeUserIE } from './periscope';
import { PGATourIE } from './pgatour';
import { PhilharmonieDeParisIE } from './philharmoniedeparis';
import { PhoenixIE } from './phoenix';
import { PhotobucketIE } from './photobucket';
import { PiaLiveIE } from './pialive';
import { PiaproIE } from './piapro';
import { PicartoIE, PicartoVodIE } from './picarto';
import { PikselIE } from './piksel';
import { PinkbikeIE } from './pinkbike';
import { PinterestIE, PinterestBaseIE, PinterestCollectionIE } from './pinterest';
import { PlatziIE, PlatziBaseIE, PlatziCourseIE } from './platzi';
import { PlayerFmIE } from './playerfm';
import { PlaySuisseIE } from './playsuisse';
import { PlaytvakIE } from './playtvak';
import { PluralsightIE, PluralsightBaseIE, PluralsightCourseIE } from './pluralsight';
import { PlutoTVIE } from './plutotv';
import { PlyrEmbedIE } from './plyr';
import { PodbayFMIE, PodbayFMChannelIE } from './podbayfm';
import { PodchaserIE } from './podchaser';
import { PodomaticIE } from './podomatic';
import { PokerGoIE, PokerGoBaseIE, PokerGoCollectionIE } from './pokergo';
import { PolsatGoIE } from './polsatgo';
import { PolskieRadioIE, PolskieRadioAuditionIE, PolskieRadioBaseIE, PolskieRadioCategoryIE, PolskieRadioLegacyIE, PolskieRadioPlayerIE, PolskieRadioPodcastIE, PolskieRadioPodcastBaseIE, PolskieRadioPodcastListIE } from './polskieradio';
import { PopcorntimesIE } from './popcorntimes';
import { PopcornTVIE } from './popcorntv';
import { PornboxIE } from './pornbox';
import { PornFlipIE } from './pornflip';
import { PornotubeIE } from './pornotube';
import { PornoVoisinesIE } from './pornovoisines';
import { PornoXOIE } from './pornoxo';
import { Pr0grammIE } from './pr0gramm';
import { PrankCastIE, PrankCastPostIE } from './prankcast';
import { PremiershipRugbyIE } from './premiershiprugby';
import { PressTVIE } from './presstv';
import { ProjectVeritasIE } from './projectveritas';
import { PRXAccountIE, PRXBaseIE, PRXSeriesIE, PRXSeriesSearchIE, PRXStoriesSearchIE, PRXStoryIE } from './prx';
import { PuhuTVIE, PuhuTVSerieIE } from './puhutv';
import { PyvideoIE } from './pyvideo';

export type HandPEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_P_IES: HandPEntry[] = [
  { ie_key: 'PacktPub', IE: PacktPubIE },
  { ie_key: 'PacktPubBase', IE: PacktPubBaseIE },
  { ie_key: 'PacktPubCourse', IE: PacktPubCourseIE },
  { ie_key: 'PalcoMP3', IE: PalcoMP3IE },
  { ie_key: 'PalcoMP3Artist', IE: PalcoMP3ArtistIE },
  { ie_key: 'PalcoMP3Base', IE: PalcoMP3BaseIE },
  { ie_key: 'PalcoMP3Video', IE: PalcoMP3VideoIE },
  { ie_key: 'PandaTv', IE: PandaTvIE },
  { ie_key: 'Panopto', IE: PanoptoIE },
  { ie_key: 'PanoptoBase', IE: PanoptoBaseIE },
  { ie_key: 'PanoptoList', IE: PanoptoListIE },
  { ie_key: 'PanoptoPlaylist', IE: PanoptoPlaylistIE },
  { ie_key: 'Parler', IE: ParlerIE },
  { ie_key: 'Parlview', IE: ParlviewIE },
  { ie_key: 'PartiBase', IE: PartiBaseIE },
  { ie_key: 'PartiLivestream', IE: PartiLivestreamIE },
  { ie_key: 'PartiVideo', IE: PartiVideoIE },
  { ie_key: 'Patreon', IE: PatreonIE },
  { ie_key: 'PatreonBase', IE: PatreonBaseIE },
  { ie_key: 'PatreonCampaign', IE: PatreonCampaignIE },
  { ie_key: 'PBS', IE: PBSIE },
  { ie_key: 'PBSKids', IE: PBSKidsIE },
  { ie_key: 'PearVideo', IE: PearVideoIE },
  { ie_key: 'PeekVids', IE: PeekVidsIE },
  { ie_key: 'PeekVidsBase', IE: PeekVidsBaseIE },
  { ie_key: 'PeerTube', IE: PeerTubeIE },
  { ie_key: 'PeerTubePlaylist', IE: PeerTubePlaylistIE },
  { ie_key: 'PeerTV', IE: PeerTVIE },
  { ie_key: 'Peloton', IE: PelotonIE },
  { ie_key: 'PelotonLive', IE: PelotonLiveIE },
  { ie_key: 'PerformGroup', IE: PerformGroupIE },
  { ie_key: 'Periscope', IE: PeriscopeIE },
  { ie_key: 'PeriscopeBase', IE: PeriscopeBaseIE },
  { ie_key: 'PeriscopeUser', IE: PeriscopeUserIE },
  { ie_key: 'PGATour', IE: PGATourIE },
  { ie_key: 'PhilharmonieDeParis', IE: PhilharmonieDeParisIE },
  { ie_key: 'Phoenix', IE: PhoenixIE },
  { ie_key: 'Photobucket', IE: PhotobucketIE },
  { ie_key: 'PiaLive', IE: PiaLiveIE },
  { ie_key: 'Piapro', IE: PiaproIE },
  { ie_key: 'Picarto', IE: PicartoIE },
  { ie_key: 'PicartoVod', IE: PicartoVodIE },
  { ie_key: 'Piksel', IE: PikselIE },
  { ie_key: 'Pinkbike', IE: PinkbikeIE },
  { ie_key: 'Pinterest', IE: PinterestIE },
  { ie_key: 'PinterestBase', IE: PinterestBaseIE },
  { ie_key: 'PinterestCollection', IE: PinterestCollectionIE },
  { ie_key: 'Platzi', IE: PlatziIE },
  { ie_key: 'PlatziBase', IE: PlatziBaseIE },
  { ie_key: 'PlatziCourse', IE: PlatziCourseIE },
  { ie_key: 'PlayerFm', IE: PlayerFmIE },
  { ie_key: 'PlaySuisse', IE: PlaySuisseIE },
  { ie_key: 'Playtvak', IE: PlaytvakIE },
  { ie_key: 'PlayVids', IE: PlayVidsIE },
  { ie_key: 'Pluralsight', IE: PluralsightIE },
  { ie_key: 'PluralsightBase', IE: PluralsightBaseIE },
  { ie_key: 'PluralsightCourse', IE: PluralsightCourseIE },
  { ie_key: 'PlutoTV', IE: PlutoTVIE },
  { ie_key: 'PlyrEmbed', IE: PlyrEmbedIE },
  { ie_key: 'PodbayFM', IE: PodbayFMIE },
  { ie_key: 'PodbayFMChannel', IE: PodbayFMChannelIE },
  { ie_key: 'Podchaser', IE: PodchaserIE },
  { ie_key: 'Podomatic', IE: PodomaticIE },
  { ie_key: 'PokerGo', IE: PokerGoIE },
  { ie_key: 'PokerGoBase', IE: PokerGoBaseIE },
  { ie_key: 'PokerGoCollection', IE: PokerGoCollectionIE },
  { ie_key: 'PolsatGo', IE: PolsatGoIE },
  { ie_key: 'PolskieRadio', IE: PolskieRadioIE },
  { ie_key: 'PolskieRadioAudition', IE: PolskieRadioAuditionIE },
  { ie_key: 'PolskieRadioBase', IE: PolskieRadioBaseIE },
  { ie_key: 'PolskieRadioCategory', IE: PolskieRadioCategoryIE },
  { ie_key: 'PolskieRadioLegacy', IE: PolskieRadioLegacyIE },
  { ie_key: 'PolskieRadioPlayer', IE: PolskieRadioPlayerIE },
  { ie_key: 'PolskieRadioPodcast', IE: PolskieRadioPodcastIE },
  { ie_key: 'PolskieRadioPodcastBase', IE: PolskieRadioPodcastBaseIE },
  { ie_key: 'PolskieRadioPodcastList', IE: PolskieRadioPodcastListIE },
  { ie_key: 'Popcorntimes', IE: PopcorntimesIE },
  { ie_key: 'PopcornTV', IE: PopcornTVIE },
  { ie_key: 'Pornbox', IE: PornboxIE },
  { ie_key: 'PornFlip', IE: PornFlipIE },
  { ie_key: 'Pornotube', IE: PornotubeIE },
  { ie_key: 'PornoVoisines', IE: PornoVoisinesIE },
  { ie_key: 'PornoXO', IE: PornoXOIE },
  { ie_key: 'Pr0gramm', IE: Pr0grammIE },
  { ie_key: 'PrankCast', IE: PrankCastIE },
  { ie_key: 'PrankCastPost', IE: PrankCastPostIE },
  { ie_key: 'PremiershipRugby', IE: PremiershipRugbyIE },
  { ie_key: 'PressTV', IE: PressTVIE },
  { ie_key: 'ProjectVeritas', IE: ProjectVeritasIE },
  { ie_key: 'PRXAccount', IE: PRXAccountIE },
  { ie_key: 'PRXBase', IE: PRXBaseIE },
  { ie_key: 'PRXSeries', IE: PRXSeriesIE },
  { ie_key: 'PRXSeriesSearch', IE: PRXSeriesSearchIE },
  { ie_key: 'PRXStoriesSearch', IE: PRXStoriesSearchIE },
  { ie_key: 'PRXStory', IE: PRXStoryIE },
  { ie_key: 'PuhuTV', IE: PuhuTVIE },
  { ie_key: 'PuhuTVSerie', IE: PuhuTVSerieIE },
  { ie_key: 'Pyvideo', IE: PyvideoIE },
];

export {
  PacktPubIE,
  PacktPubBaseIE,
  PacktPubCourseIE,
  PalcoMP3IE,
  PalcoMP3ArtistIE,
  PalcoMP3BaseIE,
  PalcoMP3VideoIE,
  PandaTvIE,
  PanoptoIE,
  PanoptoBaseIE,
  PanoptoListIE,
  PanoptoPlaylistIE,
  ParlerIE,
  ParlviewIE,
  PartiBaseIE,
  PartiLivestreamIE,
  PartiVideoIE,
  PatreonIE,
  PatreonBaseIE,
  PatreonCampaignIE,
  PBSIE,
  PBSKidsIE,
  PearVideoIE,
  PeekVidsIE,
  PeekVidsBaseIE,
  PeerTubeIE,
  PeerTubePlaylistIE,
  PeerTVIE,
  PelotonIE,
  PelotonLiveIE,
  PerformGroupIE,
  PeriscopeIE,
  PeriscopeBaseIE,
  PeriscopeUserIE,
  PGATourIE,
  PhilharmonieDeParisIE,
  PhoenixIE,
  PhotobucketIE,
  PiaLiveIE,
  PiaproIE,
  PicartoIE,
  PicartoVodIE,
  PikselIE,
  PinkbikeIE,
  PinterestIE,
  PinterestBaseIE,
  PinterestCollectionIE,
  PlatziIE,
  PlatziBaseIE,
  PlatziCourseIE,
  PlayerFmIE,
  PlaySuisseIE,
  PlaytvakIE,
  PlayVidsIE,
  PluralsightIE,
  PluralsightBaseIE,
  PluralsightCourseIE,
  PlutoTVIE,
  PlyrEmbedIE,
  PodbayFMIE,
  PodbayFMChannelIE,
  PodchaserIE,
  PodomaticIE,
  PokerGoIE,
  PokerGoBaseIE,
  PokerGoCollectionIE,
  PolsatGoIE,
  PolskieRadioIE,
  PolskieRadioAuditionIE,
  PolskieRadioBaseIE,
  PolskieRadioCategoryIE,
  PolskieRadioLegacyIE,
  PolskieRadioPlayerIE,
  PolskieRadioPodcastIE,
  PolskieRadioPodcastBaseIE,
  PolskieRadioPodcastListIE,
  PopcorntimesIE,
  PopcornTVIE,
  PornboxIE,
  PornFlipIE,
  PornotubeIE,
  PornoVoisinesIE,
  PornoXOIE,
  Pr0grammIE,
  PrankCastIE,
  PrankCastPostIE,
  PremiershipRugbyIE,
  PressTVIE,
  ProjectVeritasIE,
  PRXAccountIE,
  PRXBaseIE,
  PRXSeriesIE,
  PRXSeriesSearchIE,
  PRXStoriesSearchIE,
  PRXStoryIE,
  PuhuTVIE,
  PuhuTVSerieIE,
  PyvideoIE,
};
