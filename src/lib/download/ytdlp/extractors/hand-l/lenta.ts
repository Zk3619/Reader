/**
 * LentaIE — ported from yt-dlp lenta.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class LentaIE extends InfoExtractor {
  static IE_NAME = 'lenta';
  static _VALID_URL = /https?:\/\/(?:www\.)?lenta\.ru\/[^/]+\/\d+\/\d+\/\d+\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const eagleId = this._search_regex(/vid\s*:\s*["']?(\d+)/, webpage, 'eagleplatform id', null, false);
    if (eagleId) {
      return this.url_result(
        `eagleplatform:lentaru.media.eagleplatform.com:${eagleId}`,
        'EaglePlatform',
        eagleId,
      );
    }

    return this.url_result(url, 'Generic');
  }
}
