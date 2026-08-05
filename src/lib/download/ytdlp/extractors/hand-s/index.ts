/**
 * Hand-written batch S (s4c → sztvhu, skip Soundcloud) — auto-rebuilt by port/rebuild-hand-s-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { S4CIE, S4CSeriesIE } from './s4c';
import { SafariIE, SafariApiIE, SafariBaseIE, SafariCourseIE } from './safari';
import { SaitosanIE } from './saitosan';
import { SampleFocusIE } from './samplefocus';
import { SapoIE } from './sapo';
import { SaucePlusIE, SaucePlusChannelIE } from './sauceplus';
import { SBSIE } from './sbs';
import { SBSCoKrIE, SBSCoKrAllvodProgramIE, SBSCoKrProgramsVodIE } from './sbscokr';
import { Screen9IE } from './screen9';
import { ScreencastIE } from './screencast';
import { ScreencastifyIE } from './screencastify';
import { ScreencastOMaticIE } from './screencastomatic';
import { ScreenRecIE } from './screenrec';
import { ScrippsNetworksIE, ScrippsNetworksWatchIE } from './scrippsnetworks';
import { ScrolllerIE } from './scrolller';
import { SejmIE } from './sejmpl';
import { SenIE } from './sen';
import { SenalColombiaLiveIE } from './senalcolombia';
import { SenateGovIE, SenateISVPIE } from './senategov';
import { ServusIE } from './servus';
import { SevenPlusIE } from './sevenplus';
import { SexuIE } from './sexu';
import { SeznamZpravyIE, SeznamZpravyArticleIE } from './seznamzpravy';
import { ShahidIE, ShahidBaseIE, ShahidShowIE } from './shahid';
import { SharePointIE } from './sharepoint';
import { ShemarooMeIE } from './shemaroome';
import { ShieyIE } from './shiey';
import { ShowRoomLiveIE, ShowRoomVodIE } from './showroomlive';
import { SibnetEmbedIE } from './sibnet';
import { SimplecastIE, SimplecastBaseIE, SimplecastEpisodeIE, SimplecastPodcastIE } from './simplecast';
import { SinaIE } from './sina';
import { SkebIE } from './skeb';
import { SkyBaseIE, SkyNewsIE, SkyNewsStoryIE, SkySportsIE, SkySportsNewsIE } from './sky';
import { CieloTVItIE, SkyItIE, SkyItArteIE, SkyItBaseIE, SkyItPlayerIE, SkyItVideoIE, SkyItVideoLiveIE, TV8ItIE, TV8ItLiveIE, TV8ItPlaylistIE } from './skyit';
import { SkylineWebcamsIE } from './skylinewebcams';
import { SkyNewsArabiaIE, SkyNewsArabiaArticleIE, SkyNewsArabiaBaseIE } from './skynewsarabia';
import { SkyNewsAUIE } from './skynewsau';
import { SlideshareIE } from './slideshare';
import { SlidesLiveIE } from './slideslive';
import { SlutloadIE } from './slutload';
import { SmotrimIE, SmotrimAudioIE, SmotrimBaseIE, SmotrimLiveIE, SmotrimPlaylistIE } from './smotrim';
import { SnapchatSpotlightIE } from './snapchat';
import { SoftWhiteUnderbellyIE } from './softwhiteunderbelly';
import { SohuIE, SohuVIE } from './sohu';
import { SonyLIVIE, SonyLIVSeriesIE } from './sonyliv';
import { SoundcloudBaseIE, SoundcloudEmbedIE, SoundcloudPagedPlaylistBaseIE, SoundcloudPlaylistIE, SoundcloudPlaylistBaseIE, SoundcloudRelatedIE, SoundcloudSearchIE, SoundcloudSetIE, SoundcloudTrackStationIE, SoundcloudUserIE, SoundcloudUserPermalinkIE } from './soundcloud';
import { SoundgasmIE, SoundgasmProfileIE } from './soundgasm';
import { SouthParkIE, SouthParkComBrIE, SouthParkCoUkIE, SouthParkDeIE, SouthParkDkIE, SouthParkEsIE, SouthParkLatIE } from './southpark';
import { SovietsClosetIE, SovietsClosetBaseIE, SovietsClosetPlaylistIE } from './sovietscloset';
import { SpankBangIE, SpankBangPlaylistIE } from './spankbang';
import { SpiegelIE } from './spiegel';
import { Sport5IE } from './sport5';
import { SportBoxIE } from './sportbox';
import { SportDeutschlandIE } from './sportdeutschland';
import { SpreakerIE, SpreakerShowIE } from './spreaker';
import { SproutVideoIE, VidsIoIE } from './sproutvideo';
import { SRGSSRIE, SRGSSRPlayIE } from './srgssr';
import { ARDMediathekBaseIE, SRMediathekIE } from './srmediathek';
import { StacommuBaseIE, StacommuLiveIE, StacommuVODIE, TheaterComplexTownBaseIE, TheaterComplexTownPPVIE, TheaterComplexTownVODIE, WrestleUniverseBaseIE } from './stacommu';
import { StagePlusVODConcertIE } from './stageplus';
import { StarTrekIE } from './startrek';
import { StarTVIE } from './startv';
import { SteamIE, SteamCommunityIE, SteamCommunityBroadcastIE } from './steam';
import { StoryFireIE, StoryFireBaseIE, StoryFireSeriesIE, StoryFireUserIE } from './storyfire';
import { StreaksIE, StreaksBaseIE } from './streaks';
import { StreamableIE } from './streamable';
import { StreamCZIE } from './streamcz';
import { StreetVoiceIE } from './streetvoice';
import { StripchatIE } from './stripchat';
import { STVPlayerIE } from './stv';
import { SubsplashIE, SubsplashBaseIE, SubsplashPlaylistIE } from './subsplash';
import { SubstackIE } from './substack';
import { SunPornoIE } from './sunporno';
import { SverigesRadioBaseIE, SverigesRadioEpisodeIE, SverigesRadioPublicationIE } from './sverigesradio';
import { SVTBaseIE, SVTPageIE, SVTPlayIE, SVTSeriesIE } from './svt';
import { SztvHuIE } from './sztvhu';

export type HandSEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_S_IES: HandSEntry[] = [
  { ie_key: 'ARDMediathekBase', IE: ARDMediathekBaseIE },
  { ie_key: 'CieloTVIt', IE: CieloTVItIE },
  { ie_key: 'S4C', IE: S4CIE },
  { ie_key: 'S4CSeries', IE: S4CSeriesIE },
  { ie_key: 'Safari', IE: SafariIE },
  { ie_key: 'SafariApi', IE: SafariApiIE },
  { ie_key: 'SafariBase', IE: SafariBaseIE },
  { ie_key: 'SafariCourse', IE: SafariCourseIE },
  { ie_key: 'Saitosan', IE: SaitosanIE },
  { ie_key: 'SampleFocus', IE: SampleFocusIE },
  { ie_key: 'Sapo', IE: SapoIE },
  { ie_key: 'SaucePlus', IE: SaucePlusIE },
  { ie_key: 'SaucePlusChannel', IE: SaucePlusChannelIE },
  { ie_key: 'SBS', IE: SBSIE },
  { ie_key: 'SBSCoKr', IE: SBSCoKrIE },
  { ie_key: 'SBSCoKrAllvodProgram', IE: SBSCoKrAllvodProgramIE },
  { ie_key: 'SBSCoKrProgramsVod', IE: SBSCoKrProgramsVodIE },
  { ie_key: 'Screen9', IE: Screen9IE },
  { ie_key: 'Screencast', IE: ScreencastIE },
  { ie_key: 'Screencastify', IE: ScreencastifyIE },
  { ie_key: 'ScreencastOMatic', IE: ScreencastOMaticIE },
  { ie_key: 'ScreenRec', IE: ScreenRecIE },
  { ie_key: 'ScrippsNetworks', IE: ScrippsNetworksIE },
  { ie_key: 'ScrippsNetworksWatch', IE: ScrippsNetworksWatchIE },
  { ie_key: 'Scrolller', IE: ScrolllerIE },
  { ie_key: 'Sejm', IE: SejmIE },
  { ie_key: 'Sen', IE: SenIE },
  { ie_key: 'SenalColombiaLive', IE: SenalColombiaLiveIE },
  { ie_key: 'SenateGov', IE: SenateGovIE },
  { ie_key: 'SenateISVP', IE: SenateISVPIE },
  { ie_key: 'Servus', IE: ServusIE },
  { ie_key: 'SevenPlus', IE: SevenPlusIE },
  { ie_key: 'Sexu', IE: SexuIE },
  { ie_key: 'SeznamZpravy', IE: SeznamZpravyIE },
  { ie_key: 'SeznamZpravyArticle', IE: SeznamZpravyArticleIE },
  { ie_key: 'Shahid', IE: ShahidIE },
  { ie_key: 'ShahidBase', IE: ShahidBaseIE },
  { ie_key: 'ShahidShow', IE: ShahidShowIE },
  { ie_key: 'SharePoint', IE: SharePointIE },
  { ie_key: 'ShemarooMe', IE: ShemarooMeIE },
  { ie_key: 'Shiey', IE: ShieyIE },
  { ie_key: 'ShowRoomLive', IE: ShowRoomLiveIE },
  { ie_key: 'ShowRoomVod', IE: ShowRoomVodIE },
  { ie_key: 'SibnetEmbed', IE: SibnetEmbedIE },
  { ie_key: 'Simplecast', IE: SimplecastIE },
  { ie_key: 'SimplecastBase', IE: SimplecastBaseIE },
  { ie_key: 'SimplecastEpisode', IE: SimplecastEpisodeIE },
  { ie_key: 'SimplecastPodcast', IE: SimplecastPodcastIE },
  { ie_key: 'Sina', IE: SinaIE },
  { ie_key: 'Skeb', IE: SkebIE },
  { ie_key: 'SkyBase', IE: SkyBaseIE },
  { ie_key: 'SkyIt', IE: SkyItIE },
  { ie_key: 'SkyItArte', IE: SkyItArteIE },
  { ie_key: 'SkyItBase', IE: SkyItBaseIE },
  { ie_key: 'SkyItPlayer', IE: SkyItPlayerIE },
  { ie_key: 'SkyItVideo', IE: SkyItVideoIE },
  { ie_key: 'SkyItVideoLive', IE: SkyItVideoLiveIE },
  { ie_key: 'SkylineWebcams', IE: SkylineWebcamsIE },
  { ie_key: 'SkyNews', IE: SkyNewsIE },
  { ie_key: 'SkyNewsArabia', IE: SkyNewsArabiaIE },
  { ie_key: 'SkyNewsArabiaArticle', IE: SkyNewsArabiaArticleIE },
  { ie_key: 'SkyNewsArabiaBase', IE: SkyNewsArabiaBaseIE },
  { ie_key: 'SkyNewsAU', IE: SkyNewsAUIE },
  { ie_key: 'SkyNewsStory', IE: SkyNewsStoryIE },
  { ie_key: 'SkySports', IE: SkySportsIE },
  { ie_key: 'SkySportsNews', IE: SkySportsNewsIE },
  { ie_key: 'Slideshare', IE: SlideshareIE },
  { ie_key: 'SlidesLive', IE: SlidesLiveIE },
  { ie_key: 'Slutload', IE: SlutloadIE },
  { ie_key: 'Smotrim', IE: SmotrimIE },
  { ie_key: 'SmotrimAudio', IE: SmotrimAudioIE },
  { ie_key: 'SmotrimBase', IE: SmotrimBaseIE },
  { ie_key: 'SmotrimLive', IE: SmotrimLiveIE },
  { ie_key: 'SmotrimPlaylist', IE: SmotrimPlaylistIE },
  { ie_key: 'SnapchatSpotlight', IE: SnapchatSpotlightIE },
  { ie_key: 'SoftWhiteUnderbelly', IE: SoftWhiteUnderbellyIE },
  { ie_key: 'Sohu', IE: SohuIE },
  { ie_key: 'SohuV', IE: SohuVIE },
  { ie_key: 'SonyLIV', IE: SonyLIVIE },
  { ie_key: 'SonyLIVSeries', IE: SonyLIVSeriesIE },
  { ie_key: 'SoundcloudBase', IE: SoundcloudBaseIE },
  { ie_key: 'SoundcloudEmbed', IE: SoundcloudEmbedIE },
  { ie_key: 'SoundcloudPagedPlaylistBase', IE: SoundcloudPagedPlaylistBaseIE },
  { ie_key: 'SoundcloudPlaylist', IE: SoundcloudPlaylistIE },
  { ie_key: 'SoundcloudPlaylistBase', IE: SoundcloudPlaylistBaseIE },
  { ie_key: 'SoundcloudRelated', IE: SoundcloudRelatedIE },
  { ie_key: 'SoundcloudSearch', IE: SoundcloudSearchIE },
  { ie_key: 'SoundcloudSet', IE: SoundcloudSetIE },
  { ie_key: 'SoundcloudTrackStation', IE: SoundcloudTrackStationIE },
  { ie_key: 'SoundcloudUser', IE: SoundcloudUserIE },
  { ie_key: 'SoundcloudUserPermalink', IE: SoundcloudUserPermalinkIE },
  { ie_key: 'Soundgasm', IE: SoundgasmIE },
  { ie_key: 'SoundgasmProfile', IE: SoundgasmProfileIE },
  { ie_key: 'SouthPark', IE: SouthParkIE },
  { ie_key: 'SouthParkComBr', IE: SouthParkComBrIE },
  { ie_key: 'SouthParkCoUk', IE: SouthParkCoUkIE },
  { ie_key: 'SouthParkDe', IE: SouthParkDeIE },
  { ie_key: 'SouthParkDk', IE: SouthParkDkIE },
  { ie_key: 'SouthParkEs', IE: SouthParkEsIE },
  { ie_key: 'SouthParkLat', IE: SouthParkLatIE },
  { ie_key: 'SovietsCloset', IE: SovietsClosetIE },
  { ie_key: 'SovietsClosetBase', IE: SovietsClosetBaseIE },
  { ie_key: 'SovietsClosetPlaylist', IE: SovietsClosetPlaylistIE },
  { ie_key: 'SpankBang', IE: SpankBangIE },
  { ie_key: 'SpankBangPlaylist', IE: SpankBangPlaylistIE },
  { ie_key: 'Spiegel', IE: SpiegelIE },
  { ie_key: 'Sport5', IE: Sport5IE },
  { ie_key: 'SportBox', IE: SportBoxIE },
  { ie_key: 'SportDeutschland', IE: SportDeutschlandIE },
  { ie_key: 'Spreaker', IE: SpreakerIE },
  { ie_key: 'SpreakerShow', IE: SpreakerShowIE },
  { ie_key: 'SproutVideo', IE: SproutVideoIE },
  { ie_key: 'SRGSSR', IE: SRGSSRIE },
  { ie_key: 'SRGSSRPlay', IE: SRGSSRPlayIE },
  { ie_key: 'SRMediathek', IE: SRMediathekIE },
  { ie_key: 'StacommuBase', IE: StacommuBaseIE },
  { ie_key: 'StacommuLive', IE: StacommuLiveIE },
  { ie_key: 'StacommuVOD', IE: StacommuVODIE },
  { ie_key: 'StagePlusVODConcert', IE: StagePlusVODConcertIE },
  { ie_key: 'StarTrek', IE: StarTrekIE },
  { ie_key: 'StarTV', IE: StarTVIE },
  { ie_key: 'Steam', IE: SteamIE },
  { ie_key: 'SteamCommunity', IE: SteamCommunityIE },
  { ie_key: 'SteamCommunityBroadcast', IE: SteamCommunityBroadcastIE },
  { ie_key: 'StoryFire', IE: StoryFireIE },
  { ie_key: 'StoryFireBase', IE: StoryFireBaseIE },
  { ie_key: 'StoryFireSeries', IE: StoryFireSeriesIE },
  { ie_key: 'StoryFireUser', IE: StoryFireUserIE },
  { ie_key: 'Streaks', IE: StreaksIE },
  { ie_key: 'StreaksBase', IE: StreaksBaseIE },
  { ie_key: 'Streamable', IE: StreamableIE },
  { ie_key: 'StreamCZ', IE: StreamCZIE },
  { ie_key: 'StreetVoice', IE: StreetVoiceIE },
  { ie_key: 'Stripchat', IE: StripchatIE },
  { ie_key: 'STVPlayer', IE: STVPlayerIE },
  { ie_key: 'Subsplash', IE: SubsplashIE },
  { ie_key: 'SubsplashBase', IE: SubsplashBaseIE },
  { ie_key: 'SubsplashPlaylist', IE: SubsplashPlaylistIE },
  { ie_key: 'Substack', IE: SubstackIE },
  { ie_key: 'SunPorno', IE: SunPornoIE },
  { ie_key: 'SverigesRadioBase', IE: SverigesRadioBaseIE },
  { ie_key: 'SverigesRadioEpisode', IE: SverigesRadioEpisodeIE },
  { ie_key: 'SverigesRadioPublication', IE: SverigesRadioPublicationIE },
  { ie_key: 'SVTBase', IE: SVTBaseIE },
  { ie_key: 'SVTPage', IE: SVTPageIE },
  { ie_key: 'SVTPlay', IE: SVTPlayIE },
  { ie_key: 'SVTSeries', IE: SVTSeriesIE },
  { ie_key: 'SztvHu', IE: SztvHuIE },
  { ie_key: 'TheaterComplexTownBase', IE: TheaterComplexTownBaseIE },
  { ie_key: 'TheaterComplexTownPPV', IE: TheaterComplexTownPPVIE },
  { ie_key: 'TheaterComplexTownVOD', IE: TheaterComplexTownVODIE },
  { ie_key: 'TV8It', IE: TV8ItIE },
  { ie_key: 'TV8ItLive', IE: TV8ItLiveIE },
  { ie_key: 'TV8ItPlaylist', IE: TV8ItPlaylistIE },
  { ie_key: 'VidsIo', IE: VidsIoIE },
  { ie_key: 'WrestleUniverseBase', IE: WrestleUniverseBaseIE },
];

export {
  ARDMediathekBaseIE,
  CieloTVItIE,
  S4CIE,
  S4CSeriesIE,
  SafariIE,
  SafariApiIE,
  SafariBaseIE,
  SafariCourseIE,
  SaitosanIE,
  SampleFocusIE,
  SapoIE,
  SaucePlusIE,
  SaucePlusChannelIE,
  SBSIE,
  SBSCoKrIE,
  SBSCoKrAllvodProgramIE,
  SBSCoKrProgramsVodIE,
  Screen9IE,
  ScreencastIE,
  ScreencastifyIE,
  ScreencastOMaticIE,
  ScreenRecIE,
  ScrippsNetworksIE,
  ScrippsNetworksWatchIE,
  ScrolllerIE,
  SejmIE,
  SenIE,
  SenalColombiaLiveIE,
  SenateGovIE,
  SenateISVPIE,
  ServusIE,
  SevenPlusIE,
  SexuIE,
  SeznamZpravyIE,
  SeznamZpravyArticleIE,
  ShahidIE,
  ShahidBaseIE,
  ShahidShowIE,
  SharePointIE,
  ShemarooMeIE,
  ShieyIE,
  ShowRoomLiveIE,
  ShowRoomVodIE,
  SibnetEmbedIE,
  SimplecastIE,
  SimplecastBaseIE,
  SimplecastEpisodeIE,
  SimplecastPodcastIE,
  SinaIE,
  SkebIE,
  SkyBaseIE,
  SkyItIE,
  SkyItArteIE,
  SkyItBaseIE,
  SkyItPlayerIE,
  SkyItVideoIE,
  SkyItVideoLiveIE,
  SkylineWebcamsIE,
  SkyNewsIE,
  SkyNewsArabiaIE,
  SkyNewsArabiaArticleIE,
  SkyNewsArabiaBaseIE,
  SkyNewsAUIE,
  SkyNewsStoryIE,
  SkySportsIE,
  SkySportsNewsIE,
  SlideshareIE,
  SlidesLiveIE,
  SlutloadIE,
  SmotrimIE,
  SmotrimAudioIE,
  SmotrimBaseIE,
  SmotrimLiveIE,
  SmotrimPlaylistIE,
  SnapchatSpotlightIE,
  SoftWhiteUnderbellyIE,
  SohuIE,
  SohuVIE,
  SonyLIVIE,
  SonyLIVSeriesIE,
  SoundcloudBaseIE,
  SoundcloudEmbedIE,
  SoundcloudPagedPlaylistBaseIE,
  SoundcloudPlaylistIE,
  SoundcloudPlaylistBaseIE,
  SoundcloudRelatedIE,
  SoundcloudSearchIE,
  SoundcloudSetIE,
  SoundcloudTrackStationIE,
  SoundcloudUserIE,
  SoundcloudUserPermalinkIE,
  SoundgasmIE,
  SoundgasmProfileIE,
  SouthParkIE,
  SouthParkComBrIE,
  SouthParkCoUkIE,
  SouthParkDeIE,
  SouthParkDkIE,
  SouthParkEsIE,
  SouthParkLatIE,
  SovietsClosetIE,
  SovietsClosetBaseIE,
  SovietsClosetPlaylistIE,
  SpankBangIE,
  SpankBangPlaylistIE,
  SpiegelIE,
  Sport5IE,
  SportBoxIE,
  SportDeutschlandIE,
  SpreakerIE,
  SpreakerShowIE,
  SproutVideoIE,
  SRGSSRIE,
  SRGSSRPlayIE,
  SRMediathekIE,
  StacommuBaseIE,
  StacommuLiveIE,
  StacommuVODIE,
  StagePlusVODConcertIE,
  StarTrekIE,
  StarTVIE,
  SteamIE,
  SteamCommunityIE,
  SteamCommunityBroadcastIE,
  StoryFireIE,
  StoryFireBaseIE,
  StoryFireSeriesIE,
  StoryFireUserIE,
  StreaksIE,
  StreaksBaseIE,
  StreamableIE,
  StreamCZIE,
  StreetVoiceIE,
  StripchatIE,
  STVPlayerIE,
  SubsplashIE,
  SubsplashBaseIE,
  SubsplashPlaylistIE,
  SubstackIE,
  SunPornoIE,
  SverigesRadioBaseIE,
  SverigesRadioEpisodeIE,
  SverigesRadioPublicationIE,
  SVTBaseIE,
  SVTPageIE,
  SVTPlayIE,
  SVTSeriesIE,
  SztvHuIE,
  TheaterComplexTownBaseIE,
  TheaterComplexTownPPVIE,
  TheaterComplexTownVODIE,
  TV8ItIE,
  TV8ItLiveIE,
  TV8ItPlaylistIE,
  VidsIoIE,
  WrestleUniverseBaseIE,
};
