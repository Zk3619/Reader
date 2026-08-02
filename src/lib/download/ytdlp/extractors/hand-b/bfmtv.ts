/**
 * BFMTVIE family — ported from yt-dlp bfmtv.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { extract_attributes } from '../../utils';

const VIDEO_BLOCK_REGEX = /(<div[^>]+class="video_block[^"]*"[^>]*>[\s\S]*?<\/div>)/;
const VIDEO_BLOCK_REGEX_G = /(<div[^>]+class="video_block[^"]*"[^>]*>[\s\S]*?<\/div>)/g;
const VIDEO_ELEMENT_REGEX = /(<video-js[^>]+>)/;
const BRIGHTCOVE_URL_TEMPLATE = (account: string, player: string, videoId: string) =>
  `http://players.brightcove.net/${account}/${player}_default/index.html?videoId=${videoId}`;

export class BFMTVBaseIE extends InfoExtractor {
  static IE_NAME = 'bfmtvbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('BFMTVBaseIE is not a standalone extractor', { expected: true });
  }

  protected _extractVideo(videoBlock: string): VideoInfo | null {
    const videoElement = this._search_regex(VIDEO_ELEMENT_REGEX, videoBlock, 'video element', null, false);
    let videoId: string | undefined;
    let accountId: string;
    let playerId: string;
    if (videoElement) {
      const attrs = extract_attributes(videoElement);
      videoId = attrs['data-video-id'];
      if (!videoId) return null;
      accountId = attrs['data-account'] || '876450610001';
      playerId = attrs.adjustplayer || '19dszYXgm';
    } else {
      const attrs = extract_attributes(videoBlock);
      videoId = attrs.videoid;
      if (!videoId) return null;
      accountId = attrs.accountid || '876630703001';
      playerId = attrs.playerid || 'KbPwEbuHx';
    }
    return this.url_result(BRIGHTCOVE_URL_TEMPLATE(accountId, playerId, videoId), 'BrightcoveNew', videoId);
  }
}

export class BFMTVIE extends BFMTVBaseIE {
  static IE_NAME = 'bfmtv';
  static _VALID_URL =
    /https?:\/\/(?:www\.|rmc\.)?bfmtv\.com\/(?:[^/]+\/)*[^/?&#]+_V[A-Z]-(?<id>\d{12})\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const bfmtvId = this._match_id(url);
    const webpage = await this._download_webpage(url, bfmtvId);
    const block = this._search_regex(VIDEO_BLOCK_REGEX, webpage, 'video block');
    const video = this._extractVideo(block!);
    if (!video) throw new ExtractorError('Failed to extract video');
    return video;
  }
}

export class BFMTVLiveIE extends BFMTVBaseIE {
  static IE_NAME = 'bfmtv:live';
  static _VALID_URL = /https?:\/\/(?:www\.|rmc\.)?bfmtv\.com\/((?:[^/]+\/)?en-direct)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const bfmtvId = this._match_id(url);
    const webpage = await this._download_webpage(url, bfmtvId);
    const block = this._search_regex(VIDEO_BLOCK_REGEX, webpage, 'video block');
    const video = this._extractVideo(block!);
    if (!video) throw new ExtractorError('Failed to extract video');
    return video;
  }
}

export class BFMTVArticleIE extends BFMTVBaseIE {
  static IE_NAME = 'bfmtv:article';
  static _VALID_URL =
    /https?:\/\/(?:www\.|rmc\.)?bfmtv\.com\/(?:[^/]+\/)*[^/?&#]+_A[A-Z]-(?<id>\d{12})\.html/;

  protected *_entries(webpage: string): Generator<VideoInfo> {
    for (const m of webpage.matchAll(VIDEO_BLOCK_REGEX_G)) {
      const video = this._extractVideo(m[1]!);
      if (video) yield video;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const bfmtvId = this._match_id(url);
    const webpage = await this._download_webpage(url, bfmtvId);
    return this.playlist_result(
      [...this._entries(webpage)],
      bfmtvId,
      this._og_search_title(webpage) || undefined,
      this._html_search_meta(['og:description', 'description'], webpage),
    );
  }
}
