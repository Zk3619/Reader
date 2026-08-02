/**
 * Hand-written batch D (dacast → dw) — auto-rebuilt by port/rebuild-hand-d-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { DacastBaseIE, DacastPlaylistIE, DacastVODIE } from './dacast';
import { DailyMailIE } from './dailymail';
import { DailymotionIE, DailymotionPlaylistIE, DailymotionPlaylistBaseIE, DailymotionSearchIE, DailymotionUserIE } from './dailymotion';
import { DailyWireIE, DailyWireBaseIE, DailyWirePodcastIE } from './dailywire';
import { DamtomoBaseIE, DamtomoRecordIE, DamtomoVideoIE } from './damtomo';
import { DangalPlayIE, DangalPlayBaseIE, DangalPlaySeasonIE } from './dangalplay';
import { DaumIE, DaumBaseIE, DaumClipIE, DaumListIE, DaumPlaylistIE, DaumUserIE } from './daum';
import { DaystarClipIE } from './daystar';
import { DBTVIE } from './dbtv';
import { DctpTvIE } from './dctp';
import { DemocracynowIE } from './democracynow';
import { DetikEmbedIE } from './detik';
import { DeuxMIE, DeuxMNewsIE } from './deuxm';
import { DFBIE } from './dfb';
import { DHMIE } from './dhm';
import { DigitalConcertHallIE } from './digitalconcerthall';
import { DigitekaIE } from './digiteka';
import { DigiviewIE } from './digiview';
import { DiscogsReleasePlaylistIE } from './discogs';
import { DisneyIE } from './disney';
import { DigitallySpeakingIE } from './dispeak';
import { DLFIE, DLFBaseIE, DLFCorpusIE } from './dlf';
import { DLiveStreamIE, DLiveVODIE } from './dlive';
import { DouyuBaseIE, DouyuShowIE, DouyuTVIE } from './douyutv';
import { AmHistoryChannelIE, AnimalPlanetIE, CookingChannelIE, DestinationAmericaIE, DiscoveryLifeIE, DiscoveryNetworksDeIE, DiscoveryPlusIE, DiscoveryPlusBaseIE, DiscoveryPlusIndiaIE, DiscoveryPlusIndiaShowIE, DiscoveryPlusItalyIE, DiscoveryPlusItalyShowIE, DiscoveryPlusShowBaseIE, DPlayIE, DPlayBaseIE, FoodNetworkIE, GoDiscoveryIE, HGTVDeIE, HGTVUsaIE, InvestigationDiscoveryIE, ScienceChannelIE, TLCIE, TravelChannelIE } from './dplay';
import { DRBonanzaIE } from './drbonanza';
import { DreiSatIE } from './dreisat';
import { DropboxIE } from './dropbox';
import { DropoutIE, DropoutSeasonIE } from './dropout';
import { DrTalksIE } from './drtalks';
import { DrTuberIE } from './drtuber';
import { DRTVIE, DRTVLiveIE, DRTVSeasonIE, DRTVSeriesIE } from './drtv';
import { DTubeIE } from './dtube';
import { DumpertIE } from './dumpert';
import { DuoplayIE } from './duoplay';
import { DVTVIE } from './dvtv';
import { DWIE, DWArticleIE } from './dw';

export type HandDEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_D_IES: HandDEntry[] = [
  { ie_key: 'AmHistoryChannel', IE: AmHistoryChannelIE },
  { ie_key: 'AnimalPlanet', IE: AnimalPlanetIE },
  { ie_key: 'CookingChannel', IE: CookingChannelIE },
  { ie_key: 'DacastBase', IE: DacastBaseIE },
  { ie_key: 'DacastPlaylist', IE: DacastPlaylistIE },
  { ie_key: 'DacastVOD', IE: DacastVODIE },
  { ie_key: 'DailyMail', IE: DailyMailIE },
  { ie_key: 'Dailymotion', IE: DailymotionIE },
  { ie_key: 'DailymotionPlaylist', IE: DailymotionPlaylistIE },
  { ie_key: 'DailymotionPlaylistBase', IE: DailymotionPlaylistBaseIE },
  { ie_key: 'DailymotionSearch', IE: DailymotionSearchIE },
  { ie_key: 'DailymotionUser', IE: DailymotionUserIE },
  { ie_key: 'DailyWire', IE: DailyWireIE },
  { ie_key: 'DailyWireBase', IE: DailyWireBaseIE },
  { ie_key: 'DailyWirePodcast', IE: DailyWirePodcastIE },
  { ie_key: 'DamtomoBase', IE: DamtomoBaseIE },
  { ie_key: 'DamtomoRecord', IE: DamtomoRecordIE },
  { ie_key: 'DamtomoVideo', IE: DamtomoVideoIE },
  { ie_key: 'DangalPlay', IE: DangalPlayIE },
  { ie_key: 'DangalPlayBase', IE: DangalPlayBaseIE },
  { ie_key: 'DangalPlaySeason', IE: DangalPlaySeasonIE },
  { ie_key: 'Daum', IE: DaumIE },
  { ie_key: 'DaumBase', IE: DaumBaseIE },
  { ie_key: 'DaumClip', IE: DaumClipIE },
  { ie_key: 'DaumList', IE: DaumListIE },
  { ie_key: 'DaumPlaylist', IE: DaumPlaylistIE },
  { ie_key: 'DaumUser', IE: DaumUserIE },
  { ie_key: 'DaystarClip', IE: DaystarClipIE },
  { ie_key: 'DBTV', IE: DBTVIE },
  { ie_key: 'DctpTv', IE: DctpTvIE },
  { ie_key: 'Democracynow', IE: DemocracynowIE },
  { ie_key: 'DestinationAmerica', IE: DestinationAmericaIE },
  { ie_key: 'DetikEmbed', IE: DetikEmbedIE },
  { ie_key: 'DeuxM', IE: DeuxMIE },
  { ie_key: 'DeuxMNews', IE: DeuxMNewsIE },
  { ie_key: 'DFB', IE: DFBIE },
  { ie_key: 'DHM', IE: DHMIE },
  { ie_key: 'DigitalConcertHall', IE: DigitalConcertHallIE },
  { ie_key: 'DigitallySpeaking', IE: DigitallySpeakingIE },
  { ie_key: 'Digiteka', IE: DigitekaIE },
  { ie_key: 'Digiview', IE: DigiviewIE },
  { ie_key: 'DiscogsReleasePlaylist', IE: DiscogsReleasePlaylistIE },
  { ie_key: 'DiscoveryLife', IE: DiscoveryLifeIE },
  { ie_key: 'DiscoveryNetworksDe', IE: DiscoveryNetworksDeIE },
  { ie_key: 'DiscoveryPlus', IE: DiscoveryPlusIE },
  { ie_key: 'DiscoveryPlusBase', IE: DiscoveryPlusBaseIE },
  { ie_key: 'DiscoveryPlusIndia', IE: DiscoveryPlusIndiaIE },
  { ie_key: 'DiscoveryPlusIndiaShow', IE: DiscoveryPlusIndiaShowIE },
  { ie_key: 'DiscoveryPlusItaly', IE: DiscoveryPlusItalyIE },
  { ie_key: 'DiscoveryPlusItalyShow', IE: DiscoveryPlusItalyShowIE },
  { ie_key: 'DiscoveryPlusShowBase', IE: DiscoveryPlusShowBaseIE },
  { ie_key: 'Disney', IE: DisneyIE },
  { ie_key: 'DLF', IE: DLFIE },
  { ie_key: 'DLFBase', IE: DLFBaseIE },
  { ie_key: 'DLFCorpus', IE: DLFCorpusIE },
  { ie_key: 'DLiveStream', IE: DLiveStreamIE },
  { ie_key: 'DLiveVOD', IE: DLiveVODIE },
  { ie_key: 'DouyuBase', IE: DouyuBaseIE },
  { ie_key: 'DouyuShow', IE: DouyuShowIE },
  { ie_key: 'DouyuTV', IE: DouyuTVIE },
  { ie_key: 'DPlay', IE: DPlayIE },
  { ie_key: 'DPlayBase', IE: DPlayBaseIE },
  { ie_key: 'DRBonanza', IE: DRBonanzaIE },
  { ie_key: 'DreiSat', IE: DreiSatIE },
  { ie_key: 'Dropbox', IE: DropboxIE },
  { ie_key: 'Dropout', IE: DropoutIE },
  { ie_key: 'DropoutSeason', IE: DropoutSeasonIE },
  { ie_key: 'DrTalks', IE: DrTalksIE },
  { ie_key: 'DrTuber', IE: DrTuberIE },
  { ie_key: 'DRTV', IE: DRTVIE },
  { ie_key: 'DRTVLive', IE: DRTVLiveIE },
  { ie_key: 'DRTVSeason', IE: DRTVSeasonIE },
  { ie_key: 'DRTVSeries', IE: DRTVSeriesIE },
  { ie_key: 'DTube', IE: DTubeIE },
  { ie_key: 'Dumpert', IE: DumpertIE },
  { ie_key: 'Duoplay', IE: DuoplayIE },
  { ie_key: 'DVTV', IE: DVTVIE },
  { ie_key: 'DW', IE: DWIE },
  { ie_key: 'DWArticle', IE: DWArticleIE },
  { ie_key: 'FoodNetwork', IE: FoodNetworkIE },
  { ie_key: 'GoDiscovery', IE: GoDiscoveryIE },
  { ie_key: 'HGTVDe', IE: HGTVDeIE },
  { ie_key: 'HGTVUsa', IE: HGTVUsaIE },
  { ie_key: 'InvestigationDiscovery', IE: InvestigationDiscoveryIE },
  { ie_key: 'ScienceChannel', IE: ScienceChannelIE },
  { ie_key: 'TLC', IE: TLCIE },
  { ie_key: 'TravelChannel', IE: TravelChannelIE },
];

export {
  AmHistoryChannelIE,
  AnimalPlanetIE,
  CookingChannelIE,
  DacastBaseIE,
  DacastPlaylistIE,
  DacastVODIE,
  DailyMailIE,
  DailymotionIE,
  DailymotionPlaylistIE,
  DailymotionPlaylistBaseIE,
  DailymotionSearchIE,
  DailymotionUserIE,
  DailyWireIE,
  DailyWireBaseIE,
  DailyWirePodcastIE,
  DamtomoBaseIE,
  DamtomoRecordIE,
  DamtomoVideoIE,
  DangalPlayIE,
  DangalPlayBaseIE,
  DangalPlaySeasonIE,
  DaumIE,
  DaumBaseIE,
  DaumClipIE,
  DaumListIE,
  DaumPlaylistIE,
  DaumUserIE,
  DaystarClipIE,
  DBTVIE,
  DctpTvIE,
  DemocracynowIE,
  DestinationAmericaIE,
  DetikEmbedIE,
  DeuxMIE,
  DeuxMNewsIE,
  DFBIE,
  DHMIE,
  DigitalConcertHallIE,
  DigitallySpeakingIE,
  DigitekaIE,
  DigiviewIE,
  DiscogsReleasePlaylistIE,
  DiscoveryLifeIE,
  DiscoveryNetworksDeIE,
  DiscoveryPlusIE,
  DiscoveryPlusBaseIE,
  DiscoveryPlusIndiaIE,
  DiscoveryPlusIndiaShowIE,
  DiscoveryPlusItalyIE,
  DiscoveryPlusItalyShowIE,
  DiscoveryPlusShowBaseIE,
  DisneyIE,
  DLFIE,
  DLFBaseIE,
  DLFCorpusIE,
  DLiveStreamIE,
  DLiveVODIE,
  DouyuBaseIE,
  DouyuShowIE,
  DouyuTVIE,
  DPlayIE,
  DPlayBaseIE,
  DRBonanzaIE,
  DreiSatIE,
  DropboxIE,
  DropoutIE,
  DropoutSeasonIE,
  DrTalksIE,
  DrTuberIE,
  DRTVIE,
  DRTVLiveIE,
  DRTVSeasonIE,
  DRTVSeriesIE,
  DTubeIE,
  DumpertIE,
  DuoplayIE,
  DVTVIE,
  DWIE,
  DWArticleIE,
  FoodNetworkIE,
  GoDiscoveryIE,
  HGTVDeIE,
  HGTVUsaIE,
  InvestigationDiscoveryIE,
  ScienceChannelIE,
  TLCIE,
  TravelChannelIE,
};
