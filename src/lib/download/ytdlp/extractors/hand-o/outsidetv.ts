/** OutsideTVIE — ported from yt-dlp outsidetv.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class OutsideTVIE extends InfoExtractor {
  static IE_NAME = 'outsidetv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?outsidetv\.com\/(?:[^/]+\/)*?play\/[a-zA-Z0-9]{8}\/\d+\/\d+\/(?<id>[a-zA-Z0-9]{8})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const jwMediaId = this._match_id(url);
    return this.url_result(`jwplatform:${jwMediaId}`, 'JWPlatform', jwMediaId);
  }
}
