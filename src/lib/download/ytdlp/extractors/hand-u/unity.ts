// @ts-nocheck
/** UnityIE â€?ported from yt-dlp unity.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class UnityIE extends InfoExtractor {
  static IE_NAME = 'unity';
  static _WORKING = false;
  static _VALID_URL =
    /https?:\/\/(?:www\.)?unity3d\.com\/learn\/tutorials\/(?:[^/]+\/)*(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const youtubeId = this._search_regex(
      /data-video-id="([_0-9a-zA-Z-]+)"/,
      webpage,
      'youtube ID',
    )!;
    return this.url_result(youtubeId, 'Youtube', videoId);
  }
}
