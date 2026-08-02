/**
 * MotorsportIE — ported from yt-dlp motorsport.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { urljoin } from './_helpers';

export class MotorsportIE extends InfoExtractor {
  static IE_NAME = 'motorsport';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?motorsport\.com\/[^/?#]+\/video\/(?:[^/?#]+\/)(?<id>[^/]+)\/?(?:$|[?#])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    let iframePath = this._html_search_regex(
      /<iframe id="player_iframe"[^>]+src="([^"]+)"/,
      webpage,
      'iframe path',
      null,
      false,
    );

    if (!iframePath) {
      iframePath = this._html_search_regex(
        /<iframe [^>]*\bsrc="(https:\/\/motorsport\.tv\/embed\/[^"]+)"/,
        webpage,
        'embed iframe path',
      );
      return this.url_result(iframePath!);
    }

    const iframe = await this._download_webpage(urljoin(url, iframePath), displayId, 'Downloading iframe');
    const youtubeId = this._search_regex(/www\.youtube\.com\/embed\/(.{11})/, iframe, 'youtube id')!;

    return {
      _type: 'url_transparent',
      display_id: displayId,
      id: youtubeId,
      title: displayId,
      url: `https://youtube.com/watch?v=${youtubeId}`,
      ie_key: 'Youtube',
    };
  }
}
