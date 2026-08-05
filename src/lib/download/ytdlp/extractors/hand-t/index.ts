/**
 * Hand-written batch T (tagesschau → txxx, skip existing) — auto-rebuilt by port/rebuild-hand-t-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { TagesschauIE } from './tagesschau';
import { TapTapAppIE, TapTapAppIntlIE, TapTapBaseIE, TapTapIntlBaseIE, TapTapMomentIE, TapTapPostIntlIE } from './taptap';
import { TarangPlusBaseIE, TarangPlusEpisodesIE, TarangPlusPlaylistIE, TarangPlusVideoIE } from './tarangplus';
import { TassIE } from './tass';
import { TBSIE, TurnerBaseIE } from './tbs';
import { TBSJPBaseIE, TBSJPEpisodeIE, TBSJPPlaylistIE, TBSJPProgramIE } from './tbsjp';
import { TeachableIE, TeachableBaseIE, TeachableCourseIE } from './teachable';
import { TeacherTubeIE, TeacherTubeUserIE } from './teachertube';
import { TeachingChannelIE } from './teachingchannel';
import { ConanClassicIE, TeamcocoIE, TeamcocoBaseIE } from './teamcoco';
import { TeamTreeHouseIE } from './teamtreehouse';
import { TedBaseIE, TedEmbedIE, TedPlaylistIE, TedSeriesIE, TedTalkIE } from './ted';
import { Tele13IE } from './tele13';
import { Tele5IE } from './tele5';
import { TeleBruxellesIE } from './telebruxelles';
import { TelecaribePlayIE } from './telecaribe';
import { TelecincoIE, TelecincoBaseIE } from './telecinco';
import { TelegraafIE } from './telegraaf';
import { TelegramEmbedIE } from './telegram';
import { TeleMBIE } from './telemb';
import { TelemundoIE } from './telemundo';
import { TeleQuebecIE, TeleQuebecBaseIE, TeleQuebecEmissionIE, TeleQuebecLiveIE, TeleQuebecSquatIE, TeleQuebecVideoIE } from './telequebec';
import { TeleTaskIE } from './teletask';
import { TelewebionIE } from './telewebion';
import { IflixBaseIE, IflixEpisodeIE, IflixSeriesIE, TencentBaseIE, VQQBaseIE, WeTvBaseIE, WeTvEpisodeIE, WeTvSeriesIE } from './tencent';
import { TennisTVIE } from './tennistv';
import { TenPlayIE, TenPlaySeasonIE } from './tenplay';
import { TestURLIE } from './testurl';
import { TF1IE } from './tf1';
import { TFOIE } from './tfo';
import { TheChosenIE, TheChosenGroupIE } from './thechosen';
import { TheGuardianPodcastIE, TheGuardianPodcastPlaylistIE } from './theguardian';
import { TheHighWireIE } from './thehighwire';
import { TheInterceptIE } from './theintercept';
import { ThePlatformIE, ThePlatformBaseIE, ThePlatformFeedIE } from './theplatform';
import { TheStarIE } from './thestar';
import { TheSunIE } from './thesun';
import { TheWeatherChannelIE } from './theweatherchannel';
import { ThisAmericanLifeIE } from './thisamericanlife';
import { ThisOldHouseIE } from './thisoldhouse';
import { ThisVidIE, ThisVidMemberIE, ThisVidPlaylistIE, ThisVidPlaylistBaseIE } from './thisvid';
import { ThreeQSDNIE } from './threeqsdn';
import { ThreeSpeakIE, ThreeSpeakUserIE } from './threespeak';
import { TikTokBaseIE, TikTokBaseListIE, TikTokCollectionIE, TikTokEffectIE, TikTokLiveIE, TikTokSoundIE, TikTokTagIE, TikTokUserIE, TikTokVMIE } from './tiktok';
import { TMZIE } from './tmz';
import { EMPFlixIE, MovieFapIE, TNAEMPFlixBaseIE, TNAFlixIE, TNAFlixNetworkBaseIE, TNAFlixNetworkEmbedIE } from './tnaflix';
import { MeWatchIE, ToggleIE } from './toggle';
import { ToggoIE } from './toggo';
import { TOnlineIE } from './tonline';
import { ToonGogglesIE } from './toongoggles';
import { ToutiaoIE } from './toutiao';
import { TouTvIE } from './toutv';
import { ToypicsIE, ToypicsUserIE } from './toypics';
import { TrtCocukVideoIE } from './trtcocuk';
import { TrtWorldIE } from './trtworld';
import { TrueIDIE } from './trueid';
import { TruNewsIE } from './trunews';
import { TruthIE } from './truth';
import { Tube8IE } from './tube8';
import { TubeTuGrazIE, TubeTuGrazBaseIE, TubeTuGrazSeriesIE } from './tubetugraz';
import { TubiTvIE, TubiTvShowIE } from './tubitv';
import { TumblrIE } from './tumblr';
import { TuneInBaseIE, TuneInEmbedIE, TuneInPodcastIE, TuneInPodcastEpisodeIE, TuneInShortenerIE, TuneInStationIE } from './tunein';
import { KatsomoIE, MTVUutisetArticleIE, TV2IE, TV2ArticleIE } from './tv2';
import { TV24UAVideoIE } from './tv24ua';
import { TV2DKIE, TV2DKBornholmPlayIE } from './tv2dk';
import { TV2HuIE, TV2HuSeriesIE } from './tv2hu';
import { TV4IE } from './tv4';
import { TV5MondePlusIE } from './tv5mondeplus';
import { TV5UnisIE, TV5UnisBaseIE, TV5UnisVideoIE } from './tv5unis';
import { TVAIE } from './tva';
import { TVANouvellesIE, TVANouvellesArticleIE } from './tvanouvelles';
import { TVCIE, TVCArticleIE } from './tvc';
import { StreaksBaseIE, TVerIE, TVerOlympicIE } from './tver';
import { TvigleIE } from './tvigle';
import { TVIPlayerIE } from './tviplayer';
import { TVN24IE } from './tvn24';
import { TVNoeIE } from './tvnoe';
import { TvoIE } from './tvo';
import { TVOpenGrBaseIE, TVOpenGrEmbedIE, TVOpenGrWatchIE } from './tvopengr';
import { TVPIE, TVPEmbedIE, TVPStreamIE, TVPVODBaseIE, TVPVODSeriesIE, TVPVODVideoIE } from './tvp';
import { TVPlayIE, TVPlayHomeIE } from './tvplay';
import { TvwIE, TvwNewsIE, TvwTvChannelsIE } from './tvw';
import { TweakersIE } from './tweakers';
import { TwentyMinutenIE } from './twentymin';
import { TwentyThreeVideoIE } from './twentythreevideo';
import { TwitCastingIE, TwitCastingLiveIE, TwitCastingUserIE } from './twitcasting';
import { TwitchBaseIE, TwitchPlaylistBaseIE, TwitchVideosBaseIE, TwitchVideosClipsIE, TwitchVideosCollectionsIE } from './twitch';
import { TwitterAmplifyIE, TwitterBaseIE, TwitterBroadcastIE, TwitterCardIE, TwitterSpacesIE } from './twitter';
import { PornTopIE, TxxxIE } from './txxx';

export type HandTEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_T_IES: HandTEntry[] = [
  { ie_key: 'ConanClassic', IE: ConanClassicIE },
  { ie_key: 'EMPFlix', IE: EMPFlixIE },
  { ie_key: 'IflixBase', IE: IflixBaseIE },
  { ie_key: 'IflixEpisode', IE: IflixEpisodeIE },
  { ie_key: 'IflixSeries', IE: IflixSeriesIE },
  { ie_key: 'Katsomo', IE: KatsomoIE },
  { ie_key: 'MeWatch', IE: MeWatchIE },
  { ie_key: 'MovieFap', IE: MovieFapIE },
  { ie_key: 'MTVUutisetArticle', IE: MTVUutisetArticleIE },
  { ie_key: 'PornTop', IE: PornTopIE },
  { ie_key: 'StreaksBase', IE: StreaksBaseIE },
  { ie_key: 'Tagesschau', IE: TagesschauIE },
  { ie_key: 'TapTapApp', IE: TapTapAppIE },
  { ie_key: 'TapTapAppIntl', IE: TapTapAppIntlIE },
  { ie_key: 'TapTapBase', IE: TapTapBaseIE },
  { ie_key: 'TapTapIntlBase', IE: TapTapIntlBaseIE },
  { ie_key: 'TapTapMoment', IE: TapTapMomentIE },
  { ie_key: 'TapTapPostIntl', IE: TapTapPostIntlIE },
  { ie_key: 'TarangPlusBase', IE: TarangPlusBaseIE },
  { ie_key: 'TarangPlusEpisodes', IE: TarangPlusEpisodesIE },
  { ie_key: 'TarangPlusPlaylist', IE: TarangPlusPlaylistIE },
  { ie_key: 'TarangPlusVideo', IE: TarangPlusVideoIE },
  { ie_key: 'Tass', IE: TassIE },
  { ie_key: 'TBS', IE: TBSIE },
  { ie_key: 'TBSJPBase', IE: TBSJPBaseIE },
  { ie_key: 'TBSJPEpisode', IE: TBSJPEpisodeIE },
  { ie_key: 'TBSJPPlaylist', IE: TBSJPPlaylistIE },
  { ie_key: 'TBSJPProgram', IE: TBSJPProgramIE },
  { ie_key: 'Teachable', IE: TeachableIE },
  { ie_key: 'TeachableBase', IE: TeachableBaseIE },
  { ie_key: 'TeachableCourse', IE: TeachableCourseIE },
  { ie_key: 'TeacherTube', IE: TeacherTubeIE },
  { ie_key: 'TeacherTubeUser', IE: TeacherTubeUserIE },
  { ie_key: 'TeachingChannel', IE: TeachingChannelIE },
  { ie_key: 'Teamcoco', IE: TeamcocoIE },
  { ie_key: 'TeamcocoBase', IE: TeamcocoBaseIE },
  { ie_key: 'TeamTreeHouse', IE: TeamTreeHouseIE },
  { ie_key: 'TedBase', IE: TedBaseIE },
  { ie_key: 'TedEmbed', IE: TedEmbedIE },
  { ie_key: 'TedPlaylist', IE: TedPlaylistIE },
  { ie_key: 'TedSeries', IE: TedSeriesIE },
  { ie_key: 'TedTalk', IE: TedTalkIE },
  { ie_key: 'Tele13', IE: Tele13IE },
  { ie_key: 'Tele5', IE: Tele5IE },
  { ie_key: 'TeleBruxelles', IE: TeleBruxellesIE },
  { ie_key: 'TelecaribePlay', IE: TelecaribePlayIE },
  { ie_key: 'Telecinco', IE: TelecincoIE },
  { ie_key: 'TelecincoBase', IE: TelecincoBaseIE },
  { ie_key: 'Telegraaf', IE: TelegraafIE },
  { ie_key: 'TelegramEmbed', IE: TelegramEmbedIE },
  { ie_key: 'TeleMB', IE: TeleMBIE },
  { ie_key: 'Telemundo', IE: TelemundoIE },
  { ie_key: 'TeleQuebec', IE: TeleQuebecIE },
  { ie_key: 'TeleQuebecBase', IE: TeleQuebecBaseIE },
  { ie_key: 'TeleQuebecEmission', IE: TeleQuebecEmissionIE },
  { ie_key: 'TeleQuebecLive', IE: TeleQuebecLiveIE },
  { ie_key: 'TeleQuebecSquat', IE: TeleQuebecSquatIE },
  { ie_key: 'TeleQuebecVideo', IE: TeleQuebecVideoIE },
  { ie_key: 'TeleTask', IE: TeleTaskIE },
  { ie_key: 'Telewebion', IE: TelewebionIE },
  { ie_key: 'TencentBase', IE: TencentBaseIE },
  { ie_key: 'TennisTV', IE: TennisTVIE },
  { ie_key: 'TenPlay', IE: TenPlayIE },
  { ie_key: 'TenPlaySeason', IE: TenPlaySeasonIE },
  { ie_key: 'TestURL', IE: TestURLIE },
  { ie_key: 'TF1', IE: TF1IE },
  { ie_key: 'TFO', IE: TFOIE },
  { ie_key: 'TheChosen', IE: TheChosenIE },
  { ie_key: 'TheChosenGroup', IE: TheChosenGroupIE },
  { ie_key: 'TheGuardianPodcast', IE: TheGuardianPodcastIE },
  { ie_key: 'TheGuardianPodcastPlaylist', IE: TheGuardianPodcastPlaylistIE },
  { ie_key: 'TheHighWire', IE: TheHighWireIE },
  { ie_key: 'TheIntercept', IE: TheInterceptIE },
  { ie_key: 'ThePlatform', IE: ThePlatformIE },
  { ie_key: 'ThePlatformBase', IE: ThePlatformBaseIE },
  { ie_key: 'ThePlatformFeed', IE: ThePlatformFeedIE },
  { ie_key: 'TheStar', IE: TheStarIE },
  { ie_key: 'TheSun', IE: TheSunIE },
  { ie_key: 'TheWeatherChannel', IE: TheWeatherChannelIE },
  { ie_key: 'ThisAmericanLife', IE: ThisAmericanLifeIE },
  { ie_key: 'ThisOldHouse', IE: ThisOldHouseIE },
  { ie_key: 'ThisVid', IE: ThisVidIE },
  { ie_key: 'ThisVidMember', IE: ThisVidMemberIE },
  { ie_key: 'ThisVidPlaylist', IE: ThisVidPlaylistIE },
  { ie_key: 'ThisVidPlaylistBase', IE: ThisVidPlaylistBaseIE },
  { ie_key: 'ThreeQSDN', IE: ThreeQSDNIE },
  { ie_key: 'ThreeSpeak', IE: ThreeSpeakIE },
  { ie_key: 'ThreeSpeakUser', IE: ThreeSpeakUserIE },
  { ie_key: 'TikTokBase', IE: TikTokBaseIE },
  { ie_key: 'TikTokBaseList', IE: TikTokBaseListIE },
  { ie_key: 'TikTokCollection', IE: TikTokCollectionIE },
  { ie_key: 'TikTokEffect', IE: TikTokEffectIE },
  { ie_key: 'TikTokLive', IE: TikTokLiveIE },
  { ie_key: 'TikTokSound', IE: TikTokSoundIE },
  { ie_key: 'TikTokTag', IE: TikTokTagIE },
  { ie_key: 'TikTokUser', IE: TikTokUserIE },
  { ie_key: 'TikTokVM', IE: TikTokVMIE },
  { ie_key: 'TMZ', IE: TMZIE },
  { ie_key: 'TNAEMPFlixBase', IE: TNAEMPFlixBaseIE },
  { ie_key: 'TNAFlix', IE: TNAFlixIE },
  { ie_key: 'TNAFlixNetworkBase', IE: TNAFlixNetworkBaseIE },
  { ie_key: 'TNAFlixNetworkEmbed', IE: TNAFlixNetworkEmbedIE },
  { ie_key: 'Toggle', IE: ToggleIE },
  { ie_key: 'Toggo', IE: ToggoIE },
  { ie_key: 'TOnline', IE: TOnlineIE },
  { ie_key: 'ToonGoggles', IE: ToonGogglesIE },
  { ie_key: 'Toutiao', IE: ToutiaoIE },
  { ie_key: 'TouTv', IE: TouTvIE },
  { ie_key: 'Toypics', IE: ToypicsIE },
  { ie_key: 'ToypicsUser', IE: ToypicsUserIE },
  { ie_key: 'TrtCocukVideo', IE: TrtCocukVideoIE },
  { ie_key: 'TrtWorld', IE: TrtWorldIE },
  { ie_key: 'TrueID', IE: TrueIDIE },
  { ie_key: 'TruNews', IE: TruNewsIE },
  { ie_key: 'Truth', IE: TruthIE },
  { ie_key: 'Tube8', IE: Tube8IE },
  { ie_key: 'TubeTuGraz', IE: TubeTuGrazIE },
  { ie_key: 'TubeTuGrazBase', IE: TubeTuGrazBaseIE },
  { ie_key: 'TubeTuGrazSeries', IE: TubeTuGrazSeriesIE },
  { ie_key: 'TubiTv', IE: TubiTvIE },
  { ie_key: 'TubiTvShow', IE: TubiTvShowIE },
  { ie_key: 'Tumblr', IE: TumblrIE },
  { ie_key: 'TuneInBase', IE: TuneInBaseIE },
  { ie_key: 'TuneInEmbed', IE: TuneInEmbedIE },
  { ie_key: 'TuneInPodcast', IE: TuneInPodcastIE },
  { ie_key: 'TuneInPodcastEpisode', IE: TuneInPodcastEpisodeIE },
  { ie_key: 'TuneInShortener', IE: TuneInShortenerIE },
  { ie_key: 'TuneInStation', IE: TuneInStationIE },
  { ie_key: 'TurnerBase', IE: TurnerBaseIE },
  { ie_key: 'TV2', IE: TV2IE },
  { ie_key: 'TV24UAVideo', IE: TV24UAVideoIE },
  { ie_key: 'TV2Article', IE: TV2ArticleIE },
  { ie_key: 'TV2DK', IE: TV2DKIE },
  { ie_key: 'TV2DKBornholmPlay', IE: TV2DKBornholmPlayIE },
  { ie_key: 'TV2Hu', IE: TV2HuIE },
  { ie_key: 'TV2HuSeries', IE: TV2HuSeriesIE },
  { ie_key: 'TV4', IE: TV4IE },
  { ie_key: 'TV5MondePlus', IE: TV5MondePlusIE },
  { ie_key: 'TV5Unis', IE: TV5UnisIE },
  { ie_key: 'TV5UnisBase', IE: TV5UnisBaseIE },
  { ie_key: 'TV5UnisVideo', IE: TV5UnisVideoIE },
  { ie_key: 'TVA', IE: TVAIE },
  { ie_key: 'TVANouvelles', IE: TVANouvellesIE },
  { ie_key: 'TVANouvellesArticle', IE: TVANouvellesArticleIE },
  { ie_key: 'TVC', IE: TVCIE },
  { ie_key: 'TVCArticle', IE: TVCArticleIE },
  { ie_key: 'TVer', IE: TVerIE },
  { ie_key: 'TVerOlympic', IE: TVerOlympicIE },
  { ie_key: 'Tvigle', IE: TvigleIE },
  { ie_key: 'TVIPlayer', IE: TVIPlayerIE },
  { ie_key: 'TVN24', IE: TVN24IE },
  { ie_key: 'TVNoe', IE: TVNoeIE },
  { ie_key: 'Tvo', IE: TvoIE },
  { ie_key: 'TVOpenGrBase', IE: TVOpenGrBaseIE },
  { ie_key: 'TVOpenGrEmbed', IE: TVOpenGrEmbedIE },
  { ie_key: 'TVOpenGrWatch', IE: TVOpenGrWatchIE },
  { ie_key: 'TVP', IE: TVPIE },
  { ie_key: 'TVPEmbed', IE: TVPEmbedIE },
  { ie_key: 'TVPlay', IE: TVPlayIE },
  { ie_key: 'TVPlayHome', IE: TVPlayHomeIE },
  { ie_key: 'TVPStream', IE: TVPStreamIE },
  { ie_key: 'TVPVODBase', IE: TVPVODBaseIE },
  { ie_key: 'TVPVODSeries', IE: TVPVODSeriesIE },
  { ie_key: 'TVPVODVideo', IE: TVPVODVideoIE },
  { ie_key: 'Tvw', IE: TvwIE },
  { ie_key: 'TvwNews', IE: TvwNewsIE },
  { ie_key: 'TvwTvChannels', IE: TvwTvChannelsIE },
  { ie_key: 'Tweakers', IE: TweakersIE },
  { ie_key: 'TwentyMinuten', IE: TwentyMinutenIE },
  { ie_key: 'TwentyThreeVideo', IE: TwentyThreeVideoIE },
  { ie_key: 'TwitCasting', IE: TwitCastingIE },
  { ie_key: 'TwitCastingLive', IE: TwitCastingLiveIE },
  { ie_key: 'TwitCastingUser', IE: TwitCastingUserIE },
  { ie_key: 'TwitchBase', IE: TwitchBaseIE },
  { ie_key: 'TwitchPlaylistBase', IE: TwitchPlaylistBaseIE },
  { ie_key: 'TwitchVideosBase', IE: TwitchVideosBaseIE },
  { ie_key: 'TwitchVideosClips', IE: TwitchVideosClipsIE },
  { ie_key: 'TwitchVideosCollections', IE: TwitchVideosCollectionsIE },
  { ie_key: 'TwitterAmplify', IE: TwitterAmplifyIE },
  { ie_key: 'TwitterBase', IE: TwitterBaseIE },
  { ie_key: 'TwitterBroadcast', IE: TwitterBroadcastIE },
  { ie_key: 'TwitterCard', IE: TwitterCardIE },
  { ie_key: 'TwitterSpaces', IE: TwitterSpacesIE },
  { ie_key: 'Txxx', IE: TxxxIE },
  { ie_key: 'VQQBase', IE: VQQBaseIE },
  { ie_key: 'WeTvBase', IE: WeTvBaseIE },
  { ie_key: 'WeTvEpisode', IE: WeTvEpisodeIE },
  { ie_key: 'WeTvSeries', IE: WeTvSeriesIE },
];

export {
  ConanClassicIE,
  EMPFlixIE,
  IflixBaseIE,
  IflixEpisodeIE,
  IflixSeriesIE,
  KatsomoIE,
  MeWatchIE,
  MovieFapIE,
  MTVUutisetArticleIE,
  PornTopIE,
  StreaksBaseIE,
  TagesschauIE,
  TapTapAppIE,
  TapTapAppIntlIE,
  TapTapBaseIE,
  TapTapIntlBaseIE,
  TapTapMomentIE,
  TapTapPostIntlIE,
  TarangPlusBaseIE,
  TarangPlusEpisodesIE,
  TarangPlusPlaylistIE,
  TarangPlusVideoIE,
  TassIE,
  TBSIE,
  TBSJPBaseIE,
  TBSJPEpisodeIE,
  TBSJPPlaylistIE,
  TBSJPProgramIE,
  TeachableIE,
  TeachableBaseIE,
  TeachableCourseIE,
  TeacherTubeIE,
  TeacherTubeUserIE,
  TeachingChannelIE,
  TeamcocoIE,
  TeamcocoBaseIE,
  TeamTreeHouseIE,
  TedBaseIE,
  TedEmbedIE,
  TedPlaylistIE,
  TedSeriesIE,
  TedTalkIE,
  Tele13IE,
  Tele5IE,
  TeleBruxellesIE,
  TelecaribePlayIE,
  TelecincoIE,
  TelecincoBaseIE,
  TelegraafIE,
  TelegramEmbedIE,
  TeleMBIE,
  TelemundoIE,
  TeleQuebecIE,
  TeleQuebecBaseIE,
  TeleQuebecEmissionIE,
  TeleQuebecLiveIE,
  TeleQuebecSquatIE,
  TeleQuebecVideoIE,
  TeleTaskIE,
  TelewebionIE,
  TencentBaseIE,
  TennisTVIE,
  TenPlayIE,
  TenPlaySeasonIE,
  TestURLIE,
  TF1IE,
  TFOIE,
  TheChosenIE,
  TheChosenGroupIE,
  TheGuardianPodcastIE,
  TheGuardianPodcastPlaylistIE,
  TheHighWireIE,
  TheInterceptIE,
  ThePlatformIE,
  ThePlatformBaseIE,
  ThePlatformFeedIE,
  TheStarIE,
  TheSunIE,
  TheWeatherChannelIE,
  ThisAmericanLifeIE,
  ThisOldHouseIE,
  ThisVidIE,
  ThisVidMemberIE,
  ThisVidPlaylistIE,
  ThisVidPlaylistBaseIE,
  ThreeQSDNIE,
  ThreeSpeakIE,
  ThreeSpeakUserIE,
  TikTokBaseIE,
  TikTokBaseListIE,
  TikTokCollectionIE,
  TikTokEffectIE,
  TikTokLiveIE,
  TikTokSoundIE,
  TikTokTagIE,
  TikTokUserIE,
  TikTokVMIE,
  TMZIE,
  TNAEMPFlixBaseIE,
  TNAFlixIE,
  TNAFlixNetworkBaseIE,
  TNAFlixNetworkEmbedIE,
  ToggleIE,
  ToggoIE,
  TOnlineIE,
  ToonGogglesIE,
  ToutiaoIE,
  TouTvIE,
  ToypicsIE,
  ToypicsUserIE,
  TrtCocukVideoIE,
  TrtWorldIE,
  TrueIDIE,
  TruNewsIE,
  TruthIE,
  Tube8IE,
  TubeTuGrazIE,
  TubeTuGrazBaseIE,
  TubeTuGrazSeriesIE,
  TubiTvIE,
  TubiTvShowIE,
  TumblrIE,
  TuneInBaseIE,
  TuneInEmbedIE,
  TuneInPodcastIE,
  TuneInPodcastEpisodeIE,
  TuneInShortenerIE,
  TuneInStationIE,
  TurnerBaseIE,
  TV2IE,
  TV24UAVideoIE,
  TV2ArticleIE,
  TV2DKIE,
  TV2DKBornholmPlayIE,
  TV2HuIE,
  TV2HuSeriesIE,
  TV4IE,
  TV5MondePlusIE,
  TV5UnisIE,
  TV5UnisBaseIE,
  TV5UnisVideoIE,
  TVAIE,
  TVANouvellesIE,
  TVANouvellesArticleIE,
  TVCIE,
  TVCArticleIE,
  TVerIE,
  TVerOlympicIE,
  TvigleIE,
  TVIPlayerIE,
  TVN24IE,
  TVNoeIE,
  TvoIE,
  TVOpenGrBaseIE,
  TVOpenGrEmbedIE,
  TVOpenGrWatchIE,
  TVPIE,
  TVPEmbedIE,
  TVPlayIE,
  TVPlayHomeIE,
  TVPStreamIE,
  TVPVODBaseIE,
  TVPVODSeriesIE,
  TVPVODVideoIE,
  TvwIE,
  TvwNewsIE,
  TvwTvChannelsIE,
  TweakersIE,
  TwentyMinutenIE,
  TwentyThreeVideoIE,
  TwitCastingIE,
  TwitCastingLiveIE,
  TwitCastingUserIE,
  TwitchBaseIE,
  TwitchPlaylistBaseIE,
  TwitchVideosBaseIE,
  TwitchVideosClipsIE,
  TwitchVideosCollectionsIE,
  TwitterAmplifyIE,
  TwitterBaseIE,
  TwitterBroadcastIE,
  TwitterCardIE,
  TwitterSpacesIE,
  TxxxIE,
  VQQBaseIE,
  WeTvBaseIE,
  WeTvEpisodeIE,
  WeTvSeriesIE,
};
