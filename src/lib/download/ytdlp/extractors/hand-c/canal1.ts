/**
 * Canal1IE — ported from yt-dlp canal1.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class Canal1IE extends InfoExtractor {
  static IE_NAME = 'canal1';
  static _VALID_URL = /https?:\/\/(?:www\.|noticias\.)?canal1\.com\.co\/(?:[^?#&])+\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const embedUrl = this._search_regex(/"embedUrl"\s*:\s*"([^"]+)/, webpage, 'embed url')!;
    return this.url_result(embedUrl, undefined, displayId);
  }
}
