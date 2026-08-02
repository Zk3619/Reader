/**
 * AtScaleConfEventIE — aligned with yt-dlp atscaleconf.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { playlistFromMatches } from './helpers';

export class AtScaleConfEventIE extends InfoExtractor {
  static IE_NAME = 'atscaleconfevent';
  static _VALID_URL = /https?:\/\/(?:www\.)?atscaleconference\.com\/events\/(?<id>[^/&$?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const urls = [
      ...webpage.matchAll(
        /data-url\s*=\s*"(https?:\/\/(?:www\.)?atscaleconference\.com\/videos\/[^"]+)"/g,
      ),
    ].map((m) => m[1]!);

    return playlistFromMatches(this, urls, playlistId, {
      title: this._og_search_title(webpage),
      description: this._og_search_description(webpage),
      ie: 'Generic',
    });
  }
}
