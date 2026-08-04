// @ts-nocheck
/**
 * YouTube redirect / keyword IEs â€?ported from yt-dlp youtube/_redirect.py
 * Thin wrappers that url_result into YoutubeTab / generic follow.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_qs, update_url_query, url_or_none } from '../../utils';
import { PLAYLIST_ID_RE } from '../youtube/shared';

/** Feed base â€?not registered (no registry className / not *IE). */
abstract class YoutubeFeedsInfoExtractor extends InfoExtractor {
  static _VALID_URL: RegExp | string | false | null = false;
  static _LOGIN_REQUIRED = true;
  static _FEED_NAME = 'feeds';

  async _real_extract(_url: string): Promise<VideoInfo> {
    const feed = (this.constructor as typeof YoutubeFeedsInfoExtractor)._FEED_NAME;
    return this.url_result(`https://www.youtube.com/feed/${feed}`, 'YoutubeTab');
  }
}

export class YoutubeYtBeIE extends InfoExtractor {
  static IE_NAME = 'youtu.be';
  static IE_DESC = 'youtu.be';
  static _VALID_URL = new RegExp(
    String.raw`https?://youtu\.be/(?<id>[0-9A-Za-z_-]{11})/*?.*?\blist=(?<playlist_id>${PLAYLIST_ID_RE})`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url);
    const videoId = mobj?.groups?.id || '';
    const playlistId = mobj?.groups?.playlist_id || '';
    return this.url_result(
      update_url_query('https://www.youtube.com/watch', {
        v: videoId,
        list: playlistId,
        feature: 'youtu.be',
      }),
      'YoutubeTab',
      playlistId,
    );
  }
}

export class YoutubeLivestreamEmbedIE extends InfoExtractor {
  static IE_NAME = 'youtube:livestream_embed';
  static IE_DESC = 'YouTube livestream embeds';
  static _VALID_URL =
    /https?:\/\/(?:\w+\.)?youtube\.com\/embed\/live_stream\/?\?(?:[^#]+&)?channel=(?<id>[^&#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    return this.url_result(
      `https://www.youtube.com/channel/${channelId}/live`,
      'YoutubeTab',
      channelId,
    );
  }
}

export class YoutubeYtUserIE extends InfoExtractor {
  static IE_NAME = 'youtube:user';
  static IE_DESC = 'YouTube user videos; "ytuser:" prefix';
  static _VALID_URL = /ytuser:(?<id>.+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const userId = this._match_id(url);
    return this.url_result(`https://www.youtube.com/user/${userId}`, 'YoutubeTab', userId);
  }
}

export class YoutubeFavouritesIE extends InfoExtractor {
  static IE_NAME = 'youtube:favorites';
  static IE_DESC = 'YouTube liked videos; ":ytfav" keyword (requires cookies)';
  static _VALID_URL = /:ytfav(?:ou?rite)?s?/;
  static _LOGIN_REQUIRED = true;

  async _real_extract(_url: string): Promise<VideoInfo> {
    return this.url_result('https://www.youtube.com/playlist?list=LL', 'YoutubeTab');
  }
}

export class YoutubeWatchLaterIE extends InfoExtractor {
  static IE_NAME = 'youtube:watchlater';
  static IE_DESC = 'Youtube watch later list; ":ytwatchlater" keyword (requires cookies)';
  static _VALID_URL = /:ytwatchlater/;

  async _real_extract(_url: string): Promise<VideoInfo> {
    return this.url_result('https://www.youtube.com/playlist?list=WL', 'YoutubeTab');
  }
}

export class YoutubeRecommendedIE extends YoutubeFeedsInfoExtractor {
  static IE_NAME = 'youtube:recommended';
  static IE_DESC = 'YouTube recommended videos; ":ytrec" keyword';
  static _VALID_URL = /https?:\/\/(?:www\.)?youtube\.com\/?(?:[?#]|$)|:ytrec(?:ommended)?/;
  static _FEED_NAME = 'recommended';
  static _LOGIN_REQUIRED = false;
}

export class YoutubeSubscriptionsIE extends YoutubeFeedsInfoExtractor {
  static IE_NAME = 'youtube:subscriptions';
  static IE_DESC = 'YouTube subscriptions feed; ":ytsubs" keyword (requires cookies)';
  static _VALID_URL = /:ytsub(?:scription)?s?/;
  static _FEED_NAME = 'subscriptions';
}

export class YoutubeHistoryIE extends YoutubeFeedsInfoExtractor {
  static IE_NAME = 'youtube:history';
  static IE_DESC = 'Youtube watch history; ":ythis" keyword (requires cookies)';
  static _VALID_URL = /:ythis(?:tory)?/;
  static _FEED_NAME = 'history';
}

export class YoutubeShortsAudioPivotIE extends InfoExtractor {
  static IE_NAME = 'youtube:shorts:pivot:audio';
  static IE_DESC = 'YouTube Shorts audio pivot (Shorts using audio of a given video)';
  static _VALID_URL = /https?:\/\/(?:www\.)?youtube\.com\/source\/(?<id>[\w-]{11})\/shorts/;

  static _generateAudioPivotParams(videoId: string): string {
    const id = new TextEncoder().encode(videoId);
    const buf = new Uint8Array([
      0xf2, 0x05, 0x2b, 0x0a, 0x29, 0x12, 0x27, 0x0a, 0x0b, ...id, 0x12, 0x0b, ...id, 0x1a, 0x0b,
      ...id,
    ]);
    let binary = '';
    for (const b of buf) binary += String.fromCharCode(b);
    return encodeURIComponent(btoa(binary));
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const bp = YoutubeShortsAudioPivotIE._generateAudioPivotParams(videoId);
    return this.url_result(
      `https://www.youtube.com/feed/sfv_audio_pivot?bp=${bp}`,
      'YoutubeTab',
    );
  }
}

export class YoutubeConsentRedirectIE extends InfoExtractor {
  static IE_NAME = 'youtube:consent';
  static IE_DESC = false as unknown as string;
  static _VALID_URL = /https?:\/\/consent\.youtube\.com\/m\?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const redirectUrl = url_or_none(parse_qs(url).continue?.slice(-1)[0]);
    if (!redirectUrl) {
      throw new ExtractorError('Invalid cookie consent redirect URL', { expected: true });
    }
    return this.url_result(redirectUrl);
  }
}
