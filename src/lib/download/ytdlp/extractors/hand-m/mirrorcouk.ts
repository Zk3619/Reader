/**
 * MirrorCoUKIE — ported from yt-dlp mirrorcouk.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { unescapeHTML } from '../../utils';

export class MirrorCoUKIE extends InfoExtractor {
  static IE_NAME = 'mirrorcouk';
  static _VALID_URL = /https?:\/\/(?:www\.)?mirror\.co\.uk\/[/+[\w-]+-(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const data = this._search_json<{ videoData: { videoId: string } }>(
      /div\s+class="json-placeholder"\s+data-json="/,
      webpage,
      'data',
      displayId,
      { transform_source: unescapeHTML },
    )!.videoData;

    return {
      _type: 'url_transparent',
      url: `jwplatform:${data.videoId}`,
      ie_key: 'JWPlatform',
      display_id: displayId,
      id: data.videoId,
      title: data.videoId,
    };
  }
}
