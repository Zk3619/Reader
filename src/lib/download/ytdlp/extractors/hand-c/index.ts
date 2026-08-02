/**
 * Hand-written batch C (c56 → cybrary) — auto-rebuilt by port/rebuild-hand-c-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { C56IE } from './c56';
import { CaltransIE } from './caltrans';
import { CAM4IE } from './cam4';
import { CamFMEpisodeIE, CamFMShowIE } from './camfm';
import { CamModelsIE } from './cammodels';
import { CamsodaIE } from './camsoda';
import { CamtasiaEmbedIE } from './camtasia';
import { Canal1IE } from './canal1';
import { CanalAlphaIE } from './canalalpha';
import { Canalc2IE } from './canalc2';
import { CanalplusIE } from './canalplus';
import { CanalsurmasIE } from './canalsurmas';
import { CaracolTvPlayIE } from './caracoltv';
import { CBCIE, CBCGemIE, CBCGemBaseIE, CBCGemContentIE, CBCGemLiveIE, CBCGemOlympicsIE, CBCGemPlaylistIE, CBCListenIE, CBCPlayerIE, CBCPlayerPlaylistIE } from './cbc';
import { CBSIE, CBSBaseIE, ParamountPressExpressIE } from './cbs';
import { CBSLocalIE, CBSLocalArticleIE, CBSLocalBaseIE, CBSLocalLiveIE, CBSNewsIE, CBSNewsBaseIE, CBSNewsEmbedIE, CBSNewsLiveIE, CBSNewsLiveBaseIE, CBSNewsLiveVideoIE } from './cbsnews';
import { CBSSportsIE, CBSSportsBaseIE, CBSSportsEmbedIE, TwentyFourSevenSportsIE } from './cbssports';
import { CCCIE, CCCPlaylistIE } from './ccc';
import { CCMAIE } from './ccma';
import { CCTVIE } from './cctv';
import { CDAIE, CDAFolderIE } from './cda';
import { CellebriteIE } from './cellebrite';
import { CeskaTelevizeIE } from './ceskatelevize';
import { CGTNIE } from './cgtn';
import { CharlieRoseIE } from './charlierose';
import { ChaturbateIE } from './chaturbate';
import { ChilloutzoneIE } from './chilloutzone';
import { CHZZKLiveIE, CHZZKVideoIE } from './chzzk';
import { CinemaxIE } from './cinemax';
import { CinetecaMilanoIE } from './cinetecamilano';
import { CineverseIE, CineverseBaseIE, CineverseDetailsIE } from './cineverse';
import { CiscoLiveBaseIE, CiscoLiveSearchIE, CiscoLiveSessionIE } from './ciscolive';
import { CiscoWebexIE } from './ciscowebex';
import { CJSWIE } from './cjsw';
import { ClipchampIE } from './clipchamp';
import { ClipRsIE } from './cliprs';
import { CloserToTruthIE } from './closertotruth';
import { CloudflareStreamIE } from './cloudflarestream';
import { CloudyCDNIE } from './cloudycdn';
import { ClubicIE } from './clubic';
import { ClypIE } from './clyp';
import { CNBCVideoIE } from './cnbc';
import { CNNIE, CNNIndonesiaIE } from './cnn';
import { ComedyCentralIE } from './comedycentral';
import { BlobIE, CommonMistakesIE, UnicodeBOMIE } from './commonmistakes';
import { RtmpIE, ViewSourceIE } from './commonprotocols';
import { CondeNastIE } from './condenast';
import { CorusIE } from './corus';
import { CoubIE } from './coub';
import { CozyTVIE } from './cozytv';
import { CPACIE, CPACPlaylistIE } from './cpac';
import { CrackedIE } from './cracked';
import { CraftsyIE } from './craftsy';
import { CroatianFilmIE } from './croatianfilm';
import { CrooksAndLiarsIE } from './crooksandliars';
import { CrowdBunkerIE, CrowdBunkerChannelIE } from './crowdbunker';
import { CrtvgIE } from './crtvg';
import { CSpanIE, CSpanCongressIE } from './cspan';
import { CtsNewsIE } from './ctsnews';
import { CTVNewsIE } from './ctvnews';
import { CultureUnpluggedIE } from './cultureunplugged';
import { CuriosityStreamIE, CuriosityStreamBaseIE, CuriosityStreamCollectionBaseIE, CuriosityStreamCollectionsIE, CuriosityStreamSeriesIE } from './curiositystream';
import { CybraryIE, CybraryBaseIE, CybraryCourseIE } from './cybrary';

export type HandCEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_C_IES: HandCEntry[] = [
  { ie_key: 'Blob', IE: BlobIE },
  { ie_key: 'C56', IE: C56IE },
  { ie_key: 'Caltrans', IE: CaltransIE },
  { ie_key: 'CAM4', IE: CAM4IE },
  { ie_key: 'CamFMEpisode', IE: CamFMEpisodeIE },
  { ie_key: 'CamFMShow', IE: CamFMShowIE },
  { ie_key: 'CamModels', IE: CamModelsIE },
  { ie_key: 'Camsoda', IE: CamsodaIE },
  { ie_key: 'CamtasiaEmbed', IE: CamtasiaEmbedIE },
  { ie_key: 'Canal1', IE: Canal1IE },
  { ie_key: 'CanalAlpha', IE: CanalAlphaIE },
  { ie_key: 'Canalc2', IE: Canalc2IE },
  { ie_key: 'Canalplus', IE: CanalplusIE },
  { ie_key: 'Canalsurmas', IE: CanalsurmasIE },
  { ie_key: 'CaracolTvPlay', IE: CaracolTvPlayIE },
  { ie_key: 'CBC', IE: CBCIE },
  { ie_key: 'CBCGem', IE: CBCGemIE },
  { ie_key: 'CBCGemBase', IE: CBCGemBaseIE },
  { ie_key: 'CBCGemContent', IE: CBCGemContentIE },
  { ie_key: 'CBCGemLive', IE: CBCGemLiveIE },
  { ie_key: 'CBCGemOlympics', IE: CBCGemOlympicsIE },
  { ie_key: 'CBCGemPlaylist', IE: CBCGemPlaylistIE },
  { ie_key: 'CBCListen', IE: CBCListenIE },
  { ie_key: 'CBCPlayer', IE: CBCPlayerIE },
  { ie_key: 'CBCPlayerPlaylist', IE: CBCPlayerPlaylistIE },
  { ie_key: 'CBS', IE: CBSIE },
  { ie_key: 'CBSBase', IE: CBSBaseIE },
  { ie_key: 'CBSLocal', IE: CBSLocalIE },
  { ie_key: 'CBSLocalArticle', IE: CBSLocalArticleIE },
  { ie_key: 'CBSLocalBase', IE: CBSLocalBaseIE },
  { ie_key: 'CBSLocalLive', IE: CBSLocalLiveIE },
  { ie_key: 'CBSNews', IE: CBSNewsIE },
  { ie_key: 'CBSNewsBase', IE: CBSNewsBaseIE },
  { ie_key: 'CBSNewsEmbed', IE: CBSNewsEmbedIE },
  { ie_key: 'CBSNewsLive', IE: CBSNewsLiveIE },
  { ie_key: 'CBSNewsLiveBase', IE: CBSNewsLiveBaseIE },
  { ie_key: 'CBSNewsLiveVideo', IE: CBSNewsLiveVideoIE },
  { ie_key: 'CBSSports', IE: CBSSportsIE },
  { ie_key: 'CBSSportsBase', IE: CBSSportsBaseIE },
  { ie_key: 'CBSSportsEmbed', IE: CBSSportsEmbedIE },
  { ie_key: 'CCC', IE: CCCIE },
  { ie_key: 'CCCPlaylist', IE: CCCPlaylistIE },
  { ie_key: 'CCMA', IE: CCMAIE },
  { ie_key: 'CCTV', IE: CCTVIE },
  { ie_key: 'CDA', IE: CDAIE },
  { ie_key: 'CDAFolder', IE: CDAFolderIE },
  { ie_key: 'Cellebrite', IE: CellebriteIE },
  { ie_key: 'CeskaTelevize', IE: CeskaTelevizeIE },
  { ie_key: 'CGTN', IE: CGTNIE },
  { ie_key: 'CharlieRose', IE: CharlieRoseIE },
  { ie_key: 'Chaturbate', IE: ChaturbateIE },
  { ie_key: 'Chilloutzone', IE: ChilloutzoneIE },
  { ie_key: 'CHZZKLive', IE: CHZZKLiveIE },
  { ie_key: 'CHZZKVideo', IE: CHZZKVideoIE },
  { ie_key: 'Cinemax', IE: CinemaxIE },
  { ie_key: 'CinetecaMilano', IE: CinetecaMilanoIE },
  { ie_key: 'Cineverse', IE: CineverseIE },
  { ie_key: 'CineverseBase', IE: CineverseBaseIE },
  { ie_key: 'CineverseDetails', IE: CineverseDetailsIE },
  { ie_key: 'CiscoLiveBase', IE: CiscoLiveBaseIE },
  { ie_key: 'CiscoLiveSearch', IE: CiscoLiveSearchIE },
  { ie_key: 'CiscoLiveSession', IE: CiscoLiveSessionIE },
  { ie_key: 'CiscoWebex', IE: CiscoWebexIE },
  { ie_key: 'CJSW', IE: CJSWIE },
  { ie_key: 'Clipchamp', IE: ClipchampIE },
  { ie_key: 'ClipRs', IE: ClipRsIE },
  { ie_key: 'CloserToTruth', IE: CloserToTruthIE },
  { ie_key: 'CloudflareStream', IE: CloudflareStreamIE },
  { ie_key: 'CloudyCDN', IE: CloudyCDNIE },
  { ie_key: 'Clubic', IE: ClubicIE },
  { ie_key: 'Clyp', IE: ClypIE },
  { ie_key: 'CNBCVideo', IE: CNBCVideoIE },
  { ie_key: 'CNN', IE: CNNIE },
  { ie_key: 'CNNIndonesia', IE: CNNIndonesiaIE },
  { ie_key: 'ComedyCentral', IE: ComedyCentralIE },
  { ie_key: 'CommonMistakes', IE: CommonMistakesIE },
  { ie_key: 'CondeNast', IE: CondeNastIE },
  { ie_key: 'Corus', IE: CorusIE },
  { ie_key: 'Coub', IE: CoubIE },
  { ie_key: 'CozyTV', IE: CozyTVIE },
  { ie_key: 'CPAC', IE: CPACIE },
  { ie_key: 'CPACPlaylist', IE: CPACPlaylistIE },
  { ie_key: 'Cracked', IE: CrackedIE },
  { ie_key: 'Craftsy', IE: CraftsyIE },
  { ie_key: 'CroatianFilm', IE: CroatianFilmIE },
  { ie_key: 'CrooksAndLiars', IE: CrooksAndLiarsIE },
  { ie_key: 'CrowdBunker', IE: CrowdBunkerIE },
  { ie_key: 'CrowdBunkerChannel', IE: CrowdBunkerChannelIE },
  { ie_key: 'Crtvg', IE: CrtvgIE },
  { ie_key: 'CSpan', IE: CSpanIE },
  { ie_key: 'CSpanCongress', IE: CSpanCongressIE },
  { ie_key: 'CtsNews', IE: CtsNewsIE },
  { ie_key: 'CTVNews', IE: CTVNewsIE },
  { ie_key: 'CultureUnplugged', IE: CultureUnpluggedIE },
  { ie_key: 'CuriosityStream', IE: CuriosityStreamIE },
  { ie_key: 'CuriosityStreamBase', IE: CuriosityStreamBaseIE },
  { ie_key: 'CuriosityStreamCollectionBase', IE: CuriosityStreamCollectionBaseIE },
  { ie_key: 'CuriosityStreamCollections', IE: CuriosityStreamCollectionsIE },
  { ie_key: 'CuriosityStreamSeries', IE: CuriosityStreamSeriesIE },
  { ie_key: 'Cybrary', IE: CybraryIE },
  { ie_key: 'CybraryBase', IE: CybraryBaseIE },
  { ie_key: 'CybraryCourse', IE: CybraryCourseIE },
  { ie_key: 'ParamountPressExpress', IE: ParamountPressExpressIE },
  { ie_key: 'Rtmp', IE: RtmpIE },
  { ie_key: 'TwentyFourSevenSports', IE: TwentyFourSevenSportsIE },
  { ie_key: 'UnicodeBOM', IE: UnicodeBOMIE },
  { ie_key: 'ViewSource', IE: ViewSourceIE },
];

export {
  BlobIE,
  C56IE,
  CaltransIE,
  CAM4IE,
  CamFMEpisodeIE,
  CamFMShowIE,
  CamModelsIE,
  CamsodaIE,
  CamtasiaEmbedIE,
  Canal1IE,
  CanalAlphaIE,
  Canalc2IE,
  CanalplusIE,
  CanalsurmasIE,
  CaracolTvPlayIE,
  CBCIE,
  CBCGemIE,
  CBCGemBaseIE,
  CBCGemContentIE,
  CBCGemLiveIE,
  CBCGemOlympicsIE,
  CBCGemPlaylistIE,
  CBCListenIE,
  CBCPlayerIE,
  CBCPlayerPlaylistIE,
  CBSIE,
  CBSBaseIE,
  CBSLocalIE,
  CBSLocalArticleIE,
  CBSLocalBaseIE,
  CBSLocalLiveIE,
  CBSNewsIE,
  CBSNewsBaseIE,
  CBSNewsEmbedIE,
  CBSNewsLiveIE,
  CBSNewsLiveBaseIE,
  CBSNewsLiveVideoIE,
  CBSSportsIE,
  CBSSportsBaseIE,
  CBSSportsEmbedIE,
  CCCIE,
  CCCPlaylistIE,
  CCMAIE,
  CCTVIE,
  CDAIE,
  CDAFolderIE,
  CellebriteIE,
  CeskaTelevizeIE,
  CGTNIE,
  CharlieRoseIE,
  ChaturbateIE,
  ChilloutzoneIE,
  CHZZKLiveIE,
  CHZZKVideoIE,
  CinemaxIE,
  CinetecaMilanoIE,
  CineverseIE,
  CineverseBaseIE,
  CineverseDetailsIE,
  CiscoLiveBaseIE,
  CiscoLiveSearchIE,
  CiscoLiveSessionIE,
  CiscoWebexIE,
  CJSWIE,
  ClipchampIE,
  ClipRsIE,
  CloserToTruthIE,
  CloudflareStreamIE,
  CloudyCDNIE,
  ClubicIE,
  ClypIE,
  CNBCVideoIE,
  CNNIE,
  CNNIndonesiaIE,
  ComedyCentralIE,
  CommonMistakesIE,
  CondeNastIE,
  CorusIE,
  CoubIE,
  CozyTVIE,
  CPACIE,
  CPACPlaylistIE,
  CrackedIE,
  CraftsyIE,
  CroatianFilmIE,
  CrooksAndLiarsIE,
  CrowdBunkerIE,
  CrowdBunkerChannelIE,
  CrtvgIE,
  CSpanIE,
  CSpanCongressIE,
  CtsNewsIE,
  CTVNewsIE,
  CultureUnpluggedIE,
  CuriosityStreamIE,
  CuriosityStreamBaseIE,
  CuriosityStreamCollectionBaseIE,
  CuriosityStreamCollectionsIE,
  CuriosityStreamSeriesIE,
  CybraryIE,
  CybraryBaseIE,
  CybraryCourseIE,
  ParamountPressExpressIE,
  RtmpIE,
  TwentyFourSevenSportsIE,
  UnicodeBOMIE,
  ViewSourceIE,
};
