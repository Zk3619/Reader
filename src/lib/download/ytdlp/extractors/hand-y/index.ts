// @ts-nocheck
/**
 * Hand-written batch Y (yahoo ï¿?youtube extras, skip Youku/Youtube/Tab/Playlist) ï¿?auto-rebuilt by port/rebuild-hand-y-index.mjs
 */

import type { InfoExtractor } from '../../common';

import { YahooIE, YahooJapanNewsIE, YahooSearchIE } from './yahoo';
import { YandexDiskIE } from './yandexdisk';
import { YandexMusicAlbumIE, YandexMusicArtistAlbumsIE, YandexMusicArtistBaseIE, YandexMusicArtistTracksIE, YandexMusicBaseIE, YandexMusicPlaylistIE, YandexMusicPlaylistBaseIE, YandexMusicTrackIE } from './yandexmusic';
import { YandexVideoIE, YandexVideoPreviewIE, ZenYandexIE, ZenYandexBaseIE, ZenYandexChannelIE } from './yandexvideo';
import { YapFilesIE } from './yapfiles';
import { YappyIE, YappyProfileIE } from './yappy';
import { YfanefaIE } from './yfanefa';
import { YleAreenaIE } from './yle_areena';
import { YouJizzIE } from './youjizz';
import { YouNowChannelIE, YouNowLiveIE, YouNowMomentIE } from './younow';
import { YouPornIE, YouPornCategoryIE, YouPornChannelIE, YouPornCollectionIE, YouPornListBaseIE, YouPornStarIE, YouPornTagIE, YouPornVideosIE } from './youporn';
import { YoutubeClipIE } from './youtube_clip';
import { YoutubeTruncatedIDIE, YoutubeTruncatedURLIE } from './youtube_mistakes';
import { YoutubeNotificationsIE } from './youtube_notifications';
import { YoutubeConsentRedirectIE, YoutubeFavouritesIE, YoutubeHistoryIE, YoutubeLivestreamEmbedIE, YoutubeRecommendedIE, YoutubeShortsAudioPivotIE, YoutubeSubscriptionsIE, YoutubeWatchLaterIE, YoutubeYtBeIE, YoutubeYtUserIE } from './youtube_redirect';
import { YoutubeMusicSearchURLIE, YoutubeSearchIE, YoutubeSearchURLIE } from './youtube_search';

export type HandYEntry = {
  ie_key: string;
  IE: new () => InfoExtractor;
};

