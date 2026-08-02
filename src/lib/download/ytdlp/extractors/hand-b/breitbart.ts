/**
 * BreitBartIE — aligned with yt-dlp breitbart.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { rtaSearch } from './_helpers';

export class BreitBartIE extends InfoExtractor {
  static IE_NAME = 'breitbart';
  static _VALID_URL = /https?:\/\/(?:www\.)?breitbart\.com\/videos\/v\/(?<id>[^/?#]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const formats = await this._extract_m3u8_formats(
      `https://cdn.jwplayer.com/manifests/${videoId}.m3u8`,
      videoId,
      'mp4',
    );

    const title =
      this._og_search_title(webpage) || this._html_search_meta('title', webpage) || this._html_search_regex(
        /<title[^>]*>([^<]+)<\/title>/i,
        webpage,
        'title',
        null,
        false,
      ) || videoId;

    return {
      id: videoId,
      title,
      description: this._og_search_description(webpage),
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      age_limit: rtaSearch(webpage) ?? 0,
      formats,
      webpage_url: url,
      original_url: url,
      extractor: 'breitbart',
      extractor_key: 'BreitBart',
    };
  }
}
