/** OnePlacePodcastIE — ported from yt-dlp oneplace.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class OnePlacePodcastIE extends InfoExtractor {
  static IE_NAME = 'oneplace';
  static _VALID_URL =
    /https?:\/\/www\.oneplace\.com\/[\w]+\/[^/]+\/listen\/[\w-]+-(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const mediaUrl = this._search_regex(
      [
        /mp3-url\s*=\s*"([^"]+)"/,
        /<div[^>]+id\s*=\s*"player"[^>]+data-media-url\s*=\s*"(?<media_url>[^"]+)"/,
      ],
      webpage,
      'media url',
    );

    const title =
      this._html_search_regex(
        [
          /<div[^>]class\s*=\s*"details"[^>]+>[^<]<h2[^>]+>(?<content>[^>]+)>/,
          /property=["']og:title["'][^>]+content=["'](?<content>[^"']+)["']/i,
          /<meta[^>]+name=["']title["'][^>]+content=["'](?<content>[^"']+)["']/i,
        ],
        webpage,
        'title',
        undefined,
        false,
        'content',
      ) || undefined;

    const description =
      this._html_search_regex(
        /<div[^>]+class="[^"]+epDesc"[^>]*>\s*(?<desc>[\s\S]+?)\s*<\/div>/,
        webpage,
        'description',
        undefined,
        false,
        'desc',
      ) || undefined;

    return {
      id: videoId,
      url: mediaUrl!,
      ext: 'mp3',
      vcodec: 'none',
      title,
      description,
    };
  }
}