export const HAND_Y_IES: HandYEntry[] = [
  { ie_key: 'Yahoo', IE: YahooIE },
  { ie_key: 'YahooJapanNews', IE: YahooJapanNewsIE },
  { ie_key: 'YahooSearch', IE: YahooSearchIE },
  { ie_key: 'YandexDisk', IE: YandexDiskIE },
  { ie_key: 'YandexMusicAlbum', IE: YandexMusicAlbumIE },
  { ie_key: 'YandexMusicArtistAlbums', IE: YandexMusicArtistAlbumsIE },
  { ie_key: 'YandexMusicArtistBase', IE: YandexMusicArtistBaseIE },
  { ie_key: 'YandexMusicArtistTracks', IE: YandexMusicArtistTracksIE },
  { ie_key: 'YandexMusicBase', IE: YandexMusicBaseIE },
  { ie_key: 'YandexMusicPlaylist', IE: YandexMusicPlaylistIE },
  { ie_key: 'YandexMusicPlaylistBase', IE: YandexMusicPlaylistBaseIE },
  { ie_key: 'YandexMusicTrack', IE: YandexMusicTrackIE },
  { ie_key: 'YandexVideo', IE: YandexVideoIE },
  { ie_key: 'YandexVideoPreview', IE: YandexVideoPreviewIE },
  { ie_key: 'YapFiles', IE: YapFilesIE },
  { ie_key: 'Yappy', IE: YappyIE },
  { ie_key: 'YappyProfile', IE: YappyProfileIE },
  { ie_key: 'Yfanefa', IE: YfanefaIE },
  { ie_key: 'YleAreena', IE: YleAreenaIE },
  { ie_key: 'YouJizz', IE: YouJizzIE },
  { ie_key: 'YouNowChannel', IE: YouNowChannelIE },
  { ie_key: 'YouNowLive', IE: YouNowLiveIE },
  { ie_key: 'YouNowMoment', IE: YouNowMomentIE },
  { ie_key: 'YouPorn', IE: YouPornIE },
  { ie_key: 'YouPornCategory', IE: YouPornCategoryIE },
  { ie_key: 'YouPornChannel', IE: YouPornChannelIE },
  { ie_key: 'YouPornCollection', IE: YouPornCollectionIE },
  { ie_key: 'YouPornListBase', IE: YouPornListBaseIE },
  { ie_key: 'YouPornStar', IE: YouPornStarIE },
  { ie_key: 'YouPornTag', IE: YouPornTagIE },
  { ie_key: 'YouPornVideos', IE: YouPornVideosIE },
  { ie_key: 'YoutubeClip', IE: YoutubeClipIE },
  { ie_key: 'YoutubeConsentRedirect', IE: YoutubeConsentRedirectIE },
  { ie_key: 'YoutubeFavourites', IE: YoutubeFavouritesIE },
  { ie_key: 'YoutubeHistory', IE: YoutubeHistoryIE },
  { ie_key: 'YoutubeLivestreamEmbed', IE: YoutubeLivestreamEmbedIE },
  { ie_key: 'YoutubeMusicSearchURL', IE: YoutubeMusicSearchURLIE },
  { ie_key: 'YoutubeNotifications', IE: YoutubeNotificationsIE },
  { ie_key: 'YoutubeRecommended', IE: YoutubeRecommendedIE },
  { ie_key: 'YoutubeSearch', IE: YoutubeSearchIE },
  { ie_key: 'YoutubeSearchURL', IE: YoutubeSearchURLIE },
  { ie_key: 'YoutubeShortsAudioPivot', IE: YoutubeShortsAudioPivotIE },
  { ie_key: 'YoutubeSubscriptions', IE: YoutubeSubscriptionsIE },
  { ie_key: 'YoutubeTruncatedID', IE: YoutubeTruncatedIDIE },
  { ie_key: 'YoutubeTruncatedURL', IE: YoutubeTruncatedURLIE },
  { ie_key: 'YoutubeWatchLater', IE: YoutubeWatchLaterIE },
  { ie_key: 'YoutubeYtBe', IE: YoutubeYtBeIE },
  { ie_key: 'YoutubeYtUser', IE: YoutubeYtUserIE },
  { ie_key: 'ZenYandex', IE: ZenYandexIE },
  { ie_key: 'ZenYandexBase', IE: ZenYandexBaseIE },
  { ie_key: 'ZenYandexChannel', IE: ZenYandexChannelIE },
];

export {
  YahooIE,
  YahooJapanNewsIE,
  YahooSearchIE,
  YandexDiskIE,
  YandexMusicAlbumIE,
  YandexMusicArtistAlbumsIE,
  YandexMusicArtistBaseIE,
  YandexMusicArtistTracksIE,
  YandexMusicBaseIE,
  YandexMusicPlaylistIE,
  YandexMusicPlaylistBaseIE,
  YandexMusicTrackIE,
  YandexVideoIE,
  YandexVideoPreviewIE,
  YapFilesIE,
  YappyIE,
  YappyProfileIE,
  YfanefaIE,
  YleAreenaIE,
  YouJizzIE,
  YouNowChannelIE,
  YouNowLiveIE,
  YouNowMomentIE,
  YouPornIE,
  YouPornCategoryIE,
  YouPornChannelIE,
  YouPornCollectionIE,
  YouPornListBaseIE,
  YouPornStarIE,
  YouPornTagIE,
  YouPornVideosIE,
  YoutubeClipIE,
  YoutubeConsentRedirectIE,
  YoutubeFavouritesIE,
  YoutubeHistoryIE,
  YoutubeLivestreamEmbedIE,
  YoutubeMusicSearchURLIE,
  YoutubeNotificationsIE,
  YoutubeRecommendedIE,
  YoutubeSearchIE,
  YoutubeSearchURLIE,
  YoutubeShortsAudioPivotIE,
  YoutubeSubscriptionsIE,
  YoutubeTruncatedIDIE,
  YoutubeTruncatedURLIE,
  YoutubeWatchLaterIE,
  YoutubeYtBeIE,
  YoutubeYtUserIE,
  ZenYandexIE,
  ZenYandexBaseIE,
  ZenYandexChannelIE,
};
