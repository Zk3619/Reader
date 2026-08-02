/**
 * Hand-written batch G (gab → groupon) — auto-rebuilt by port/rebuild-hand-g-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { GabIE } from './gab';
import { GaiaIE } from './gaia';
import { GameDevTVDashboardIE } from './gamedevtv';
import { GameJoltIE, GameJoltBaseIE, GameJoltCommunityIE, GameJoltGameIE, GameJoltGameSoundtrackIE, GameJoltPostListBaseIE, GameJoltSearchIE, GameJoltUserIE } from './gamejolt';
import { GameSpotIE } from './gamespot';
import { GameStarIE } from './gamestar';
import { GaskrankIE } from './gaskrank';
import { GazetaIE } from './gazeta';
import { GBNewsIE } from './gbnews';
import { GDCVaultIE } from './gdcvault';
import { GediDigitalIE } from './gedidigital';
import { HTML5MediaEmbedIE, QuotedHTMLIE } from './genericembeds';
import { GeniusIE, GeniusLyricsIE } from './genius';
import { GermanupaIE } from './germanupa';
import { GetCourseRuIE, GetCourseRuPlayerIE } from './getcourseru';
import { GettrIE, GettrBaseIE, GettrStreamingIE } from './gettr';
import { GiantBombIE } from './giantbomb';
import { GlideIE } from './glide';
import { GlobalPlayerAudioIE, GlobalPlayerAudioEpisodeIE, GlobalPlayerBaseIE, GlobalPlayerLiveIE, GlobalPlayerLivePlaylistIE, GlobalPlayerVideoIE } from './globalplayer';
import { GloboIE, GloboArticleIE } from './globo';
import { GlomexIE, GlomexBaseIE, GlomexEmbedIE } from './glomex';
import { GMANetworkVideoIE } from './gmanetwork';
import { GoIE } from './go';
import { GodResourceIE } from './godresource';
import { GodTubeIE } from './godtube';
import { GolemIE } from './golem';
import { GoodGameIE } from './goodgame';
import { GoogleDriveIE, GoogleDriveFolderIE } from './googledrive';
import { GoogleSearchIE } from './googlesearch';
import { GoPlayIE } from './goplay';
import { GoProIE } from './gopro';
import { GoToStageIE } from './gotostage';
import { GraspopIE } from './graspop';
import { GronkhIE, GronkhFeedIE, GronkhVodsIE } from './gronkh';
import { GrouponIE } from './groupon';

export type HandGEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_G_IES: HandGEntry[] = [
  { ie_key: 'Gab', IE: GabIE },
  { ie_key: 'Gaia', IE: GaiaIE },
  { ie_key: 'GameDevTVDashboard', IE: GameDevTVDashboardIE },
  { ie_key: 'GameJolt', IE: GameJoltIE },
  { ie_key: 'GameJoltBase', IE: GameJoltBaseIE },
  { ie_key: 'GameJoltCommunity', IE: GameJoltCommunityIE },
  { ie_key: 'GameJoltGame', IE: GameJoltGameIE },
  { ie_key: 'GameJoltGameSoundtrack', IE: GameJoltGameSoundtrackIE },
  { ie_key: 'GameJoltPostListBase', IE: GameJoltPostListBaseIE },
  { ie_key: 'GameJoltSearch', IE: GameJoltSearchIE },
  { ie_key: 'GameJoltUser', IE: GameJoltUserIE },
  { ie_key: 'GameSpot', IE: GameSpotIE },
  { ie_key: 'GameStar', IE: GameStarIE },
  { ie_key: 'Gaskrank', IE: GaskrankIE },
  { ie_key: 'Gazeta', IE: GazetaIE },
  { ie_key: 'GBNews', IE: GBNewsIE },
  { ie_key: 'GDCVault', IE: GDCVaultIE },
  { ie_key: 'GediDigital', IE: GediDigitalIE },
  { ie_key: 'Genius', IE: GeniusIE },
  { ie_key: 'GeniusLyrics', IE: GeniusLyricsIE },
  { ie_key: 'Germanupa', IE: GermanupaIE },
  { ie_key: 'GetCourseRu', IE: GetCourseRuIE },
  { ie_key: 'GetCourseRuPlayer', IE: GetCourseRuPlayerIE },
  { ie_key: 'Gettr', IE: GettrIE },
  { ie_key: 'GettrBase', IE: GettrBaseIE },
  { ie_key: 'GettrStreaming', IE: GettrStreamingIE },
  { ie_key: 'GiantBomb', IE: GiantBombIE },
  { ie_key: 'Glide', IE: GlideIE },
  { ie_key: 'GlobalPlayerAudio', IE: GlobalPlayerAudioIE },
  { ie_key: 'GlobalPlayerAudioEpisode', IE: GlobalPlayerAudioEpisodeIE },
  { ie_key: 'GlobalPlayerBase', IE: GlobalPlayerBaseIE },
  { ie_key: 'GlobalPlayerLive', IE: GlobalPlayerLiveIE },
  { ie_key: 'GlobalPlayerLivePlaylist', IE: GlobalPlayerLivePlaylistIE },
  { ie_key: 'GlobalPlayerVideo', IE: GlobalPlayerVideoIE },
  { ie_key: 'Globo', IE: GloboIE },
  { ie_key: 'GloboArticle', IE: GloboArticleIE },
  { ie_key: 'Glomex', IE: GlomexIE },
  { ie_key: 'GlomexBase', IE: GlomexBaseIE },
  { ie_key: 'GlomexEmbed', IE: GlomexEmbedIE },
  { ie_key: 'GMANetworkVideo', IE: GMANetworkVideoIE },
  { ie_key: 'Go', IE: GoIE },
  { ie_key: 'GodResource', IE: GodResourceIE },
  { ie_key: 'GodTube', IE: GodTubeIE },
  { ie_key: 'Golem', IE: GolemIE },
  { ie_key: 'GoodGame', IE: GoodGameIE },
  { ie_key: 'GoogleDrive', IE: GoogleDriveIE },
  { ie_key: 'GoogleDriveFolder', IE: GoogleDriveFolderIE },
  { ie_key: 'GoogleSearch', IE: GoogleSearchIE },
  { ie_key: 'GoPlay', IE: GoPlayIE },
  { ie_key: 'GoPro', IE: GoProIE },
  { ie_key: 'GoToStage', IE: GoToStageIE },
  { ie_key: 'Graspop', IE: GraspopIE },
  { ie_key: 'Gronkh', IE: GronkhIE },
  { ie_key: 'GronkhFeed', IE: GronkhFeedIE },
  { ie_key: 'GronkhVods', IE: GronkhVodsIE },
  { ie_key: 'Groupon', IE: GrouponIE },
  { ie_key: 'HTML5MediaEmbed', IE: HTML5MediaEmbedIE },
  { ie_key: 'QuotedHTML', IE: QuotedHTMLIE },
];

export {
  GabIE,
  GaiaIE,
  GameDevTVDashboardIE,
  GameJoltIE,
  GameJoltBaseIE,
  GameJoltCommunityIE,
  GameJoltGameIE,
  GameJoltGameSoundtrackIE,
  GameJoltPostListBaseIE,
  GameJoltSearchIE,
  GameJoltUserIE,
  GameSpotIE,
  GameStarIE,
  GaskrankIE,
  GazetaIE,
  GBNewsIE,
  GDCVaultIE,
  GediDigitalIE,
  GeniusIE,
  GeniusLyricsIE,
  GermanupaIE,
  GetCourseRuIE,
  GetCourseRuPlayerIE,
  GettrIE,
  GettrBaseIE,
  GettrStreamingIE,
  GiantBombIE,
  GlideIE,
  GlobalPlayerAudioIE,
  GlobalPlayerAudioEpisodeIE,
  GlobalPlayerBaseIE,
  GlobalPlayerLiveIE,
  GlobalPlayerLivePlaylistIE,
  GlobalPlayerVideoIE,
  GloboIE,
  GloboArticleIE,
  GlomexIE,
  GlomexBaseIE,
  GlomexEmbedIE,
  GMANetworkVideoIE,
  GoIE,
  GodResourceIE,
  GodTubeIE,
  GolemIE,
  GoodGameIE,
  GoogleDriveIE,
  GoogleDriveFolderIE,
  GoogleSearchIE,
  GoPlayIE,
  GoProIE,
  GoToStageIE,
  GraspopIE,
  GronkhIE,
  GronkhFeedIE,
  GronkhVodsIE,
  GrouponIE,
  HTML5MediaEmbedIE,
  QuotedHTMLIE,
};
