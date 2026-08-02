/** Sky family ù?ported from yt-dlp sky.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extract_attributes } from '../../utils';
import { strip_or_none } from './_helpers';

const SDC_EL_RE =
  /(<div[^>]+data-(?:component-name|fn)="sdc-(?:articl|sit)e-video"[^>]*>)/gi;

export class SkyBaseIE extends InfoExtractor {
  static IE_NAME = 'sky:base';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static BRIGHTCOVE_URL_TEMPLATE =
    'http://players.brightcove.net/%s/%s_default/index.html?videoId=%s';

  async _real_extract(_url: string): Promise<VideoInfo> {
    return this.url_result('', 'generic');
  }

  protected _processVideoElement(sdcEl: string): VideoInfo {
    const sdc = extract_attributes(sdcEl);
    const videoId = String(sdc['data-video-id'] || '');
    const accountId = sdc['data-account-id'] || '6058004172001';
    const playerId = sdc['data-player-id'] || 'RC9PQUaJ6';
    const videoUrl = `http://players.brightcove.net/${accountId}/${playerId}_default/index.html?videoId=${videoId}`;
    return {
      _type: 'url_transparent',
      id: videoId,
      url: videoUrl,
      ie_key: 'BrightcoveNew',
    };
  }
}

export class SkySportsIE extends SkyBaseIE {
  static IE_NAME = 'sky:sports';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?skysports\.com\/watch\/video\/(?:[^/]+\/)*(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const sdcEl = webpage.match(SDC_EL_RE)?.[0];
    if (!sdcEl) throw new Error('No video element');
    const info = this._processVideoElement(sdcEl);
    return {
      ...info,
      title: this._og_search_title(webpage) || undefined,
      description: strip_or_none(this._og_search_description(webpage)) || undefined,
    };
  }
}

export class SkyNewsIE extends SkyBaseIE {
  static IE_NAME = 'sky:news';
  static _VALID_URL = /https?:\/\/news\.sky\.com\/video\/[0-9a-z-]+-(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const sdcEl = webpage.match(SDC_EL_RE)?.[0];
    if (!sdcEl) throw new Error('No video element');
    const info = this._processVideoElement(sdcEl);
    return {
      ...info,
      title: this._og_search_title(webpage) || undefined,
      description: strip_or_none(this._og_search_description(webpage)) || undefined,
    };
  }
}

export class SkyNewsStoryIE extends SkyBaseIE {
  static IE_NAME = 'sky:news:story';
  static _VALID_URL = /https?:\/\/news\.sky\.com\/story\/[0-9a-z-]+-(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    const webpage = await this._download_webpage(url, articleId);
    const entries = [...webpage.matchAll(SDC_EL_RE)].map((m) => this._processVideoElement(m[0]!));
    return this.playlist_result(
      entries,
      articleId,
      this._og_search_title(webpage) || undefined,
      this._html_search_meta(['og:description', 'description'], webpage, 'description', false) || undefined,
    );
  }
}

export class SkySportsNewsIE extends SkyBaseIE {
  static IE_NAME = 'sky:sports:news';
  static _VALID_URL = /https?:\/\/(?:www\.)?skysports\.com\/(?:[^/]+\/)*news\/\d+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    const webpage = await this._download_webpage(url, articleId);
    const entries = [...webpage.matchAll(SDC_EL_RE)].map((m) => this._processVideoElement(m[0]!));
    return this.playlist_result(
      entries,
      articleId,
      this._og_search_title(webpage) || undefined,
      this._html_search_meta(['og:description', 'description'], webpage, 'description', false) || undefined,
    );
  }
}
