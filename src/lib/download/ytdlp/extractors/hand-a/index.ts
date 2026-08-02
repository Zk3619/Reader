/**
 * Hand-written batch A (abc → azmedien) — auto-rebuilt by port/rebuild-hand-a-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { ABCIE, ABCIViewIE, ABCIViewShowSeriesIE } from './abc';
import { AbcNewsIE, AbcNewsVideoIE } from './abcnews';
import { ABCOTVSIE, ABCOTVSClipsIE } from './abcotvs';
import { AbemaTVIE, AbemaTVTitleIE } from './abematv';
import { AcademicEarthCourseIE } from './academicearth';
import { ACastIE, ACastChannelIE } from './acast';
import { ADNIE, ADNSeasonIE } from './adn';
import { AdobeConnectIE } from './adobeconnect';
import { AdobePassIE } from './adobepass';
import { AdobeTVVideoIE } from './adobetv';
import { AdultSwimIE } from './adultswim';
import { AENetworksIE, BiographyIE, HistoryPlayerIE, HistoryTopicIE } from './aenetworks';
import { AeonCoIE } from './aeonco';
import { AfreecaTVIE, AfreecaTVCatchStoryIE, AfreecaTVLiveIE, AfreecaTVUserIE } from './afreecatv';
import { AGalegaIE, AGalegaBaseIE } from './agalega';
import { TokFMAuditionIE, TokFMPodcastIE, WyborczaPodcastIE, WyborczaVideoIE } from './agora';
import { AitubeKZVideoIE } from './aitube';
import { AlibabaIE } from './alibaba';
import { AliExpressLiveIE } from './aliexpress';
import { AlJazeeraIE } from './aljazeera';
import { AllocineIE } from './allocine';
import { AllstarIE, AllstarBaseIE, AllstarProfileIE } from './allstar';
import { AlphaPornoIE } from './alphaporno';
import { AltCensoredIE, AltCensoredChannelIE } from './altcensored';
import { AluraIE, AluraCourseIE } from './alura';
import { AmadeusTVIE } from './amadeustv';
import { AmaraIE } from './amara';
import { AmazonReviewsIE, AmazonStoreIE } from './amazon';
import { AmazonMiniTVIE, AmazonMiniTVSeasonIE, AmazonMiniTVSeriesIE } from './amazonminitv';
import { AMCNetworksIE } from './amcnetworks';
import { AmericasTestKitchenIE, AmericasTestKitchenSeasonIE } from './americastestkitchen';
import { AMPIE } from './amp';
import { AngelIE } from './angel';
import { Ant1NewsGrArticleIE, Ant1NewsGrEmbedIE, AntennaGrWatchIE } from './antenna';
import { AnvatoIE } from './anvato';
import { AolIE } from './aol';
import { APAIE } from './apa';
import { AparatIE } from './aparat';
import { AppleConnectIE, ApplePodcastsIE } from './appleconnect';
import { ArchiveOrgIE, YoutubeWebArchiveIE } from './archiveorg';
import { ArcPublishingIE } from './arcpublishing';
import { ARDAudiothekIE, ARDAudiothekPlaylistIE, ARDBetaMediathekIE, ARDMediathekCollectionIE } from './ard';
import { ArnesIE } from './arnes';
import { Art19IE, Art19ShowIE } from './art19';
import { ArteTVIE, ArteTVBaseIE, ArteTVCategoryIE, ArteTVEmbedIE, ArteTVPlaylistIE } from './arte';
import { AsobiChannelIE, AsobiChannelBaseIE, AsobiChannelTagURLIE } from './asobichannel';
import { AsobiStageIE } from './asobistage';
import { AtresPlayerIE } from './atresplayer';
import { AtScaleConfEventIE } from './atscaleconf';
import { AudiMediaIE } from './audimedia';
import { AudioBoomIE } from './audioboom';
import { AudiodraftCustomIE, AudiodraftGenericIE } from './audiodraft';
import { AudiomackIE, AudiomackAlbumIE } from './audiomack';
import { AudiusIE, AudiusPlaylistIE, AudiusProfileIE, AudiusTrackIE } from './audius';
import { AWSIE } from './aws';
import { AZMedienIE } from './azmedien';
import { AbemaTVBaseIE, ACastBaseIE, ADNBaseIE, AENetworksBaseIE, AENetworksCollectionIE, AENetworksListBaseIE, AENetworksShowIE, AfreecaTVBaseIE, AmazonMiniTVBaseIE, AntennaBaseIE, AppleBaseIE, ARDAudiothekBaseIE, ARDMediathekBaseIE, AudiodraftBaseIE, AudiusBaseIE } from './family-bases';

export type HandAEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_A_IES: HandAEntry[] = [
  { ie_key: 'ABC', IE: ABCIE },
  { ie_key: 'ABCIView', IE: ABCIViewIE },
  { ie_key: 'ABCIViewShowSeries', IE: ABCIViewShowSeriesIE },
  { ie_key: 'AbcNews', IE: AbcNewsIE },
  { ie_key: 'AbcNewsVideo', IE: AbcNewsVideoIE },
  { ie_key: 'ABCOTVS', IE: ABCOTVSIE },
  { ie_key: 'ABCOTVSClips', IE: ABCOTVSClipsIE },
  { ie_key: 'AbemaTV', IE: AbemaTVIE },
  { ie_key: 'AbemaTVBase', IE: AbemaTVBaseIE },
  { ie_key: 'AbemaTVTitle', IE: AbemaTVTitleIE },
  { ie_key: 'AcademicEarthCourse', IE: AcademicEarthCourseIE },
  { ie_key: 'ACast', IE: ACastIE },
  { ie_key: 'ACastBase', IE: ACastBaseIE },
  { ie_key: 'ACastChannel', IE: ACastChannelIE },
  { ie_key: 'ADN', IE: ADNIE },
  { ie_key: 'ADNBase', IE: ADNBaseIE },
  { ie_key: 'ADNSeason', IE: ADNSeasonIE },
  { ie_key: 'AdobeConnect', IE: AdobeConnectIE },
  { ie_key: 'AdobePass', IE: AdobePassIE },
  { ie_key: 'AdobeTVVideo', IE: AdobeTVVideoIE },
  { ie_key: 'AdultSwim', IE: AdultSwimIE },
  { ie_key: 'AENetworks', IE: AENetworksIE },
  { ie_key: 'AENetworksBase', IE: AENetworksBaseIE },
  { ie_key: 'AENetworksCollection', IE: AENetworksCollectionIE },
  { ie_key: 'AENetworksListBase', IE: AENetworksListBaseIE },
  { ie_key: 'AENetworksShow', IE: AENetworksShowIE },
  { ie_key: 'AeonCo', IE: AeonCoIE },
  { ie_key: 'AfreecaTV', IE: AfreecaTVIE },
  { ie_key: 'AfreecaTVBase', IE: AfreecaTVBaseIE },
  { ie_key: 'AfreecaTVCatchStory', IE: AfreecaTVCatchStoryIE },
  { ie_key: 'AfreecaTVLive', IE: AfreecaTVLiveIE },
  { ie_key: 'AfreecaTVUser', IE: AfreecaTVUserIE },
  { ie_key: 'AGalega', IE: AGalegaIE },
  { ie_key: 'AGalegaBase', IE: AGalegaBaseIE },
  { ie_key: 'AitubeKZVideo', IE: AitubeKZVideoIE },
  { ie_key: 'Alibaba', IE: AlibabaIE },
  { ie_key: 'AliExpressLive', IE: AliExpressLiveIE },
  { ie_key: 'AlJazeera', IE: AlJazeeraIE },
  { ie_key: 'Allocine', IE: AllocineIE },
  { ie_key: 'Allstar', IE: AllstarIE },
  { ie_key: 'AllstarBase', IE: AllstarBaseIE },
  { ie_key: 'AllstarProfile', IE: AllstarProfileIE },
  { ie_key: 'AlphaPorno', IE: AlphaPornoIE },
  { ie_key: 'AltCensored', IE: AltCensoredIE },
  { ie_key: 'AltCensoredChannel', IE: AltCensoredChannelIE },
  { ie_key: 'Alura', IE: AluraIE },
  { ie_key: 'AluraCourse', IE: AluraCourseIE },
  { ie_key: 'AmadeusTV', IE: AmadeusTVIE },
  { ie_key: 'Amara', IE: AmaraIE },
  { ie_key: 'AmazonMiniTV', IE: AmazonMiniTVIE },
  { ie_key: 'AmazonMiniTVBase', IE: AmazonMiniTVBaseIE },
  { ie_key: 'AmazonMiniTVSeason', IE: AmazonMiniTVSeasonIE },
  { ie_key: 'AmazonMiniTVSeries', IE: AmazonMiniTVSeriesIE },
  { ie_key: 'AmazonReviews', IE: AmazonReviewsIE },
  { ie_key: 'AmazonStore', IE: AmazonStoreIE },
  { ie_key: 'AMCNetworks', IE: AMCNetworksIE },
  { ie_key: 'AmericasTestKitchen', IE: AmericasTestKitchenIE },
  { ie_key: 'AmericasTestKitchenSeason', IE: AmericasTestKitchenSeasonIE },
  { ie_key: 'AMP', IE: AMPIE },
  { ie_key: 'Angel', IE: AngelIE },
  { ie_key: 'Ant1NewsGrArticle', IE: Ant1NewsGrArticleIE },
  { ie_key: 'Ant1NewsGrEmbed', IE: Ant1NewsGrEmbedIE },
  { ie_key: 'AntennaBase', IE: AntennaBaseIE },
  { ie_key: 'AntennaGrWatch', IE: AntennaGrWatchIE },
  { ie_key: 'Anvato', IE: AnvatoIE },
  { ie_key: 'Aol', IE: AolIE },
  { ie_key: 'APA', IE: APAIE },
  { ie_key: 'Aparat', IE: AparatIE },
  { ie_key: 'AppleBase', IE: AppleBaseIE },
  { ie_key: 'AppleConnect', IE: AppleConnectIE },
  { ie_key: 'ApplePodcasts', IE: ApplePodcastsIE },
  { ie_key: 'ArchiveOrg', IE: ArchiveOrgIE },
  { ie_key: 'ArcPublishing', IE: ArcPublishingIE },
  { ie_key: 'ARDAudiothek', IE: ARDAudiothekIE },
  { ie_key: 'ARDAudiothekBase', IE: ARDAudiothekBaseIE },
  { ie_key: 'ARDAudiothekPlaylist', IE: ARDAudiothekPlaylistIE },
  { ie_key: 'ARDBetaMediathek', IE: ARDBetaMediathekIE },
  { ie_key: 'ARDMediathekBase', IE: ARDMediathekBaseIE },
  { ie_key: 'ARDMediathekCollection', IE: ARDMediathekCollectionIE },
  { ie_key: 'Arnes', IE: ArnesIE },
  { ie_key: 'Art19', IE: Art19IE },
  { ie_key: 'Art19Show', IE: Art19ShowIE },
  { ie_key: 'ArteTV', IE: ArteTVIE },
  { ie_key: 'ArteTVBase', IE: ArteTVBaseIE },
  { ie_key: 'ArteTVCategory', IE: ArteTVCategoryIE },
  { ie_key: 'ArteTVEmbed', IE: ArteTVEmbedIE },
  { ie_key: 'ArteTVPlaylist', IE: ArteTVPlaylistIE },
  { ie_key: 'AsobiChannel', IE: AsobiChannelIE },
  { ie_key: 'AsobiChannelBase', IE: AsobiChannelBaseIE },
  { ie_key: 'AsobiChannelTagURL', IE: AsobiChannelTagURLIE },
  { ie_key: 'AsobiStage', IE: AsobiStageIE },
  { ie_key: 'AtresPlayer', IE: AtresPlayerIE },
  { ie_key: 'AtScaleConfEvent', IE: AtScaleConfEventIE },
  { ie_key: 'AudiMedia', IE: AudiMediaIE },
  { ie_key: 'AudioBoom', IE: AudioBoomIE },
  { ie_key: 'AudiodraftBase', IE: AudiodraftBaseIE },
  { ie_key: 'AudiodraftCustom', IE: AudiodraftCustomIE },
  { ie_key: 'AudiodraftGeneric', IE: AudiodraftGenericIE },
  { ie_key: 'Audiomack', IE: AudiomackIE },
  { ie_key: 'AudiomackAlbum', IE: AudiomackAlbumIE },
  { ie_key: 'Audius', IE: AudiusIE },
  { ie_key: 'AudiusBase', IE: AudiusBaseIE },
  { ie_key: 'AudiusPlaylist', IE: AudiusPlaylistIE },
  { ie_key: 'AudiusProfile', IE: AudiusProfileIE },
  { ie_key: 'AudiusTrack', IE: AudiusTrackIE },
  { ie_key: 'AWS', IE: AWSIE },
  { ie_key: 'AZMedien', IE: AZMedienIE },
  { ie_key: 'Biography', IE: BiographyIE },
  { ie_key: 'HistoryPlayer', IE: HistoryPlayerIE },
  { ie_key: 'HistoryTopic', IE: HistoryTopicIE },
  { ie_key: 'TokFMAudition', IE: TokFMAuditionIE },
  { ie_key: 'TokFMPodcast', IE: TokFMPodcastIE },
  { ie_key: 'WyborczaPodcast', IE: WyborczaPodcastIE },
  { ie_key: 'WyborczaVideo', IE: WyborczaVideoIE },
  { ie_key: 'YoutubeWebArchive', IE: YoutubeWebArchiveIE },
];

export {
  ABCIE,
  ABCIViewIE,
  ABCIViewShowSeriesIE,
  AbcNewsIE,
  AbcNewsVideoIE,
  ABCOTVSIE,
  ABCOTVSClipsIE,
  AbemaTVIE,
  AbemaTVBaseIE,
  AbemaTVTitleIE,
  AcademicEarthCourseIE,
  ACastIE,
  ACastBaseIE,
  ACastChannelIE,
  ADNIE,
  ADNBaseIE,
  ADNSeasonIE,
  AdobeConnectIE,
  AdobePassIE,
  AdobeTVVideoIE,
  AdultSwimIE,
  AENetworksIE,
  AENetworksBaseIE,
  AENetworksCollectionIE,
  AENetworksListBaseIE,
  AENetworksShowIE,
  AeonCoIE,
  AfreecaTVIE,
  AfreecaTVBaseIE,
  AfreecaTVCatchStoryIE,
  AfreecaTVLiveIE,
  AfreecaTVUserIE,
  AGalegaIE,
  AGalegaBaseIE,
  AitubeKZVideoIE,
  AlibabaIE,
  AliExpressLiveIE,
  AlJazeeraIE,
  AllocineIE,
  AllstarIE,
  AllstarBaseIE,
  AllstarProfileIE,
  AlphaPornoIE,
  AltCensoredIE,
  AltCensoredChannelIE,
  AluraIE,
  AluraCourseIE,
  AmadeusTVIE,
  AmaraIE,
  AmazonMiniTVIE,
  AmazonMiniTVBaseIE,
  AmazonMiniTVSeasonIE,
  AmazonMiniTVSeriesIE,
  AmazonReviewsIE,
  AmazonStoreIE,
  AMCNetworksIE,
  AmericasTestKitchenIE,
  AmericasTestKitchenSeasonIE,
  AMPIE,
  AngelIE,
  Ant1NewsGrArticleIE,
  Ant1NewsGrEmbedIE,
  AntennaBaseIE,
  AntennaGrWatchIE,
  AnvatoIE,
  AolIE,
  APAIE,
  AparatIE,
  AppleBaseIE,
  AppleConnectIE,
  ApplePodcastsIE,
  ArchiveOrgIE,
  ArcPublishingIE,
  ARDAudiothekIE,
  ARDAudiothekBaseIE,
  ARDAudiothekPlaylistIE,
  ARDBetaMediathekIE,
  ARDMediathekBaseIE,
  ARDMediathekCollectionIE,
  ArnesIE,
  Art19IE,
  Art19ShowIE,
  ArteTVIE,
  ArteTVBaseIE,
  ArteTVCategoryIE,
  ArteTVEmbedIE,
  ArteTVPlaylistIE,
  AsobiChannelIE,
  AsobiChannelBaseIE,
  AsobiChannelTagURLIE,
  AsobiStageIE,
  AtresPlayerIE,
  AtScaleConfEventIE,
  AudiMediaIE,
  AudioBoomIE,
  AudiodraftBaseIE,
  AudiodraftCustomIE,
  AudiodraftGenericIE,
  AudiomackIE,
  AudiomackAlbumIE,
  AudiusIE,
  AudiusBaseIE,
  AudiusPlaylistIE,
  AudiusProfileIE,
  AudiusTrackIE,
  AWSIE,
  AZMedienIE,
  BiographyIE,
  HistoryPlayerIE,
  HistoryTopicIE,
  TokFMAuditionIE,
  TokFMPodcastIE,
  WyborczaPodcastIE,
  WyborczaVideoIE,
  YoutubeWebArchiveIE,
};
