/**
 * KickStarterIE — ported from yt-dlp kickstarter.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { smuggle_url } from '../../utils';

export class KickStarterIE extends InfoExtractor {
  static IE_NAME = 'kickstarter';
  static _VALID_URL = /https?:\/\/(?:www\.)?kickstarter\.com\/projects\/(?<id>[^/]*)\/.*/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const title =
      this._html_search_regex(
        /<title>\s*(.*?)(?:\s*&mdash;\s*Kickstarter)?\s*<\/title>/,
        webpage,
        'title',
      ) ?? videoId;

    const videoUrl = this._search_regex(/data-video-url="(.*?)"/, webpage, 'video URL', null, false);
    if (!videoUrl) {
      return {
        _type: 'url_transparent',
        ie_key: 'Generic',
        url: smuggle_url(url, { to_generic: true }),
        id: videoId,
        title,
      };
    }

    let thumbnail = this._og_search_thumbnail(webpage) ?? undefined;
    if (!thumbnail) {
      thumbnail =
        this._html_search_regex(
          /<img[^>]+class="[^"]+\s*poster\s*[^"]+"[^>]+src="([^"]+)"/,
          webpage,
          'thumbnail image',
          null,
          false,
        ) ?? undefined;
    }

    return {
      id: videoId,
      url: videoUrl,
      title,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail,
    };
  }
}
