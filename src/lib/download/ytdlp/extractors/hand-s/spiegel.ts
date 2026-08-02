/** SpiegelIE — ported from yt-dlp spiegel.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

const UUID_RE = '[\\da-f]{8}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{12}';

export class SpiegelIE extends InfoExtractor {
  static IE_NAME = 'spiegel';
  static _VALID_URL = new RegExp(
    `https?:\\/\\/(?:www\\.)?(?:spiegel|manager-magazin)\\.de(?:\\/[^/]+)+\\/[^/]*-(?<id>[0-9]+|${UUID_RE})(?:-embed|-iframe)?(?:\\.html)?(?:$|[#?])`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const mediaId = this._html_search_regex(
      /(&#34;|["'])mediaId\1\s*:\s*(&#34;|["'])(?<id>(?:(?!\2).)+)\2/,
      webpage,
      'media id',
      null,
      false,
      'id',
    )!;
    return {
      ...this.url_result(`jwplatform:${mediaId}`, 'JWPlatform', videoId),
      display_id: videoId,
      title: this._og_search_title(webpage) || undefined,
    };
  }
}
