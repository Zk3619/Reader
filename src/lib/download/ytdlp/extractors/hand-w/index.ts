// @ts-nocheck
/**
 * Hand-written batch W (walla â†?wykop, skip existing Weibo/WrestleUniverseBase) â€?auto-rebuilt by port/rebuild-hand-w-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { WallaIE } from './walla';
import { WashingtonPostIE, WashingtonPostArticleIE } from './washingtonpost';
import { WatIE } from './wat';
import { WDRIE, WDRElefantIE, WDRPageIE } from './wdr';
import { WebcameraplIE } from './webcamerapl';
import { WebcasterIE, WebcasterFeedIE } from './webcaster';
import { WebOfStoriesIE, WebOfStoriesPlaylistIE } from './webofstories';
import { WeiboBaseIE, WeiboUserIE } from './weibo';
import { WeiqiTVIE } from './weiqitv';
import { WeverseIE, WeverseBaseIE, WeverseLiveIE, WeverseLiveTabIE, WeverseMediaIE, WeverseMediaTabIE, WeverseMomentIE, WeverseTabBaseIE } from './weverse';
import { WeVidiIE } from './wevidi';
import { WhoWatchIE } from './whowatch';
import { WhypIE } from './whyp';
import { WikimediaIE } from './wikimedia';
import { WimbledonIE } from './wimbledon';
import { WimTVIE } from './wimtv';
import { WistiaIE, WistiaBaseIE, WistiaChannelIE, WistiaPlaylistIE } from './wistia';
import { WordpressMiniAudioPlayerEmbedIE, WordpressPlaylistEmbedIE } from './wordpress';
import { WorldStarHipHopIE } from './worldstarhiphop';
import { WPPilotIE, WPPilotBaseIE, WPPilotChannelsIE } from './wppilot';
import { WrestleUniversePPVIE, WrestleUniverseVODIE } from './wrestleuniverse';
import { WSJIE, WSJArticleIE } from './wsj';
import { WWEIE, WWEBaseIE, WWEPlaylistIE } from './wwe';
import { WykopBaseIE, WykopDigIE, WykopDigCommentIE, WykopPostIE, WykopPostCommentIE } from './wykop';

export type HandWEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_W_IES: HandWEntry[] = [
  { ie_key: 'Walla', IE: WallaIE },
  { ie_key: 'WashingtonPost', IE: WashingtonPostIE },
  { ie_key: 'WashingtonPostArticle', IE: WashingtonPostArticleIE },
  { ie_key: 'Wat', IE: WatIE },
  { ie_key: 'WDR', IE: WDRIE },
  { ie_key: 'WDRElefant', IE: WDRElefantIE },
  { ie_key: 'WDRPage', IE: WDRPageIE },
  { ie_key: 'Webcamerapl', IE: WebcameraplIE },
  { ie_key: 'Webcaster', IE: WebcasterIE },
  { ie_key: 'WebcasterFeed', IE: WebcasterFeedIE },
  { ie_key: 'WebOfStories', IE: WebOfStoriesIE },
  { ie_key: 'WebOfStoriesPlaylist', IE: WebOfStoriesPlaylistIE },
  { ie_key: 'WeiboBase', IE: WeiboBaseIE },
  { ie_key: 'WeiboUser', IE: WeiboUserIE },
  { ie_key: 'WeiqiTV', IE: WeiqiTVIE },
  { ie_key: 'Weverse', IE: WeverseIE },
  { ie_key: 'WeverseBase', IE: WeverseBaseIE },
  { ie_key: 'WeverseLive', IE: WeverseLiveIE },
  { ie_key: 'WeverseLiveTab', IE: WeverseLiveTabIE },
  { ie_key: 'WeverseMedia', IE: WeverseMediaIE },
  { ie_key: 'WeverseMediaTab', IE: WeverseMediaTabIE },
  { ie_key: 'WeverseMoment', IE: WeverseMomentIE },
  { ie_key: 'WeverseTabBase', IE: WeverseTabBaseIE },
  { ie_key: 'WeVidi', IE: WeVidiIE },
  { ie_key: 'WhoWatch', IE: WhoWatchIE },
  { ie_key: 'Whyp', IE: WhypIE },
  { ie_key: 'Wikimedia', IE: WikimediaIE },
  { ie_key: 'Wimbledon', IE: WimbledonIE },
  { ie_key: 'WimTV', IE: WimTVIE },
  { ie_key: 'Wistia', IE: WistiaIE },
  { ie_key: 'WistiaBase', IE: WistiaBaseIE },
  { ie_key: 'WistiaChannel', IE: WistiaChannelIE },
  { ie_key: 'WistiaPlaylist', IE: WistiaPlaylistIE },
  { ie_key: 'WordpressMiniAudioPlayerEmbed', IE: WordpressMiniAudioPlayerEmbedIE },
  { ie_key: 'WordpressPlaylistEmbed', IE: WordpressPlaylistEmbedIE },
  { ie_key: 'WorldStarHipHop', IE: WorldStarHipHopIE },
  { ie_key: 'WPPilot', IE: WPPilotIE },
  { ie_key: 'WPPilotBase', IE: WPPilotBaseIE },
  { ie_key: 'WPPilotChannels', IE: WPPilotChannelsIE },
  { ie_key: 'WrestleUniversePPV', IE: WrestleUniversePPVIE },
  { ie_key: 'WrestleUniverseVOD', IE: WrestleUniverseVODIE },
  { ie_key: 'WSJ', IE: WSJIE },
  { ie_key: 'WSJArticle', IE: WSJArticleIE },
  { ie_key: 'WWE', IE: WWEIE },
  { ie_key: 'WWEBase', IE: WWEBaseIE },
  { ie_key: 'WWEPlaylist', IE: WWEPlaylistIE },
  { ie_key: 'WykopBase', IE: WykopBaseIE },
  { ie_key: 'WykopDig', IE: WykopDigIE },
  { ie_key: 'WykopDigComment', IE: WykopDigCommentIE },
  { ie_key: 'WykopPost', IE: WykopPostIE },
  { ie_key: 'WykopPostComment', IE: WykopPostCommentIE },
];

export {
  WallaIE,
  WashingtonPostIE,
  WashingtonPostArticleIE,
  WatIE,
  WDRIE,
  WDRElefantIE,
  WDRPageIE,
  WebcameraplIE,
  WebcasterIE,
  WebcasterFeedIE,
  WebOfStoriesIE,
  WebOfStoriesPlaylistIE,
  WeiboBaseIE,
  WeiboUserIE,
  WeiqiTVIE,
  WeverseIE,
  WeverseBaseIE,
  WeverseLiveIE,
  WeverseLiveTabIE,
  WeverseMediaIE,
  WeverseMediaTabIE,
  WeverseMomentIE,
  WeverseTabBaseIE,
  WeVidiIE,
  WhoWatchIE,
  WhypIE,
  WikimediaIE,
  WimbledonIE,
  WimTVIE,
  WistiaIE,
  WistiaBaseIE,
  WistiaChannelIE,
  WistiaPlaylistIE,
  WordpressMiniAudioPlayerEmbedIE,
  WordpressPlaylistEmbedIE,
  WorldStarHipHopIE,
  WPPilotIE,
  WPPilotBaseIE,
  WPPilotChannelsIE,
  WrestleUniversePPVIE,
  WrestleUniverseVODIE,
  WSJIE,
  WSJArticleIE,
  WWEIE,
  WWEBaseIE,
  WWEPlaylistIE,
  WykopBaseIE,
  WykopDigIE,
  WykopDigCommentIE,
  WykopPostIE,
  WykopPostCommentIE,
};
