/** SkylineWebcamsIE — ported from yt-dlp skylinewebcams.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class SkylineWebcamsIE extends InfoExtractor {
  static IE_NAME = 'skylinewebcams';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?skylinewebcams\.com\/[^/]+\/webcam\/(?:[^/]+\/)+(?<id>[^/]+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const streamUrl = this._search_regex(
      /(?:url|source)\s*:\s*(["'])(?<url>(?:https?:)?\/\/.+?\.m3u8.*?)\1/,
      webpage,
      'stream url',
      undefined,
      false,
      'url',
    )!;
    return {
      id: videoId,
      url: streamUrl,
      ext: 'mp4',
      title: this._og_search_title(webpage) || videoId,
      description: this._og_search_description(webpage) || undefined,
      is_live: true,
    };
  }
}
