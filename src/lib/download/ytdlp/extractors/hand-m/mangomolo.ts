/** MangomoloBaseIE / MangomoloVideoIE / MangomoloLiveIE — ported from yt-dlp mangomolo.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { hiddenInputs } from './_helpers';

export class MangomoloBaseIE extends InfoExtractor {
  static IE_NAME = 'mangomolobase';
  static _BASE_REGEX =
    /(?:https?:)?\/\/(?:admin\.mangomolo\.com\/analytics\/index\.php\/customers\/embed\/|player\.mangomolo\.com\/v1\/)/;
  static _SLUG = '';
  static _TYPE = '';
  static _IS_LIVE = false;
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('MangomoloBaseIE is not a standalone extractor', { expected: true });
  }

  protected _getRealId(pageId: string): string {
    return pageId;
  }

  protected async _extractFromUrl(url: string, pageId: string): Promise<VideoInfo> {
    const query = url.split('?')[1] || '';
    const webpage = await this._download_webpage(
      `https://player.mangomolo.com/v1/${(this.constructor as typeof MangomoloBaseIE)._TYPE}?${query}`,
      pageId,
    );
    const hidden = hiddenInputs(webpage);
    const m3u8EntryProtocol = (this.constructor as typeof MangomoloBaseIE)._IS_LIVE ? 'm3u8' : 'm3u8_native';
    const formatUrl = this._html_search_regex(
      /(?:file|src)\s*:\s*"(https?:\/\/[^"]+?\/playlist\.m3u8)/,
      webpage,
      'format url',
    )!;
    const formats = await this._extract_m3u8_formats(
      formatUrl,
      pageId,
      'mp4',
      m3u8EntryProtocol,
      undefined,
      undefined,
      'hls',
      undefined,
      false,
    );

    return {
      id: pageId,
      title: pageId,
      uploader_id: hidden.userid || undefined,
      duration: int_or_none(hidden.duration) ?? undefined,
      is_live: (this.constructor as typeof MangomoloBaseIE)._IS_LIVE,
      formats,
    };
  }
}

export class MangomoloVideoIE extends MangomoloBaseIE {
  static IE_NAME = 'mangomolo:video';
  static _TYPE = 'video';
  static _SLUG = String.raw`video\?.*?\bid=(?<id>\d+)`;
  static _VALID_URL =
    /(?:https?:)?\/\/(?:admin\.mangomolo\.com\/analytics\/index\.php\/customers\/embed\/|player\.mangomolo\.com\/v1\/)video\?.*?\bid=(?<id>\d+)/;
  static _IS_LIVE = false;

  async _real_extract(url: string): Promise<VideoInfo> {
    const pageId = this._match_id(url);
    return this._extractFromUrl(url, pageId);
  }
}

export class MangomoloLiveIE extends MangomoloBaseIE {
  static IE_NAME = 'mangomolo:live';
  static _TYPE = 'live';
  static _SLUG = String.raw`(?:live|index)\?.*?\bchannelid=(?<id>(?:[A-Za-z0-9+/=]|%2B|%2F|%3D)+)`;
  static _VALID_URL =
    /(?:https?:)?\/\/(?:admin\.mangomolo\.com\/analytics\/index\.php\/customers\/embed\/|player\.mangomolo\.com\/v1\/)(?:live|index)\?.*?\bchannelid=(?<id>(?:[A-Za-z0-9+/=]|%2B|%2F|%3D)+)/;
  static _IS_LIVE = true;

  protected _getRealId(pageId: string): string {
    return decodeURIComponent(
      atob(decodeURIComponent(pageId)),
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const pageId = this._getRealId(this._match_id(url));
    return this._extractFromUrl(url, pageId);
  }
}
