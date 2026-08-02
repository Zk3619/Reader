/**
 * BundesligaIE — aligned with yt-dlp bundesliga.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class BundesligaIE extends InfoExtractor {
  static IE_NAME = 'bundesliga';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?bundesliga\.com\/[a-z]{2}\/bundesliga\/videos(?:\/[^?]+)?\?vid=(?<id>[a-zA-Z0-9]{8})/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    return this.url_result(`jwplatform:${videoId}`, 'JWPlatform', videoId);
  }
}
