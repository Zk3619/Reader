/**
 * LcpPlayIE / LcpIE — ported from yt-dlp lcp.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

const LCP_PLAY_URL =
  /https?:\/\/play\.lcp\.fr\/embed\/(?<id>[^/]+)\/(?<account_id>[^/]+)\/[^/]+\/[^/]+/;

export class LcpPlayIE extends InfoExtractor {
  static IE_NAME = 'lcp:play';
  static _VALID_URL = LCP_PLAY_URL;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('LcpPlayIE is not fully ported (site marked _WORKING=false upstream)', { expected: true });
  }
}

export class LcpIE extends InfoExtractor {
  static IE_NAME = 'lcp';
  static _VALID_URL = /https?:\/\/(?:www\.)?lcp\.fr\/(?:[^/]+\/)*(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const playUrl = this._html_search_regex(
      new RegExp(`<iframe[^>]+src=(["'])(?<url>${LCP_PLAY_URL.source}(?:(?!\\1).)*)\\1`),
      webpage,
      'play iframe',
      null,
      false,
      'url',
    );

    if (!playUrl) {
      return this.url_result(url, 'Generic');
    }

    const title =
      this._og_search_title(webpage, false) ||
      this._html_search_meta('twitter:title', webpage, undefined, true) ||
      displayId;

    return {
      _type: 'url_transparent',
      id: displayId,
      ie_key: 'LcpPlay',
      url: playUrl,
      display_id: displayId,
      title,
      description: this._html_search_meta(['description', 'twitter:description'], webpage) || undefined,
    };
  }
}
