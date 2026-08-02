/** TeachingChannelIE — ported from yt-dlp teachingchannel.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class TeachingChannelIE extends InfoExtractor {
  static IE_NAME = 'teachingchannel';
  static _VALID_URL = /https?:\/\/(?:www\.)?teachingchannel\.org\/videos?\/(?<id>[^/?&#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const mid = this._search_regex(
      /(?:data-mid=["']|id=["']jw-video-player-)([a-zA-Z0-9]{8})/,
      webpage,
      'media id',
    );
    return this.url_result(`jwplatform:${mid}`, 'JWPlatform', mid);
  }
}
