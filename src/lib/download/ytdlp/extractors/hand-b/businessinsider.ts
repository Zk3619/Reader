/**
 * BusinessInsiderIE — aligned with yt-dlp businessinsider.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class BusinessInsiderIE extends InfoExtractor {
  static IE_NAME = 'businessinsider';
  static _VALID_URL = /https?:\/\/(?:[^/]+\.)?businessinsider\.(?:com|nl)\/(?:[^/]+\/)*(?<id>[^/?#&]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const jwplatformId = this._search_regex(
      [
        /data-media-id=["']([a-zA-Z0-9]{8})/,
        /id=["']jwplayer_([a-zA-Z0-9]{8})/,
        /id["']?\s*:\s*["']?([a-zA-Z0-9]{8})/,
        /(?:jwplatform\.com\/players\/|jwplayer_)([a-zA-Z0-9]{8})/,
      ],
      webpage,
      'jwplatform id',
    )!;
    return this.url_result(`jwplatform:${jwplatformId}`, 'JWPlatform', videoId);
  }
}
